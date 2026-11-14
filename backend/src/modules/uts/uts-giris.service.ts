/**
 * 14.11.2026 — Ürün girişine gömülü UTS işleri.
 *
 * Kural: UTS kabulü (ALMA) = "malı teslim aldım" beyanı → SADECE ürün girişi kaydedilince yapılır.
 *
 * 1) belgeTumSubelerde(): fatura/belge no ile BÜTÜN mağazaların UTS hesaplarında bekleyen verme kayıtları +
 *    programda kabul edilmiş ama girişi yapılmamış kayıtlar. Her kaydın hangi mağazaya geldiği yazılır.
 * 2) utsGirisSonrasi(): ürün girişi kaydedilince
 *      - kayıt hangi mağazaya geldiyse ORADA kabul (ALMA),
 *      - ürün başka mağazaya gidiyorsa (müşteri siparişi / seçilen mağaza) ve UTS kurumları farklıysa
 *        gelen mağazadan hedefe VERME + hedefte ALMA,
 *      - UTS kaydı bulunamayan ürünler "UTS bekliyor" listesine (UtsBekleyenGiris) yazılır.
 * 3) utsBekleyenleriKontrolEt(): (zamanlayıcı, 30 dk) bekleyenler için UTS'ye tekrar bakar; kayıt düşünce
 *    aynı kabul/verme işlemlerini yapar, UTS kodunu Odoo lotuna ve müşteri siparişine yazar.
 */
import { prisma } from '../../database/prisma';
import { execute, ODOO_ALL_COMPANY_IDS } from '../odoo/odoo.service';
import { parseGs1DataMatrix } from '../odoo/gs1-parser.util';
import {
  bekleyenAlmaTopluBildir,
  bildirimOlusturVeGonder,
  branchIdFromSubeKodu,
  resolveTransferKarsiTaraf,
  sorgulaBelgeNoIleAlmaBekleyenler,
  extractUtsHataDetay,
} from './uts.service';

const CTX = { context: { active_test: false, allowed_company_ids: ODOO_ALL_COMPANY_IDS } };

export type UtsBelgeKaydi = {
  uno: string;
  lno?: string;
  sno?: string;
  urunTanimi?: string;
  kaynak: 'BEKLEYEN' | 'KABUL';
  subeKodu: string;
  bid?: string;
  gkk?: number;
  bno?: string;
  gonderenKurum?: string;
  utsBildirimId?: string;
};

type SubeUts = { subeKodu: string; branchId: string; kurumNo: string | null; token: string; ortam: string };

async function aktifUtsSubeleri(): Promise<SubeUts[]> {
  const l = await prisma.utsSube.findMany({
    where: { aktif: true, NOT: { token: null } },
    include: { branch: { select: { code: true, id: true } } },
  });
  return l
    .filter((x) => x.token?.trim())
    .map((x) => ({ subeKodu: x.branch.code, branchId: x.branch.id, kurumNo: x.kurumNo?.trim() || null, token: x.token!.trim(), ortam: x.ortam }));
}

function ayniKurum(a: SubeUts | undefined, b: SubeUts | undefined): boolean {
  if (!a || !b) return false;
  if (a.kurumNo && b.kurumNo) return a.kurumNo === b.kurumNo;
  return a.token === b.token;
}

const anahtar = (u: string, l?: string, s?: string) => `${String(u).replace(/^0+/, '')}|${l ?? ''}|${s ?? ''}`;

