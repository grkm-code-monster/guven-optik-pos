import { apiClient } from './client'

export async function openShift(input: { openCash: string; note?: string }): Promise<{ id: string }> {
  const res = await apiClient.post('/shifts/open', input)
  return res.data
}

export async function closeShift(input: { physicalCash: string; diffReason?: string }): Promise<{ id: string }> {
  const res = await apiClient.post('/shifts/close', input)
  return res.data
}

export async function getCurrentShift(): Promise<any> {
  const res = await apiClient.get('/shifts/current')
  return res.data
}

