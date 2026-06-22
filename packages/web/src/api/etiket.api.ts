import axios from 'axios'
import { apiClient } from './client'

export type EtiketItem = {
  urunAdi: string
  seriNo: string
  fiyat: number | string
  barkod?: string | null
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
