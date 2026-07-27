const STORAGE_KEY = 'optik-pos:urun-giris-drafts-v1'
const DEBOUNCE_MS = 800

export type UrunGirisDraftPayload = {
  adim: string
  girisTipi: 'FATURAYLA' | 'FATURA_SONRA' | 'IRSALIYELI' | 'FATURASIZ' | null
  girisNo: string
  cariAdi: string
  cariId: number | null
  faturaNo: string
  irsaliyeNo: string
  faturaReferans: string
  faturaTarihi: string
  fizikiTedarikciAdi: string
  fizikiTedarikciId: number | null
  secilenSirketId: number | null
  secilenSirketAdi: string
  faturaToplamKdvHaric: string
  satirlar: unknown[]
  lotlar: unknown[]
  utsBelgeNo: string
  gelenFaturaId: string | null
  topluUretici: string
  uyumsoftKaynak: boolean
  uyumsoftHamSatirlar: unknown[]
  uyumsoftKolonMap: Record<string, string>
  uyumsoftTedarikciVkn: string | null
}

export type UrunGirisDraftMeta = {
  id: string
  girisNo: string
  updatedAt: string
  adim: string
  girisTipi: string | null
  cariAdi: string
  faturaNo: string
  satirSayisi: number
  lotSayisi: number
}

type StoredDraft = UrunGirisDraftMeta & { payload: UrunGirisDraftPayload }

function readStore(): Record<string, StoredDraft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, StoredDraft>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, StoredDraft>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function listUrunGirisDraftMeta(): UrunGirisDraftMeta[] {
  return Object.values(readStore())
    .map(({ payload: _p, ...meta }) => meta)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function getUrunGirisDraft(id: string): StoredDraft | null {
  return readStore()[id] ?? null
}

export function saveUrunGirisDraft(payload: UrunGirisDraftPayload): UrunGirisDraftMeta {
  const id = payload.girisNo
  const meta: UrunGirisDraftMeta = {
    id,
    girisNo: payload.girisNo,
    updatedAt: new Date().toISOString(),
    adim: payload.adim,
    girisTipi: payload.girisTipi,
    cariAdi: payload.cariAdi,
    faturaNo: payload.faturaNo,
    satirSayisi: payload.satirlar.length,
    lotSayisi: payload.lotlar.length,
  }
  const store = readStore()
  store[id] = { ...meta, payload }
  writeStore(store)
  saveListeners.forEach((fn) => fn())
  return meta
}

export function deleteUrunGirisDraft(id: string) {
  const store = readStore()
  delete store[id]
  writeStore(store)
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function saveUrunGirisDraftDebounced(payload: UrunGirisDraftPayload): void {
  const id = payload.girisNo
  const prev = debounceTimers.get(id)
  if (prev) clearTimeout(prev)
  debounceTimers.set(
    id,
    setTimeout(() => {
      debounceTimers.delete(id)
      saveUrunGirisDraft(payload)
    }, DEBOUNCE_MS),
  )
}

export function flushUrunGirisDraft(payload: UrunGirisDraftPayload): void {
  const prev = debounceTimers.get(payload.girisNo)
  if (prev) clearTimeout(prev)
  debounceTimers.delete(payload.girisNo)
  saveUrunGirisDraft(payload)
}

const saveListeners = new Set<() => void>()

export function onUrunGirisDraftSaved(listener: () => void): () => void {
  saveListeners.add(listener)
  return () => saveListeners.delete(listener)
}

export function adimEtiketi(adim: string): string {
  const map: Record<string, string> = {
    'giris-tipi': '1. Giriş Tipi',
    fatura: '2. Fatura',
    satirlar: '3. Ürün Satırları',
    lotlar: '4. Lot/Barkod',
    onay: '5. Onay',
    'siparis-urun-girisi': 'Sipariş Ürün Girişi',
    'bekleyen-faturalar': 'Bekleyen Faturalar',
  }
  return map[adim] ?? adim
}
