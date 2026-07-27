import axios from 'axios'
import { apiClient } from './client'

export type EtiketItem = {
  urunAdi: string
  seriNo: string
  fiyat: number | string
  barkod?: string | null
}

export type EtiketDil = 'zpl' | 'ppla'

export type EtiketSablonKayit = {
  id: string
  ad: string
  slug?: string | null
  kategori: string
  elemanlar: unknown
  etiketGenislik: number
  etiketYukseklik: number
  aktif: boolean
}

function clientFor(source: 'pos' | 'admin') {
  if (source === 'admin') {
    const token = localStorage.getItem('admin-token')
    return axios.create({
      baseURL: '/api',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  }
  return apiClient
}

export async function generateZpl(
  etiketler: EtiketItem[],
  source: 'pos' | 'admin' = 'pos',
): Promise<{ zpl: string; count: number }> {
  const client = clientFor(source)
  const res = await client.post('/etiket/zpl', { etiketler })
  return res.data
}

export async function generateZplFromSablon(
  payload: {
    elemanlar?: unknown[]
    etiketGenislik?: number
    etiketYukseklik?: number
    veri?: Record<string, unknown>
    etiketler?: Record<string, unknown>[]
    sablonId?: string
    dil?: EtiketDil
  },
  source: 'pos' | 'admin' = 'admin',
): Promise<{ zpl: string; count: number }> {
  const client = clientFor(source)
  const { dil = 'ppla', ...rest } = payload
  const res = await client.post('/etiket/zpl', { dil, ...rest })
  return res.data
}

export async function getEtiketSablonlari(kategori?: string) {
  const client = clientFor('admin')
  const res = await client.get('/etiket/sablonlar', { params: kategori ? { kategori } : undefined })
  return (res.data?.data ?? []) as EtiketSablonKayit[]
}

export async function getEtiketSablonBySlug(slug: string) {
  const client = clientFor('admin')
  const res = await client.get(`/etiket/sablon/slug/${encodeURIComponent(slug)}`)
  return res.data?.data as EtiketSablonKayit
}

export async function kaydetEtiketSablon(payload: {
  ad: string
  kategori: string
  elemanlar: unknown[]
  etiketGenislik: number
  etiketYukseklik: number
}) {
  const client = clientFor('admin')
  const res = await client.post('/etiket/sablon', payload)
  return res.data?.data as EtiketSablonKayit
}

export async function guncelleEtiketSablon(id: string, payload: Partial<{
  ad: string
  kategori: string
  elemanlar: unknown[]
  etiketGenislik: number
  etiketYukseklik: number
}>) {
  const client = clientFor('admin')
  const res = await client.put(`/etiket/sablon/${id}`, payload)
  return res.data?.data as EtiketSablonKayit
}

export async function silEtiketSablon(id: string) {
  const client = clientFor('admin')
  const res = await client.delete(`/etiket/sablon/${id}`)
  return res.data
}
