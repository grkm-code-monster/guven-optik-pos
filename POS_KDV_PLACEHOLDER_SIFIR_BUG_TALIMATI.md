# KDV fix'i placeholder ürünlerde %0'a düşüyor — ACİL (canlı satış testinde bulundu)

## Kök neden (kesin, kod satırıyla doğrulandı)

`sale.service.ts` → `getOdooPlaceholderProduct()` (satır ~55-63):

```ts
const created = await prisma.product.create({
  data: {
    name: ODOO_PLACEHOLDER_NAME,
    productType: ProductType.READY,
    category: ProductCategory.ACCESSORY,
    price: new Prisma.Decimal(0),
    taxRate: new Prisma.Decimal(0),   // ← hardcoded 0
    isActive: false,
  },
});
```

Odoo ürün aramasıyla eklenen (yani local statik katalogda olmayan) HER satış kalemi bu placeholder'a
bağlanıyor (`resolveProductForInput`, `isOdooPlaceholder: true` yolu) — ki gerçek satışların büyük
çoğunluğu (reçeteli camlar, Odoo'dan aranan çerçeveler vb.) bu yoldan geçiyor.

KDV fix'inde (`confirmSale`, ~satır 864): `const taxRate = Number(item.product?.taxRate ?? 20)` —
placeholder'ın `taxRate`'i `0` olduğu için `0 ?? 20` JavaScript'te **`0` kalır** (sadece null/
undefined'da 20'ye düşer). Sonuç: `resolvePosLineTax` her zaman `taxRate=0` ile çağrılıyor,
Odoo'da otomatik "KDV %0 Dahil (Satış)" adında bir vergi kaydı oluşturup onu kullanıyor.

## Gerçek etki (canlı testte görüldü)

Satış S00061 (YAPRAK GEZER, PRO %40 İNCELTME BEYAZ + OSSE OPTİK ÇERÇEVE):
- POS'un kendi hesabı: Ara Toplam ₺40, İndirim ₺4, KDV ₺4, Genel Toplam ₺40.
- Odoo faturası (SFAT/2026/00043): Vergi Hariç ₺36, **KDV %0: ₺0,00**, Toplam ₺36.
- Bu ₺4 fark, ödeme mutabakatına da yansımış: POS "Açık Hesap kalan: ₺5" derken Odoo "Ödenecek
  Tutar: ₺1" gösteriyor — aynı kök nedenin sonucu, ayrı bir bug değil.

## İstenen düzeltme

1. `resolvePosLineTax`'a geçirilen `taxRate`, placeholder ürünler için **asla** Postgres
   `item.product.taxRate`'ten okunmamalı — bu alan placeholder'da anlamsız (hep 0). Bunun yerine:
   - Eğer `item.odooProductId` doluysa (placeholder/Odoo yolu), gerçek oranı Odoo'dan okuyun —
     `odoo-tax.util.ts`'te zaten hazır bir yardımcı var: `readProductSaleTaxRate(productId,
     companyId)`. Bunu kullanın.
   - Sadece gerçekten local statik katalogdan gelen (placeholder olmayan) kalemlerde
     `item.product.taxRate`'e güvenin.
2. `0 ?? 20` mantık hatasını da ayrıca düzeltin — `taxRate` gerçekten `0` VE placeholder değilse bile
   (yani bilinçli %0 KDV'li bir ürünse) bunu koruyun, ama placeholder kaynaklı sahte 0'ları ayırt edin.
3. Bu değişiklikten sonra en az iki farklı gerçek KDV oranlı ürünle (biri %20, biri %10 — örn. OSSE)
   test satışı yapıp Odoo faturasında doğru oranın göründüğünü, toplamın POS ile birebir eştiğini
   doğrulayın.

## Onay bekleyen ayrı konu — bu spesifik satışın (S00061 / SFAT/2026/00043) düzeltilmesi

Bu fatura zaten Odoo'da "Onaylanmış" ve kısmen ödenmiş durumda, yanlış (%0) KDV ile. Kod
düzeltmesinden SONRA bu spesifik faturayı nasıl düzelteceğinizi (muhtemelen iade/fark faturası ya da
hâlâ taslak/onaylanmamışsa doğrudan düzeltme — hangisi uygulanabilirse) bana önce açıklayın, onay
sonrası uygulayın. Canlı/gerçek bir mali kayıt, dikkatli olun.

## Ayrı konu — e-Fatura hâlâ BEKLIYOR (bu talimatın kapsamı dışında, ayrıca bakılacak)

Bu satışın e-Faturası "Durumu Yenile" ile hâlâ BEKLIYOR gösteriyor. `FaturaKuyruk` tablosunda bu
`satisId` için gerçek `hata` mesajını çekip raporlayın — kök nedeni netleşmeden yorum yapmayalım.

## Rapor formatı

Kod değişikliği + iki farklı KDV oranlı test satışının Odoo ekran görüntüsü (doğru oran + doğru
toplam). S00061 düzeltme önerinizi ayrı, kısa bir paragrafta belirtin — uygulamadan önce onay
bekleyin. e-Fatura BEKLIYOR için gerçek hata mesajını ayrıca raporlayın.
