import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../api/types'

interface AuthState {
  token: string | null
  user: Pick<User, 'id' | 'name' | 'role' | 'branchId'> | null
  shiftId: string | null
  setAuth: (token: string, user: AuthState['user'], shiftId: string | null) => void
  setShiftId: (id: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      shiftId: null,
      setAuth: (token, user, shiftId) => set({ token, user, shiftId }),
      setShiftId: (id) => set({ shiftId: id }),
      logout: () => set({ token: null, user: null, shiftId: null }),
    }),
    { name: 'optik-auth' }
  )
)

