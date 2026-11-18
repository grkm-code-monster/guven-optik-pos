/**
 * 18.11.2026 — "Müşteri Satış Detayları" (Satışlar menüsü)
 *
 * Personel ürünleri bizim isimlerimizle satıyor; garanti/firma görüşmesinde "aslında hangi
 * firmanın hangi ürünü" bilinmiyordu. Bu servis her satış kalemine firma tarafını ekler —
 * personelden ek giriş istemeden, sistemde zaten olan kayıtlardan:
 *   1) Özel sipariş (OzelSiparis.saleItemId): firma, firma ürün adı (depo "Firma Ürünü"),
 *      firma sipariş no, ürün girişi fatura no/tarihi, UTS karekodları, sipariş durumu.
 *   2) Stoktan satılan lot/seri: Odoo'da o lotun geldiği giriş (stock.move.line, incoming):
 *      firma (picking partner), giriş belgesi ve tarihi.
 *   3) Firmanın faturadaki ürün adı: Ürün Girişi "Bu mu?" hafızası (TedarikciUrunEslesme,
 *      ürünümüz ↔ firmanın ürün adı/kodu).
 *   4) (18.11.2026 düzeltme) Gelen e-faturanın KENDİ satırları (BekleyenFatura.kalemler —
 *      "Mal/Hizmet adı"): sipariş fatura no'su üzerinden; satır, camın derecesiyle (SPH/CYL)
 *      ya da ürün koduyla (GTIN) eşleştirilir. Firma da faturadan alınır.
 *   5) GTIN sözlüğü (backend/data/gtin-sozluk.json — eski Siber ürün kartları + UTS sorguları):
 *      karekoddan / satılan lottan / ürün barkodundan bulunan GTIN → ürün adı + marka.
 *   Satış kaleminde lot yazılmamışsa satılan lot Odoo'daki satış teslimatından okunur.
 * MALİYET DÖNMEZ (personel maliyet görmez).
 */
import * as fs from 'fs';
import * as path from 'path';
import { ItemStatus, SaleStatus } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';
import { loadOdooCategoryPaths } from '../reports/report.service';

const AZAMI_KALEM = 3000;

function parcala<T>(a: T[], n: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
  return r;
}

function fold(s: string | null | undefined): string {
  return String(s ?? '')
    .toLocaleUpperCase('tr-TR')
    .replace(/[^A-Z0-9ÇĞİÖŞÜ]+/g, ' ')
    .trim();
}

function sayiStr(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2);
}

type LotGiris = { firma: string | null; belge: string | null; tarih: string | null; gtin: string | null };

/** Karekoddan / barkoddan GTIN (14 hane). Bizim iç barkod serilerimiz (086800000…, 086800002…) GTIN sayılmaz. */
export function gtinCikar(v: string | null | undefined): string | null {
  const t = String(v ?? '').replace(/[\s()]/g, '');
  let g: string | null = null;
  const m = t.match(/^01(\d{14})/) ?? t.match(/01(\d{14})(?:10|11|17|21)/);
  if (m) g = m[1];
  else if (/^\d{13,14}$/.test(t)) g = t.padStart(14, '0');
  if (!g || g.startsWith('086800000') || g.startsWith('086800002')) return null;
  return g;
}

type SozlukKayit = { a: string; m: string; k: 'ESKI' | 'UTS' };
let sozluk: Record<string, SozlukKayit> | null = null;
function gtinSozlugu(): Record<string, SozlukKayit> {
  if (sozluk) return sozluk;
  const adaylar = [path.join(__dirname, '../../../data/gtin-sozluk.json'), path.join(process.cwd(), 'data', 'gtin-sozluk.json')];
  for (const a of adaylar) {
    try {
      if (fs.existsSync(a)) {
        sozluk = (JSON.parse(fs.readFileSync(a, 'utf8')) as { g: Record<string, SozlukKayit> }).g ?? {};
        return sozluk;
      }
    } catch (e) {
      console.error('[musteri-satis-detay] GTIN sözlüğü okunamadı:', e instanceof Error ? e.message : e);
    }
  }
  sozluk = {};
  return sozluk;
}

