import { ItemStatus, Prisma, PaymentType, Role, SaleStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { getCompanyIdFromLokasyon, resolveBranchStockLocationId } from '../odoo/odooLocations';
import { resolveWarehouseIdForCompany, validateSalePickingsFromBranch } from '../odoo/odoo-delivery.util';
import { ODOO_TAX_CHART_COMPANY_ID, readProductSaleTaxRate, resolvePosLineTax } from '../odoo/odoo-tax.util';
import { getUrunStokTumSubeler } from '../admin/stok-yonetimi.service';
import { addSaleItem, createSale, recalcSaleTotals } from '../sales/sale.service';
import { tetikleSatisEFatura } from '../efatura/uyumsoft-efatura.service';
import { createBildirimler } from '../bildirim/bildirim.service';
import { generateSatisReferansNo } from '../shared/referans-no.util';

// ── Durum sabitleri (EticaretSiparis.durum serbest string alan) ────────────
export const ETICARET_DURUM = {
  YENI: 'YENI',
  SUBE_SECILDI: 'SUBE_SECILDI',
  HAZIRLANIYOR: 'HAZIRLANIYOR',
  KARGOYA_VERILDI: 'KARGOYA_VERILDI',
  STOK_YOK: 'STOK_YOK',
  HATA: 'HATA',
} as const;

type PartnerKalem = { barkod: string; adet: number };

type CozulmusKalem = {
  barkod: string;
  adet: number;
  odooProductId: number;
  odooProductName: string;
  lstPrice: number;
};

type OncelikliSube = {
  id: string;
  code: string;
  name: string;
  odooLocationId: number | null;
};

// ── Partner API'sinden ham veri çekme ──────────────────────────────────────
// NOT: Partner'ın tam response şeması henüz netleşmedi. Aşağıdaki eşleme birden
// çok olası alan adını dener; partner'ın gerçek API şartnamesi gelince yalnızca
// bu dosyadaki `partnerdenSiparisleriGetir` ve `mapRawToInternal` fonksiyonlarını
// güncellemek yeterli olacak — geri kalan iş akışı (şube seçimi, satış, fatura)
// bu adaptörden habersiz çalışır.
async function partnerdenSiparisleriGetir(ayar: {
  partnerApiUrl: string | null;
  partnerApiToken: string | null;
}): Promise<any[]> {
  if (!ayar.partnerApiUrl || !ayar.partnerApiToken) return [];

  const res = await fetch(ayar.partnerApiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${ayar.partnerApiToken}`,
      'x-api-key': ayar.partnerApiToken,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Partner API hatası: ${res.status} ${res.statusText}`);
  }
  const json: any = await res.json();
  const list = Array.isArray(json) ? json : (json?.orders ?? json?.siparisler ?? json?.data ?? []);
  return Array.isArray(list) ? list : [];
}

function mapRawToInternal(raw: any): {
  partnerSiparisNo: string;
  musteriAdSoyad: string;
  musteriTelefon: string | null;
  musteriAdres: string | null;
  musteriIl: string | null;
  musteriIlce: string | null;
  odemeSekli: string | null;
  kalemler: PartnerKalem[];
} {
  const musteri = raw?.musteri ?? raw?.customer ?? {};
  const kalemlerRaw = raw?.kalemler ?? raw?.items ?? raw?.lines ?? [];
  return {
    partnerSiparisNo: String(raw?.siparisNo ?? raw?.orderNo ?? raw?.order_id ?? raw?.id ?? '').trim(),
    musteriAdSoyad: String(musteri?.adSoyad ?? musteri?.name ?? raw?.musteriAdSoyad ?? 'E-Ticaret Müşterisi').trim(),
    musteriTelefon: (musteri?.telefon ?? musteri?.phone ?? raw?.musteriTelefon ?? null) || null,
    musteriAdres: (musteri?.adres ?? musteri?.address ?? raw?.musteriAdres ?? null) || null,
    musteriIl: (musteri?.il ?? musteri?.city ?? raw?.musteriIl ?? null) || null,
    musteriIlce: (musteri?.ilce ?? musteri?.district ?? raw?.musteriIlce ?? null) || null,
    odemeSekli: (raw?.odemeSekli ?? raw?.paymentMethod ?? null) || null,
    kalemler: (Array.isArray(kalemlerRaw) ? kalemlerRaw : [])
      .map((k: any) => ({
        barkod: String(k?.barkod ?? k?.barcode ?? k?.sku ?? '').trim(),
        adet: Math.max(1, Number(k?.adet ?? k?.qty ?? k?.quantity ?? 1) || 1),
      }))
      .filter((k: PartnerKalem) => k.barkod),
  };
}

