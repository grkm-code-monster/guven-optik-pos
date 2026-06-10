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

export async function downloadExcel(date: string): Promise<Blob> {
  const res = await apiClient.get('/reports/daily/excel', {
    params: { date },
    responseType: 'blob',
  })
  return res.data
}

