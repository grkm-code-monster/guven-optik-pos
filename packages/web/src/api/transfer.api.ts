import axios from 'axios'
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

function transferClient(source: 'pos' | 'admin' = 'pos') {
  if (source === 'admin') {
    const token = localStorage.getItem('admin-token')
    return axios.create({
      baseURL: '/api',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }
  return apiClient
}

export async function searchTransferProducts(
  params: {
    q: string
    yontem: string
    lokasyon: string
    kategoriId?: number
    kategoriIds?: number[]
  },
  source: 'pos' | 'admin' = 'pos',
): Promise<TransferUrun[]> {
  const queryParams: Record<string, string | number> = {
    q: params.q,
    yontem: params.yontem,
    lokasyon: params.lokasyon,
  }
  if (params.kategoriId != null) queryParams.kategoriId = params.kategoriId
  if (params.kategoriIds?.length) queryParams.kategoriIds = params.kategoriIds.join(',')
  const res = await transferClient(source).get('/transfer/urun-ara', { params: queryParams })
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
}, source: 'pos' | 'admin' = 'pos') {
  const res = await transferClient(source).post('/transfer/olustur', payload)
  return res.data
}

export async function getBekleyenTransferler(lokasyon: string, source: 'pos' | 'admin' = 'pos') {
  const res = await transferClient(source).get('/transfer/bekleyen', { params: { lokasyon } })
  return res.data
}

export async function getGonderilenTransferler(lokasyon: string, source: 'pos' | 'admin' = 'pos') {
  const res = await transferClient(source).get('/transfer/gonderilen', { params: { lokasyon } })
  return res.data
}

export async function kabulTransfer(payload: { transferId: string; sayimlar: any[] }, source: 'pos' | 'admin' = 'pos') {
  const res = await transferClient(source).post('/transfer/kabul', payload)
  return res.data
}

export async function sorunTransfer(payload: { transferId: string; not: string }, source: 'pos' | 'admin' = 'pos') {
  const res = await transferClient(source).post('/transfer/sorun', payload)
  return res.data
}
