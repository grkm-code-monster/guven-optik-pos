export const SABLON_EXCEL_HEADERS = [
  'Kategori (tam yol)',
  'Ürün Şablon Adı',
  'Model',
  'Renk',
  'Ölçü',
  'Barkod',
  'İç Referans',
  'KDV Oranı',
  'Satış Fiyatı',
  'Maliyet',
  'Şirket',
  'İzleme',
] as const;

export const SABLON_EXCEL_ZORUNLU = ['kategori', 'urunSablonAdi'] as const;

export const SABLON_EXCEL_HEDEF_ALANLARI = [
  'kategori',
  'urunSablonAdi',
  'model',
  'renk',
  'olcu',
  'barkod',
  'icReferans',
  'kdvOrani',
  'satisFiyati',
  'maliyet',
  'sirket',
  'izleme',
] as const;

export type SablonExcelHedefAlan = (typeof SABLON_EXCEL_HEDEF_ALANLARI)[number];

export type SablonExcelKolonMap = Record<SablonExcelHedefAlan, number | 'yoksay'>;

export const SABLON_EXCEL_HEDEF_ETIKETLER: Record<SablonExcelHedefAlan, string> = {
  kategori: 'Kategori *',
  urunSablonAdi: 'Ürün Şablon Adı *',
  model: 'Model',
  renk: 'Renk',
  olcu: 'Ölçü',
  barkod: 'Barkod',
  icReferans: 'İç Referans',
  kdvOrani: 'KDV Oranı',
  satisFiyati: 'Satış Fiyatı',
  maliyet: 'Maliyet',
  sirket: 'Şirket',
  izleme: 'İzleme',
};

export const VARSAYILAN_SABLON_EXCEL_KOLON_MAP: SablonExcelKolonMap = {
  kategori: 0,
  urunSablonAdi: 1,
  model: 2,
  renk: 3,
  olcu: 4,
  barkod: 5,
  icReferans: 6,
  kdvOrani: 7,
  satisFiyati: 8,
  maliyet: 9,
  sirket: 10,
  izleme: 11,
};
