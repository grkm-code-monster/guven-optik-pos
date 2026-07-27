import { buildOdooTaxAccessContext, execute } from '../odoo/odoo.service';
import { enrichKalemlerWithUtsFromLot, assertTrackedKalemlerHaveLot } from '../transfer/transfer-kalem.util';
import { resolveTransferKalemMaliyet } from '../transfer/transfer-maliyet.util';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';
import {
  readProductSaleTaxRate,
  resolvePurchaseTaxId,
  resolveSaleTaxIdExcluded,
} from '../odoo/odoo-tax.util';
import {
  notifyEirsaliyeFailure,
  notifyManualIntervention,
} from '../transfer/transfer-bildirim.util';
import { getSupplierInfo } from '../efatura/uyumsoft-efatura.service';
import {
  type DespatchPartyInfo,
  getUserAliasses,
  isEDespatchUser,
  isEirsaliyeTransferEnabled,
  parseDespatchReceiverAlias,
  resolveIrsaliyeNoForTransfer,
  saveIrsaliyeKayit,
  sendDespatch,
} from '../efatura/uyumsoft-irsaliye.service';

export type SirketlerArasiKalem = {
  productId: number;
  resolvedProductId?: number;
  miktar?: number;
  urunAdi?: string;
  maliyet?: number;
  satisFiyati?: number;
  lotId?: number;
  utsKodu?: string;
  utsFirmaKodu?: string;
};

export type TransferAdimDurumu =
  | 'basarili'
  | 'basarisiz'
  | 'atlandi'
  | 'geri_alindi'
  | 'geri_alinamadi';

export type TransferAdimLog = {
  adim: string;
  label: string;
  durum: TransferAdimDurumu;
  mesaj?: string;
  kayitId?: number;
  kayitTipi?: string;
};

export type SirketlerArasiTransferSonuc = {
  tip: 'sirketler-arasi';
  durum: 'basarili' | 'basarisiz' | 'kismi' | 'bekliyor';
  transferRef: string;
  kabulPickingId?: number;
  kaynakPickingId?: number;
  satisSiparisi: string;
  fatura?: string;
  alimFatura?: string;
  hedefStokGirisi?: string;
  stokHareketi?: string;
  kaynakSirket?: string;
  hedefSirket?: string;
  kaynak?: number;
  hedef?: number;
  kalemSayisi: number;
  adimlar: TransferAdimLog[];
  hata?: string;
  uyarilar?: string[];
  manuelMudahale?: boolean;
  manuelMudahaleMesaji?: string;
  eIrsaliyeGonderildi?: boolean;
  eIrsaliyeNo?: string;
  eIrsaliyeId?: string;
  eIrsaliyeEttn?: string;
  eIrsaliyeHata?: string;
};

type RollbackEntry = {
  adim: string;
  label: string;
  rollback: () => Promise<{ ok: boolean; mesaj?: string }>;
};

type TransferCtx = {
  transferRef: string;
  adimlar: TransferAdimLog[];
  rollbacks: RollbackEntry[];
  uyarilar: string[];
  kayitlar: {
    satisFaturaId?: number;
    satisFaturaName?: string;
    alimFaturaId?: number;
    alimFaturaName?: string;
    hedefPickingId?: number;
    hedefPickingName?: string;
    kaynakPickingId?: number;
    kaynakPickingName?: string;
  };
};

function odooErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'faultString' in err) {
    return String((err as { faultString: unknown }).faultString);
  }
  return String(err);
}

function logTransfer(transferRef: string, msg: string, extra?: unknown) {
  const suffix = extra !== undefined ? ` ${JSON.stringify(extra)}` : '';
  console.log(`[sirketler-arasi-transfer] ref=${transferRef} ${msg}${suffix}`);
}

function logAdim(ctx: TransferCtx, adim: TransferAdimLog) {
  ctx.adimlar.push(adim);
  logTransfer(ctx.transferRef, `${adim.durum.toUpperCase()} ${adim.adim}: ${adim.label}${adim.mesaj ? ` — ${adim.mesaj}` : ''}`, {
    kayitId: adim.kayitId,
    kayitTipi: adim.kayitTipi,
  });
}

async function rollbackInvoice(moveId: number, companyId: number): Promise<{ ok: boolean; mesaj?: string }> {
  try {
    const rows = await execute('account.move', 'read', [[moveId]], { fields: ['id', 'name', 'state'] }, companyId);
    const inv = rows?.[0];
    if (!inv) return { ok: true, mesaj: 'Kayıt bulunamadı (zaten silinmiş olabilir)' };
    if (inv.state === 'cancel') return { ok: true, mesaj: 'Zaten iptal' };

    if (inv.state === 'posted') {
      try {
        await execute('account.move', 'button_draft', [[moveId]], {}, companyId);
      } catch {
        // button_draft izin vermeyebilir
      }
      const afterDraft = await execute('account.move', 'read', [[moveId]], { fields: ['state'] }, companyId);
      if (afterDraft?.[0]?.state !== 'draft') {
        return {
          ok: false,
          mesaj: `Fatura ${inv.name} onaylı (posted) — otomatik geri alınamadı, muhasebe elle düzeltmeli`,
        };
      }
    }

    if (inv.state === 'draft' || (await execute('account.move', 'read', [[moveId]], { fields: ['state'] }, companyId))?.[0]?.state === 'draft') {
      try {
        await execute('account.move', 'button_cancel', [[moveId]], {}, companyId);
      } catch (e) {
        const after = await execute('account.move', 'read', [[moveId]], { fields: ['state'] }, companyId);
        if (after?.[0]?.state === 'cancel') return { ok: true, mesaj: 'İptal edildi' };
        return { ok: false, mesaj: odooErr(e) };
      }
      return { ok: true, mesaj: 'İptal edildi' };
    }

    return { ok: false, mesaj: `Bilinmeyen fatura durumu: ${inv.state}` };
  } catch (e) {
    return { ok: false, mesaj: odooErr(e) };
  }
}

