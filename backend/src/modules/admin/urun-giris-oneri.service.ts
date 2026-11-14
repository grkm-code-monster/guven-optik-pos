/**
 * 14.11.2026 — Ürün girişi: "Bu mu?" önerileri + fiziki tedarikçinin marka kartından bulunması.
 *
 * • hafizayaYaz(): kaydedilen girişte elle eşleştirilen satırlar (firma + faturadaki ad → bizim ürün) saklanır.
 * • oneriler(): eşleşmemiş satırlar için
 *     1) HAFIZA — aynı firmadan aynı ad (ya da aynı tedarikçi kodu) daha önce eşleşmişse o ürün;
 *     2) BENZER — adın içindeki model kodu (rakamlı en uzun parça) ile Odoo'da arama, renk/ölçü parçaları
 *        ile puanlanmış en fazla 3 aday.
 *   Hiçbiri otomatik uygulanmaz; ekranda kullanıcı seçer.
 * • fizikiTedarikciBul(): eşleşen ürünlerin markalarından MarkaTedarikci kartındaki fiziki tedarikçi.
 */
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { markaAnahtar } from './satin-alma-analiz.service';

const CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };

function sade(s: string): string {
  return String(s ?? '')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}
function tedarikciKey(vkn: string | null | undefined, ad: string): string {
  const v = String(vkn ?? '').replace(/\D/g, '');
  return v.length >= 10 ? `VKN:${v}` : `AD:${sade(ad)}`;
}

export type EslesmeSatir = {
  tedarikciUrunAdi: string;
  tedarikciKodu?: string | null;
  bizimUrunOdooId: number | null;
  bizimUrunProductId?: number | null;
  bizimUrunAdi: string;
  bizimUrunBarkod?: string | null;
  varyantEtiketi?: string | null;
  eslesti?: boolean;
  siparisBag?: { bagdanEslesti?: boolean } | null;
};

export async function hafizayaYaz(g: { cariAdi: string; cariVkn?: string | null; satirlar: EslesmeSatir[] }): Promise<number> {
  if (!g.cariAdi?.trim() && !g.cariVkn) return 0;
  const tk = tedarikciKey(g.cariVkn, g.cariAdi);
  let n = 0;
  for (const s of g.satirlar ?? []) {
    const urunKey = sade(s.tedarikciUrunAdi);
    if (!urunKey || !s.eslesti || !s.bizimUrunOdooId) continue;
    if (s.siparisBag?.bagdanEslesti) continue; // müşteri siparişinden gelen eşleşme hafızaya yazılmaz
    const data = {
      tedarikciAdi: g.cariAdi?.slice(0, 200) || null,
      tedarikciUrunAdi: s.tedarikciUrunAdi.slice(0, 300),
      tedarikciKodu: s.tedarikciKodu?.slice(0, 100) || null,
      odooTmplId: Number(s.bizimUrunOdooId),
      odooProductId: s.bizimUrunProductId ? Number(s.bizimUrunProductId) : null,
      urunAdi: String(s.bizimUrunAdi ?? '').slice(0, 300),
      barkod: s.bizimUrunBarkod || null,
      varyantEtiketi: s.varyantEtiketi || null,
      sonKullanim: new Date(),
    };
    await prisma.tedarikciUrunEslesme.upsert({
      where: { tedarikciKey_urunKey: { tedarikciKey: tk, urunKey } },
      create: { tedarikciKey: tk, urunKey, ...data },
      update: { ...data, kullanim: { increment: 1 } },
    });
    n++;
  }
  return n;
}

export type Oneri = {
  kaynak: 'HAFIZA' | 'BENZER';
  odooTmplId: number;
  odooProductId: number | null;
  urunAdi: string;
  barkod: string | null;
  varyantEtiketi: string | null;
  aciklama: string;
};

/** "OSSE OS3109 C02 50-20" → model adayı OS3109, diğer parçalar C02, 50 … */
function parcala(ad: string): { model: string | null; digerleri: string[] } {
  const toks = sade(ad).split(' ').filter(Boolean);
  const rakamli = toks.filter((t) => /\d/.test(t) && t.length >= 3 && !/^\d{1,3}$/.test(t));
  rakamli.sort((a, b) => b.length - a.length);
  const model = rakamli[0] ?? null;
  return { model, digerleri: toks.filter((t) => t !== model) };
}

