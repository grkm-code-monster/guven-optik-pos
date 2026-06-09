import { apiClient } from './client'

export interface WarrantyClaim {
  id: string
  claimNo: string
  status: string
  result: string
  type: string
  expectedOutcome: string
  productName?: string
  productCategory?: string
  odooCategoryId?: number
  lotNo?: string
  barcode?: string
  internalRef?: string
  supplierName?: string
  chainJson?: string
  problemDesc?: string
  supplierNote?: string
  branchId?: string
  createdAt: string
  customer?: { id: string; name: string; phone?: string }
  user?: { id: string; name?: string; username: string }
  messages?: WarrantyMessage[]
}

export interface WarrantyMessage {
  id: string
  message: string
  createdAt: string
  user?: { name?: string; username: string }
}

export const getWarrantyStats = () => apiClient.get('/warranty/stats').then(r => r.data)
export const getWarrantyClaims = (params?: any) => apiClient.get('/warranty', { params }).then(r => r.data)
export const getWarrantyClaim = (id: string) => apiClient.get(`/warranty/${id}`).then(r => r.data)
export const createWarrantyClaim = (data: any) => apiClient.post('/warranty', data).then(r => r.data)
export const updateWarrantyClaim = (id: string, data: any) => apiClient.patch(`/warranty/${id}`, data).then(r => r.data)
export const addWarrantyMessage = (id: string, message: string) => apiClient.post(`/warranty/${id}/messages`, { message }).then(r => r.data)
