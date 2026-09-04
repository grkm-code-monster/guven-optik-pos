// @ts-nocheck
import * as odooService from '../odoo/odoo.service';
import * as odooLocations from '../odoo/odooLocations';
import { normalizeTransferSearchTerm } from '../odoo/gs1-parser.util';
import { kabulEtTransfer, baslatTransfer } from './transfer-core.service';
import { isDevMockEnabled } from './transfer.mock';
import { mapWithConcurrency } from '../../utils/map-with-concurrency';

const ODOO_SEARCH_CONCURRENCY = 6;
const SIRKET_SEARCH_IDS = [1, 2, 3, 4];
function transferUrunDedupKey(u) {
    return `${u.id}|${u.lotId ?? ''}|${u.lotNo ?? ''}|${u.varyant ?? ''}`;
}
function dedupeTransferUrunResults(list) {
    const seen = new Set();
    const out = [];
    for (const u of list ?? []) {
        const key = transferUrunDedupKey(u);
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(u);
    }
    return out;
}
function dedupeVariantEntries(variants) {
    const seen = new Set();
    const out = [];
    for (const v of variants ?? []) {
        const key = stokMapKey(v.id, v._cid);
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}
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
function ptavValueLabel(ptav) {
    const name = String(ptav?.name ?? '').trim();
    if (name)
        return name;
    const full = m2oName(ptav?.product_attribute_value_id);
    if (full.includes(':'))
        return full.split(':').slice(1).join(':').trim();
    return full;
}
function buildVaryantFromPtav(ptavIds, ptavMap) {
    if (!ptavIds?.length || !ptavMap?.size)
        return '';
    const parts = [];
    for (const id of ptavIds) {
        const ptav = ptavMap.get(id);
        if (!ptav)
            continue;
        const label = ptavValueLabel(ptav);
        if (label)
            parts.push(label);
    }
    return parts.join(' / ');
}
async function fetchPtavMap(ptavIds, companyId) {
    const uniqueIds = [...new Set((ptavIds ?? []).filter((id) => Number.isFinite(id) && id > 0))];
    if (!uniqueIds.length)
        return new Map();
    try {
        const ptavs = (await odooService.execute('product.template.attribute.value', 'read', [uniqueIds], {
            fields: ['id', 'name', 'attribute_id', 'product_attribute_value_id'],
        }, companyId)) ?? [];
        const map = new Map();
        for (const p of ptavs) {
            map.set(p.id, p);
        }
        return map;
    }
    catch (err) {
        logOdooError('PTAV read', err);
        return new Map();
    }
}
async function fetchPtavMapForVariants(variants, defaultCompanyId) {
    const idsByCompany = new Map();
    for (const entry of variants) {
        const cid = entry._cid ?? defaultCompanyId;
        for (const id of entry.product_template_attribute_value_ids ?? []) {
            if (!idsByCompany.has(cid))
                idsByCompany.set(cid, new Set());
            idsByCompany.get(cid).add(id);
        }
    }
    const ptavMap = new Map();
    for (const [cid, idSet] of idsByCompany) {
        const sub = await fetchPtavMap([...idSet], cid);
        for (const [k, v] of sub)
            ptavMap.set(k, v);
    }
    return ptavMap;
}
function stokMapKey(productId, companyId) {
    return companyId != null ? `${companyId}:${productId}` : String(productId);
}
function readStokFromMap(stokMap, productId, companyId) {
    if (!stokMap?.size)
        return null;
    const composite = stokMapKey(productId, companyId);
    if (stokMap.has(composite))
        return stokMap.get(composite);
    if (stokMap.has(productId))
        return stokMap.get(productId);
    return null;
}
async function fetchStokMapForProducts(entries, lokasyon) {
    const stokMap = new Map();
    if (!lokasyon || !entries?.length)
        return stokMap;
    const lokasyonId = await odooLocations.getLokasyonId(lokasyon);
    if (!lokasyonId)
        return stokMap;
    const idsByCompany = new Map();
    for (const entry of entries) {
        const productId = entry?.id;
        const companyId = entry?._cid;
        if (!productId || !companyId)
            continue;
        if (!idsByCompany.has(companyId))
            idsByCompany.set(companyId, new Set());
        idsByCompany.get(companyId).add(productId);
    }
    for (const [companyId, idSet] of idsByCompany) {
        const productIds = [...idSet];
        if (!productIds.length)
            continue;
        try {
            const quantDomain = [
                ['location_id', '=', lokasyonId],
                ['product_id', 'in', productIds],
            ];
            const quantFields = ['product_id', 'quantity', 'available_quantity'];
            // Not: stock.quant kaydı, ürünün arandığı şirketten (companyId) FARKLI bir
            // company_id altında Odoo'da kayıtlı olabilir (örn. şirketler arası ortak depo/ürün).
            // allowed_company_ids'i tüm şirketlere açarak bu kaydın görünmesini sağlıyoruz —
            // aksi halde stok burada "0" görünürken başka ekranlarda (tüm-şirket context
            // kullananlar) doğru şekilde "mevcut" görünüyor.
            const allCompaniesContext = { allowed_company_ids: [...odooService.ODOO_ALL_COMPANY_IDS] };
            let quantlar = [];
            try {
                quantlar = (await odooService.execute('stock.quant', 'search_read', [quantDomain], {
                    fields: quantFields,
                    limit: productIds.length * 10,
                    context: allCompaniesContext,
                }, companyId)) ?? [];
            }
            catch {
                quantlar = (await odooService.execute('stock.quant', 'search_read', [quantDomain], {
                    fields: ['product_id', 'quantity'],
                    limit: productIds.length * 10,
                    context: allCompaniesContext,
                }, companyId)) ?? [];
            }
            for (const row of quantlar) {
                const productId = m2oId(row.product_id);
                if (!productId)
                    continue;
                const qty = Number(row.available_quantity ?? row.quantity ?? 0);
                const key = stokMapKey(productId, companyId);
                stokMap.set(key, (stokMap.get(key) ?? 0) + qty);
            }
        }
        catch (err) {
            logOdooError('stok quant', err);
        }
    }
    return stokMap;
}
function mapVariantToTransferUrun(v, ptavMap, stokMap, defaultStokZero = false) {
    const parsed = parseVariantDisplayName(v.display_name ?? v.name ?? '');
    let varyant = buildVaryantFromPtav(v.product_template_attribute_value_ids, ptavMap);
    if (!varyant)
        varyant = parsed.varyant;
    const stokVal = readStokFromMap(stokMap, v.id, v._cid);
    return {
        id: v.id,
        ad: parsed.ad,
        varyant,
        fiyat: v.lst_price ?? null,
        lotId: null,
        lotNo: null,
        tracking: v.tracking ?? 'none',
        utsKodu: null,
        utsDurumu: 'BILINMIYOR',
        stok: defaultStokZero ? (stokVal ?? 0) : (stokVal ?? null),
        kaynakFatura: null,
    };
}
async function mapVariantsBatchToTransferUrun(variants, defaultCompanyId, lokasyon) {
    const ptavMap = await fetchPtavMapForVariants(variants, defaultCompanyId);
    const enrichStok = Boolean(lokasyon);
    const stokMap = enrichStok ? await fetchStokMapForProducts(variants, lokasyon) : null;
    return variants.map((v) => mapVariantToTransferUrun(v, ptavMap, stokMap, enrichStok));
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
const TAMAMLANAN_GUN = 14;
const PICKING_LIST_FIELDS = [
    'id', 'name', 'location_id', 'location_dest_id', 'scheduled_date', 'origin', 'note', 'state',
    'create_date', 'date_done',
];

function recentDoneCutoffIso() {
    const d = new Date();
    d.setDate(d.getDate() - TAMAMLANAN_GUN);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Bekleyen + son 14 günde tamamlanan picking'ler */
function pickingListStateDomain() {
    return [
        '|',
        ['state', 'in', BEKLEYEN_PICKING_STATES],
        '&',
        ['state', '=', 'done'],
        ['date_done', '>=', recentDoneCutoffIso()],
    ];
}

export async function getPickingDestBranchCode(pickingId: string | number): Promise<string> {
    const id = Number(pickingId);
    if (!Number.isFinite(id)) {
        throw new Error(`Geçersiz picking id: ${pickingId}`);
    }
    const rows = (await odooService.execute('stock.picking', 'read', [[id]], { fields: ['location_dest_id'] }));
    const locId = m2oId(rows?.[0]?.location_dest_id) ?? 0;
    if (!locId) {
        throw new Error('Picking hedef lokasyon bulunamadı');
    }
    return branchCodeFromLocationId(locId);
}
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
    GVNP: 12,
    // NG warehouse (id:2) → picking type id:7
    GVN2: 7,
    GVN7: 7,
    GVN10: 7,
    ANADEPO: 7,
    ETICARET: 7,
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
function extractTransferRef(p) {
    const haystack = [p?.origin, p?.note, p?.name].filter(Boolean).join(' ');
    return haystack.match(/TRANSFER-\d+/)?.[0] ?? null;
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
    // Ürün kimliği: şirket kısıtı olmadan çöz (paylaşımlı veya tutarsız company_id kayıtları)
    const asProduct = (await odooService.execute('product.product', 'search_read', [[['id', '=', id]]], { fields: ['id'], limit: 1 }));
    if (asProduct?.length)
        return asProduct[0].id;
    const variants = (await odooService.execute('product.product', 'search_read', [[['product_tmpl_id', '=', id]]], { fields: ['id'], limit: 1 }));
    if (variants?.length)
        return variants[0].id;
    throw new Error(`Ürün bulunamadı (id=${id}, lokasyon şirketi=${companyId})`);
}
async function getProductUomId(productId, companyId) {
    const rows = (await odooService.execute('product.product', 'read', [[productId]], { fields: ['uom_id'] }, companyId));
    const uomId = m2oId(rows?.[0]?.uom_id);
    if (!uomId)
        throw new Error(`Ürün UoM bulunamadı (product=${productId})`);
    return uomId;
}
function odooStrVal(v) {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}
async function mapQuantToUrun(q, companyId) {
    const productId = m2oId(q.product_id) ?? 0;
    const lotId = m2oId(q.lot_id);
    let tracking = 'none';
    try {
        const products = (await odooService.execute('product.product', 'read', [[productId]], {
            fields: ['tracking'],
        }, companyId));
        tracking = products?.[0]?.tracking ?? 'none';
    }
    catch {
        tracking = 'none';
    }
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
    let utsKodu = odooStrVal(q.x_uts_kodu);
    let utsDurumu = odooStrVal(q.x_uts_durumu) ?? 'BEKLEMEDE';
    if (lotId && (!utsKodu || utsDurumu === 'BEKLEMEDE')) {
        try {
            const lots = (await odooService.execute('stock.lot', 'read', [[lotId]], { fields: ['x_uts_kodu', 'x_uts_durumu', 'x_uts_mi'] }, companyId));
            const lot = lots?.[0];
            if (lot) {
                utsKodu = odooStrVal(lot.x_uts_kodu) ?? utsKodu;
                utsDurumu = odooStrVal(lot.x_uts_durumu) ?? (lot.x_uts_mi ? 'ALINDI' : utsDurumu);
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
        lotId: lotId ?? null,
        lotNo: lotId ? m2oName(q.lot_id) : null,
        tracking,
        utsKodu,
        utsDurumu,
        stok: Number(q.quantity ?? q.available_quantity ?? 0),
        kaynakFatura,
    };
}
/** Etiket basımı için varsayılan seçim — cam hariç */
const CAM_KATEGORI_ID = 4;
const ETİKET_VARSAYILAN_KATEGORI_IDS = [6, 7, 8]; // çerçeve, güneş, aksesuar

function etiketVarsayilanSecili(categId: number | null, categAdi: string, urunAdi: string): boolean {
    if (categId === CAM_KATEGORI_ID) return false;
    const upper = `${categAdi} ${urunAdi}`.toUpperCase();
    if (upper.includes('OPTİK CAM') || upper.includes('OPTIK CAM') || /\bCAM\b/.test(upper)) return false;
    if (categId && ETİKET_VARSAYILAN_KATEGORI_IDS.includes(categId)) return true;
    if (upper.includes('AKSESUAR') || upper.includes('GÜNEŞ') || upper.includes('GUNEŞ') || upper.includes('ÇERÇEVE')) return true;
    return false;
}

async function mapMoveLinesToUrunler(moveLines: any[], companyId: number) {
    const productIds = [...new Set((moveLines ?? []).map((ml) => m2oId(ml.product_id)).filter(Boolean))];
    let productMap = new Map<number, any>();
    if (productIds.length) {
        const products = (await odooService.execute('product.product', 'read', [productIds], {
            fields: ['id', 'categ_id', 'lst_price', 'barcode', 'default_code'],
        }, companyId)) ?? [];
        productMap = new Map(products.map((p: any) => [p.id, p]));
    }

    return (moveLines ?? []).map((ml) => {
        const pid = m2oId(ml.product_id) ?? 0;
        const prod = productMap.get(pid);
        const categId = m2oId(prod?.categ_id);
        const categAdi = m2oName(prod?.categ_id);
        const qty = Number(ml.quantity ?? 0) || 1;
        const ad = m2oName(ml.product_id);
        return {
            moveLineId: ml.id,
            id: pid,
            ad,
            varyant: '',
            lotNo: ml.lot_id ? m2oName(ml.lot_id) : null,
            seriNo: ml.lot_id ? m2oName(ml.lot_id) : null,
            beklenenAdet: qty,
            sayilanAdet: qty,
            utsKodu: null,
            utsDurumu: 'BEKLEMEDE',
            fiyat: prod?.lst_price ?? 0,
            barkod: prod?.barcode ?? prod?.default_code ?? null,
            categId,
            categAdi,
            etiketSecili: etiketVarsayilanSecili(categId, categAdi, ad),
        };
    });
}

async function mapPickingToTransfer(p: any, companyId: number) {
    const moveLineFields = [
        'id', 'product_id', 'lot_id', 'quantity', 'product_uom_id',
    ];
    let moveLines: any[] = [];
    try {
        moveLines = (await odooService.execute('stock.move.line', 'search_read', [[['picking_id', '=', p.id]]], { fields: moveLineFields }, companyId)) ?? [];
    }
    catch (err) {
        console.error('[transfer] stock.move.line:', odooErrMessage(err));
        moveLines = [];
    }
    const urunler = await mapMoveLinesToUrunler(moveLines, companyId);
    return {
        transferId: p.id,
        transferRef: extractTransferRef(p),
        refNo: p.name,
        tarih: p.scheduled_date,
        atanmaTarihi: p.create_date ?? null,
        kabulTarihi: p.state === 'done' ? (p.date_done || null) : null,
        gonderen: m2oName(p.location_id),
        alici: m2oName(p.location_dest_id),
        personel: parsePersonelFromNote(p.note),
        durum: p.state,
        urunler,
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
/** Odoo BAKIM kategorisi — hizmet (service) tipi ürünler yalnızca burada aranır */
const BAKIM_KATEGORI_ID = 63;
/** Stok cam kategorileri — reçeteye göre öneri paneli, terim yazılmadan da (kategori
 *  seçilir seçilmez) kataloğu stoktan bağımsız taramalı (bkz. searchUrun minLen). */
const STOK_CAM_KATEGORI_IDS = [35, 36, 37, 39, 40, 41];
function catalogProductTypes(options) {
    const kategoriId = resolveSearchKategoriId(options);
    if (kategoriId === BAKIM_KATEGORI_ID) {
        return ['product', 'consu', 'service'];
    }
    return ['product', 'consu'];
}
function applyKategoriToDomain(domain, options) {
    const kategoriId = resolveSearchKategoriId(options);
    const ids = options?.kategoriIds;
    if (ids?.length) {
        if (ids.length === 1)
            domain.push(['categ_id', 'child_of', ids[0]]);
        else
            domain.push(['categ_id', 'in', ids]);
    }
    else if (kategoriId != null) {
        domain.push(['categ_id', 'child_of', kategoriId]);
    }
    return domain;
}
async function searchVariantsByPtav(term, options, limit) {
    const trimmed = String(term ?? '').trim();
    if (!trimmed || limit <= 0)
        return [];
    const collected = [];
    const seenVariantKeys = new Set();
    const companyResults = await mapWithConcurrency(SIRKET_SEARCH_IDS, 3, async (cid) => {
        const ptavs = (await odooService.execute('product.template.attribute.value', 'search_read', [[['name', 'ilike', trimmed]]], {
            fields: ['id'],
            limit: 30,
        }, cid)) ?? [];
        if (!ptavs.length)
            return [];
        const ptavIds = ptavs.map((p) => p.id).filter(Boolean);
        const variantDomain = applyKategoriToDomain([
            ['active', '=', true],
            ['product_template_attribute_value_ids', 'in', ptavIds],
        ], options);
        return (await odooService.execute('product.product', 'search_read', [variantDomain], {
            fields: ['id', 'display_name', 'name', 'lst_price', 'list_price', 'product_template_attribute_value_ids', 'tracking'],
            limit,
            order: 'display_name asc',
        }, cid)) ?? [];
    });
    for (let i = 0; i < SIRKET_SEARCH_IDS.length; i++) {
        const cid = SIRKET_SEARCH_IDS[i];
        for (const v of companyResults[i] ?? []) {
            const key = stokMapKey(v.id, cid);
            if (seenVariantKeys.has(key))
                continue;
            seenVariantKeys.add(key);
            collected.push({ ...v, _cid: cid });
            if (collected.length >= limit)
                return collected;
        }
    }
    return collected;
}
function mergeCatalogVariants(existing, incoming, limit) {
    const seen = new Set(existing.map((v) => stokMapKey(v.id, v._cid)));
    for (const v of incoming) {
        const key = stokMapKey(v.id, v._cid);
        if (seen.has(key))
            continue;
        seen.add(key);
        existing.push(v);
        if (existing.length >= limit)
            break;
    }
    return existing;
}
async function searchUrunByNameCatalog(term, companyId, lokasyon, options) {
    const hasTerm = Boolean(term && String(term).trim());
    // Terim boşken (sadece kategori seçilerek "kataloğu tara" modunda — örn. BAKIM ve
    // stok cam kategorileri) 50'lik sınır yetersiz kalıyordu: bir kategoride yüzlerce
    // şablon olabiliyor (bkz. toplu stok cam açma özelliği — tek kategoride 400+ ürün),
    // ve sadece isim sırasına göre ilk 50'si dönüyordu. Reçeteye göre öneri paneli bu
    // listeyi FİLTRELİYOR, yani aranan SPH/CYL kombinasyonu ilk 50'de değilse hiç
    // görünmüyordu (stokta olsun olmasın fark etmeksizin). Terim yazılı bir aramada
    // (kullanıcı bir şey yazdı) 50 sınırı makul kalmaya devam ediyor.
    const RESULT_LIMIT = hasTerm ? 50 : 2000;
    const baseDomain = [
        ['type', 'in', catalogProductTypes(options)],
        ['active', '=', true],
        ['sale_ok', '=', true],
    ];
    const domain = applyKategoriToDomain(
        term && String(term).trim()
            ? [...baseDomain, '|', ['name', 'ilike', term], ['default_code', 'ilike', term]]
            : baseDomain,
        options,
    );
    const seenIds = new Set();
    const templateBatches = await mapWithConcurrency(SIRKET_SEARCH_IDS, 3, async (cid) => {
        const rows = (await odooService.execute('product.template', 'search_read', [domain], {
            fields: ['id', 'name', 'list_price'],
            limit: RESULT_LIMIT,
            order: 'name asc',
        }, cid)) ?? [];
        return rows.map((r) => ({ ...r, _cid: cid }));
    });
    const allTemplates = [];
    for (const batch of templateBatches) {
        for (const r of batch) {
            if (!seenIds.has(r.id)) {
                seenIds.add(r.id);
                allTemplates.push(r);
            }
        }
    }
    const templates = allTemplates.slice(0, RESULT_LIMIT);
    const variantBatches = await mapWithConcurrency(templates, ODOO_SEARCH_CONCURRENCY, async (tmpl) => {
        return (await odooService.execute('product.product', 'search_read', [
            [['product_tmpl_id', '=', tmpl.id], ['active', '=', true]],
        ], {
            fields: ['id', 'display_name', 'name', 'lst_price', 'list_price', 'product_template_attribute_value_ids', 'tracking'],
            limit: RESULT_LIMIT,
            order: 'display_name asc',
        }, tmpl._cid ?? companyId)) ?? [];
    });
    const collected = [];
    for (let i = 0; i < templates.length; i++) {
        const tmpl = templates[i];
        for (const v of variantBatches[i] ?? []) {
            collected.push({
                ...v,
                display_name: v.display_name ?? v.name ?? tmpl.name,
                lst_price: v.lst_price ?? v.list_price ?? tmpl.list_price,
                _cid: tmpl._cid ?? companyId,
            });
            if (collected.length >= RESULT_LIMIT)
                break;
        }
        if (collected.length >= RESULT_LIMIT)
            break;
    }
    if (!collected.length) {
        const variantDomain = applyKategoriToDomain([
            ['active', '=', true],
            '|', ['name', 'ilike', term], ['default_code', 'ilike', term],
        ], options);
        const directVariants = (await odooService.execute('product.product', 'search_read', [variantDomain], {
            fields: ['id', 'display_name', 'name', 'lst_price', 'list_price', 'product_template_attribute_value_ids', 'tracking'],
            limit: RESULT_LIMIT,
            order: 'display_name asc',
        }, companyId)) ?? [];
        for (const v of directVariants) {
            collected.push({ ...v, _cid: companyId });
        }
    }
    let merged = dedupeVariantEntries(collected);
    if (term && String(term).trim()) {
        const ptavVariants = await searchVariantsByPtav(term, options, RESULT_LIMIT);
        merged = dedupeVariantEntries(mergeCatalogVariants(ptavVariants, merged, RESULT_LIMIT));
    }
    if (!merged.length) {
        // Fallback (13.08.2026): kategori filtresiyle hiç sonuç bulunamadıysa, Odoo'da
        // kategorisi hiç atanmamış/yanlış atanmış ürünleri (örn. OTTO OPTİK ÇERÇEVE —
        // bkz. Not #49) kaçırmamak için kategori kısıtı olmadan bir kez daha dene.
        // _kategoriFallbackDone bayrağı sonsuz döngüyü engeller.
        const hasKategoriFiltre = resolveSearchKategoriId(options) != null || Boolean(options?.kategoriIds?.length);
        if (hasKategoriFiltre && !options?._kategoriFallbackDone && term && String(term).trim()) {
            return searchUrunByNameCatalog(term, companyId, lokasyon, {
                ...options,
                kategori: undefined,
                kategoriId: undefined,
                kategoriIds: undefined,
                _kategoriFallbackDone: true,
            });
        }
        return [];
    }
    const mapped = await mapVariantsBatchToTransferUrun(merged.slice(0, RESULT_LIMIT), companyId, lokasyon);
    return dedupeTransferUrunResults(mapped);
}
async function mapProductsKatalog(productIds, lotRows, companyId, lokasyon) {
    const sonuclar = [];
    if (lotRows?.length) {
        const withVariant = [];
        for (const lot of lotRows) {
            const productId = m2oId(lot.product_id);
            if (!productId)
                continue;
            const products = (await odooService.execute('product.product', 'read', [[productId]], {
                fields: ['id', 'display_name', 'name', 'lst_price', 'list_price', 'tracking'],
            }, companyId));
            const v = products?.[0];
            if (!v)
                continue;
            withVariant.push({ lot, v: { ...v, _cid: companyId } });
        }
        // Bug fix (13.08.2026): daha önce stokMap hiç hesaplanmıyordu, bu yüzden Kalem
        // Ekle'de Lot/Seri/UTS ile arama yapıldığında stok her zaman "0" görünüyordu
        // (gerçek stok var olsa bile). Barkod/UTS/Lot aramaları da "ad" araması gibi
        // gerçek stok bilgisiyle zenginleştirilmeli.
        const stokMap = lokasyon ? await fetchStokMapForProducts(withVariant.map((x) => x.v), lokasyon) : null;
        for (const { lot, v } of withVariant) {
            const mapped = mapVariantToTransferUrun(v, undefined, stokMap, Boolean(lokasyon));
            mapped.lotId = lot.id ?? null;
            // Bug fix: m2oName(lot.id) burada yanlıştı (lot.id bir sayı, many2one tuple
            // değil) — her zaman '' dönüyor ve lot numarası hiç görünmüyordu.
            mapped.lotNo = lot.name ?? null;
            if (lot.x_uts_kodu)
                mapped.utsKodu = lot.x_uts_kodu;
            sonuclar.push(mapped);
        }
        return dedupeTransferUrunResults(sonuclar);
    }
    if (!productIds.length)
        return [];
    const variants = (await odooService.execute('product.product', 'read', [productIds], {
        fields: ['id', 'display_name', 'name', 'lst_price', 'list_price', 'tracking'],
    }, companyId)) ?? [];
    const withCid = variants.map((v) => ({ ...v, _cid: companyId }));
    const stokMap = lokasyon ? await fetchStokMapForProducts(withCid, lokasyon) : null;
    return dedupeTransferUrunResults(withCid.map((v) => mapVariantToTransferUrun(v, undefined, stokMap, Boolean(lokasyon))));
}
export async function searchUrun(q, yontem, lokasyon, options) {
    const rawTerm = q.trim();
    const term = normalizeTransferSearchTerm(rawTerm, yontem);
    const katalog = options?.katalog === true;
    const searchKategoriId = resolveSearchKategoriId(options);
    const bosTerimliKatalogIzinli =
        katalog && (searchKategoriId === BAKIM_KATEGORI_ID || STOK_CAM_KATEGORI_IDS.includes(searchKategoriId));
    const minLen = yontem === 'ad' ? (bosTerimliKatalogIzinli ? 0 : 1) : 3;
    if (!term || term.length < minLen)
        return [];
    return withOdoo('urun-ara', async () => {
        const t0 = Date.now();
        const companyId = odooLocations.getCompanyIdFromLokasyon(lokasyon);
        if (!companyId)
            throw new Error(`Lokasyon şirketi tanımsız: ${lokasyon}`);
        let sonuclar;
        if (yontem === 'ad') {
            sonuclar = await searchUrunByNameCatalog(term, companyId, lokasyon, options);
        }
        else {
            const lokasyonId = await odooLocations.getLokasyonId(lokasyon);
            if (!katalog && !lokasyonId)
                throw new Error(`Lokasyon bulunamadı: ${lokasyon}`);
            let productIds = [];
            let lotIds = [];
            let lotRows = [];
            if (yontem === 'barkod') {
                const products = (await odooService.execute('product.product', 'search_read', [[['barcode', '=', term]]], { fields: ['id'], limit: 5 }, companyId));
                productIds = (products ?? []).map((p) => p.id);
            }
            else if (yontem === 'uts') {
                // Bug fix (13.08.2026): önceden '=' (tam eşleşme) kullanılıyordu — UTS
                // kodları uzun GS1 kodları olduğu için kullanıcı kodun tamamını hatırlayıp
                // yazamıyordu, bu yüzden arama hep "sonuç bulunamadı" dönüyordu. Diğer
                // aramalar (lot, ref, ad) gibi kısmi eşleşmeye (ilike) çevrildi.
                const lots = (await odooService.execute('stock.lot', 'search_read', [[['x_uts_kodu', 'ilike', term]]], { fields: ['id', 'name', 'product_id', 'x_uts_kodu'], limit: 20 }, companyId));
                lotRows = lots ?? [];
                lotIds = lotRows.map((l) => l.id);
                productIds = lotRows.map((l) => m2oId(l.product_id)).filter((x) => x !== null);
            }
            else if (yontem === 'lot') {
                const lots = (await odooService.execute('stock.lot', 'search_read', [[['name', 'ilike', term]]], { fields: ['id', 'name', 'product_id', 'x_uts_kodu'], limit: 20 }, companyId));
                lotRows = lots ?? [];
                lotIds = lotRows.map((l) => l.id);
                productIds = lotRows.map((l) => m2oId(l.product_id)).filter((x) => x !== null);
            }
            else if (yontem === 'ref') {
                const lots = (await odooService.execute('stock.lot', 'search_read', [[['ref', 'ilike', term]]], { fields: ['id', 'name', 'product_id'], limit: 20 }, companyId));
                lotRows = lots ?? [];
                lotIds = lotRows.map((l) => l.id);
                productIds = lotRows.map((l) => m2oId(l.product_id)).filter((x) => x !== null);
                if (!productIds.length) {
                    const products = (await odooService.execute('product.product', 'search_read', [[['default_code', 'ilike', term]]], { fields: ['id'], limit: 10 }, companyId));
                    productIds = (products ?? []).map((p) => p.id);
                }
            }
            else {
                const products = (await odooService.execute('product.product', 'search_read', [[['name', 'ilike', term]]], { fields: ['id'], limit: 10 }, companyId));
                productIds = (products ?? []).map((p) => p.id);
            }
            if (katalog) {
                sonuclar = await mapProductsKatalog(productIds, lotRows, companyId, lokasyon);
            }
            else {
                const quantlar = await fetchQuantsAtLocation(lokasyonId, companyId, {
                    lotIds: lotIds.length ? lotIds : undefined,
                    productIds: !lotIds.length && productIds.length ? productIds : undefined,
                    limit: 10,
                });
                sonuclar = [];
                for (const row of quantlar) {
                    sonuclar.push(await mapQuantToUrun(row, companyId));
                }
            }
        }
        const deduped = dedupeTransferUrunResults(sonuclar ?? []);
        const ms = Date.now() - t0;
        if (term !== rawTerm) {
            console.log(`[transfer urun-ara] GS1 normalize: rawLen=${rawTerm.length} → term="${term.slice(0, 40)}" yontem=${yontem}`);
        }
        console.log(`[transfer urun-ara] yontem=${yontem} qLen=${term.length} results=${deduped.length} ${ms}ms`);
        return deduped;
    });
}
async function fetchQuantsAtLocation(lokasyonId, companyId, filters) {
    const quantDomain = [
        ['location_id', '=', lokasyonId],
        ['quantity', '>', 0],
    ];
    if (filters?.lotIds?.length) {
        quantDomain.push(['lot_id', 'in', filters.lotIds]);
    }
    else if (filters?.productIds?.length) {
        quantDomain.push(['product_id', 'in', filters.productIds]);
    }
    else if (filters?.productId) {
        quantDomain.push(['product_id', '=', filters.productId]);
    }
    else {
        return [];
    }
    const quantFields = ['product_id', 'lot_id', 'quantity', 'available_quantity'];
    // Aynı çok-şirket görünürlük nedeniyle (bkz. fetchStokMapForProducts) burada da
    // tüm şirketlerin quant kayıtlarını görebilmek için context'i genişletiyoruz.
    const allCompaniesContext = { allowed_company_ids: [...odooService.ODOO_ALL_COMPANY_IDS] };
    try {
        return (await odooService.execute('stock.quant', 'search_read', [quantDomain], {
            fields: [...quantFields, 'x_uts_kodu', 'x_uts_durumu'],
            limit: filters?.limit ?? 50,
            context: allCompaniesContext,
        }, companyId)) ?? [];
    }
    catch {
        return (await odooService.execute('stock.quant', 'search_read', [quantDomain], {
            fields: quantFields,
            limit: filters?.limit ?? 50,
            context: allCompaniesContext,
        }, companyId)) ?? [];
    }
}
/** Ürün adı aramasından sonra: seçili lokasyondaki lot/seri kayıtları */
export async function searchUrunLotsByProduct(productId, lokasyon) {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) {
        throw new Error('Geçersiz productId');
    }
    return withOdoo('urun-lotlari', async () => {
        const companyId = odooLocations.getCompanyIdFromLokasyon(lokasyon);
        if (!companyId) {
            throw new Error(`Lokasyon şirketi tanımsız: ${lokasyon}`);
        }
        const lokasyonId = await odooLocations.getLokasyonId(lokasyon);
        if (!lokasyonId) {
            throw new Error(`Lokasyon bulunamadı: ${lokasyon}`);
        }
        const resolvedProductId = await resolveProductId(pid, companyId);
        const quantlar = await fetchQuantsAtLocation(lokasyonId, companyId, {
            productId: resolvedProductId,
            limit: 100,
        });
        console.log(`[urun-lotlari] productId=${pid} lokasyon=${lokasyon} company=${companyId} resolved=${resolvedProductId} quant=${quantlar.length}`);
        const sonuclar = [];
        for (const row of quantlar) {
            sonuclar.push(await mapQuantToUrun(row, companyId));
        }
        return dedupeTransferUrunResults(sonuclar);
    }, []);
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
export async function createTransfer(input) {
    const cikisSirket = odooLocations.getLokasyonSirket(input.cikisLokasyon);
    const girisSirket = odooLocations.getLokasyonSirket(input.girisLokasyon);
    if (!cikisSirket || !girisSirket) {
        return {
            success: false,
            error: 'LOKASYON_SIRKET',
            message: `Lokasyon şirketi tanımsız: ${!cikisSirket ? input.cikisLokasyon : input.girisLokasyon}`,
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

        const kalemler = [];
        for (const urun of input.urunler ?? []) {
            const productId = await resolveProductId(urun.id, companyId);
            let lotId = urun.lotId ? Number(urun.lotId) : null;
            if (!lotId && urun.lotNo) {
                lotId = await getLotId(urun.lotNo, productId, companyId);
            }
            kalemler.push({
                productId,
                resolvedProductId: productId,
                miktar: Math.max(1, Number(urun.adet ?? 1)),
                urunAdi: urun.ad,
                lotId,
            });
        }

        const notParts = [input.referans, buildPickingNote(input.personel, input.not)].filter(Boolean);
        const sonuc = await baslatTransfer({
            kaynakLocationId: cikisId,
            hedefLocationId: girisId,
            kalemler,
            notlar: notParts.join(' — ') || undefined,
        });

        if (!sonuc.success) {
            return { success: false, message: sonuc.message, error: 'TRANSFER_BASLATILAMADI' };
        }

        return {
            success: true,
            transferId: sonuc.kabulPickingId,
            refNo: sonuc.pickingName ?? String(sonuc.kabulPickingId),
            odooPickingId: sonuc.kabulPickingId,
            transferRef: sonuc.transferRef,
            durum: sonuc.durum,
            message: sonuc.message,
        };
    });
}
export async function listBekleyen(lokasyon) {
    return withOdoo('bekleyen', async () => {
        const lokasyonId = await odooLocations.getLokasyonId(lokasyon);
        if (!lokasyonId)
            throw new Error(`Lokasyon bulunamadı: ${lokasyon}`);
        const companyId = odooLocations.getCompanyIdFromLokasyon(lokasyon);
        if (!companyId)
            throw new Error(`Lokasyon şirketi tanımsız: ${lokasyon}`);
        const pickinglar = (await odooService.execute('stock.picking', 'search_read', [
            [
                '&',
                '&',
                ['location_dest_id', '=', lokasyonId],
                ['location_id', '!=', lokasyonId],
                ...pickingListStateDomain(),
            ],
        ], { fields: PICKING_LIST_FIELDS, limit: 50, order: 'create_date desc' }, companyId));
        const transferler = await Promise.all((pickinglar ?? []).map((p) => mapPickingToTransfer(p, companyId)));
        return transferler;
    });
}

export async function listGonderilen(lokasyon) {
    return withOdoo('gonderilen', async () => {
        const lokasyonId = await odooLocations.getLokasyonId(lokasyon);
        if (!lokasyonId)
            throw new Error(`Lokasyon bulunamadı: ${lokasyon}`);
        const companyId = odooLocations.getCompanyIdFromLokasyon(lokasyon);
        if (!companyId)
            throw new Error(`Lokasyon şirketi tanımsız: ${lokasyon}`);
        const pickinglar = (await odooService.execute('stock.picking', 'search_read', [
            [
                '&',
                '&',
                ['location_id', '=', lokasyonId],
                ['location_dest_id', '!=', lokasyonId],
                ...pickingListStateDomain(),
            ],
        ], { fields: PICKING_LIST_FIELDS, limit: 50, order: 'create_date desc' }, companyId));
        const transferler = await Promise.all((pickinglar ?? []).map((p) => mapPickingToTransfer(p, companyId)));
        return transferler;
    });
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
export async function acceptTransfer(transferId, sayimlar) {
    const pickingId = Number(transferId);
    if (!Number.isFinite(pickingId)) {
        return { success: false, message: `Geçersiz transfer id: ${transferId}` };
    }
    return withOdoo('kabul', async () => {
        const result = await kabulEtTransfer({
            kabulPickingId: pickingId,
            sayimlar: sayimlar ?? [],
        });
        if (!result.success) {
            return { success: false, message: result.message };
        }
        return { success: true, transferId: pickingId, transferRef: result.transferRef };
    });
}
export async function reportTransferIssue(transferId, not) {
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
export async function debugLokasyonMap() {
    const map = await odooLocations.getLokasyonMap(true);
    return map;
}
