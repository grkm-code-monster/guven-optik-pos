# Rol üstü ek yetki sistemi — kişiye özel ekran/bölüm erişimi

## Amaç

Şu an yetkilendirme tamamen sabit 7 role dayalı (`SALES_STAFF, STORE_MANAGER, WAREHOUSE_MANAGER,
REGIONAL_MANAGER, ACCOUNTANT, ADMIN, WORKSHOP_STAFF`), her ekran/uç backend'de
`authorize(Role.X, Role.Y)` ile sabit kodlanmış (`admin.controller.ts` satır ~400-430'daki
path-bazlı catch-all dahil). Görkem'in ihtiyacı: bir kişi temel rolünün (örn. SALES_STAFF) ÜSTÜNE,
belirli ekran/bölümlere (örn. Depo Yönetimi → Sipariş) ek erişim kazanabilsin. Karar: **ekran/bölüm
bazında** granülerlik, **İK & Prim → Personeller** ekranından yönetilecek.

## Mevcut mimari (doğrulandı, referans alın)

- `backend/src/middleware/authorize.ts` — basit rol listesi kontrolü.
- `backend/src/modules/admin/admin.controller.ts` satır ~400-430 — path-bazlı fallback middleware,
  eşleşmeyen her rota `authorize(Role.ADMIN)`'e düşüyor (**varsayılan kapalı**, güvenlik açığı yok,
  sadece esnek değil).