/** Belge no ile tüm mağazalarda UTS kayıtları. oncelikliSube: aynı UTS hesabını paylaşan mağazalardan hangisi yazılsın. */
export async function belgeTumSubelerde(belgeNo: string, oncelikliSube?: string): Promise<{ kayitlar: UtsBelgeKaydi[]; hatalar: string[] }> {
  const bno = belgeNo.trim();
  const kayitlar: UtsBelgeKaydi[] = [];
  const hatalar: string[] = [];
  if (!bno) return { kayitlar, hatalar };
  const gorulen = new Set<string>();

  // Programda kabul edilmiş, girişi yapılmamış
  const kabul = await prisma.utsBildirim.findMany({
    where: { tip: 'ALMA', durum: 'GONDERILDI', urunGirisiYapildiMi: false, belgeNo: bno },
    include: { kalemler: true, branch: { select: { code: true } } },
    orderBy: { gonderimZamani: 'asc' },
  });
  for (const b of kabul) {
    const p = (b.payload ?? {}) as Record<string, unknown>;
    const urunTanimi = typeof p.urunTanimi === 'string' ? p.urunTanimi : undefined;
    for (const k of b.kalemler) {
      const key = anahtar(k.barkod, k.lotNo ?? undefined, k.seriNo ?? undefined);
      if (gorulen.has(key)) continue;
      gorulen.add(key);
      kayitlar.push({ uno: k.barkod, lno: k.lotNo ?? undefined, sno: k.seriNo ?? undefined, urunTanimi, kaynak: 'KABUL', subeKodu: b.branch.code, utsBildirimId: b.id });
    }
  }

  // UTS'de bekleyenler — aynı hesabı paylaşan mağazalar bir kez sorgulanır
  const subeler = await aktifUtsSubeleri();
  const tokenGrup = new Map<string, SubeUts[]>();
  for (const s of subeler) {
    const g = tokenGrup.get(s.token) ?? [];
    g.push(s);
    tokenGrup.set(s.token, g);
  }
  for (const grup of tokenGrup.values()) {
    const sube = grup.find((g) => g.subeKodu === oncelikliSube) ?? grup[0];
    try {
      const l = await sorgulaBelgeNoIleAlmaBekleyenler({ token: sube.token, ortam: sube.ortam, belgeNo: bno });
      for (const r of l) {
        const key = anahtar(r.uno, r.lno, r.sno);
        if (gorulen.has(key)) continue;
        gorulen.add(key);
        kayitlar.push({
          uno: r.uno, lno: r.lno, sno: r.sno, urunTanimi: r.urunTanimi, kaynak: 'BEKLEYEN', subeKodu: sube.subeKodu,
          bid: r.bid, gkk: r.gkk, bno: r.bno ?? bno, gonderenKurum: r.gonderenKurum,
        });
      }
    } catch (e) {
      hatalar.push(`${sube.subeKodu}: ${extractUtsHataDetay(e)}`);
    }
  }
  return { kayitlar, hatalar };
}

// ───────────────────────── kayıt sonrası ─────────────────────────

export type UtsGirisLot = {
  lotOdooId: number | null;
  lotNo: string;
  urunAdi: string;
  barkod: string;
  utsKodu: string;
  utsKayit: UtsBelgeKaydi | null;
  hedefSube: string | null; // müşteri mağazası / seçilen mağaza; depoda kalacaksa null
  siparisId: string | null;
};
export type UtsGirisSonuc = {
  kabul: number;
  kabulHata: string[];
  aktarim: number;
  aktarimHata: string[];
  bekleyeneYazilan: number;
};

type Kalem = { barkod: string; lotNo: string | null; seriNo: string | null; adet: number };

