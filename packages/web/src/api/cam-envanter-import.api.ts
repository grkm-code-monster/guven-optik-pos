import { adminApi } from '../pages/admin/AdminLayout'

export type CamEnvanterSatirDurum = 'YENI_URUN' | 'YENI_LOT' | 'HATA'

export type ParsedCamEnvanterRow = {
  satirNo: number
  kategori: string
  urunSablonu: string
  tedarikciUrunAdi: string
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

export type CamEnvanterSatirOnizleme = ParsedCamEnvanterRow & {
  durum: CamEnvanterSatirDurum
  mesaj: string
  resolvedTemplateId?: number
}

export type CamEnvanterOnizlemeSonuc = {
  success: boolean
  ozet: {
    toplamSatir: number
    urunGrupSayisi: number
    yeniUrun: number
    yeniLot: number
    hata: number
  }
  satirlar: CamEnvanterSatirOnizleme[]
}

export type CamEnvanterUygulaSatirSonuc = {
  satirNo: number
  durum: 'BASARILI' | 'BASARISIZ'
  mesaj: string
  olusturulanLotId?: number
  olusturulanVaryantId?: number
  kategoriAdaylari?: Array<{ id: number; completeName: string }>
}

export type CamEnvanterUygulaSonuc = {
  success: boolean
  ozet: { basarili: number; basarisiz: number }
  satirlar: CamEnvanterUygulaSatirSonuc[]
}

export async function indirCamEnvanterSablon(): Promise<void> {
  const res = await adminApi.get('/admin/cam-envanter-import/sablon-indir', {
    responseType: 'blob',
  })
  const blob = new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'cam-lens-envanter-import-sablon.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

export async function onizleCamEnvanterExcel(file: File): Promise<CamEnvanterOnizlemeSonuc> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await adminApi.post<CamEnvanterOnizlemeSonuc>(
    '/admin/cam-envanter-import/onizle',
    fd,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return res.data
}

export async function uygulaCamEnvanterImport(input: {
  lokasyonKodu: string
  satirlar: ParsedCamEnvanterRow[]
  aktarimKimligi?: string
}): Promise<CamEnvanterUygulaSonuc> {
  const res = await adminApi.post<CamEnvanterUygulaSonuc>(
    '/admin/cam-envanter-import/uygula',
    input,
  )
  return res.data
}

export function camSatirOnizlemedenParsed(s: CamEnvanterSatirOnizleme): ParsedCamEnvanterRow {
  return {
    satirNo: s.satirNo,
    kategori: s.kategori,
    urunSablonu: s.urunSablonu,
    tedarikciUrunAdi: s.tedarikciUrunAdi,
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
