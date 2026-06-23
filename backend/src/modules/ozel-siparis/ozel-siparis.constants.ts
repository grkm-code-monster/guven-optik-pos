export const OZEL_SIPARIS_DURUM_SIRASI = [
  'BEKLIYOR',
  'GONDERILDI',
  'URETIMDE',
  'KARGODA',
  'TESLIM_ALINDI',
  'LABORATUVARDA',
  'HAZIR',
  'TESLIM_EDILDI',
] as const

export type OzelSiparisDurum = (typeof OZEL_SIPARIS_DURUM_SIRASI)[number] | 'IPTAL'

export const OZEL_SIPARIS_DURUM_LABEL: Record<string, string> = {
  BEKLIYOR: 'Bekliyor',
  GONDERILDI: 'Gönderildi',
  TEDARIKCIE_GONDERILDI: 'Gönderildi',
  URETIMDE: 'Üretimde',
  KARGODA: 'Kargoda',
  TESLIM_ALINDI: 'Teslim Alındı',
  LABORATUVARDA: 'Laboratuvarda',
  HAZIR: 'Hazır',
  TESLIM_EDILDI: 'Teslim Edildi',
  MUSTERIYE_TESLIM: 'Teslim Edildi',
  IPTAL: 'İptal',
}

export function normalizeOzelSiparisDurum(durum: string): string {
  if (durum === 'TEDARIKCIE_GONDERILDI') return 'GONDERILDI'
  if (durum === 'MUSTERIYE_TESLIM') return 'TESLIM_EDILDI'
  return durum
}

export function ozelSiparisDurumLabel(durum: string): string {
  return OZEL_SIPARIS_DURUM_LABEL[durum] ?? OZEL_SIPARIS_DURUM_LABEL[normalizeOzelSiparisDurum(durum)] ?? durum
}