/** "Plus 1.56 Fotokromik Füme 0175 -0100" → [175, -100]; "ST.N.125+0175-100" → [175, -100];
 *  "SPH: +0150 CYL: -100" → [150, -100]. Yüzde birlik (0.25 → 25). Bulunamazsa null. */
export function dereceCikar(ad: string | null | undefined): [number, number] | null {
  const t = String(ad ?? '');
  const sc = t.match(/SPH\s*:?\s*([+-]?\d{2,4}(?:[.,]\d{2})?)\D+CYL\s*:?\s*([+-]?\d{2,4}(?:[.,]\d{2})?)/i);
  // önce iki işaretli sayı ("ST.N.125+0175-100" → +0175 -100), yoksa bizim ad kalıbı ("0175 -0100")
  const al = sc ?? t.match(/([+-]\d{3,4})\s*([+-]\d{3,4})(?!\d)/) ?? t.match(/(?<![\d.])(\d{4})\s+([+-]\d{4})(?!\d)/);
  if (!al) return null;
  const n = (x: string) => {
    const y = x.replace(',', '.');
    return y.includes('.') ? Math.round(Number(y) * 100) : Number(y);
  };
  const a = n(al[1]);
  const b = n(al[2]);
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : null;
}

type FaturaSatir = { stokKodu?: string; urunAdi?: string; barkod?: string };

/** Satılan lot/serilerin Odoo'daki giriş kaydı (firma + belge + tarih). Hata olursa boş döner. */
async function lotGirisleri(kalemler: Array<{ odooProductId: string | null; lotNo: string | null }>): Promise<Map<string, LotGiris>> {
  const sonuc = new Map<string, LotGiris>();
  const ciftler = kalemler
    .map((k) => ({ pid: Number(k.odooProductId), lot: String(k.lotNo ?? '').trim() }))
    .filter((k) => Number.isFinite(k.pid) && k.pid > 0 && k.lot);
  if (!ciftler.length) return sonuc;
  try {
    const lotIdToKey = new Map<number, string>();
    for (const p of parcala(ciftler, 150)) {
      const lots = (await execute(
        'stock.lot',
        'search_read',
        [[['name', 'in', [...new Set(p.map((x) => x.lot))]], ['product_id', 'in', [...new Set(p.map((x) => x.pid))]]]],
        { fields: ['id', 'name', 'ref', 'product_id'], context: { active_test: false } },
      )) as Array<{ id: number; name: string; ref: string | false; product_id: [number, string] | false }>;
      for (const l of lots) {
        if (!l.product_id) continue;
        const key = `${l.product_id[0]}|${l.name}`;
        lotIdToKey.set(l.id, key);
        // Giriş kaydı bulunamasa da lotun GTIN'i (karekod/ref) kullanılabilsin
        sonuc.set(key, { firma: null, belge: null, tarih: null, gtin: gtinCikar(l.ref || '') ?? gtinCikar(l.name) });
      }
    }
    const lotIds = [...lotIdToKey.keys()];
    for (const p of parcala(lotIds, 200)) {
      const satirlar = (await execute(
        'stock.move.line',
        'search_read',
        [[['lot_id', 'in', p], ['picking_code', '=', 'incoming'], ['state', '=', 'done']]],
        { fields: ['lot_id', 'picking_id', 'picking_partner_id', 'date'], order: 'date asc' },
      )) as Array<{ lot_id: [number, string] | false; picking_id: [number, string] | false; picking_partner_id: [number, string] | false; date: string }>;
      for (const s of satirlar) {
        const key = s.lot_id ? lotIdToKey.get(s.lot_id[0]) : undefined;
        const onceki = key ? sonuc.get(key) : undefined;
        if (!key || onceki?.belge) continue; // ilk giriş
        sonuc.set(key, {
          firma: s.picking_partner_id ? s.picking_partner_id[1] : null,
          belge: s.picking_id ? s.picking_id[1] : null,
          tarih: s.date ? String(s.date).slice(0, 10) : null,
          gtin: onceki?.gtin ?? null,
        });
      }
    }
  } catch (e) {
    console.error('[musteri-satis-detay] lot giriş bilgisi okunamadı:', e instanceof Error ? e.message : e);
  }
  return sonuc;
}