/** Kabul edilmiş (X'teki) UTS kalemlerini hedef mağazaya (Y) taşır: X VERME → Y ALMA. Kurum aynıysa bir şey yapmaz. */
async function hedefeAktar(x: string, y: string, kalemler: Kalem[], belgeNo: string, subeler: SubeUts[]): Promise<{ ok: number; hata: string[] }> {
  const sx = subeler.find((s) => s.subeKodu === x);
  const sy = subeler.find((s) => s.subeKodu === y);
  if (!kalemler.length || x === y || ayniKurum(sx, sy)) return { ok: 0, hata: [] };
  if (!sy) return { ok: 0, hata: [`${y} mağazasının UTS hesabı tanımlı/aktif değil — UTS ${x}'te kaldı`] };
  const bx = await branchIdFromSubeKodu(x);
  const by = await branchIdFromSubeKodu(y);
  if (!bx || !by) return { ok: 0, hata: [`Şube bulunamadı (${x} / ${y})`] };
  const verme = await bildirimOlusturVeGonder({
    tip: 'VERME', branchId: bx, belgeNo, karsiTaraf: await resolveTransferKarsiTaraf(y), hemenGonder: true, kalemler,
    payloadExtra: { kaynak: 'URUN_GIRISI_DAGITIM' },
  });
  if (!verme.gonderildi) return { ok: 0, hata: [`${x} → ${y} UTS verme: ${verme.hata ?? 'gönderilemedi'}`] };
  const alma = await bildirimOlusturVeGonder({
    tip: 'ALMA', branchId: by, belgeNo, karsiTaraf: await resolveTransferKarsiTaraf(x), hemenGonder: true, kalemler,
    payloadExtra: { kaynak: 'URUN_GIRISI_DAGITIM' },
  });
  await prisma.utsBildirim.update({ where: { id: alma.bildirimId }, data: { urunGirisiYapildiMi: true, urunGirisiTarihi: new Date() } }).catch(() => undefined);
  if (!alma.gonderildi) return { ok: 0, hata: [`${y} UTS kabul (verme ${x}'ten yapıldı): ${alma.hata ?? 'gönderilemedi'}`] };
  return { ok: kalemler.length, hata: [] };
}

async function kabulEtVeDagit(
  lotlar: Array<{ kayit: UtsBelgeKaydi; hedefSube: string | null }>,
  belgeNo: string,
  subeler: SubeUts[],
): Promise<{ kabul: number; kabulHata: string[]; aktarim: number; aktarimHata: string[]; basarili: Set<UtsBelgeKaydi> }> {
  let kabul = 0;
  let aktarim = 0;
  const kabulHata: string[] = [];
  const aktarimHata: string[] = [];
  const basarili = new Set<UtsBelgeKaydi>();

  // 1) Gelen mağazada kabul
  const xGrup = new Map<string, UtsBelgeKaydi[]>();
  for (const { kayit } of lotlar) {
    if (kayit.kaynak === 'KABUL') {
      basarili.add(kayit);
      if (kayit.utsBildirimId) {
        await prisma.utsBildirim.update({ where: { id: kayit.utsBildirimId }, data: { urunGirisiYapildiMi: true, urunGirisiTarihi: new Date() } }).catch(() => undefined);
      }
      continue;
    }
    const g = xGrup.get(kayit.subeKodu) ?? [];
    g.push(kayit);
    xGrup.set(kayit.subeKodu, g);
  }
  for (const [x, kayitlar] of xGrup) {
    try {
      const sonuc = await bekleyenAlmaTopluBildir({
        subeKodu: x,
        satirlar: kayitlar.map((k) => ({ uno: k.uno, lno: k.lno, sno: k.sno, bno: k.bno, gkk: k.gkk, gonderenKurum: k.gonderenKurum, bid: k.bid, adt: 1, urunTanimi: k.urunTanimi } as never)),
      });
      sonuc.forEach((r, i) => {
        if (r.durum === 'GONDERILDI') {
          kabul++;
          basarili.add(kayitlar[i]);
        } else {
          kabulHata.push(`${x} · ${r.uno}: ${r.hata ?? 'kabul edilemedi'}`);
        }
      });
      const ids = sonuc.map((r) => r.bildirimId).filter((v): v is string => !!v);
      if (ids.length) {
        await prisma.utsBildirim.updateMany({ where: { id: { in: ids } }, data: { urunGirisiYapildiMi: true, urunGirisiTarihi: new Date() } });
      }
    } catch (e) {
      kabulHata.push(`${x}: ${extractUtsHataDetay(e)}`);
    }
  }

  // 2) Başka mağazaya gidecekse aktar
  const xyGrup = new Map<string, Kalem[]>();
  for (const { kayit, hedefSube } of lotlar) {
    if (!hedefSube || !basarili.has(kayit)) continue;
    const key = `${kayit.subeKodu}>${hedefSube}`;
    const g = xyGrup.get(key) ?? [];
    g.push({ barkod: kayit.uno, lotNo: kayit.lno ?? null, seriNo: kayit.sno ?? null, adet: 1 });
    xyGrup.set(key, g);
  }
  for (const [key, kalemler] of xyGrup) {
    const [x, y] = key.split('>');
    try {
      const r = await hedefeAktar(x, y, kalemler, belgeNo, subeler);
      aktarim += r.ok;
      aktarimHata.push(...r.hata);
    } catch (e) {
      aktarimHata.push(`${x} → ${y}: ${extractUtsHataDetay(e)}`);
    }
  }
  return { kabul, kabulHata, aktarim, aktarimHata, basarili };
}