async function rollbackPicking(pickingId: number, companyId: number): Promise<{ ok: boolean; mesaj?: string }> {
  try {
    const rows = await execute('stock.picking', 'read', [[pickingId]], { fields: ['id', 'name', 'state'] }, companyId);
    const picking = rows?.[0];
    if (!picking) return { ok: true, mesaj: 'Kayıt bulunamadı' };
    if (picking.state === 'cancel') return { ok: true, mesaj: 'Zaten iptal' };
    if (picking.state === 'done') {
      return { ok: false, mesaj: `Stok hareketi ${picking.name} tamamlanmış (done) — otomatik geri alınamaz` };
    }
    await execute('stock.picking', 'action_cancel', [[pickingId]], {}, companyId);
    const after = await execute('stock.picking', 'read', [[pickingId]], { fields: ['state'] }, companyId);
    if (after?.[0]?.state === 'cancel') return { ok: true, mesaj: 'İptal edildi' };
    return { ok: false, mesaj: `İptal sonrası durum: ${after?.[0]?.state}` };
  } catch (e) {
    return { ok: false, mesaj: odooErr(e) };
  }
}

async function runRollback(ctx: TransferCtx): Promise<string[]> {
  const manualIssues: string[] = [];
  for (const entry of ctx.rollbacks) {
    try {
      const result = await entry.rollback();
      if (result.ok) {
        logAdim(ctx, {
          adim: entry.adim,
          label: `${entry.label} (geri alma)`,
          durum: 'geri_alindi',
          mesaj: result.mesaj,
        });
      } else {
        logAdim(ctx, {
          adim: entry.adim,
          label: `${entry.label} (geri alma)`,
          durum: 'geri_alinamadi',
          mesaj: result.mesaj,
        });
        manualIssues.push(`${entry.label}: ${result.mesaj ?? 'geri alınamadı'}`);
      }
    } catch (e) {
      const mesaj = odooErr(e);
      logAdim(ctx, {
        adim: entry.adim,
        label: `${entry.label} (geri alma)`,
        durum: 'geri_alinamadi',
        mesaj,
      });
      manualIssues.push(`${entry.label}: ${mesaj}`);
    }
  }
  return manualIssues;
}

const ODOO_COMPANY_TO_SIRKET_AYAR: Record<number, string> = {
  2: 'ng',
  3: 'adese',
  4: 'potential',
};

function lokasyonIdToSubeCode(locId: number): string {
  const entry = Object.entries(LOKASYON_ID_MAP).find(([, id]) => id === locId);
  return entry?.[0] ?? `#${locId}`;
}

function supplierToDespatchParty(s: Awaited<ReturnType<typeof getSupplierInfo>>): DespatchPartyInfo {
  return {
    vkn: s.vkn,
    idScheme: s.idScheme,
    unvan: s.unvan,
    adres: s.adres,
    il: s.il,
    ilce: s.ilce,
    vergiDairesi: s.vergiDairesi,
    telefon: s.telefon,
    email: s.email,
  };
}

