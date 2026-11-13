/**
 * 13.11.2026 — Etiket basım geçmişi.
 *
 * Her "Yazdır" işleminde basılan her lot için bir kayıt düşülür: hangi ürün, hangi fiyatla,
 * hangi şablonla, hangi ekrandan, ne zaman. "Fiyatı değişti, etiketi eski" filtresi
 * buradaki `fiyat` ile ürünün bugünkü satış fiyatını karşılaştırır.
 *
 * Not: "basıldı" = Yazdır'a basıldığı an. Yazıcının kâğıdı fiilen çıkarıp çıkarmadığı bilinemez.
 */
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';

export const ETIKET_BASIM_KAYNAKLARI = [
  'ETIKET_MERKEZI',
  'STOK_YONETIMI',
  'DEPO',
  'TRANSFER',
  'EXCEL_ENVANTER',
  'POS_FIYAT',
  'ILK_KAYIT',
] as const;
export type EtiketBasimKaynak = (typeof ETIKET_BASIM_KAYNAKLARI)[number];

export type EtiketBasimGirdi = {
  lotId?: number | null;
  lotAdi?: string | null;
  utsKodu?: string | null;
  varyantId?: number | null;
  urunAdi: string;
  nitelik?: string | null;
  fiyat?: number | string | null;
  sablonSlug?: string | null;
  lokasyon?: string | null;
  adet?: number | null;
};

export type SonBasim = { basildi: Date; fiyat: number | null; kaynak: string };

function sayiYap(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function pozitifInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function kaynakGecerliMi(k: unknown): k is EtiketBasimKaynak {
  return typeof k === 'string' && (ETIKET_BASIM_KAYNAKLARI as readonly string[]).includes(k);
}

export async function basimKaydet(
  kaynak: EtiketBasimKaynak,
  kayitlar: EtiketBasimGirdi[],
  userId: string | null,
): Promise<number> {
  const data = kayitlar
    .filter((k) => k && String(k.urunAdi ?? '').trim())
    .slice(0, 5000)
    .map((k) => ({
      lotId: pozitifInt(k.lotId),
      lotAdi: k.lotAdi ? String(k.lotAdi).slice(0, 200) : null,
      utsKodu: k.utsKodu ? String(k.utsKodu).slice(0, 200) : null,
      varyantId: pozitifInt(k.varyantId),
      urunAdi: String(k.urunAdi).slice(0, 300),
      nitelik: k.nitelik ? String(k.nitelik).slice(0, 200) : null,
      fiyat: sayiYap(k.fiyat),
      sablonSlug: k.sablonSlug ? String(k.sablonSlug).slice(0, 100) : null,
      kaynak,
      lokasyon: k.lokasyon ? String(k.lokasyon).slice(0, 100) : null,
      adet: pozitifInt(k.adet) ?? 1,
      userId,
    }));
  if (!data.length) return 0;

  // Lot id'si gelmeyen ama lot adı olan satırlar (ör. Stok Yönetimi, Depo ürün girişi): Odoo'dan
  // lot adıyla bulunur — "son etiket" bilgisi lot id'ye göre okunduğu için. Bulunamazsa id'siz yazılır.
  const adlar = [...new Set(data.filter((d) => !d.lotId && d.lotAdi).map((d) => d.lotAdi as string))];
  if (adlar.length) {
    try {
      const lotlar = (await execute('stock.lot', 'search_read', [[['name', 'in', adlar.slice(0, 2000)]]], {
        fields: ['id', 'name', 'product_id'],
        context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS },
      })) as { id: number; name: string; product_id: [number, string] | false }[];
      const adaGore = new Map<string, { id: number; product_id: [number, string] | false }[]>();
      for (const l of lotlar) adaGore.set(l.name, [...(adaGore.get(l.name) ?? []), l]);
      for (const d of data) {
        if (d.lotId || !d.lotAdi) continue;
        const adaylar = adaGore.get(d.lotAdi) ?? [];
        const uyan = d.varyantId ? adaylar.filter((a) => a.product_id && a.product_id[0] === d.varyantId) : adaylar;
        if (uyan.length === 1) {
          d.lotId = uyan[0].id;
          if (!d.varyantId && uyan[0].product_id) d.varyantId = uyan[0].product_id[0];
        }
      }
    } catch (e) {
      console.warn('[etiket-basim] lot adı çözülemedi', e instanceof Error ? e.message : e);
    }
  }

  const r = await prisma.etiketBasimKaydi.createMany({ data });
  return r.count;
}

/** Lot başına EN SON basım (lotId → kayıt). */
export async function sonBasimlarLot(lotIds: number[]): Promise<Map<number, SonBasim>> {
  const ids = [...new Set(lotIds.filter((x) => Number.isInteger(x) && x > 0))];
  const sonuc = new Map<number, SonBasim>();
  for (let i = 0; i < ids.length; i += 5000) {
    const parca = ids.slice(i, i + 5000);
    const satirlar = await prisma.etiketBasimKaydi.findMany({
      where: { lotId: { in: parca } },
      orderBy: { basildi: 'desc' },
      select: { lotId: true, basildi: true, fiyat: true, kaynak: true },
    });
    for (const s of satirlar) {
      if (s.lotId == null || sonuc.has(s.lotId)) continue;
      sonuc.set(s.lotId, { basildi: s.basildi, fiyat: s.fiyat == null ? null : Number(s.fiyat), kaynak: s.kaynak });
    }
  }
  return sonuc;
}

/** Lotu olmayan (lot takipsiz) ürünler için varyant başına en son basım. */
export async function sonBasimlarVaryant(varyantIds: number[]): Promise<Map<number, SonBasim>> {
  const ids = [...new Set(varyantIds.filter((x) => Number.isInteger(x) && x > 0))];
  const sonuc = new Map<number, SonBasim>();
  if (!ids.length) return sonuc;
  const satirlar = await prisma.etiketBasimKaydi.findMany({
    where: { varyantId: { in: ids } },
    orderBy: { basildi: 'desc' },
    select: { varyantId: true, basildi: true, fiyat: true, kaynak: true },
  });
  for (const s of satirlar) {
    if (s.varyantId == null || sonuc.has(s.varyantId)) continue;
    sonuc.set(s.varyantId, { basildi: s.basildi, fiyat: s.fiyat == null ? null : Number(s.fiyat), kaynak: s.kaynak });
  }
  return sonuc;
}