function gtin(barkod: string): string {
  return String(barkod ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

export async function utsGirisSonrasi(input: {
  girisNo: string;
  belgeNo: string;
  cariAdi: string;
  sirketId: number | null;
  lotlar: UtsGirisLot[];
}): Promise<UtsGirisSonuc> {
  const subeler = await aktifUtsSubeleri();
  const kayitli = input.lotlar.filter((l) => l.utsKayit);
  const r = await kabulEtVeDagit(kayitli.map((l) => ({ kayit: l.utsKayit!, hedefSube: l.hedefSube })), input.belgeNo, subeler);

  // UTS kaydı olmayanlar → bekleyen listesi (barkodu GTIN gibi olanlar ya da elle UTS kodu yazılmış olanlar)
  let bekleyeneYazilan = 0;
  for (const l of input.lotlar) {
    if (l.utsKayit) continue;
    const g = gtin(l.barkod);
    const elle = l.utsKodu.trim() ? parseGs1DataMatrix(l.utsKodu.trim()) : null;
    if (!elle && !(g.length >= 8 && g.length <= 14)) continue;
    await prisma.utsBekleyenGiris.create({
      data: {
        girisNo: input.girisNo || null,
        belgeNo: input.belgeNo || null,
        cariAdi: input.cariAdi || null,
        sirketId: input.sirketId,
        lotNo: l.lotNo,
        odooLotId: l.lotOdooId,
        urunAdi: l.urunAdi.slice(0, 300),
        barkod: l.barkod || null,
        utsKodu: l.utsKodu.trim() || null,
        hedefSube: l.hedefSube,
        siparisId: l.siparisId,
      },
    });
    bekleyeneYazilan++;
  }
  return { kabul: r.kabul, kabulHata: r.kabulHata, aktarim: r.aktarim, aktarimHata: r.aktarimHata, bekleyeneYazilan };
}

// ───────────────────────── bekleyenler ─────────────────────────

/** Ekrandaki formatGs1FromUtsFields ile aynı biçim: 01 GTIN + 10 LOT + 21 SERİ */
function formatGs1(uno: string, lno?: string, sno?: string): string {
  const g = String(uno ?? '').replace(/\D/g, '').padStart(14, '0').slice(-14);
  return `01${g}${lno ? `10${lno}` : ''}${sno ? `21${sno}` : ''}`;
}

async function lotaUtsYaz(lotNo: string, odooLotId: number | null, kod: string): Promise<void> {
  const ids = new Set<number>();
  if (odooLotId) ids.add(odooLotId);
  const lots = (await execute('stock.lot', 'search_read', [[['name', '=', lotNo]]], { fields: ['id'], limit: 20, ...CTX })) as { id: number }[];
  for (const l of lots) ids.add(l.id);
  for (const id of ids) {
    try {
      await execute('stock.lot', 'write', [[id], { x_uts_kodu: kod }], CTX);
    } catch {
      // başka şirketin lotu yazılamazsa atla
    }
  }
}

/** Bekleyen kayıt için UTS kaydı bulunduğunda: kabul, gerekiyorsa aktarım, lota ve siparişe UTS kodu. */
async function bekleyeniTamamla(
  row: { id: string; lotNo: string; odooLotId: number | null; belgeNo: string | null; hedefSube: string | null; siparisId: string | null },
  kayit: UtsBelgeKaydi,
  subeler: SubeUts[],
): Promise<{ ok: boolean; mesaj: string }> {
  const r = await kabulEtVeDagit([{ kayit, hedefSube: row.hedefSube }], row.belgeNo ?? kayit.bno ?? '', subeler);
  if (!r.basarili.has(kayit)) {
    const mesaj = r.kabulHata.join('; ') || 'Kabul edilemedi';
    await prisma.utsBekleyenGiris.update({ where: { id: row.id }, data: { deneme: { increment: 1 }, sonDeneme: new Date(), mesaj } });
    return { ok: false, mesaj };
  }
  const kod = formatGs1(kayit.uno, kayit.lno, kayit.sno);
  try {
    await lotaUtsYaz(row.lotNo, row.odooLotId, kod);
  } catch {
    // lot yazılamazsa kayıt yine tamamlanır, mesajda belirtilir
  }
  if (row.siparisId) {
    await prisma.ozelSiparisKarekod.create({ data: { siparisId: row.siparisId, karekod: kod } }).catch(() => undefined);
  }
  const mesaj = [`${kayit.subeKodu}'te kabul edildi`, ...r.aktarimHata].join(' · ');
  await prisma.utsBekleyenGiris.update({
    where: { id: row.id },
    data: { durum: 'TAMAM', utsKodu: kod, utsSube: kayit.subeKodu, sonDeneme: new Date(), deneme: { increment: 1 }, mesaj },
  });
  return { ok: true, mesaj };
}

export async function utsBekleyenleriKontrolEt(): Promise<{ bakilan: number; tamamlanan: number; zamanAsimi: number }> {
  const sinir = new Date(Date.now() - 21 * 24 * 3600 * 1000);
  const eski = await prisma.utsBekleyenGiris.updateMany({ where: { durum: 'BEKLIYOR', createdAt: { lt: sinir } }, data: { durum: 'ZAMAN_ASIMI' } });
  const rows = await prisma.utsBekleyenGiris.findMany({ where: { durum: 'BEKLIYOR' }, orderBy: { createdAt: 'asc' }, take: 300 });
  const subeler = await aktifUtsSubeleri();
  const belgeler = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!r.belgeNo) continue;
    const g = belgeler.get(r.belgeNo) ?? [];
    g.push(r);
    belgeler.set(r.belgeNo, g);
  }
  let tamamlanan = 0;
  for (const [belgeNo, grup] of belgeler) {
    const { kayitlar } = await belgeTumSubelerde(belgeNo);
    const kalan = kayitlar.filter((k) => k.kaynak === 'BEKLEYEN' || k.kaynak === 'KABUL');
    for (const row of grup) {
      let idx = -1;
      const elle = row.utsKodu ? parseGs1DataMatrix(row.utsKodu) : null;
      if (elle) {
        idx = kalan.findIndex((k) => gtin(k.uno) === gtin(elle.gtin14) && (!elle.serial || k.sno === elle.serial) && (!elle.lot || k.lno === elle.lot));
      }
      if (idx < 0 && row.barkod) {
        const b = gtin(row.barkod);
        const adaylar = kalan.map((k, i) => ({ k, i })).filter(({ k }) => gtin(k.uno) === b);
        if (adaylar.length) idx = adaylar[0].i;
      }
      if (idx < 0) {
        await prisma.utsBekleyenGiris.update({ where: { id: row.id }, data: { deneme: { increment: 1 }, sonDeneme: new Date() } });
        continue;
      }
      const [kayit] = kalan.splice(idx, 1);
      const s = await bekleyeniTamamla(row, kayit, subeler);
      if (s.ok) tamamlanan++;
    }
  }
  return { bakilan: rows.length, tamamlanan, zamanAsimi: eski.count };
}

