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
    pairWithItemId?: string
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
  input: {
    payments: any[]
    thirdPartyAmount?: number
    sgkAmount?: number
    vakifAmount?: number
    kasaIndirimTutar?: number
    pricingInvoiceNote?: string
    lensOrderMeasurements?: any[]
    faturaKesilsin?: boolean
  },
): Promise<Sale> {
  const res = await apiClient.post(`/sales/${saleId}/confirm`, input)
  return res.data
}

export async function voidSale(saleId: string, input: { voidReason: string }): Promise<Sale> {
  const res = await apiClient.post(`/sales/${saleId}/void`, input)
  return res.data
}

export type PersonelFiyatSonuc = { maliyet: number; kdvOrani: number; fiyat: number }

export async function hesaplaPersonelFiyati(odooProductId: string): Promise<PersonelFiyatSonuc> {
  const res = await apiClient.post('/sales/personel-fiyat-hesapla', { odooProductId })
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

export type AtolyeKuyrukItem = {
  id: string
  saleId: string
  status: string
  sentToLabAt?: string | null
  odooProductName?: string | null
  product?: { name: string; category: string } | null
  sale: {
    id: string
    createdAt: string
    customer?: { name: string; phone: string } | null
  }
}

export async function getAtolyeKuyruk(params: {
  branchId: string
  durum: 'IN_LAB' | 'READY'
}): Promise<AtolyeKuyrukItem[]> {
  const res = await apiClient.get('/sales/atolye-kuyruk', { params })
  return res.data.data ?? res.data
}

export async function updateSaleItemStatus(
  saleId: string,
  itemId: string,
  status: string,
): Promise<SaleItem> {
  const res = await apiClient.patch(`/sales/${saleId}/items/${itemId}/status`, { status })
  return res.data
}

export type LabIncidentType = 'LENS_BROKEN' | 'FRAME_BROKEN' | 'MEASUREMENT_SHIFT'

export type LabStokLokasyon = {
  kod: string
  lokasyonId: number
  miktar: number
  kullanilabilir: number
}

export type ReportLabIncidentResult = {
  success: boolean
  incidentId?: string
  resolutionType?: 'NONE' | 'TRANSFER' | 'OZEL_SIPARIS'
  stokBulundu?: boolean
  lokasyonlar?: LabStokLokasyon[]
  ozelSiparisAcildi?: boolean
  zatenVar?: boolean
  ozelSiparisId?: string
  message?: string
  urunAdi?: string
}

export async function reportLabIncident(body: {
  saleItemId: string
  incidentType: LabIncidentType
  note?: string
}): Promise<ReportLabIncidentResult> {
  const res = await apiClient.post('/sales/lab-incident', body)
  return res.data
}

export async function confirmLabIncidentTransfer(
  incidentId: string,
  kaynakLokasyonId: number,
): Promise<{ success: boolean; message?: string }> {
  const res = await apiClient.post(`/sales/lab-incident/${incidentId}/confirm-transfer`, {
    kaynakLokasyonId,
  })
  return res.data
}

export async function saveDraftMeta(
  saleId: string,
  input: {
    step?: 1 | 2 | 3 | 4 | 5 | 5.5 | 6
    pricing?: unknown
    payments?: unknown
    measurements?: unknown
  },
): Promise<Sale> {
  const res = await apiClient.patch(`/sales/${saleId}/draft-meta`, input)
  return res.data
}

