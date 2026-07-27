export const AKTIF_LOKASYON_KEY = 'aktifLokasyon'

export function setAktifLokasyon(kod: string): void {
  if (typeof window === 'undefined' || !kod.trim()) return
  localStorage.setItem(AKTIF_LOKASYON_KEY, kod.trim())
}

/** POS şube kodu varsa onu kullan; yoksa localStorage (admin vb.) */
export function getAktifLokasyon(branchCode?: string | null): string {
  if (branchCode?.trim()) return branchCode.trim()
  if (typeof window === 'undefined') return 'GVN1'
  return localStorage.getItem(AKTIF_LOKASYON_KEY) || 'GVN1'
}
