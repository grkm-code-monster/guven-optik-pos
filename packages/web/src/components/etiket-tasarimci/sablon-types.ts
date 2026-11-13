export type SablonId =
  | 'gunes-aksesuar'
  | 'optik-cerceve-uts'
  | 'depo-kutu'
  | 'kampanya-yuzde'
  | 'kampanya-fiyat'
  | 'kampanya-ikinci'

export type SablonTanim = {
  id: SablonId
  ad: string
  aciklama: string
  etiketGenislik: number
  etiketYukseklik: number
}

/** Etiket verisi (GS1 / UTS yardımcıları için) */
export type SablonVeri = {
  urunAdi?: string
  icReferans?: string
  renkVaryant?: string
  fiyat?: string | number
  seriNo?: string
  barkod?: string
  utsKodu?: string
  sonGuncelleme?: string
  lotNo?: string
  /** GS1 (17) — YYAAGG veya DD.MM.YYYY / YYYY-MM-DD */
  sktTarihi?: string
}

/** Şablon seçicideki önizlemeler için örnek veri */
export const ORNEK_SABLON_VERI = {
  urunAdi: 'ÖRNEK ÜRÜN ADI',
  icReferans: 'GG1188S / C1 / 58',
  renkVaryant: 'GG1188S / C1 / 58',
  fiyat: 999,
  seriNo: 'SN-123456',
  // GS1 karekod GTIN kontrol hanesini doğrular: örnek veri GEÇERLİ bir GTIN taşımalı
  // (13.11.2026 — eski örnek GTIN geçersizdi, karekodlu şablonların önizlemesi çizilemiyordu).
  barkod: '08680657152424',
  utsKodu: '01086806571524242136*1125110610000139',
  sonGuncelleme: '22.06.2026',
  lotNo: 'LOT-2024-001',
  sktTarihi: '260624',
}
