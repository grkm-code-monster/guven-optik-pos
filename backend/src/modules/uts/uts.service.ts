import axios from 'axios';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { getSupplierInfo } from '../efatura/uyumsoft-efatura.service';
import { execute } from '../odoo/odoo.service';
import { isUtsSeriLotEksik, utsAlanUzunlukHatasi } from '../odoo/gs1-parser.util';
import { getUtsKurumNo } from './uts-kurum.service';

export type UtsBildirimTip =
  | 'ALMA'
  | 'VERME'
  | 'TUKETICIYE_VERME'
  | 'TANIMSIZ_YERE_VERME'
  | 'TUKETICIDEN_IADE'
  | 'HEK_ZAYIAT';

export type UtsKalemInput = {
  barkod: string;
  seriNo?: string | null;
  lotNo?: string | null;
  adet?: number;
};

export function validateUtsKalemlerSeriLot(
  kalemler: Array<{ barkod: string; seriNo?: string | null; lotNo?: string | null }>,
): string | null {
  const eksik = kalemler
    .filter((k) => isUtsSeriLotEksik(k.seriNo, k.lotNo))
    .map((k) => k.barkod.trim() || '(barkodsuz)');
  if (eksik.length) {
    return `Şu kalemlerde ne Seri No ne de Lot No var, TİTCK kabul etmez: ${eksik.join(', ')}`;
  }
  for (const k of kalemler) {
    const uzunlukHata = utsAlanUzunlukHatasi(k.seriNo, k.lotNo);
    if (uzunlukHata) {
      const etiket = k.barkod.trim() || '(barkodsuz)';
      return `${etiket}: ${uzunlukHata}`;
    }
  }
  return null;
}

export type KarsiTaraf = {
  kurumNo?: string | null;
  vkn?: string | null;
  ad?: string | null;
};

export type BildirimOlusturInput = {
  tip: UtsBildirimTip;
  branchId: string;
  kalemler: UtsKalemInput[];
  karsiTaraf?: KarsiTaraf;
  belgeNo?: string;
  hemenGonder?: boolean;
  payloadExtra?: Record<string, unknown>;
};

const NG_VKN = process.env.UYUMSOFT_NG_VKN ?? '23819441406';

const SIRKET_DIS_FIRMA_TANIMLARI = [
  {
    sirketId: 'ng',
    ad: 'NG OPTİK',
    envKey: 'UYUMSOFT_NG_VKN',
    fallbackVkn: NG_VKN,
    referansSube: 'GVN2',
  },
  {
    sirketId: 'adese',
    ad: 'ADESE OPTİK',
    envKey: 'UYUMSOFT_ADESE_VKN',
    fallbackVkn: '0071251547',
    referansSube: 'GVN1',
  },
  {
    sirketId: 'potential',
    ad: 'POTANSİYEL OPTİK',
    envKey: 'UYUMSOFT_POTENTIAL_VKN',
    fallbackVkn: process.env.UYUMSOFT_POTENTIAL_VKN ?? NG_VKN,
    referansSube: 'GVN5',
  },
] as const;

async function sirketVknAl(sirketId: string, envKey: string, fallbackVkn: string): Promise<string> {
  const ayar = await prisma.sirketAyar.findUnique({
    where: { sirketId_anahtar: { sirketId, anahtar: 'sirket_vkn' } },
  });
  const envVkn = process.env[envKey]?.trim();
  return ayar?.deger?.trim() || envVkn || fallbackVkn;
}

/** NG/ADESE/POTENTIAL için UtsDisFirma kayıtları yoksa otomatik oluşturur (idempotent) */
export async function ensureUtsDisFirmaSirketlerSeed(): Promise<{ olusturulan: number }> {
  let olusturulan = 0;

  for (const tanim of SIRKET_DIS_FIRMA_TANIMLARI) {
    const mevcut = await prisma.utsDisFirma.findFirst({
      where: { ad: tanim.ad, aktif: true },
    });
    if (mevcut) continue;

    const supplier = await getSupplierInfo(tanim.referansSube);
    const vkn = supplier.vkn || await sirketVknAl(tanim.sirketId, tanim.envKey, tanim.fallbackVkn);
    const kurumNo = await getUtsKurumNo(tanim.referansSube);

    await prisma.utsDisFirma.create({
      data: {
        ad: tanim.ad,
        vkn,
        kurumNo: kurumNo ?? undefined,
        aktif: true,
        notlar: 'Transfer motoru otomatik seed (Faz 6)',
      },
    });
    olusturulan += 1;
  }

  return { olusturulan };
}

