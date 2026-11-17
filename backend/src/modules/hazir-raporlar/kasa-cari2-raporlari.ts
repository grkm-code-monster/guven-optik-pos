/**
 * 17.11.2026 — Hazır Raporlar Faz 2: Nakit Akış, Borç Yaşlandırma, Kesilen Faturalar,
 * Reçete Listesi, Ürün / Lens Listesi.
 */
import { prisma } from '../../database/prisma';
import { execute } from '../odoo/odoo.service';
import { acikHesapDurumu } from './musteri-raporlari';
import {
  GECERSIZ_SATIS,
  GUN_MS,
  KATEGORI_ADI,
  ODOO_CTX,
  STOK_LOKASYONLARI,
  aralik,
  sayi,
  subeFiltresi,
  subeler,
  trGun,
  trSaat,
  varyantMaliyetleri,
  yuvarla,
} from './ortak';
import { fotograf, kategoriYoldan, stokNotu, urunFiltresi, urunleriOku } from './stok-raporlari';
import { RaporHatasi, type CalistirmaBaglami, type Filtre, type RaporSonuc, type Satir } from './tipler';

const dbGun = (d: Date) => d.toISOString().slice(0, 10); // @db.Date alanı → YYYY-MM-DD

function gunler(bas: string, bit: string): string[] {
  const out: string[] = [];
  for (let t = new Date(`${bas}T12:00:00Z`).getTime(); ; t += GUN_MS) {
    const g = new Date(t).toISOString().slice(0, 10);
    if (g > bit) break;
    out.push(g);
  }
  return out;
}

// ───────────────────────── Nakit Akış ─────────────────────────

export const NAKIT_GRUPLAMA = [
  { key: 'gun', label: 'Şube × gün' },
  { key: 'sube', label: 'Şube toplamı' },
  { key: 'cikis', label: 'Nakit çıkışları (tek tek)' },
];

