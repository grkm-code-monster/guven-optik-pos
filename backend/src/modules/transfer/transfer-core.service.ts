import { execute } from '../odoo/odoo.service';
import { getBranchCodeByOdooLocationId } from '../uts/uts-kurum.service';
import {
  baslatSirketlerArasiTransfer,
  kabulSirketlerArasiTransfer,
  type SirketlerArasiKalem,
} from '../admin/sirketler-arasi-transfer.service';
import { enrichKalemlerWithUtsFromLot, assertTrackedKalemlerHaveLot } from './transfer-kalem.util';
import {
  runTransferPostActions,
  type TransferPostActionKalem,
} from './transfer-post-actions.service';

export type TransferCoreKalem = {
  productId: number;
  resolvedProductId?: number;
  miktar?: number;
  urunAdi?: string;
  maliyet?: number;
  lotId?: number | null;
  utsKodu?: string;
  utsFirmaKodu?: string;
};

export type BaslatTransferInput = {
  kaynakLocationId: number;
  hedefLocationId: number;
  kalemler: TransferCoreKalem[];
  notlar?: string;
  transferRef?: string;
  /** Garanti/Özel Sipariş Faz 4 — şimdilik yalnızca lab-incident gibi istisnalar */
  hemenKabul?: boolean;
};

export type BaslatTransferSonuc = {
  success: boolean;
  durum: 'bekliyor' | 'basarisiz' | 'kismi';
  transferRef: string;
  tip: 'sirket-ici' | 'sirketler-arasi';
  kabulPickingId: number;
  kaynakPickingId?: number;
  pickingName?: string;
  message: string;
  detay?: unknown;
};

export type KabulTransferInput = {
  kabulPickingId: number;
  sayimlar?: Array<{
    moveLineId?: number;
    qtyDone?: number;
    sayilanAdet?: number;
    beklenenAdet?: number;
    id?: number;
    product_id?: unknown;
  }>;
  transferRef?: string;
};

export type KabulTransferSonuc = {
  success: boolean;
  message: string;
  transferRef?: string;
  detay?: unknown;
};

function transferRefUret(override?: string): string {
  return override ?? `TRANSFER-${Date.now()}`;
}

async function resolveLokasyonlar(kaynakId: number, hedefId: number) {
  const lokasyonlar = await execute(
    'stock.location',
    'search_read',
    [[['id', 'in', [kaynakId, hedefId]]]],
    { fields: ['id', 'name', 'company_id'], limit: 2 },
  ) as Array<{ id: number; name?: string; company_id?: [number, string] }>;

  const kaynakLok = lokasyonlar.find((l) => l.id === kaynakId);
  const hedefLok = lokasyonlar.find((l) => l.id === hedefId);
  const kaynakSirketId = kaynakLok?.company_id?.[0] ?? 1;
  const hedefSirketId = hedefLok?.company_id?.[0] ?? 1;

  return { kaynakLok, hedefLok, kaynakSirketId, hedefSirketId };
}

async function resolveProductIds(kalemler: TransferCoreKalem[]) {
  for (const kalem of kalemler) {
    if (kalem.resolvedProductId) continue;
    try {
      const prodCheck = await execute(
        'product.product',
        'search_read',
        [[['id', '=', kalem.productId]]],
        { fields: ['id', 'name'], limit: 1 },
      );
      if (prodCheck[0]?.id) {
        kalem.resolvedProductId = prodCheck[0].id;
      } else {
        const variants = await execute(
          'product.product',
          'search_read',
          [[['product_tmpl_id', '=', kalem.productId]]],
          { fields: ['id'], limit: 1 },
        );
        kalem.resolvedProductId = variants[0]?.id ?? kalem.productId;
      }
    } catch {
      kalem.resolvedProductId = kalem.productId;
    }
  }
}

function toPostKalemler(kalemler: TransferCoreKalem[]): TransferPostActionKalem[] {
  return kalemler.map((k) => ({
    productId: k.productId,
    resolvedProductId: k.resolvedProductId,
    urunAdi: k.urunAdi,
    miktar: k.miktar,
    maliyet: k.maliyet,
    lotId: k.lotId ?? undefined,
    utsKodu: k.utsKodu,
    utsFirmaKodu: k.utsFirmaKodu,
  }));
}