async function benzerAra(ad: string, kod: string | null | undefined): Promise<Oneri[]> {
  const { model, digerleri } = parcala(ad);
  const aramalar = [kod?.trim(), model].filter((x): x is string => !!x && x.length >= 3);
  if (!aramalar.length) return [];
  type P = { id: number; product_tmpl_id: [number, string] | false; display_name: string; barcode: string | false; default_code: string | false };
  const bulunan = new Map<number, P>();
  for (const q of aramalar) {
    const dom = ['|', '|', '|',
      ['default_code', 'ilike', q],
      ['barcode', 'ilike', q],
      ['name', 'ilike', q],
      ['product_template_attribute_value_ids.name', 'ilike', q],
    ];
    try {
      const r = (await execute('product.product', 'search_read', [dom], {
        fields: ['id', 'product_tmpl_id', 'display_name', 'barcode', 'default_code'], limit: 40, ...CTX,
      })) as P[];
      for (const p of r) bulunan.set(p.id, p);
    } catch {
      // arama hatası önerisiz devam
    }
  }
  const puanli = [...bulunan.values()].map((p) => {
    const metin = ` ${sade(p.display_name)} ${sade(String(p.default_code || ''))} `;
    let puan = 0;
    for (const t of digerleri) if (t.length >= 2 && metin.includes(` ${t} `)) puan++;
    if (model && metin.includes(model)) puan += 2;
    return { p, puan };
  }).sort((a, b) => b.puan - a.puan || a.p.display_name.localeCompare(b.p.display_name, 'tr'));
  return puanli.slice(0, 3).map(({ p }) => {
    const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : 0;
    const m = /\(([^)]*)\)\s*$/.exec(p.display_name);
    return {
      kaynak: 'BENZER' as const,
      odooTmplId: tmplId,
      odooProductId: p.id,
      urunAdi: p.display_name,
      barkod: typeof p.barcode === 'string' && p.barcode ? p.barcode : null,
      varyantEtiketi: m ? m[1] : null,
      aciklama: 'Benzer ad',
    };
  }).filter((o) => o.odooTmplId > 0);
}

export async function oneriler(g: {
  cariAdi: string;
  cariVkn?: string | null;
  satirlar: Array<{ id: string; tedarikciUrunAdi: string; tedarikciKodu?: string | null }>;
}): Promise<Record<string, Oneri[]>> {
  const tk = tedarikciKey(g.cariVkn, g.cariAdi);
  const hafiza = await prisma.tedarikciUrunEslesme.findMany({ where: { tedarikciKey: tk } });
  const byAd = new Map(hafiza.map((h) => [h.urunKey, h]));
  const byKod = new Map(hafiza.filter((h) => h.tedarikciKodu).map((h) => [sade(h.tedarikciKodu!), h]));
  const out: Record<string, Oneri[]> = {};
  const benzerCache = new Map<string, Oneri[]>();
  for (const s of (g.satirlar ?? []).slice(0, 300)) {
    const key = sade(s.tedarikciUrunAdi);
    if (!key) continue;
    const h = byAd.get(key) ?? (s.tedarikciKodu ? byKod.get(sade(s.tedarikciKodu)) : undefined);
    if (h) {
      out[s.id] = [{
        kaynak: 'HAFIZA',
        odooTmplId: h.odooTmplId,
        odooProductId: h.odooProductId,
        urunAdi: h.urunAdi,
        barkod: h.barkod,
        varyantEtiketi: h.varyantEtiketi,
        aciklama: `Bu firmadan ${h.kullanim} kez bu ürünle eşleşti (son: ${h.sonKullanim.toLocaleDateString('tr-TR')})`,
      }];
      continue;
    }
    const ck = `${key}|${s.tedarikciKodu ?? ''}`;
    if (!benzerCache.has(ck)) benzerCache.set(ck, await benzerAra(s.tedarikciUrunAdi, s.tedarikciKodu));
    const b = benzerCache.get(ck)!;
    if (b.length) out[s.id] = b;
  }
  return out;
}

/** "GUCCI OPTİK ÇERÇEVE (…)" → GUCCI */
function markaAdi(urunAdi: string): string {
  const ad = String(urunAdi ?? '').toLocaleUpperCase('tr-TR').replace(/^\[[^\]]*\]\s*/, '').replace(/\s*\(.*$/, '');
  for (const k of ['OPTİK ÇERÇEVE', 'GÜNEŞ GÖZLÜĞÜ']) {
    const i = ad.indexOf(k);
    if (i > 0) return ad.slice(0, i).trim();
  }
  return ad.split(/\s+/)[0] ?? '';
}

export async function fizikiTedarikciBul(urunAdlari: string[]): Promise<Array<{ marka: string; tedarikciId: number | null; tedarikciAdi: string | null }>> {
  const kartlar = await prisma.markaTedarikci.findMany();
  const kartMap = new Map(kartlar.map((k) => [markaAnahtar(k.marka), k]));
  const sonuc = new Map<string, { marka: string; tedarikciId: number | null; tedarikciAdi: string | null }>();
  for (const ad of urunAdlari ?? []) {
    const m = markaAdi(ad);
    if (!m) continue;
    const k = kartMap.get(markaAnahtar(m));
    sonuc.set(markaAnahtar(m), { marka: k?.marka ?? m, tedarikciId: k?.tedarikciId ?? null, tedarikciAdi: k?.tedarikciAdi ?? null });
  }
  return [...sonuc.values()];
}
