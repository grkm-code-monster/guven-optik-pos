# "Bu ürün laboratuvar sürecine tabi değil" — lens ürünü laboratuvara gönderilemiyor

## Durum

Görkem bir lens satış kalemini ("Standart 4/2 %25 İnceltme Beyaz -0350 0075" — aynı zamanda stok
sorununun da konusu olan ürün) "Laboratuvara Gönderildi" olarak işaretlemek istiyor ama
`NOT_LAB_ELIGIBLE_ITEM` hatası alıyor.

## Kod tarafı — kök neden

`backend/src/modules/sales/sale-item-lab.util.ts`, `isLabEligibleSaleItem()`:

```ts
export const ODOO_OPTIK_CAM_CATEGORY_IDS = [
  4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
  33, 34, 35, 36, 37, 38, 39, 40, 41,
] as const;

export function isLabEligibleSaleItem(item: LabEligibleSaleItem): boolean {
  if (item.product?.category === ProductCategory.LENS_RX) return true;          // (a)
  const catId = item.odooCategoryId ?? null;
  const inList = catId != null && OPTIK_CAM_ID_SET.has(catId);                  // (b)
  ...
  if (item.linkType === LinkType.FRAME_LENS || item.linkType === LinkType.CUSTOMER_FRAME) {
    return true;                                                                 // (c)
  }
  return false;
}
```

Üç yoldan biri tutmalı: (a) Postgres `Product.category === LENS_RX`, (b) `odooCategoryId`
**sabit kodlanmış bir liste** (4, 10-41) içinde, (c) kalem bir çerçeveye `FRAME_LENS`/
`CUSTOMER_FRAME` olarak bağlı.

Bu oturumda daha önce defalarca görüldüğü gibi, gerçek ürün girişi akışları Odoo'da doğrudan
ürün/kategori oluşturuyor, Postgres `Product` tablosuna yazmıyor — yani (a) büyük ihtimalle
tutmuyor. Bu satış kalemi ayrıca bir çerçeveye bağlı link olmadan tek başına eklenmiş olabilir —
(c) de tutmuyor olabilir. Geriye (b) kalıyor: **bu ürünün gerçek Odoo kategori ID'si, sabit
kodlanmış `ODOO_OPTIK_CAM_CATEGORY_IDS` listesinde yoksa**, hiçbir yol tutmaz ve hata çıkar.

Bu liste sabit/statik — Odoo'da yeni bir lens kategorisi açıldığında (bu oturumda zaten birden
çok yeni lens/kontakt lens kategorisi/ürün grubu oluşturuldu) **otomatik olarak bu listeye
girmiyor**, elle güncellenmesi gerekiyor. Bu kırılgan bir tasarım.

## İstenen — önce teşhis

1. Bu spesifik satış kaleminin gerçek verilerini raporlayın: `odooCategoryId`, `odooProductId`,
   `odooProductName`, `linkType`, ve varsa bağlı Postgres `product.category`.
2. `odooCategoryId` doluysa, bu ID'nin gerçekten `ODOO_OPTIK_CAM_CATEGORY_IDS` listesinde olup
   olmadığını doğrulayın. Değilse, Odoo'da bu kategorinin (ve üst/alt kategorilerinin) tam
   adını/ID'sini bulup raporlayın.

## Düzeltme

1. Eksik kategori ID'si varsa listeye ekleyin — ama asıl önemlisi, **bu yaklaşımı daha az
   kırılgan hale getirin**: mümkünse Odoo'da "optik cam/lens" kategorilerini isim deseniyle
   (örn. üst kategori "Optik Cam"/"Lens" olan tüm alt kategoriler) dinamik olarak çözüp sabit ID
   listesine bağımlılığı azaltın, ya da en azından bu listeyi tek bir yerde (config/DB) tutup
   yeni kategori eklendiğinde admin panelinden güncellenebilir yapın — kodda gömülü sabit liste
   yerine.
2. Kısa vadede (asıl teşhis netleşene kadar) sadece eksik ID'yi ekleyip mevcut mimariyi
   koruyabilirsiniz, ama bu kırılganlığı Görkem'e açıkça belirtin.

## Test

Aynı ürünü (veya aynı kategorideki başka bir lens ürününü) tekrar "Laboratuvara Gönderildi" olarak
işaretleyip artık `NOT_LAB_ELIGIBLE_ITEM` hatası almadığını gösterin.

## Rapor formatı

Teşhis sonucu (gerçek kategori ID + listede olup olmadığı) + düzeltme diff'i + ekran görüntüsü.
