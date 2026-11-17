import { adminApi } from '../pages/admin/AdminLayout'

export type FiltreAnahtar =
  | 'tarih'
  | 'sube'
  | 'lokasyon'
  | 'kategori'
  | 'marka'
  | 'ara'
  | 'personel'
  | 'musteri'
  | 'odemeTipi'
  | 'durum'
  | 'camGrubu'
  | 'enAz'
  | 'karsilastir'

export type RaporGrup = 'SATIS' | 'STOK' | 'KAREKOD' | 'KASA' | 'CARI' | 'LISTE'

export type RaporTanimi = {
  id: string
  grup: RaporGrup
  ad: string
  aciklama: string
  siber: string
  filtreler: FiltreAnahtar[]
  zorunlu?: FiltreAnahtar[]
  gruplamalar?: { key: string; label: string }[]
  varsayilanGruplama?: string
  durumlar?: { key: string; label: string }[]
  varsayilanTarih?: 'bugun' | 'buAy' | 'son30' | 'yok'
}

export type Katalog = { gruplar: Record<RaporGrup, string>; raporlar: RaporTanimi[] }

export type Secenekler = {
  subeler: { id: string; kod: string; ad: string }[]
  lokasyonlar: string[]
  personeller: { id: string; ad: string; sube: string }[]
  odemeTipleri: { key: string; label: string }[]
  kategoriler: { key: string; label: string }[]
  camGruplari: string[]
}

export type KolonTip = 'metin' | 'sayi' | 'para' | 'yuzde' | 'tarih' | 'tarihSaat'
export type Kolon = { key: string; label: string; tip: KolonTip; toplam?: boolean; maliyet?: boolean }
export type Satir = Record<string, string | number | null>
export type RaporSonucu = {
  rapor: { id: string; ad: string }
  kolonlar: Kolon[]
  satirlar: Satir[]
  ozet?: { ad: string; deger: number | string; tip: KolonTip; maliyet?: boolean; alt?: string }[]
  notlar?: string[]
  kesildi?: boolean
}

export type RaporFiltre = {
  bas?: string
  bit?: string
  subeIds?: string[]
  lokasyonlar?: string[]
  kategori?: string
  marka?: string
  ara?: string
  personelId?: string
  musteriId?: string
  odemeTipi?: string
  durum?: string
  camGrubu?: string
  enAz?: number
  gruplama?: string
  karsilastir?: boolean
}

export async function katalogGetir(): Promise<Katalog> {
  return (await adminApi.get('/admin/hazir-raporlar/katalog')).data
}

export async function secenekleriGetir(): Promise<Secenekler> {
  return (await adminApi.get('/admin/hazir-raporlar/secenekler')).data
}

export async function musteriAra(q: string): Promise<{ id: string; name: string; phone: string }[]> {
  return (await adminApi.get('/admin/hazir-raporlar/musteri-ara', { params: { q } })).data.data
}

export async function raporCalistir(id: string, f: RaporFiltre): Promise<RaporSonucu> {
  return (await adminApi.post(`/admin/hazir-raporlar/${id}/calistir`, f, { timeout: 180000 })).data
}

export async function raporExcel(id: string, ad: string, f: RaporFiltre): Promise<void> {
  const res = await adminApi.post(`/admin/hazir-raporlar/${id}/excel`, f, { responseType: 'blob', timeout: 180000 })
  const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${ad} ${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/** Axios hata gövdesindeki mesajı (blob dahil) okur */
export async function hataMesaji(e: unknown): Promise<string> {
  const err = e as { response?: { data?: unknown }; message?: string }
  const d = err.response?.data
  if (d instanceof Blob) {
    try {
      const j = JSON.parse(await d.text()) as { error?: string }
      if (j.error) return j.error
    } catch {
      /* metin değil */
    }
  } else if (d && typeof d === 'object' && 'error' in d) {
    return String((d as { error: unknown }).error)
  }
  return err.message ?? 'Rapor hazırlanamadı.'
}