export async function gondermeBildiriminiYap(
  bildirim: {
    id: string;
    tip: string;
    payload: unknown;
    kalemler: Array<{ barkod: string; seriNo: string | null; lotNo: string | null; adet: number }>;
  },
  utsSube: { token: string; ortam: string },
): Promise<unknown[]> {
  const baseUrl = utsSube.ortam === 'test'
    ? 'https://utstest.saglik.gov.tr'
    : 'https://utsuygulama.saglik.gov.tr';

  const endpointMap: Record<string, string> = {
    ALMA: '/UTS/uh/rest/bildirim/alma/ekle',
    VERME: '/UTS/uh/rest/bildirim/verme/ekle',
    TUKETICIYE_VERME: '/UTS/uh/rest/bildirim/tuketiciyeVerme/ekle',
    TANIMSIZ_YERE_VERME: '/UTS/uh/rest/bildirim/utsdeTanimsizYereVerme/ekle',
    TUKETICIDEN_IADE: '/UTS/uh/rest/bildirim/tuketicidenIadeAlma/ekle',
    HEK_ZAYIAT: '/UTS/uh/rest/bildirim/hekZayiat/ekle',
  };

  const endpoint = endpointMap[bildirim.tip];
  if (!endpoint) throw new Error(`Bilinmeyen bildirim tipi: ${bildirim.tip}`);

  const seriLotHata = validateUtsKalemlerSeriLot(bildirim.kalemler);
  if (seriLotHata) throw new Error(seriLotHata);

  const payloadBase = typeof bildirim.payload === 'object' && bildirim.payload !== null
    ? { ...(bildirim.payload as Record<string, unknown>) }
    : {};

  const sonuclar: unknown[] = [];
  for (const kalem of bildirim.kalemler) {
    const body: Record<string, unknown> = { ...payloadBase };
    body.UNO = kalem.barkod;
    if (kalem.seriNo) body.SNO = kalem.seriNo;
    if (kalem.lotNo) body.LNO = kalem.lotNo;
    if (kalem.adet > 1) body.ADT = kalem.adet;

    const resp = await axios.post(
      `${baseUrl}${endpoint}`,
      body,
      { headers: { utsToken: utsSube.token, 'Content-Type': 'application/json' } },
    );
    sonuclar.push(resp.data);
  }

  const first = sonuclar[0] as { SNC?: string } | undefined;
  await prisma.utsBildirim.update({
    where: { id: bildirim.id },
    data: {
      durum: 'GONDERILDI',
      utsBildirimId: first?.SNC || null,
      gonderimZamani: new Date(),
      hataDetay: null,
    },
  });
  return sonuclar;
}

/** Axios 400/401 vb. yanıtlarda TİTCK'in response body metnini döndürür */
export function extractUtsHataDetay(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const bodyText = typeof data === 'string'
      ? data
      : data
        ? JSON.stringify(data)
        : undefined;
    return [
      status ? `HTTP ${status}` : undefined,
      bodyText,
      !bodyText ? err.message : undefined,
    ].filter(Boolean).join(' — ');
  }
  return err instanceof Error ? err.message : 'Bilinmeyen hata';
}

