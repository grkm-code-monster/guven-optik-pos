# "Yeni Satış" → 6. Onay adımında atölye şubesi seçilemiyor

## Durum

Görkem "Yeni Satış" akışının son adımında ("6. Onay", `StatusStep.tsx`) "🔬 Laboratuvara Verildi"
durumunu seçip "Kaydet & Bitir"e bastığında ekranda kırmızı bir uyarı çıkıyor: **"Laboratuvara
gönderim için atölye şubesi seçilmelidir."** — ama bu ekranda atölye şubesi seçebileceği hiçbir
alan/dropdown yok.

## Kök neden — doğrulandı

`packages/web/src/components/sale/StatusStep.tsx`, `save()` fonksiyonu (satır 56-68):

```ts
async function save() {
  ...
  await Promise.all(itemsToUpdate.map((it) =>
    apiClient.patch(`/sales/${sale.id}/items/${it.id}/status`,
      { status: picked, deliveryDate: deliveryDate || undefined })
  ))
  ...
}
```

`atolyeBranchId` alanı **hiç gönderilmiyor**. Backend (`sale.service.ts`, `updateItemStatus`)
`status === IN_LAB` olduğunda bu alanı zorunlu tutuyor, yoksa `ATOLYE_BRANCH_REQUIRED` hatası
döndürüyor (`sale.controller.ts`: `'Laboratuvara gönderim için atölye şubesi seçilmelidir.'`) —
ekranda görünen bu ham backend hata mesajı, aksiyon alınabilir bir seçici değil. Yani "Laboratuvara
Verildi" seçeneği bu ekrandan **hiçbir zaman başarıyla kaydedilemiyor**.

## Referans — aynı özellik başka bir sayfada zaten çalışıyor

`packages/web/src/pages/TeslimatPage.tsx`'te tam bu akış zaten var ve çalışıyor:

1. `GET /sales/atolye-branches` ile atölyesi olan (`hasAtolye`) şubeler çekiliyor (satır 377-380,
   `setAtolyeBranches`).
2. Boşsa uyarı: "Tanımlı atölye şubesi bulunamadı. Yönetici panelinden şubeye atölye bayrağı
   ekleyin." (satır 668-671).
3. Doluysa bir `<select>` ile seçtiriliyor (satır 673-690, `seciliAtolyeId` state).
4. `updateItemStatus(saleId, itemId, status, atolyeBranchId)` (satır 406-416) —
   `...(atolyeBranchId ? { atolyeBranchId } : {})` ile PATCH body'sine ekleniyor.

## İstenen

`StatusStep.tsx`'e bu aynı deseni taşıyın:

1. Bileşen mount olduğunda (veya kullanıcı "🔬 Laboratuvara Verildi" seçtiğinde) `GET
   /sales/atolye-branches` ile atölye şubelerini çekin (TeslimatPage'deki gibi).
2. `picked === 'IN_LAB'` olduğunda, "Durum" seçim kutularının altında bir atölye şubesi
   `<select>`'i gösterin (TeslimatPage'deki görsel/state deseniyle tutarlı: boşsa uyarı, doluysa
   seçici, ilk şube varsayılan seçili).
3. `save()` fonksiyonunda, `picked === 'IN_LAB'` ise `atolyeBranchId`'yi PATCH body'sine ekleyin;
   seçilmemişse "Kaydet & Bitir" butonunu devre dışı bırakın (TeslimatPage'deki `disabled={...
   !seciliAtolyeId}` deseni gibi) — kullanıcı backend hatasıyla karşılaşmadan önce engellenmeli.
4. Bu satıştaki birden fazla kalem varsa (`itemsToUpdate`) hepsi aynı atölye şubesine mi
   gönderiliyor, yoksa kalem başına ayrı seçim mi gerekiyor — mevcut TeslimatPage tekil kalem
   bazlı çalışıyor, burada `itemsToUpdate.map(...)` ile toplu gönderim var; en basit çözüm olarak
   tek bir atölye seçimini tüm `IN_LAB` işaretli kalemlere uygulayabilirsiniz, ama bunu net
   belirtin ve Görkem'e bu varsayımı raporlayın.

## Test

Bir satışta lens/cam kalemini "Laboratuvara Verildi" olarak işaretleyip atölye şubesi seçtikten
sonra "Kaydet & Bitir"e basınca artık `ATOLYE_BRANCH_REQUIRED` hatası almadan başarıyla
kaydedildiğini gösterin. Atölyesi olan şube yoksa uyarının doğru göründüğünü de gösterin.

## Rapor formatı

Değişen dosya/satırlar + öncesi/sonrası ekran görüntüsü (atölye seçiciyle birlikte başarılı kayıt).
