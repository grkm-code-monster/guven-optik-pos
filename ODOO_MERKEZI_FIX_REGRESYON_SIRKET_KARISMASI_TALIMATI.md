# ACİL — merkezi `buildOdooCompanyContext()` düzeltmesi aynı-şirket transferini kırdı

## Durum

`ODOO_MERKEZI_COMPANY_CONTEXT_VERGI_ERISIMI_TALIMATI.md` ile `buildOdooCompanyContext()`'i
`allowed_company_ids: [1, forceCompanyId]` yaptık (account.tax "oku" hatasını çözmek için). Bu,
account.tax'ı düzeltti ama YENİ, daha ciddi bir regresyon yarattı: en basit senaryo olan **aynı
şirket içi transfer** (ANA DEPO→GVN2, ikisi de NG) artık şu hatayla başarısız oluyor:

```
XML-RPC fault: Uyumsuz şirket kayıtları:
- 'Source Location' (NG/Stok/ANA-DEPO) 'GÜVEN OPTİK 1959' şirketine ait ama... başka bir şirkete ait
- 'Destination Location' (NG/Stok/GVN2) ... aynı sorun
- 'Transfer' (picking_id: NG/INT2/00011) ... aynı sorun
- 'Operation Type' (NG: İç Transferler) ... aynı sorun
```

Yani oluşturulan `stock.picking`/`stock.move` kaydı, gerçekte NG'ye (company_id=2) ait
lokasyonlar/operation type kullanılmasına rağmen kaydın kendisi yanlışlıkla 1 numaralı şirkete
("GÜVEN OPTİK 1959") atanmış. Bu, `allowed_company_ids` listesine 1'i eklememizin yan etkisi —
Odoo bazı create() akışlarında yeni kaydın şirketini `allowed_company_ids`'in ilk elemanından/oturum
varsayılanından çıkarıyor, artık listede 1 de olduğu için karışıyor.

## İstenen — düzeltmeyi daraltın, global yapmayın

1. `buildOdooCompanyContext()`'i **eski haline döndürün** (sadece `[forceCompanyId]`, chart
   şirketini eklemeyin) — bu, TÜM `execute()` çağrılarının varsayılanı, global genişletme riskli
   olduğu kanıtlandı.
2. Chart şirketine (1) erişim gerektiren SADECE şu spesifik noktalarda, o çağrıya özel context
   genişletmesi yapın (`finalKwargs.context` üzerinde noktasal override, `readProductSaleTaxRate`'te
   zaten yaptığımız gibi):
   - `odoo-tax.util.ts`, `resolveOdooTaxId()` — account.tax okuma/oluşturma (zaten kısmen düzeltilmiş
     olabilir, kontrol edin, artık her şirketin kendi vergisi olduğu için bu ihtiyaç azalmış olabilir).
   - `sirketler-arasi-transfer.service.ts` — `account.move` create/`action_post` çağrıları, SADECE
     vergi satırı içeren işlemler için `allowed_company_ids: [1, kaynakSirketId]` (veya ilgili
     şirket) context'ini o ÇAĞRIYA özel ekleyin, genel `execute()` varsayılanına değil.
   - Diğer `execute()` çağrıları (stock.picking, stock.move, product.product, stock.quant, vb.)
     SADECE kendi şirketiyle (`[forceCompanyId]`) çalışmaya devam etsin.
3. Bu değişiklikten sonra HEM aynı-şirket (ANA DEPO→GVN2) HEM şirketler-arası (ANA DEPO→GVN3/GVN1)
   transferlerini test edin — ikisi de sorunsuz çalışmalı, biri diğerini bozmamalı.

## Test

1. ANA DEPO → GVN2 (aynı şirket) transferi — stok picking'i doğru şirkette (NG) oluşup
   tamamlanmalı, "Uyumsuz şirket kayıtları" hatası çıkmamalı.
2. ANA DEPO → GVN3 ve ANA DEPO → GVN1 (şirketler arası) — fatura hâlâ KDV'li `posted` olmalı,
   account.tax "oku" hatası geri gelmemeli.
3. Bir POS satışı ve bir stok sorgulama işlemini de test edip regresyon olmadığını doğrulayın.

## Rapor formatı

Değişen dosyalar (hangi noktasal context nerede) + üç senaryonun (aynı şirket, iki farklı şirketler
arası) test sonucu, hepsi aynı anda çalışır durumda olmalı.
