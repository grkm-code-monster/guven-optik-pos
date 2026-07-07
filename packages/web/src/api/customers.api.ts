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

