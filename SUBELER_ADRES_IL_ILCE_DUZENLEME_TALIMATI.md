# Şubeler ekranı (Tanımlamalar → Şubeler) — İl/İlçe alanı hiç yok

## DÜZELTME NOTU

Bu talimatın önceki versiyonu yanlış dosyayı (`packages/web/src/pages/admin/SubelerPage.tsx`)
işaret ediyordu — o dosya hiçbir route'ta kullanılmıyor, **ölü kod** (grep ile doğrulandı, hiçbir
yerden import edilmiyor). Görkem'in gerçekte kullandığı ekran **Tanımlamalar → Şubeler** sekmesi,
`packages/web/src/pages/admin/TanimlamalarPage.tsx` içindeki `SubelerTab()` bileşeni. Bu ekran
zaten çalışıyor (Ad/Kod/Telefon/Şirket/VKN/Adres/Odoo Lokasyon/PDKS Yer alanlarıyla) — sadece
**İl/İlçe alanı hiç yok**, bu yüzden `Branch.il`/`Branch.ilce` DB'de boş kalıyor ve
`EIRSALIYE_1195_HATASI_VE_OUTBOX_STATUS_TALIMATI.md`'de listelenen şubelerde eksik.

## Kök neden (kodda doğrulandı)

1. `TanimlamalarPage.tsx`, `emptyForm` (satır 444-454) ve `formAlanlari()` (satır 502-608): `il`/
   `ilce` alanı yok — sadece tek bir serbest metin `adres` alanı var.
2. `duzenleAc()` (satır 629-643): mevcut şube verisini forma yüklerken de `il`/`ilce` set edilmiyor
   (çünkü form state'inde hiç yok).
3. Backend `backend/src/modules/admin/admin.controller.ts`:
   - `POST /branch` (satır 845-870): `req.body`'den sadece `name, code, sirketId, sirketAdi, vkn,
     odooLocationId, pdksPlaceId, adres, telefon` okuyor — `il`/`ilce` yok.
   - `PUT /branch/:id` (satır 873-888): `strFields = ['name', 'sirketAdi', 'vkn', 'adres',
     'telefon']` — `il`/`ilce` bu beyaz listede yok, gönderilse bile backend görmezden gelir.

## İstenen

1. `TanimlamalarPage.tsx`: `emptyForm`'a `il: ''`, `ilce: ''` ekleyin; `formAlanlari()`'a "İl" ve
   "İlçe" input'larını ekleyin (Adres alanının yanına, aynı grid satırına sığdırabilirsiniz);
   `duzenleAc()`'ta mevcut şubenin `il`/`ilce` değerlerini forma yükleyin; `PosBranch` tipine de
   `il?: string | null`, `ilce?: string | null` ekleyin.
2. Backend `POST /branch`: destructuring'e `il`, `ilce` ekleyin, `prisma.branch.create()`'in
   `data` objesine `il: il || null, ilce: ilce || null` ekleyin.
3. Backend `PUT /branch/:id`: `strFields` dizisine `'il'`, `'ilce'` ekleyin.
4. Liste kartlarında (satır ~648'den sonraki branch kartı render'ı) il/ilce eksikse görsel bir
   uyarı/rozet gösterin (mevcut `badge()` yardımcı fonksiyonunu kullanabilirsiniz — Odoo/PDKS
   rozetleriyle aynı desende) ki Görkem hangi şubelerin eksik olduğunu bu ekrandan görebilsin.

## Test

1. Backend'i yeniden başlatıp GVN7 şubesini açın, İl/İlçe girip kaydedin; sayfa yenilendiğinde
   verinin kalıcı olduğunu gösterin.
2. Diğer eksik şubeler (GVN1, GVN3, GVN5, GVN6, GVN8, GVN9, GVN10) için de aynı şekilde girilip
   kaydedilebildiğini gösterin.
3. Eksik il/ilçe'li şubelerde artık görsel uyarı rozeti çıktığını gösterin.

## Rapor formatı

Değişen dosyalar + önce/sonra ekran görüntüsü (İl/İlçe alanı formda, kaydedilmiş liste).