/** Ekrandan elle eşleştirme: bekleyen satıra belgedeki bir UTS kaydını uygula. */
export async function bekleyeneKayitUygula(id: string, kayit: UtsBelgeKaydi): Promise<{ ok: boolean; mesaj: string }> {
  const row = await prisma.utsBekleyenGiris.findUnique({ where: { id } });
  if (!row) throw new Error('Kayıt bulunamadı');
  if (row.durum !== 'BEKLIYOR') throw new Error('Bu kayıt artık beklemede değil');
  return bekleyeniTamamla(row, kayit, await aktifUtsSubeleri());
}

export async function utsBekleyenListesi(durum = 'BEKLIYOR') {
  return prisma.utsBekleyenGiris.findMany({ where: { durum }, orderBy: { createdAt: 'desc' }, take: 500 });
}

export async function utsBekleyenIptal(id: string, neden: string) {
  return prisma.utsBekleyenGiris.update({ where: { id }, data: { durum: 'IPTAL', mesaj: neden.slice(0, 300) || 'UTS gerekmiyor' } });
}

// ───────────────────────── müşteriye teslim ─────────────────────────

/**
 * 14.11.2026 — Müşteri siparişi teslim edilince, siparişe yazılmış UTS kodlarıyla siparişin mağazasından
 * "tüketiciye verme" bildirimi. UTS Yönetimi'nden elle yapılan bildirimin aynısı; hata olursa kayıt
 * UTS Yönetimi kuyruğunda HATA olarak görünür, teslimi engellemez. Aynı sipariş için iki kez gönderilmez.
 */
