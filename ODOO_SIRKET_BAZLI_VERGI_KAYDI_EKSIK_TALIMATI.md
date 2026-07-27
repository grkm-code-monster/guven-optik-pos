# Şirketler arası transfer faturası — NG/ADESE'nin kendi vergi kaydı yok, chart şirketinin vergisi kullanılamıyor

## Durum

Merkezi `allowed_company_ids` düzeltmesi sayesinde "account.tax oku" hatası kapandı
(`ODOO_MERKEZI_COMPANY_CONTEXT_VERGI_ERISIMI_TALIMATI.md` — kapalı). Ama şimdi ANA DEPO→GVN3
(NG→ADESE) transferinde `account.move`'u `action_post` ederken YENİ bir hata çıkıyor: "Uyumsuz
şirket kayıtları: 'NG' şirketine ve 'Taxes' (tax_ids: '20%') başka bir şirkete aittir."

Görkem'in kararı: bu faturalar gerçekten KDV'li kesilmeli (transfer ekranındaki "KDV uygulanır"
uyarısı boşuna olmasın) — vergisiz post etme kısayoluna gitmeyelim, kökten düzeltelim.

## Kök neden (kodda doğrulandı)

`backend/src/modules/odoo/odoo-tax.util.ts`, `resolveOdooTaxId()` (satır 63-99):

```ts
// Önce istenen şirket, sonra chart şirketi (1)
const companies = Array.from(new Set([opts.companyId, ODOO_TAX_CHART_COMPANY_ID]));
for (const cid of companies) {
  const rows = await execute('account.tax', 'search_read', [[
    ..., ['company_id', '=', cid], ...
  ]], ..., cid);
  if (rows[0]?.id) return rows[0].id;   // NG'de (company_id=2) %20 satış vergisi YOK → chart'a (1) düşüyor
}
// Oluştur — chart şirketinde (tax group orada)
const cid = ODOO_TAX_CHART_COMPANY_ID;   // ← YENİ vergi kaydı da HEP chart şirketinde (1) oluşturuluyor
```

NG (company_id=2) ve muhtemelen ADESE/POTENTIAL'ın kendi `account.tax` kayıtları yok — fonksiyon
bulamayınca chart şirketinin (1) vergisine düşüyor, "oluştur" dalı da yeni kaydı HER ZAMAN chart
şirketinde açıyor. Sonuç: `resolveSaleTaxIdExcluded(2, 20)` her zaman company_id=1'e ait bir tax_id
döndürüyor, bu da NG'nin (company_id=2) faturasına yazılamıyor (Odoo şirketler arası kayıt
karışmasını engelliyor).

## İstenen

1. `resolveOdooTaxId()`'in "oluştur" dalını (satır ~101-102 ve devamı) düzeltin: yeni vergi kaydını
   HER ZAMAN chart şirketinde değil, **istenen `opts.companyId`'de** oluşturun (chart şirketindeki
   mevcut kaydı şablon/referans olarak kullanabilirsiniz — isim, oran, hesap eşlemeleri vb. oradan
   kopyalanabilir, ama yeni kayıt `company_id: opts.companyId` ile açılmalı).
2. Bunu yaptıktan sonra, NG ve ADESE (ve POTENTIAL, ilgiliyse) için eksik olan %20 satış vergisi
   kayıtlarını bir kerelik bir script ile (veya ilk gerçek kullanımda otomatik oluşturma yoluyla)
   gerçekten oluşturun — mevcut chart vergisinin (hesap eşlemeleri, vergi grubu vb.) doğru şekilde
   kopyalandığından emin olun, rastgele/eksik konfigürasyonlu bir vergi kaydı yaratmayın.
3. `resolvePurchaseTaxId()` de aynı `resolveOdooTaxId()`'i kullanıyor — alım vergisi tarafında da
   aynı sorunun olup olmadığını kontrol edin, aynıysa aynı düzeltme otomatik kapsayacaktır.
4. Bu değişiklikten sonra ANA DEPO→GVN3 ve ANA DEPO→GVN1 transferlerini tekrar deneyip faturaların
   artık gerçek bir KDV satırıyla (`tax_ids` dolu, doğru şirkete ait) `posted` durumuna geçtiğini
   doğrulayın.
5. Var olan, vergisiz post edilmiş eski NG faturalarına (ör. `INV/2026/00018`) DOKUNMAYIN — bu
   düzeltme yalnızca yeni/gelecek faturaları etkilesin, geçmişi değiştirmeyin.

## Test

1. NG ve ADESE'de artık kendi company_id'lerine ait %20 satış vergisi kaydı olduğunu (Odoo'da veya
   script çıktısıyla) gösterin.
2. ANA DEPO→GVN3 ve ANA DEPO→GVN1 transferlerini tekrar deneyip faturaların KDV satırıyla birlikte
   `posted` olduğunu, KDV tutarının doğru hesaplandığını (₺ tutar + %20) gösterin.
3. Eski faturaların (vergisiz post edilmiş olanlar) değişmediğini teyit edin.

## Rapor formatı

Değişen dosyalar + yeni oluşturulan vergi kayıtlarının listesi (şirket, oran, id) + iki transfer
testinin sonucu (fatura no + KDV tutarı).
