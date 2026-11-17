/** 17.11.2026 — Hazır Raporlar Faz 2: Kurum Satışları, Fatura Kontrol, Prim, Satış Yoğunluğu */
import { prisma } from '../../database/prisma';
import { GECERSIZ_SATIS, GUN_MS, aralik, kullanicilar, sayi, subeFiltresi, subeler, trGun, trSaat, yuvarla } from './ortak';
import type { Filtre, Kolon, RaporSonuc, Satir } from './tipler';

const EFATURA_DURUM: Record<string, string> = {
  GONDERILDI: 'Kesildi',
  BEKLIYOR: 'Kuyrukta',
  HATA: 'Hata',
  IPTAL: 'İptal',
};

// ───────────────────────── Kurum Satışları (SGK / Vakıf) ─────────────────────────

export const KURUM_GRUPLAMA = [
  { key: 'detay', label: 'Satış satış (detay)' },
  { key: 'kurum', label: 'Kurum' },
  { key: 'sube', label: 'Şube' },
  { key: 'personel', label: 'Personel' },
  { key: 'ay', label: 'Ay' },
];

export async function kurumSatislari(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const gruplama = f.gruplama || 'detay';
  const satislar = await prisma.sale.findMany({
    where: {
      status: { notIn: [...GECERSIZ_SATIS] },
      createdAt: { gte: r.gte, lte: r.lte },
      ...(subeIds ? { branchId: { in: subeIds } } : {}),
      ...(f.personelId ? { userId: f.personelId } : {}),
      OR: [{ sgkAmount: { gt: 0 } }, { prescriptionAmount: { gt: 0 } }],
    },
    select: {
      id: true,
      referansNo: true,
      createdAt: true,
      branchId: true,
      userId: true,
      netTotal: true,
      sgkAmount: true,
      prescriptionAmount: true,
      eFaturaDurum: true,
      customer: { select: { name: true, phone: true, identityNo: true, eRx_no: true, medulaNo: true } },
      items: { select: { prescription: { select: { eReceteCode: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const sb = await subeler();
  const pers = await kullanicilar(satislar.map((s) => s.userId));
  const liste = satislar.map((s) => {
    const sgk = sayi(s.sgkAmount);
    const vakif = sayi(s.prescriptionAmount);
    const net = sayi(s.netTotal);
    const kurum = sgk > 0 && vakif > 0 ? 'SGK + Vakıf' : sgk > 0 ? 'SGK' : 'Vakıf';
    const erecete = s.items.map((i) => i.prescription?.eReceteCode).find(Boolean) ?? s.customer?.eRx_no ?? '';
    return { s, sgk, vakif, net, hasta: Math.max(0, net - sgk - vakif), kurum, erecete };
  });
  const top = (k: 'sgk' | 'vakif' | 'net' | 'hasta') => yuvarla(liste.reduce((a, x) => a + x[k], 0));
  const ozet = [
    { ad: 'Kurumlu satış', deger: liste.length, tip: 'sayi' as const },
    { ad: 'SGK payı', deger: top('sgk'), tip: 'para' as const },
    { ad: 'Vakıf payı', deger: top('vakif'), tip: 'para' as const },
    { ad: 'Hasta payı', deger: top('hasta'), tip: 'para' as const },
  ];
  const notlar = ['SGK ve Vakıf payı satış ekranında girilen kurum katkısıdır; hasta payı = satış − kurum payları. Kuruma kesilecek fatura listesi bu rapordan alınabilir.'];
  if (gruplama === 'detay') {
    return {
      kolonlar: [
        { key: 'tarih', label: 'Tarih', tip: 'tarihSaat' },
        { key: 'fis', label: 'Fiş no', tip: 'metin' },
        { key: 'sube', label: 'Şube', tip: 'metin' },
        { key: 'personel', label: 'Personel', tip: 'metin' },
        { key: 'musteri', label: 'Hasta', tip: 'metin' },
        { key: 'tc', label: 'TC kimlik', tip: 'metin' },
        { key: 'erecete', label: 'E-reçete / Medula', tip: 'metin' },
        { key: 'kurum', label: 'Kurum', tip: 'metin' },
        { key: 'net', label: 'Satış', tip: 'para', toplam: true },
        { key: 'sgk', label: 'SGK payı', tip: 'para', toplam: true },
        { key: 'vakif', label: 'Vakıf payı', tip: 'para', toplam: true },
        { key: 'hasta', label: 'Hasta payı', tip: 'para', toplam: true },
        { key: 'fatura', label: 'Fatura', tip: 'metin' },
      ],
      satirlar: liste.map((x) => ({
        tarih: trSaat(x.s.createdAt),
        fis: x.s.referansNo ?? x.s.id.slice(0, 8),
        sube: sb.get(x.s.branchId)?.kod ?? '',
        personel: pers.get(x.s.userId) ?? '',
        musteri: x.s.customer?.name ?? '',
        tc: x.s.customer?.identityNo ?? '',
        erecete: [x.erecete, x.s.customer?.medulaNo].filter(Boolean).join(' · '),
        kurum: x.kurum,
        net: yuvarla(x.net),
        sgk: yuvarla(x.sgk),
        vakif: yuvarla(x.vakif),
        hasta: yuvarla(x.hasta),
        fatura: x.s.eFaturaDurum ? EFATURA_DURUM[x.s.eFaturaDurum] ?? x.s.eFaturaDurum : 'Kesilmedi',
      })),
      ozet,
      notlar,
    };
  }
  const m = new Map<string, { ad: string; adet: number; net: number; sgk: number; vakif: number; hasta: number }>();
  for (const x of liste) {
    let k: string;
    let ad: string;
    if (gruplama === 'kurum') [k, ad] = [x.kurum, x.kurum];
    else if (gruplama === 'personel') [k, ad] = [x.s.userId, pers.get(x.s.userId) ?? '(bilinmiyor)'];
    else if (gruplama === 'ay') [k, ad] = [trGun(x.s.createdAt).slice(0, 7), trGun(x.s.createdAt).slice(0, 7)];
    else {
      const s = sb.get(x.s.branchId);
      [k, ad] = [x.s.branchId, s ? `${s.kod} · ${s.ad}` : x.s.branchId];
    }
    const o = m.get(k) ?? { ad, adet: 0, net: 0, sgk: 0, vakif: 0, hasta: 0 };
    o.adet++;
    o.net += x.net;
    o.sgk += x.sgk;
    o.vakif += x.vakif;
    o.hasta += x.hasta;
    m.set(k, o);
  }
  return {
    kolonlar: [
      { key: 'grup', label: KURUM_GRUPLAMA.find((g) => g.key === gruplama)?.label ?? 'Grup', tip: 'metin' },
      { key: 'adet', label: 'Satış', tip: 'sayi', toplam: true },
      { key: 'net', label: 'Satış tutarı', tip: 'para', toplam: true },
      { key: 'sgk', label: 'SGK payı', tip: 'para', toplam: true },
      { key: 'vakif', label: 'Vakıf payı', tip: 'para', toplam: true },
      { key: 'hasta', label: 'Hasta payı', tip: 'para', toplam: true },
    ],
    satirlar: [...m.entries()]
      .sort((a, b) => (gruplama === 'ay' ? a[0].localeCompare(b[0]) : b[1].net - a[1].net))
      .map(([, x]) => ({ grup: x.ad, adet: x.adet, net: yuvarla(x.net), sgk: yuvarla(x.sgk), vakif: yuvarla(x.vakif), hasta: yuvarla(x.hasta) })),
    ozet,
    notlar,
  };
}

// ───────────────────────── Fatura Kontrol ─────────────────────────

export const FATURA_KONTROL_DURUMLARI = [
  { key: 'sorunlu', label: 'Sorunlu olanlar' },
  { key: 'kesilmedi', label: 'Faturası kesilmemiş' },
  { key: 'hata', label: 'Hata / kuyrukta bekleyen' },
  { key: 'fark', label: 'Tutar farkı olan' },
  { key: 'hepsi', label: 'Hepsi' },
];

export async function faturaKontrol(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const durum = f.durum || 'sorunlu';
  const satislar = await prisma.sale.findMany({
    where: {
      status: { notIn: [...GECERSIZ_SATIS] },
      createdAt: { gte: r.gte, lte: r.lte },
      ...(subeIds ? { branchId: { in: subeIds } } : {}),
    },
    select: {
      id: true,
      referansNo: true,
      createdAt: true,
      branchId: true,
      netTotal: true,
      sgkAmount: true,
      prescriptionAmount: true,
      eFaturaDurum: true,
      customer: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const ids = satislar.map((s) => s.id);
  const faturalar = new Map<string, { no: string; tutar: number; durum: string; hata: string | null }>();
  const kuyruk = new Map<string, { durum: string; hata: string | null }>();
  for (let i = 0; i < ids.length; i += 5000) {
    const p = ids.slice(i, i + 5000);
    for (const fa of await prisma.fatura.findMany({ where: { satisId: { in: p } }, orderBy: { createdAt: 'asc' } })) {
      if (fa.satisId) faturalar.set(fa.satisId, { no: fa.faturaNo, tutar: fa.tutar, durum: fa.durum, hata: fa.hata });
    }
    for (const k of await prisma.faturaKuyruk.findMany({ where: { satisId: { in: p } }, orderBy: { createdAt: 'asc' } })) {
      if (k.satisId) kuyruk.set(k.satisId, { durum: k.durum, hata: k.hata });
    }
  }
  const sb = await subeler();
  const sayac = { tamam: 0, kesilmedi: 0, hata: 0, fark: 0 };
  const satirlar: Satir[] = [];
  for (const s of satislar) {
    const net = sayi(s.netTotal);
    const hasta = Math.max(0, net - sayi(s.sgkAmount) - sayi(s.prescriptionAmount));
    const fa = faturalar.get(s.id);
    const ku = kuyruk.get(s.id);
    let tur: 'tamam' | 'kesilmedi' | 'hata' | 'fark';
    let aciklama = '';
    if (fa && fa.durum === 'GONDERILDI') {
      const fark = Math.min(Math.abs(fa.tutar - net), Math.abs(fa.tutar - hasta));
      if (fark > 1) {
        tur = 'fark';
        aciklama = `Fatura ${yuvarla(fa.tutar)} TL, satış ${yuvarla(net)} TL`;
      } else tur = 'tamam';
    } else if (fa && fa.durum === 'IPTAL') {
      tur = 'hata';
      aciklama = 'Fatura iptal edilmiş';
    } else if ((fa && fa.durum === 'HATA') || (ku && ku.durum !== 'GONDERILDI') || s.eFaturaDurum === 'HATA' || s.eFaturaDurum === 'BEKLIYOR') {
      tur = 'hata';
      aciklama = (fa?.hata || ku?.hata || (ku ? `Kuyrukta: ${ku.durum}` : 'Gönderim hatası')).slice(0, 200);
    } else if (s.eFaturaDurum === 'GONDERILDI') tur = 'tamam';
    else tur = 'kesilmedi';
    sayac[tur]++;
    if (durum === 'sorunlu' && tur === 'tamam') continue;
    if (['kesilmedi', 'hata', 'fark'].includes(durum) && tur !== durum) continue;
    satirlar.push({
      tarih: trSaat(s.createdAt),
      fis: s.referansNo ?? s.id.slice(0, 8),
      sube: sb.get(s.branchId)?.kod ?? '',
      musteri: s.customer?.name ?? '',
      satis: yuvarla(net),
      hastaPayi: yuvarla(hasta),
      faturaNo: fa?.no ?? '',
      faturaTutar: fa ? yuvarla(fa.tutar) : null,
      durum: { tamam: 'Tamam', kesilmedi: 'Faturası yok', hata: 'Hata / bekliyor', fark: 'Tutar farkı' }[tur],
      aciklama,
    });
  }
  return {
    kolonlar: [
      { key: 'tarih', label: 'Satış tarihi', tip: 'tarihSaat' },
      { key: 'fis', label: 'Fiş no', tip: 'metin' },
      { key: 'sube', label: 'Şube', tip: 'metin' },
      { key: 'musteri', label: 'Müşteri', tip: 'metin' },
      { key: 'satis', label: 'Satış', tip: 'para', toplam: true },
      { key: 'hastaPayi', label: 'Hasta payı', tip: 'para', toplam: true },
      { key: 'faturaNo', label: 'Fatura no', tip: 'metin' },
      { key: 'faturaTutar', label: 'Fatura tutarı', tip: 'para', toplam: true },
      { key: 'durum', label: 'Durum', tip: 'metin' },
      { key: 'aciklama', label: 'Açıklama', tip: 'metin' },
    ],
    satirlar,
    ozet: [
      { ad: 'Satış', deger: satislar.length, tip: 'sayi' },
      { ad: 'Faturası tamam', deger: sayac.tamam, tip: 'sayi' },
      { ad: 'Faturası yok', deger: sayac.kesilmedi, tip: 'sayi' },
      { ad: 'Hata / bekliyor', deger: sayac.hata, tip: 'sayi' },
      { ad: 'Tutar farkı', deger: sayac.fark, tip: 'sayi' },
    ],
    notlar: [
      'Satışlar, programdan kesilen e-arşiv / e-faturalarla eşleştirilir. Tutar farkı: fatura tutarı ne satış tutarına ne de hasta payına (satış − SGK − Vakıf) uyuyor.',
      'Faturası başka yerden (muhasebe programı vb.) elle kesilen satışlar burada “Faturası yok” görünür.',
    ],
  };
}

// ───────────────────────── Prim Raporu ─────────────────────────

/** Satış ekranındaki açık hesap kalanıyla aynı hesap */
function acikKalan(pays: { paymentType: string; grossAmount: unknown; createdAt: Date }[]): number {
  const acik = pays.filter((p) => p.paymentType === 'OPEN_ACCOUNT');
  const toplam = acik.reduce((a, p) => a + sayi(p.grossAmount), 0);
  if (!toplam) return 0;
  const ilk = Math.min(...acik.map((p) => p.createdAt.getTime()));
  const kapanan = pays.filter((p) => p.paymentType !== 'OPEN_ACCOUNT' && p.createdAt.getTime() > ilk).reduce((a, p) => a + sayi(p.grossAmount), 0);
  return Math.max(0, toplam - kapanan);
}

export async function primRaporu(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const satislar = await prisma.sale.findMany({
    where: {
      status: { notIn: [...GECERSIZ_SATIS] },
      createdAt: { gte: r.gte, lte: r.lte },
      ...(subeIds ? { branchId: { in: subeIds } } : {}),
      ...(f.personelId ? { userId: f.personelId } : {}),
    },
    select: {
      userId: true,
      branchId: true,
      netTotal: true,
      payments: { select: { paymentType: true, grossAmount: true, createdAt: true } },
    },
  });
  const m = new Map<string, { satis: number; ciro: number; acik: number; duzeltme: number; subeler: Map<string, number> }>();
  for (const s of satislar) {
    const o = m.get(s.userId) ?? { satis: 0, ciro: 0, acik: 0, duzeltme: 0, subeler: new Map<string, number>() };
    const duz = s.payments.filter((p) => p.paymentType === 'CIRO_DUZELTME').reduce((a, p) => a + sayi(p.grossAmount), 0);
    o.satis++;
    o.ciro += sayi(s.netTotal) - duz;
    o.acik += acikKalan(s.payments);
    o.subeler.set(s.branchId, (o.subeler.get(s.branchId) ?? 0) + 1);
    m.set(s.userId, o);
  }
  const userIds = [...m.keys()];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, personelId: true, personelByUser: { select: { id: true, aylikHedef: true } }, personel: { select: { id: true, aylikHedef: true } } },
  });
  const personelMap = new Map(users.map((u) => [u.id, u.personel ?? u.personelByUser ?? null]));
  const personelIds = [...personelMap.values()].filter(Boolean).map((p) => p!.id);
  const kazanimlar = personelIds.length
    ? await prisma.primKazanim.findMany({
        where: { personelId: { in: personelIds }, donemBaslangic: { lte: r.lte }, donemBitis: { gte: r.gte } },
        select: { personelId: true, primTutari: true, odendi: true },
      })
    : [];
  const prim = new Map<string, { hesap: number; odenen: number }>();
  for (const k of kazanimlar) {
    const o = prim.get(k.personelId) ?? { hesap: 0, odenen: 0 };
    o.hesap += k.primTutari;
    if (k.odendi) o.odenen += k.primTutari;
    prim.set(k.personelId, o);
  }
  const sb = await subeler();
  const aySayisi = Math.max(1, r.gunSayisi / 30.4);
  const satirlar: Satir[] = users
    .map((u) => {
      const o = m.get(u.id)!;
      const p = personelMap.get(u.id);
      const hedef = p?.aylikHedef ? p.aylikHedef * aySayisi : 0;
      const pr = p ? prim.get(p.id) : undefined;
      const anaSube = [...o.subeler.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return {
        personel: u.name,
        sube: anaSube ? sb.get(anaSube)?.kod ?? '' : '',
        satis: o.satis,
        ciro: yuvarla(o.ciro),
        acik: yuvarla(o.acik),
        tahsil: yuvarla(o.ciro - o.acik),
        hedef: hedef ? yuvarla(hedef) : null,
        gerceklesme: hedef ? yuvarla((o.ciro / hedef) * 100, 1) : null,
        primHesap: pr ? yuvarla(pr.hesap) : null,
        primOdenen: pr ? yuvarla(pr.odenen) : null,
      };
    })
    .sort((a, b) => b.ciro - a.ciro);
  return {
    kolonlar: [
      { key: 'personel', label: 'Personel', tip: 'metin' },
      { key: 'sube', label: 'Şube', tip: 'metin' },
      { key: 'satis', label: 'Satış', tip: 'sayi', toplam: true },
      { key: 'ciro', label: 'Ciro', tip: 'para', toplam: true },
      { key: 'acik', label: 'Açık hesapta bekleyen', tip: 'para', toplam: true },
      { key: 'tahsil', label: 'Tahsil edilen ciro', tip: 'para', toplam: true },
      { key: 'hedef', label: 'Hedef (döneme göre)', tip: 'para', toplam: true },
      { key: 'gerceklesme', label: 'Gerçekleşme', tip: 'yuzde' },
      { key: 'primHesap', label: 'Hesaplanan prim', tip: 'para', toplam: true },
      { key: 'primOdenen', label: 'Ödenen prim', tip: 'para', toplam: true },
    ],
    satirlar,
    notlar: [
      'Tahsil edilen ciro = ciro − hâlâ açık hesapta bekleyen kısım (bugünkü durum). Açık hesap kapandıkça artar.',
      'Hedef: personel kartındaki aylık hedef × seçilen dönemin ay sayısı. Prim: İK’da hesaplanmış prim kayıtları (dönemi seçilen tarihlerle kesişenler).',
    ],
  };
}

// ───────────────────────── Satış Yoğunluğu ─────────────────────────

export const YOGUNLUK_GRUPLAMA = [
  { key: 'adet', label: 'Satış adedi' },
  { key: 'ciro', label: 'Ciro' },
];
const GUNLER = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export async function satisYogunlugu(f: Filtre): Promise<RaporSonuc> {
  const r = aralik(f);
  const subeIds = subeFiltresi(f);
  const olcu = f.gruplama === 'ciro' ? 'ciro' : 'adet';
  const satislar = await prisma.sale.findMany({
    where: { status: { notIn: [...GECERSIZ_SATIS] }, createdAt: { gte: r.gte, lte: r.lte }, ...(subeIds ? { branchId: { in: subeIds } } : {}) },
    select: { createdAt: true, netTotal: true },
  });
  const h = new Map<string, number>();
  let enErken = 23;
  let enGec = 0;
  const gunSay = new Map<number, Set<string>>();
  for (const s of satislar) {
    const yerel = new Date(s.createdAt.getTime() + 3 * 3600 * 1000);
    const saat = yerel.getUTCHours();
    const gun = (yerel.getUTCDay() + 6) % 7;
    enErken = Math.min(enErken, saat);
    enGec = Math.max(enGec, saat);
    h.set(`${saat}|${gun}`, (h.get(`${saat}|${gun}`) ?? 0) + (olcu === 'ciro' ? sayi(s.netTotal) : 1));
    const g = gunSay.get(gun) ?? new Set<string>();
    g.add(trGun(s.createdAt));
    gunSay.set(gun, g);
  }
  if (!satislar.length) {
    enErken = 9;
    enGec = 21;
  }
  const tip = olcu === 'ciro' ? ('para' as const) : ('sayi' as const);
  const kolonlar: Kolon[] = [
    { key: 'saat', label: 'Saat', tip: 'metin' },
    ...GUNLER.map((g, i) => ({ key: `G${i}`, label: g, tip, toplam: true })),
    { key: 'toplam', label: 'Toplam', tip, toplam: true },
    { key: 'pay', label: 'Pay', tip: 'yuzde' },
  ];
  const genel = [...h.values()].reduce((a, v) => a + v, 0);
  const satirlar: Satir[] = [];
  for (let saat = enErken; saat <= enGec; saat++) {
    const row: Satir = { saat: `${String(saat).padStart(2, '0')}:00–${String(saat + 1).padStart(2, '0')}:00` };
    let t = 0;
    for (let g = 0; g < 7; g++) {
      const v = h.get(`${saat}|${g}`) ?? 0;
      row[`G${g}`] = yuvarla(v);
      t += v;
    }
    row.toplam = yuvarla(t);
    row.pay = genel ? yuvarla((t / genel) * 100, 1) : 0;
    satirlar.push(row);
  }
  const gunToplam = GUNLER.map((_, g) => [...h.entries()].filter(([k]) => k.endsWith(`|${g}`)).reduce((a, [, v]) => a + v, 0));
  const enYogunGun = gunToplam.indexOf(Math.max(...gunToplam));
  return {
    kolonlar,
    satirlar,
    ozet: [
      { ad: olcu === 'ciro' ? 'Toplam ciro' : 'Toplam satış', deger: yuvarla(genel), tip },
      { ad: 'En yoğun gün', deger: genel ? GUNLER[enYogunGun] : '-', tip: 'metin' },
      {
        ad: 'Gün başına ortalama',
        deger: genel ? yuvarla(genel / Math.max(1, Math.round((r.lte.getTime() - r.gte.getTime()) / GUN_MS))) : 0,
        tip,
      },
    ],
    notlar: ['Satışın kaydedildiği saat (Türkiye saati). Tablo satış adedini ya da ciroyu gösterir; seçim “Gruplama” kutusundan.'],
  };
}

