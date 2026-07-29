import type { ComponentType } from 'react'
import { SABLON_PREVIEW_MAP } from './sablon-previews'
import type { PreviewProps } from './sablon-previews'
import type { OzellestirmeAlani, SablonAyar, SablonId, SablonTanim } from './sablon-types'

const ORTAK_ALANLAR: OzellestirmeAlani[] = [
  { key: 'fontUrunAdi', label: 'Ürün Adı Font (dot)', type: 'number', min: 8, max: 40 },
  { key: 'fontFiyat', label: 'Fiyat Font (dot)', type: 'number', min: 10, max: 50 },
  { key: 'fontKucuk', label: 'Küçük Yazı Font (dot)', type: 'number', min: 6, max: 20 },
  { key: 'renkBaslik', label: 'Başlık Rengi', type: 'color' },
  { key: 'renkFiyat', label: 'Fiyat Rengi', type: 'color' },
]

const ORTAK_TOGGLE: OzellestirmeAlani[] = [
  { key: 'gosterIcReferans', label: 'İç Referans Göster', type: 'boolean' },
  { key: 'gosterKdv', label: 'KDV DAHİLDİR Göster', type: 'boolean' },
]

export const VARSAYILAN_AYAR: SablonAyar = {
  fontUrunAdi: 17,
  fontFiyat: 32,
  fontKucuk: 13,
  renkBaslik: '#111111',
  renkFiyat: '#000000',
  renkKampanya: '#dc2626',
  gosterKdv: true,
  gosterSeri: true,
  gosterSonGuncelleme: true,
  gosterIcReferans: true,
  gosterRenk: true,
  gosterBarkod: true,
  gosterGs1: true,
  gosterGs1Kodlari: true,
  gosterMiktar: true,
  gosterLokasyon: true,
  gosterLot: true,
  gosterBarkodNo: true,
  gosterNitelik: true,
  gosterSonSayim: true,
  gosterCerceveTuru: true,
  gosterMateryal: true,
  indirimYuzdesi: 25,
  ikinciUrunIndirim: 50,
}

