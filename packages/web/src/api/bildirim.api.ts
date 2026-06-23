import { adminApi } from '../pages/admin/AdminLayout'
import { apiClient } from './client'
import { getFiyatBildirimSayac } from './stok.api'

export type Bildirim = {
  id: string
  userId: string
  baslik: string
  mesaj: string
  link?: string | null
  tip: string
  okundu: boolean
  createdAt: string
}

export async function getBildirimler(okundu = false) {
  const res = await adminApi.get('/bildirimler', { params: { okundu } })
  return (res.data?.data ?? []) as Bildirim[]
}

export async function getBildirimSayac() {
  const res = await adminApi.get('/bildirimler/sayac')
  return Number(res.data?.count ?? 0)
}

export async function getToplamBildirimSayac() {
  const [genel, fiyat] = await Promise.all([
    getBildirimSayac().catch(() => 0),
    getFiyatBildirimSayac().catch(() => 0),
  ])
  return genel + fiyat
}

export async function bildirimOkunduIsaretle(id: string) {
  const res = await adminApi.patch(`/bildirimler/${id}/okundu`)
  return res.data
}

export async function tumBildirimleriOkunduIsaretle() {
  const res = await adminApi.patch('/bildirimler/okundu-tumu')
  return res.data
}

export async function getPosBildirimSayac() {
  const res = await apiClient.get('/bildirimler/sayac')
  return Number(res.data?.count ?? 0)
}

export async function getPosBildirimler(okundu = false) {
  const res = await apiClient.get('/bildirimler', { params: { okundu } })
  return (res.data?.data ?? []) as Bildirim[]
}