async function trySendEirsaliyeForTransfer(
  ctx: TransferCtx,
  input: {
    grup: SirketlerArasiKalem[];
    kaynakId: number;
    hedefId: number;
    kaynakLok?: { id: number; name?: string; company_id?: [number, string] };
    hedefLok?: { id: number; name?: string; company_id?: [number, string] };
    kaynakSirketId: number;
    hedefSirketId: number;
  },
): Promise<{
  eIrsaliyeGonderildi?: boolean;
  eIrsaliyeNo?: string;
  eIrsaliyeId?: string;
  eIrsaliyeEttn?: string;
  eIrsaliyeHata?: string;
}> {
  if (!isEirsaliyeTransferEnabled()) {
    logTransfer(ctx.transferRef, 'e-İrsaliye atlandı (E_IRSALIYE_TRANSFER_ENABLED=false)');
    return { eIrsaliyeGonderildi: false };
  }

  const uyumsoftSirketId = ODOO_COMPANY_TO_SIRKET_AYAR[input.kaynakSirketId] ?? 'ng';
  const kaynakSube = lokasyonIdToSubeCode(input.kaynakId);
  const hedefSube = lokasyonIdToSubeCode(input.hedefId);

  try {
    const gonderenInfo = supplierToDespatchParty(await getSupplierInfo(kaynakSube));
    const aliciInfo = supplierToDespatchParty(await getSupplierInfo(hedefSube));

    const aliciVkn = aliciInfo.vkn.replace(/\D/g, '');
    const eIrsaliyeMukellef = await isEDespatchUser(aliciVkn, undefined, uyumsoftSirketId);
    let aliciAlias: string | undefined;
    if (eIrsaliyeMukellef) {
      const aliasRaw = await getUserAliasses(aliciVkn, uyumsoftSirketId);
      aliciAlias = parseDespatchReceiverAlias(aliasRaw);
    }

    const now = new Date();
    const issueDate = now.toISOString().slice(0, 10);
    const issueTime = now.toTimeString().slice(0, 8);
    const irsaliyeNo = await resolveIrsaliyeNoForTransfer(ctx.transferRef, kaynakSube);

    const kalemler = input.grup.map((k, idx) => ({
      sira: idx + 1,
      urunAdi: k.urunAdi || `Ürün ${k.productId}`,
      urunKodu: String(k.resolvedProductId ?? k.productId),
      miktar: k.miktar || 1,
      birim: 'C62',
    }));

    const result = await sendDespatch({
      irsaliyeNo,
      issueDate,
      issueTime,
      sevkTarihi: issueDate,
      gonderen: gonderenInfo,
      alici: aliciInfo,
      kalemler,
      transferRef: ctx.transferRef,
      aliciAlias,
      localDocumentId: ctx.transferRef,
      not: `Şirketler arası transfer ${input.kaynakLok?.name ?? kaynakSube} → ${input.hedefLok?.name ?? hedefSube}`,
    }, uyumsoftSirketId);

    if (result.basarili) {
      await saveIrsaliyeKayit({
        irsaliyeNo,
        sube: kaynakSube,
        transferRef: ctx.transferRef,
        ettn: result.ettn,
        durum: result.outboxOnaylandi ? 'ONAYLANDI' : 'GONDERILDI',
      });
      logAdim(ctx, {
        adim: 'e_irsaliye_gonder',
        label: 'e-İrsaliye gönderildi',
        durum: 'basarili',
        mesaj: result.irsaliyeNo ?? result.irsaliyeId,
      });
      return {
        eIrsaliyeGonderildi: true,
        eIrsaliyeNo: result.irsaliyeNo,
        eIrsaliyeId: result.irsaliyeId,
        eIrsaliyeEttn: result.ettn,
      };
    }

    const hata = result.mesaj ?? 'e-İrsaliye gönderilemedi';
    logAdim(ctx, {
      adim: 'e_irsaliye_gonder',
      label: 'e-İrsaliye gönderimi',
      durum: 'basarisiz',
      mesaj: hata,
    });
    const bildirimMesaji =
      `Şirketler arası transfer #${ctx.transferRef} tamamlandı ancak e-İrsaliye gönderilemedi. ` +
      `Manuel gönderim gerekebilir. Hata: ${hata}`;
    ctx.uyarilar.push(bildirimMesaji);
    await notifyEirsaliyeFailure(ctx.transferRef, bildirimMesaji);
    return { eIrsaliyeGonderildi: false, eIrsaliyeHata: hata, eIrsaliyeEttn: result.ettn };
  } catch (err) {
    const hata = odooErr(err);
    logAdim(ctx, {
      adim: 'e_irsaliye_gonder',
      label: 'e-İrsaliye gönderimi',
      durum: 'basarisiz',
      mesaj: hata,
    });
    const bildirimMesaji =
      `Şirketler arası transfer #${ctx.transferRef} tamamlandı ancak e-İrsaliye gönderilemedi. ` +
      `Manuel gönderim gerekebilir. Hata: ${hata}`;
    ctx.uyarilar.push(bildirimMesaji);
    await notifyEirsaliyeFailure(ctx.transferRef, bildirimMesaji);
    return { eIrsaliyeGonderildi: false, eIrsaliyeHata: hata };
  }
}

async function resolveHedefLotId(
  kalem: SirketlerArasiKalem,
  hedefProdId: number,
  hedefSirketId: number,
): Promise<number | undefined> {
  if (!kalem.lotId) return undefined;
  const kaynakLotData = await execute('stock.lot', 'read', [[kalem.lotId]], { fields: ['id', 'name', 'ref'] });
  const lotAdi = kaynakLotData[0]?.name ?? `LOT-${kalem.lotId}`;
  const mevcutLot = await execute(
    'stock.lot',
    'search_read',
    [[['name', '=', lotAdi], ['product_id', '=', hedefProdId], ['company_id', '=', hedefSirketId]]],
    { fields: ['id'], limit: 1 },
    hedefSirketId,
  );
  if (mevcutLot.length > 0) return mevcutLot[0].id;
  const yeniLotVals: Record<string, unknown> = {
    name: lotAdi,
    product_id: hedefProdId,
    company_id: hedefSirketId,
  };
  if (kaynakLotData[0]?.ref) yeniLotVals.ref = kaynakLotData[0].ref;
  return execute('stock.lot', 'create', [yeniLotVals], {}, hedefSirketId);
}

