# "Ürünler Temin" adımı — ANADEPO'da olan ürün "bu lokasyonda yok" diyor, Transfer Et çalışmıyor

## Durum

Görkem, sistem yöneticisi kullanıcısıyla girdiği bir satışta, "Temin" adımında ANADEPO'da mevcut
olan bir ürün için ürünün hiçbir lokasyonda bulunamadığını gördü. Transfer Et butonuyla işlem
başlatamadı.

## Kod tarafı — güçlü hipotez (önce doğrulayın)

`packages/web/src/utils/aktifLokasyon.ts`:

```ts
export function getAktifLokasyon(branchCode?: string | null): string {
  if (branchCode?.trim()) return branchCode.trim()
  if (typeof window === 'undefined') return 'GVN1'
  return localStorage.getItem(AKTIF_LOKASYON_KEY) || 'GVN1'   // ← admin için varsayılan GVN1
}
```

`StokTeminStep.tsx`, `aktifLokasyon = getAktifLokasyon(branchCode)` (satır 85) — sistem yöneticisi
kullanıcısının `branchCode`'u muhtemelen boş/null (belirli bir şubeye bağlı değil). Bu durumda
fonksiyon `localStorage`'daki `aktifLokasyon` değerine, o da yoksa **sabit `'GVN1'`**'e düşüyor —
**ANADEPO değil**. Yani ekran muhtemelen "GVN1'de var mı" diye kontrol ediyordu, Görkem'in
gördüğü/beklediği ANADEPO değil.

Bununla birlikte Görkem "diğer lokasyonlarda da yok" dedi — eğer varsayım doğruysa ürün en azından
`BASKA_LOKASYON` (sarı, "şu lokasyondan transfer et") durumuna düşüp ANADEPO'yu listelemeliydi.
Bunun olmaması şu ihtimalleri gösteriyor: (a) `/admin/stok-kontrol-urun?productId=...` endpoint'i
ANADEPO'yu hiç dönmüyor (lokasyon id eşleşmesi/filtre sorunu), ya da (b) bu ekranın kullandığı
`odooProductId` ile ANADEPO'daki stoğun bağlı olduğu Odoo `product.product` kaydı **aynı değil**
(varyant/şablon karışıklığı — bu oturumda daha önce `resolveProductVariantId`'de benzer bir bug
bulunup düzeltilmişti, burada da olası).

Ayrıca: `stokDurum==='YOK'` durumunda arayüzde **Transfer Et butonu hiç gösterilmiyor** (sadece
`BASKA_LOKASYON` durumunda görünüyor, satır 464) — yalnızca "🛒 Sipariş Ver" butonu var. Yani
Görkem'in "Transfer eti çalıştıramadım" demesi muhtemelen buton hiç çıkmadığı için.

## İstenen — önce teşhis

1. Bu spesifik ürünün `odooProductId`'sini (network log / DB) bulun, `GET
   /admin/stok-kontrol-urun?productId=<id>` çağrısını doğrudan yapıp dönen `lokasyonlar` dizisini
   raporlayın — ANADEPO (lokasyon id 61) gerçekten `kullanilabilir > 0` ile listede var mı?
2. Sistem yöneticisi kullanıcısının `branchCode`'unun gerçekten boş/null olduğunu doğrulayın; bu
   kullanıcı için `aktifLokasyon`'un fiilen ne değere düştüğünü (muhtemelen `GVN1` veya
   localStorage'daki eski bir değer) bulun.
3. Eğer #1'de ANADEPO dönmüyorsa: bu productId için Odoo'da `stock.quant` kayıtlarını sorgulayıp
   ANADEPO lokasyonunda (id 61) gerçekten pozitif miktar olup olmadığını, `/admin/stok-kontrol-urun`
   endpoint'inin bu lokasyonu neden atladığını (kod: hangi lokasyon id listesini sorguluyor)
   bulun.
4. Admin panelindeki "Stok Yönetimi" ekranında aynı ürünün ANADEPO'da göründüğünü teyit eden
   sorgu ile POS'un kullandığı `odooProductId` **aynı Odoo kaydı mı**, karşılaştırın.

## Düzeltme (teşhis sonucuna göre)

1. Sistem yöneticisi/admin gibi belirli bir şubeye bağlı olmayan kullanıcılar için
   `aktifLokasyon`'un sessizce `GVN1`'e düşmesi yanlış — ya kullanıcıya açıkça bir lokasyon
   seçtirin (POS'ta zaten bir "Lokasyon Değiştir" mekanizması var, `DepoPage.tsx`'te görülmüştü),
   ya da admin bağlamında bu ekranı göstermeden önce lokasyon seçimini zorunlu kılın.
2. `#3` teşhisi doğrularsa `/admin/stok-kontrol-urun`'un lokasyon sorgusunu düzeltin.
3. `#4` teşhisi bir productId uyuşmazlığı gösterirse, kaynağı (nereden yanlış id geldiği) bulup
   düzeltin.

## Test

ANADEPO'da gerçek stoğu olan bir ürünle, admin kullanıcısıyla (doğru lokasyon seçiliyken) Temin
adımının "✅ Bu mağazada mevcut" veya doğru "BASKA_LOKASYON" + çalışan Transfer Et gösterdiğini
kanıtlayın.

## Rapor formatı

Teşhis sonuçları (1-4) + kök neden + düzeltme diff'i + ekran görüntüsü.