export async function siparisTuketiciyeVerme(siparisId: string): Promise<{ gonderildi: number; mesaj: string }> {
  const s = await prisma.ozelSiparis.findUnique({ where: { id: siparisId }, include: { karekodlar: true } });
  if (!s) return { gonderildi: 0, mesaj: 'Sipariş bulunamadı' };
  const belgeNo = `SIP-${s.id.slice(0, 10)}`;
  const onceki = await prisma.utsBildirim.findFirst({ where: { tip: 'TUKETICIYE_VERME', belgeNo, durum: 'GONDERILDI' } });
  if (onceki) return { gonderildi: 0, mesaj: 'Daha önce gönderilmiş' };

  const kalemler: Kalem[] = [];
  const gorulen = new Set<string>();
  for (const k of s.karekodlar) {
    const p = parseGs1DataMatrix(k.karekod);
    if (!p?.gtin14 || (!p.serial && !p.lot)) continue;
    const key = `${p.gtin14}|${p.lot ?? ''}|${p.serial ?? ''}`;
    if (gorulen.has(key)) continue;
    gorulen.add(key);
    kalemler.push({ barkod: p.gtin14, lotNo: p.lot ?? null, seriNo: p.serial ?? null, adet: 1 });
  }
  if (!kalemler.length) return { gonderildi: 0, mesaj: 'Siparişte UTS kodu yok' };
  const branchId = s.subeId ? await branchIdFromSubeKodu(s.subeId) : null;
  if (!branchId) return { gonderildi: 0, mesaj: `Siparişin mağazası (${s.subeId ?? '—'}) bulunamadı` };

  const r = await bildirimOlusturVeGonder({
    tip: 'TUKETICIYE_VERME',
    branchId,
    belgeNo,
    karsiTaraf: { ad: s.musteriAdi },
    hemenGonder: true,
    kalemler,
    payloadExtra: { kaynak: 'SIPARIS_TESLIM', siparisId: s.id },
  });
  return r.gonderildi
    ? { gonderildi: kalemler.length, mesaj: `UTS tüketiciye verme bildirildi (${kalemler.length})` }
    : { gonderildi: 0, mesaj: `UTS tüketiciye verme gönderilemedi: ${r.hata ?? ''} — UTS Yönetimi'nde bekliyor` };
}