export async function baslatSirketlerArasiTransfer(input: {
  grup: SirketlerArasiKalem[];
  kaynakId: number;
  hedefId: number;
  kaynakLok?: { id: number; name?: string; company_id?: [number, string] };
  hedefLok?: { id: number; name?: string; company_id?: [number, string] };
  kaynakSirketId: number;
  hedefSirketId: number;
  transferRef?: string;
}): Promise<SirketlerArasiTransferSonuc> {
  const { grup, kaynakId, hedefId, kaynakLok, hedefLok, kaynakSirketId, hedefSirketId } = input;
  const transferRef = input.transferRef ?? `TRANSFER-${Date.now()}`;
  const ctx: TransferCtx = {
    transferRef,
    adimlar: [],
    rollbacks: [],
    uyarilar: [],
    kayitlar: {},
  };

  const baseSonuc = (): SirketlerArasiTransferSonuc => ({
    tip: 'sirketler-arasi',
    durum: 'basarisiz',
    transferRef,
    satisSiparisi: transferRef,
    kalemSayisi: grup.length,
    kaynakSirket: kaynakLok?.company_id?.[1],
    hedefSirket: hedefLok?.company_id?.[1],
    kaynak: kaynakId,
    hedef: hedefId,
    adimlar: ctx.adimlar,
    uyarilar: ctx.uyarilar.length ? ctx.uyarilar : undefined,
  });

  try {
    logTransfer(transferRef, 'Başladı', { kaynakId, hedefId, kaynakSirketId, hedefSirketId, kalem: grup.length });

    for (const kalem of grup) {
      if (!kalem.resolvedProductId) kalem.resolvedProductId = kalem.productId;
    }
    const lotHata = await assertTrackedKalemlerHaveLot(grup);
    if (lotHata) throw new Error(lotHata);

    await enrichKalemlerWithUtsFromLot(grup, kaynakSirketId);

    // ── 1) Ürün / fiyat satırları ─────────────────────────────────
    const invoiceLines: Array<[0, 0, Record<string, unknown>]> = [];
    const urunHatalari: string[] = [];
    const kalemTaxRates = new Map<number, number>();

    for (const kalem of grup) {
      const productId = kalem.resolvedProductId ?? kalem.productId;
      const productRows = await execute(
        'product.product',
        'search_read',
        [[['id', '=', productId]]],
        { fields: ['id', 'name', 'lst_price', 'standard_price'], limit: 1 },
        kaynakSirketId,
      );
      const product = productRows[0];
      if (!product) {
        urunHatalari.push(`"${kalem.urunAdi ?? kalem.productId}" kaynak şirkette bulunamadı`);
        continue;
      }

      try {
        const { maliyet, urunAdi } = await resolveTransferKalemMaliyet(
          kalem,
          kaynakSirketId,
          hedefSirketId,
        );
        kalem.maliyet = maliyet;
        if (!kalem.urunAdi) kalem.urunAdi = urunAdi;
      } catch (err) {
        urunHatalari.push(err instanceof Error ? err.message : String(err));
        continue;
      }

      const satisFiyati = kalem.satisFiyati || Math.round(kalem.maliyet * 1.05 * 100) / 100;
      kalem.satisFiyati = satisFiyati;

      const taxRate = await readProductSaleTaxRate(product.id, kaynakSirketId);
      kalemTaxRates.set(product.id, taxRate);

      invoiceLines.push([0, 0, {
        product_id: product.id,
        name: kalem.urunAdi || product.name || '',
        quantity: kalem.miktar || 1,
        price_unit: satisFiyati,
      }]);
    }

    if (urunHatalari.length > 0) {
      throw new Error(urunHatalari.join('; '));
    }
    if (invoiceLines.length === 0) {
      throw new Error('Geçerli ürün satırı oluşturulamadı');
    }

    logAdim(ctx, { adim: 'urun_satirlari', label: 'Ürün satırları hazırlandı', durum: 'basarili' });

    // ── 2) Alıcı partner ────────────────────────────────────────────
    const aliciSirket = await execute('res.company', 'read', [[hedefSirketId]], { fields: ['id', 'name', 'partner_id'] });
    const aliciPartnerId = aliciSirket[0]?.partner_id?.[0] as number | undefined;
    if (!aliciPartnerId) {
      throw new Error('Alıcı şirket partner bulunamadı');
    }
    logAdim(ctx, { adim: 'alici_partner', label: 'Alıcı partner doğrulandı', durum: 'basarili', kayitId: aliciPartnerId });

    // ── 3) Satış faturası oluştur ───────────────────────────────────
    const gelirHesap = await execute(
      'account.account',
      'search_read',
      [[['code', '=', '600'], ['company_id', '=', kaynakSirketId]]],
      { fields: ['id'], limit: 1 },
      kaynakSirketId,
    );
    const gelirHesapId = gelirHesap[0]?.id;

    const invoiceLinesWithTax: Array<[0, 0, Record<string, unknown>]> = [];
    for (const line of invoiceLines) {
      const vals = { ...line[2] };
      const productId = Number(vals.product_id);
      const taxRate = kalemTaxRates.get(productId) ?? 20;
      const vergiId = await resolveSaleTaxIdExcluded(kaynakSirketId, taxRate);
      if (gelirHesapId) vals.account_id = gelirHesapId;
      if (vergiId) vals.tax_ids = [[6, 0, [vergiId]]];
      invoiceLinesWithTax.push([0, 0, vals]);
    }

    const satisFaturaCtx = { context: buildOdooTaxAccessContext(kaynakSirketId) };
    const satisFaturaId = await execute(
      'account.move',
      'create',
      [{
        move_type: 'out_invoice',
        partner_id: aliciPartnerId,
        company_id: kaynakSirketId,
        invoice_date: new Date().toISOString().slice(0, 10),
        invoice_line_ids: invoiceLinesWithTax,
        narration: `Şirketler arası transfer ${kaynakLok?.name} → ${hedefLok?.name} - %5 kâr (${transferRef})`,
      }],
      satisFaturaCtx,
      kaynakSirketId,
    );
    ctx.kayitlar.satisFaturaId = satisFaturaId;
    ctx.rollbacks.push({
      adim: 'satis_faturasi',
      label: 'Satış faturası',
      rollback: () => rollbackInvoice(satisFaturaId, kaynakSirketId),
    });
    logAdim(ctx, {
      adim: 'satis_faturasi_olustur',
      label: 'Satış faturası oluşturuldu',
      durum: 'basarili',
      kayitId: satisFaturaId,
      kayitTipi: 'account.move',
    });

    // ── 4) Satış faturası onayla ────────────────────────────────────
    await execute('account.move', 'action_post', [[satisFaturaId]], satisFaturaCtx, kaynakSirketId);
    const invData = await execute('account.move', 'read', [[satisFaturaId]], { fields: ['id', 'name', 'state'] }, kaynakSirketId);
    ctx.kayitlar.satisFaturaName = invData[0]?.name ?? '';
    logAdim(ctx, {
      adim: 'satis_faturasi_onayla',
      label: 'Satış faturası onaylandı',
      durum: 'basarili',
      kayitId: satisFaturaId,
      kayitTipi: 'account.move',
      mesaj: invData[0]?.state,
    });

    // ── 5) Alım faturası oluştur ────────────────────────────────────
    const alimFaturaLines: Array<[0, 0, Record<string, unknown>]> = [];
    for (const kalem of grup) {
      const hedefProductId = kalem.resolvedProductId ?? kalem.productId;
      const giderHesap = await execute(
        'account.account',
        'search_read',
        [[['code', '=', '620'], ['company_id', '=', hedefSirketId]]],
        { fields: ['id'], limit: 1 },
        hedefSirketId,
      );
      const taxRate = kalemTaxRates.get(hedefProductId)
        ?? await readProductSaleTaxRate(hedefProductId, hedefSirketId);
      const purchaseTaxId = await resolvePurchaseTaxId(hedefSirketId, taxRate);
      const lineVals: Record<string, unknown> = {
        product_id: hedefProductId,
        name: kalem.urunAdi || '',
        quantity: kalem.miktar || 1,
        price_unit: Math.round(kalem.maliyet! * 1.05 * 100) / 100,
      };
      if (giderHesap[0]?.id) lineVals.account_id = giderHesap[0].id;
      if (purchaseTaxId) lineVals.tax_ids = [[6, 0, [purchaseTaxId]]];
      alimFaturaLines.push([0, 0, lineVals]);
    }

    const saticiSirket = await execute('res.company', 'read', [[kaynakSirketId]], { fields: ['id', 'name', 'partner_id'] });
    const saticiPartnerId = saticiSirket[0]?.partner_id?.[0] as number | undefined;
    if (!saticiPartnerId) {
      throw new Error('Satıcı şirket partner bulunamadı');
    }

    const alimFaturaCtx = { context: buildOdooTaxAccessContext(hedefSirketId) };
    const alimFaturaId = await execute(
      'account.move',
      'create',
      [{
        move_type: 'in_invoice',
        partner_id: saticiPartnerId,
        company_id: hedefSirketId,
        invoice_date: new Date().toISOString().slice(0, 10),
        invoice_line_ids: alimFaturaLines,
        narration: `Şirketler arası alım ${kaynakLok?.name} → ${hedefLok?.name} (${transferRef})`,
      }],
      alimFaturaCtx,
      hedefSirketId,
    );
    ctx.kayitlar.alimFaturaId = alimFaturaId;
    ctx.rollbacks.push({
      adim: 'alim_faturasi',
      label: 'Alım faturası',
      rollback: () => rollbackInvoice(alimFaturaId, hedefSirketId),
    });
    logAdim(ctx, {
      adim: 'alim_faturasi_olustur',
      label: 'Alım faturası oluşturuldu',
      durum: 'basarili',
      kayitId: alimFaturaId,
      kayitTipi: 'account.move',
    });

    // ── 6) Alım faturası onayla ─────────────────────────────────────
    await execute('account.move', 'action_post', [[alimFaturaId]], alimFaturaCtx, hedefSirketId);
    const alimInvData = await execute('account.move', 'read', [[alimFaturaId]], { fields: ['id', 'name', 'state'] }, hedefSirketId);
    ctx.kayitlar.alimFaturaName = alimInvData[0]?.name ?? '';
    logAdim(ctx, {
      adim: 'alim_faturasi_onayla',
      label: 'Alım faturası onaylandı',
      durum: 'basarili',
      kayitId: alimFaturaId,
      kayitTipi: 'account.move',
      mesaj: alimInvData[0]?.state,
    });

    // ── 7) Hedef stok girişi ────────────────────────────────────────
    const hedefPtReceipt = await execute(
      'stock.picking.type',
      'search_read',
      [[['code', '=', 'incoming'], ['active', '=', true], ['company_id', '=', hedefSirketId]]],
      { fields: ['id'], limit: 1 },
      hedefSirketId,
    );
    if (!hedefPtReceipt.length) {
      throw new Error('Hedef şirkette incoming picking type bulunamadı');
    }

    let tedarikciLok = await execute(
      'stock.location',
      'search_read',
      [[['usage', '=', 'supplier'], ['company_id', '=', hedefSirketId]]],
      { fields: ['id'], limit: 1 },
      hedefSirketId,
    );
    if (!tedarikciLok.length) {
      tedarikciLok = await execute(
        'stock.location',
        'search_read',
        [[['usage', '=', 'supplier'], ['company_id', '=', false]]],
        { fields: ['id'], limit: 1 },
      );
    }
    if (!tedarikciLok.length) {
      tedarikciLok = await execute('stock.location', 'search_read', [[['usage', '=', 'supplier']]], { fields: ['id'], limit: 1 });
    }
    const tedarikciLokId = tedarikciLok[0]?.id;
    if (!tedarikciLokId) {
      throw new Error('Tedarikçi lokasyonu bulunamadı');
    }

    const inPickingId = await execute(
      'stock.picking',
      'create',
      [{
        picking_type_id: hedefPtReceipt[0].id,
        location_id: tedarikciLokId,
        location_dest_id: hedefId,
        company_id: hedefSirketId,
        note: `Şirketler arası giriş ← ${kaynakLok?.name} (${transferRef})`,
        origin: `${transferRef}|src:${kaynakId}|dst:${hedefId}|srcCo:${kaynakSirketId}`,
      }],
      {},
      hedefSirketId,
    );
    ctx.kayitlar.hedefPickingId = inPickingId;
    ctx.rollbacks.push({
      adim: 'hedef_stok_girisi',
      label: 'Hedef stok girişi',
      rollback: () => rollbackPicking(inPickingId, hedefSirketId),
    });

    for (const kalem of grup) {
      await execute(
        'stock.move',
        'create',
        [{
          picking_id: inPickingId,
          product_id: kalem.resolvedProductId ?? kalem.productId,
          product_uom_qty: kalem.miktar || 1,
          product_uom: 1,
          location_id: tedarikciLokId,
          location_dest_id: hedefId,
          name: kalem.urunAdi || 'Transfer',
        }],
        {},
        hedefSirketId,
      );
    }

    await execute('stock.picking', 'action_confirm', [[inPickingId]], {}, hedefSirketId);
    await execute('stock.picking', 'action_assign', [[inPickingId]], {}, hedefSirketId);

    const inMoveLines = await execute(
      'stock.move.line',
      'search_read',
      [[['picking_id', '=', inPickingId]]],
      { fields: ['id', 'product_id', 'lot_id'], limit: 100 },
      hedefSirketId,
    );

    if (inMoveLines.length === 0) {
      for (const kalem of grup) {
        const hedefProdId = kalem.resolvedProductId ?? kalem.productId;
        const mlVals: Record<string, unknown> = {
          picking_id: inPickingId,
          product_id: hedefProdId,
          quantity: kalem.miktar || 1,
          location_id: tedarikciLokId,
          location_dest_id: hedefId,
          product_uom_id: 1,
        };
        const lotId = await resolveHedefLotId(kalem, hedefProdId, hedefSirketId);
        if (lotId) mlVals.lot_id = lotId;
        await execute('stock.move.line', 'create', [mlVals], {}, hedefSirketId);
      }
    } else {
      for (let i = 0; i < inMoveLines.length; i++) {
        const kalemI = grup[i];
        const writeVals: Record<string, unknown> = { quantity: kalemI?.miktar || 1 };
        if (kalemI?.lotId) {
          const lineProductId = inMoveLines[i].product_id?.[0] ?? kalemI.resolvedProductId ?? kalemI.productId;
          const lotId = await resolveHedefLotId(kalemI, lineProductId, hedefSirketId);
          if (lotId) writeVals.lot_id = lotId;
        }
        await execute('stock.move.line', 'write', [[inMoveLines[i].id], writeVals], {}, hedefSirketId);
      }
    }

    const inPickData = await execute('stock.picking', 'read', [[inPickingId]], { fields: ['id', 'name', 'state'] }, hedefSirketId);
    ctx.kayitlar.hedefPickingName = inPickData[0]?.name;
    logAdim(ctx, {
      adim: 'hedef_stok_girisi',
      label: 'Hedef stok girişi oluşturuldu (kabul bekliyor)',
      durum: 'basarili',
      kayitId: inPickingId,
      kayitTipi: 'stock.picking',
      mesaj: inPickData[0]?.name,
    });

    // ── 8) Kaynak stok çıkışı ───────────────────────────────────────
    const ptOut = await execute(
      'stock.picking.type',
      'search_read',
      [[['code', '=', 'outgoing'], ['active', '=', true], ['company_id', '=', kaynakSirketId]]],
      { fields: ['id'], limit: 1 },
      kaynakSirketId,
    );
    if (!ptOut.length) {
      throw new Error('Kaynak şirkette outgoing picking type bulunamadı');
    }

    let musteriLok = await execute(
      'stock.location',
      'search_read',
      [[['usage', '=', 'customer'], ['company_id', '=', kaynakSirketId]]],
      { fields: ['id'], limit: 1 },
      kaynakSirketId,
    );
    if (!musteriLok.length) {
      musteriLok = await execute(
        'stock.location',
        'search_read',
        [[['usage', '=', 'customer'], ['company_id', '=', false]]],
        { fields: ['id'], limit: 1 },
      );
    }
    if (!musteriLok.length) {
      musteriLok = await execute('stock.location', 'search_read', [[['usage', '=', 'customer']]], { fields: ['id'], limit: 1 });
    }
    const musteriLokId = musteriLok[0]?.id;
    if (!musteriLokId) {
      throw new Error('Müşteri lokasyonu bulunamadı');
    }

    const outPickingId = await execute(
      'stock.picking',
      'create',
      [{
        picking_type_id: ptOut[0].id,
        location_id: kaynakId,
        location_dest_id: musteriLokId,
        company_id: kaynakSirketId,
        partner_id: aliciPartnerId,
        note: `Şirketler arası transfer → ${hedefLok?.name} (${transferRef})`,
        origin: `${transferRef}|src:${kaynakId}|dst:${hedefId}|srcCo:${kaynakSirketId}`,
      }],
      {},
      kaynakSirketId,
    );
    ctx.kayitlar.kaynakPickingId = outPickingId;
    ctx.rollbacks.push({
      adim: 'kaynak_stok_cikisi',
      label: 'Kaynak stok çıkışı',
      rollback: () => rollbackPicking(outPickingId, kaynakSirketId),
    });

    for (const kalem of grup) {
      await execute(
        'stock.move',
        'create',
        [{
          picking_id: outPickingId,
          product_id: kalem.resolvedProductId ?? kalem.productId,
          product_uom_qty: kalem.miktar || 1,
          product_uom: 1,
          location_id: kaynakId,
          location_dest_id: musteriLokId,
          name: kalem.urunAdi || 'Transfer',
        }],
        {},
        kaynakSirketId,
      );
    }

    await execute('stock.picking', 'action_confirm', [[outPickingId]], {}, kaynakSirketId);
    await execute('stock.picking', 'action_assign', [[outPickingId]], {}, kaynakSirketId);

    const outMoveLines = await execute(
      'stock.move.line',
      'search_read',
      [[['picking_id', '=', outPickingId]]],
      { fields: ['id', 'product_id', 'lot_id'], limit: 100 },
      kaynakSirketId,
    );

    if (outMoveLines.length === 0) {
      for (const kalem of grup) {
        const productId = kalem.resolvedProductId ?? kalem.productId;
        const quants = await execute(
          'stock.quant',
          'search_read',
          [[['location_id', '=', kaynakId], ['product_id', '=', productId], ['quantity', '>', 0]]],
          { fields: ['lot_id'], limit: 1 },
          kaynakSirketId,
        );
        const mlVals: Record<string, unknown> = {
          picking_id: outPickingId,
          product_id: productId,
          quantity: kalem.miktar || 1,
          location_id: kaynakId,
          location_dest_id: musteriLokId,
          product_uom_id: 1,
        };
        if (quants[0]?.lot_id) mlVals.lot_id = quants[0].lot_id[0];
        else if (kalem.lotId) mlVals.lot_id = kalem.lotId;
        await execute('stock.move.line', 'create', [mlVals], {}, kaynakSirketId);
      }
    } else {
      for (let i = 0; i < outMoveLines.length; i++) {
        const kalem = grup[i];
        const writeVals: Record<string, unknown> = { quantity: kalem?.miktar || 1 };
        if (!outMoveLines[i].lot_id) {
          const productId = kalem?.resolvedProductId ?? kalem?.productId;
          const quants = await execute(
            'stock.quant',
            'search_read',
            [[['location_id', '=', kaynakId], ['product_id', '=', productId], ['quantity', '>', 0]]],
            { fields: ['lot_id'], limit: 1 },
            kaynakSirketId,
          );
          if (quants[0]?.lot_id) writeVals.lot_id = quants[0].lot_id[0];
          else if (kalem?.lotId) writeVals.lot_id = kalem.lotId;
        }
        await execute('stock.move.line', 'write', [[outMoveLines[i].id], writeVals], {}, kaynakSirketId);
      }
    }

    await execute('stock.picking', 'button_validate', [[outPickingId]], {}, kaynakSirketId);
    const outData = await execute('stock.picking', 'read', [[outPickingId]], { fields: ['id', 'name', 'state'] }, kaynakSirketId);
    ctx.kayitlar.kaynakPickingName = outData[0]?.name;
    if (outData[0]?.state !== 'done') {
      throw new Error(`Kaynak stok çıkışı validate edilemedi (state=${outData[0]?.state})`);
    }
    logAdim(ctx, {
      adim: 'kaynak_stok_cikisi',
      label: 'Kaynak stok çıkışı tamamlandı',
      durum: 'basarili',
      kayitId: outPickingId,
      kayitTipi: 'stock.picking',
      mesaj: outData[0]?.name,
    });

    logTransfer(transferRef, 'Başlatıldı — kabul bekliyor');
    return {
      ...baseSonuc(),
      durum: 'bekliyor',
      kabulPickingId: inPickingId,
      kaynakPickingId: outPickingId,
      fatura: ctx.kayitlar.satisFaturaName,
      alimFatura: ctx.kayitlar.alimFaturaName,
      hedefStokGirisi: ctx.kayitlar.hedefPickingName,
      stokHareketi: ctx.kayitlar.kaynakPickingName,
    };
  } catch (err) {
    const hata = odooErr(err);
    logTransfer(transferRef, 'HATA — rollback başlıyor', { hata });
    logAdim(ctx, { adim: 'transfer_hata', label: 'Transfer durdu', durum: 'basarisiz', mesaj: hata });

    const manualIssues = await runRollback(ctx);
    const tamamlananAdimlar = ctx.adimlar
      .filter((a) => a.durum === 'basarili')
      .map((a) => a.label)
      .join(', ');

    let durum: 'basarisiz' | 'kismi' = 'basarisiz';
    let manuelMudahale = false;
    let manuelMudahaleMesaji: string | undefined;

    if (manualIssues.length > 0) {
      durum = 'kismi';
      manuelMudahale = true;
      manuelMudahaleMesaji =
        `Şirketler arası transfer #${transferRef} yarım kaldı. ` +
        `Tamamlanan adımlar: ${tamamlananAdimlar || 'yok'}. ` +
        `Elle kontrol/düzeltme gereken kayıtlar: ${manualIssues.join('; ')}`;
      ctx.uyarilar.push(manuelMudahaleMesaji);
      await notifyManualIntervention(transferRef, manuelMudahaleMesaji);
    } else if (ctx.rollbacks.some((_, i) => ctx.adimlar.some((a) => a.durum === 'geri_alindi'))) {
      durum = 'basarisiz';
    }

    logTransfer(transferRef, 'Rollback bitti', { durum, manualIssues });

    return {
      ...baseSonuc(),
      durum,
      hata: hata,
      fatura: ctx.kayitlar.satisFaturaName,
      alimFatura: ctx.kayitlar.alimFaturaName,
      hedefStokGirisi: ctx.kayitlar.hedefPickingName,
      stokHareketi: ctx.kayitlar.kaynakPickingName,
      kabulPickingId: ctx.kayitlar.hedefPickingId,
      kaynakPickingId: ctx.kayitlar.kaynakPickingId,
      manuelMudahale,
      manuelMudahaleMesaji,
    };
  }
}

