import { apiClient } from './client'
import type { Sale, SaleItem } from './types'

export async function createSale(input: { customerId: string; shiftId: string }): Promise<Sale> {
  const res = await apiClient.post('/sales', input)
  return res.data
}

export async function addItem(
  saleId: string,
  input: {
    productId: string
    odooProductId?: string | null
    odooProductName?: string | null
    odooCategoryId?: number
    lotNo?: string | null
    qty?: number
    unitPrice: string
    discount?: string
    linkedItemId?: string
    linkType?: string
    prescription?: any
    frames?: any[]
  }
): Promise<SaleItem & { prescription_missing?: boolean }> {
  const res = await apiClient.post(`/sales/${saleId}/items`, input)
  return res.data
}

export async function updateItem(
  saleId: string,
  itemId: string,
  input: {
    productId: string
    odooProductId?: string | null
    odooProductName?: string | null
    odooCategoryId?: number
    lotNo?: string | null
    qty?: number
    unitPrice: string
    discount?: string
    linkedItemId?: string
    linkType?: string
    prescription?: any
    frames?: any[]
  }
): Promise<SaleItem & { prescription_missing?: boolean }> {
  const res = await apiClient.put(`/sales/${saleId}/items/${itemId}`, input)
  return res.data
}

export async function deleteItem(saleId: string, itemId: string): Promise<any> {
  const res = await apiClient.delete(`/sales/${saleId}/items/${itemId}`)
  return res.data
}

export async function confirmSale(
  saleId: string,
  input: { payments: any[]; thirdPartyAmount?: number; kasaIndirimTutar?: number; lensOrderMeasurements?: any[] },
): Promise<Sale> {
  const res = await apiClient.post(`/sales/${saleId}/confirm`, input)
  return res.data
}

export async function voidSale(saleId: string, input: { voidReason: string }): Promise<Sale> {
  const res = await apiClient.post(`/sales/${saleId}/void`, input)
  return res.data
}

export async function getSales(filters?: {
  status?: string
  customerId?: string
  dateFrom?: string
  dateTo?: string
}): Promise<Sale[]> {
  const res = await apiClient.get('/sales', { params: filters })
  return res.data
}

export async function getSaleById(saleId: string): Promise<Sale> {
  const res = await apiClient.get(`/sales/${saleId}`)
  return res.data
}