export async function bildirimOlusturVeGonder(
  input: BildirimOlusturInput,
): Promise<{ bildirimId: string; gonderildi: boolean; hata?: string }> {
  if (input.hemenGonder) {
    const seriLotHata = validateUtsKalemlerSeriLot(input.kalemler);
    if (seriLotHata) throw new Error(seriLotHata);
  }

  const payload: Prisma.InputJsonValue = {
    BNO: input.belgeNo ?? null,
    ...(input.payloadExtra ?? {}),
  };
  if (input.karsiTaraf?.kurumNo) {
    const kurumField = input.tip === 'ALMA' ? 'GKK' : 'KUN';
    (payload as Record<string, unknown>)[kurumField] = Number(input.karsiTaraf.kurumNo);
  }
  if (input.karsiTaraf?.vkn) {
    (payload as Record<string, unknown>).VKN = input.karsiTaraf.vkn;
  }

  const bildirim = await prisma.utsBildirim.create({
    data: {
      tip: input.tip,
      branchId: input.branchId,
      belgeNo: input.belgeNo,
      karsiKurumNo: input.karsiTaraf?.kurumNo ?? undefined,
      karsiVkn: input.karsiTaraf?.vkn ?? undefined,
      karsiAd: input.karsiTaraf?.ad ?? undefined,
      payload,
      durum: 'BEKLIYOR',
      kalemler: {
        create: input.kalemler.map((k) => ({
          barkod: k.barkod,
          seriNo: k.seriNo || null,
          lotNo: k.lotNo || null,
          adet: k.adet || 1,
        })),
      },
    },
    include: { kalemler: true },
  });

  if (!input.hemenGonder) {
    return { bildirimId: bildirim.id, gonderildi: false };
  }

  const utsSube = await prisma.utsSube.findUnique({ where: { branchId: input.branchId } });
  if (!utsSube?.token) {
    return {
      bildirimId: bildirim.id,
      gonderildi: false,
      hata: 'Bu şube için UTS token tanımlı değil',
    };
  }
  if (!utsSube.aktif) {
    return {
      bildirimId: bildirim.id,
      gonderildi: false,
      hata: 'Bu şube için UTS entegrasyonu pasif (UTS Yönetimi → Token Test Et)',
    };
  }

  try {
    await gondermeBildiriminiYap(bildirim, { token: utsSube.token, ortam: utsSube.ortam });
    return { bildirimId: bildirim.id, gonderildi: true };
  } catch (err) {
    const message = extractUtsHataDetay(err);
    await prisma.utsBildirim.update({
      where: { id: bildirim.id },
      data: { durum: 'HATA', hataDetay: message },
    });
    return { bildirimId: bildirim.id, gonderildi: false, hata: message };
  }
}

export async function branchIdFromSubeKodu(subeKodu: string): Promise<string | null> {
  const branch = await prisma.branch.findFirst({
    where: { code: { equals: subeKodu.trim(), mode: 'insensitive' } },
    select: { id: true },
  });
  return branch?.id ?? null;
}

/** Karşı şubenin UTS kurum no / VKN bilgisini çözer */
export async function resolveTransferKarsiTaraf(subeKodu: string): Promise<KarsiTaraf> {
  await ensureUtsDisFirmaSirketlerSeed();

  const kurumNo = await getUtsKurumNo(subeKodu);
  const supplier = await getSupplierInfo(subeKodu);

  if (kurumNo) {
    return { kurumNo, vkn: supplier.vkn, ad: supplier.unvan };
  }

  const disFirma = await prisma.utsDisFirma.findFirst({
    where: { vkn: supplier.vkn, aktif: true },
  });

  return {
    kurumNo: disFirma?.kurumNo ?? null,
    vkn: supplier.vkn,
    ad: disFirma?.ad ?? supplier.unvan,
  };
}

type TransferUtsKaynakKalem = {
  utsKodu?: string;
  utsFirmaKodu?: string;
  lotId?: number;
  miktar?: number;
};

export async function transferKalemlerdenUtsKalemler(
  kalemler: TransferUtsKaynakKalem[],
  odooCompanyId: number,
): Promise<UtsKalemInput[]> {
  const result: UtsKalemInput[] = [];

  for (const k of kalemler) {
    const barkod = k.utsKodu?.trim();
    if (!barkod) continue;

    let lotNo: string | undefined = k.utsFirmaKodu?.trim() || undefined;
    let seriNo: string | undefined;

    if (k.lotId) {
      try {
        const lots = await execute(
          'stock.lot',
          'read',
          [[k.lotId]],
          { fields: ['name', 'ref'] },
          odooCompanyId,
        ) as Array<{ name?: string; ref?: string | false }>;
        const lot = lots[0];
        if (lot?.name) {
          lotNo = lotNo ?? lot.name;
          seriNo = lot.name;
        }
        if (!lotNo && lot?.ref) lotNo = String(lot.ref);
      } catch {
        // lot okunamazsa sadece barkod ile devam
      }
    }

    const kalem: UtsKalemInput = {
      barkod,
      lotNo: lotNo ?? null,
      seriNo: seriNo ?? lotNo ?? null,
      adet: k.miktar && k.miktar > 0 ? Math.round(k.miktar) : 1,
    };

    if (isUtsSeriLotEksik(kalem.seriNo, kalem.lotNo)) {
      console.warn(`[UTS transfer] Seri ve lot ikisi de boş, atlandı: barkod=${barkod}`);
      continue;
    }

    result.push(kalem);
  }

  return result;
}

