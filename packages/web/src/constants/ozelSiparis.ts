export const OZEL_SIPARIS_DURUMLAR = [
  'BEKLIYOR',
  'GONDERILDI',
  'URETIMDE',
  'KARGODA',
  'TESLIM_ALINDI',
  'LABORATUVARDA',
  'HAZIR',
  'TESLIM_EDILDI',
  'IPTAL',
] as const

export const OZEL_SIPARIS_AKIS = [
  'BEKLIYOR',
  'GONDERILDI',
  'URETIMDE',
  'KARGODA',
  'TESLIM_ALINDI',
  'LABORATUVARDA',
  'HAZIR',
  'TESLIM_EDILDI',
] as const

export function normalizeOzelSiparisDurum(durum: string): string {
  if (durum === 'TEDARIKCIE_GONDERILDI') return 'GONDERILDI'
  if (durum === 'MUSTERIYE_TESLIM') return 'TESLIM_EDILDI'
  return durum
}

export const OZEL_SIPARIS_DURUM_RENK: Record<string, { bg: string; color: string; label: string }> = {
  BEKLIYOR: { bg: '#fef3c7', color: '#92400e', label: '⏳ Bekliyor' },
  GONDERILDI: { bg: '#eff6ff', color: '#1d4ed8', label: '📤 Gönderildi' },
  TEDARIKCIE_GONDERILDI: { bg: '#eff6ff', color: '#1d4ed8', label: '📤 Gönderildi' },
  URETIMDE: { bg: '#f3e8ff', color: '#7c3aed', label: '⚙️ Üretimde' },
  KARGODA: { bg: '#fff7ed', color: '#c2410c', label: '🚚 Kargoda' },
  TESLIM_ALINDI: { bg: '#dcfce7', color: '#166534', label: '📦 Teslim Alındı' },
  LABORATUVARDA: { bg: '#fef9c3', color: '#854d0e', label: '🔬 Laboratuvarda' },
  HAZIR: { bg: '#dbeafe', color: '#1e40af', label: '✅ Hazır' },
  TESLIM_EDILDI: { bg: '#f0fdf4', color: '#166534', label: '✓ Teslim Edildi' },
  MUSTERIYE_TESLIM: { bg: '#f0fdf4', color: '#166534', label: '✓ Teslim Edildi' },
  IPTAL: { bg: '#fee2e2', color: '#991b1b', label: '✕ İptal' },
}

export function ozelSiparisDurumLabel(durum: string): string {
  const norm = normalizeOzelSiparisDurum(durum)
  return OZEL_SIPARIS_DURUM_RENK[norm]?.label ?? OZEL_SIPARIS_DURUM_RENK[durum]?.label ?? durum
}
