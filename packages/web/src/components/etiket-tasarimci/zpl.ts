import type { CanvasElement, EtiketVeri } from './constants'

function escapeZpl(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~')
}

function formatFiyat(fiyat: number | string): string {
  const n = Number(fiyat)
  if (!Number.isFinite(n)) return String(fiyat)
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
}

function buildGs1Data(veri: EtiketVeri): string {
  const gtin = String(veri.utsKodu ?? veri.barkod ?? '08612345678903').replace(/\D/g, '').padStart(14, '0').slice(-14)
  const serial = String(veri.seriNo ?? 'SN123456').replace(/[()]/g, '')
  return `(01)${gtin}(21)${serial}`
}

function resolveElementText(el: CanvasElement, veri: EtiketVeri): string | null {
  switch (el.type) {
    case 'kulakcik':
    case 'cizgi':
    case 'cerceve':
    case 'gs1Kod':
      return null
    case 'icReferansRenk':
      return `${veri.icReferans ?? 'REF001'}  |  ${veri.renkVaryant ?? 'Siyah'}`
    case 'sonGuncelleme':
      return `Son fiyat günc: ${veri.sonGuncelleme ?? '22.06.2026'}`
    case 'urunAdi': return veri.urunAdi ?? 'ÖRNEK ÜRÜN ADI'
    case 'icReferans': return veri.icReferans ?? 'REF001'
    case 'renkVaryant': return veri.renkVaryant ?? 'Siyah'
    case 'fiyat': return veri.fiyat != null ? formatFiyat(veri.fiyat) : '999,00 TL'
    case 'kdvDahildir': return 'KDV DAHİLDİR'
    case 'seriNo': return `Seri: ${veri.seriNo ?? 'SN-123456'}`
    case 'serbestMetin': return el.text ?? 'Metin'
    case 'barcode128': return veri.barkod ?? veri.icReferans ?? 'REF001'
    case 'gs1datamatrix': return buildGs1Data(veri)
    default: return null
  }
}

function elementToZpl(el: CanvasElement, veri: EtiketVeri): string {
  if (el.type === 'kulakcik' || el.type === 'cizgi' || el.type === 'cerceve' || el.type === 'gs1Kod') return ''
  const x = Math.round(el.x)
  const y = Math.round(el.y)

  if (el.type === 'barcode128') {
    const val = escapeZpl(resolveElementText(el, veri) ?? 'REF001')
    const h = Math.round(el.height ?? 100)
    return `^FO${x},${y}^BCN,${h},Y,N,N^FD${val}^FS`
  }
  if (el.type === 'gs1datamatrix') {
    const gs1 = escapeZpl(resolveElementText(el, veri) ?? buildGs1Data(veri))
    const mod = Math.max(2, Math.min(10, Math.round((el.width ?? 115) / 12)))
    return `^FO${x},${y}^BQN,2,${mod}^FDMA,${gs1}^FS`
  }

  const text = resolveElementText(el, veri)
  if (!text) return ''
  const font = Math.round(el.fontSize ?? 12)
  return `^FO${x},${y}^A0N,${font},${font}^FD${escapeZpl(text)}^FS`
}

export function generateZplFromElements(
  elemanlar: CanvasElement[],
  veri: EtiketVeri,
): string {
  const lines = elemanlar
    .filter((e) => e.type !== 'kulakcik')
    .map((e) => elementToZpl(e, veri))
    .filter(Boolean)
  return `^XA\n${lines.join('\n')}\n^XZ`
}
