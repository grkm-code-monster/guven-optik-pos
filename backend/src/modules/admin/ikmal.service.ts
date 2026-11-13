/**
 * 13.11.2026 — Mağaza İkmali (Stok Yönetimi → "Mağaza İkmali").
 *
 * Kural (v1, çerçeve + güneş): mağazanın SATTIĞI stoklu ürünün yerine Ana Depo'dan BİREBİR sevk.
 * Her satılan varyant için:
 *   1) Ana Depo'da aynısı var mı → "Depodan gönder"
 *   2) Yoksa aynı modelin başka renk/ölçüsü Ana Depo'da var mı → "Alternatif"
 *   3) Başka mağazada duruyor mu → bilgi
 *   4) Hiçbiri yoksa → "Tükendi" (satın alma listesi)
 *
 * Satışlar yeni sistemden (POS) okunur; stoklar Odoo'dan canlı. Taslak sadece bu programda tutulur,
 * "Transferi başlat" denince mevcut transfer akışıyla (Odoo) gerçek transfer açılır.
 */
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';
import { createTransfer } from '../transfer/transfer.service';

const CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };
const DEPO = 'ANADEPO';
const LOC_ID_TO_KOD = new Map(Object.entries(LOKASYON_ID_MAP).map(([k, id]) => [id, k]));

export type IkmalTur = 'CERCEVE' | 'GUNES' | '';

export type IkmalAlternatif = { varyantId: number; renk: string; olcu: string; depoAdet: number };

export type IkmalSatir = {
  varyantId: number;
  tmplId: number | null;
  sablonAdi: string;
  model: string;
  renk: string;
  olcu: string;
  barkod: string | null;
  kategori: string;
  tur: 'CERCEVE' | 'GUNES';
  fiyat: number;
  satisAdet: number;
  sonSatis: string;
  magazaAdet: number;
  depoAdet: number;
  digerKonumlar: { lokasyon: string; adet: number }[];
  taslaktaAdet: number;
  oneri: 'GONDER' | 'ALTERNATIF' | 'TUKENDI';
  onerilenAdet: number;
  alternatifler: IkmalAlternatif[];
};

function m2oId(v: unknown): number | null {
  return Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null;
}
function m2oAd(v: unknown): string {
  return Array.isArray(v) && typeof v[1] === 'string' ? v[1] : '';
}
function buyuk(s: string) {
  return s.toLocaleUpperCase('tr-TR');
}
function turBul(kategori: string): 'CERCEVE' | 'GUNES' | null {
  const k = buyuk(kategori);
  if (k.includes('ÇERÇEVE')) return 'CERCEVE';
  if (k.includes('GÜNEŞ')) return 'GUNES';
  return null;
}
function gunBasi(t: string) {
  return new Date(`${t}T00:00:00+03:00`);
}
function gunSonu(t: string) {
  return new Date(`${t}T23:59:59.999+03:00`);
}

async function parcaOku<T>(model: string, ids: number[], fields: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 2000) {
    const p = ids.slice(i, i + 2000);
    if (p.length) out.push(...((await execute(model, 'read', [p], { fields, ...CTX })) as T[]));
  }
  return out;
}

type Urun = {
  id: number;
  product_tmpl_id: [number, string] | false;
  categ_id: [number, string] | false;
  barcode: string | false;
  lst_price: number;
  product_template_attribute_value_ids: number[];
};

async function nitelikHaritasi(urunler: Urun[]) {
  const ptavIds = [...new Set(urunler.flatMap((u) => u.product_template_attribute_value_ids ?? []))];
  const ptav = await parcaOku<{ id: number; attribute_id: [number, string] | false; name: string }>(
    'product.template.attribute.value', ptavIds, ['id', 'attribute_id', 'name'],
  );
  const pm = new Map(ptav.map((p) => [p.id, { attr: buyuk(m2oAd(p.attribute_id)), deger: String(p.name ?? '').trim() }]));
  const sonuc = new Map<number, { model: string; renk: string; olcu: string }>();
  for (const u of urunler) {
    const n = { model: '', renk: '', olcu: '' };
    for (const id of u.product_template_attribute_value_ids ?? []) {
      const p = pm.get(id);
      if (!p) continue;
      if (p.attr.startsWith('MODEL')) n.model = p.deger;
      else if (p.attr.startsWith('RENK')) n.renk = p.deger;
      else if (p.attr.startsWith('ÖLÇÜ') || p.attr.startsWith('OLCU')) n.olcu = p.deger;
    }
    if (!n.model) {
      // Model bazlı ayrı şablonlar: "ALYSON SASSO OPTİK ÇERÇEVE SP8254PO"
      const ad = buyuk(m2oAd(u.product_tmpl_id));
      const m = /(OPTİK ÇERÇEVE|GÜNEŞ GÖZLÜĞÜ)\s+(\S+)/.exec(ad);
      if (m) n.model = m[2];
    }
    sonuc.set(u.id, n);
  }
  return sonuc;
}

