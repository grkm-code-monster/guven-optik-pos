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
    const id = rows.find((r) => fold(r.name) === fold(KATEGORI_ADI))?.id ?? null;
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
    [[['categ_id', '=', kategoriId], ['active', '=', true], ['sale_ok', '=', true]]],
    { fields: ['id', 'name', 'lst_price'], order: 'name asc' },
  )) as Array<{ id: number; name: string; lst_price: number }>;
  return {
    kategoriId,
    urunler: rows.map((r) => ({ variantId: r.id, name: r.name, price: Number(r.lst_price ?? 0) })),
  };
}