- `packages/web/src/pages/admin/AdminLayout.tsx` satır ~86-106 — sidebar menüsü sadece
  `STORE_MANAGER` (Stok Yönetimi'ni gizler) ve `ADMIN` (Rapor Matrisi ekler) için filtreleniyor,
  diğer roller tam menüyü görüyor (tıklarsa backend zaten 403 döner — veri sızıntısı yok, ama
  kafa karıştırıcı, bu iş kapsamında düzelecek).
- `backend/src/modules/admin/personel-sube-sync.ts` — Personel↔User senkron deseni zaten var, ek
  yetki senkronu için aynı desen kullanılacak.

## Adım 1 — Şema

`Personel` modeline `ekYetkiler String[] @default([])` ekleyin (permission key listesi, örn.
`["DEPO_SIPARIS"]`). Aynı alanı `User` modeline de ekleyin (`ekYetkiler String[] @default([])`) —
çünkü `req.user` (auth middleware'in doldurduğu, JWT'den gelen) üzerinden çalışma zamanında
erişilebilir olması lazım, `Personel` sadece yönetim/kaynak ekranı.

Yetki anahtarlarının kanonik listesini `AdminLayout.tsx`'teki `MENU` dizisindeki bölümlerden
türetin (`TANIMLAMALAR, KAMPANYALAR, DEPO_YONETIMI, STOK_YONETIMI, ETIKET_TASARIMCI,
URUN_YAPILANDIRMA, GARANTI_IADE, UTS_YONETIMI, MUHASEBE, FINANS, IK_PRIM, PATRON, RAPOR_MATRIS`)
**artı** bir özel durum: Görkem'in verdiği örnek ("Depo Yönetimi → Sipariş kısmı") `DepoPage.tsx`
içindeki bir **sekme**, tüm Depo Yönetimi ekranı değil. Bu yüzden `DEPO_YONETIMI` genel yetkisine
ek olarak, en azından `DEPO_SIPARIS` gibi sekme-seviyesinde ayrı bir anahtar da tanımlayın —
`DepoPage.tsx`'teki `TABS` sabitini inceleyip hangi sekmelerin ayrı yetki gerektirebileceğini
(Sipariş, Lot Transfer, Şube Transferleri vb.) bana kısa bir listeyle raporlayın, ben onaylayayım,
sonra ekleyin.

Bu adımda kod yazmadan önce **anahtar listesini + hangi route/sekmenin hangi anahtara bağlanacağını
bana raporlayın, onay bekleyin** (bu, tüm ekranların erişim haritası — yanlış eşleşme ciddi
güvenlik hatası olur).

## Adım 2 — ONAY sonrası: backend enforcement

- `authorize()` middleware'ini genişletin (ya da yanına yeni bir `authorizeOrYetki(yetkiAnahtari,
  ...roller)` ekleyin): `req.user.role` listede DEĞİLSE, `req.user.ekYetkiler` içinde ilgili anahtar
  var mı diye de kontrol etsin, varsa geçirsin.
- `admin.controller.ts` satır ~400-430'daki path-bazlı fallback'i, Adım 1'de onaylanan
  route↔anahtar haritasına göre güncelleyin.
- `req.user` içine `ekYetkiler`'in JWT'den mi yoksa her istekte DB'den mi okunacağına karar verin
  (öneri: JWT'ye gömün, login'de üretilsin — DB'den her istekte okumak performans kaybı yaratır;
  ama yetki değiştiğinde kullanıcının yeniden login olması gerekir, bunu not olarak bana bildirin).

Bu adımı bitirince **bana rapor getirin, ben kod üzerinden doğrulayacağım** (auth/yetki kodu
olduğu için özellikle dikkatli kontrol edeceğim) — Adım 3'e onaysız geçmeyin.

## Adım 3 — Onay sonrası: frontend

- `AdminLayout.tsx`'teki menü filtrelemesini, artık sadece rol değil rol+ekYetkiler'e göre
  yapacak şekilde genelleştirin (STORE_MANAGER/ADMIN özel durumlarını bozmadan).
- `DepoPage.tsx`'te ilgili sekme(ler) için, kullanıcının genel Depo Yönetimi yetkisi olmasa bile
  ek yetkisi varsa o sekmenin görünüp işlem yapılabildiğini sağlayın (diğer sekmeler gizli/disabled
  kalsın).

## Adım 4 — İK & Prim → Personeller UI

- Personel düzenleme formunda, rol seçiminin yanına **"Ek Yetkiler"** çoklu-seçim alanı ekleyin
  (Adım 1'deki kanonik liste). Kaydedince hem `Personel.ekYetkiler` hem bağlıysa `User.ekYetkiler`
  güncellensin (personel-sube-sync.ts'teki senkron deseniyle aynı mantık).
- Kişinin JWT'sinin güncel olmayabileceğini (Adım 2'deki nota göre) kullanıcıya küçük bir notla
  belirtin: "Yeni yetki bir sonraki girişte aktif olur."

## Kabul kriteri

- Adım 1'in route↔anahtar haritası onaylanmadan hiçbir kod yazılmamış olmalı.
- Adım 2 sonrası: SALES_STAFF rolünde ama `DEPO_SIPARIS` ek yetkisi olan test kullanıcısı, Depo
  Yönetimi → Sipariş sekmesine gerçekten erişebiliyor, başka hiçbir yeni ekrana erişemiyor
  (örn. Muhasebe/Finans/Patron hâlâ 403).
- Ek yetkisi olmayan aynı roldeki başka kullanıcı hâlâ erişemiyor (negatif test).
- AdminLayout menüsü artık kişiye göre doğru filtreleniyor, gereksiz 403'e yol açan görünür ama
  erişilemez menü öğeleri kalmadı.

Adım 2 bitince (backend) ayrı, Adım 3-4 bitince (frontend+UI) ayrı rapor isterim — auth kodu olduğu
için iki aşamalı kontrol edeceğim.

---

## Adım 1 raporuna ONAY (Görkem + Claude inceleme sonrası)

Cursor'ın Adım 1 raporundaki Bölüm F'deki 5 karar onaylandı:

1. Depo sekme anahtarları — 7 ayrı (`DEPO_STOK, DEPO_TRANSFER, DEPO_SAYIM, DEPO_ALIM_IADE,
   DEPO_URUN_GIRIS, DEPO_EXCEL_ENVANTER, DEPO_SIPARIS`) + `DEPO_YONETIMI` şemsiye. Onaylandı.
2. Transfer alt sekmeleri v1'de bölünmesin, tek `DEPO_TRANSFER` (Lot+Şube birlikte). Onaylandı.
   (v2'de ayrı anahtar ihtiyacı çıkarsa ayrıca ele alırız.)
3. Tanımlamalar/Stok Yönetimi/Muhasebe iç sekmeleri v1'de bölünmesin. Onaylandı.
4. Admin girişi `ekYetkiler.length > 0` olan tüm kullanıcılara (sadece SALES_STAFF değil, hangi
   role olursa olsun ek yetkisi varsa) açılsın. Onaylandı.
5. `ekYetkiler` JWT'ye gömülsün, değişiklikte yeniden login gereksin. Onaylandı.

Ayrıca: `GARANTi_IADE` yazım hatasını `GARANTI_IADE` olarak düzeltin (kendiniz de belirtmiştiniz).

**Adım 3 için önemli hatırlatma:** `AdminLayout.tsx`'in şu anki menü mantığı, STORE_MANAGER ve
ADMIN dışındaki roller için menüyü hiç filtrelemiyor (tam `MENU` gösteriyor, sadece backend 403
veriyor). Ek yetki sistemi devreye girince bu davranış SALES_STAFF/ACCOUNTANT/WORKSHOP_STAFF/
WAREHOUSE_MANAGER gibi roller için **değişmeli**: ek yetkisi olmayan biri admin paneline hiç
giremeyecek zaten (Adım 4/madde-4), ama ek yetkisi olan biri SADECE `ekYetkiler`'ine karşılık gelen
menü öğelerini görmeli — eski "filtrelenmemişse tam menü göster" davranışı ek-yetkili kullanıcılar
için tekrar ortaya çıkmasın, whitelist mantığıyla (sadece izin verilenler görünür) kurun.

**Adım 2'ye geçebilirsiniz.**

---

## Adım 2 raporu incelendi — kod doğrulandı, ONAY

`ek-yetki.ts`, `authorizeOrYetki`, catch-all entegrasyonu, JWT/login, `AdminLoginPage.tsx` genişletmesi
ve `test-ek-yetki-adim2.ts` kod üzerinden tek tek doğrulandı, hepsi rapor edildiği gibi çalışıyor.

**Karar — PATRON ve RAPOR_MATRIS:** Bu ikisi ek yetkiyle genişletilebilir OLMASIN.
`PATRON` sadece mevcut Patron rolü (REGIONAL_MANAGER) + ADMIN'e kapalı kalsın; `RAPOR_MATRIS`
sadece ADMIN'e kapalı kalsın — tıpkı şu an `report.controller.ts`'deki
`authorize(Role.ADMIN, Role.REGIONAL_MANAGER)` / `authorize(Role.ADMIN)` çağrılarının zaten yaptığı
gibi (bu iki rota grubu ek yetki sistemine hiç bağlanmayacak, mevcut hâliyle kalsın, değiştirmeyin).

Bunun için: `EK_YETKI` kanonik listesinden `PATRON` ve `RAPOR_MATRIS` anahtarlarını **çıkarın** (ya
da en azından Adım 4'teki İK & Prim "Ek Yetkiler" seçim listesinden bu ikisini hariç tutun) —
kullanıcıya seçilebilir ama işlevsiz/yanıltıcı bir seçenek sunmayalım.

**Adım 3-4'e geçebilirsiniz.**