/** Son gönderilen ikmalin tarihi ("son sevkten bu yana" dönemi için). */
export async function sonSevkTarihi(lokasyon: string): Promise<string | null> {
  const t = await prisma.ikmalTaslak.findFirst({
    where: { hedefLokasyon: lokasyon, durum: 'GONDERILDI' },
    orderBy: { gonderildi: 'desc' },
    select: { gonderildi: true },
  });
  return t?.gonderildi ? t.gonderildi.toISOString() : null;
}

export async function ikmalSatilanlar(f: { lokasyon: string; bas: string; bit: string; tur?: IkmalTur }): Promise<{
  satirlar: IkmalSatir[];
  satisKalemSayisi: number;
}> {
  if (!LOKASYON_ID_MAP[f.lokasyon] || f.lokasyon === DEPO) throw new Error('Geçerli bir mağaza seçin');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.bas) || !/^\d{4}-\d{2}-\d{2}$/.test(f.bit)) throw new Error('Tarih aralığı geçersiz');
  const branch = await prisma.branch.findFirst({ where: { code: f.lokasyon }, select: { id: true } });
  if (!branch) throw new Error(`${f.lokasyon} şubesi bulunamadı`);

  const kalemler = await prisma.saleItem.findMany({
    where: {
      odooProductId: { not: null },
      sale: {
        branchId: branch.id,
        status: { notIn: ['DRAFT', 'VOID'] },
        createdAt: { gte: gunBasi(f.bas), lte: gunSonu(f.bit) },
      },
    },
    select: { odooProductId: true, qty: true, sale: { select: { createdAt: true } } },
  });

  const satis = new Map<number, { adet: number; son: Date }>();
  for (const k of kalemler) {
    const id = Number(k.odooProductId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const o = satis.get(id) ?? { adet: 0, son: k.sale.createdAt };
    o.adet += Math.max(0, Number(k.qty ?? 0));
    if (k.sale.createdAt > o.son) o.son = k.sale.createdAt;
    satis.set(id, o);
  }
  const pids = [...satis.keys()];
  if (!pids.length) return { satirlar: [], satisKalemSayisi: kalemler.length };

  const urunler = (await parcaOku<Urun>('product.product', pids, [
    'id', 'product_tmpl_id', 'categ_id', 'barcode', 'lst_price', 'product_template_attribute_value_ids',
  ])).filter((u) => {
    const t = turBul(m2oAd(u.categ_id));
    return t && (!f.tur || t === f.tur);
  });
  if (!urunler.length) return { satirlar: [], satisKalemSayisi: kalemler.length };
  const nitelik = await nitelikHaritasi(urunler);

  // Bu varyantların tüm konumlardaki stoğu
  type Q = { product_id: [number, string] | false; location_id: [number, string] | false; quantity: number };
  const quantlar = (await execute('stock.quant', 'search_read', [[
    ['product_id', 'in', urunler.map((u) => u.id)],
    ['quantity', '>', 0],
    ['location_id', 'in', Object.values(LOKASYON_ID_MAP)],
  ]], { fields: ['product_id', 'location_id', 'quantity'], limit: 20000, ...CTX })) as Q[];
  const stok = new Map<number, Map<string, number>>();
  for (const q of quantlar) {
    const pid = m2oId(q.product_id);
    const kod = LOC_ID_TO_KOD.get(m2oId(q.location_id) ?? -1);
    if (!pid || !kod) continue;
    const m = stok.get(pid) ?? new Map<string, number>();
    m.set(kod, (m.get(kod) ?? 0) + Number(q.quantity ?? 0));
    stok.set(pid, m);
  }

  // Alternatifler: aynı şablon + aynı MODEL, Ana Depo'da stoklu diğer varyantlar
  const tmplIds = [...new Set(urunler.map((u) => m2oId(u.product_tmpl_id)).filter((x): x is number => !!x))];
  const kardesler = (await execute('product.product', 'search_read', [[['product_tmpl_id', 'in', tmplIds]]], {
    fields: ['id', 'product_tmpl_id', 'categ_id', 'barcode', 'lst_price', 'product_template_attribute_value_ids'],
    limit: 50000,
    ...CTX,
  })) as Urun[];
  const depoQ = (await execute('stock.quant', 'search_read', [[
    ['product_id', 'in', kardesler.map((k) => k.id)],
    ['quantity', '>', 0],
    ['location_id', '=', LOKASYON_ID_MAP[DEPO]],
  ]], { fields: ['product_id', 'quantity'], limit: 50000, ...CTX })) as Q[];
  const depoAdet = new Map<number, number>();
  for (const q of depoQ) {
    const pid = m2oId(q.product_id);
    if (pid) depoAdet.set(pid, (depoAdet.get(pid) ?? 0) + Number(q.quantity ?? 0));
  }
  const stokluKardes = kardesler.filter((k) => (depoAdet.get(k.id) ?? 0) > 0);
  const kardesNitelik = await nitelikHaritasi(stokluKardes);

  // Bu mağaza için açık taslaklarda zaten bekleyenler
  const acik = await prisma.ikmalTaslak.findMany({
    where: { hedefLokasyon: f.lokasyon, durum: 'TASLAK' },
    select: { kalemler: true },
  });
  const taslakta = new Map<number, number>();
  for (const t of acik) {
    for (const k of (t.kalemler as Array<{ varyantId: number; satilanVaryantId?: number; adet: number }>) ?? []) {
      const id = Number(k.satilanVaryantId ?? k.varyantId);
      taslakta.set(id, (taslakta.get(id) ?? 0) + Number(k.adet ?? 0));
    }
  }

  const satirlar: IkmalSatir[] = urunler.map((u) => {
    const n = nitelik.get(u.id) ?? { model: '', renk: '', olcu: '' };
    const s = satis.get(u.id)!;
    const st = stok.get(u.id) ?? new Map<string, number>();
    const depo = Math.round(st.get(DEPO) ?? 0);
    const tmplId = m2oId(u.product_tmpl_id);
    const alternatifler: IkmalAlternatif[] = stokluKardes
      .filter((k) => k.id !== u.id && m2oId(k.product_tmpl_id) === tmplId)
      .map((k) => ({ k, kn: kardesNitelik.get(k.id) ?? { model: '', renk: '', olcu: '' } }))
      .filter(({ kn }) => !n.model || buyuk(kn.model) === buyuk(n.model))
      .map(({ k, kn }) => ({ varyantId: k.id, renk: kn.renk, olcu: kn.olcu, depoAdet: Math.round(depoAdet.get(k.id) ?? 0) }))
      .sort((a, b) => b.depoAdet - a.depoAdet)
      .slice(0, 8);
    const zatenTaslakta = taslakta.get(u.id) ?? 0;
    const ihtiyac = Math.max(0, Math.round(s.adet) - zatenTaslakta);
    const oneri: IkmalSatir['oneri'] = depo > 0 ? 'GONDER' : alternatifler.length ? 'ALTERNATIF' : 'TUKENDI';
    return {
      varyantId: u.id,
      tmplId,
      sablonAdi: m2oAd(u.product_tmpl_id),
      model: n.model,
      renk: n.renk,
      olcu: n.olcu,
      barkod: typeof u.barcode === 'string' && u.barcode ? u.barcode : null,
      kategori: m2oAd(u.categ_id),
      tur: turBul(m2oAd(u.categ_id))!,
      fiyat: Number(u.lst_price ?? 0),
      satisAdet: Math.round(s.adet),
      sonSatis: s.son.toISOString(),
      magazaAdet: Math.round(st.get(f.lokasyon) ?? 0),
      depoAdet: depo,
      digerKonumlar: [...st.entries()]
        .filter(([k]) => k !== DEPO && k !== f.lokasyon)
        .map(([lokasyon, adet]) => ({ lokasyon, adet: Math.round(adet) }))
        .filter((x) => x.adet > 0),
      taslaktaAdet: zatenTaslakta,
      oneri,
      onerilenAdet: oneri === 'GONDER' ? Math.min(ihtiyac, depo) : 0,
      alternatifler,
    };
  });
  const sira = { GONDER: 0, ALTERNATIF: 1, TUKENDI: 2 };
  satirlar.sort((a, b) => sira[a.oneri] - sira[b.oneri] || a.sablonAdi.localeCompare(b.sablonAdi, 'tr') || a.model.localeCompare(b.model, 'tr'));
  return { satirlar, satisKalemSayisi: kalemler.length };
}