async function postActionsBaslat(
  transferRef: string,
  kaynakId: number,
  hedefId: number,
  kaynakSirketId: number,
  hedefSirketId: number,
  kalemler: TransferCoreKalem[],
  kaynakLokAdi?: string,
  hedefLokAdi?: string,
  odooPickingId?: number,
) {
  const kaynakSube = (await getBranchCodeByOdooLocationId(kaynakId)) ?? `#${kaynakId}`;
  const hedefSube = (await getBranchCodeByOdooLocationId(hedefId)) ?? `#${hedefId}`;

  await runTransferPostActions({
    transferRef,
    event: 'BASLATILDI',
    kaynak: { subeKodu: kaynakSube, sirketId: kaynakSirketId },
    hedef: { subeKodu: hedefSube, sirketId: hedefSirketId },
    kalemler: toPostKalemler(kalemler),
    odooPickingId,
    kaynakLokAdi,
    hedefLokAdi,
  });
}

async function postActionsKabul(
  transferRef: string,
  kaynakId: number,
  hedefId: number,
  kaynakSirketId: number,
  hedefSirketId: number,
  kalemler: TransferCoreKalem[],
) {
  const kaynakSube = (await getBranchCodeByOdooLocationId(kaynakId)) ?? `#${kaynakId}`;
  const hedefSube = (await getBranchCodeByOdooLocationId(hedefId)) ?? `#${hedefId}`;

  await runTransferPostActions({
    transferRef,
    event: 'KABUL_EDILDI',
    kaynak: { subeKodu: kaynakSube, sirketId: kaynakSirketId },
    hedef: { subeKodu: hedefSube, sirketId: hedefSirketId },
    kalemler: toPostKalemler(kalemler),
  });
}

async function ensureInternalPickingType(kaynakSirketId: number): Promise<number> {
  const ptDomain: unknown[] = [
    ['code', '=', 'internal'],
    ['active', '=', true],
    ['company_id', '=', kaynakSirketId],
  ];
  let pickingTypes = await execute(
    'stock.picking.type',
    'search_read',
    [ptDomain],
    { fields: ['id', 'name'], limit: 1 },
    kaynakSirketId,
  );

  if (!pickingTypes.length) {
    const warehouses = await execute(
      'stock.warehouse',
      'search_read',
      [[['company_id', '=', kaynakSirketId]]],
      { fields: ['id', 'name'], limit: 1 },
      kaynakSirketId,
    );
    const yeniPTId = await execute(
      'stock.picking.type',
      'create',
      [{
        name: 'İç Transferler',
        code: 'internal',
        company_id: kaynakSirketId,
        warehouse_id: warehouses[0]?.id || false,
        sequence_code: `INT${kaynakSirketId}`,
        show_operations: true,
      }],
      {},
      kaynakSirketId,
    );
    pickingTypes = [{ id: yeniPTId }];
  }

  return pickingTypes[0].id as number;
}