/** Partner'ın API'sinden yeni siparişleri çekip EticaretSiparis tablosuna yazar, her yeniyi işler. */
export async function partnerSiparisleriCek(): Promise<{ yeni: number; hata?: string }> {
  const ayar = await prisma.eticaretAyar.findFirst();
  if (!ayar || !ayar.aktif || !ayar.partnerApiUrl || !ayar.partnerApiToken) {
    return { yeni: 0 };
  }

  let rawList: any[] = [];
  try {
    rawList = await partnerdenSiparisleriGetir(ayar);
  } catch (err) {
    console.error('[E-Ticaret] Partner sipariş çekme hatası:', err);
    return { yeni: 0, hata: err instanceof Error ? err.message : String(err) };
  }

  let yeni = 0;
  for (const raw of rawList) {
    const mapped = mapRawToInternal(raw);
    if (!mapped.partnerSiparisNo || !mapped.kalemler.length) continue;

    const existing = await prisma.eticaretSiparis.findUnique({
      where: { partnerSiparisNo: mapped.partnerSiparisNo },
    });
    if (existing) continue;

    const created = await prisma.eticaretSiparis.create({
      data: {
        partnerSiparisNo: mapped.partnerSiparisNo,
        musteriAdSoyad: mapped.musteriAdSoyad,
        musteriTelefon: mapped.musteriTelefon,
        musteriAdres: mapped.musteriAdres,
        musteriIl: mapped.musteriIl,
        musteriIlce: mapped.musteriIlce,
        odemeSekli: mapped.odemeSekli,
        kalemler: mapped.kalemler as unknown as Prisma.InputJsonValue,
        durum: ETICARET_DURUM.YENI,
      },
    });
    yeni++;

    subeSecVeIsle(created.id).catch((err) => {
      console.error(`[E-Ticaret] Sipariş işleme hatası (${created.id}):`, err);
    });
  }

  return { yeni };
}

// Bize göre durum → partner'a bildirilecek durum kodu. Partner henüz kendi API'sini
// yazmadı; bu anahtarlar ("hazirlaniyor", "kargoya_verildi", ...) ilk konuşmada
// paylaşılan taslak — partner'ın gerçek sözleşmesi netleşince yalnızca bu map'i
// güncellemek yeterli.
const PARTNER_DURUM_MAP: Record<string, string> = {
  [ETICARET_DURUM.HAZIRLANIYOR]: 'hazirlaniyor',
  [ETICARET_DURUM.KARGOYA_VERILDI]: 'kargoya_verildi',
  [ETICARET_DURUM.STOK_YOK]: 'stok_yok',
  [ETICARET_DURUM.HATA]: 'hata',
};

