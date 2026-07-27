import { adminApi } from '../pages/admin/AdminLayout'
import { apiClient } from './client'

export type StokUrun = {
  id: number
  icReferans: string
  urunAdi: string
  kategori: string
  kategoriId: number | null
  satisFiyati: number
  alisFiyati: number
  kdvOrani: number
  toplamStok: number
  aktif: boolean
  varyantSayisi: number
}

export type SablonVaryant = {
  id: number
  active: boolean
  default_code: string
  barcode: string
  lst_price: number
  standard_price: number
  model: string
  renk: string
  olcu: string
  attrs: Record<string, string>
}

export type FiyatBildirimi = {
  id: string
  urunId: number
  urunAdi: string
  eskiFiyat: string | number
  yeniFiyat: string | number
  fiyatTipi: string
  subeKodu: string
  okundu: boolean
  etiketBasildi: boolean
  etiketBasilmaTarihi: string | null
  sonHatirlatmaTarihi: string | null
  kategoriAdi: string | null
  createdAt: string
}

export type StokLot = {
  lotId: number | null
  seriNo: string
  adet: number
  fiyat: number
  barkod: string | null
}

export type VaryantLotBilgisi = {
  productId: number
  kategoriId: number | null
  utsKodu: string | null
  lotNo: string | null
  lotId: number | null
}

export async function getVaryantLotBilgisi(productId: number) {
  const res = await adminApi.get(`/admin/varyant-lot-bilgisi/${productId}`)
  return (res.data?.data ?? null) as VaryantLotBilgisi
}

export async function getStokUrunleri(params: Record<string, string | number | undefined>) {
  const res = await adminApi.get('/admin/stok-urunleri', { params })
  return res.data as { data: StokUrun[]; total: number; page: number; limit: number }
}

export async function getSablonVaryantlari(tmplId: number) {
  const res = await adminApi.get(`/admin/odoo-sablon/${tmplId}/varyantlar`)
  return (res.data?.data ?? []) as SablonVaryant[]
}

export async function guncelleOdooVaryant(varyant: {
  odooId: number
  icReferans?: string
  barkod?: string
  satisFiyati: number
  maliyet: number
}) {
  const res = await adminApi.patch('/admin/odoo-varyant-guncelle', {
    varyantlar: [{
      odooId: varyant.odooId,
      icReferans: varyant.icReferans ?? '',
      barkod: varyant.barkod ?? '',
      satisFiyati: varyant.satisFiyati,
      maliyet: varyant.maliyet,
    }],
  })
  return res.data
}

export async function guncelleStokFiyat(payload: {
  urunId: number
  satisFiyati?: number
  alisFiyati?: number
}) {
  const res = await adminApi.patch('/admin/stok-fiyat', payload)
  return res.data
}

export async function topluStokFiyatGuncelle(payload: {
  urunIds: number[]
  tip: 'yuzde' | 'sabit' | 'yeni'
  deger: number
  hedef: 'satis' | 'alis' | 'her_ikisi'
}) {
  const res = await adminApi.post('/admin/stok-fiyat-toplu', payload)
  return res.data
}

export async function topluStokUrunArsivle(urunIds: number[]) {
  const res = await adminApi.post('/admin/stok-urunleri/arsivle', { urunIds })
  return res.data as { success: boolean; basarili: number; toplam: number; sonuclar: Array<{ urunId: number; basarili: boolean; hata?: string }> }
}

export async function topluStokUrunArsivdenCikar(urunIds: number[]) {
  const res = await adminApi.post('/admin/stok-urunleri/arsivden-cikar', { urunIds })
  return res.data as { success: boolean; basarili: number; toplam: number; sonuclar: Array<{ urunId: number; basarili: boolean; hata?: string }> }
}

export async function topluVaryantArsivle(variantIds: number[]) {
  const res = await adminApi.post('/admin/odoo-sablon/varyant-arsivle', { variantIds })
  return res.data as { success: boolean; basarili: number; toplam: number; sonuclar: Array<{ variantId: number; basarili: boolean; hata?: string }> }
}

export async function topluVaryantArsivdenCikar(variantIds: number[]) {
  const res = await adminApi.post('/admin/odoo-sablon/varyant-arsivden-cikar', { variantIds })
  return res.data as { success: boolean; basarili: number; toplam: number; sonuclar: Array<{ variantId: number; basarili: boolean; hata?: string }> }
}

export type StokDisaAktarFormat = 'pdf' | 'xlsx' | 'csv'