async function baslatSirketIciTransfer(
  input: BaslatTransferInput,
  transferRef: string,
  kaynakLok: { id: number; name?: string; company_id?: [number, string] },
  hedefLok: { id: number; name?: string; company_id?: [number, string] },
  kaynakSirketId: number,
): Promise<BaslatTransferSonuc> {
  const { kaynakLocationId: kaynakId, hedefLocationId: hedefId, kalemler, notlar } = input;
  const pickingTypeId = await ensureInternalPickingType(kaynakSirketId);

  const pickingId = await execute(
    'stock.picking',
    'create',
    [{
      picking_type_id: pickingTypeId,
      location_id: kaynakId,
      location_dest_id: hedefId,
      company_id: kaynakSirketId,
      origin: transferRef,
      note: [notlar, transferRef].filter(Boolean).join(' — '),
    }],
    {},
    kaynakSirketId,
  ) as number;

  for (const kalem of kalemler) {
    await execute(
      'stock.move',
      'create',
      [{
        picking_id: pickingId,
        product_id: kalem.resolvedProductId ?? kalem.productId,
        product_uom_qty: kalem.miktar || 1,
        product_uom: 1,
        location_id: kaynakId,
        location_dest_id: hedefId,
        name: kalem.urunAdi || 'Transfer',
      }],
      {},
      kaynakSirketId,
    );
  }

  await execute('stock.picking', 'action_confirm', [[pickingId]], {}, kaynakSirketId);
  await execute('stock.picking', 'action_assign', [[pickingId]], {}, kaynakSirketId);

  const moveLines = await execute(
    'stock.move.line',
    'search_read',
    [[['picking_id', '=', pickingId]]],
    { fields: ['id', 'product_id'], limit: 100 },
    kaynakSirketId,
  ) as Array<{ id: number }>;

  for (let i = 0; i < moveLines.length; i++) {
    const ilgiliKalem = kalemler[i];
    const writeVals: Record<string, unknown> = { quantity: ilgiliKalem?.miktar || 1 };
    if (ilgiliKalem?.lotId) writeVals.lot_id = ilgiliKalem.lotId;
    await execute('stock.move.line', 'write', [[moveLines[i].id], writeVals], {}, kaynakSirketId);
  }

  const pickingData = await execute(
    'stock.picking',
    'read',
    [[pickingId]],
    { fields: ['id', 'name', 'state'] },
    kaynakSirketId,
  ) as Array<{ name?: string; state?: string }>;

  await postActionsBaslat(
    transferRef,
    kaynakId,
    hedefId,
    kaynakSirketId,
    kaynakSirketId,
    kalemler,
    kaynakLok.name,
    hedefLok.name,
    pickingId,
  );

  return {
    success: true,
    durum: 'bekliyor',
    transferRef,
    tip: 'sirket-ici',
    kabulPickingId: pickingId,
    pickingName: pickingData[0]?.name,
    message: 'Transfer gönderildi — hedef şube kabul bekliyor.',
    detay: {
      tip: 'sirket-ici',
      pickingId,
      pickingName: pickingData[0]?.name,
      state: pickingData[0]?.state,
      kalemSayisi: kalemler.length,
    },
  };
}

async function validatePickingWithWizard(pickingId: number, companyId: number) {
  const validateKwargs = {
    context: {
      skip_backorder: true,
      skip_immediate: true,
    },
  };
  try {
    await execute('stock.picking', 'button_validate', [[pickingId]], validateKwargs, companyId);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes('immediate') && !msg.toLowerCase().includes('backorder')) {
      throw err;
    }
  }
  try {
    const wizId = await execute(
      'stock.immediate.transfer',
      'create',
      [{ pick_ids: [[6, 0, [pickingId]]] }],
      {},
      companyId,
    );
    await execute('stock.immediate.transfer', 'process', [[wizId]], {}, companyId);
  } catch {
    await execute('stock.picking', 'button_validate', [[pickingId]], validateKwargs, companyId);
  }
}

async function kabulSirketIciTransfer(
  input: KabulTransferInput,
  companyId: number,
  kalemler: TransferCoreKalem[],
  meta: { transferRef: string; kaynakId: number; hedefId: number },
): Promise<KabulTransferSonuc> {
  const pickingId = input.kabulPickingId;

  const moveLines = await execute(
    'stock.move.line',
    'search_read',
    [[['picking_id', '=', pickingId]]],
    { fields: ['id', 'product_id', 'quantity'] },
    companyId,
  ) as Array<{ id: number; product_id?: [number, string]; quantity?: number }>;

  const sayimlar = input.sayimlar ?? [];
  const updates: Array<{ moveLineId: number; qtyDone: number }> = [];

  for (let i = 0; i < sayimlar.length; i++) {
    const s = sayimlar[i];
    const qtyDone = Number(s.qtyDone ?? s.sayilanAdet ?? s.beklenenAdet ?? 0);
    let moveLineId = Number(s.moveLineId);
    if (!Number.isFinite(moveLineId) && moveLines[i]) moveLineId = moveLines[i].id;
    if (Number.isFinite(moveLineId)) updates.push({ moveLineId, qtyDone });
  }

  if (!updates.length && moveLines.length) {
    for (const ml of moveLines) {
      updates.push({ moveLineId: ml.id, qtyDone: Number(ml.quantity ?? 0) || 0 });
    }
  }

  for (const u of updates) {
    await execute('stock.move.line', 'write', [[u.moveLineId], { quantity: u.qtyDone }], {}, companyId);
  }

  await validatePickingWithWizard(pickingId, companyId);

  await postActionsKabul(
    meta.transferRef,
    meta.kaynakId,
    meta.hedefId,
    companyId,
    companyId,
    kalemler,
  );

  return {
    success: true,
    message: 'Transfer kabul edildi.',
    transferRef: meta.transferRef,
  };
}

