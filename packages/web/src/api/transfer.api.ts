import axios from 'axios'
import { apiClient } from './client'

export type TransferUrun = {
  id: number | string
  ad: string
  varyant?: string
  fiyat?: number | null
  lotId?: number | null
  lotNo?: string | null
  tracking?: string
  utsKodu?: string | null
  utsDurumu?: string
  stok?: number | null
  kaynakFatura?: string | null
  /** 18.11.2026 — çerçeve aramasında ayrı alanlar */
  model?: string | null
  renk?: string | null
  olcu?: string | null
  puan?: number
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
    katalog?: boolean
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
  if (params.katalog) queryParams.katalog = '1'
  const res = await transferClient(source).get('/transfer/urun-ara', { params: queryParams })
  return res.data
}

/** 18.11.2026 — Optik Gözlük / Güneş Gözlüğü: ürün adı + model + renk + ölçü ile arama */
export async function searchCerceveUrun(params: {
  ad: string
  model: string
  renk: string
  olcu: string
  lokasyon: string
  sadeceStok: boolean
  kategoriId?: number
  kategoriIds?: number[]
}): Promise<TransferUrun[]> {
  const queryParams: Record<string, string | number> = {
    ad: params.ad,
    model: params.model,
    renk: params.renk,
    olcu: params.olcu,
    lokasyon: params.lokasyon,
    sadeceStok: params.sadeceStok ? '1' : '0',
  }
  if (params.kategoriId != null) queryParams.kategoriId = params.kategoriId
  if (params.kategoriIds?.length) queryParams.kategoriIds = params.kategoriIds.join(',')
  const res = await apiClient.get('/transfer/urun-ara-cerceve', { params: queryParams })
  return res.data
}

export async function searchTransferProductLots(
  productId: number,
  lokasyon: string,
  source: 'pos' | 'admin' = 'pos',
): Promise<TransferUrun[]> {
  const res = await transferClient(source).get('/transfer/urun-lotlari', {
    params: { productId, lokasyon },
  })
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

export type TransferAksiyonOzet = Record<string, { durum: string; mesaj?: string | null }>

export async function getTransferAksiyonLogs(
  transferRefs: string[],
  source: 'pos' | 'admin' = 'pos',
): Promise<{ logs: unknown[]; ozet: Record<string, TransferAksiyonOzet> }> {
  const refs = [...new Set(transferRefs.filter(Boolean))]
  if (!refs.length) return { logs: [], ozet: {} }
  const res = await transferClient(source).get('/transfer/aksiyon-log', {
    params: { transferRefs: refs.join(',') },
  })
  return res.data
}
