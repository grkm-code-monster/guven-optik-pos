import { adminApi } from '../pages/admin/AdminLayout'

export type EtiketTur = 'CERCEVE' | 'GUNES'
export type EtiketGrup = 'ALT' | 'ORTA' | 'ORTA ÜST' | 'ÜST' | ''
export type EtiketKaynak = 'ENVANTER' | 'TRANSFER' | 'ALIM' | 'IADE' | 'DIGER'

export type EtiketSatir = {
  key: string
  quantId: number
  lotId: number | null
  lotAdi: string | null
  utsKodu: string | null
  varyantId: number
  tmplId: number | null
  sablonAdi: string
  urunAdi: string
  marka: string
  model: string
  renk: string
  olcu: string
  tur: EtiketTur
  grup: EtiketGrup
  kategori: string
  barkod: string | null
  fiyat: number
  lokasyon: string
  adet: number
  girisTarihi: string | null
  parti: string | null
  kaynak?: EtiketKaynak
  sonBasim: { basildi: string; fiyat: number | null; kaynak: string } | null
}

export type EtiketMerkeziFiltre = {
  lokasyonlar: string[]
  tur: EtiketTur | ''
  girisBas: string
  girisBit: string
  q: string
  marka: string
  model: string
  renk: string
  olcu: string
  gruplar: EtiketGrup[]
  fiyatMin: string
  fiyatMax: string
  uts: 'var' | 'yok' | ''
  barkod: 'var' | 'yok' | ''
  parti: string
  kaynak: EtiketKaynak | ''
  etiket: 'hic' | 'fiyat' | 'once' | 'aralik' | ''
  etiketBas: string
  etiketBit: string
}

export type Kombinasyon = { marka: string; model: string; renk: string; olcu: string; adet: number }

export type EtiketAraSonuc = {
  satirlar: EtiketSatir[]
  toplam: number
  kesildi: boolean
  kombinasyonlar: Kombinasyon[]
  partiler: { parti: string; etiket: string; adet: number }[]
  tabanAdet: number
  uygulananParti: string | null
}

export type OkutSonuc =
  | { ok: true; satir: EtiketSatir; tur: 'UTS' | 'BARKOD' | 'LOT' }
  | { ok: false; mesaj: string; digerKonumlar?: { lokasyon: string; adet: number }[] }

export async function getEtiketMerkeziLokasyonlar(): Promise<{ kod: string; adet: number }[]> {
  const res = await adminApi.get('/admin/etiket-merkezi/lokasyonlar')
  return res.data?.data ?? []
}

export async function etiketMerkeziAra(f: EtiketMerkeziFiltre): Promise<EtiketAraSonuc> {
  const sayi = (s: string) => {
    const n = Number(String(s).replace(/\./g, '').replace(',', '.'))
    return s.trim() && Number.isFinite(n) ? n : null
  }
  const res = await adminApi.post('/admin/etiket-merkezi/ara', {
    ...f,
    fiyatMin: sayi(f.fiyatMin),
    fiyatMax: sayi(f.fiyatMax),
  })
  return res.data as EtiketAraSonuc
}

export async function etiketMerkeziOkut(
  kod: string,
  lokasyon: string,
  haricLotIds: number[],
  haricQuantIds: number[],
): Promise<OkutSonuc> {
  const res = await adminApi.post('/admin/etiket-merkezi/okut', { kod, lokasyon, haricLotIds, haricQuantIds })
  return res.data as OkutSonuc
}

export async function getEtiketBasimGecmisi(lotIds: number[], varyantIds: number[] = []) {
  const res = await adminApi.post('/etiket/basim-gecmisi', { lotIds, varyantIds })
  return res.data as {
    lot: Record<string, { basildi: string; fiyat: number | null; kaynak: string }>
    varyant: Record<string, { basildi: string; fiyat: number | null; kaynak: string }>
  }
}