export async function transferUtsBildirimGonder(opts: {
  tip: 'VERME' | 'ALMA';
  transferRef: string;
  subeKodu: string;
  karsiSubeKodu: string;
  kalemler: TransferUtsKaynakKalem[];
  odooCompanyId: number;
}): Promise<{ basarili: boolean; bildirimId?: string; mesaj?: string }> {
  const branchId = await branchIdFromSubeKodu(opts.subeKodu);
  if (!branchId) {
    return { basarili: false, mesaj: `Şube bulunamadı: ${opts.subeKodu}` };
  }

  const mevcut = await prisma.utsBildirim.findFirst({
    where: { belgeNo: opts.transferRef, tip: opts.tip, branchId },
    orderBy: { createdAt: 'desc' },
  });
  if (mevcut?.durum === 'GONDERILDI') {
    return { basarili: true, bildirimId: mevcut.id, mesaj: 'Zaten gönderilmiş' };
  }

  const utsKalemler = await transferKalemlerdenUtsKalemler(opts.kalemler, opts.odooCompanyId);
  if (!utsKalemler.length) {
    return { basarili: false, mesaj: 'UTS kalemi oluşturulamadı' };
  }

  const karsiTaraf = await resolveTransferKarsiTaraf(opts.karsiSubeKodu);
  const sonuc = await bildirimOlusturVeGonder({
    tip: opts.tip,
    branchId,
    kalemler: utsKalemler,
    karsiTaraf,
    belgeNo: opts.transferRef,
    hemenGonder: true,
    payloadExtra: { transferRef: opts.transferRef, kaynak: 'TRANSFER_MOTOR' },
  });

  if (sonuc.gonderildi) {
    return { basarili: true, bildirimId: sonuc.bildirimId, mesaj: `${opts.tip} gönderildi` };
  }

  return {
    basarili: false,
    bildirimId: sonuc.bildirimId,
    mesaj: sonuc.hata ?? 'UTS bildirimi gönderilemedi',
  };
}

function utsBaseUrl(ortam: string): string {
  return ortam === 'test'
    ? 'https://utstest.saglik.gov.tr'
    : 'https://utsuygulama.saglik.gov.tr';
}

function normalizeVkn(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) return digits;
  return null;
}

export type UtsBekleyenAlmaSatir = {
  uno: string;
  lno?: string;
  sno?: string;
  bno?: string;
  bid?: string;
  gkk?: number;
  adt?: number;
  urunTanimi?: string;
  gonderenKurum?: string;
  bildirimDurumu?: string;
  bildirimZamani?: string;
  vermeTarihi?: string;
};

export function sirketIdToReferansSube(sirketId: number): string {
  if (sirketId === 3) return 'GVN1';
  if (sirketId === 4) return 'GVN5';
  return 'GVN2';
}

