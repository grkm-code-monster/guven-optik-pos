# account.tax "oku" hatası — kök neden merkezi `buildOdooCompanyContext()`'te, tek fonksiyonda değil

## Durum

Daha önce POS satış akışında (`readProductSaleTaxRate`) aynı hatayı ("NG Servis (id=7) doesn't
have 'oku' access to: Vergi (account.tax)") görüp o fonksiyona özel bir düzeltme yapmıştık
(`allowed_company_ids: [1, activeCompany]`). Şimdi Görkem ANA DEPO → GVN3 (şirketler arası)
transferinde **aynı hatayı, tamamen farklı bir kod yolunda** aldı — bu, POS'un ilgili fonksiyonuna
hiç uğramayan bir akış (`sirketler-arasi-transfer.service.ts`, `account.move` oluşturup
`action_post` ile onaylıyor).

## Kök neden (kodda doğrulandı — sistemik)

`backend/src/modules/odoo/odoo.service.ts`:

```ts
export function buildOdooCompanyContext(forceCompanyId: number) {
  return {
    allowed_company_ids: [forceCompanyId],   // sadece TEK şirket, chart şirketi (1) hiç yok
    company_id: forceCompanyId,
  };
}
```

Bu fonksiyon, `execute()`'un (satır 64-89) `companyId` parametresiyle çağrılan **her** XML-RPC
isteğinde varsayılan context'i oluşturuyor — yani backend genelinde kullanılan merkezi mekanizma.
Vergiler (account.tax) 1 numaralı "chart" şirketinde tanımlı; `ir.rule` "Tax multi-company" kuralı
(`company_id parent_of company_ids`) bu chart kaydına erişim için oturumun `allowed_company_ids`
listesinde 1'in de bulunmasını şart koşuyor. Şu anki merkezi fonksiyon bunu hiçbir zaman eklemiyor.

Daha önce sadece `odoo-tax.util.ts`'teki `readProductSaleTaxRate`'i noktasal olarak düzelttik — bu,
sorunun bir belirtisiydi, kökü değil. Vergiyle dolaylı temas eden her yeni akış (transfer faturası,
başka bir modül, ileride yazılacak herhangi bir kod) aynı duvara çarpmaya devam edecek.

## İstenen

1. `buildOdooCompanyContext()`'i merkezi olarak düzeltin — chart şirketini (1) her zaman
   `allowed_company_ids`'e ekleyin:
   ```ts
   export function buildOdooCompanyContext(forceCompanyId: number) {
     return {
       allowed_company_ids: Array.from(new Set([1, forceCompanyId])),
       company_id: forceCompanyId,
     };
   }
   ```
   (`1` yerine varsa zaten tanımlı `ODOO_TAX_CHART_COMPANY_ID` sabitini kullanın, tutarlılık için.)
2. Bu değişikliğin `execute()` üzerinden geçen TÜM çağrıları etkileyeceğini unutmayın — bu kasıtlı
   ve istenen, ama olası yan etkileri düşünün: `allowed_company_ids`'e 1'i eklemek, bazı
   `search`/`search_read` sorgularının (varsayılan olarak `allowed_company_ids` içindeki TÜM
   şirketlerin kayıtlarını döndüren modellerde) beklenmedik şekilde 1 numaralı şirketin kayıtlarını
   da karıştırıp karıştırmadığını kontrol edin (özellikle `company_id` alanı olan ve şirkete özel
   filtrelenen modellerde — `product.product`, `stock.quant` vb. — bunlarda zaten `domain`'de açık
   `company_id` filtresi olduğu için muhtemelen sorun olmaz, ama gözden geçirin).
3. Daha önce `readProductSaleTaxRate`'e eklediğimiz noktasal `allowed_company_ids` override'ını
   kaldırmayın (zararsız, hâlâ doğru) ama artık gereksiz hale gelip gelmediğini not edin.
4. `sirketler-arasi-transfer.service.ts`'teki `account.move` create/`action_post` çağrılarının
   (satır ~494-524, ~566-595) artık bu merkezi düzeltmeyle çalıştığını doğrulayın.

## Test

1. ANA DEPO → GVN3 (NG→ADESE) transferini tekrar deneyip artık "account.tax oku" hatası
   almadığınızı, faturanın (`account.move`) gerçekten `posted` durumuna geçtiğini gösterin.
2. ANA DEPO → GVN1 (NG→ADESE) transferini de tekrar deneyip aynı şekilde başarılı olduğunu
   gösterin.
3. Merkezi değişikliğin regresyon yaratmadığını doğrulamak için birkaç farklı, vergiyle ilgisiz
   sıradan işlemi de (ör. normal bir POS satışı, stok sorgulama) test edip normal çalıştığını
   teyit edin.

## Rapor formatı

Değişen dosya (tek satırlık merkezi değişiklik) + önce/sonra iki transfer testinin sonucu +
regresyon kontrolü sonucu.
