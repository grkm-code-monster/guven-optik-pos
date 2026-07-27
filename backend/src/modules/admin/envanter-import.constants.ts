export const ENVANTER_IMPORT_HEADERS = [
  'Kategori',
  'Ürün Adı',
  'Model',
  'Renk',
  'Ölçü',
  'Barkod',
  'UTS Kodu',
  'Adet',
  'Satış Fiyatı',
  'Maliyet Fiyatı',
  'KDV Oranı',
  'Odoo Varyant ID',
  'Lot No',
  'Odoo Lot ID',
] as const;

export type EnvanterImportHeader = (typeof ENVANTER_IMPORT_HEADERS)[number];

export const ENVANTER_ZORUNLU_ALANLAR: EnvanterImportHeader[] = [
  'Kategori',
  'Ürün Adı',
  'Model',
  'Renk',
  'Ölçü',
  'Barkod',
  'Adet',
  'Satış Fiyatı',
  'Maliyet Fiyatı',
];

export type EnvanterSatirDurum =
  | 'YENI_SABLON'
  | 'YENI_VARYANT'
  | 'MEVCUT_VARYANT'
  | 'HATA';
