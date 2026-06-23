import { apiClient } from './client'
import { adminApi } from '../pages/admin/AdminLayout'

export type OzelSiparis = {
  id: string
  musteriAdi: string
  musteriTelefon?: string | null
  urunAdi: string
  miktar: number
  durum: string
  subeId?: string | null
  subeAdi?: string | null
  createdAt: string
}

export type OzelSiparisKarekod = {
  id: string
  siparisId: string
  karekod: string
  createdAt: string
}

export async function getSubeOzelSiparisler(durumlar: string[]) {
  const res = await apiClient.get('/ozel-siparis/sube', {
    params: { durumlar: durumlar.join(',') },
  })
  return (res.data?.data ?? []) as OzelSiparis[]
}

export async function kaydetOzelSiparisKarekodlar(siparisId: string, karekodlar: string[]) {
  const res = await apiClient.post(`/ozel-siparis/${siparisId}/karekodlar`, { karekodlar })
  return res.data
}

export async function musteriTeslimOzelSiparis(siparisId: string) {
  const res = await apiClient.post(`/ozel-siparis/${siparisId}/musteri-teslim`)
  return res.data as { success: boolean; waLink?: string | null; odooSonuc?: string | null }
}

export async function getOzelSiparisStokGirisDetay(siparisId: string) {
  const res = await adminApi.get(`/admin/ozel-siparis-stok-giris-detay/${siparisId}`)
  return res.data?.data as {
    siparis: OzelSiparis
    eslestirmeler: Array<OzelSiparisKarekod & {
      lotAdi?: string | null
      utsKodu?: string | null
      urunAdi?: string | null
      odooLotId?: number | null
    }>
  }
}

export async function stokaAlOzelSiparis(siparisId: string, bekleyenFaturaId?: string) {
  const res = await adminApi.post(`/admin/ozel-siparis-stoka-al/${siparisId}`, { bekleyenFaturaId })
  return res.data
}