// ───────────────────────── Taslaklar ─────────────────────────

export type IkmalKalem = {
  varyantId: number;
  urunAdi: string;
  nitelik: string;
  adet: number;
  sebep: 'SATIS' | 'ALTERNATIF';
  satilanVaryantId?: number;
};

function kalemTemizle(k: IkmalKalem[]): IkmalKalem[] {
  return (Array.isArray(k) ? k : [])
    .map((x) => ({
      varyantId: Number(x.varyantId),
      urunAdi: String(x.urunAdi ?? '').slice(0, 300),
      nitelik: String(x.nitelik ?? '').slice(0, 200),
      adet: Math.max(1, Math.round(Number(x.adet) || 1)),
      sebep: x.sebep === 'ALTERNATIF' ? 'ALTERNATIF' as const : 'SATIS' as const,
      ...(x.satilanVaryantId ? { satilanVaryantId: Number(x.satilanVaryantId) } : {}),
    }))
    .filter((x) => Number.isInteger(x.varyantId) && x.varyantId > 0);
}

export async function taslakOlustur(girdi: {
  hedefLokasyon: string;
  kalemler: IkmalKalem[];
  donemBas?: string;
  donemBit?: string;
  aciklama?: string;
}, kullanici: { id: string | null; ad: string | null }) {
  if (!LOKASYON_ID_MAP[girdi.hedefLokasyon] || girdi.hedefLokasyon === DEPO) throw new Error('Geçerli bir mağaza seçin');
  const kalemler = kalemTemizle(girdi.kalemler);
  if (!kalemler.length) throw new Error('Taslakta en az bir ürün olmalı');
  return prisma.ikmalTaslak.create({
    data: {
      hedefLokasyon: girdi.hedefLokasyon,
      kalemler,
      donemBas: girdi.donemBas ? gunBasi(girdi.donemBas) : null,
      donemBit: girdi.donemBit ? gunSonu(girdi.donemBit) : null,
      aciklama: girdi.aciklama?.slice(0, 500) || null,
      olusturanId: kullanici.id,
      olusturanAdi: kullanici.ad,
    },
  });
}