export async function kabulSirketlerArasiTransfer(input: {
  transferRef: string;
  hedefPickingId: number;
  hedefSirketId: number;
  kaynakSirketId: number;
  kaynakId: number;
  hedefId: number;
  grup: SirketlerArasiKalem[];
  sayimlar?: Array<{ moveLineId?: number; qtyDone?: number; sayilanAdet?: number; beklenenAdet?: number }>;
}): Promise<SirketlerArasiTransferSonuc> {
  const { transferRef, hedefPickingId, hedefSirketId, grup } = input;
  const adimlar: TransferAdimLog[] = [];

  try {
    const inMoveLines = await execute(
      'stock.move.line',
      'search_read',
      [[['picking_id', '=', hedefPickingId]]],
      { fields: ['id', 'product_id', 'quantity', 'lot_id'], limit: 100 },
      hedefSirketId,
    );

    const sayimlar = input.sayimlar ?? [];
    if (sayimlar.length > 0) {
      for (let i = 0; i < sayimlar.length; i++) {
        const s = sayimlar[i];
        const qty = Number(s.qtyDone ?? s.sayilanAdet ?? s.beklenenAdet ?? 0);
        const mlId = Number(s.moveLineId) || inMoveLines[i]?.id;
        if (mlId && Number.isFinite(qty)) {
          await execute('stock.move.line', 'write', [[mlId], { quantity: qty }], {}, hedefSirketId);
        }
      }
    } else if (inMoveLines.length) {
      for (let i = 0; i < inMoveLines.length; i++) {
        const kalem = grup[i];
        const writeVals: Record<string, unknown> = { quantity: kalem?.miktar || inMoveLines[i].quantity || 1 };
        await execute('stock.move.line', 'write', [[inMoveLines[i].id], writeVals], {}, hedefSirketId);
      }
    }

    await execute('stock.picking', 'button_validate', [[hedefPickingId]], {}, hedefSirketId);
    const inPickData = await execute(
      'stock.picking',
      'read',
      [[hedefPickingId]],
      { fields: ['id', 'name', 'state'] },
      hedefSirketId,
    );
    if (inPickData[0]?.state !== 'done') {
      throw new Error(`Hedef stok girişi validate edilemedi (state=${inPickData[0]?.state})`);
    }

    adimlar.push({
      adim: 'hedef_stok_girisi_kabul',
      label: 'Hedef stok girişi kabul edildi',
      durum: 'basarili',
      kayitId: hedefPickingId,
      kayitTipi: 'stock.picking',
      mesaj: inPickData[0]?.name,
    });

    logTransfer(transferRef, 'Kabul tamamlandı');

    return {
      tip: 'sirketler-arasi',
      durum: 'basarili',
      transferRef,
      satisSiparisi: transferRef,
      kalemSayisi: grup.length,
      kabulPickingId: hedefPickingId,
      hedefStokGirisi: inPickData[0]?.name,
      adimlar,
    };
  } catch (err) {
    const hata = odooErr(err);
    adimlar.push({ adim: 'kabul_hata', label: 'Kabul başarısız', durum: 'basarisiz', mesaj: hata });
    return {
      tip: 'sirketler-arasi',
      durum: 'basarisiz',
      transferRef,
      satisSiparisi: transferRef,
      kalemSayisi: grup.length,
      kabulPickingId: hedefPickingId,
      hata,
      adimlar,
    };
  }
}

