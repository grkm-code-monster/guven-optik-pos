// Cam/Lens İçe Aktarma — mevcut Excel Envanter (envanter-import.*) akışından
// BİLİNÇLİ OLARAK AYRI tutulan, tamamen yeni bir dosya ailesi.
//
// Neden ayrı: Çerçeve/Güneş Gözlüğü akışında "bir şablon = bir veya daha
// fazla Model/Renk/Ölçü varyantı, her varyantın KENDİ barkodu" mimarisi var.
// Cam/Lens'te ise durum tam tersi: "1.56 Org Et -0200-0200" gibi TEK bir
// ürün adı altında, farklı tedarikçilerden gelen FARKLI gerçek barkod/UTS'li
// birimler aynı stoğa (aynı product.product) işlenmek isteniyor — her birim
// kendi lotu (ve lotun ref/x_uts_kodu alanlarında kendi gerçek barkod/UTS'i)
// ile ayrı ayrı takip edilir, ama ürünün KENDİ barcode alanı sadece raf
// etiketi/okutma kolaylığı için OTOMATİK ATANAN tek bir "temsilci" barkoddur
// (08680000001XXX serisi) ve ilk oluşturulduktan sonra ASLA değiştirilmez.
//
// Bu mimari mevcut importTekVaryantlarForTemplate/guncelleVaryantFiyatlari
// fonksiyonlarının "her satırın barkodu ürüne yazılır" davranışıyla
// ÇALIŞMAZ (ikinci farklı barkod geldiğinde hata verir) — o yüzden Görkem'in
// onayıyla çerçeve/güneş gözlüğü koduna HİÇ dokunmadan, bu alanlar için
// tamamen yeni servis dosyaları yazıldı (19-20.10.2026).

export const CAM_ENVANTER_IMPORT_HEADERS = [
  'Kategori',
  'Ürün Şablonu',
  'Tedarikçi Ürün Adı',
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

export type CamEnvanterImportHeader = (typeof CAM_ENVANTER_IMPORT_HEADERS)[number];

// Not: "Tedarikçi Ürün Adı" OPSİYONEL — tedarikçinin/firmanın ürüne kendi
// kataloğunda verdiği ad (örn. Beta'dan "1,58 Multı-ar", Sude Optik'ten
// "1,56 hmc", Akay'dan "1,56 et"); bizim ortak "Ürün Şablonu" adımız altında
// (örn. "1.56 Org Et -0200-0200") toplanan farklı tedarikçi birimlerinin
// HANGİSİ hangi firma/isimle geldiğini sonradan sorgulayabilmek için.
// stock.lot.x_tedarikci_urun_adi alanına yazılır (bkz.
// scripts/olustur-cam-tedarikci-urun-adi-alani.ts) — lot'un name/ref/
// x_uts_kodu alanlarına HİÇ dokunmaz, sadece ek bilgi amaçlıdır.
//
// Not: Barkod burada da ZORUNLU — her satır kendi gerçek tedarikçi
// barkoduyla kendi stock.lot'unu (lot.ref) oluşturur. Bu, ürünün KENDİ
// product.product.barcode alanından TAMAMEN BAĞIMSIZDIR (o alan otomatik
// atanır, bu dosyadaki Barkod sütunu hiç yazılmaz).
export const CAM_ENVANTER_ZORUNLU_ALANLAR: CamEnvanterImportHeader[] = [
  'Kategori',
  'Ürün Şablonu',
  'Barkod',
  'Adet',
  'Satış Fiyatı',
  'Maliyet Fiyatı',
];

// Temsilci (ürün düzeyi) barkod serisi — mevcut ÇEKMECE dosyalarında elle
// kullanılan 08680000001XXX serisinin aynısı, aynı global sıra ile devam
// ettirilir (Odoo'da bu önekle başlayan en yüksek barkod bulunup +1 yapılır).
export const CAM_TEMSILCI_BARKOD_ONEKI = '08680000001';

export type CamEnvanterSatirDurum =
  | 'YENI_URUN'
  | 'YENI_LOT'
  | 'HATA';
