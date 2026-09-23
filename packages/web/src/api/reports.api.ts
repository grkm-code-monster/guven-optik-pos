import { apiClient } from './client'
import type { DailyReport } from './types'

export async function getDailyReport(date: string): Promise<DailyReport> {
  const res = await apiClient.get('/reports/daily', { params: { date } })
  return res.data
}

export async function getPersonalDailyReport(date: string): Promise<DailyReport> {
  const res = await apiClient.get('/reports/personal', { params: { date } })
  return res.data
}

export async function getRangeReport(start: string, end: string): Promise<DailyReport> {
  const res = await apiClient.get('/reports/range', { params: { start, end } })
  return res.data
}

export type PersonelAylikRow = {
  repName: string
  saleCount: number
  ciro: string
  aylikHedef?: number
}

export async function getMonthlyPersonelBreakdown(ay: number, yil: number): Promise<PersonelAylikRow[]> {
  const res = await apiClient.get('/reports/personel-aylik', { params: { ay, yil } })
  return res.data
}

export type KasaDuzeltmeInput = {
  tarih: string // YYYY-MM-DD
  nakit?: string
  kartBrut?: string
  kdv?: string
  komisyon?: string
  ciro?: string
  vakif?: string
  aciklama?: string
}

export type KasaDuzeltmeKaydi = {
  id: string
  branchId: string
  userId: string
  tarih: string
  nakit: string
  kartBrut: string
  kdv: string
  komisyon: string
  ciro: string
  vakif: string
  aciklama: string
  createdAt: string
}

// Kasa Bakiye Düzeltme (23.09.2026) — Masraflar sayfasındaki, sadece
// müdürlerin görebileceği bağımsız kasa açılış bakiyesi düzeltme ekranı.
export async function createKasaDuzeltme(input: KasaDuzeltmeInput): Promise<KasaDuzeltmeKaydi> {
  const res = await apiClient.post('/reports/kasa-duzeltme', input)
  return res.data?.data
}

export async function getKasaDuzeltmeListesi(): Promise<KasaDuzeltmeKaydi[]> {
  const res = await apiClient.get('/reports/kasa-duzeltme')
  return res.data?.data ?? []
}

export async function deleteKasaDuzeltme(id: string): Promise<void> {
  await apiClient.delete(`/reports/kasa-duzeltme/${id}`)
}

export async function downloadExcel(date: string): Promise<Blob> {
  const res = await apiClient.get('/reports/daily/excel', {
    params: { date },
    responseType: 'blob',
  })
  return res.data
}

export type GunlukDurumNotuResponse = {
  branchId: string
  tarih: string
  metin: string
  updatedAt: string | null
  sabitAlicilar: string[]
}

export async function getGunlukDurumNotu(branchId: string, tarih: string): Promise<GunlukDurumNotuResponse> {
  const res = await apiClient.get('/reports/gunluk-not', { params: { branchId, tarih } })
  return res.data
}

export async function saveGunlukDurumNotu(branchId: string, tarih: string, metin: string): Promise<GunlukDurumNotuResponse> {
  const res = await apiClient.put('/reports/gunluk-not', { branchId, tarih, metin })
  return res.data
}

export async function sendGunlukDurumNotuEmail(
  branchId: string,
  tarih: string,
  pdfBlob: Blob,
  pdfFilename: string,
  ekAliciEmail?: string[],
): Promise<{ success: boolean; gonderimZamani: string; alicilar: string[]; subject?: string; pdfFilename?: string }> {
  const formData = new FormData()
  formData.append('branchId', branchId)
  formData.append('tarih', tarih)
  formData.append('ekAliciEmail', JSON.stringify(ekAliciEmail ?? []))
  formData.append('pdf', pdfBlob, pdfFilename)
  const res = await apiClient.post('/reports/gunluk-not/gonder', formData)
  return res.data
}

