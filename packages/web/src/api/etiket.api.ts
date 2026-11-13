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

export async function getEtiketSablonBySlug(slug: string, source: 'pos' | 'admin' = 'admin') {
  // 13.11.2026 — POS ekranlarında (transfer kabul, fiyat değişen) POS oturumuyla okunur
  const client = clientFor(source)
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

// ── 13.11.2026 — Etiket basım geçmişi ──
export type EtiketBasimKaynak =
  | 'ETIKET_MERKEZI'
  | 'STOK_YONETIMI'
  | 'DEPO'
  | 'TRANSFER'
  | 'EXCEL_ENVANTER'
  | 'POS_FIYAT'

export type EtiketBasimGirdi = {
  lotId?: number | null
  lotAdi?: string | null
  utsKodu?: string | null
  varyantId?: number | null
  urunAdi: string
  nitelik?: string | null
  fiyat?: number | string | null
  sablonSlug?: string | null
  lokasyon?: string | null
  adet?: number | null
}

/** Basılan etiketleri geçmişe yazar. Hata verirse baskıyı ENGELLEMEZ (sadece konsola yazar). */
export async function etiketBasimKaydet(
  kaynak: EtiketBasimKaynak,
  kayitlar: EtiketBasimGirdi[],
  source: 'pos' | 'admin' = 'admin',
): Promise<void> {
  if (!kayitlar.length) return
  try {
    await clientFor(source).post('/etiket/basim-kaydi', { kaynak, kayitlar })
  } catch (e) {
    console.warn('[etiket] basım kaydı yazılamadı', e)
  }
}
