export function formatFiyat(fiyat: number | string | undefined): string {
  const n = Number(fiyat ?? 0)
  if (!Number.isFinite(n)) return String(fiyat ?? '')
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
}

/** Dot koordinatını önizleme px'e çevir */
export function d(px: number, dot: number, labelDots: number, displaySize: number) {
  return (dot / labelDots) * displaySize
}
