import { adminApi } from '../pages/admin/AdminLayout'

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
  createdAt: string
}

export type StokLot = {
  lotId: number | null
  seriNo: string
  adet: number
  fiyat: number
  barkod: string | null
}

export async function getStokUrunleri(params: Record<string, string | number | undefined>) {
  const res = await adminApi.get('/admin/stok-urunleri', { params })
  return res.data as { data: StokUrun[]; total: number; page: number; limit: number }
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

export async function getUrunLotlari(tmplId: number, lokasyon: string) {
  const res = await adminApi.get(`/admin/stok-urun/${tmplId}/lotlar`, { params: { lokasyon } })
  return (res.data?.data ?? []) as StokLot[]
}

export async function getFiyatBildirimleri(okundu?: boolean) {
  const res = await adminApi.get('/admin/fiyat-degisiklikleri', {
    params: okundu != null ? { okundu } : undefined,
  })
  return (res.data?.data ?? []) as FiyatBildirimi[]
}

export async function getFiyatBildirimSayac() {
  const res = await adminApi.get('/admin/fiyat-degisiklikleri/sayac')
  return Number(res.data?.count ?? 0)
}

export async function bildirimOkundu(id: string) {
  const res = await adminApi.patch(`/admin/fiyat-degisiklikleri/${id}/okundu`)
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