/** İki adımlı transfer — gönder (stok çıkışı / fatura) */
export async function baslatTransfer(input: BaslatTransferInput): Promise<BaslatTransferSonuc> {
  const transferRef = transferRefUret(input.transferRef);
  const { kaynakLok, hedefLok, kaynakSirketId, hedefSirketId } = await resolveLokasyonlar(
    input.kaynakLocationId,
    input.hedefLocationId,
  );

  if (!kaynakLok || !hedefLok) {
    return {
      success: false,
      durum: 'basarisiz',
      transferRef,
      tip: 'sirket-ici',
      kabulPickingId: 0,
      message: 'Kaynak veya hedef lokasyon bulunamadı.',
    };
  }

  await resolveProductIds(input.kalemler);

  const lotHata = await assertTrackedKalemlerHaveLot(input.kalemler);
  if (lotHata) {
    return {
      success: false,
      durum: 'basarisiz',
      transferRef,
      tip: kaynakSirketId === hedefSirketId ? 'sirket-ici' : 'sirketler-arasi',
      kabulPickingId: 0,
      message: lotHata,
    };
  }

  await enrichKalemlerWithUtsFromLot(input.kalemler, kaynakSirketId);

  let sonuc: BaslatTransferSonuc;

  if (kaynakSirketId === hedefSirketId) {
    sonuc = await baslatSirketIciTransfer(
      input,
      transferRef,
      kaynakLok,
      hedefLok,
      kaynakSirketId,
    );
  } else {
    const arasi = await baslatSirketlerArasiTransfer({
      grup: input.kalemler as SirketlerArasiKalem[],
      kaynakId: input.kaynakLocationId,
      hedefId: input.hedefLocationId,
      kaynakLok,
      hedefLok,
      kaynakSirketId,
      hedefSirketId,
      transferRef,
    });

    if (arasi.durum === 'bekliyor' && arasi.kabulPickingId) {
      await postActionsBaslat(
        arasi.transferRef,
        input.kaynakLocationId,
        input.hedefLocationId,
        kaynakSirketId,
        hedefSirketId,
        input.kalemler,
        kaynakLok.name,
        hedefLok.name,
        arasi.kaynakPickingId,
      );

      sonuc = {
        success: true,
        durum: 'bekliyor',
        transferRef: arasi.transferRef,
        tip: 'sirketler-arasi',
        kabulPickingId: arasi.kabulPickingId,
        kaynakPickingId: arasi.kaynakPickingId,
        message: 'Transfer gönderildi — hedef şube kabul bekliyor.',
        detay: arasi,
      };
    } else {
      sonuc = {
        success: false,
        durum: arasi.durum === 'kismi' ? 'kismi' : 'basarisiz',
        transferRef: arasi.transferRef,
        tip: 'sirketler-arasi',
        kabulPickingId: arasi.kabulPickingId ?? 0,
        message: arasi.hata ?? arasi.manuelMudahaleMesaji ?? 'Transfer başlatılamadı.',
        detay: arasi,
      };
    }
  }

  if (input.hemenKabul && sonuc.success && sonuc.durum === 'bekliyor') {
    const kabul = await kabulEtTransfer({
      kabulPickingId: sonuc.kabulPickingId,
      transferRef: sonuc.transferRef,
      sayimlar: input.kalemler.map((k) => ({ qtyDone: k.miktar || 1 })),
    });
    if (!kabul.success) {
      return { ...sonuc, success: false, message: `${sonuc.message} (Otomatik kabul başarısız: ${kabul.message})` };
    }
    return {
      ...sonuc,
      success: true,
      message: 'Transfer başlatıldı ve otomatik kabul edildi.',
    };
  }

  return sonuc;
}

