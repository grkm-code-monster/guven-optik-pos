/**
 * 18.11.2026 — Cam "Özel İşlem" (renklendirme, odak kaydırma, prizma, inceltme…)
 *
 * Odoo'da BAKIM (63) altında "ÖZEL İŞLEM" alt kategorisi var (bkz.
 * scripts/ozel-islem-kategori-kur.ts). Satışta cam satırındaki "Özel İşlem"
 * butonu bu kategorideki hizmet ürünlerini listeler; seçilen işlem, cama
 * linkedItemId ile bağlı (linkType'sız) normal bir SaleItem olarak kaydedilir.
 * Detay (taraf, renk…) maintenanceNature'a, firmaya not maintenanceDescription'a
 * yazılır — bu alanlar zaten satış detayı / kasa formu / PDF'te gösteriliyor.
 */
import { execute } from '../odoo/odoo.service';

export const BAKIM_KATEGORI_ID = 63;
const KATEGORI_ADI = 'ÖZEL İŞLEM';
/** 18.11.2026 — scripts/ozel-islem-kategori-kur.ts ile açılan kategori. Adı Odoo'da
 *  değiştirilse de (ör. "ÖZEL İŞLEMLER VE KAPLAMALAR") id ile bulunur. */
const OZEL_ISLEM_KATEGORI_ID = 82;
/** 18.11.2026 — "BAKIM / Güneş Camları": VP. HAZIR GÜNEŞ CAMI kartları (scripts/gunes-cami-kart-ac.ts) */
export const GUNES_CAMLARI_KATEGORI_ID = 83;
const GUNES_BARKOD_ONEKI = '086800002';

let kategoriCache: { id: number | null; zaman: number } | null = null;
const CACHE_MS = 10 * 60 * 1000;

function fold(s: string): string {
  return (s || '').toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ').trim();
}

/** Önbellekteki kategori id'si (henüz okunmadıysa null). Senkron yerler için. */
export function ozelIslemKategoriIdOnbellek(): number | null {
  return kategoriCache?.id ?? null;
}

export async function getOzelIslemKategoriId(): Promise<number | null> {
  if (kategoriCache && Date.now() - kategoriCache.zaman < CACHE_MS) return kategoriCache.id;
  try {
    const rows = (await execute('product.category', 'search_read', [[['parent_id', '=', BAKIM_KATEGORI_ID]]], {
      fields: ['id', 'name'],
    })) as Array<{ id: number; name: string }>;
    const id =
      rows.find((r) => r.id === OZEL_ISLEM_KATEGORI_ID)?.id ??
      rows.find((r) => fold(r.name).startsWith(fold(KATEGORI_ADI)))?.id ??
      null;
    // Kategori henüz yoksa kısa süre önbellekle (script çalıştırılınca hemen görünsün)
    kategoriCache = { id, zaman: id ? Date.now() : Date.now() - CACHE_MS + 30_000 };
    return id;
  } catch (e) {
    console.error('[ozel-islem] kategori okunamadı:', e);
    return kategoriCache?.id ?? null;
  }
}

export type OzelIslemUrun = { variantId: number; name: string; price: number };

export async function listOzelIslemUrunleri(): Promise<{ kategoriId: number | null; urunler: OzelIslemUrun[] }> {
  const kategoriId = await getOzelIslemKategoriId();
  if (!kategoriId) return { kategoriId: null, urunler: [] };
  const rows = (await execute(
    'product.product',
    'search_read',
    // Sadece hizmet ürünleri (kategoriye taşınmış stoklu kartlar, ör. eski "VP. HAZIR GÜNEŞ CAMI", listelenmez)
    [[['categ_id', '=', kategoriId], ['active', '=', true], ['sale_ok', '=', true], ['type', '=', 'service']]],
    { fields: ['id', 'name', 'lst_price'], order: 'name asc' },
  )) as Array<{ id: number; name: string; lst_price: number }>;
  return {
    kategoriId,
    urunler: rows.map((r) => ({ variantId: r.id, name: r.name, price: Number(r.lst_price ?? 0) })),
  };
}

export type HazirGunesCami = { variantId: number; name: string; barcode: string; price: number };
let gunesCache: { liste: HazirGunesCami[]; zaman: number } | null = null;

/** 18.11.2026 — Satıştaki "Hazır Güneş Camı" seçicisi için tüm kartlar (barkod kombinasyonu taşır). */
export async function listHazirGunesCamlari(): Promise<HazirGunesCami[]> {
  if (gunesCache && Date.now() - gunesCache.zaman < CACHE_MS) return gunesCache.liste;
  const rows = (await execute(
    'product.product',
    'search_read',
    [[['categ_id', '=', GUNES_CAMLARI_KATEGORI_ID], ['active', '=', true], ['sale_ok', '=', true], ['barcode', '=like', `${GUNES_BARKOD_ONEKI}%`]]],
    { fields: ['id', 'name', 'barcode', 'lst_price'], order: 'barcode asc' },
  )) as Array<{ id: number; name: string; barcode: string; lst_price: number }>;
  const liste = rows.map((r) => ({ variantId: r.id, name: r.name, barcode: r.barcode, price: Number(r.lst_price ?? 0) }));
  gunesCache = { liste, zaman: Date.now() };
  return liste;
}