/** Garanti/İade ve Özel Sipariş — tek adımda tamamlama (Faz 4'te otomatik ardışık çekirdeğe taşınacak) */
export async function executeSirketlerArasiTransfer(input: {
  grup: SirketlerArasiKalem[];
  kaynakId: number;
  hedefId: number;
  kaynakLok?: { id: number; name?: string; company_id?: [number, string] };
  hedefLok?: { id: number; name?: string; company_id?: [number, string] };
  kaynakSirketId: number;
  hedefSirketId: number;
}): Promise<SirketlerArasiTransferSonuc> {
  const baslat = await baslatSirketlerArasiTransfer(input);
  if (baslat.durum !== 'bekliyor' || !baslat.kabulPickingId) {
    return baslat;
  }

  const kabul = await kabulSirketlerArasiTransfer({
    transferRef: baslat.transferRef,
    hedefPickingId: baslat.kabulPickingId,
    hedefSirketId: input.hedefSirketId,
    kaynakSirketId: input.kaynakSirketId,
    kaynakId: input.kaynakId,
    hedefId: input.hedefId,
    grup: input.grup,
  });

  if (kabul.durum !== 'basarili') {
    return {
      ...baslat,
      durum: 'kismi',
      hata: kabul.hata,
      adimlar: [...(baslat.adimlar ?? []), ...(kabul.adimlar ?? [])],
      manuelMudahale: true,
      manuelMudahaleMesaji: `Transfer gönderildi ancak otomatik kabul başarısız: ${kabul.hata}`,
    };
  }

  const ctx: TransferCtx = {
    transferRef: baslat.transferRef,
    adimlar: [...(baslat.adimlar ?? []), ...(kabul.adimlar ?? [])],
    rollbacks: [],
    uyarilar: baslat.uyarilar ?? [],
    kayitlar: {
      hedefPickingId: baslat.kabulPickingId,
      kaynakPickingId: baslat.kaynakPickingId,
    },
  };

  const eIrsaliye = await trySendEirsaliyeForTransfer(ctx, input);

  return {
    ...baslat,
    durum: 'basarili',
    adimlar: ctx.adimlar,
    hedefStokGirisi: kabul.hedefStokGirisi ?? baslat.hedefStokGirisi,
    ...eIrsaliye,
  };
}