function parseTransferOrigin(origin?: string): {
  transferRef?: string;
  kaynakId?: number;
  hedefId?: number;
  kaynakSirketId?: number;
} {
  const transferRef = origin?.match(/TRANSFER-\d+/)?.[0];
  const kaynakId = Number(origin?.match(/src:(\d+)/)?.[1]);
  const hedefId = Number(origin?.match(/dst:(\d+)/)?.[1]);
  const kaynakSirketId = Number(origin?.match(/srcCo:(\d+)/)?.[1]);
  return {
    transferRef,
    kaynakId: Number.isFinite(kaynakId) ? kaynakId : undefined,
    hedefId: Number.isFinite(hedefId) ? hedefId : undefined,
    kaynakSirketId: Number.isFinite(kaynakSirketId) ? kaynakSirketId : undefined,
  };
}

/** İki adımlı transfer — hedef kabul */
export async function kabulEtTransfer(input: KabulTransferInput): Promise<KabulTransferSonuc> {
  const pickingId = input.kabulPickingId;
  if (!Number.isFinite(pickingId) || pickingId <= 0) {
    return { success: false, message: 'Geçersiz kabul picking id.' };
  }

  const pickingRows = await execute(
    'stock.picking',
    'read',
    [[pickingId]],
    { fields: ['id', 'name', 'state', 'company_id', 'location_id', 'location_dest_id', 'origin', 'note'] },
  ) as Array<{
    state?: string;
    company_id?: [number, string];
    location_id?: [number, string];
    location_dest_id?: [number, string];
    origin?: string;
    note?: string;
  }>;

  const picking = pickingRows[0];
  if (!picking) return { success: false, message: 'Picking bulunamadı.' };
  if (picking.state === 'done') {
    return { success: true, message: 'Transfer zaten tamamlanmış.', transferRef: input.transferRef };
  }
  if (picking.state === 'cancel') {
    return { success: false, message: 'Transfer iptal edilmiş.' };
  }

  const companyId = picking.company_id?.[0] ?? 0;
  const originMeta = parseTransferOrigin(picking.origin);
  const kaynakId = originMeta.kaynakId ?? picking.location_id?.[0] ?? 0;
  const hedefId = originMeta.hedefId ?? picking.location_dest_id?.[0] ?? 0;
  const transferRef = input.transferRef
    ?? originMeta.transferRef
    ?? (picking.note?.match(/TRANSFER-\d+/)?.[0])
    ?? `PICK-${pickingId}`;

  const moveLines = await execute(
    'stock.move.line',
    'search_read',
    [[['picking_id', '=', pickingId]]],
    { fields: ['product_id', 'quantity', 'lot_id'] },
    companyId,
  ) as Array<{ product_id?: [number, string]; quantity?: number; lot_id?: [number, string] }>;

  const kalemler: TransferCoreKalem[] = moveLines.map((ml) => ({
    productId: ml.product_id?.[0] ?? 0,
    resolvedProductId: ml.product_id?.[0],
    miktar: ml.quantity ?? 1,
    lotId: ml.lot_id?.[0],
  }));

  const { kaynakSirketId, hedefSirketId } = await resolveLokasyonlar(kaynakId, hedefId);
  const crossCompany = originMeta.kaynakSirketId
    ? originMeta.kaynakSirketId !== companyId
    : kaynakSirketId !== hedefSirketId;
  const effectiveKaynakSirketId = originMeta.kaynakSirketId ?? kaynakSirketId;

  if (crossCompany) {
    const arasiKabul = await kabulSirketlerArasiTransfer({
      transferRef,
      hedefPickingId: pickingId,
      hedefSirketId: companyId,
      kaynakSirketId: effectiveKaynakSirketId,
      kaynakId,
      hedefId,
      grup: kalemler as SirketlerArasiKalem[],
      sayimlar: input.sayimlar,
    });
    if (arasiKabul.durum === 'basarili') {
      await postActionsKabul(
        transferRef,
        kaynakId,
        hedefId,
        effectiveKaynakSirketId,
        companyId,
        kalemler,
      );
    }
    return {
      success: arasiKabul.durum === 'basarili',
      message: arasiKabul.durum === 'basarili'
        ? 'Transfer kabul edildi.'
        : (arasiKabul.hata ?? 'Kabul başarısız'),
      transferRef,
      detay: arasiKabul,
    };
  }

  return kabulSirketIciTransfer(
    input,
    companyId,
    kalemler,
    { transferRef, kaynakId, hedefId },
  );
}
