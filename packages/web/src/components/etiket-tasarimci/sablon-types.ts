import type { EtiketVeri } from './constants'

export type SablonId =
  | 'gunes-aksesuar'
  | 'optik-cerceve-uts'
  | 'depo-kutu'
  | 'kampanya-yuzde'
  | 'kampanya-fiyat'
  | 'kampanya-ikinci'

export type SablonVeri = EtiketVeri & {
  miktar?: number
  lokasyon?: string
  lotNo?: string
  indirimYuzdesi?: number
  eskiFiyat?: number
  yeniFiyat?: number
}

export type SablonAyar = {
  fontUrunAdi: number
  fontFiyat: number
  fontKucuk: number
  renkBaslik: string
  renkFiyat: string
  renkKampanya: string
  gosterKdv: boolean
  gosterSeri: boolean
  gosterSonGuncelleme: boolean
  gosterIcReferans: boolean
  gosterRenk: boolean
  gosterBarkod: boolean
  gosterGs1: boolean
  gosterGs1Kodlari: boolean
  gosterMiktar: boolean
  gosterLokasyon: boolean
  gosterLot: boolean
  indirimYuzdesi: number
  ikinciUrunIndirim: number
}

export type OzellestirmeAlani = {
  key: keyof SablonAyar
  label: string
  type: 'number' | 'boolean' | 'color'
  min?: number
  max?: number
}

export type SablonTanim = {
  id: SablonId
  ad: string
  aciklama: string
  etiketGenislik: number
  etiketYukseklik: number
  previewW: number
  previewH: number
  defaultAyar: SablonAyar
  ozellestirmeAlanlari: OzellestirmeAlani[]
}

export const ORNEK_SABLON_VERI: SablonVeri = {
  urunAdi: 'ÖRNEK ÜRÜN ADI',
  icReferans: 'REF001',
  renkVaryant: 'Siyah',
  fiyat: 999,
  eskiFiyat: 1299,
  yeniFiyat: 999,
  seriNo: 'SN-123456',
  barkod: 'REF001',
  utsKodu: '08681234567890',
  sonGuncelleme: '22.06.2026',
  miktar: 24,
  lokasyon: 'GVN1-A12',
  lotNo: 'LOT-2024-001',
  indirimYuzdesi: 25,
}
