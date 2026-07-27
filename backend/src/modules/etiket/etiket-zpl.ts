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
  | 'gs1Referans';

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

export function modelVeRenk(raw: string): { model: string; renk: string } {
  const s = (raw ?? '').trim();
  return {
    model: s.match(/MODEL:\s*([^/|]+)/i)?.[1]?.trim() ?? '',
    renk: s.match(/RENK:\s*([^/|]+)/i)?.[1]?.trim() ?? '',
  };
}

export function gs1AiVerileri(veri: EtiketVeri): {
  gtin: string;
  skt?: string;
  lot?: string;
  seri?: string;
  utsVarMi: boolean;
} {
  const gtin = String(veri.utsKodu ?? veri.barkod ?? '')
    .replace(/\D/g, '')
    .padStart(14, '0')
    .slice(-14);
  const utsVarMi = Boolean(veri.utsKodu && String(veri.utsKodu).trim());
  return {
    gtin,
    skt: veri.sktTarihi,
    lot: veri.lotNo,
    seri: veri.seriNo,
    utsVarMi,
  };
}

/** Karekodun icine gomulecek GS1 element string (tarayici icin) */
export function buildGs1Data(veri: EtiketVeri): string {
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

function elementToZpl(el: CanvasElement, veri: EtiketVeri): string {
  if (el.type === 'kulakcik') return '';

  const x = Math.round(el.x);
  const y = Math.round(el.y);

  if (el.type === 'barcode128') {
    const val = escapeZpl(resolveElementText(el, veri) ?? 'REF001');
    const h = Math.round(el.height ?? 100);
    return `^FO${x},${y}^BCN,${h},Y,N,N^FD${val}^FS`;
  }

  if (el.type === 'gs1datamatrix') {
    const gs1 = escapeZpl(buildGs1Data(veri));
    const mod = Math.max(2, Math.min(10, Math.round((el.width ?? 115) / 12)));
    return `^FO${x},${y}^BQN,2,${mod}^FDMA,${gs1}^FS`;
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
      .map((line, i) => `^FO${x},${y + i * gap}^A0N,${font},${font}^FD${escapeZpl(line)}^FS`)
      .join('\n');
  }

  const text = resolveElementText(el, veri);
  if (!text) return '';
  const font = Math.round(el.fontSize ?? 12);
  return `^FO${x},${y}^A0N,${font},${font}^FD${escapeZpl(text)}^FS`;
}

export function generateZplFromSablon(
  elemanlar: CanvasElement[],
  genislikMm: number,
  yukseklikMm: number,
  veri: EtiketVeri,
): string {
  void genislikMm;
  void yukseklikMm;
  const lines = elemanlar
    .filter((e) => e.type !== 'kulakcik')
    .map((e) => elementToZpl(e, veri))
    .filter(Boolean);
  return `^XA\n${lines.join('\n')}\n^XZ`;
}

export function generateZplBatchFromSablon(
  elemanlar: CanvasElement[],
  genislikMm: number,
  yukseklikMm: number,
  veriler: EtiketVeri[],
): string {
  return veriler
    .map((v) => generateZplFromSablon(elemanlar, genislikMm, yukseklikMm, v))
    .join('\n');
}