/** Satış kaleminde lot yazılmamışsa: Odoo satış siparişinin teslimatında (done) hangi lot çıktı?
 *  Dönüş: "orderId|productId" → lot adları (sırayla). Hata olursa boş. */
async function teslimatLotlari(orderIds: number[]): Promise<Map<string, string[]>> {
  const sonuc = new Map<string, string[]>();
  if (!orderIds.length) return sonuc;
  try {
    for (const p of parcala(orderIds, 100)) {
      const pickings = (await execute('stock.picking', 'search_read', [[['sale_id', 'in', p], ['state', '=', 'done']]], {
        fields: ['id', 'sale_id'],
      })) as Array<{ id: number; sale_id: [number, string] | false }>;
      const pickSale = new Map(pickings.filter((x) => x.sale_id).map((x) => [x.id, (x.sale_id as [number, string])[0]]));
      if (!pickSale.size) continue;
      const satirlar = (await execute(
        'stock.move.line',
        'search_read',
        [[['picking_id', 'in', [...pickSale.keys()]], ['lot_id', '!=', false]]],
        { fields: ['picking_id', 'product_id', 'lot_id'] },
      )) as Array<{ picking_id: [number, string] | false; product_id: [number, string] | false; lot_id: [number, string] | false }>;
      for (const s of satirlar) {
        if (!s.picking_id || !s.product_id || !s.lot_id) continue;
        const key = `${pickSale.get(s.picking_id[0])}|${s.product_id[0]}`;
        const l = sonuc.get(key) ?? [];
        l.push(s.lot_id[1]);
        sonuc.set(key, l);
      }
    }
  } catch (e) {
    console.error('[musteri-satis-detay] teslimat lotları okunamadı:', e instanceof Error ? e.message : e);
  }
  return sonuc;
}

