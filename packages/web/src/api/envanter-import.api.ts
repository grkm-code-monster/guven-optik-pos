import { adminApi } from '../pages/admin/AdminLayout'

export type EnvanterSatirDurum =
  | 'YENI_SABLON'
  | 'YENI_VARYANT'
  | 'MEVCUT_VARYANT'
  | 'HATA'

export type ParsedEnvanterRow = {
  satirNo: number
  kategori: string
  urunAdi: string
  model: string
  renk: string
  olcu: string
  barkod: string
  utsKodu: string
  adet: number
  satisFiyati: number
  maliyetFiyati: number
  kdvOrani: number
  odooVaryantId?: number
  lotNo?: string
  odooLotId?: number
}

export type EnvanterSatirOnizleme = ParsedEnvanterRow & {
  durum: EnvanterSatirDurum
  mesaj: string
}

export type EnvanterOnizlemeSonuc = {
  success: boolean
  ozet: {
    toplamSatir: number
    sablonGrupSayisi: number
    yeniSablon: number
    yeniVaryant: number
    mevcutVaryant: number
    hata: number
  }
  satirlar: EnvanterSatirOnizleme[]
}

export type EnvanterUygulaSatirSonuc = {
  satirNo: number
  durum: 'BASARILI' | 'BASARISIZ'
  mesaj: string
  olusturulanLotId?: number
  olusturulanVaryantId?: number
  kategoriAdaylari?: Array<{ id: number; completeName: string }>
}

export type EnvanterUygulaSonuc = {
  success: boolean
  ozet: { basarili: number; basarisiz: number }
  satirlar: EnvanterUygulaSatirSonuc[]
}

export async function indirEnvanterSablon(): Promise<void> {
  const res = await adminApi.get('/admin/envanter-import/sablon-indir', {
    responseType: 'blob',
  })
  const blob = new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'envanter-import-sablon.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

export async function onizleEnvanterExcel(file: File): Promise<EnvanterOnizlemeSonuc> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await adminApi.post<EnvanterOnizlemeSonuc>(
    '/admin/envanter-import/onizle',
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return res.data
}

export async function uygulaEnvanterImport(input: {
  lokasyonKodu: string
  satirlar: ParsedEnvanterRow[]
  aktarimKimligi?: string
}): Promise<EnvanterUygulaSonuc> {
  const res = await adminApi.post<EnvanterUygulaSonuc>(
    '/admin/envanter-import/uygula',
    input,
  )
  return res.data
}

export function satirOnizlemedenParsed(s: EnvanterSatirOnizleme): ParsedEnvanterRow {
  return {
    satirNo: s.satirNo,
    kategori: s.kategori,
    urunAdi: s.urunAdi,
    model: s.model,
    renk: s.renk,
    olcu: s.olcu,
    barkod: s.barkod,
    utsKodu: s.utsKodu,
    adet: s.adet,
    satisFiyati: s.satisFiyati,
    maliyetFiyati: s.maliyetFiyati,
    kdvOrani: s.kdvOrani,
    ...(s.odooVaryantId ? { odooVaryantId: s.odooVaryantId } : {}),
    ...(s.lotNo ? { lotNo: s.lotNo } : {}),
    ...(s.odooLotId ? { odooLotId: s.odooLotId } : {}),
  }
}
