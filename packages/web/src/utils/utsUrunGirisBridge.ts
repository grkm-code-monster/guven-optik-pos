export type UtsUrunGirisBridge = {
  barkod: string
  seriNo?: string
  lotNo?: string
  adet: number
  utsBildirimId?: string
  belgeNo?: string
  tedarikciAd?: string
}

const KEY = 'optik-pos:uts-urun-giris-bridge-v1'

export function setUtsUrunGirisBridge(data: UtsUrunGirisBridge): void {
  sessionStorage.setItem(KEY, JSON.stringify(data))
}

export function peekUtsUrunGirisBridge(): UtsUrunGirisBridge | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as UtsUrunGirisBridge
  } catch {
    return null
  }
}

export function consumeUtsUrunGirisBridge(): UtsUrunGirisBridge | null {
  const data = peekUtsUrunGirisBridge()
  if (data) sessionStorage.removeItem(KEY)
  return data
}