export async function getMusteriSatisDetaylari(params: {
  branchId: string | null; // null = tüm şubeler
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}) {
  const q = String(params.q ?? '').trim();
  // Satışlar sayfasıyla aynı kural: müşteri/satış no araması tüm şubelerde yapılır.
  const where: any = q || params.branchId === null ? {} : { branchId: params.branchId };
  where.status = { notIn: [SaleStatus.DRAFT, SaleStatus.VOID] };
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {};
    if (params.dateFrom) where.createdAt.gte = new Date(params.dateFrom);
    if (params.dateTo) where.createdAt.lte = new Date(params.dateTo);
  }
  if (q) {
    where.OR = [
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q, mode: 'insensitive' } } },
      { referansNo: { contains: q, mode: 'insensitive' } },
      { id: { contains: q, mode: 'insensitive' } },
    ];
  }

  const kalemler = await prisma.saleItem.findMany({
    where: { status: { not: ItemStatus.VOID }, sale: where },
    select: {
      id: true,
      saleId: true,
      odooProductId: true,
      odooProductName: true,
      odooCategoryId: true,
      lotNo: true,
      qty: true,
      lineTotal: true,
      status: true,
      linkedItemId: true,
      linkType: true,
      maintenanceNature: true,
      maintenanceDescription: true,
      deliveryDate: true,
      product: { select: { name: true } },
      prescription: {
        select: { prescriptionType: true, r_sph: true, r_cyl: true, r_aks: true, r_add: true, l_sph: true, l_cyl: true, l_aks: true, l_add: true },
      },
      sale: {
        select: {
          id: true,
          referansNo: true,
          createdAt: true,
          branchId: true,
          odooSaleOrderId: true,
          customer: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ sale: { createdAt: 'desc' } }],
    take: AZAMI_KALEM + 1,
  });
  const kesildi = kalemler.length > AZAMI_KALEM;
  if (kesildi) kalemler.length = AZAMI_KALEM;

  const ids = kalemler.map((k) => k.id);

  // Lotu yazılmamış kalemler için teslimattan lot (aynı üründen birden çok kalem varsa sırayla dağıtılır)
  const teslimat = await teslimatLotlari([
    ...new Set(kalemler.filter((k) => !k.lotNo && k.sale.odooSaleOrderId).map((k) => k.sale.odooSaleOrderId as number)),
  ]);
  const lotKalemi = new Map<string, string>(); // saleItemId → lot adı
  const dagitilan = new Map<string, number>();
  for (const k of kalemler) {
    if (k.lotNo) {
      lotKalemi.set(k.id, k.lotNo);
      continue;
    }
    if (!k.sale.odooSaleOrderId || !k.odooProductId) continue;
    const key = `${k.sale.odooSaleOrderId}|${Number(k.odooProductId)}`;
    const liste = teslimat.get(key);
    if (!liste?.length) continue;
    const i = dagitilan.get(key) ?? 0;
    const lot = liste[Math.min(i, liste.length - 1)];
    dagitilan.set(key, i + 1);
    lotKalemi.set(k.id, lot);
  }

  const [subeler, siparisler, kategoriYollari, lotlar] = await Promise.all([
    prisma.branch.findMany({
      where: { id: { in: [...new Set(kalemler.map((k) => k.sale.branchId))] } },
      select: { id: true, name: true, code: true },
    }),
    ids.length
      ? prisma.ozelSiparis.findMany({
          where: { saleItemId: { in: ids } },
          select: {
            saleItemId: true,
            tedarikciAdi: true,
            firmaUrunu: true,
            urunAdi: true,
            tedarikciSiparisNo: true,
            urunGirisFaturaNo: true,
            urunGirisTarihi: true,
            gercekGelisTarihi: true,
            durum: true,
            createdAt: true,
            karekodlar: { select: { karekod: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    loadOdooCategoryPaths(kalemler.map((k) => k.odooCategoryId)),
    lotGirisleri(kalemler.map((k) => ({ odooProductId: k.odooProductId, lotNo: lotKalemi.get(k.id) ?? null }))),
  ]);
  const subeMap = new Map(subeler.map((b) => [b.id, b]));
  const siparisMap = new Map<string, (typeof siparisler)[number]>();
  for (const s of siparisler) if (s.saleItemId && !siparisMap.has(s.saleItemId)) siparisMap.set(s.saleItemId, s);

  // Firmanın ürün adı hafızası (Ürün Girişi "Bu mu?")
  const urunIds = [...new Set(kalemler.map((k) => Number(k.odooProductId)).filter((n) => Number.isFinite(n) && n > 0))];
  const eslesmeler = urunIds.length
    ? await prisma.tedarikciUrunEslesme.findMany({
        where: { odooProductId: { in: urunIds } },
        select: { odooProductId: true, tedarikciAdi: true, tedarikciKey: true, tedarikciUrunAdi: true, tedarikciKodu: true, sonKullanim: true },
        orderBy: { sonKullanim: 'desc' },
      })
    : [];
  const eslesmeMap = new Map<number, typeof eslesmeler>();
  for (const e of eslesmeler) {
    if (e.odooProductId == null) continue;
    const l = eslesmeMap.get(e.odooProductId) ?? [];
    l.push(e);
    eslesmeMap.set(e.odooProductId, l);
  }

  // Gelen e-faturalar (sipariş fatura no'su ile)
  const faturaNolar = [...new Set(siparisler.map((s) => s.urunGirisFaturaNo).filter((x): x is string => Boolean(x)))];
  const faturalar = faturaNolar.length
    ? await prisma.bekleyenFatura.findMany({
        where: {
          OR: [{ uyumsoftNo: { in: faturaNolar } }, { odooFaturaNo: { in: faturaNolar } }, { tedarikciIrsaliyeNo: { in: faturaNolar } }],
        },
        select: { uyumsoftNo: true, odooFaturaNo: true, tedarikciIrsaliyeNo: true, tedarikciAdi: true, kalemler: true },
      })
    : [];
  const faturaMap = new Map<string, { firma: string | null; satirlar: FaturaSatir[] }>();
  for (const f of faturalar) {
    let satirlar: FaturaSatir[] = [];
    try {
      satirlar = JSON.parse(f.kalemler || '[]') as FaturaSatir[];
    } catch {
      satirlar = [];
    }
    for (const no of [f.uyumsoftNo, f.odooFaturaNo, f.tedarikciIrsaliyeNo]) {
      if (no && !faturaMap.has(no)) faturaMap.set(no, { firma: f.tedarikciAdi, satirlar });
    }
  }
  function faturaSatiriBul(f: { satirlar: FaturaSatir[] }, urunAdi: string, gtin: string | null): FaturaSatir | null {
    const s = f.satirlar.filter((x) => x && (x.urunAdi || x.stokKodu));
    if (!s.length) return null;
    if (gtin) {
      const g = s.find((x) => [x.barkod, x.stokKodu].some((v) => gtinCikar(v) === gtin));
      if (g) return g;
    }
    const bizim = dereceCikar(urunAdi);
    if (bizim) {
      const d = s.filter((x) => {
        const o = dereceCikar(x.urunAdi) ?? dereceCikar(x.stokKodu);
        return o && o[0] === bizim[0] && o[1] === bizim[1];
      });
      if (d.length) return d[0];
    }
    const farkli = new Set(s.map((x) => x.urunAdi || x.stokKodu));
    return farkli.size === 1 ? s[0] : null;
  }

  // Ürün kartlarımızın barkodu (çerçevelerde çoğu zaman üreticinin GTIN'i)
  const urunBarkod = new Map<number, string>();
  try {
    for (const p of parcala(urunIds, 300)) {
      const r = (await execute('product.product', 'read', [p], { fields: ['barcode'], context: { active_test: false } })) as Array<{ id: number; barcode: string | false }>;
      for (const x of r) if (x.barcode) urunBarkod.set(x.id, String(x.barcode));
    }
  } catch (e) {
    console.error('[musteri-satis-detay] ürün barkodları okunamadı:', e instanceof Error ? e.message : e);
  }
  const gs = gtinSozlugu();

  const satirlar = kalemler.map((k) => {
    const sip = siparisMap.get(k.id);
    const lotAdi = lotKalemi.get(k.id) ?? null;
    const lot = lotAdi && k.odooProductId ? lotlar.get(`${Number(k.odooProductId)}|${String(lotAdi).trim()}`) : undefined;
    // GTIN: sipariş karekodu → satılan lot → ürün kartı barkodu
    const gtin =
      sip?.karekodlar?.map((x) => gtinCikar(x.karekod)).find(Boolean) ??
      lot?.gtin ??
      gtinCikar(urunBarkod.get(Number(k.odooProductId)) ?? null) ??
      null;
    const kayit = gtin ? gs[gtin] : undefined;
    const fatura = sip?.urunGirisFaturaNo ? faturaMap.get(sip.urunGirisFaturaNo) : undefined;
    const fSatir = fatura ? faturaSatiriBul(fatura, k.odooProductName ?? '', gtin) : null;
    const firma = sip?.tedarikciAdi || fatura?.firma || lot?.firma || null;
    // Firma ürün adı: önce depoda girilen "Firma Ürünü", yoksa o firmanın fatura adı hafızası
    let firmaUrunAdi: string | null = sip?.firmaUrunu?.trim() || null;
    let firmaUrunKodu: string | null = null;
    let firmaUrunKaynak: 'SIPARIS' | 'FATURA' | 'FATURA_HAFIZASI' | 'UTS' | 'ESKI' | null = firmaUrunAdi ? 'SIPARIS' : null;
    if (!firmaUrunAdi && fSatir) {
      firmaUrunAdi = (fSatir.urunAdi || fSatir.stokKodu || '').trim() || null;
      firmaUrunKodu = fSatir.stokKodu && fSatir.stokKodu !== fSatir.urunAdi ? fSatir.stokKodu : null;
      if (firmaUrunAdi) firmaUrunKaynak = 'FATURA';
    }
    if (!firmaUrunAdi) {
      const adaylar = eslesmeMap.get(Number(k.odooProductId)) ?? [];
      const f = fold(firma);
      const uygun =
        (f && adaylar.find((a) => fold(a.tedarikciAdi).includes(f) || f.includes(fold(a.tedarikciAdi)) || fold(a.tedarikciKey) === f)) ||
        (adaylar.length === 1 ? adaylar[0] : undefined);
      if (uygun) {
        firmaUrunAdi = uygun.tedarikciUrunAdi;
        firmaUrunKodu = uygun.tedarikciKodu ?? null;
        firmaUrunKaynak = 'FATURA_HAFIZASI';
      }
    }
    if (!firmaUrunAdi && kayit) {
      firmaUrunAdi = kayit.a;
      firmaUrunKaynak = kayit.k;
    }
    const rx = k.prescription;
    const recete = rx
      ? `Sağ ${sayiStr(rx.r_sph)} ${sayiStr(rx.r_cyl)} x${rx.r_aks ?? '—'}${rx.r_add != null ? ` Add ${sayiStr(rx.r_add)}` : ''} · Sol ${sayiStr(rx.l_sph)} ${sayiStr(rx.l_cyl)} x${rx.l_aks ?? '—'}${rx.l_add != null ? ` Add ${sayiStr(rx.l_add)}` : ''}`
      : null;
    const sube = subeMap.get(k.sale.branchId);
    const urunAdi = k.odooProductName || (k.product?.name && !k.product.name.includes('PLACEHOLDER') ? k.product.name : null) || 'Ürün';
    return {
      id: k.id,
      saleId: k.saleId,
      satisNo: k.sale.referansNo ?? k.saleId.slice(-12),
      tarih: k.sale.createdAt,
      sube: sube ? sube.code || sube.name : null,
      subeId: k.sale.branchId,
      personel: k.sale.user?.name ?? null,
      musteri: k.sale.customer?.name ?? null,
      musteriTelefon: k.sale.customer?.phone ?? null,
      musteriId: k.sale.customer?.id ?? null,
      urunAdi,
      kategori: k.odooCategoryId != null ? kategoriYollari.get(k.odooCategoryId) ?? null : null,
      odooCategoryId: k.odooCategoryId,
      adet: k.qty,
      tutar: Number(k.lineTotal),
      kalemDurum: k.status,
      teslimTarihi: k.deliveryDate,
      recete,
      receteTipi: rx?.prescriptionType ?? null,
      lotNo: lotAdi,
      gtin,
      marka: kayit?.m || null,
      // Fatura/sipariş adı varken de ürün kaydındaki (UTS / eski sistem) tam tanım ayrıca gösterilir
      urunKaydiAdi: kayit && kayit.a !== firmaUrunAdi ? kayit.a : null,
      urunKaydiKaynak: kayit && kayit.a !== firmaUrunAdi ? kayit.k : null,
      linkedItemId: k.linkedItemId,
      linkType: k.linkType,
      nitelik: k.maintenanceNature,
      aciklama: k.maintenanceDescription,
      firma,
      firmaUrunAdi,
      firmaUrunKodu,
      firmaUrunKaynak,
      firmaSiparisNo: sip?.tedarikciSiparisNo ?? null,
      siparisDurum: sip?.durum ?? null,
      siparisTarihi: sip?.createdAt ?? null,
      faturaNo: sip?.urunGirisFaturaNo ?? null,
      gelisTarihi: sip?.urunGirisTarihi ?? sip?.gercekGelisTarihi ?? (lot?.tarih ? new Date(lot.tarih) : null),
      girisBelgesi: lot?.belge ?? null,
      karekodlar: sip?.karekodlar?.map((x) => x.karekod) ?? [],
    };
  });

  return { satirlar, kesildi, azami: AZAMI_KALEM };
}