export async function taslakListesi(f: { lokasyon?: string; durum?: string }) {
  return prisma.ikmalTaslak.findMany({
    where: {
      ...(f.lokasyon ? { hedefLokasyon: f.lokasyon } : {}),
      ...(f.durum ? { durum: f.durum } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function taslakGuncelle(id: string, kalemler: IkmalKalem[], aciklama?: string) {
  const t = await prisma.ikmalTaslak.findUnique({ where: { id } });
  if (!t) throw new Error('Taslak bulunamadı');
  if (t.durum !== 'TASLAK') throw new Error('Sadece TASLAK durumundaki kayıt değiştirilebilir');
  const temiz = kalemTemizle(kalemler);
  if (!temiz.length) throw new Error('Taslakta en az bir ürün olmalı');
  return prisma.ikmalTaslak.update({ where: { id }, data: { kalemler: temiz, ...(aciklama !== undefined ? { aciklama } : {}) } });
}

export async function taslakIptal(id: string) {
  const t = await prisma.ikmalTaslak.findUnique({ where: { id } });
  if (!t) throw new Error('Taslak bulunamadı');
  if (t.durum !== 'TASLAK') throw new Error('Sadece TASLAK iptal edilebilir');
  return prisma.ikmalTaslak.update({ where: { id }, data: { durum: 'IPTAL' } });
}

/**
 * Toplama listesi: her kalem için Ana Depo'da hangi lotların (seri no) alınacağı — en eski giriş önce.
 * Transfer de aynı seçimle başlatılır.
 */
export async function taslakToplamaListesi(id: string) {
  const t = await prisma.ikmalTaslak.findUnique({ where: { id } });
  if (!t) throw new Error('Taslak bulunamadı');
  const kalemler = (t.kalemler as IkmalKalem[]) ?? [];
  const pids = [...new Set(kalemler.map((k) => k.varyantId))];
  type Q = { product_id: [number, string] | false; lot_id: [number, string] | false; quantity: number; in_date: string | false };
  const quantlar = pids.length
    ? (await execute('stock.quant', 'search_read', [[
      ['product_id', 'in', pids],
      ['quantity', '>', 0],
      ['location_id', '=', LOKASYON_ID_MAP[t.kaynakLokasyon] ?? LOKASYON_ID_MAP[DEPO]],
    ]], { fields: ['product_id', 'lot_id', 'quantity', 'in_date'], order: 'in_date asc, id asc', limit: 20000, ...CTX })) as Q[]
    : [];
  const varyantQ = new Map<number, Q[]>();
  for (const q of quantlar) {
    const pid = m2oId(q.product_id);
    if (!pid) continue;
    varyantQ.set(pid, [...(varyantQ.get(pid) ?? []), q]);
  }
  const kullanilan = new Set<number>();
  const satirlar = kalemler.map((k) => {
    const secilen: { lotId: number | null; lotNo: string; adet: number }[] = [];
    let kalan = k.adet;
    for (const q of varyantQ.get(k.varyantId) ?? []) {
      if (kalan <= 0) break;
      const lotId = m2oId(q.lot_id);
      if (lotId && kullanilan.has(lotId)) continue;
      const al = Math.min(kalan, Math.floor(Number(q.quantity ?? 0)));
      if (al <= 0) continue;
      if (lotId) kullanilan.add(lotId);
      secilen.push({ lotId, lotNo: m2oAd(q.lot_id), adet: al });
      kalan -= al;
    }
    return { ...k, lotlar: secilen, eksik: Math.max(0, kalan) };
  });
  return { taslak: t, satirlar };
}

export async function taslakGonder(id: string, personel: string | null) {
  const t = await prisma.ikmalTaslak.findUnique({ where: { id } });
  if (!t) throw new Error('Taslak bulunamadı');
  if (t.durum !== 'TASLAK') throw new Error('Bu taslak zaten gönderilmiş ya da iptal edilmiş');
  const { satirlar } = await taslakToplamaListesi(id);
  const eksikler = satirlar.filter((s) => s.eksik > 0);
  if (eksikler.length) {
    return {
      success: false,
      message: `Ana Depo'da yeterli stok yok: ${eksikler.map((e) => `${e.urunAdi} ${e.nitelik} (eksik ${e.eksik})`).join('; ')}. Taslağı düzeltip tekrar deneyin.`,
    };
  }
  const urunler = satirlar.flatMap((s) => s.lotlar.map((l) => ({
    id: s.varyantId,
    lotId: l.lotId ?? undefined,
    lotNo: l.lotNo || undefined,
    adet: l.adet,
    ad: `${s.urunAdi}${s.nitelik ? ` (${s.nitelik})` : ''}`,
  })));
  const sonuc = (await createTransfer({
    cikisLokasyon: t.kaynakLokasyon,
    girisLokasyon: t.hedefLokasyon,
    urunler,
    referans: `İKMAL #${t.no}`,
    personel: personel ?? 'Depo (ikmal)',
    not: t.aciklama ?? undefined,
  })) as { success?: boolean; message?: string; transferRef?: string; refNo?: string };
  if (!sonuc || sonuc.success === false) {
    return { success: false, message: sonuc?.message ?? 'Transfer başlatılamadı' };
  }
  await prisma.ikmalTaslak.update({
    where: { id },
    data: {
      durum: 'GONDERILDI',
      gonderildi: new Date(),
      transferRef: sonuc.transferRef ?? sonuc.refNo ?? null,
      transferSonuc: JSON.parse(JSON.stringify(sonuc)),
    },
  });
  return { success: true, message: sonuc.message ?? 'Transfer başlatıldı', refNo: sonuc.refNo ?? sonuc.transferRef ?? null };
}
