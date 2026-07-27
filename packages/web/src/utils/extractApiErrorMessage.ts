type ApiErrorBody = {
  message?: string
  error?: string
  detail?: string
} | null | undefined

/** Axios/API yanıt gövdesinden kullanıcıya gösterilecek mesajı çıkarır */
export function apiErrorBodyMesaji(data: ApiErrorBody, fallback: string): string {
  const msg = data?.message ?? data?.error ?? data?.detail
  return typeof msg === 'string' && msg.trim() ? msg.trim() : fallback
}

/** catch bloğundaki hata nesnesinden API mesajını çıkarır */
export function extractApiErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: ApiErrorBody } }).response?.data
    if (data) return apiErrorBodyMesaji(data, fallback)
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  if (typeof err === 'string' && err.trim()) return err.trim()
  return fallback
}
