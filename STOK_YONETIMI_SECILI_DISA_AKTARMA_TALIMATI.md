# Stok Yönetimi — seçili ürün/varyantları PDF/Excel/CSV olarak dışa aktarma

## İstek

Görkem'in ekran görüntüsü: hem ürün (şablon) seçim çubuğunda ("1 ürün seçildi" — Toplu Fiyat
Güncelle / Seçili Ürünleri Arşivle) hem varyant seçim çubuğunda ("3 varyant seçildi" — Seçili
Varyantlara Etiket Bas / Seçili Varyantları Arşivle / Arşivden Çıkar) bir **"Dışa Aktar"** butonu
istiyor:

- **Ürün seçiliyse** → seçili ürünlerin (şablon satırlarının) dökümü.
- **Varyant seçiliyse** → seçili varyantların dökümü.
- Format seçenekleri: **PDF, Excel (xlsx), CSV**.

## Mevcut altyapı (kodda doğrulandı) — TEKERLEĞİ YENİDEN İCAT ETMEYİN

- `backend/src/modules/reports/report-export.service.ts` ZATEN genel amaçlı, çalışan bir
  Excel/PDF export deseni içeriyor: `exportReportExcel()` (ExcelJS, başlık satırı + "GÜVEN OPTİK"
  üst bilgi + kalın header satırı) ve `exportReportPdf()` (PDFDocument, Türkçe karakterleri doğru
  basan `Roboto-Regular.ttf`/`Roboto-Bold.ttf` fontları `packages/web/src/assets/fonts`'tan
  register ediliyor, `drawPdfTable()` ile sayfa taşarsa otomatik yeni sayfa açan tablo çizimi, 5'ten
  fazla kolon varsa yatay/landscape sayfa). **Yeni export fonksiyonlarınızı bu dosyadaki fontlar ve
  tablo çizim mantığıyla AYNI şekilde yazın** (ya da mümkünse ortak bir yardımcıya çıkarıp
  `drawPdfTable`'ı buradan da çağırın) — font register/landscape/sayfalama mantığını sıfırdan
  yazmayın, burada zaten çözülmüş.
- `backend/src/modules/admin/sablon-excel-import.controller.ts`, `GET /ornek-indir` (satır 18-30) —
  zaten çalışan bir "buffer üret → `Content-Type`/`Content-Disposition` header'ları set et → `res.send(buffer)`"
  deseni var, AYNI deseni izleyin.
- Frontend'de blob-indirme deseni ZATEN var: `UrunYapilandirmaPage.tsx`, `excelSablonIndir()` (satır
  426-434): `adminApi.get(..., {responseType:'blob'})` → `URL.createObjectURL` → gizli `<a>` ile
  `.click()` → `URL.revokeObjectURL`. Bizim durumda seçili id listesi POST body'sinde gideceği için
  `adminApi.post(url, body, {responseType:'blob'})` kullanın, indirme mantığı AYNI kalsın.
- Varyant nitelik etiketi (`MODEL: ... / RENK: ... / ÖLÇÜ: ...`) üretimi için zaten bir desen var:
  `backend/scripts/test-varyant-bazli-arsivleme.ts`, `variantLabel()` fonksiyonu —
  `product_template_attribute_value_ids` → `product.template.attribute.value` `read` ile
  `attribute_id`/`product_attribute_value_id` okuyup birleştiriyor. Export endpoint'inde varyant
  etiketi üretirken AYNI mantığı kullanın (ya da varsa zaten `admin.controller.ts`'teki
  `varyantEtiketi`/benzeri sunucu tarafı bir fonksiyonu varsa onu kullanın).

## İstenen

### 1) Backend — iki yeni export endpoint'i

`backend/src/modules/admin/stok-yonetimi.service.ts`'e (ya da yeni bir `stok-export.util.ts`
dosyasına) iki fonksiyon ekleyin:

