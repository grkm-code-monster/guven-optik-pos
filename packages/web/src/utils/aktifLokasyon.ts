export const AKTIF_LOKASYON_KEY = 'aktifLokasyon'

export function getAktifLokasyon(): string {
  if (typeof window === 'undefined') return 'GVN1'
  return localStorage.getItem(AKTIF_LOKASYON_KEY) || 'GVN1'
}