function utsKayitAlani(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function utsKayitSayi(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseUtsKabulEdilecekListe(data: unknown): { items: UtsBekleyenAlmaSatir[]; nextOff?: string } {
  if (!data || typeof data !== 'object') return { items: [] };
  const root = data as Record<string, unknown>;
  const snc = root.SNC;
  if (!snc || typeof snc !== 'object') return { items: [] };
  const sncObj = snc as Record<string, unknown>;
  const lstRaw = sncObj.LST ?? sncObj.Lst ?? sncObj.liste;
  const liste = Array.isArray(lstRaw) ? lstRaw : lstRaw ? [lstRaw] : [];
  const items = liste.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      uno: utsKayitAlani(r.UNO),
      lno: utsKayitAlani(r.LNO) || undefined,
      sno: utsKayitAlani(r.SNO) || undefined,
      bno: utsKayitAlani(r.BNO) || undefined,
      bid: utsKayitAlani(r.BID) || undefined,
      gkk: utsKayitSayi(r.GKK),
      adt: utsKayitSayi(r.ADT),
      urunTanimi: utsKayitAlani(r.MME) || undefined,
      gonderenKurum: utsKayitAlani(r.GKU) || undefined,
      bildirimDurumu: utsKayitAlani(r.BDR) || undefined,
      bildirimZamani: utsKayitAlani(r.BZA) || undefined,
      vermeTarihi: utsKayitAlani(r.GIT) || undefined,
    };
  }).filter((r) => r.uno);
  const nextOff = utsKayitAlani(sncObj.OFF ?? sncObj.off) || undefined;
  return { items, nextOff: nextOff || undefined };
}

export async function resolveUtsSubeForSubeKodu(subeKodu: string) {
  const branchId = await branchIdFromSubeKodu(subeKodu);
  if (!branchId) return null;
  return prisma.utsSube.findUnique({
    where: { branchId },
    include: { branch: { select: { code: true, name: true } } },
  });
}

/** TİTCK UTS — Bekleyen alma bildirimlerini sorgular (filtreler opsiyonel). */
export async function sorgulaAlmaBekleyenler(opts: {
  token: string;
  ortam: string;
  belgeNo?: string;
  gonderenKurumNo?: number;
  urunNumarasi?: string;
}): Promise<UtsBekleyenAlmaSatir[]> {
  const belgeNo = opts.belgeNo?.trim();
  const urunNumarasi = opts.urunNumarasi?.trim();
  const sendUnoToApi = !!(urunNumarasi && belgeNo && opts.gonderenKurumNo);

  const base = utsBaseUrl(opts.ortam);
  const headers = { utsToken: opts.token, 'Content-Type': 'application/json' };
  const url = `${base}/UTS/uh/rest/bildirim/alma/bekleyenler/sorgula/offset`;
  const all: UtsBekleyenAlmaSatir[] = [];
  let off: string | undefined;
  const adt = 100;

  for (let page = 0; page < 30; page++) {
    const body: Record<string, unknown> = { SAN: page, ADT: adt };
    if (belgeNo) body.BNO = belgeNo;
    if (opts.gonderenKurumNo) body.GKK = opts.gonderenKurumNo;
    if (sendUnoToApi && urunNumarasi) body.UNO = urunNumarasi;
    if (off) body.OFF = off;

    const resp = await axios.post(url, body, { headers, timeout: 30000 });
    const parsed = parseUtsKabulEdilecekListe(resp.data);
    if (!parsed.items.length) break;
    all.push(...parsed.items);
    if (!parsed.nextOff || parsed.items.length < adt) break;
    off = parsed.nextOff;
  }

  if (urunNumarasi && !sendUnoToApi) {
    return all.filter((r) => r.uno.trim() === urunNumarasi);
  }
  return all;
}

/** Geriye dönük uyumluluk — belge no ile bekleyen alma sorgusu. */
export async function sorgulaBelgeNoIleAlmaBekleyenler(opts: {
  token: string;
  ortam: string;
  belgeNo: string;
  gonderenKurumNo?: number;
}): Promise<UtsBekleyenAlmaSatir[]> {
  const belgeNo = opts.belgeNo.trim();
  if (!belgeNo) return [];
  return sorgulaAlmaBekleyenler({ ...opts, belgeNo });
}

/** TİTCK UTS — Bekleyen verme bildirimini "Almak İstemiyorum" olarak işaretler. */
export async function almakIstemiyorumOlarakIsaretle(opts: {
  token: string;
  ortam: string;
  bid: string;
}): Promise<unknown> {
  const bid = opts.bid.trim();
  if (!bid) throw new Error('BID zorunlu');

  const base = utsBaseUrl(opts.ortam);
  const resp = await axios.post(
    `${base}/UTS/uh/rest/almakIstemiyorum/almakIstemiyorumOlarakIsaretle`,
    { BID: bid },
    { headers: { utsToken: opts.token, 'Content-Type': 'application/json' }, timeout: 30000 },
  );
  return resp.data;
}

