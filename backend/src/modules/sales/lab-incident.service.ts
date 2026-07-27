import { ItemStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';
import { getUrunStokTumSubeler } from '../admin/stok-yonetimi.service';
import { olusturTransfer } from '../admin/transfer-olustur.service';
import { createOzelSiparis } from '../ozel-siparis/ozel-siparis.service';
import { buildOzelSiparisReceteFields } from '../ozel-siparis/ozel-siparis-recete.util';
import type { JwtPayload } from '../auth/auth.types';
import { assertAtolyePanelAccess } from './sale.service';

export const LAB_INCIDENT_TYPES = ['LENS_BROKEN', 'FRAME_BROKEN', 'MEASUREMENT_SHIFT'] as const;
export type LabIncidentType = (typeof LAB_INCIDENT_TYPES)[number];

function codeError(code: string, message: string) {
  const err = new Error(code) as Error & { code: string; message: string };
  err.code = code;
  err.message = message;
  return err;
}

export type LabStokLokasyon = {
  kod: string;
  lokasyonId: number;
  miktar: number;
  kullanilabilir: number;
};

export function filterOtherBranchStock(
  lokasyonlar: Array<{ kod: string; miktar: number; reserved?: number; kullanilabilir?: number }>,
  excludeBranchCode: string | null | undefined,
): LabStokLokasyon[] {
  return lokasyonlar
    .map((l) => ({
      kod: l.kod,
      lokasyonId: LOKASYON_ID_MAP[l.kod] ?? 0,
      miktar: l.miktar,
      kullanilabilir: l.kullanilabilir ?? Math.max(0, l.miktar - (l.reserved ?? 0)),
    }))
    .filter((l) => l.kullanilabilir > 0 && l.lokasyonId > 0 && l.kod !== excludeBranchCode);
}

async function loadSaleItemForIncident(saleItemId: string) {
  const item = await prisma.saleItem.findUnique({
    where: { id: saleItemId },
    include: {
      prescription: true,
      product: { select: { name: true } },
      sale: {
        include: {
          customer: true,
          user: { select: { name: true } },
        },
      },
    },
  });
  if (!item) throw codeError('SALE_ITEM_NOT_FOUND', 'Kalem bulunamadı.');
  if (!item.atolyeBranchId) {
    throw codeError('NOT_IN_ATOLYE', 'Kalem atölye kuyruğunda değil.');
  }
  if (item.status !== ItemStatus.IN_LAB) {
    throw codeError('INVALID_ITEM_STATUS', 'Sorun bildirimi yalnızca laboratuvardaki kalemler için yapılabilir.');
  }
  return item;
}

async function buildOzelSiparisPayload(
  item: Awaited<ReturnType<typeof loadSaleItemForIncident>>,
  atolyeBranch: { code: string; name: string },
  reporterName: string | null,
  note?: string,
) {
  const customer = item.sale.customer;
  const latestRx = customer
    ? await prisma.customerPrescription.findFirst({
        where: { customerId: customer.id },
        orderBy: { date: 'desc' },
      })
    : null;

  const receteFields = buildOzelSiparisReceteFields({
    saleItemPrescription: item.prescription as Record<string, unknown> | null,
    customerPrescription: latestRx as Record<string, unknown> | null,
    customer: customer as Record<string, unknown> | null,
  });

  const urunAdi = item.odooProductName || item.product?.name || 'Ürün';
  const olcum = item.lensOrderMeasurement ? [item.lensOrderMeasurement] : undefined;

  return {
    musteriAdi: customer?.name ?? 'Müşteri',
    musteriTelefon: customer?.phone ?? '',
    musteriId: customer?.id,
    satisSiparisId: item.saleId,
    saleItemId: item.id,
    subeId: atolyeBranch.code,
    subeAdi: atolyeBranch.name,
    tip: 'RECETELI',
    urunAdi,
    miktar: item.qty || 1,
    notlar: note ? `Atölye — cam kırıldı: ${note}` : 'Atölye — cam kırıldı',
    olusturanKullanici: reporterName ?? undefined,
    satisTemsilcisi: item.sale.user?.name ?? reporterName ?? undefined,
    olcumBilgisi: olcum,
    ...receteFields,
  };
}

export async function reportLabIncident(
  user: JwtPayload,
  input: { saleItemId: string; incidentType: LabIncidentType; note?: string },
) {
  if (!LAB_INCIDENT_TYPES.includes(input.incidentType)) {
    throw codeError('VALIDATION_ERROR', 'Geçersiz incidentType.');
  }

  const item = await loadSaleItemForIncident(input.saleItemId);
  assertAtolyePanelAccess(user, item.atolyeBranchId!);

  const reporter = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { name: true },
  });

  if (input.incidentType === 'FRAME_BROKEN' || input.incidentType === 'MEASUREMENT_SHIFT') {
    const incident = await prisma.labIncident.create({
      data: {
        saleItemId: item.id,
        atolyeBranchId: item.atolyeBranchId!,
        reportedByUserId: user.userId,
        incidentType: input.incidentType,
        note: input.note?.trim() || null,
        resolutionType: 'NONE',
      },
    });
    return {
      success: true,
      incidentId: incident.id,
      resolutionType: 'NONE' as const,
      message: 'Kaydedildi.',
    };
  }

  const odooProductId = item.odooProductId ? Number(item.odooProductId) : NaN;
  if (!Number.isFinite(odooProductId) || odooProductId <= 0) {
    throw codeError('PRODUCT_ID_MISSING', 'Kalemde Odoo ürün ID bulunamadı.');
  }

  const atolyeBranch = await prisma.branch.findUnique({
    where: { id: item.atolyeBranchId! },
    select: { code: true, name: true },
  });
  if (!atolyeBranch) throw codeError('ATOLYE_BRANCH_INVALID', 'Atölye şubesi bulunamadı.');

  const stok = await getUrunStokTumSubeler(odooProductId);
  const otherLocs = filterOtherBranchStock(stok?.lokasyonlar ?? [], atolyeBranch.code);

  if (otherLocs.length > 0) {
    const incident = await prisma.labIncident.create({
      data: {
        saleItemId: item.id,
        atolyeBranchId: item.atolyeBranchId!,
        reportedByUserId: user.userId,
        incidentType: 'LENS_BROKEN',
        note: input.note?.trim() || null,
        resolutionType: null,
      },
    });
    return {
      success: true,
      incidentId: incident.id,
      stokBulundu: true,
      lokasyonlar: otherLocs,
      urunAdi: stok?.urunAdi ?? item.odooProductName ?? item.product?.name,
    };
  }

  const payload = await buildOzelSiparisPayload(item, atolyeBranch, reporter?.name ?? null, input.note);
  const ozelResult = await createOzelSiparis(payload, user.userId);

  const incident = await prisma.labIncident.create({
    data: {
      saleItemId: item.id,
      atolyeBranchId: item.atolyeBranchId!,
      reportedByUserId: user.userId,
      incidentType: 'LENS_BROKEN',
      note: input.note?.trim() || null,
      resolutionType: 'OZEL_SIPARIS',
      ozelSiparisId: ozelResult.data.id,
    },
  });

  return {
    success: true,
    incidentId: incident.id,
    stokBulundu: false,
    ozelSiparisAcildi: true,
    zatenVar: Boolean(ozelResult.zatenVar),
    ozelSiparisId: ozelResult.data.id,
    message: ozelResult.zatenVar
      ? 'Bu kalem için zaten aktif bir özel sipariş var.'
      : 'Tedarikçiden sipariş açıldı.',
  };
}

