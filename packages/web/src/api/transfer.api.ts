import { apiClient } from './client'

export type TransferUrun = {
  id: number | string
  ad: string
  varyant?: string
  fiyat?: number | null
  lotNo?: string | null
  utsKodu?: string | null
  utsDurumu?: string
  stok?: number | null
  kaynakFatura?: string | null
}

export async function searchTransferProducts(params: {
  q: string
  yontem: string
  lokasyon: string
  kategoriId?: number
  kategoriIds?: number[]
}): Promise<TransferUrun[]> {
  const queryParams: Record<string, string | number> = {
    q: params.q,
    yontem: params.yontem,
    lokasyon: params.lokasyon,
  }
  if (params.kategoriId != null) queryParams.kategoriId = params.kategoriId
  if (params.kategoriIds?.length) queryParams.kategoriIds = params.kategoriIds.join(',')
  const res = await apiClient.get('/transfer/urun-ara', { params: queryParams })
  return res.data
}

export async function createTransfer(payload: {
  cikisLokasyon: string
  girisLokasyon: string
  tarih: string
  referans: string
  not: string
  urunler: any[]
  personel: string
}) {
  const res = await apiClient.post('/transfer/olustur', payload)
  return res.data
}

export async function getBekleyenTransferler(lokasyon: string) {
  const res = await apiClient.get('/transfer/bekleyen', { params: { lokasyon } })
  return res.data
}

export async function kabulTransfer(payload: { transferId: string; sayimlar: any[] }) {
  const res = await apiClient.post('/transfer/kabul', payload)
  return res.data
}

export async function sorunTransfer(payload: { transferId: string; not: string }) {
  const res = await apiClient.post('/transfer/sorun', payload)
  return res.data
}
