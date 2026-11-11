import { normalizeGs1Raw } from '../odoo/gs1-parser.util';

export type ElementType =
  | 'kulakcik'
  | 'urunAdi'
  | 'icReferans'
  | 'renkVaryant'
  | 'icReferansRenk'
  | 'fiyat'
  | 'kdvDahildir'
  | 'sonGuncelleme'
  | 'seriNo'
  | 'barcode128'
  | 'gs1datamatrix'
  | 'serbestMetin'
  | 'kutu'
  | 'barkodMetin'
  | 'model'
  | 'renkKodu'
  | 'nitelik'
  | 'fiyatDegisimTarihi'
  | 'gs1Referans'
  | 'olcu';

export type CanvasElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  lineGap?: number;
  mode?: 'uts' | 'lotseri' | 'oto';
  text?: string;
  locked?: boolean;
};

export type EtiketVeri = {
  urunAdi?: string;
  icReferans?: string;
  renkVaryant?: string;
  fiyat?: string | number;
  seriNo?: string;
  barkod?: string;
  utsKodu?: string;
  sonGuncelleme?: string;
  lotNo?: string;
  sktTarihi?: string;
};

export const DOTS_PER_MM = 8;

/** gs1-parser.util.ts ile ayni — GS1 FNC1 grup ayiraci */
const FNC1 = '\x1d';

export function mmToDots(mm: number): number {
  return Math.round(mm * DOTS_PER_MM);
}

function escapeZpl(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~');
}

