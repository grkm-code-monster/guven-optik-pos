type TransferErrorPayload = {
  error?: string
  message?: string
} | null | undefined

const SIRKETLER_ARASI_FALLBACK =
  'Şirketler arası transfer şu an manuel yapılmalıdır. Odoo Enterprise gerektirir.'

export function transferHataMesaji(data: TransferErrorPayload, fallback: string): string {
  if (data?.error === 'SIRKETLER_ARASI') {
    return data.message ?? SIRKETLER_ARASI_FALLBACK
  }
  return data?.message ?? fallback
}

export function transferHataMiSirketlerArasi(data: TransferErrorPayload): boolean {
  return data?.error === 'SIRKETLER_ARASI'
}
