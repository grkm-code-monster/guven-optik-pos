import { execute, ODOO_ALL_COMPANY_IDS } from './odoo.service';

/** Stok quant kaydı satışın şirketinden farklı company_id altında olsa bile
 *  rezervasyon/teslimat işleminin görebilmesi için tüm şirketleri izinli kıl. */
function allCompaniesValidateKwargs(companyId: number) {
  return {
    context: {
      skip_backorder: true,
      skip_immediate: true,
      // 03.11.2026 — stock_sms: telefonu olan müşteride button_validate "SMS gönderilsin mi?"
      // sihirbazını DÖNDÜRÜP teslimatı yarıda bırakıyordu (hata da vermiyordu). 207 satış stoktan düşmedi.
      skip_sms: true,
      allowed_company_ids: [...ODOO_ALL_COMPANY_IDS],
      force_company: companyId,
    },
  };
}

/** Şirketin varsayılan deposu (stock.warehouse) */
export async function resolveWarehouseIdForCompany(companyId: number): Promise<number | null> {
  const rows = await execute(
    'stock.warehouse',
    'search_read',
    [[['company_id', '=', companyId]]],
    { fields: ['id'], limit: 1 },
    companyId,
  );
  return rows?.[0]?.id ?? null;
}

export type PickingValidateResult = {
  ok: boolean;
  errors: string[];
  /** Stok bulunamadığı için "STOKSUZ-…" yer tutucu lotla eksiye düşülen kalemler (uyarı). */
  stoksuz: string[];
};

/** POS'ta satılan kalem: hangi ürün, hangi lot/UTS (biliniyorsa), kaç adet. */
export type SatilanLot = { productId: number; lotNo: string | null; qty: number };

export type KalemPlani = {
  moveId: number;
  urun: string;
  adet: number;
  /** her satır: lot adı + kaynağı: POS (satılan lot) | AYRILMIŞ (Odoo'nun ayırdığı) | STOK (şubedeki serbest lot) | STOKSUZ (yer tutucu, eksiye düşer) | LOTSUZ */
  satirlar: { lotId: number | null; lotAdi: string; qty: number; kaynak: 'POS' | 'AYRILMIŞ' | 'STOK' | 'STOKSUZ' | 'LOTSUZ' }[];
};

/**
 * 03.11.2026 — "Satılan her şey stoktan düşsün, parçalı bile" (Görkem).
 * Bir satış teslimatını ZORLA tamamlar:
 *  - Takipsiz ürün: istenen miktar yazılır.
 *  - Lot/seri takipli ürün: önce POS'ta SATILAN lot (SaleItem.lotNo), yoksa Odoo'nun ayırdığı lot,
 *    yoksa şubedeki serbest bir lot; hiçbiri yoksa "STOKSUZ-<belge>-<kalem>" adlı yer tutucu lot
 *    oluşturulup eksiye düşülür (stok raporunda görünür, sayımda düzeltilir).
 *  - SMS / backorder sihirbazları atlanır; belge 'done' olmazsa HATA fırlatılır (sessiz geçmez).
 * uygula=false → hiçbir şey yazmaz, sadece planı döndürür.
 */
