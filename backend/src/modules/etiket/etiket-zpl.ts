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
  | 'serbestMetin';

export type CanvasElement = {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
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
};

export const DOTS_PER_MM = 8;

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

function buildGs1Data(veri: EtiketVeri): string {
  const gtin = String(veri.utsKodu ?? veri.barkod ?? '08612345678903').replace(/\D/g, '').padStart(14, '0').slice(-14);
  const serial = String(veri.seriNo ?? 'SN123456').replace(/[()]/g, '');
  return `(01)${gtin}(21)${serial}`;
}

function resolveElementText(el: CanvasElement, veri: EtiketVeri): string | null {
  switch (el.type) {
    case 'kulakcik':
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
    const gs1 = escapeZpl(resolveElementText(el, veri) ?? buildGs1Data(veri));
    const mod = Math.max(2, Math.min(10, Math.round((el.width ?? 115) / 12)));
    return `^FO${x},${y}^BQN,2,${mod}^FDMA,${gs1}^FS`;
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
