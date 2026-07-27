/**
 * Etiket sablonu → canvas PNG (ZPL/PPLA koordinatlari: sol-ust koken, Y asagi, 8 dot/mm).
 */
import bwipjs from 'bwip-js'
import JsBarcode from 'jsbarcode'
import {
  formatFiyat,
  gs1ReferansSatirlari as gs1RefSatirlariLegacy,
  modelVeRenk,
  nitelikKisa,
  sktYyAagg,
} from '../etiket-tasarimci/sablon-utils'

export const DOTS_PER_MM = 8
const FNC1 = '\x1d'

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

export type CanvasElement = {
  id: string
  type: ElementType
  x: number
  y: number
  width?: number
  height?: number
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  lineGap?: number
  mode?: 'uts' | 'lotseri' | 'oto'
  text?: string
}

export type EtiketRenderVeri = {
  urunAdi?: string
  icReferans?: string
  renkVaryant?: string
  fiyat?: string | number
  seriNo?: string
  barkod?: string
  utsKodu?: string
  sonGuncelleme?: string
  lotNo?: string
  sktTarihi?: string
}

export type EtiketSablonRender = {
  elemanlar: CanvasElement[]
  genislikMm: number
  yukseklikMm: number
}

function gtin14(veri: EtiketRenderVeri): string {
  return String(veri.utsKodu ?? veri.barkod ?? '')
    .replace(/\D/g, '')
    .padStart(14, '0')
    .slice(-14)
}

/** backend/etiket-zpl.ts buildGs1Data ile ayni */
export function buildGs1Data(veri: EtiketRenderVeri): string {
  const gtin = gtin14(veri)
  const utsVarMi = Boolean(veri.utsKodu && String(veri.utsKodu).trim())
  const skt = veri.sktTarihi ? sktYyAagg(veri.sktTarihi) : undefined
  const lot = veri.lotNo && veri.lotNo !== '-' ? veri.lotNo : undefined
  const seri = veri.seriNo && veri.seriNo !== '-' ? veri.seriNo : undefined

  if (utsVarMi) {
    let s = `01${gtin}`
    if (skt) s += `17${skt}`
    if (lot) s += `${FNC1}10${lot}`
    if (seri) s += `${FNC1}21${seri}`
    return s
  }
  let s = `01${gtin}`
  if (lot) s += `${FNC1}10${lot}`
  if (seri) s += `${FNC1}21${seri}`
  return s
}

/** bwip-js gs1datamatrix icin AI-parantezli format (FNC1/GS otomatik eklenir, elle koymayin) */
function buildGs1DataForBwip(veri: EtiketRenderVeri): string {
  const gtin = gtin14(veri)
  const utsVarMi = Boolean(veri.utsKodu && String(veri.utsKodu).trim())
  const skt = veri.sktTarihi ? sktYyAagg(veri.sktTarihi) : undefined
  const lot = veri.lotNo && veri.lotNo !== '-' ? veri.lotNo : undefined
  const seri = veri.seriNo && veri.seriNo !== '-' ? veri.seriNo : undefined

  let s = `(01)${gtin}`
  if (utsVarMi && skt) s += `(17)${skt}`
  if (lot) s += `(10)${lot}`
  if (seri) s += `(21)${seri}`
  return s
}

function gs1ReferansSatirlari(
  veri: EtiketRenderVeri,
  mode: 'uts' | 'lotseri' | 'oto' = 'oto',
): string[] {
  const utsVarMi = Boolean(veri.utsKodu && String(veri.utsKodu).trim())
  const kullanUts = mode === 'uts' || (mode === 'oto' && utsVarMi)
  const legacy = {
    urunAdi: veri.urunAdi ?? '',
    icReferans: veri.icReferans ?? '',
    renkVaryant: veri.renkVaryant,
    fiyat: veri.fiyat,
    seriNo: veri.seriNo,
    barkod: veri.barkod,
    utsKodu: kullanUts ? veri.utsKodu ?? undefined : undefined,
    lotNo: veri.lotNo ?? undefined,
    sktTarihi: veri.sktTarihi,
    sonGuncelleme: veri.sonGuncelleme,
  }
  return gs1RefSatirlariLegacy(legacy)
}