- `exportStokUrunleri(urunIds: number[], format: 'pdf' | 'xlsx' | 'csv'): Promise<Buffer>` —
  verilen `product.template` id'leri için Stok Yönetimi ana tablosuyla AYNI kolonları
  (İç Referans, Ürün Adı, Kategori, Satış ₺, Alış ₺, KDV, Stok) tek satır tek ürün olacak şekilde
  üretir. Mevcut `listStokUrunleri`'nin kullandığı yardımcı fonksiyonları (`resolveTemplateKdvMap`,
  `resolveTemplateStandardPriceMap`, `getTemplateStockMap`) YENİDEN KULLANIN — veriyi tekrar
  hesaplamayın, sadece verilen id alt kümesi için aynı okuma fonksiyonlarını çağırın.
- `exportStokVaryantlari(variantIds: number[], format: 'pdf' | 'xlsx' | 'csv'): Promise<Buffer>` —
  verilen `product.product` id'leri için (Ürün Adı, Nitelik Etiketi, Barkod, Satış ₺, Maliyet ₺)
  kolonlarıyla tek satır tek varyant üretir.

`admin.controller.ts`'e iki yeni endpoint ekleyin:

- `POST /stok-urunleri/disa-aktar` — body `{urunIds: number[], format: 'pdf'|'xlsx'|'csv'}` →
  `exportStokUrunleri()` çağırıp buffer'ı formatına göre doğru `Content-Type` +
  `Content-Disposition: attachment; filename="stok-urunleri-<tarih>.<uzanti>"` ile dönsün.
- `POST /odoo-sablon/varyant-disa-aktar` — body `{variantIds: number[], format}` →
  `exportStokVaryantlari()` ile aynı şekilde, dosya adı `stok-varyantlari-<tarih>.<uzanti>`.

Format → Content-Type eşlemesi:
- `pdf` → `application/pdf`
- `xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `csv` → `text/csv; charset=utf-8` — **CSV çıktısının başına UTF-8 BOM (`﻿`) ekleyin**, yoksa
  Türkçe karakterler (İ, ş, ğ, ç, ö, ü) Excel'de bozuk görünür.

### 2) Frontend — iki yeni "Dışa Aktar" butonu

`StokYonetimiPage.tsx`'te:

- Ürün seçim çubuğuna ("Seçimi Temizle" butonunun yanına) bir **"Dışa Aktar"** dropdown/menü
  ekleyin: PDF / Excel / CSV seçenekleri, seçilince `POST /admin/stok-urunleri/disa-aktar` çağırıp
  (`secili` Set'indeki id'lerle) blob indirsin.
- Varyant seçim çubuğuna aynı şekilde bir **"Dışa Aktar"** dropdown ekleyin: `POST
  /admin/odoo-sablon/varyant-disa-aktar` çağırıp (`secilenVaryantlar`'daki `odooId`'lerle) blob
  indirsin.
- İkisi de `excelSablonIndir()`'deki blob-indirme desenini (`responseType:'blob'` →
  `createObjectURL` → gizli `<a>` → `revokeObjectURL`) kullansın.
- Buton/dropdown stilini mevcut diğer aksiyon butonlarıyla (Toplu Fiyat Güncelle, Arşivle vb.)
  tutarlı tutun.

## Test

1. Tek bir ürün seçip PDF/Excel/CSV'nin ÜÇÜNÜ de indirip, dosyaların açıldığını ve doğru
   satırı/kolonları içerdiğini gösterin.
2. Birden fazla varyant seçip (örn. OPTELLİ'nin 3 varyantı) her 3 formatta indirip, her satırın
   doğru barkod/nitelik/fiyat bilgisini içerdiğini gösterin.
3. CSV dosyasını Excel'de açıp Türkçe karakterlerin (İ, ş, ğ, ç, ö, ü) BOZULMADAN göründüğünü
   doğrulayın.
4. Hiç seçim yokken export butonlarının gizli/devre dışı olduğunu doğrulayın (mevcut diğer aksiyon
   çubukları gibi, sadece seçim varken görünür).

## Rapor formatı

Değişen dosyalar/satırlar + yeni endpoint'ler + 3 formatın örnek çıktı dosyaları/ekran görüntüsü +
test 1-4'ün sonucu.