/** partnerDurumBildirildi=false olan siparişlerin güncel durumunu partner'ın API'sine bildirir. */
export async function partnerlereDurumBildir(): Promise<{ bildirildi: number; hata?: string }> {
  const ayar = await prisma.eticaretAyar.findFirst();
  if (!ayar || !ayar.aktif || !ayar.partnerDurumGuncelleUrl || !ayar.partnerApiToken) {
    return { bildirildi: 0 };
  }

  const bekleyenler = await prisma.eticaretSiparis.findMany({
    where: {
      partnerDurumBildirildi: false,
      durum: { in: Object.keys(PARTNER_DURUM_MAP) },
    },
    take: 50,
    orderBy: { updatedAt: 'asc' },
  });

  let bildirildi = 0;
  for (const s of bekleyenler) {
    const partnerDurum = PARTNER_DURUM_MAP[s.durum];
    if (!partnerDurum) continue;
    try {
      const res = await fetch(ayar.partnerDurumGuncelleUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ayar.partnerApiToken}`,
          'x-api-key': ayar.partnerApiToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siparisNo: s.partnerSiparisNo,
          durum: partnerDurum,
          kargoTakipNo: s.kargoTakipNo ?? undefined,
        }),
      });
      if (!res.ok) {
        throw new Error(`Partner durum API hatası: ${res.status} ${res.statusText}`);
      }
      await prisma.eticaretSiparis.update({
        where: { id: s.id },
        data: { partnerDurumBildirildi: true },
      });
      bildirildi++;
    } catch (err) {
      console.error(`[E-Ticaret] Partner durum bildirimi hatası (${s.partnerSiparisNo}):`, err);
    }
  }

  return { bildirildi };
}

async function findOdooProductByBarcode(barkod: string): Promise<{ id: number; name: string; lstPrice: number } | null> {
  if (!barkod) return null;
  const rows = await execute(
    'product.product',
    'search_read',
    [[['barcode', '=', barkod], ['active', '=', true]]],
    {
      fields: ['id', 'display_name', 'name', 'lst_price'],
      limit: 1,
      context: { allowed_company_ids: [...ODOO_ALL_COMPANY_IDS] },
    },
  );
  const row = rows?.[0];
  if (!row) return null;
  return { id: row.id, name: row.display_name ?? row.name ?? barkod, lstPrice: Number(row.lst_price) || 0 };
}

async function bildirEticaretYetkili(mesaj: string): Promise<void> {
  try {
    const ayar = await prisma.eticaretAyar.findFirst();
    const hedefUserIds: string[] = [];
    if (ayar?.eticaretTemsilciUserId) hedefUserIds.push(ayar.eticaretTemsilciUserId);
    if (!hedefUserIds.length) {
      const adminler = await prisma.user.findMany({
        where: { role: Role.ADMIN, isActive: true },
        select: { id: true },
      });
      hedefUserIds.push(...adminler.map((a) => a.id));
    }
    await createBildirimler(hedefUserIds, {
      baslik: 'E-Ticaret Sipariş Uyarısı',
      mesaj,
      tip: 'SIPARIS',
    });
  } catch (err) {
    console.error('[E-Ticaret] Bildirim gönderilemedi:', err);
  }
}

/** Yeni bir siparişi barkod→ürün çözümlemesi, şube önceliği/stok kontrolü ve satışa çevirme adımlarından geçirir. */
export async function subeSecVeIsle(siparisId: string): Promise<void> {
  const siparis = await prisma.eticaretSiparis.findUnique({ where: { id: siparisId } });
  if (!siparis || siparis.durum !== ETICARET_DURUM.YENI) return;

  const kalemler = ((siparis.kalemler as unknown as PartnerKalem[]) ?? []).filter((k) => k?.barkod);
  if (!kalemler.length) {
    await prisma.eticaretSiparis.update({
      where: { id: siparisId },
      data: { durum: ETICARET_DURUM.HATA, hataNotu: 'Sipariş kalemi bulunamadı.' },
    });
    return;
  }

  const cozulmus: CozulmusKalem[] = [];
  for (const k of kalemler) {
    const urun = await findOdooProductByBarcode(k.barkod);
    if (!urun) {
      await prisma.eticaretSiparis.update({
        where: { id: siparisId },
        data: { durum: ETICARET_DURUM.HATA, hataNotu: `Ürün bulunamadı (barkod: ${k.barkod})` },
      });
      await bildirEticaretYetkili(
        `E-Ticaret sipariş ${siparis.partnerSiparisNo}: barkod ${k.barkod} Odoo'da bulunamadı. Elle kontrol edin.`,
      );
      return;
    }
    cozulmus.push({ barkod: k.barkod, adet: k.adet, odooProductId: urun.id, odooProductName: urun.name, lstPrice: urun.lstPrice });
  }

  const subeler = await prisma.branch.findMany({
    where: { isActive: true, eticaretOncelikSirasi: { not: null } },
    orderBy: { eticaretOncelikSirasi: 'asc' },
    select: { id: true, code: true, name: true, odooLocationId: true },
  });

  if (!subeler.length) {
    await prisma.eticaretSiparis.update({
      where: { id: siparisId },
      data: { durum: ETICARET_DURUM.HATA, hataNotu: 'Öncelik sıralamasında hiç şube tanımlı değil.' },
    });
    await bildirEticaretYetkili(
      `E-Ticaret sipariş ${siparis.partnerSiparisNo}: öncelik sıralamasında şube yok. Tanımlamalar > E-Ticaret'ten sıralama yapın.`,
    );
    return;
  }

  const stokHaritalari = await Promise.all(cozulmus.map((k) => getUrunStokTumSubeler(k.odooProductId)));

  let secilenSube: OncelikliSube | null = null;
  for (const sube of subeler) {
    const yeterli = cozulmus.every((k, idx) => {
      const harita = stokHaritalari[idx];
      const lok = harita?.lokasyonlar.find((l) => l.kod === sube.code);
      return (lok?.kullanilabilir ?? 0) >= k.adet;
    });
    if (yeterli) {
      secilenSube = sube;
      break;
    }
  }

  if (!secilenSube) {
    await prisma.eticaretSiparis.update({
      where: { id: siparisId },
      data: { durum: ETICARET_DURUM.STOK_YOK, hataNotu: 'Hiçbir şubede yeterli stok bulunamadı.' },
    });
    await bildirEticaretYetkili(
      `E-Ticaret sipariş ${siparis.partnerSiparisNo}: hiçbir şubede yeterli stok yok. Müşteriye bilgi verilmesi gerekiyor.`,
    );
    return;
  }

  await prisma.eticaretSiparis.update({
    where: { id: siparisId },
    data: { durum: ETICARET_DURUM.SUBE_SECILDI, secilenSubeId: secilenSube.id },
  });

  try {
    await siparisiSatisaCevir(siparisId, secilenSube, cozulmus);
  } catch (err) {
    console.error(`[E-Ticaret] Satışa çevirme hatası (${siparisId}):`, err);
    await prisma.eticaretSiparis.update({
      where: { id: siparisId },
      data: {
        durum: ETICARET_DURUM.HATA,
        hataNotu: `Satış oluşturma hatası: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
    await bildirEticaretYetkili(
      `E-Ticaret sipariş ${siparis.partnerSiparisNo}: satışa çevirirken hata oluştu — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function getOrCreateEticaretShift(branchId: string, userId: string) {
  const existing = await prisma.shift.findFirst({
    where: { branchId, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
  if (existing) return existing;
  return prisma.shift.create({
    data: {
      branchId,
      userId,
      openCash: new Prisma.Decimal(0),
      status: 'OPEN',
    },
  });
}

async function siparisiSatisaCevir(
  siparisId: string,
  sube: OncelikliSube,
  kalemler: CozulmusKalem[],
): Promise<void> {
  const siparis = await prisma.eticaretSiparis.findUniqueOrThrow({ where: { id: siparisId } });
  const ayar = await prisma.eticaretAyar.findFirst();
  if (!ayar?.eticaretSubeId) throw new Error('E-Ticaret şubesi tanımlı değil (Tanımlamalar > E-Ticaret).');
  if (!ayar.eticaretTemsilciUserId) throw new Error('E-Ticaret satış temsilcisi tanımlı değil (Tanımlamalar > E-Ticaret).');

  const eticaretBranchId = ayar.eticaretSubeId;
  const temsilciUserId = ayar.eticaretTemsilciUserId;

  const telefon = siparis.musteriTelefon?.trim() || `ETIC-${siparis.partnerSiparisNo}`;
  let customer = await prisma.customer.findFirst({ where: { phone: telefon } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: siparis.musteriAdSoyad || 'E-Ticaret Müşterisi',
        phone: telefon,
        adres: siparis.musteriAdres,
        il: siparis.musteriIl,
        ilce: siparis.musteriIlce,
      },
    });
  }

  const shift = await getOrCreateEticaretShift(eticaretBranchId, temsilciUserId);
  const sale = await createSale(temsilciUserId, eticaretBranchId, { customerId: customer.id, shiftId: shift.id });

  for (const k of kalemler) {
    await addSaleItem(sale.id, {
      productId: `odoo_${k.odooProductId}`,
      odooProductId: String(k.odooProductId),
      odooProductName: k.odooProductName,
      qty: k.adet,
      unitPrice: k.lstPrice.toFixed(2),
      discount: '0',
    });
  }

  await confirmEticaretSale({ saleId: sale.id, fulfillingBranch: sube });

  await prisma.eticaretSiparis.update({
    where: { id: siparisId },
    data: { durum: ETICARET_DURUM.HAZIRLANIYOR, saleId: sale.id },
  });

  const yoneticiler = await prisma.user.findMany({
    where: { branchId: sube.id, role: Role.STORE_MANAGER, isActive: true },
    select: { id: true },
  });
  if (yoneticiler.length) {
    await createBildirimler(
      yoneticiler.map((u) => u.id),
      {
        baslik: 'Yeni E-Ticaret Siparişi',
        mesaj: `${siparis.musteriAdSoyad} adına yeni bir e-ticaret siparişi şubenize (${sube.name}) düştü. Kargoya hazırlayın.`,
        tip: 'SIPARIS',
        link: '/eticaret',
      },
    );
  }
}

/**
 * E-ticaret satışını onaylar: ETİCARET ödeme kaydı + Odoo sipariş/stok hareketi
 * KARŞILAYAN ŞUBENİN kendi şirketi/lokasyonu üzerinden yapılır (Sale.branchId ise
 * her zaman sanal E-Ticaret şubesidir — fatura/rapor izolasyonu bunun üzerinden sağlanır).
 * Uyumsoft e-fatura, Sale.branchId'nin (E-Ticaret şubesinin) Uyumsoft ayarları
 * NG şirketine göre yapılandırıldığı için otomatik olarak NG'den kesilir.
 */
async function confirmEticaretSale(opts: {
  saleId: string;
  fulfillingBranch: OncelikliSube;
}): Promise<void> {
  const { saleId, fulfillingBranch } = opts;

  await recalcSaleTotals(prisma, saleId);
  const sale = await prisma.sale.findUniqueOrThrow({ where: { id: saleId } });

  await prisma.$transaction(async (tx) => {
    const claim = await tx.sale.updateMany({
      where: { id: saleId, status: SaleStatus.DRAFT },
      data: { status: SaleStatus.PAID },
    });
    if (claim.count === 0) throw new Error('Satış zaten işlenmiş.');
    await tx.payment.create({
      data: {
        saleId,
        paymentType: PaymentType.ETICARET,
        grossAmount: sale.netTotal,
        netAmount: sale.netTotal,
      },
    });
  });

  if (!sale.referansNo) {
    const referansNo = await generateSatisReferansNo(fulfillingBranch.code);
    await prisma.sale.update({ where: { id: saleId }, data: { referansNo } });
  }

  try {
    const customer = sale.customerId ? await prisma.customer.findUnique({ where: { id: sale.customerId } }) : null;
    let odooPartnerId = customer?.odooPartnerId ?? null;
    if (!odooPartnerId && customer) {
      odooPartnerId = await execute('res.partner', 'create', [
        { name: customer.name, phone: customer.phone ?? '', customer_rank: 1 },
      ]);
      await prisma.customer.update({ where: { id: customer.id }, data: { odooPartnerId } });
    }

    const saleItems = await prisma.saleItem.findMany({
      where: { saleId, status: { not: ItemStatus.VOID } },
      include: { product: true },
    });

    const odooCompanyId = getCompanyIdFromLokasyon(fulfillingBranch.code) ?? ODOO_TAX_CHART_COMPANY_ID;
    const taxCompanyId = ODOO_TAX_CHART_COMPANY_ID;

    const orderLines: Array<[0, 0, Record<string, unknown>]> = [];
    for (const item of saleItems.filter((it) => it.odooProductId)) {
      const odooProductId = parseInt(item.odooProductId!, 10);
      const taxRate = await readProductSaleTaxRate(odooProductId, taxCompanyId);
      const { taxId: odooTaxId, priceUnit } = await resolvePosLineTax({
        companyId: odooCompanyId,
        taxRate,
        unitPriceInclusive: Number(item.unitPrice),
      });
      orderLines.push([
        0,
        0,
        {
          ...(odooTaxId ? { tax_id: [[6, 0, [odooTaxId]]] } : {}),
          product_id: odooProductId,
          product_uom_qty: item.qty,
          price_unit: priceUnit,
          discount: 0,
          name: item.odooProductName ?? item.product?.name ?? 'E-Ticaret Ürünü',
        },
      ]);
    }

    if (!orderLines.length) throw new Error('Odoo sipariş kalemi oluşturulamadı (ürünler Odoo eşleşmesiz).');

    const warehouseId = await resolveWarehouseIdForCompany(odooCompanyId);
    const odooOrderId = await execute(
      'sale.order',
      'create',
      [
        {
          partner_id: odooPartnerId ?? 1,
          note: `E-Ticaret Sipariş — POS Satış ID: ${saleId}`,
          order_line: orderLines,
          company_id: odooCompanyId,
          ...(warehouseId ? { warehouse_id: warehouseId } : {}),
        },
      ],
      {},
      odooCompanyId,
    );
    await execute('sale.order', 'action_confirm', [[odooOrderId]], {}, odooCompanyId);

    const stockLocationId = fulfillingBranch.odooLocationId ?? resolveBranchStockLocationId(fulfillingBranch.code);
    const pickingResult = await validateSalePickingsFromBranch(odooOrderId, stockLocationId, odooCompanyId);

    // Odoo'nun kendi muhasebe defterleri için fatura oluştur (gerçek e-fatura değil — o Uyumsoft üzerinden ayrıca gider).
    try {
      await execute(
        'sale.advance.payment.inv',
        'create_invoices',
        [
          [
            await execute(
              'sale.advance.payment.inv',
              'create',
              [{ advance_payment_method: 'delivered' }],
              { context: { active_ids: [odooOrderId], active_model: 'sale.order', active_id: odooOrderId } },
              odooCompanyId,
            ),
          ],
        ],
        { context: { active_ids: [odooOrderId], active_model: 'sale.order', active_id: odooOrderId } },
        odooCompanyId,
      ).catch(() => {});
    } catch (invErr) {
      console.error('[E-Ticaret][Odoo] Fatura oluşturma hatası:', invErr);
    }

    await prisma.sale.update({
      where: { id: saleId },
      data: {
        odooSaleOrderId: odooOrderId,
        odooSynced: true,
        odooSyncError: pickingResult.ok ? null : `Stok teslimatı tamamlanamadı: ${pickingResult.errors.join('; ')}`,
      },
    });
  } catch (err) {
    console.error('[E-Ticaret] Odoo satış senkron hatası:', err);
    await prisma.sale.update({ where: { id: saleId }, data: { odooSyncError: String(err) } }).catch(() => {});
  }

  tetikleSatisEFatura(saleId).catch((err) => {
    console.error('[E-Ticaret] e-Fatura tetikleme hatası:', err);
  });
}
