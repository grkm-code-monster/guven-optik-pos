import { apiClient } from './client'
import type { User } from './types'

export async function login(username: string, pin: string): Promise<{ token: string; user: User; shiftId: string | null }> {
  const res = await apiClient.post('/auth/login', { username, pin })
  return res.data
}

