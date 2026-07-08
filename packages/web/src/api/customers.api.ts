import { apiClient } from './client'
import type { Customer, Sale } from './types'

export async function searchCustomers(q: string): Promise<Array<Customer & { lastSaleAt?: string | null }>> {
  const res = await apiClient.get('/customers', { params: { q } })
  return res.data
}

export async function createCustomer(input: any): Promise<Customer> {
  const res = await apiClient.post('/customers', input)
  return res.data
}

export async function resolveOdooCustomer(data: {
  odooPartnerId: number
  name: string
  phone: string
  email?: string | null
}): Promise<Customer> {
  const res = await apiClient.post('/customers/resolve-odoo', data)
  return res.data
}

export async function updateCustomer(id: string, input: any): Promise<Customer> {
  const res = await apiClient.put(`/customers/${id}`, input)
  return res.data
}

export async function getCustomerById(id: string): Promise<Customer & { sales: Pick<Sale, 'id' | 'createdAt' | 'netTotal' | 'status'>[] }> {
  const res = await apiClient.get(`/customers/${id}`)
  return res.data
}

export async function addPrescription(customerId: string, data: any): Promise<any> {
  const res = await apiClient.post(`/customers/${customerId}/prescriptions`, data)
  return res.data
}

export async function getCustomerPrescriptions(customerId: string): Promise<any[]> {
  const res = await apiClient.get(`/customers/${customerId}/prescriptions`)
  return res.data
}

export async function getLatestPrescription(customerId: string): Promise<any | null> {
  const res = await apiClient.get(`/customers/${customerId}/prescriptions/latest`)
  return res.data
}

export async function getReceteGecmisi(customerId: string): Promise<any[]> {
  const res = await apiClient.get(`/customers/${customerId}/receteler`)
  return res.data
}

export type LegacyCustomerSearchHit = {
  id: string
  ad?: string | null
  soyad?: string | null
  name: string
  telefon?: string | null
  kaynakSube?: string | null
  siberCariHesapId: number
  saleCount: number
  lastSaleAt?: string | null
  prescriptionCount: number
  lastPrescriptionAt?: string | null
  _kaynak: 'legacy'
}

export type LegacyCustomerDetail = {
  id: string
  name: string
  telefon?: string | null
  ad?: string | null
  soyad?: string | null
  tcKimlikNo?: string | null
  adres?: string | null
  kaynakSube?: string | null
  sales: Array<{
    id: string
    tarih?: string | null
    toplamTutar?: string | number | null
    subeKodu?: string | null
    items: Array<{ id: string; urunAdi?: string | null; miktar?: string | number | null; fiyat?: string | number | null }>
  }>
  prescriptions: Array<{
    id: string
    tarih?: string | null
    r_sph?: string | number | null
    r_cyl?: string | number | null
    l_sph?: string | number | null
    l_cyl?: string | number | null
  }>
}

export async function searchLegacyCustomers(q: string): Promise<LegacyCustomerSearchHit[]> {
  const res = await apiClient.get('/customers/legacy-search', { params: { q } })
  return res.data
}

export async function getLegacyCustomerDetail(id: string): Promise<LegacyCustomerDetail> {
  const res = await apiClient.get(`/customers/legacy/${id}`)
  return res.data
}

export async function promoteLegacyCustomer(
  id: string,
  body?: { force?: boolean; mevcutMusteriId?: string },
): Promise<{ possibleDuplicate: boolean; customer?: Customer; mevcutMusteri?: { id: string; name: string; phone: string; identityNo?: string | null } }> {
  const res = await apiClient.post(`/customers/legacy/${id}/promote`, body ?? {})
  return res.data
}

