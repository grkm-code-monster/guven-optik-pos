# Ürün Girişi tamamlandı ama stokta görünmüyor (teşhis)

## Durum

Görkem, OSSE OPTİK ÇERÇEVE için Ana Depo'ya "Ürün Girişi" akışını (Depo Yönetimi → Ürün Girişi,
5 adım) tamamladı. Ekranda görünüşe göre işlem bitti ama **Depo Yönetimi → Stok Durumu** sekmesinde
bu ürün/lot görünmüyor. Sadece teşhis edin, önce kesin nedeni bulun.

## Yapılacak

1. Backend loglarında (`[urun-giris] N satır, M lot gönderildi...`) bugüne ait, ANADEPO/sirketId=NG
   olan en son `urun-giris` çağrısını bulun. `girişNo`'yu ve tam response'u (`sonuclar` objesi —
   özellikle `picking.state`, `stokGirisiBasarili`, `hatalar` alanları) raporlayın.
2. `admin.controller.ts`'teki `/urun-giris` handler'ını (satır ~2626'dan itibaren) uçtan uca okuyun:
   PO → stock.picking oluşturma → `button_validate`/`action_confirm` gibi validate adımı gerçekten
   çağrılıyor mu, çağrılıyorsa başarılı mı (try/catch içinde sessizce yutulan bir hata var mı)?
   `stokGirisiBasarili` hangi koşulda `true` dönüyor, bizim vakada gerçekten `true` mu dönmüş?
3. Odoo'dan doğrudan kontrol edin: bu işlemde oluşan `stock.picking` kaydının `state`'i ne
   (`draft`/`confirmed`/`assigned`/`done`)? `done` değilse, neden validate olmamış (rezervasyon
   eksikliği, hata mesajı var mı)?
4. Oluşan lot(lar) için `stock.quant` gerçekten ANADEPO lokasyonunda (Branch.odooLocationId
   karşılığı) pozitif miktar gösteriyor mu?
5. **Ayrıca kontrol edin:** "Depo Yönetimi → Stok Durumu" sekmesinin kullandığı backend ucu
   (muhtemelen `/admin/stok-urun` veya `/admin/lokasyon-stok`) tam olarak hangi Odoo location
   id'sini/hangi filtreyi kullanıyor — `urun-giris`'in yazdığı lokasyonla birebir aynı mı? Farklıysa
   (örn. biri Branch.odooLocationId, diğeri LOKASYON_ID_MAP'ten farklı bir id kullanıyorsa) bu tam
   olarak sorunun kaynağı olur.

## Teşhis raporu incelendi — ONAY (Görkem + Claude kod doğrulaması sonrası)

Rapor doğrulandı (satır 2988-2990 dahil kod üzerinden kontrol edildi). Kök neden: FATURASIZ akışı
tedarikçisiz olduğunda PO/picking hiç oluşturulmuyor, sadece lot yaratılıyor; `success` hesaplaması
bunu "başarılı" gibi gösteriyor; ayrıca `company_id` yazılmıyor.

**Onaylanan düzeltmeler (4'ü de, sırayla):**
1. FATURASIZ akışında da gerçek stok hareketi yapın — tedarikçisiz bir incoming picking (ya da
   uygun bir inventory adjustment) oluşturup validate edin, `stock.quant` gerçekten yazılsın.
2. FATURASIZ'ta şirket seçimini zorunlu kılın, lota doğru `company_id` yazılsın (NG=2 gibi).
3. Frontend: `stokGirisiBasarili === false` iken "tamamlandı" göstermeyin — "lot oluşturuldu, stok
   henüz işlenmedi" gibi net bir uyarı gösterin.
4. Ürün Giriş Tipi ekranındaki "Faturasız Giriş — Sadece stoka işlenir" açıklamasını gerçek
   davranışla uyumlu hale getirin (düzeltme sonrası zaten doğru olacak, sadece teyit edin).

**Lot #105 (GRS-2026-07-9291) kararı:** Silinmeyecek. 1. madde uygulandıktan sonra, bu lot'u
mükerrer PO/picking oluşturmadan, doğru `company_id` ile ANADEPO (lokasyon 61) stoğuna işleyecek
düzeltilmiş/manuel bir akışla tamamlayın. Nasıl yapacağınızı (hangi Odoo işlemiyle) kısaca açıklayıp
uygulamadan önce bana bir cümleyle bildirin — bu gerçek/canlı veri, mükerrer kayıt riskine karşı
dikkatli olun.

## Lot #105 — B planı onayı (şirket kilidi nedeniyle)

Odoo `company_id` değişimini reddetti (çoklu şirket kuralı). Onaylanan B planı: lot #105'e
dokunmadan aynı seri no (`GRS-2026-07-9291-S01-001`) ile **NG (company_id=2) altında yeni bir lot
(#106 veya ne olursa)** oluşturup retrofix'i onunla tamamlayın, stok ANADEPO (61)'e yazılsın.

**Ek şart:** Yeni lot doğrulanıp (`state=done`, quant pozitif) sonrası, eski **lot #105'i silmeyin,
`active=False` yaparak arşivleyin** — aynı isimde iki aktif lot kalmasın (UTS/lot arama kodumuz
isimle eşleştirme yapıyor, karışıklık riski var). Audit izi için kayıt dursun, sadece pasif olsun.

Onaylandı, uygulayabilirsiniz.

## Rapor formatı

Hangi adımda tıkandığını (picking validate olmadı mı, stock.quant boş mu, yoksa Stok Durumu ekranı
yanlış lokasyona mı bakıyor) net kanıtla (log, Odoo sorgu sonucu) raporlayın. Kod değişikliği
önermeden önce bana kesin teşhisi getirin, birlikte karar verelim — bu canlı/gerçek bir işlem,
dikkatli olun, tekrar deneyip mükerrer PO/picking oluşturmayın.