function resolveElementText(el: CanvasElement, veri: EtiketRenderVeri): string | null {
  const nitelikRaw = String(veri.renkVaryant ?? '').trim() || String(veri.icReferans ?? '')
  switch (el.type) {
    case 'kulakcik':
    case 'kutu':
    case 'gs1Referans':
      return null
    case 'urunAdi':
      return veri.urunAdi ?? 'ÖRNEK ÜRÜN ADI'
    case 'icReferans':
      return veri.icReferans ?? 'REF001'
    case 'renkVaryant':
      return veri.renkVaryant ?? 'Siyah'
    case 'icReferansRenk':
      return `${veri.icReferans ?? 'REF001'} · ${veri.renkVaryant ?? 'Siyah'}`
    case 'fiyat':
      return veri.fiyat != null ? formatFiyat(veri.fiyat) : '999,00 TL'
    case 'kdvDahildir':
      return 'KDV DAHİLDİR'
    case 'sonGuncelleme':
      return veri.sonGuncelleme ?? new Date().toLocaleDateString('tr-TR')
    case 'seriNo':
      return `Seri: ${veri.seriNo ?? 'SN-123456'}`
    case 'serbestMetin':
      return el.text ?? 'Metin'
    case 'barcode128':
      return veri.barkod ?? veri.icReferans ?? 'REF001'
    case 'barkodMetin':
      return veri.barkod ?? veri.icReferans ?? ''
    case 'model':
      return modelVeRenk(nitelikRaw).model
    case 'renkKodu':
      return modelVeRenk(nitelikRaw).renk
    case 'nitelik':
      return nitelikKisa(nitelikRaw)
    case 'fiyatDegisimTarihi':
      return `FİYAT DEĞİŞİM TARİHİ: ${veri.sonGuncelleme ?? ''}`
    case 'gs1datamatrix':
      return buildGs1Data(veri)
    default:
      return null
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  text: string,
) {
  const fontSize = Math.round(el.fontSize ?? 12)
  const weight = el.fontWeight === 'bold' ? 'bold' : 'normal'
  ctx.font = `${weight} ${fontSize}px Arial, Helvetica, sans-serif`
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  ctx.fillText(text, Math.round(el.x), Math.round(el.y))
}

function drawBarcode128(ctx: CanvasRenderingContext2D, el: CanvasElement, data: string) {
  const w = Math.round(el.width ?? 200)
  const h = Math.round(el.height ?? 40)
  const tmp = document.createElement('canvas')
  JsBarcode(tmp, data, {
    format: 'CODE128',
    width: 1,
    height: h,
    displayValue: false,
    margin: 0,
  })
  ctx.drawImage(tmp, Math.round(el.x), Math.round(el.y), w, h)
}

function drawGs1DataMatrix(ctx: CanvasRenderingContext2D, el: CanvasElement, gs1: string) {
  const size = Math.round(el.width ?? el.height ?? 94)
  const mod = Math.max(2, Math.min(10, Math.round(size / 12)))
  const tmp = document.createElement('canvas')
  bwipjs.toCanvas(tmp, {
    bcid: 'gs1datamatrix',
    text: gs1,
    scale: mod,
    paddingwidth: 0,
    paddingheight: 0,
    includetext: false,
  })
  ctx.drawImage(tmp, Math.round(el.x), Math.round(el.y), size, size)
}

function drawBox(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  const x = Math.round(el.x)
  const y = Math.round(el.y)
  const w = Math.round(el.width ?? 50)
  const h = Math.round(el.height ?? 30)
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
}

function drawGs1Referans(ctx: CanvasRenderingContext2D, el: CanvasElement, veri: EtiketRenderVeri) {
  const satirlar = gs1ReferansSatirlari(veri, el.mode ?? 'oto')
  const fontSize = Math.round(el.fontSize ?? 8)
  const gap = Math.round(el.lineGap ?? fontSize + 2)
  satirlar.forEach((line, i) => {
    drawText(ctx, { ...el, y: el.y + i * gap, fontSize }, line)
  })
}

function drawElement(ctx: CanvasRenderingContext2D, el: CanvasElement, veri: EtiketRenderVeri) {
  if (el.type === 'kulakcik') return

  if (el.type === 'barcode128') {
    const val = resolveElementText(el, veri) ?? 'REF001'
    drawBarcode128(ctx, el, val)
    return
  }

  if (el.type === 'gs1datamatrix') {
    drawGs1DataMatrix(ctx, el, buildGs1DataForBwip(veri))
    return
  }

  if (el.type === 'kutu') {
    drawBox(ctx, el)
    return
  }

  if (el.type === 'gs1Referans') {
    drawGs1Referans(ctx, el, veri)
    return
  }

  const text = resolveElementText(el, veri)
  if (text) drawText(ctx, el, text)
}

export function renderEtiketToCanvas(
  sablon: EtiketSablonRender,
  veri: EtiketRenderVeri,
): HTMLCanvasElement {
  const w = Math.round(sablon.genislikMm * DOTS_PER_MM)
  const h = Math.round(sablon.yukseklikMm * DOTS_PER_MM)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D desteklenmiyor')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)

  for (const el of sablon.elemanlar) {
    drawElement(ctx, el, veri)
  }

  return canvas
}

export function renderEtiketToDataUrl(
  sablon: EtiketSablonRender,
  veri: EtiketRenderVeri,
): string {
  return renderEtiketToCanvas(sablon, veri).toDataURL('image/png')
}

export function renderEtiketBatchToDataUrls(
  sablon: EtiketSablonRender,
  veriler: EtiketRenderVeri[],
): { dataUrl: string; genislikMm: number; yukseklikMm: number }[] {
  return veriler.map((veri) => ({
    dataUrl: renderEtiketToDataUrl(sablon, veri),
    genislikMm: sablon.genislikMm,
    yukseklikMm: sablon.yukseklikMm,
  }))
}
