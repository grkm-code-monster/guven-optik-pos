/**
 * Argox PPLA etiket uretici — Mercury Series Programmer's Manual V1.00 (Section A6/A9/A10).
 * Koordinat: sol-alt koken (A1), Y yukari; ZPL tasarim koordinatlari sol-ust / Y asagi.
 */
import {
  buildGs1Data,
  clipToWidth,
  DOTS_PER_MM,
  gs1ReferansSatirlari,
  resolveElementText,
  type CanvasElement,
  type EtiketVeri,
} from './etiket-zpl';

/** 203 dpi Argox OS-214plus — D11 = 1x1 dot (Manual A5, sf.46; ornekler D11 kullanir) */
export const PPLA_D_COMMAND = 'D11';

/** Manual A5/A6: etiket blogu <STX>L<CR> ile acilir; satir sonu <CR> (0x0D) */
export const PPLA_BLOCK_START = '\x02L\r';
export const PPLA_EOL = '\r';

/** Data Matrix ECC200 sabit blogu: 200 + 0 + jjj + kkk (Manual A9 Bar code W, sf.104) */
export const PPLA_DATAMATRIX_FIXED = '2000000000';

function pad3(n: number): string {
  return Math.max(0, Math.min(999, Math.round(n))).toString().padStart(3, '0');
}

function pad4(n: number): string {
  return Math.max(0, Math.min(9999, Math.round(n))).toString().padStart(4, '0');
}

/** ZPL ust-sol Y → PPLA alt-sol Y (A1, A6) */
export function zplYToPplaY(zplY: number, labelHeightDots: number, elementHeightDots: number): number {
  return labelHeightDots - zplY - elementHeightDots;
}

/** fontSize (dot) → ASD smooth alt font (A6 Text, sf.64; A8 ornekleri) */
function asdSubFont(fontSize: number): string {
  if (fontSize <= 9) return '002';
  if (fontSize <= 11) return '003';
  if (fontSize <= 13) return '004';
  if (fontSize <= 16) return '005';
  if (fontSize <= 20) return '006';
  if (fontSize <= 24) return '007';
  return '008';
}

/** PPLA olcek: '1'..'9', 'A'..'O' (A6) */
function scaleChar(scale: number): string {
  const s = Math.max(1, Math.min(24, Math.round(scale)));
  if (s <= 9) return String(s);
  return String.fromCharCode('A'.charCodeAt(0) + s - 10);
}

/** Data Matrix modul carpani → PPLA c/d parametresi (A9 Bar code W, sf.104) */
function moduleMultiplierChar(mod: number): string {
  const m = Math.max(1, Math.min(24, Math.round(mod)));
  if (m <= 9) return String(m);
  return String.fromCharCode('A'.charCodeAt(0) + m - 10);
}

function pplaTextCommand(
  x: number,
  zplY: number,
  fontSize: number,
  text: string,
  labelHeightDots: number,
  fontWeight?: 'normal' | 'bold',
): string {
  const sub = asdSubFont(fontSize);
  const hScale = fontWeight === 'bold' ? scaleChar(2) : '1';
  const vScale = fontWeight === 'bold' ? scaleChar(2) : '1';
  const pplaY = zplYToPplaY(zplY, labelHeightDots, fontSize);
  return `19${hScale}${vScale}${sub}${pad4(pplaY)}${pad4(x)}${text}`;
}

function pplaBarcode128(
  x: number,
  zplY: number,
  height: number,
  data: string,
  labelHeightDots: number,
  humanReadable: boolean,
): string {
  const barType = humanReadable ? 'E' : 'e';
  const pplaY = zplYToPplaY(zplY, labelHeightDots, height);
  return `1${barType}00${pad3(height)}${pad4(pplaY)}${pad4(x)}${data}`;
}

function pplaDataMatrix(
  x: number,
  zplY: number,
  sizeDots: number,
  data: string,
  labelHeightDots: number,
  moduleMod: number,
): string {
  const pplaY = zplYToPplaY(zplY, labelHeightDots, sizeDots);
  const mod = moduleMultiplierChar(moduleMod);
  return `1W1c${mod}${mod}000${pad4(pplaY)}${pad4(x)}${PPLA_DATAMATRIX_FIXED}${data}`;
}

function pplaBox(
  x: number,
  zplY: number,
  width: number,
  height: number,
  labelHeightDots: number,
  thickness = 2,
): string {
  const pplaY = zplYToPplaY(zplY, labelHeightDots, height);
  const t = pad3(thickness);
  return `1X11000${pad4(pplaY)}${pad4(x)}B${pad3(width)}${pad3(height)}${t}${t}`;
}

export function elementToPpla(
  el: CanvasElement,
  veri: EtiketVeri,
  labelHeightDots: number,
  dotsPerMm: number = DOTS_PER_MM,
): string {
  void dotsPerMm;
  if (el.type === 'kulakcik') return '';

  const x = Math.round(el.x);
  const y = Math.round(el.y);

  if (el.type === 'barcode128') {
    const val = resolveElementText(el, veri) ?? 'REF001';
    const h = Math.round(el.height ?? 100);
    return pplaBarcode128(x, y, h, val, labelHeightDots, true);
  }

  if (el.type === 'gs1datamatrix') {
    const gs1 = buildGs1Data(veri);
    const size = Math.round(el.height ?? el.width ?? 94);
    const mod = Math.max(2, Math.min(10, Math.round((el.width ?? 115) / 12)));
    return pplaDataMatrix(x, y, size, gs1, labelHeightDots, mod);
  }

  if (el.type === 'kutu') {
    const w = Math.round(el.width ?? 50);
    const h = Math.round(el.height ?? 30);
    return pplaBox(x, y, w, h, labelHeightDots);
  }

  if (el.type === 'gs1Referans') {
    const satirlar = gs1ReferansSatirlari(veri, el.mode ?? 'oto');
    const font = Math.round(el.fontSize ?? 8);
    const gap = Math.round(el.lineGap ?? font + 2);
    return satirlar
      .map((line, i) => pplaTextCommand(x, y + i * gap, font, line, labelHeightDots))
      .join(PPLA_EOL);
  }

  const rawText = resolveElementText(el, veri);
  if (!rawText) return '';
  const font = Math.round(el.fontSize ?? 12);
  const text = clipToWidth(rawText, font, el.width);
  return pplaTextCommand(x, y, font, text, labelHeightDots, el.fontWeight);
}

export function generatePplaFromSablon(
  elemanlar: CanvasElement[],
  genislikMm: number,
  yukseklikMm: number,
  veri: EtiketVeri,
  dotsPerMm: number = DOTS_PER_MM,
): string {
  void genislikMm;
  const labelHeightDots = Math.round(yukseklikMm * dotsPerMm);
  const lines = elemanlar
    .filter((e) => e.type !== 'kulakcik')
    .map((e) => elementToPpla(e, veri, labelHeightDots, dotsPerMm))
    .filter(Boolean);
  return `${PPLA_BLOCK_START}${PPLA_D_COMMAND}${PPLA_EOL}${lines.join(PPLA_EOL)}${PPLA_EOL}E`;
}

export function generatePplaBatchFromSablon(
  elemanlar: CanvasElement[],
  genislikMm: number,
  yukseklikMm: number,
  veriler: EtiketVeri[],
  dotsPerMm: number = DOTS_PER_MM,
): string {
  return veriler
    .map((v) => generatePplaFromSablon(elemanlar, genislikMm, yukseklikMm, v, dotsPerMm))
    .join(PPLA_EOL);
}