export async function resolveBranchVknForUtsTest(branch: {
  code: string;
  vkn?: string | null;
}): Promise<string> {
  const branchVkn = branch.vkn ? normalizeVkn(branch.vkn) : null;
  if (branchVkn) return branchVkn;

  const info = await getSupplierInfo(branch.code);
  const vkn = normalizeVkn(info.vkn);
  if (vkn) return vkn;

  throw new Error('Token test için geçerli VKN bulunamadı (şube veya şirket VKN tanımlayın)');
}

function isUtsTokenAuthFailure(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  if (err.response?.status === 401) return true;
  const data = err.response?.data;
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  return /NOT_A_VALID_TOKEN|PERSISTENTLY_INVALIDATED_SESSION|INVALID.*TOKEN|unauthorized/i.test(text);
}

export async function testUtsSubeToken(branchId: string): Promise<{ success: boolean; mesaj: string }> {
  const utsSube = await prisma.utsSube.findUnique({
    where: { branchId },
    include: { branch: { select: { code: true, vkn: true } } },
  });
  if (!utsSube?.token?.trim()) {
    return { success: false, mesaj: 'Token tanımlı değil' };
  }

  let vkn: string;
  try {
    vkn = await resolveBranchVknForUtsTest(utsSube.branch);
  } catch (err) {
    return {
      success: false,
      mesaj: err instanceof Error ? err.message : 'VKN bulunamadı',
    };
  }

  try {
    await axios.post(
      `${utsBaseUrl(utsSube.ortam)}/UTS/rest/kurum/firmaSorgula`,
      { VRG: vkn },
      {
        headers: { utsToken: utsSube.token, 'Content-Type': 'application/json' },
        timeout: 15000,
      },
    );
    await prisma.utsSube.update({
      where: { branchId },
      data: { sonKontrol: new Date(), aktif: true },
    });
    return { success: true, mesaj: 'Token geçerli' };
  } catch (err) {
    const tokenInvalid = isUtsTokenAuthFailure(err);
    await prisma.utsSube.update({
      where: { branchId },
      data: {
        sonKontrol: new Date(),
        ...(tokenInvalid ? { aktif: false } : {}),
      },
    }).catch(() => {});

    if (tokenInvalid) {
      return { success: false, mesaj: 'Token geçersiz veya oturum sonlandırılmış' };
    }
    return { success: false, mesaj: `Token testi tamamlanamadı (${extractUtsHataDetay(err)})` };
  }
}

export type BekleyenAlmaSatirInput = {
  uno: string;
  sno?: string;
  lno?: string;
  bno?: string;
  gkk?: number;
  adt?: number;
  gonderenKurum?: string;
  bid?: string;
};

export type BekleyenAlmaTopluSonuc = {
  uno: string;
  durum: 'GONDERILDI' | 'HATA';
  hata?: string;
  bildirimId?: string;
};

export async function bekleyenAlmaTopluBildir(opts: {
  subeKodu: string;
  satirlar: BekleyenAlmaSatirInput[];
}): Promise<BekleyenAlmaTopluSonuc[]> {
  const branchId = await branchIdFromSubeKodu(opts.subeKodu);
  if (!branchId) throw new Error(`Şube bulunamadı: ${opts.subeKodu}`);

  const sonuclar: BekleyenAlmaTopluSonuc[] = [];
  for (const satir of opts.satirlar) {
    const kalem = {
      barkod: satir.uno,
      seriNo: satir.sno ?? '',
      lotNo: satir.lno ?? '',
      adet: satir.adt ?? 1,
    };
    const validasyon = validateUtsKalemlerSeriLot([kalem]);
    if (validasyon) {
      sonuclar.push({ uno: satir.uno, durum: 'HATA', hata: validasyon });
      continue;
    }
    try {
      const sonuc = await bildirimOlusturVeGonder({
        tip: 'ALMA',
        branchId,
        belgeNo: satir.bno ?? '',
        karsiTaraf: {
          kurumNo: satir.gkk ? String(satir.gkk) : null,
          ad: satir.gonderenKurum ?? null,
        },
        hemenGonder: true,
        kalemler: [kalem],
        payloadExtra: {
          utsAlmaBid: satir.bid ?? null,
          kaynak: 'BEKLEYEN_ALMA',
        },
      });
      sonuclar.push({
        uno: satir.uno,
        durum: sonuc.gonderildi ? 'GONDERILDI' : 'HATA',
        hata: sonuc.hata,
        bildirimId: sonuc.bildirimId,
      });
    } catch (err) {
      sonuclar.push({
        uno: satir.uno,
        durum: 'HATA',
        hata: extractUtsHataDetay(err),
      });
    }
  }
  return sonuclar;
}