export async function nakitAkis(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  if (r.gunSayisi > 186) throw new RaporHatasi('Nakit akış en fazla 6 ay için alınabilir.');
  const sb = await subeler();
  const subeIds = subeFiltresi(f) ?? [...sb.keys()];
  const gruplama = f.gruplama || 'gun';
  const once = new Date(r.gte.getTime() - 1);
  const basDb = new Date(`${r.bas}T00:00:00Z`);
  const bitDb = new Date(`${r.bit}T00:00:00Z`);

  if (gruplama === 'cikis') {
    const cikis = await prisma.cashMovement.findMany({
      where: { branchId: { in: subeIds }, type: 'CASH_OUT', createdAt: { gte: r.gte, lte: r.lte } },
      orderBy: { createdAt: 'asc' },
    });
    const kul = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(cikis.map((c) => c.userId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    return {
      kolonlar: [
        { key: 'tarih', label: 'Tarih', tip: 'tarihSaat' },
        { key: 'sube', label: 'Şube', tip: 'metin' },
        { key: 'personel', label: 'Giren', tip: 'metin' },
        { key: 'aciklama', label: 'Açıklama', tip: 'metin' },
        { key: 'tutar', label: 'Tutar', tip: 'para', toplam: true },
      ],
      satirlar: cikis.map((c) => ({
        tarih: trSaat(c.createdAt),
        sube: sb.get(c.branchId)?.kod ?? '',
        personel: kul.get(c.userId) ?? '',
        aciklama: c.description,
        tutar: yuvarla(sayi(c.amount)),
      })),
    };
  }

  type Gun = { satis: number; manuel: number; duzeltme: number; cikis: number };
  const bos = (): Gun => ({ satis: 0, manuel: 0, duzeltme: 0, cikis: 0 });
  const veri = new Map<string, Map<string, Gun>>(); // şube → gün → değerler
  const devir = new Map<string, number>();
  const g = (sube: string, gun: string) => {
    let m = veri.get(sube);
    if (!m) veri.set(sube, (m = new Map()));
    let o = m.get(gun);
    if (!o) m.set(gun, (o = bos()));
    return o;
  };

  for (const subeId of subeIds) {
    const tahsilatSube = { OR: [{ tahsilatBranchId: subeId }, { tahsilatBranchId: null, sale: { branchId: subeId } }] };
    const [nakitOnce, manuelOnce, cikisOnce, duzOnce] = await Promise.all([
      prisma.payment.aggregate({ where: { paymentType: 'CASH', sale: { status: 'PAID' }, ...tahsilatSube, createdAt: { lte: once } }, _sum: { grossAmount: true } }),
      prisma.cashMovement.aggregate({
        where: { branchId: subeId, type: 'CASH_IN', description: { startsWith: 'MANUEL_TAHSILAT:' }, createdAt: { lte: once } },
        _sum: { amount: true },
      }),
      prisma.cashMovement.aggregate({ where: { branchId: subeId, type: 'CASH_OUT', createdAt: { lte: once } }, _sum: { amount: true } }),
      prisma.kasaDuzeltme.aggregate({ where: { branchId: subeId, tarih: { lt: basDb } }, _sum: { nakit: true } }),
    ]);
    devir.set(subeId, sayi(nakitOnce._sum.grossAmount) + sayi(manuelOnce._sum.amount) - sayi(cikisOnce._sum.amount) + sayi(duzOnce._sum.nakit));

    const [nakit, hareket, duz] = await Promise.all([
      prisma.payment.findMany({
        where: { paymentType: 'CASH', sale: { status: 'PAID' }, ...tahsilatSube, createdAt: { gte: r.gte, lte: r.lte } },
        select: { grossAmount: true, createdAt: true },
      }),
      prisma.cashMovement.findMany({
        where: {
          branchId: subeId,
          createdAt: { gte: r.gte, lte: r.lte },
          OR: [{ type: 'CASH_OUT' }, { type: 'CASH_IN', description: { startsWith: 'MANUEL_TAHSILAT:' } }],
        },
        select: { type: true, amount: true, createdAt: true },
      }),
      prisma.kasaDuzeltme.findMany({ where: { branchId: subeId, tarih: { gte: basDb, lte: bitDb } }, select: { tarih: true, nakit: true } }),
    ]);
    for (const p of nakit) g(subeId, trGun(p.createdAt)).satis += sayi(p.grossAmount);
    for (const h of hareket) {
      if (h.type === 'CASH_OUT') g(subeId, trGun(h.createdAt)).cikis += sayi(h.amount);
      else g(subeId, trGun(h.createdAt)).manuel += sayi(h.amount);
    }
    for (const d of duz) g(subeId, dbGun(d.tarih)).duzeltme += sayi(d.nakit);
  }

  const gunListesi = gunler(r.bas, r.bit);
  const satirlar: Satir[] = [];
  let tDevir = 0;
  let tKapanis = 0;
  for (const subeId of subeIds) {
    const s = sb.get(subeId);
    const ad = s ? `${s.kod} · ${s.ad}` : subeId;
    const m = veri.get(subeId) ?? new Map<string, Gun>();
    let bakiye = devir.get(subeId) ?? 0;
    const ilk = bakiye;
    const top = bos();
    for (const gun of gunListesi) {
      const o = m.get(gun) ?? bos();
      const acilis = bakiye;
      bakiye += o.satis + o.manuel + o.duzeltme - o.cikis;
      top.satis += o.satis;
      top.manuel += o.manuel;
      top.duzeltme += o.duzeltme;
      top.cikis += o.cikis;
      if (gruplama === 'gun' && (o.satis || o.manuel || o.duzeltme || o.cikis || gun === gunListesi[0] || gun === gunListesi[gunListesi.length - 1])) {
        satirlar.push({
          sube: ad,
          gun,
          acilis: yuvarla(acilis),
          satis: yuvarla(o.satis),
          manuel: yuvarla(o.manuel),
          duzeltme: yuvarla(o.duzeltme),
          cikis: yuvarla(o.cikis),
          kapanis: yuvarla(bakiye),
        });
      }
    }
    tDevir += ilk;
    tKapanis += bakiye;
    if (gruplama === 'sube') {
      satirlar.push({
        sube: ad,
        gun: `${r.bas} – ${r.bit}`,
        acilis: yuvarla(ilk),
        satis: yuvarla(top.satis),
        manuel: yuvarla(top.manuel),
        duzeltme: yuvarla(top.duzeltme),
        cikis: yuvarla(top.cikis),
        kapanis: yuvarla(bakiye),
      });
    }
  }
  return {
    kolonlar: [
      { key: 'sube', label: 'Şube', tip: 'metin' },
      { key: 'gun', label: gruplama === 'sube' ? 'Dönem' : 'Gün', tip: gruplama === 'sube' ? 'metin' : 'tarih' },
      { key: 'acilis', label: 'Açılış (devir)', tip: 'para' },
      { key: 'satis', label: '+ Nakit tahsilat', tip: 'para', toplam: true },
      { key: 'manuel', label: '+ Eski borç (nakit)', tip: 'para', toplam: true },
      { key: 'duzeltme', label: '± Kasa düzeltme', tip: 'para', toplam: true },
      { key: 'cikis', label: '− Nakit çıkışı', tip: 'para', toplam: true },
      { key: 'kapanis', label: 'Kapanış', tip: 'para' },
    ],
    satirlar,
    ozet: [
      { ad: 'Dönem başı kasa', deger: yuvarla(tDevir), tip: 'para' },
      { ad: 'Dönem sonu kasa', deger: yuvarla(tKapanis), tip: 'para' },
      { ad: 'Değişim', deger: yuvarla(tKapanis - tDevir), tip: 'para' },
    ],
    notlar: [
      'Kasa nakit bakiyesi, Günlük Kasa ekranındaki “Kasa Nakit” ile aynı hesaplanır: nakit tahsilatlar (tahsil edildiği şubeye) + kağıt üstü eski borç nakit tahsilatları ± kasa bakiye düzeltmeleri − nakit çıkışları.',
      'Hareketsiz günler gizlenir (ilk ve son gün her zaman gösterilir).',
    ],
  };
}

// ───────────────────────── Borç Yaşlandırma ─────────────────────────

export const BORC_YAS_GRUPLAMA = [
  { key: 'musteri', label: 'Müşteri' },
  { key: 'sube', label: 'Şube' },
];
const YAS_DILIMI = ['y0', 'y1', 'y2', 'y3', 'y4'] as const;

export async function borcYaslandirma(f: Filtre): Promise<RaporSonuc> {
  const subeIds = subeFiltresi(f);
  const gruplama = f.gruplama || 'musteri';
  const enAz = sayi(f.enAz) > 0 ? sayi(f.enAz) : 0.01;
  const satislar = await prisma.sale.findMany({
    where: {
      status: { notIn: [...GECERSIZ_SATIS] },
      payments: { some: { paymentType: 'OPEN_ACCOUNT' } },
      ...(subeIds ? { branchId: { in: subeIds } } : {}),
      ...(f.ara ? { customer: { OR: [{ name: { contains: f.ara, mode: 'insensitive' } }, { phone: { contains: f.ara } }] } } : {}),
    },
    select: {
      createdAt: true,
      branchId: true,
      customerId: true,
      customer: { select: { name: true, phone: true } },
      payments: { select: { paymentType: true, grossAmount: true, createdAt: true } },
    },
  });
  const sb = await subeler();
  const simdi = Date.now();
  type O = { ad: string; tel: string; adet: number; kalan: number; d: number[]; son: Date | null };
  const m = new Map<string, O>();
  for (const s of satislar) {
    const d = acikHesapDurumu(s.payments);
    if (d.kalan < 0.01) continue;
    const gun = Math.floor((simdi - (d.ilk ?? s.createdAt).getTime()) / GUN_MS);
    const i = gun <= 30 ? 0 : gun <= 60 ? 1 : gun <= 90 ? 2 : gun <= 180 ? 3 : 4;
    const k = gruplama === 'sube' ? s.branchId : s.customerId;
    const sube = sb.get(s.branchId);
    const ad = gruplama === 'sube' ? (sube ? `${sube.kod} · ${sube.ad}` : s.branchId) : s.customer?.name ?? '';
    const o = m.get(k) ?? { ad, tel: s.customer?.phone ?? '', adet: 0, kalan: 0, d: [0, 0, 0, 0, 0], son: null };
    o.adet++;
    o.kalan += d.kalan;
    o.d[i] += d.kalan;
    if (d.sonOdeme && (!o.son || d.sonOdeme > o.son)) o.son = d.sonOdeme;
    m.set(k, o);
  }
  const liste = [...m.entries()].filter(([, o]) => o.kalan >= enAz).sort((a, b) => b[1].kalan - a[1].kalan);
  const top = [0, 0, 0, 0, 0];
  for (const [, o] of liste) o.d.forEach((v, i) => (top[i] += v));
  const genel = top.reduce((a, b) => a + b, 0);
  return {
    kolonlar: [
      { key: 'grup', label: gruplama === 'sube' ? 'Şube' : 'Müşteri', tip: 'metin' },
      ...(gruplama === 'musteri' ? [{ key: 'telefon', label: 'Telefon', tip: 'metin' as const }] : []),
      { key: 'adet', label: 'Satış', tip: 'sayi', toplam: true },
      { key: 'kalan', label: 'Toplam kalan', tip: 'para', toplam: true },
      { key: 'y0', label: '0–30 gün', tip: 'para', toplam: true },
      { key: 'y1', label: '31–60', tip: 'para', toplam: true },
      { key: 'y2', label: '61–90', tip: 'para', toplam: true },
      { key: 'y3', label: '91–180', tip: 'para', toplam: true },
      { key: 'y4', label: '180+', tip: 'para', toplam: true },
      { key: 'son', label: 'Son ödeme', tip: 'tarih' },
    ],
    satirlar: liste.map(([k, o]) => {
      const s: Satir = { grup: o.ad, adet: o.adet, kalan: yuvarla(o.kalan), son: o.son ? trGun(o.son) : '' };
      if (gruplama === 'musteri') {
        s.telefon = o.tel;
        s._musteriId = k;
      }
      YAS_DILIMI.forEach((key, i) => (s[key] = o.d[i] ? yuvarla(o.d[i]) : null));
      return s;
    }),
    ozet: [
      { ad: 'Toplam alacak', deger: yuvarla(genel), tip: 'para' },
      { ad: '90 günü geçen', deger: yuvarla(top[3] + top[4]), tip: 'para' },
      { ad: '90+ payı', deger: genel ? yuvarla(((top[3] + top[4]) / genel) * 100, 1) : 0, tip: 'yuzde' },
    ],
    notlar: ['Yaş: borcun açık hesaba yazıldığı günden bugüne. Kalan, satış ekranındaki açık hesap kalanıyla aynı hesaplanır. Tarih filtresi uygulanmaz (bugünkü durum).'],
  };
}

// ───────────────────────── Kesilen Faturalar ─────────────────────────

export const FATURA_DURUMLARI = [
  { key: 'hepsi', label: 'Hepsi' },
  { key: 'GONDERILDI', label: 'Gönderildi' },
  { key: 'HATA', label: 'Hatalı' },
  { key: 'IPTAL', label: 'İptal' },
];
export const FATURA_GRUPLAMA = [
  { key: 'detay', label: 'Fatura fatura' },
  { key: 'sube', label: 'Şube' },
  { key: 'gun', label: 'Gün' },
  { key: 'ay', label: 'Ay' },
  { key: 'tur', label: 'Tür (e-arşiv / e-fatura / transfer)' },
];

export async function kesilenFaturalar(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const sb = await subeler();
  const subeIds = subeFiltresi(f);
  const kodlar = subeIds ? subeIds.map((id) => sb.get(id)?.kod).filter((x): x is string => !!x) : null;
  const durum = f.durum || 'hepsi';
  const gruplama = f.gruplama || 'detay';
  const liste = await prisma.fatura.findMany({
    where: {
      createdAt: { gte: r.gte, lte: r.lte },
      ...(kodlar ? { sube: { in: kodlar } } : {}),
      ...(durum !== 'hepsi' ? { durum } : {}),
      ...(f.ara
        ? { OR: [{ faturaNo: { contains: f.ara, mode: 'insensitive' } }, { aliciAdi: { contains: f.ara, mode: 'insensitive' } }, { aliciVkn: { contains: f.ara } }] }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 20000,
  });
  const satisIds = [...new Set(liste.map((x) => x.satisId).filter((x): x is string => !!x))];
  const fisler = new Map<string, string>();
  for (let i = 0; i < satisIds.length; i += 1000) {
    for (const s of await prisma.sale.findMany({ where: { id: { in: satisIds.slice(i, i + 1000) } }, select: { id: true, referansNo: true } })) {
      fisler.set(s.id, s.referansNo ?? s.id.slice(0, 8));
    }
  }
  const tur = (x: (typeof liste)[number]) => (x.transferId ? 'Transfer faturası' : x.profileId === 'TEMELFATURA' ? 'e-Fatura' : 'e-Arşiv');
  const DURUM: Record<string, string> = { GONDERILDI: 'Gönderildi', HATA: 'Hatalı', IPTAL: 'İptal' };
  const gecerli = liste.filter((x) => x.durum !== 'IPTAL');
  const ozet = [
    { ad: 'Fatura', deger: liste.length, tip: 'sayi' as const },
    { ad: 'Tutar (iptaller hariç)', deger: yuvarla(gecerli.reduce((a, x) => a + x.tutar, 0)), tip: 'para' as const },
    { ad: 'Hatalı', deger: liste.filter((x) => x.durum === 'HATA').length, tip: 'sayi' as const },
  ];
  if (gruplama === 'detay') {
    return {
      kolonlar: [
        { key: 'tarih', label: 'Tarih', tip: 'tarihSaat' },
        { key: 'no', label: 'Fatura no', tip: 'metin' },
        { key: 'tur', label: 'Tür', tip: 'metin' },
        { key: 'sube', label: 'Şube', tip: 'metin' },
        { key: 'alici', label: 'Alıcı', tip: 'metin' },
        { key: 'vkn', label: 'VKN / TCKN', tip: 'metin' },
        { key: 'fis', label: 'Satış fişi', tip: 'metin' },
        { key: 'tutar', label: 'Tutar', tip: 'para', toplam: true },
        { key: 'durum', label: 'Durum', tip: 'metin' },
        { key: 'hata', label: 'Hata', tip: 'metin' },
      ],
      satirlar: liste.map((x) => ({
        tarih: trSaat(x.createdAt),
        no: x.faturaNo,
        tur: tur(x),
        sube: x.sube,
        alici: x.aliciAdi,
        vkn: x.aliciVkn,
        fis: x.satisId ? fisler.get(x.satisId) ?? '' : '',
        tutar: yuvarla(x.tutar),
        durum: DURUM[x.durum] ?? x.durum,
        hata: (x.hata ?? '').slice(0, 200),
      })),
      ozet,
    };
  }
  const m = new Map<string, { adet: number; tutar: number; iptal: number; hata: number }>();
  for (const x of liste) {
    const k = gruplama === 'sube' ? x.sube : gruplama === 'gun' ? trGun(x.createdAt) : gruplama === 'ay' ? trGun(x.createdAt).slice(0, 7) : tur(x);
    const o = m.get(k) ?? { adet: 0, tutar: 0, iptal: 0, hata: 0 };
    o.adet++;
    if (x.durum === 'IPTAL') o.iptal++;
    else o.tutar += x.tutar;
    if (x.durum === 'HATA') o.hata++;
    m.set(k, o);
  }
  const zaman = gruplama === 'gun' || gruplama === 'ay';
  return {
    kolonlar: [
      { key: 'grup', label: FATURA_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: gruplama === 'gun' ? 'tarih' : 'metin' },
      { key: 'adet', label: 'Fatura', tip: 'sayi', toplam: true },
      { key: 'tutar', label: 'Tutar (iptaller hariç)', tip: 'para', toplam: true },
      { key: 'iptal', label: 'İptal', tip: 'sayi', toplam: true },
      { key: 'hata', label: 'Hatalı', tip: 'sayi', toplam: true },
    ],
    satirlar: [...m.entries()]
      .sort((a, b) => (zaman ? a[0].localeCompare(b[0]) : b[1].tutar - a[1].tutar))
      .map(([k, o]) => ({ grup: k, adet: o.adet, tutar: yuvarla(o.tutar), iptal: o.iptal, hata: o.hata })),
    ozet,
  };
}

// ───────────────────────── Reçete Listesi ─────────────────────────

export const RECETE_DURUMLARI = [
  { key: 'hepsi', label: 'Tarih aralığındaki tüm reçeteler' },
  { key: 'son', label: 'Her müşterinin son reçetesi' },
  { key: 'eski12', label: 'Son reçetesi 1 yıldan eski olanlar' },
  { key: 'eski24', label: 'Son reçetesi 2 yıldan eski olanlar' },
];

function goz(sph?: string | null, cyl?: string | null, aks?: string | null, ek?: string | null): string {
  const p = [sph, cyl ? `${cyl}${aks ? ` × ${aks}` : ''}` : '', ek ? `ADD ${ek}` : ''].map((x) => (x ?? '').trim()).filter(Boolean);
  return p.join('  ');
}

export async function receteListesi(f: Filtre): Promise<RaporSonuc> {
  const durum = f.durum || 'hepsi';
  const tarihli = durum === 'hepsi' || durum === 'son';
  const r = tarihli ? aralik(f) : null;
  const musteriFiltre = f.ara
    ? { customer: { OR: [{ name: { contains: f.ara, mode: 'insensitive' as const } }, { phone: { contains: f.ara } }, { identityNo: { contains: f.ara } }] } }
    : {};
  const tumu = await prisma.customerPrescription.findMany({
    where: { ...(durum === 'hepsi' && r ? { date: { gte: r.gte, lte: r.lte } } : {}), ...musteriFiltre },
    include: { customer: { select: { id: true, name: true, phone: true } } },
    orderBy: { date: 'desc' },
    take: durum === 'hepsi' ? 20000 : 100000,
  });
  let liste = tumu;
  if (durum !== 'hepsi') {
    const goruldu = new Set<string>();
    liste = tumu.filter((p) => (goruldu.has(p.customerId) ? false : (goruldu.add(p.customerId), true)));
    if (durum === 'son' && r) liste = liste.filter((p) => p.date >= r.gte && p.date <= r.lte);
    else {
      const sinir = Date.now() - (durum === 'eski12' ? 365 : 730) * GUN_MS;
      liste = liste.filter((p) => p.date.getTime() < sinir).sort((a, b) => a.date.getTime() - b.date.getTime());
    }
  }
  const KAYNAK: Record<string, string> = { MANUAL: 'Gözlük (elle)', LENS: 'Lens', ERECETE: 'e-Reçete', MEDULA: 'Medula', SATIS: 'Satış' };
  return {
    kolonlar: [
      { key: 'tarih', label: 'Reçete tarihi', tip: 'tarih' },
      { key: 'musteri', label: 'Müşteri', tip: 'metin' },
      { key: 'telefon', label: 'Telefon', tip: 'metin' },
      { key: 'uzakSag', label: 'Uzak sağ', tip: 'metin' },
      { key: 'uzakSol', label: 'Uzak sol', tip: 'metin' },
      { key: 'yakinSag', label: 'Yakın sağ', tip: 'metin' },
      { key: 'yakinSol', label: 'Yakın sol', tip: 'metin' },
      { key: 'lensSag', label: 'Lens sağ', tip: 'metin' },
      { key: 'lensSol', label: 'Lens sol', tip: 'metin' },
      { key: 'pd', label: 'PD (U)', tip: 'metin' },
      { key: 'erecete', label: 'e-Reçete no', tip: 'metin' },
      { key: 'doktor', label: 'Doktor / hastane', tip: 'metin' },
      { key: 'kaynak', label: 'Kaynak', tip: 'metin' },
      { key: 'gun', label: 'Kaç gün önce', tip: 'sayi' },
    ],
    satirlar: liste.map((p) => ({
      tarih: trGun(p.date),
      musteri: p.customer.name,
      telefon: p.customer.phone,
      uzakSag: goz(p.far_r_sph, p.far_r_cyl, p.far_r_aks),
      uzakSol: goz(p.far_l_sph, p.far_l_cyl, p.far_l_aks),
      yakinSag: goz(p.near_r_sph, p.near_r_cyl, p.near_r_aks),
      yakinSol: goz(p.near_l_sph, p.near_l_cyl, p.near_l_aks),
      lensSag: goz(p.lens_r_sph, p.lens_r_cyl, p.lens_r_aks, p.lens_r_add),
      lensSol: goz(p.lens_l_sph, p.lens_l_cyl, p.lens_l_aks, p.lens_l_add),
      pd: [p.far_r_pd, p.far_l_pd].filter((x) => x && x.trim()).join(' / '),
      erecete: p.eRx_no ?? '',
      doktor: [p.eRx_doctor, p.eRx_hospital].filter((x) => x && x.trim()).join(' · '),
      kaynak: KAYNAK[p.source] ?? p.source,
      gun: Math.floor((Date.now() - p.date.getTime()) / GUN_MS),
      _musteriId: p.customer.id,
    })),
    ozet: [
      { ad: 'Reçete', deger: liste.length, tip: 'sayi' },
      { ad: 'Müşteri', deger: new Set(liste.map((p) => p.customerId)).size, tip: 'sayi' },
    ],
    notlar:
      durum === 'eski12' || durum === 'eski24'
        ? ['Göz kontrolü hatırlatması için: son reçetesi seçilen süreden eski olan müşteriler (tarih filtresi uygulanmaz). Müşteri adına tıklayınca ekstresi açılır.']
        : ['Müşteri adına tıklayınca ekstresi açılır.'],
  };
}

// ───────────────────────── Ürün / Lens Listesi ─────────────────────────

export const URUN_LISTESI_DURUMLARI = [
  { key: 'hepsi', label: 'Hepsi' },
  { key: 'stoklu', label: 'Stokta olanlar' },
  { key: 'stoksuz', label: 'Stokta olmayanlar' },
];

export async function urunListesi(f: Filtre, ctx: CalistirmaBaglami): Promise<RaporSonuc> {
  if (!f.ara && !f.marka && !f.kategori) throw new RaporHatasi('Kategori, marka ya da arama kelimesinden en az birini seçin.');
  const domain: unknown[] = [['active', '=', true]];
  if (f.ara) domain.push('|', '|', ['name', 'ilike', f.ara], ['barcode', 'ilike', f.ara], ['default_code', 'ilike', f.ara]);
  if (f.marka) domain.push(['product_tmpl_id.name', 'ilike', f.marka]);
  if (f.kategori) {
    const kat = (await execute('product.category', 'search_read', [[]], { fields: ['id', 'complete_name'], ...ODOO_CTX })) as { id: number; complete_name: string }[];
    const ids = kat.filter((k) => kategoriYoldan(k.complete_name) === f.kategori).map((k) => k.id);
    if (!ids.length) throw new RaporHatasi('Bu kategoriye bağlı Odoo kategorisi bulunamadı.');
    domain.push(['categ_id', 'in', ids]);
  }
  const ids = (await execute('product.product', 'search', [domain], { limit: 20001, order: 'name asc', ...ODOO_CTX })) as number[];
  const kesildi = ids.length > 20000;
  const urunler = await urunleriOku(ids.slice(0, 20000));
  const uygun = urunFiltresi({ ...f, ara: undefined });
  const fo = await fotograf();
  const stok = new Map<number, Map<string, number>>();
  for (const q of fo.quantlar) {
    let m = stok.get(q.urunId);
    if (!m) stok.set(q.urunId, (m = new Map()));
    m.set(q.lok, (m.get(q.lok) ?? 0) + q.adet);
  }
  const durum = f.durum || 'hepsi';
  const secili = [...urunler.values()].filter((u) => {
    if (!uygun(u)) return false;
    const adet = [...(stok.get(u.id)?.values() ?? [])].reduce((a, b) => a + b, 0);
    if (durum === 'stoklu') return adet > 0;
    if (durum === 'stoksuz') return adet <= 0;
    return true;
  });
  const maliyet = ctx.maliyetGorur ? await varyantMaliyetleri(secili.map((u) => u.id)) : new Map<number, number>();
  const lokSirasi = Object.keys(STOK_LOKASYONLARI);
  return {
    kolonlar: [
      { key: 'urun', label: 'Ürün', tip: 'metin' },
      { key: 'barkod', label: 'Barkod', tip: 'metin' },
      { key: 'kategori', label: 'Kategori', tip: 'metin' },
      { key: 'marka', label: 'Marka', tip: 'metin' },
      { key: 'fiyat', label: 'Satış fiyatı', tip: 'para' },
      { key: 'maliyet', label: 'Maliyet', tip: 'para', maliyet: true },
      { key: 'stok', label: 'Stok', tip: 'sayi', toplam: true },
      { key: 'nerede', label: 'Nerede', tip: 'metin' },
    ],
    satirlar: secili
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
      .map((u) => {
        const m = stok.get(u.id) ?? new Map<string, number>();
        const adet = [...m.values()].reduce((a, b) => a + b, 0);
        return {
          urun: u.ad,
          barkod: u.barkod ?? '',
          kategori: KATEGORI_ADI[u.kategori],
          marka: u.marka,
          fiyat: yuvarla(u.fiyat),
          maliyet: maliyet.has(u.id) ? yuvarla(maliyet.get(u.id) ?? 0) : null,
          stok: yuvarla(adet, 2),
          nerede: lokSirasi
            .filter((l) => (m.get(l) ?? 0) !== 0)
            .map((l) => `${l}: ${yuvarla(m.get(l) ?? 0, 2)}`)
            .join(', '),
        };
      }),
    kesildi,
    notlar: [stokNotu(fo), 'Odoo’daki aktif ürünler. Arama; ürün adı, barkod ve iç referansta yapılır.'],
  };
}

