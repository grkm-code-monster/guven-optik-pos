// @ts-nocheck
import * as odooService from '../odoo/odoo.service';
import * as odooLocations from '../odoo/odooLocations';
import { tetikleTransferEFatura } from '../efatura/uyumsoft-efatura.service';
import { isDevMockEnabled, MOCK_BEKLEYEN, MOCK_URUN_ARA } from './transfer.mock';
/** "RAYBAN GÜNEŞ GÖZLÜĞÜ (2140, C101, 50)" → şablon adı + varyant değerleri */
function branchCodeFromLocationId(locId) {
    for (const [code, id] of Object.entries(odooLocations.LOKASYON_ID_MAP)) {
        if (id === locId)
            return code;
    }
    return 'GVN1';
}
function parseVariantDisplayName(displayName) {
    const dn = displayName.trim();
    const match = dn.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (match) {
        return {
            ad: match[1].trim(),
            varyant: match[2]
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .join(' / '),
        };
    }
    return { ad: dn, varyant: '' };
}
function mapVariantToTransferUrun(v) {
    const { ad, varyant } = parseVariantDisplayName(v.display_name);
    return {
        id: v.id,
        ad,
        varyant,
        fiyat: v.lst_price ?? null,
        lotNo: null,
        utsKodu: null,
        utsDurumu: 'BILINMIYOR',
        stok: null,
        kaynakFatura: null,
    };
}
function odooErrMessage(err) {
    if (err instanceof Error)
        return err.message;
    if (typeof err === 'object' && err && 'faultString' in err)
        return String(err.faultString);
    return String(err);
}
function logOdooError(label, err) {
    console.error(`[Odoo Hatası] ${label}:`, odooErrMessage(err), err);
}
const BEKLEYEN_PICKING_STATES = ['confirmed', 'assigned'];
async function withOdoo(label, fn, mockFallback) {
    try {
        return await fn();
    }
    catch (err) {
        logOdooError(label, err);
        if (isDevMockEnabled() && mockFallback !== undefined) {
            return mockFallback;
        }
        throw err;
    }
}
function m2oId(field) {
    if (Array.isArray(field) && typeof field[0] === 'number')
        return field[0];
    if (typeof field === 'number')
        return field;
    return null;
}
function m2oName(field) {
    if (Array.isArray(field) && typeof field[1] === 'string')
        return field[1];
    if (typeof field === 'string')
        return field;
    return '';
}
/** Çıkış deposunun Odoo "Teslimatlar" (outgoing) stock.picking.type id */
const OUTGOING_PICKING_TYPE = {
    // ADESE warehouse (id:3) → picking type id:12
    GVN1: 12,
    GVN3: 12,
    GVN4: 12,
    GVN6: 12,
    GVN8: 12,
    GVN9: 12,
    // NG warehouse (id:2) → picking type id:7
    GVN2: 7,
    GVN10: 7,
    ANADEPO: 7,
    // POTENTIAL warehouse (id:4) → picking type id:17
    GVN5: 17,
};
function buildPickingNote(personel, userNote) {
    const trimmed = (userNote ?? '').trim();
    return trimmed ? `Personel: ${personel}\nNot: ${trimmed}` : `Personel: ${personel}`;
}
function parsePersonelFromNote(note) {
    if (!note)
        return 'Bilinmiyor';
    const clean = String(note)
        .replace(/<[^>]+>/g, '')
        .trim();
    const match = clean.match(/Personel:\s*(.+?)(\n|$)/i);
    return match ? match[1].trim() : 'Bilinmiyor';
}
function getPickingTypeId(cikisLokasyon) {
    const key = String(cikisLokasyon ?? '').trim();
    const pickingTypeId = OUTGOING_PICKING_TYPE[key] ?? OUTGOING_PICKING_TYPE[key.toUpperCase()];
    if (!pickingTypeId) {
        throw new Error(`Picking type bulunamadı: ${cikisLokasyon}`);
    }
    return pickingTypeId;
}
async function getLotId(lotNo, productId, companyId) {
    const name = lotNo.trim();
    if (!name)
        return null;
    const lots = (await odooService.execute('stock.lot', 'search_read', [[['name', '=', name], ['product_id', '=', productId]]], { fields: ['id'], limit: 1 }, companyId));
    if (lots?.length)
        return lots[0].id;
    return odooService.execute('stock.lot', 'create', [{ name, product_id: productId }], {}, companyId);
}
async function resolveProductId(rawId, companyId) {
    const id = Number(rawId);
    if (!Number.isFinite(id))
        throw new Error(`Geçersiz ürün id: ${rawId}`);
    const asProduct = (await odooService.execute('product.product', 'search_read', [[['id', '=', id]]], { fields: ['id'], limit: 1 }, companyId));
    if (asProduct?.length)
        return asProduct[0].id;
    const variants = (await odooService.execute('product.product', 'search_read', [[['product_tmpl_id', '=', id]]], { fields: ['id'], limit: 1 }, companyId));
    if (variants?.length)
        return variants[0].id;
    throw new Error(`Ürün bulunamadı (id=${id})`);
}
async function getProductUomId(productId, companyId) {
    const rows = (await odooService.execute('product.product', 'read', [[productId]], { fields: ['uom_id'] }, companyId));
    const uomId = m2oId(rows?.[0]?.uom_id);
    if (!uomId)
        throw new Error(`Ürün UoM bulunamadı (product=${productId})`);
    return uomId;
}
async function mapQuantToUrun(q, companyId) {
    const productId = m2oId(q.product_id) ?? 0;
    const lotId = m2oId(q.lot_id);
    let kaynakFatura = null;
    if (lotId) {
        try {
            const moveLines = (await odooService.execute('stock.move.line', 'search_read', [[['lot_id', '=', lotId], ['state', '=', 'done']]], { fields: ['move_id'], limit: 1, order: 'id asc' }, companyId));
            const moveId = m2oId(moveLines?.[0]?.move_id);
            if (moveId) {
                const moves = (await odooService.execute('stock.move', 'read', [[moveId]], { fields: ['origin'] }, companyId));
                kaynakFatura = moves?.[0]?.origin ?? null;
            }
        }
        catch {
            kaynakFatura = null;
        }
    }
    let utsKodu = q.x_uts_kodu ?? null;
    let utsDurumu = q.x_uts_durumu ?? 'BEKLEMEDE';
    if (lotId && (!utsKodu || utsDurumu === 'BEKLEMEDE')) {
        try {
            const lots = (await odooService.execute('stock.lot', 'read', [[lotId]], { fields: ['x_uts_kodu', 'x_uts_durumu', 'x_uts_mi'] }, companyId));
            const lot = lots?.[0];
            if (lot) {
                utsKodu = lot.x_uts_kodu ?? utsKodu;
                utsDurumu = lot.x_uts_durumu ?? (lot.x_uts_mi ? 'ALINDI' : utsDurumu);
            }
        }
        catch {
            // optional custom fields
        }
    }
    return {
        id: productId,
        ad: m2oName(q.product_id),
        varyant: lotId ? m2oName(q.lot_id) : '',
        lotNo: lotId ? m2oName(q.lot_id) : null,
        utsKodu,
        utsDurumu,
        stok: Number(q.quantity ?? q.available_quantity ?? 0),
        kaynakFatura,
    };
}
/** Frontend kategori kodu → Odoo product.category id */
export const KATEGORI_ID_MAP: Record<string, number> = {
    gunes_gozlugu: 7,
    optik_cerceve: 6,
    optik_cam: 4,
    lens: 5,
    aksesuar: 8,
    solusyon: 51,
    solüsyon: 51,
};
export function resolveKategoriId(kategori) {
    const key = String(kategori ?? '').trim().toLowerCase();
    if (!key)
        return null;
    return KATEGORI_ID_MAP[key] ?? null;
}
export function resolveSearchKategoriId(options) {
    const rawId = options?.kategoriId;
    if (rawId != null && Number.isFinite(rawId) && rawId > 0) {
        return rawId;
    }
    return resolveKategoriId(options?.kategori);
}
export async export function searchUrun(q, yontem, lokasyon, options) {
    const term = q.trim();
    if (term.length < 3)
        return [];
    return withOdoo('urun-ara', async () => {
        const lokasyonId = await odooLocations.getLokasyonId(lokasyon);
        if (!lokasyonId)
            throw new Error(`Lokasyon bulunamadı: ${lokasyon}`);
        const companyId = odooLocations.getCompanyIdFromLokasyon(lokasyon);
        if (!companyId)
            throw new Error(`Lokasyon şirketi tanımsız: ${lokasyon}`);
        if (yontem === 'ad') {
            const kategoriId = resolveSearchKategoriId(options);
            const domain = [['name', 'ilike', term]];
            const ids = options?.kategoriIds;
            if (ids && ids.length > 0) {
                if (ids.length === 1) {
                    domain.push(['categ_id', 'child_of', ids[0]]);
                }
                else {
                    domain.push(['categ_id', 'in', ids]);
                }
            }
            else if (kategoriId != null) {
                domain.push(['categ_id', 'child_of', kategoriId]);
            }
            const variants = (await odooService.execute('product.product', 'search_read', [domain], {
                fields: ['id', 'display_name', 'lst_price'],
                limit: 20,
            }, companyId));
            const results = [...(variants ?? [])];

            // Nitelik değerlerinde de ara — model no, renk kodu gibi
            const attrDomain: any[] = [
                ['product_template_attribute_value_ids.name', 'ilike', term],
                ['active', '=', true],
                ['type', 'in', ['product', 'consu']],
            ];
            if (companyId) attrDomain.push(['company_id', 'in', [false, companyId]]);

            try {
                const attrResults = await odooService.execute('product.product', 'search_read',
                    [attrDomain],
                    { fields: ['id', 'name', 'display_name', 'default_code', 'barcode', 'list_price', 'lst_price', 'standard_price', 'tracking', 'product_tmpl_id'], limit: 100 },
                    companyId);

                for (const v of attrResults ?? []) {
                    if (!results.find((r: any) => r.id === v.id)) {
                        results.push({
                            ...v,
                            display_name: v.display_name ?? v.name,
                            lst_price: v.lst_price ?? v.list_price ?? null,
                        });
                    }
                }
            } catch { }

            return results.map(mapVariantToTransferUrun);
        }
        let productIds = [];
        let lotIds = [];
        if (yontem === 'barkod') {
            const products = (await odooService.execute('product.product', 'search_read', [[['barcode', '=', term]]], { fields: ['id'], limit: 5 }, companyId));
            productIds = (products ?? []).map((p) => p.id);
        }
        else if (yontem === 'uts') {
            const lots = (await odooService.execute('stock.lot', 'search_read', [[['x_uts_kodu', '=', term]]], { fields: ['id', 'product_id'], limit: 20 }, companyId));
            lotIds = (lots ?? []).map((l) => l.id);
            productIds = (lots ?? []).map((l) => m2oId(l.product_id)).filter((x) => x !== null);
        }
        else if (yontem === 'lot') {
            const lots = (await odooService.execute('stock.lot', 'search_read', [[['name', 'ilike', term]]], { fields: ['id', 'product_id'], limit: 20 }, companyId));
            lotIds = (lots ?? []).map((l) => l.id);
            productIds = (lots ?? []).map((l) => m2oId(l.product_id)).filter((x) => x !== null);
        }
        else if (yontem === 'ref') {
            const lots = (await odooService.execute('stock.lot', 'search_read', [[['ref', 'ilike', term]]], { fields: ['id', 'product_id'], limit: 20 }, companyId));
            lotIds = (lots ?? []).map((l) => l.id);
            productIds = (lots ?? []).map((l) => m2oId(l.product_id)).filter((x) => x !== null);
            if (!productIds.length) {
                const products = (await odooService.execute('product.product', 'search_read', [[['default_code', 'ilike', term]]], { fields: ['id'], limit: 10 }, companyId));
                productIds = (products ?? []).map((p) => p.id);
            }
        }
        else {
            const products = (await odooService.execute('product.product', 'search_read', [[['name', 'ilike', term]]], { fields: ['id'], limit: 10 }, companyId));
            productIds = (products ?? []).map((p) => p.id);
        }
        const quantDomain = [
            ['location_id', '=', lokasyonId],
            ['quantity', '>', 0],
        ];
        if (lotIds.length)
            quantDomain.push(['lot_id', 'in', lotIds]);
        else if (productIds.length)
            quantDomain.push(['product_id', 'in', productIds]);
        else
            return [];
        const quantFields = ['product_id', 'lot_id', 'quantity', 'available_quantity'];
        let quantlar = [];
        try {
            quantlar = (await odooService.execute('stock.quant', 'search_read', [quantDomain], { fields: [...quantFields, 'x_uts_kodu', 'x_uts_durumu'], limit: 10 }, companyId));
        }
        catch {
            quantlar = (await odooService.execute('stock.quant', 'search_read', [quantDomain], { fields: quantFields, limit: 10 }, companyId));
        }
        const sonuclar = [];
        for (const row of quantlar ?? []) {
            sonuclar.push(await mapQuantToUrun(row, companyId));
        }
        return sonuclar;
    }, MOCK_URUN_ARA);
}
export async function searchUrunAkilli(term: string, lokasyon: string, companyId?: number) {
  const yontemler = ['barkod', 'uts', 'lot', 'ref', 'ad']
  for (const yontem of yontemler) {
    const results = await searchUrun(term, yontem, lokasyon, {}, companyId)
    if (results && results.length > 0) {
      return { results, yontem }
    }
  }
  return { results: [], yontem: null }
}
export async export function createTransfer(input) {
    const cikisSirket = odooLocations.getLokasyonSirket(input.cikisLokasyon);
    const girisSirket = odooLocations.getLokasyonSirket(input.girisLokasyon);
    if (!cikisSirket || !girisSirket) {
        return {
            success: false,
            error: 'LOKASYON_SIRKET',
            message: `Lokasyon şirketi tanımsız: ${!cikisSirket ? input.cikisLokasyon : input.girisLokasyon}`,
        };
    }
    if (cikisSirket !== girisSirket) {
        return {
            success: false,
            error: 'SIRKETLER_ARASI',
            message: 'Şirketler arası transfer şu an manuel yapılmalıdır. Odoo Enterprise gerektirir.',
        };
    }
    const companyId = odooLocations.getCompanyIdFromLokasyon(input.cikisLokasyon);
    if (!companyId) {
        return {
            success: false,
            error: 'LOKASYON_SIRKET',
            message: `Çıkış lokasyonu şirketi tanımsız: ${input.cikisLokasyon}`,
        };
    }
    return withOdoo('olustur', async () => {
        const cikisId = await odooLocations.getLokasyonId(input.cikisLokasyon);
        const girisId = await odooLocations.getLokasyonId(input.girisLokasyon);
        if (!cikisId || !girisId) {
            return { success: false, message: 'Lokasyon bulunamadı', error: 'LOKASYON_BULUNAMADI' };
        }
        const pickingTypeId = getPickingTypeId(input.cikisLokasyon);
        const pickingId = await odooService.execute('stock.picking', 'create', [
            {
                picking_type_id: pickingTypeId,
                location_id: cikisId,
                location_dest_id: girisId,
                scheduled_date: input.tarih,
                origin: input.referans || '',
                note: buildPickingNote(input.personel, input.not),
            },
        ], {}, companyId);
        for (const urun of input.urunler ?? []) {
            try {
                const productId = await resolveProductId(urun.id, companyId);
                const uomId = await getProductUomId(productId, companyId);
                const qty = Math.max(1, Number(urun.adet ?? 1));
                const moveId = await odooService.execute('stock.move', 'create', [
                    {
                        picking_id: pickingId,
                        product_id: productId,
                        product_uom_qty: qty,
                        product_uom: uomId,
                        name: urun.ad,
                        location_id: cikisId,
                        location_dest_id: girisId,
                        company_id: companyId,
                    },
                ], {}, companyId);
                if (urun.lotNo) {
                    const lotId = await getLotId(urun.lotNo, productId, companyId);
                    if (lotId) {
                        await odooService.execute('stock.move.line', 'create', [
                            {
                                move_id: moveId,
                                picking_id: pickingId,
                                product_id: productId,
                                lot_id: lotId,
                                quantity: qty,
                                location_id: cikisId,
                                location_dest_id: girisId,
                                company_id: companyId,
                            },
                        ], {}, companyId);
                    }
                }
            }
            catch (err) {
                console.error('[transfer/olustur] stock.move / move.line:', odooErrMessage(err), err);
                throw err;
            }
        }
        try {
            await odooService.execute('stock.picking', 'action_confirm', [[pickingId]], {}, companyId);
        }
        catch (err) {
            console.error('[transfer/olustur] action_confirm:', odooErrMessage(err), err);
        }
        try {
            await odooService.execute('stock.picking', 'action_assign', [[pickingId]], {}, companyId);
        }
        catch (err) {
            const msg = odooErrMessage(err);
            if (msg.includes('kontrol edebilecek')) {
                // Ürünsüz transfer — rezerve edilecek satır yok, normal
            }
            else {
                console.error('[transfer/olustur] action_assign:', msg, err);
            }
        }
        let refNo = String(pickingId);
        try {
            const picking = (await odooService.execute('stock.picking', 'read', [[pickingId]], { fields: ['name'] }, companyId));
            refNo = picking?.[0]?.name ?? refNo;
        }
        catch (err) {
            console.error('[transfer/olustur] stock.picking read:', odooErrMessage(err), err);
        }
        return {
            success: true,
            transferId: pickingId,
            refNo,
            odooPickingId: pickingId,
        };
    });
}
export async export function listBekleyen(lokasyon) {
    return withOdoo('bekleyen', async () => {
        const lokasyonId = await odooLocations.getLokasyonId(lokasyon);
        if (!lokasyonId)
            throw new Error(`Lokasyon bulunamadı: ${lokasyon}`);
        const companyId = odooLocations.getCompanyIdFromLokasyon(lokasyon);
        if (!companyId)
            throw new Error(`Lokasyon şirketi tanımsız: ${lokasyon}`);
        const pickingFields = [
            'id',
            'name',
            'location_id',
            'location_dest_id',
            'scheduled_date',
            'origin',
            'note',
            'move_line_ids',
            'state',
        ];
        const pickinglar = (await odooService.execute('stock.picking', 'search_read', [
            [
                ['location_dest_id', '=', lokasyonId],
                ['state', 'in', BEKLEYEN_PICKING_STATES],
            ],
        ], { fields: pickingFields, limit: 50, order: 'scheduled_date desc' }, companyId));
        const transferler = await Promise.all((pickinglar ?? []).map(async (p) => {
            const moveLineFields = [
                'id',
                'product_id',
                'lot_id',
                'quantity',
                'product_uom_id',
                'x_uts_kodu',
                'x_uts_durumu',
            ];
            let moveLines = [];
            try {
                moveLines = (await odooService.execute('stock.move.line', 'search_read', [[['picking_id', '=', p.id]]], { fields: moveLineFields }, companyId));
            }
            catch (err) {
                console.error('[transfer/bekleyen] stock.move.line search_read:', odooErrMessage(err), err);
                moveLines = (await odooService.execute('stock.move.line', 'search_read', [[['picking_id', '=', p.id]]], { fields: ['id', 'product_id', 'lot_id', 'quantity', 'product_uom_id'] }, companyId));
            }
            return {
                transferId: p.id,
                refNo: p.name,
                tarih: p.scheduled_date,
                gonderen: m2oName(p.location_id),
                alici: m2oName(p.location_dest_id),
                personel: parsePersonelFromNote(p.note),
                durum: p.state,
                urunler: (moveLines ?? []).map((ml) => {
                    const qty = Number(ml.quantity ?? 0) || 1;
                    return {
                        moveLineId: ml.id,
                        id: m2oId(ml.product_id),
                        ad: m2oName(ml.product_id),
                        varyant: '',
                        lotNo: ml.lot_id ? m2oName(ml.lot_id) : null,
                        beklenenAdet: qty,
                        sayilanAdet: qty,
                        utsKodu: ml.x_uts_kodu ?? null,
                        utsDurumu: ml.x_uts_durumu ?? 'BEKLEMEDE',
                    };
                }),
            };
        }));
        return transferler;
    }, MOCK_BEKLEYEN.filter((t) => {
        const alici = String(t.alici ?? '').toUpperCase();
        return alici === lokasyon.toUpperCase() || alici.includes(lokasyon.toUpperCase());
    }));
}
function validatePickingKwargs(companyId) {
    return {
        context: {
            skip_backorder: true,
            skip_immediate: true,
            allowed_company_ids: [...odooService.ODOO_ALL_COMPANY_IDS],
            force_company: companyId,
        },
    };
}
async function validatePicking(pickingId, companyId) {
    const validateKwargs = validatePickingKwargs(companyId);
    try {
        console.log('[kabul] button_validate companyId:', companyId);
        await odooService.execute('stock.picking', 'button_validate', [[pickingId]], validateKwargs, companyId);
        return;
    }
    catch (err) {
        const msg = odooErrMessage(err).toLowerCase();
        if (!msg.includes('immediate') && !msg.includes('backorder') && !msg.includes('wizard')) {
            throw err;
        }
    }
    try {
        const wizId = await odooService.execute('stock.immediate.transfer', 'create', [{ pick_ids: [[6, 0, [pickingId]]] }], {}, companyId);
        await odooService.execute('stock.immediate.transfer', 'process', [[wizId]], {}, companyId);
        return;
    }
    catch {
        // fallback: skip wizard via context if supported
    }
    await odooService.execute('stock.picking', 'button_validate', [[pickingId]], validateKwargs, companyId);
}
export async export function acceptTransfer(transferId, sayimlar) {
    const pickingId = Number(transferId);
    if (!Number.isFinite(pickingId)) {
        return { success: false, message: `Geçersiz transfer id: ${transferId}` };
    }
    return withOdoo('kabul', async () => {
        let companyId;
        try {
            const pickingRows = (await odooService.execute('stock.picking', 'read', [[pickingId]], {
                fields: ['company_id'],
            }));
            companyId = m2oId(pickingRows?.[0]?.company_id) ?? 0;
            console.log('[kabul] picking company_id raw:', pickingRows?.[0]?.company_id);
            if (!companyId) {
                return { success: false, message: 'Picking şirketi bulunamadı' };
            }
            const creds = odooService.getOdooCredentials(companyId);
            console.log('[kabul] odoo uid:', creds.uid, 'company_id:', companyId);
        }
        catch (err) {
            return { success: false, message: odooErrMessage(err) };
        }
        let moveLines = [];
        try {
            console.log('[kabul] company_id:', companyId);
            console.log('[kabul] move line query with context');
            moveLines = (await odooService.execute('stock.move.line', 'search_read', [[['picking_id', '=', pickingId]]], { fields: ['id', 'product_id', 'quantity'], context: odooService.buildOdooCompanyContext(companyId) }, companyId));
        }
        catch (err) {
            return { success: false, message: odooErrMessage(err) };
        }
        const updates = [];
        for (let i = 0; i < (sayimlar ?? []).length; i++) {
            const s = sayimlar[i] ?? {};
            const qtyDone = Number(s.qtyDone ?? s.sayilanAdet ?? s.beklenenAdet ?? 0);
            let moveLineId = Number(s.moveLineId);
            if (!Number.isFinite(moveLineId) && moveLines[i]) {
                moveLineId = moveLines[i].id;
            }
            if (!Number.isFinite(moveLineId)) {
                const productId = Number(s.id ?? m2oId(s.product_id));
                const hit = moveLines.find((ml) => m2oId(ml.product_id) === productId);
                if (hit)
                    moveLineId = hit.id;
            }
            if (Number.isFinite(moveLineId)) {
                updates.push({ moveLineId, qtyDone });
            }
        }
        if (!updates.length && moveLines.length) {
            for (const ml of moveLines) {
                const qty = Number(ml.quantity ?? 0);
                updates.push({ moveLineId: ml.id, qtyDone: qty || 0 });
            }
        }
        for (const u of updates) {
            console.log('[kabul] move.line write', u.moveLineId, 'qty', u.qtyDone, 'companyId', companyId);
            await odooService.execute('stock.move.line', 'write', [[u.moveLineId], { quantity: u.qtyDone }], {}, companyId);
        }
        await validatePicking(pickingId, companyId);
        const linesAfter = (await odooService.execute('stock.move.line', 'search_read', [[['picking_id', '=', pickingId]]], { fields: ['lot_id', 'location_dest_id'] }, companyId));
        for (const ml of linesAfter ?? []) {
            const lotId = m2oId(ml.lot_id);
            if (!lotId)
                continue;
            try {
                console.log('[kabul] stock.lot write', lotId, 'companyId', companyId);
                await odooService.execute('stock.lot', 'write', [[lotId], { x_uts_durumu: 'MAGAZADA' }], {}, companyId);
            }
            catch {
                // custom field may not exist
            }
        }
        let branchCode = 'GVN1';
        try {
            const pickingDetail = (await odooService.execute('stock.picking', 'read', [[pickingId]], { fields: ['location_dest_id'] }, companyId));
            const destId = m2oId(pickingDetail?.[0]?.location_dest_id);
            if (destId)
                branchCode = branchCodeFromLocationId(destId);
        }
        catch {
            // optional
        }
        tetikleTransferEFatura(pickingId, branchCode).catch((err) => {
            console.error('[e-Fatura] Transfer kabul tetikleme:', err);
        });
        return { success: true, transferId: pickingId };
    });
}
export async export function reportTransferIssue(transferId, not) {
    const pickingId = Number(transferId);
    if (!Number.isFinite(pickingId)) {
        return { success: false, message: `Geçersiz transfer id: ${transferId}` };
    }
    return withOdoo('sorun', async () => {
        await odooService.execute('stock.picking', 'message_post', [[pickingId]], {
            body: `SORUN BİLDİRİLDİ: ${not || '(not yok)'}`,
            message_type: 'comment',
        });
        try {
            await odooService.execute('stock.picking', 'write', [[pickingId], { x_transfer_durum: 'sorunlu' }]);
        }
        catch {
            // optional custom field
        }
        return { success: true };
    });
}
export async export function debugLokasyonMap() {
    const map = await odooLocations.getLokasyonMap(true);
    return map;
}