export async function markUtsUrunGirisiTamamlandi(opts: {
  barkod: string;
  seriNo?: string | null;
  lotNo?: string | null;
  utsBildirimId?: string | null;
}): Promise<number> {
  if (opts.utsBildirimId) {
    const mevcut = await prisma.utsBildirim.findUnique({ where: { id: opts.utsBildirimId } });
    if (mevcut && !mevcut.urunGirisiYapildiMi) {
      await prisma.utsBildirim.update({
        where: { id: opts.utsBildirimId },
        data: { urunGirisiYapildiMi: true, urunGirisiTarihi: new Date() },
      });
      return 1;
    }
    return 0;
  }

  const barkod = String(opts.barkod ?? '').trim();
  if (!barkod) return 0;

  const seri = String(opts.seriNo ?? '').trim() || null;
  const lot = String(opts.lotNo ?? '').trim() || null;

  const adaylar = await prisma.utsBildirim.findMany({
    where: {
      tip: 'ALMA',
      durum: 'GONDERILDI',
      urunGirisiYapildiMi: false,
      kalemler: { some: { barkod } },
    },
    include: { kalemler: true },
    orderBy: { gonderimZamani: 'desc' },
    take: 20,
  });

  let guncellenen = 0;
  for (const bildirim of adaylar) {
    const eslesen = bildirim.kalemler.some((k) => {
      if (k.barkod !== barkod) return false;
      if (seri && k.seriNo && k.seriNo !== seri) return false;
      if (lot && k.lotNo && k.lotNo !== lot) return false;
      return true;
    });
    if (!eslesen) continue;
    await prisma.utsBildirim.update({
      where: { id: bildirim.id },
      data: { urunGirisiYapildiMi: true, urunGirisiTarihi: new Date() },
    });
    guncellenen += 1;
  }
  return guncellenen;
}

const URUN_GIRISI_BEKLEME_GUN = 3;

export async function urunGirisiBekleyenSayac(): Promise<number> {
  const esik = new Date(Date.now() - URUN_GIRISI_BEKLEME_GUN * 86400000);
  return prisma.utsBildirim.count({
    where: {
      tip: 'ALMA',
      durum: 'GONDERILDI',
      urunGirisiYapildiMi: false,
      gonderimZamani: { lte: esik },
    },
  });
}

export async function listUrunGirisiBekleyenler(limit = 50) {
  const esik = new Date(Date.now() - URUN_GIRISI_BEKLEME_GUN * 86400000);
  return prisma.utsBildirim.findMany({
    where: {
      tip: 'ALMA',
      durum: 'GONDERILDI',
      urunGirisiYapildiMi: false,
      gonderimZamani: { lte: esik },
    },
    include: {
      branch: { select: { name: true, code: true } },
      kalemler: true,
    },
    orderBy: { gonderimZamani: 'asc' },
    take: limit,
  });
}

export async function listGonderilenUtsBildirimler(opts?: { days?: number; limit?: number }) {
  const days = opts?.days && opts.days > 0 ? opts.days : 30;
  const limit = Math.min(opts?.limit && opts.limit > 0 ? opts.limit : 100, 500);
  const since = new Date(Date.now() - days * 86400000);
  const where = { durum: 'GONDERILDI' as const, gonderimZamani: { gte: since } };
  const [data, count] = await Promise.all([
    prisma.utsBildirim.findMany({
      where,
      include: {
        branch: { select: { name: true, code: true } },
        kalemler: true,
      },
      orderBy: { gonderimZamani: 'desc' },
      take: limit,
    }),
    prisma.utsBildirim.count({ where }),
  ]);
  return { data, count, days };
}