export async function disaAktarStokUrunleri(urunIds: number[], format: StokDisaAktarFormat) {
  const res = await adminApi.post('/admin/stok-urunleri/disa-aktar', { urunIds, format }, { responseType: 'blob' })
  return res
}

export async function disaAktarStokVaryantlari(variantIds: number[], format: StokDisaAktarFormat) {
  const res = await adminApi.post('/admin/odoo-sablon/varyant-disa-aktar', { variantIds, format }, { responseType: 'blob' })
  return res
}

export async function getUrunLotlari(tmplId: number, lokasyon: string) {
  const res = await adminApi.get(`/admin/stok-urun/${tmplId}/lotlar`, { params: { lokasyon } })
  return (res.data?.data ?? []) as StokLot[]
}

export async function getFiyatBildirimleri(okundu?: boolean, etiketBasildi?: boolean) {
  const res = await adminApi.get('/admin/fiyat-degisiklikleri', {
    params: {
      ...(okundu != null ? { okundu } : {}),
      ...(etiketBasildi != null ? { etiketBasildi } : {}),
    },
  })
  return (res.data?.data ?? []) as FiyatBildirimi[]
}

export async function getPosFiyatBildirimleri(etiketBasildi = false) {
  const res = await apiClient.get('/admin/fiyat-degisiklikleri', {
    params: { etiketBasildi },
  })
  return (res.data?.data ?? []) as FiyatBildirimi[]
}

export async function getPosUrunLotlari(tmplId: number, lokasyon: string) {
  const res = await apiClient.get(`/admin/stok-urun/${tmplId}/lotlar`, { params: { lokasyon } })
  return (res.data?.data ?? []) as StokLot[]
}

export async function posFiyatBildirimEtiketBasildi(id: string) {
  const res = await apiClient.patch(`/admin/fiyat-degisiklikleri/${id}/etiket-basildi`)
  return res.data
}

export async function posFiyatBildirimEtiketBasildiToplu(ids: string[]) {
  const res = await apiClient.post('/admin/fiyat-degisiklikleri/toplu-etiket-basildi', { ids })
  return res.data as { success: boolean; count: number }
}

export async function getFiyatBildirimSayac() {
  const res = await adminApi.get('/admin/fiyat-degisiklikleri/sayac')
  return Number(res.data?.count ?? 0)
}

export async function bildirimOkundu(id: string) {
  const res = await adminApi.patch(`/admin/fiyat-degisiklikleri/${id}/okundu`)
  return res.data
}

export async function fiyatBildirimEtiketBasildi(id: string) {
  const res = await adminApi.patch(`/admin/fiyat-degisiklikleri/${id}/etiket-basildi`)
  return res.data
}

export async function tumBildirimleriOkundu() {
  const res = await adminApi.patch('/admin/fiyat-degisiklikleri/okundu-tumu')
  return res.data
}

export async function getOdooKategoriler() {
  const res = await adminApi.get('/admin/odoo-kategoriler')
  return (res.data?.data ?? []) as Array<{
    id: number
    name: string
    parent_id: false | [number, string]
    complete_name: string
  }>
}

export type StokKontrolLokasyon = {
  kod: string
  miktar: number
  reserved: number
}

export type StokKontrolUrun = {
  productId: number
  urunAdi: string
  barkod?: string
  kategori: string
  satisFiyati: number
  kdvOrani: number
  toplamStok: number
  lokasyonlar: StokKontrolLokasyon[]
}

export type StokKontrolParams = {
  q?: string
  kategoriId?: number
  fiyatMin?: number
  fiyatMax?: number
  stokDurumu?: 'var' | 'sifir'
  lokasyon?: string
  kdv?: number
}

export async function getStokKontrol(params: StokKontrolParams) {
  const res = await adminApi.get('/admin/stok-kontrol', { params })
  return (res.data?.data ?? []) as StokKontrolUrun[]
}

export async function indirUtsDuzeltmeSablon(productIds: number[]): Promise<void> {
  const res = await adminApi.post(
    '/admin/stok-kontrol/uts-duzeltme-sablon',
    { productIds },
    { responseType: 'blob' },
  )
  const blob = new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `uts-duzeltme-sablon-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export type TransferKalem = {
  kaynak: number
  hedef: number
  productId: number
  lotId?: number | null
  miktar: number
  urunAdi: string
}

export async function olusturTransferTalebi(kalemler: TransferKalem[]) {
  const res = await adminApi.post('/admin/transfer-olustur', { kalemler })
  return res.data as { success: boolean; transferler?: unknown[]; error?: string }
}
