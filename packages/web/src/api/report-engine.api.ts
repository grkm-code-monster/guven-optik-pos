import type { AxiosInstance } from 'axios'
import { apiClient } from './client'
import { adminApi } from '../pages/admin/AdminLayout'

export type ReportField = { key: string; label: string }

export type ReportAccessRow = {
  id: string
  userId?: string | null
  role?: string | null
}

export type ReportScheduleRow = {
  id: string
  siklik: string
  saat: string
  gun?: number | null
  aktif: boolean
}

export type ReportTemplateRow = {
  id: string
  ad: string
  aciklama?: string | null
  boyutlar: unknown
  olculer: unknown
  filtreler?: unknown
  aktif: boolean
  createdAt: string
  erisimler: ReportAccessRow[]
  zamanlamalar: ReportScheduleRow[]
}

export type ReportRequestRow = {
  id: string
  talepEdenId: string
  istekMetni: string
  durum: string
  createdAt: string
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function templateDimensions(t: ReportTemplateRow): string[] {
  return parseStringArray(t.boyutlar)
}

export function templateMeasures(t: ReportTemplateRow): string[] {
  return parseStringArray(t.olculer)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function getAvailableFields(client: AxiosInstance) {
  const res = await client.get<{ dimensions: ReportField[]; measures: ReportField[] }>(
    '/reports/available-fields',
  )
  return res.data
}

async function queryReport(
  client: AxiosInstance,
  body: Record<string, unknown>,
): Promise<{ rows: Record<string, unknown>[] }> {
  const res = await client.post('/reports/query', body)
  return res.data
}

async function exportExcel(client: AxiosInstance, body: Record<string, unknown>): Promise<Blob> {
  const res = await client.post('/reports/export/excel', body, { responseType: 'blob' })
  return res.data
}

async function exportPdf(client: AxiosInstance, body: Record<string, unknown>): Promise<Blob> {
  const res = await client.post('/reports/export/pdf', body, { responseType: 'blob' })
  return res.data
}

async function listTemplates(client: AxiosInstance): Promise<ReportTemplateRow[]> {
  const res = await client.get<ReportTemplateRow[]>('/reports/templates')
  return res.data
}

async function createTemplate(client: AxiosInstance, body: Record<string, unknown>) {
  const res = await client.post<ReportTemplateRow>('/reports/templates', body)
  return res.data
}

async function createSchedule(client: AxiosInstance, body: Record<string, unknown>) {
  const res = await client.post('/reports/schedules', body)
  return res.data
}

async function listRequests(client: AxiosInstance): Promise<ReportRequestRow[]> {
  const res = await client.get<ReportRequestRow[]>('/reports/requests')
  return res.data
}

async function createRequest(client: AxiosInstance, istekMetni: string) {
  const res = await client.post('/reports/requests', { istekMetni })
  return res.data
}

async function sendTemplateEmail(client: AxiosInstance, templateId: string) {
  const res = await client.post(`/reports/templates/${templateId}/send-email`)
  return res.data
}

export const reportEngineAdminApi = {
  getAvailableFields: () => getAvailableFields(adminApi),
  queryReport: (body: Record<string, unknown>) => queryReport(adminApi, body),
  exportExcel: (body: Record<string, unknown>) => exportExcel(adminApi, body),
  exportPdf: (body: Record<string, unknown>) => exportPdf(adminApi, body),
  listTemplates: () => listTemplates(adminApi),
  createTemplate: (body: Record<string, unknown>) => createTemplate(adminApi, body),
  createSchedule: (body: Record<string, unknown>) => createSchedule(adminApi, body),
  listRequests: () => listRequests(adminApi),
}

export const reportEngineApi = {
  listTemplates: () => listTemplates(apiClient),
  queryReport: (body: Record<string, unknown>) => queryReport(apiClient, body),
  exportExcel: (body: Record<string, unknown>) => exportExcel(apiClient, body),
  exportPdf: (body: Record<string, unknown>) => exportPdf(apiClient, body),
  createRequest: (istekMetni: string) => createRequest(apiClient, istekMetni),
  sendTemplateEmail: (templateId: string) => sendTemplateEmail(apiClient, templateId),
}