function formatFiyat(fiyat: number | string): string {
  const n = Number(fiyat);
  if (!Number.isFinite(n)) return String(fiyat);
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

/** "MODEL: GG1188S / RENK: C1 / ÖLÇÜ: 58" → "GG1188S C1 58" */
export function nitelikKisa(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const model = s.match(/MODEL:\s*([^/|]+)/i)?.[1]?.trim();
  const renk = s.match(/RENK:\s*([^/|]+)/i)?.[1]?.trim();
  const olcu = s.match(/(?:OLCU|ÖLÇÜ):\s*([^/|]+)/i)?.[1]?.trim();
  if (model || renk || olcu) {
    return [model, renk, olcu].filter(Boolean).join(' ');
  }
  return s.replace(/\s*\/\s*/g, ' ').replace(/MODEL:\s*|RENK:\s*|(?:OLCU|ÖLÇÜ):\s*/gi, '').trim();
}

export function modelVeRenk(raw: string): { model: string; renk: string; olcu: string } {
  const s = (raw ?? '').trim();
  if (/MODEL:|RENK:|OLCU:|ÖLÇÜ:/i.test(s)) {
    return {
      model: s.match(/MODEL:\s*([^/|]+)/i)?.[1]?.trim() ?? '',
      renk: s.match(/RENK:\s*([^/|]+)/i)?.[1]?.trim() ?? '',
      olcu: s.match(/(?:OLCU|ÖLÇÜ):\s*([^/|]+)/i)?.[1]?.trim() ?? '',
    };
  }
  // 09.11.2026 — Stok Yönetimi varyant etiketi "MS254PG / C2 / 48" (etiketsiz, sırayla model / renk / ölçü)
  // gönderiyor; önceden sadece "MODEL: .. / RENK: .." biçimi okunduğu için model/renk etikette boş çıkıyordu.
  // Ayırıcı " / " (boşluklu) — model adında boşluksuz "/" olabilir (ör. POLAROID "PLD4078/S/XPG").
  if (/\s\/\s/.test(s)) {
    const [model = '', renk = '', olcu = ''] = s.split(/\s+\/\s+/).map((p) => p.trim()).map((p) => (p === '—' ? '' : p));
    return { model, renk, olcu };
  }
  return { model: '', renk: '', olcu: '' };
}

/**
 * Ham UTS kodundan (GS1 element string: "01" + 14 haneli GTIN ile başlıyorsa)
 * ya da düz/eski formattan (yalnızca GTIN/barkod) doğru 14 haneli GTIN'i çıkarır.
 *
 * ÖNEMLİ: Önceki hatalı davranış tüm ham string'in SON 14 karakterini alıyordu
 * (`.slice(-14)`) — bu, utsKodu tam ham GS1 element string'i (ör.
 * "010868171513043921204211210802101") olduğunda GTIN yerine serinin bir
 * parçasını yakalayıp bwipp GS1badChecksum hatasına yol açıyordu. Doğrusu:
 * GS1 element string AI "01" ile başlar ve hemen ardından GELEN 14 hane GTIN'dir.
 */
function extractGtin14(ham: string): string {
  const s = String(ham ?? '').trim();
  if (/^01\d{14}/.test(s)) {
    return s.slice(2, 16);
  }
  return s.replace(/\D/g, '').padStart(14, '0').slice(-14);
}

export function gs1AiVerileri(veri: EtiketVeri): {
  gtin: string;
  skt?: string;
  lot?: string;
  seri?: string;
  utsVarMi: boolean;
} {
  const gtin = extractGtin14(String(veri.utsKodu ?? veri.barkod ?? ''));
  const utsVarMi = Boolean(veri.utsKodu && String(veri.utsKodu).trim());
  return {
    gtin,
    skt: veri.sktTarihi,
    lot: veri.lotNo,
    seri: veri.seriNo,
    utsVarMi,
  };
}

/**
 * 11.11.2026 — Lotun GERÇEK UTS karekodu (x_uts_kodu: "01"+GTIN+seri/lot/tarih) varsa, etiketteki karekod
 * birebir o UTS kodunu taşır. Önceden UTS'li ürünlerde de karekoda GTIN + programın kendi lot adı
 * ("GRS-19102026-EXC9783-076") yazılıyordu; okutunca UTS numarası yerine GRS... çıkıyordu.
 * Sadece GTIN olan (seri/lot içermeyen) utsKodu'nda eski davranış sürer.
 */
export function tamUtsKodu(veri: EtiketVeri): string | null {
  const s = normalizeGs1Raw(String(veri.utsKodu ?? ''));
  return /^01\d{14}/.test(s) && s.length > 18 ? s : null;
}

/** Karekodun icine gomulecek GS1 element string (tarayici icin) */
export function buildGs1Data(veri: EtiketVeri): string {
  const tam = tamUtsKodu(veri);
  if (tam) return tam;
  const { gtin, skt, lot, seri, utsVarMi } = gs1AiVerileri(veri);
  if (utsVarMi) {
    let s = `01${gtin}`;
    if (skt) s += `17${skt}`;
    if (lot) s += `${FNC1}10${lot}`;
    if (seri) s += `${FNC1}21${seri}`;
    return s;
  }
  let s = `01${gtin}`;
  if (lot) s += `${FNC1}10${lot}`;
  if (seri) s += `${FNC1}21${seri}`;
  return s;
}

/** Karekod yanina/altina yazilacak insan-okunur AI satirlari */
export function gs1ReferansSatirlari(
  veri: EtiketVeri,
  mode: 'uts' | 'lotseri' | 'oto' = 'oto',
): string[] {
  const { gtin, skt, lot, seri, utsVarMi } = gs1AiVerileri(veri);
  const kullanUts = mode === 'uts' || (mode === 'oto' && utsVarMi);
  const tam = kullanUts ? tamUtsKodu(veri) : null;
  if (tam) {
    // Ayırıcısız UTS kodlarında seri/lot sınırı kesin bilinemediği için yanlış bölmek yerine
    // GTIN'den sonrasını olduğu gibi (karekodun içeriğiyle birebir) yazıyoruz.
    const satir = [`(01) ${tam.slice(2, 16)}`];
    const kalan = tam.slice(16).replace(/\x1d/g, ' ').trim();
    for (let i = 0; i < kalan.length && satir.length < 3; i += 24) satir.push(kalan.slice(i, i + 24));
    return satir;
  }
  if (kullanUts) {
    const lines = [`(01) ${gtin}`];
    if (skt) lines.push(`(17) ${skt}`);
    if (lot) lines.push(`(10) ${lot}`);
    if (seri) lines.push(`(21) ${seri}`);
    return lines;
  }
  const lines: string[] = [];
  if (lot) lines.push(`(10) ${lot}`);
  if (seri) lines.push(`(21) ${seri}`);
  return lines;
}

export function resolveElementText(el: CanvasElement, veri: EtiketVeri): string | null {
  switch (el.type) {
    case 'kulakcik':
      return null;
    case 'kutu':
      return null;
    case 'gs1Referans':
      return null;
    case 'urunAdi':
      return veri.urunAdi ?? 'ÖRNEK ÜRÜN ADI';
    case 'icReferans':
      return veri.icReferans ?? 'REF001';
    case 'renkVaryant':
      return veri.renkVaryant ?? 'Siyah';
    case 'icReferansRenk':
      return `${veri.icReferans ?? 'REF001'} · ${veri.renkVaryant ?? 'Siyah'}`;
    case 'fiyat':
      return veri.fiyat != null ? formatFiyat(veri.fiyat) : '999,00 TL';
    case 'kdvDahildir':
      return 'KDV DAHİLDİR';
    case 'sonGuncelleme':
      return veri.sonGuncelleme ?? new Date().toLocaleDateString('tr-TR');
    case 'seriNo':
      return `Seri: ${veri.seriNo ?? 'SN-123456'}`;
    case 'serbestMetin':
      return el.text ?? 'Metin';
    case 'barcode128':
      return veri.barkod ?? veri.icReferans ?? 'REF001';
    case 'barkodMetin':
      return veri.barkod ?? veri.icReferans ?? '';
    case 'model':
      return modelVeRenk(String(veri.renkVaryant ?? '').trim() || String(veri.icReferans ?? '')).model;
    case 'renkKodu':
      return modelVeRenk(String(veri.renkVaryant ?? '').trim() || String(veri.icReferans ?? '')).renk;
    case 'olcu':
      return modelVeRenk(String(veri.renkVaryant ?? '').trim() || String(veri.icReferans ?? '')).olcu;
    case 'nitelik':
      return nitelikKisa(String(veri.renkVaryant ?? '').trim() || String(veri.icReferans ?? ''));
    case 'fiyatDegisimTarihi':
      return `FİYAT DEĞİŞİM TARİHİ: ${veri.sonGuncelleme ?? ''}`;
    case 'gs1datamatrix':
      return buildGs1Data(veri);
    default:
      return null;
  }
}

/**
 * Bir metni verilen genişliğe (dot) sığacak şekilde kırpar — taşmayı önler.
 * el.width tanımlı değilse (veya 0/negatifse) metin olduğu gibi döner, yani
 * width alanı girilmeyen elemanlarda davranış hiç değişmez (geriye dönük uyumlu).
 */
export function clipToWidth(text: string, fontSize: number, widthDots?: number): string {
  if (!widthDots || widthDots <= 0) return text;
  const ortalamaKarakterGenisligi = Math.max(1, fontSize) * 0.62;
  const maxKarakter = Math.max(1, Math.floor(widthDots / ortalamaKarakterGenisligi));
  if (text.length <= maxKarakter) return text;
  return text.slice(0, maxKarakter);
}

/** ^FH (hex) alanı için: '_' → _5F, GS1 grup ayırıcı (0x1D) → _1D */
function zplHexAlan(text: string): string {
  return String(text ?? '')
    .replace(/_/g, '_5F')
    .replace(/\^/g, '_5E')
    .replace(/~/g, '_7E')
    .replace(/\x1d/g, '_1D');
}

/** Data Matrix ECC200 kare sembol boyutu (modül) — veri uzunluğuna göre yaklaşık (ASCII kodlama). */
function dataMatrixBoyut(data: string): number {
  let cw = 0;
  for (let i = 0; i < data.length; i++) {
    if (/\d/.test(data[i]) && i + 1 < data.length && /\d/.test(data[i + 1])) { cw++; i++; } else cw++;
  }
  const tablo: [number, number][] = [[10, 3], [12, 5], [14, 8], [16, 12], [18, 18], [20, 22], [22, 30], [24, 36], [26, 44], [32, 62], [36, 86], [40, 114], [44, 144], [48, 174], [52, 204], [64, 280]];
  return (tablo.find(([, kap]) => kap >= cw) ?? tablo[tablo.length - 1])[0];
}

type ZplSecenek = { barkodMetinVar?: boolean };

/** Seri/lot satırı sığmazsa BAŞINDAN kısaltır — numaranın ayırt edici sonu (ör. -022) kaybolmasın. */
function sondanSigdir(text: string, fontSize: number, widthDots?: number): string {
  const kirpik = clipToWidth(text, fontSize, widthDots);
  if (kirpik.length >= text.length) return text;
  const m = /^(\(\d+\) )(.*)$/.exec(text);
  const on = m ? m[1] : '';
  const govde = m ? m[2] : text;
  const kalan = Math.max(1, kirpik.length - on.length - 1);
  return `${on}…${govde.slice(-kalan)}`;
}

function elementToZpl(el: CanvasElement, veri: EtiketVeri, secenek: ZplSecenek = {}): string {
  if (el.type === 'kulakcik') return '';

  const x = Math.round(el.x);
  const y = Math.round(el.y);

  if (el.type === 'barcode128') {
    const val = escapeZpl(resolveElementText(el, veri) ?? 'REF001');
    const h = Math.round(el.height ?? 100);
    // 09.11.2026 — Zebra varsayılan çubuk kalınlığı (^BY2) dar şablon alanına sığmıyordu → dar alanda ^BY1.
    // Barkod numarası şablonda ayrı yazılıyorsa (barkodMetin) çubuğun altına ikinci kez yazılmaz.
    // Otomatik mod (A): rakamlar çift çift (subset C) kodlanır → barkod yarı genişlikte. Çubuk kalınlığı
    // (^BY) kutuya sığan en kalın değer; 1 nokta (0,125 mm) termal baskıda okunmaz, en az 2 tercih edilir.
    const ham = String(resolveElementText(el, veri) ?? '');
    const tahminiModul = /^\d+$/.test(ham) ? 35 + 11 * Math.ceil(ham.length / 2) + 11 : 35 + 11 * ham.length;
    const modul = Math.max(1, Math.min(3, Math.floor((el.width ?? 300) / tahminiModul)));
    const yorum = secenek.barkodMetinVar ? 'N' : 'Y';
    return `^FO${x},${y}^BY${modul},2,${h}^BCN,${h},${yorum},N,N,A^FD${val}^FS`;
  }

  if (el.type === 'gs1datamatrix') {
    // 09.11.2026 — Argox (PPLA) ile aynı: Data Matrix (önceden QR basılıyordu ve şablon alanından çok büyük çıkıyordu).
    // Modül boyutu, sembol şablondaki kutuya (width/height) sığacak şekilde hesaplanır.
    const gs1 = buildGs1Data(veri);
    const kutu = Math.round(Math.min(el.width ?? 94, el.height ?? el.width ?? 94));
    const mod = Math.max(2, Math.min(10, Math.floor(kutu / dataMatrixBoyut(gs1))));
    return `^FO${x},${y}^BXN,${mod},200^FH^FD${zplHexAlan(gs1)}^FS`;
  }

  if (el.type === 'kutu') {
    const w = Math.round(el.width ?? 50);
    const h = Math.round(el.height ?? 30);
    return `^FO${x},${y}^GB${w},${h},1^FS`;
  }

  if (el.type === 'gs1Referans') {
    const satirlar = gs1ReferansSatirlari(veri, el.mode ?? 'oto');
    const font = Math.round(el.fontSize ?? 8);
    const gap = Math.round(el.lineGap ?? font + 2);
    return satirlar
      .map((line, i) => `^FO${x},${y + i * gap}^A0N,${font},${font}^FD${escapeZpl(sondanSigdir(line, font, el.width))}^FS`)
      .join('\n');
  }

  const rawText = resolveElementText(el, veri);
  if (!rawText) return '';
  const font = Math.round(el.fontSize ?? 12);
  const text = clipToWidth(rawText, font, el.width);
  return `^FO${x},${y}^A0N,${font},${font}^FD${escapeZpl(text)}^FS`;
}

/**
 * 09.11.2026 — Zebra (ZD220) + güneş gözlüğü katlanır etiket (102x20 mm) için yerleşim.
 * Şablon koordinatları Argox'a göre; Zebra'da aynı koordinatlar etiketin ön yüzünün kenarına ve katlama
 * çizgisinin üstüne denk geliyordu (yazı başı kesik, karekod katlamada). Eski programın Zebra'da sorunsuz
 * basılan yerleşimi esas alındı: ön yüz x≈320–630, karekod katlamanın öbür tarafında x≈650.
 */
export const ZEBRA_GUNES_KATLANIR: CanvasElement[] = [
  { id: 'barkod', type: 'barcode128', x: 320, y: 6, width: 300, height: 26 },
  { id: 'barkodNo', type: 'barkodMetin', x: 320, y: 35, fontSize: 11 },
  { id: 'urunAdi', type: 'urunAdi', x: 320, y: 50, fontSize: 15, width: 305 },
  { id: 'model', type: 'model', x: 320, y: 68, fontSize: 14, width: 150 },
  { id: 'renkKodu', type: 'renkKodu', x: 475, y: 68, fontSize: 14, width: 85 },
  { id: 'olcu', type: 'olcu', x: 565, y: 68, fontSize: 14, width: 60 },
  { id: 'fiyat', type: 'fiyat', x: 320, y: 86, fontSize: 28, width: 305 },
  { id: 'fiyatTarihi', type: 'fiyatDegisimTarihi', x: 320, y: 120, fontSize: 11, width: 305 },
  { id: 'kdv', type: 'kdvDahildir', x: 320, y: 135, fontSize: 11 },
  { id: 'karekod', type: 'gs1datamatrix', x: 650, y: 12, width: 100, height: 100 },
  { id: 'gs1Referans', type: 'gs1Referans', x: 645, y: 122, fontSize: 9, lineGap: 13, mode: 'oto', width: 168 },
];

export function generateZplFromSablon(
  elemanlar: CanvasElement[],
  genislikMm: number,
  yukseklikMm: number,
  veri: EtiketVeri,
  slug?: string | null,
): string {
  const kullanilan = slug === 'gunes-gozlugu-katlanir' ? ZEBRA_GUNES_KATLANIR : elemanlar;
  const secenek: ZplSecenek = { barkodMetinVar: kullanilan.some((e) => e.type === 'barkodMetin') };
  const lines = kullanilan
    .filter((e) => e.type !== 'kulakcik')
    .map((e) => elementToZpl(e, veri, secenek))
    .filter(Boolean);
  // 09.11.2026 — Zebra (ZD220 vb.) için: ^CI28 = UTF-8 (Türkçe harfler Ğ/Ü/İ/Ş düzgün basılsın),
  // ^PW/^LL = etiket genişliği/yüksekliği (203 dpi → 8 nokta/mm).
  const boyut: string[] = ['^CI28'];
  if (Number(genislikMm) > 0) boyut.push(`^PW${mmToDots(Number(genislikMm))}`);
  if (Number(yukseklikMm) > 0) boyut.push(`^LL${mmToDots(Number(yukseklikMm))}`);
  return `^XA\n${boyut.join('\n')}\n${lines.join('\n')}\n^XZ`;
}

export function generateZplBatchFromSablon(
  elemanlar: CanvasElement[],
  genislikMm: number,
  yukseklikMm: number,
  veriler: EtiketVeri[],
  slug?: string | null,
): string {
  return veriler
    .map((v) => generateZplFromSablon(elemanlar, genislikMm, yukseklikMm, v, slug))
    .join('\n');
}
