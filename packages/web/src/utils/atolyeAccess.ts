type AtolyeUser = {
  role: string
  canWorkAtolye?: boolean
}

const ATOLYE_ROLES = new Set(['WORKSHOP_STAFF', 'STORE_MANAGER', 'ADMIN', 'WAREHOUSE_MANAGER'])

export function canAccessAtolye(user: AtolyeUser | null | undefined): boolean {
  if (!user) return false
  if (user.canWorkAtolye) return true
  return ATOLYE_ROLES.has(user.role)
}