export async function zorlaTeslimEt(
  pickingId: number,
  companyId: number,
  satilanLotlar: SatilanLot[],
  uygula: boolean,
): Promise<{ plan: KalemPlani[]; durum: string }> {
  const kw = allCompaniesValidateKwargs(companyId);
  const [pk] = await execute('stock.picking', 'read', [[pickingId]],
    { fields: ['id', 'name', 'state', 'location_id', 'location_dest_id', 'move_ids'] }, companyId);
  if (!pk) throw new Error(`teslimat #${pickingId} bulunamadı`);
  if (['done', 'cancel'].includes(pk.state)) return { plan: [], durum: pk.state };
  if (uygula) {
    try { await execute('stock.picking', 'action_assign', [[pickingId]], kw, companyId); } catch { /* stok yoksa ayırma yapamaz — aşağıda zorlanır */ }
  }
  const moves = (await execute('stock.move', 'read', [pk.move_ids],
    { fields: ['id', 'product_id', 'product_uom_qty', 'product_uom', 'has_tracking', 'move_line_ids', 'location_id', 'location_dest_id', 'state'] }, companyId)) as any[];
  const tumMl = moves.flatMap((m) => m.move_line_ids);
  const mls = tumMl.length ? (await execute('stock.move.line', 'read', [tumMl], { fields: ['id', 'move_id', 'lot_id', 'quantity'] }, companyId)) as any[] : [];
  const kalanPos = satilanLotlar.map((x) => ({ ...x }));
  const kullanilan = new Set<number>();
  const plan: KalemPlani[] = [];

  for (const m of moves) {
    if (['done', 'cancel'].includes(m.state)) continue;
    const need = Math.round(Number(m.product_uom_qty));
    const pid = m.product_id[0];
    const benim = mls.filter((l) => l.move_id[0] === m.id);
    const kp: KalemPlani = { moveId: m.id, urun: m.product_id[1], adet: need, satirlar: [] };
    plan.push(kp);
    if (m.has_tracking === 'none') {
      kp.satirlar.push({ lotId: null, lotAdi: '-', qty: need, kaynak: 'LOTSUZ' });
    } else {
      let kalan = need;
      // 1) POS'ta satılan lot
      for (const x of kalanPos.filter((y) => y.productId === pid && y.lotNo && y.qty > 0)) {
        if (kalan <= 0) break;
        const bul = async (dom: any[]) => (await execute('stock.lot', 'search_read', [[['product_id', '=', pid], ...dom, '|', ['company_id', '=', companyId], ['company_id', '=', false]]], { fields: ['id', 'name'], limit: 1 }, companyId)) as any[];
        const lot = (await bul([['name', '=', x.lotNo]]))[0] ?? (await bul([['x_uts_kodu', '=', x.lotNo]]))[0];
        if (!lot || kullanilan.has(lot.id)) continue;
        const q = Math.min(kalan, x.qty); x.qty -= q; kalan -= q; kullanilan.add(lot.id);
        kp.satirlar.push({ lotId: lot.id, lotAdi: lot.name, qty: q, kaynak: 'POS' });
      }
      // 2) Odoo'nun zaten ayırdığı lot
      for (const l of benim.filter((y) => y.lot_id && y.quantity > 0)) {
        if (kalan <= 0) break;
        if (kullanilan.has(l.lot_id[0])) continue;
        const q = Math.min(kalan, l.quantity); kalan -= q; kullanilan.add(l.lot_id[0]);
        kp.satirlar.push({ lotId: l.lot_id[0], lotAdi: l.lot_id[1], qty: q, kaynak: 'AYRILMIŞ' });
      }
      // 3) şubedeki serbest lot
      if (kalan > 0) {
        const qs = (await execute('stock.quant', 'search_read', [[['product_id', '=', pid], ['location_id', '=', m.location_id[0]], ['lot_id', '!=', false], ['quantity', '>', 0]]],
          { fields: ['lot_id', 'quantity', 'reserved_quantity'], order: 'in_date' }, companyId)) as any[];
        for (const qt of qs) {
          if (kalan <= 0) break;
          const serbest = qt.quantity - qt.reserved_quantity;
          if (serbest <= 0 || kullanilan.has(qt.lot_id[0])) continue;
          const q = Math.min(kalan, serbest); kalan -= q; kullanilan.add(qt.lot_id[0]);
          kp.satirlar.push({ lotId: qt.lot_id[0], lotAdi: qt.lot_id[1], qty: q, kaynak: 'STOK' });
        }
      }
      // 4) hiçbiri yok → yer tutucu lot (eksi stok)
      for (let i = 0; kalan > 0; i++) {
        const q = m.has_tracking === 'serial' ? 1 : kalan; kalan -= q;
        kp.satirlar.push({ lotId: null, lotAdi: `STOKSUZ-${pk.name.replace(/\//g, '')}-${m.id}${i ? '-' + (i + 1) : ''}`, qty: q, kaynak: 'STOKSUZ' });
      }
    }
    if (!uygula) continue;
    // eski (ayrılmış) satırları kaldır, planı yaz
    if (benim.length) await execute('stock.move.line', 'unlink', [benim.map((l) => l.id)], {}, companyId);
    for (const st of kp.satirlar) {
      if (st.kaynak === 'STOKSUZ') {
        st.lotId = Number(await execute('stock.lot', 'create', [{ name: st.lotAdi, product_id: pid, company_id: companyId }], {}, companyId));
      }
      await execute('stock.move.line', 'create', [{
        move_id: m.id, picking_id: pickingId, product_id: pid, product_uom_id: m.product_uom[0],
        location_id: m.location_id[0], location_dest_id: m.location_dest_id[0],
        quantity: st.qty, picked: true, ...(st.lotId ? { lot_id: st.lotId } : {}),
      }], kw, companyId);
    }
    await execute('stock.move', 'write', [[m.id], { picked: true }], kw, companyId);
  }
  if (!uygula) return { plan, durum: pk.state };

  const sonuc = await execute('stock.picking', 'button_validate', [[pickingId]], kw, companyId);
  const [son] = await execute('stock.picking', 'read', [[pickingId]], { fields: ['state'] }, companyId);
  if (son?.state !== 'done') {
    const sihirbaz = sonuc && typeof sonuc === 'object' ? ` (Odoo onay penceresi: ${sonuc.res_model ?? sonuc.name ?? '?'})` : '';
    throw new Error(`teslimat tamamlanmadı, durum: ${son?.state ?? '?'}${sihirbaz}`);
  }
  return { plan, durum: 'done' };
}

/** Satış onayı sonrası picking kaynak lokasyonunu şube stoğuna çevirip teslim eder (zorla, lot bilgisiyle). */
export async function validateSalePickingsFromBranch(
  odooOrderId: number,
  stockLocationId: number,
  companyId: number,
  satilanLotlar: SatilanLot[] = [],
): Promise<PickingValidateResult> {
  const errors: string[] = [];
  const stoksuz: string[] = [];
  const pickings = await execute(
    'stock.picking',
    'search_read',
    [[['sale_id', '=', odooOrderId], ['state', 'not in', ['done', 'cancel']]]],
    { fields: ['id', 'state', 'name'], limit: 10 },
    companyId,
  );

  for (const picking of pickings ?? []) {
    try {
      await execute('stock.picking', 'write', [[picking.id], { location_id: stockLocationId }], {}, companyId);
      const moveIds = await execute('stock.move', 'search', [[['picking_id', '=', picking.id]]], {}, companyId);
      if (moveIds?.length) {
        await execute('stock.move', 'write', [moveIds, { location_id: stockLocationId }], {}, companyId);
      }
      const { plan } = await zorlaTeslimEt(picking.id, companyId, satilanLotlar, true);
      for (const k of plan) for (const st of k.satirlar) if (st.kaynak === 'STOKSUZ') stoksuz.push(`${k.urun} (şube stoğunda yoktu, eksiye düşüldü)`);
    } catch (err) {
      const msg = `${picking.name ?? picking.id}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      console.error('[Odoo] Teslimat hatası:', msg);
    }
  }

  return { ok: errors.length === 0, errors, stoksuz };
}
