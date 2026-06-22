import { apiClient } from './client'
import type { User } from './types'

export type PdksAttendanceStatus = 'found' | 'missing' | 'skipped'

export async function login(
  username: string,
  pin: string,
): Promise<{ token: string; user: User; shiftId: string | null; pdksAttendance: PdksAttendanceStatus }> {
  const res = await apiClient.post('/auth/login', { username, pin })
  return res.data
}

export async function pdksContinue(): Promise<{ shiftId: string }> {
  const res = await apiClient.post('/auth/pdks-continue')
  return res.data
}

