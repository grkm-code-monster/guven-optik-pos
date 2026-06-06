import { adminApi } from '../pages/admin/AdminLayout'
import { apiClient } from './client'

export type CampaignType =
  | 'KASA'
  | 'NAKIT_ORAN'
  | 'IKI_AL_BIR_ODE'
  | 'URUN_BAZLI'
  | 'COMBO'
  | 'FORMUL'

export type CampaignScope = 'ALL' | 'CATEGORY' | 'PRODUCT' | 'CUSTOMER_SEGMENT'

export type CampaignBranchOverride = {
  id?: string
  branchId: string
  branchCode: string
  isActive?: boolean | null
  discountPct?: number | null
  discountTL?: number | null
  startDate?: string | null
  endDate?: string | null
  autoApply?: boolean | null
}

export type ComboConfig = {
  buyQty?: number
  payQty?: number
  label?: string
}

export type CampaignRecord = {
  id: string
  name: string
  description?: string | null
  type: CampaignType
  scope: CampaignScope
  scopeValue?: string | null
  discountPct?: number | null
  discountTL?: number | null
  minBasket?: number | null
  minQty?: number | null
  formulMultiplier?: number | null
  formulExtra?: number | null
  formulMargin?: number | null
  comboConfig?: ComboConfig | null
  startDate?: string | null
  endDate?: string | null
  priority: number
  autoApply: boolean
  manualAlso: boolean
  oodooPricelistId?: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  branchOverrides?: CampaignBranchOverride[]
}

/** POS ve admin tarafında kullanılan kampanya kaydı */
export type Campaign = CampaignRecord

export type CampaignInput = {
  name: string
  description?: string
  type: CampaignType
  scope?: CampaignScope
  scopeValue?: string
  discountPct?: number | null
  discountTL?: number | null
  minBasket?: number | null
  minQty?: number | null
  formulMultiplier?: number | null
  formulExtra?: number | null
  formulMargin?: number | null
  comboConfig?: ComboConfig | null
  startDate?: string | null
  endDate?: string | null
  priority?: number
  autoApply?: boolean
  manualAlso?: boolean
  oodooPricelistId?: number | null
  isActive?: boolean
  branchOverrides?: CampaignBranchOverride[]
}

function unwrapList(res: { data: unknown }): CampaignRecord[] {
  const body = res.data as { success?: boolean; data?: CampaignRecord[] } | CampaignRecord[]
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object' && Array.isArray((body as { data?: CampaignRecord[] }).data)) {
    return (body as { data: CampaignRecord[] }).data
  }
  return []
}

function unwrapOne(res: { data: unknown }): CampaignRecord {
  const body = res.data as { success?: boolean; data?: CampaignRecord } | CampaignRecord
  if (body && typeof body === 'object' && 'data' in body && (body as { data?: CampaignRecord }).data) {
    return (body as { data: CampaignRecord }).data
  }
  return body as CampaignRecord
}

export async function listCampaigns(): Promise<CampaignRecord[]> {
  const res = await adminApi.get('/admin/campaigns')
  return unwrapList(res)
}

export async function getCampaign(id: string): Promise<CampaignRecord> {
  const res = await adminApi.get(`/admin/campaigns/${id}`)
  return unwrapOne(res)
}

export async function createCampaign(input: CampaignInput): Promise<CampaignRecord> {
  const res = await adminApi.post('/admin/campaigns', input)
  return unwrapOne(res)
}

export async function updateCampaign(id: string, input: CampaignInput): Promise<CampaignRecord> {
  const res = await adminApi.put(`/admin/campaigns/${id}`, input)
  return unwrapOne(res)
}

export async function patchCampaign(id: string, patch: Partial<CampaignInput>): Promise<CampaignRecord> {
  const res = await adminApi.patch(`/admin/campaigns/${id}`, patch)
  return unwrapOne(res)
}

export async function deleteCampaign(id: string): Promise<void> {
  await adminApi.delete(`/admin/campaigns/${id}`)
}

export type CampaignApplicationLog = {
  campaignId: string
  saleId: string
  branchId: string
  branchCode: string
  userId: string
  discountTRY: number
}

/** Şubeye tanımlı, POS'ta seçilebilir aktif kampanyalar */
export async function fetchBranchCampaigns(branchId: string): Promise<Campaign[]> {
  const res = await apiClient.get(`/admin/campaigns/branch/${encodeURIComponent(branchId)}`)
  return unwrapList(res)
}

/** Satışta uygulanan kampanya indirimlerini kaydet */
export async function logCampaignApplications(entries: CampaignApplicationLog[]): Promise<void> {
  await apiClient.post('/campaigns/logs', { entries })
}
