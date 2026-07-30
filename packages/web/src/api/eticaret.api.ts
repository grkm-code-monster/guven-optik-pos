import { apiClient } from './client'

export type EticaretSiparisKalem = {
  id: string
  odooProductName?: string | null
  qty: number
  unitPrice: string
  product?: { name?: string | null } | null
}

export type EticaretSiparis = {
  id: string
  partnerSiparisNo: string
  musteriAdSoyad: string
  musteriTelefon?: string | null
  musteriAdres?: string | null
  musteriIl?: string | null
  musteriIlce?: string | null
  odemeSekli?: string | null
  kalemler: Array<{ barkod: string; adet: number }>
  durum: string
  secilenSubeId?: string | null
  secilenSube?: { id: string; name: string; code: string } | null
  saleId?: string | null
  kargoTakipNo?: string | null
  kargoyaVerildiTarihi?: string | null
  hataNotu?: string | null
  createdAt: string
  sale?: {
    id: string
    referansNo?: string | null
    netTotal: string
    eFaturaDurum?: string | null
    odooSyncError?: string | null
    items: EticaretSiparisKalem[]
  } | null
}

export async function getEticaretSiparisler(params?: { durum?: string; subeId?: string }) {
  const res = await apiClient.get('/eticaret/siparisler', { params })
  return (res.data?.data ?? []) as EticaretSiparis[]
}

export async function getEticaretSiparis(id: string) {
  const res = await apiClient.get(`/eticaret/siparisler/${id}`)
  return res.data?.data as EticaretSiparis
}

export async function eticaretSiparisiKargoyaVer(id: string, kargoTakipNo?: string) {
  const res = await apiClient.patch(`/eticaret/siparisler/${id}/kargoya-ver`, { kargoTakipNo })
  return res.data as { success: boolean; data: EticaretSiparis }
}
