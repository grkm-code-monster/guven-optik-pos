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

// Not: 'Model', 'Renk', 'Ölçü' burada YOK — Cam (Optik Cam) ve Lens (Kontakt
// Lens) kategorisi ürünlerinde bu alanlar olmaz. Bu üç alan sadece Çerçeve/
// Güneş Gözlüğü gibi diğer kategorilerde, validateRow() içinde kategoriye
// göre koşullu olarak zorunlu tutuluyor.
export const ENVANTER_ZORUNLU_ALANLAR: EnvanterImportHeader[] = [
  'Kategori',
  'Ürün Adı',
  'Barkod',
  'Adet',
  'Satış Fiyatı',
  'Maliyet Fiyatı',
];

// Kategori adı bu anahtar kelimelerden birini içeriyorsa (Cam / Lens), Model,
// Renk, Ölçü alanları zorunlu değildir.
export const ENVANTER_MODEL_RENK_OLCU_MUAF_ANAHTAR_KELIMELER = ['CAM', 'LENS'];

export type EnvanterSatirDurum =
  | 'YENI_SABLON'
  | 'YENI_VARYANT'
  | 'MEVCUT_VARYANT'
  | 'HATA';
