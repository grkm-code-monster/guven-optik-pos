# Transfer e-Faturası — alıcı adres bug'ı + fatura serisi mimarisi + e-İrsaliye ayrı hesap

## 0) Öncelik sırası

Madde 1 ve 2 hemen uygulanabilir. **Madde 3 (fatura serisi) Görkem Uyumsoft portalında serileri
tanımlayıp bana kod/isim verene kadar KODA ALINMAYACAK** — o gelene kadar mevcut `faturaNoUret`
davranışı (otomatik "ANA" vb. üretim) olduğu gibi kalsın, ÜZERİNE dokunmayın, sadece alt yapıyı
(madde 3'teki admin ayarı) hazırlayabilirsiniz, devreye almayın.

## 1) Alıcı taraf adres/vergi dairesi bilgisi baştan sona placeholder — ACİL

### Teşhis

`uyumsoft-efatura.service.ts` → `transferdenFaturaData()`:

```ts
aliciAdres: '-',
aliciIl: 'İZMİR',
aliciIlce: '-',
```

Bu satırlar alıcının (örn. ADESE) gerçek adresini hiç sorgulamıyor, sabit placeholder yazıyor.
Elimizdeki gerçek örnek fatura PDF'inde (ANA2026000000005) bu netçe görünüyor: "ADESE OPTİK LTD.
ŞTİ. / - / -/ İZMİR". Buna karşın `runEFatura()` (`transfer-post-actions.service.ts`) zaten
`getSupplierInfo(input.hedef.subeKodu)` çağırıp alıcının gerçek adres/il/ilçe/vergi dairesini
çekiyor (`hedefInfo`) — ama bu bilgi sadece `vkn` ve `unvan` alanları için kullanılıp geri kalanı
(`adres`, `il`, `ilce`, `vergiDairesi`) atılıyor.

Bu, Uyumsoft'ta faturanın "hataya düşmesinin" en olası nedeni — GİB şeması muhtemelen anlamsız
adres alanlarını (`-`) reddediyor.

### İstenen düzeltme

1. `transferdenFaturaData()`'ya `hedefInfo` (adres, il, ilçe, vergiDairesi) parametre olarak
   geçirin, sabit `'-'`/`'İZMİR'` değerlerini kaldırıp gerçek verilerle doldurun.
2. `runEFatura()`'da zaten elinizde olan `hedefInfo`'yu bu fonksiyona tam olarak aktarın.
3. Aynı sorunun POS satış tarafında olup olmadığını da kontrol edin (`satistenFaturaData` — orada
   müşteri gerçek/bireysel olduğu için adres zaten sabit "-" olabilir, o normal; ama şirketler arası
   transfer gibi kurumsal alıcılarda gerçek adres şart).

## 2) Satıcı tarafında "Vergi Dairesi: Konak" / il "İZMİR" hardcoded fallback

`getSupplierInfoFallback()` (`uyumsoft-efatura.service.ts`) NG/ADESE/POTENTIAL için üçünde de
`vergiDairesi: 'Konak'`, `il: 'İZMİR'` sabit yazılmış — gerçek değilse (NG'nin gerçek adresi
Milas/Muğla) bu yanlış bilgi gidiyor. `SirketAyar` tablosunda (`sirket_il`, `sirket_ilce`,
`sirket_vkn` vb. anahtarlarla) her üç şirket için GERÇEK vergi dairesi/il/ilçe bilgisinin
girilip girilmediğini kontrol edin — muhtemelen boş, bu yüzden hardcoded fallback kullanılıyor.
Boşsa admin panelindeki "Entegrasyon Ayarları" ekranından (TanimlamalarPage.tsx'te bu alanlar
zaten var) Görkem'in gerçek bilgileri girmesi gerekiyor — siz kod değişikliği yapmadan önce hangi
şirketlerde bu alanların boş olduğunu tespit edip bana raporlayın, ben Görkem'e hangi bilgiyi
gireceğini söyleyeyim.

## 3) Fatura numarası/serisi — ERTELENDİ, dokunmayın

Görkem şu an Uyumsoft tarafında hiçbir yeni tanım/değişiklik yapmak istemiyor. Bu madde tamamen
duruyor — mevcut `faturaNoUret` davranışı (otomatik üretim) olduğu gibi kalsın, alt yapı bile
hazırlamayın. Görkem ne zaman hazır olursa o zaman gündeme gelecek. (Bilinen risk: bu haliyle
bazı transfer faturaları Uyumsoft/GİB tarafında seri tanımsız olduğu için reddedilebilir — bu kabul
edilmiş bir risk, madde 1 düzeltmesi zaten en büyük ret sebebini kapatıyor.)

## 3-eski) Fatura numarası/serisi — mimari değişikliği (ERTELENDİ, referans için bırakıldı)

### Mevcut (YANLIŞ, kaldırılacak) davranış

`faturaNoUret(sube, siraNo)` şube kodunun ilk 3 harfini alıp kendiliğinden bir seri prefixi
uyduruyor (örn. "ANA", "GVN"...) ve arkasına yıl + 9 haneli sıra no ekliyor. **Bu yanlış** — fatura
serileri Uyumsoft/GİB tarafında önceden tanımlanması gereken kayıtlar, sistemin kendi başına
üretebileceği bir şey değil.

### Yeni model

1. Admin panelinde şirket bazlı bir **"Fatura Serileri"** ayarı ekleyin (yeni bir tablo ya da
   `SirketAyar` üzerinden `fatura_serisi_<kod>` gibi anahtarlarla) — Görkem burada Uyumsoft'ta
   tanımladığı gerçek seri kodunu (örn. ne olacaksa) ve o serinin **güncel/son kullanılan sıra
   numarasını** girebilsin.
2. `faturaNoUret`'in yerini alacak yeni fonksiyon, şube/şirkete karşılık gelen tanımlı seriyi bu
   ayardan okusun, sıra no'yu 1 artırıp kullansın ve DB'de güncellesin (aynı anda iki fatura aynı
   sıra no'yu almasın, transaction/lock kullanın).
3. Birden fazla şube aynı seriyi paylaşabilir ya da her şube kendi serisini kullanabilir — bu
   Görkem'in Uyumsoft'ta nasıl tanımladığına bağlı, sabit varsayım yapmayın, ayardan okuyun.
4. **Bu maddeyi Görkem bana gerçek seri kod(lar)ını verene kadar devreye almayın.** Alt yapıyı
   (admin ekranı + DB alanı) hazırlayabilirsiniz ama `eFaturaGonder`/`tetikleTransferEFatura`
   akışını hâlâ eski `faturaNoUret`'i kullanacak şekilde bırakın, geçiş anahtarımı (feature flag)
   ben onay verince açacağız.

## 4) e-İrsaliye için ayrı portal hesabı — kimlik bilgisi ayrımı gerekiyor

### Uyumsoft'un teyidi

Uyumsoft destek yanıtı: "Aldığınız hata, farklı bir portal hesabına ait web servis kullanıcı adı ve
şifresinin kullanılmasından kaynaklanmaktadır." NG ve ADESE'de e-İrsaliye zaten aktif ama **e-Fatura
hesabından tamamen ayrı bir portal hesabında** (NG için id 578843 — alias
`urn:mail:eirsaliyepk@gumuskesen.com`; ADESE için id 578844 — alias
`urn:mail:eirsaliyepk@adese.com.tr`). Şu anki kod (`getCredentialsForSirket` /
`uyumsoft-irsaliye.service.ts`'teki `getDespatchClient`) e-Fatura'yla AYNI kimlik bilgisini
kullanıyor — bu yüzden e-İrsaliye çağrıları yetkisiz/hatalı dönüyor.

### Karar (kesinleşti — Uyumsoft'ta HİÇBİR yeni işlem yok)

Görkem şu an Uyumsoft tarafında hiçbir değişiklik/talep yapmak istemiyor (ne hesap birleştirme ne
şube bazlı mali mühür). Bunlar tamamen ertelendi — ileride kendisi zamanı gelince tek tek ele alacak.

**Önemli netlik:** Aşağıdaki adım Uyumsoft'ta bir "değişiklik" DEĞİL — Uyumsoft'un zaten kendiliğinden
aktif ettiği ve Görkem'e mail ile bildirdiği hesapların (id 578843 NG, id 578844 ADESE) kullanıcı
adı/şifresini bizim kendi sistemimize (SirketAyar) girmek. Uyumsoft portalına hiç girilmeyecek,
hiçbir talep gönderilmeyecek — sadece bizim tarafımızda veri girişi. Bu yüzden madde 4'ün geri
kalanı **hemen** uygulanabilir:

- **NG:** e-İrsaliye otomasyonu id 578843'ün (zaten var olan, aktif) kimlik bilgileriyle çalışacak.
- **ADESE:** e-İrsaliye otomasyonu id 578844'ün (zaten var olan, aktif, tüm şubeler için merkezi)
  kimlik bilgileriyle çalışacak — şube bazlı ayrım YOK, e-Fatura'daki gibi tek merkezi hesap.
- **e-Fatura tarafı değişmiyor** — o hâlâ "ana hesap" (298853 NG, 299088 ADESE) üzerinden gidiyor,
  dokunmayın.

### İstenen düzeltme

1. `SirketAyar`'a her şirket için yeni anahtarlar ekleyin: `uyumsoft_eirsaliye_username`,
   `uyumsoft_eirsaliye_password` (gerekirse `uyumsoft_eirsaliye_gonderen_birim`).
2. `uyumsoft-irsaliye.service.ts`'de `getDespatchClient`'ın kullandığı kimlik bilgisi çözümlemesini
   ayrı bir fonksiyona alın (`getDespatchCredentialsForSirket` gibi) — önce
   `uyumsoft_eirsaliye_username/password` var mı bakın, yoksa (henüz girilmemişse) normal e-Fatura
   kimlik bilgisine düşün (geçiş kolaylığı için), ama NG/ADESE için ayrı alanlar dolduktan sonra
   onları kullansın.
3. Admin panelinde (Entegrasyon Ayarları / TanimlamalarPage.tsx) her şirket için ayrı bir
   "e-İrsaliye Kullanıcı Adı / Şifre" alanı ekleyin — Görkem'in gerçek bilgileri (elindeki 2 ayrı
   mailden) buraya gireceği yer burası olacak, siz veya ben kimlik bilgilerini kodda/chat'te
   görmeyeceğiz.
4. NG'de hesap birleştirme tamamlandığında (Görkem haber verecek) bu ayrım kaldırılıp tek kimlik
   bilgisine dönülecek — şimdilik ayrı tutun.

## Rapor formatı

Madde 1-2-4 için: yapılan değişiklik + hangi şirketlerde `sirket_il`/`sirket_ilce`/vergi dairesi
alanlarının boş olduğu tespiti + e-İrsaliye kimlik bilgisi alanlarının admin panelinde göründüğü
ekran görüntüsü. Madde 3: sadece alt yapı hazır olduğunu bildirin, devreye almayın. Görkem gerçek
e-İrsaliye kullanıcı adı/şifresini admin panelden kendisi girecek — sizden bunu istemeyeceğim,
kimlik bilgilerini bana da yazmayın.