export async function confirmLabIncidentTransfer(
  user: JwtPayload,
  incidentId: string,
  kaynakLokasyonId: number,
) {
  const incident = await prisma.labIncident.findUnique({ where: { id: incidentId } });
  if (!incident) throw codeError('LAB_INCIDENT_NOT_FOUND', 'Olay kaydı bulunamadı.');
  if (incident.incidentType !== 'LENS_BROKEN') {
    throw codeError('INVALID_INCIDENT_TYPE', 'Transfer yalnızca cam kırılması için geçerlidir.');
  }
  if (incident.resolutionType) {
    throw codeError('INCIDENT_ALREADY_RESOLVED', 'Bu olay zaten çözümlenmiş.');
  }

  assertAtolyePanelAccess(user, incident.atolyeBranchId);

  const item = await loadSaleItemForIncident(incident.saleItemId);
  const atolyeBranch = await prisma.branch.findUnique({
    where: { id: incident.atolyeBranchId },
    select: { code: true },
  });
  const hedefId = atolyeBranch?.code ? LOKASYON_ID_MAP[atolyeBranch.code] : undefined;
  if (!hedefId) throw codeError('ATOLYE_LOCATION_MISSING', 'Atölye lokasyon ID tanımsız.');

  const odooProductId = item.odooProductId ? Number(item.odooProductId) : 0;
  const urunAdi = item.odooProductName || item.product?.name || 'Ürün';

  const transferResult = await olusturTransfer({
    kalemler: [{
      kaynak: kaynakLokasyonId,
      hedef: hedefId,
      productId: odooProductId,
      miktar: item.qty || 1,
      urunAdi,
    }],
    notlar: incident.note ? `LabIncident:${incident.id} — ${incident.note}` : `LabIncident:${incident.id}`,
    hemenKabul: true,
  });

  if (!transferResult.success && !transferResult.partial) {
    throw codeError('TRANSFER_FAILED', transferResult.message);
  }

  const sirketIci = transferResult.transferler.find(
    (t: unknown) => (t as { tip?: string }).tip === 'sirket-ici',
  ) as { pickingName?: string; pickingId?: number } | undefined;

  const transferRef = sirketIci?.pickingName
    ?? (sirketIci?.pickingId ? String(sirketIci.pickingId) : transferResult.message);

  const updated = await prisma.labIncident.update({
    where: { id: incidentId },
    data: {
      resolutionType: 'TRANSFER',
      transferRef,
    },
  });

  return {
    success: true,
    incident: updated,
    transfer: transferResult,
    message: transferResult.message,
  };
}
