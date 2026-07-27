# "Odoo'dan Ürün Seç" arama kutusu — barkodla aramıyor

## Durum

Görkem, Ürün Girişi → satır eşleştirme adımında "🔍 Odoo'dan Ürün Seç" modalinde artık ürünlere
gerçek barkod tanımladığımıza göre (ör. ULTRA KONTAKT LENS serisi), barkodu okutunca/yazınca
direkt o ürünün çıkmasını istiyor. Şu an sadece isimle arama çalışıyor.

## Kök neden (kod okunarak doğrulandı)

`admin.controller.ts` → `GET /admin/urun-ara` (satır ~1398):
```ts
const domain: any[] = [
  ['active', '=', true],
  ['type', 'in', ['product', 'consu']],
  '|',
  ['name', 'ilike', q],
  ['attribute_line_ids.value_ids.name', 'ilike', q],
];
```
Sadece `name` ve nitelik değeri adına göre arıyor — `barcode` (ve `default_code`/iç referans)
domain'de hiç yok. `fields` listesinde `barcode` zaten dönülüyor (satır ~1415), sadece arama
koşuluna dahil değil.

## İstenen

`domain`'e `barcode` ve `default_code` alanlarını da OR ile ekleyin (Odoo domain'de 3+ elemanlı
OR için iç içe `'|'` gerekiyor, dikkat edin):
```ts
const domain: any[] = [
  ['active', '=', true],
  ['type', 'in', ['product', 'consu']],
  '|', '|', '|',
  ['name', 'ilike', q],
  ['attribute_line_ids.value_ids.name', 'ilike', q],
  ['barcode', 'ilike', q],
  ['default_code', 'ilike', q],
];
```
Aynı arama kutusu başka bir yerde de kullanılıyorsa (ör. `/admin/transfer-urun-ara`, satır ~205
frontend çağrısı — o ayrı bir backend endpoint mi kontrol edin) orada da aynı eksiklik varsa
aynı düzeltmeyi uygulayın.

## Test

ULTRA KONTAKT LENS -0100'ün barkodunu (785811314545) arama kutusuna yazıp/okutup doğrudan o
ürünün listede çıktığını gösterin. İsimle arama hâlâ çalışmaya devam etmeli.

## Not — bu talimat şimdilik BEKLETİLİYOR

Görkem diğer bekleyen talimatlarla (Excel toplu aktarma özelliği vb.) birlikte hepsini tek
seferde Cursor'a verecek. Bu dosyayı hazırladım ama göndermeyin/uygulamayın — sıraya girdi,
onay bekliyor.