export const SABLONLAR: Array<SablonTanim & { Preview: ComponentType<PreviewProps> }> = [
  {
    id: 'gunes-aksesuar',
    ad: 'Güneş Gözlüğü / Aksesuar',
    aciklama: 'Katlanır paddle · 102×20 mm · Code128 + GS1',
    etiketGenislik: 102,
    etiketYukseklik: 20,
    previewW: 306,
    previewH: 60,
    Preview: SABLON_PREVIEW_MAP['gunes-aksesuar'],
    defaultAyar: { ...VARSAYILAN_AYAR },
    ozellestirmeAlanlari: [
      ...ORTAK_ALANLAR,
      ...ORTAK_TOGGLE,
      { key: 'gosterRenk', label: 'Renk Kodu Göster', type: 'boolean' },
      { key: 'gosterSonGuncelleme', label: 'Fiyat Değişim Tarihi Göster', type: 'boolean' },
      { key: 'gosterBarkod', label: 'Barkod (Code128) Göster', type: 'boolean' },
      { key: 'gosterGs1', label: 'GS1 DataMatrix Göster', type: 'boolean' },
      { key: 'gosterGs1Kodlari', label: 'GS1 Referans Satırları Göster', type: 'boolean' },
    ],
  },
  {
    id: 'optik-cerceve-uts',
    ad: "Optik Çerçeve (UTS'li)",
    aciklama: 'GS1 DataMatrix · UTS kodları',
    etiketGenislik: 100,
    etiketYukseklik: 50,
    previewW: 300,
    previewH: 150,
    Preview: SABLON_PREVIEW_MAP['optik-cerceve-uts'],
    defaultAyar: { ...VARSAYILAN_AYAR },
    ozellestirmeAlanlari: [
      ...ORTAK_ALANLAR,
      ...ORTAK_TOGGLE,
      { key: 'gosterSeri', label: 'Seri No Göster', type: 'boolean' },
      { key: 'gosterSonGuncelleme', label: 'Son Güncelleme Göster', type: 'boolean' },
      { key: 'gosterGs1', label: 'GS1 DataMatrix Göster', type: 'boolean' },
      { key: 'gosterGs1Kodlari', label: 'GS1 Kod Satırları Göster', type: 'boolean' },
    ],
  },
  {
    id: 'depo-kutu',
    ad: 'Depo Etiketi',
    aciklama: '50×30 mm · ürün bazlı · elle doldurulacak alanlar',
    etiketGenislik: 50,
    etiketYukseklik: 30,
    previewW: 150,
    previewH: 90,
    Preview: SABLON_PREVIEW_MAP['depo-kutu'],
    defaultAyar: { ...VARSAYILAN_AYAR, fontUrunAdi: 16 },
    ozellestirmeAlanlari: [
      { key: 'fontUrunAdi', label: 'Ürün Adı Font (dot)', type: 'number', min: 8, max: 24 },
      { key: 'renkBaslik', label: 'Başlık Rengi', type: 'color' },
      { key: 'gosterBarkod', label: 'Barkod (Code128) Göster', type: 'boolean' },
      { key: 'gosterBarkodNo', label: 'Barkod Numarası Göster', type: 'boolean' },
      { key: 'gosterNitelik', label: 'Model/Renk/Ölçü Göster', type: 'boolean' },
      { key: 'gosterSonSayim', label: 'Son Sayım Tarihi Göster', type: 'boolean' },
      { key: 'gosterCerceveTuru', label: 'Çerçeve Türü Kutusu Göster', type: 'boolean' },
      { key: 'gosterMateryal', label: 'Materyal Kutusu Göster', type: 'boolean' },
    ],
  },
  {
    id: 'kampanya-yuzde',
    ad: 'Kampanya — Yüzde İndirim',
    aciklama: '%XX İNDİRİM · 102×20 mm (Güneş/Aksesuar ile aynı)',
    etiketGenislik: 102,
    etiketYukseklik: 20,
    previewW: 306,
    previewH: 60,
    Preview: SABLON_PREVIEW_MAP['kampanya-yuzde'],
    defaultAyar: { ...VARSAYILAN_AYAR, renkKampanya: '#dc2626' },
    ozellestirmeAlanlari: [
      { key: 'indirimYuzdesi', label: 'İndirim Yüzdesi', type: 'number', min: 1, max: 99 },
      { key: 'renkKampanya', label: 'Kampanya Rengi', type: 'color' },
      ...ORTAK_ALANLAR,
      { key: 'gosterIcReferans', label: 'Referans Göster', type: 'boolean' },
      { key: 'gosterKdv', label: 'KDV DAHİLDİR Göster', type: 'boolean' },
    ],
  },
  {
    id: 'kampanya-fiyat',
    ad: 'Kampanya — Fiyat Düşüşü',
    aciklama: 'ESKİ → YENİ fiyat · 102×20 mm (Güneş/Aksesuar ile aynı)',
    etiketGenislik: 102,
    etiketYukseklik: 20,
    previewW: 306,
    previewH: 60,
    Preview: SABLON_PREVIEW_MAP['kampanya-fiyat'],
    defaultAyar: { ...VARSAYILAN_AYAR, renkKampanya: '#16a34a' },
    ozellestirmeAlanlari: [
      { key: 'renkKampanya', label: 'Yeni Fiyat Rengi', type: 'color' },
      ...ORTAK_ALANLAR,
      { key: 'gosterIcReferans', label: 'Referans Göster', type: 'boolean' },
    ],
  },
  {
    id: 'kampanya-ikinci',
    ad: 'Kampanya — İkinci Ürün',
    aciklama: '2. ÜRÜN %50 · 102×20 mm (Güneş/Aksesuar ile aynı)',
    etiketGenislik: 102,
    etiketYukseklik: 20,
    previewW: 306,
    previewH: 60,
    Preview: SABLON_PREVIEW_MAP['kampanya-ikinci'],
    defaultAyar: { ...VARSAYILAN_AYAR, renkKampanya: '#7c3aed' },
    ozellestirmeAlanlari: [
      { key: 'ikinciUrunIndirim', label: '2. Ürün İndirim %', type: 'number', min: 1, max: 99 },
      { key: 'renkKampanya', label: 'Kampanya Rengi', type: 'color' },
      ...ORTAK_ALANLAR,
      { key: 'gosterIcReferans', label: 'Referans Göster', type: 'boolean' },
    ],
  },
]

export function sablonBul(id: SablonId) {
  return SABLONLAR.find((s) => s.id === id)
}
