import type { SablonVeri } from './sablon-types'

export function formatFiyat(fiyat: number | string | undefined): string {
  const n = Number(fiyat ?? 0)
  if (!Number.isFinite(n)) return String(fiyat ?? '')
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
}

/** "MODEL: GG1188S / RENK: C1 / ÖLÇÜ: 58" → "GG1188S C1 58" */
export function nitelikKisa(raw: string): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  const model = s.match(/MODEL:\s*([^/|]+)/i)?.[1]?.trim()
  const renk = s.match(/RENK:\s*([^/|]+)/i)?.[1]?.trim()
  const olcu = s.match(/(?:OLCU|ÖLÇÜ):\s*([^/|]+)/i)?.[1]?.trim()
  if (model || renk || olcu) {
    return [model, renk, olcu].filter(Boolean).join(' ')
  }
  return s.replace(/\s*\/\s*/g, ' ').replace(/MODEL:\s*|RENK:\s*|(?:OLCU|ÖLÇÜ):\s*/gi, '').trim()
}

/** MODEL / RENK alanlarını ayrı ayrı çıkar */
export function modelVeRenk(raw: string): { model: string; renk: string } {
  const s = (raw ?? '').trim()
  return {
    model: s.match(/MODEL:\s*([^/|]+)/i)?.[1]?.trim() ?? '',
    renk: s.match(/RENK:\s*([^/|]+)/i)?.[1]?.trim() ?? '',
  }
}

/** SKT → GS1 (17) YYAAGG */
export function sktYyAagg(tarih?: string): string {
  const s = String(tarih ?? '').trim()
  if (!s) return ''
  if (/^\d{6}$/.test(s)) return s
  const tr = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (tr) return tr[3].slice(-2) + tr[2] + tr[1]
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[1].slice(-2) + iso[2] + iso[3]
  const digits = s.replace(/\D/g, '')
  return digits.length >= 6 ? digits.slice(-6) : digits
}

function gtin14(veri: SablonVeri): string {
  const uts = String(veri.utsKodu ?? '').trim()
  if (/^01\d{14}/.test(uts)) {
    return uts.slice(2, 16)
  }
  return String(veri.barkod ?? veri.utsKodu ?? '')
    .replace(/\D/g, '')
    .padStart(14, '0')
    .slice(-14)
}
/** GS1 DataMatrix ham metin */
export function buildGs1(veri: SablonVeri): string {
  const gtin = gtin14(veri)
  const serial = String(veri.seriNo ?? 'SN123456').replace(/[()]/g, '')
  return `(01)${gtin}(21)${serial}`
}

/**
 * Karekod yanı GS1 AI referans satırları — UTS doluysa 4 satır, yoksa lot/seri.
 */
export function gs1ReferansSatirlari(veri: SablonVeri): string[] {
  const uts = String(veri.utsKodu ?? '').trim()
  const lot = String(veri.lotNo ?? '').trim()
  const seri = String(veri.seriNo ?? '').trim()

  if (uts) {
    const lines: string[] = [`(01) ${gtin14(veri)}`]
    const skt = sktYyAagg(veri.sktTarihi)
    if (skt) lines.push(`(17) ${skt}`)
    if (lot && lot !== '-') lines.push(`(10) ${lot}`)
    if (seri && seri !== '-') lines.push(`(21) ${seri}`)
    return lines
  }

  const lines: string[] = []
  if (lot && lot !== '-') lines.push(`(10) ${lot}`)
  if (seri && seri !== '-') lines.push(`(21) ${seri}`)
  return lines
}

/** Dot koordinatını önizleme px'e çevir */
export function d(px: number, dot: number, labelDots: number, displaySize: number) {
  return (dot / labelDots) * displaySize
}
