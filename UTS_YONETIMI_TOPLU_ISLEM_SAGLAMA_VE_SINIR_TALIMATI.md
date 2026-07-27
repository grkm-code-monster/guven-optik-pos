# UTS Yönetimi — toplu alma bildir, ham kod gösterimi, ürün girişi sağlaması, kalıcı başarı listesi, 20 karakter sınırı

Görkem'in ekran görüntüsü + notlarından toplanan 5 madde. Hepsi onaylandı, uygulanabilir.

## 1) "Bekleyen Alma Bildirimleri" ekranına toplu seçim + toplu bildir

Şu an her satırda tek tek "Alma Bildir" butonu var (`bekleyenAlmaBildir(satir)`,
`UtsYonetimiPage.tsx` satır ~592), toplu seçim yok. "Bildirim Kuyruğu" sekmesinde ZATEN çalışan bir
toplu-seçim deseni var (`seciliKuyruk` state, "Tümünü gönder" / "Seçilenleri gönder (N)" butonları,
satır ~1290-1298, `POST /admin/uts/toplu-gonder`) — AYNI GÖRSEL DESENİ (checkbox sütunu, iki buton)
"Bekleyen Alma Bildirimleri" tablosuna da uygulayın.

**Önemli fark:** "Bildirim Kuyruğu"daki `toplu-gonder`, veritabanında ZATEN VAR OLAN
`UtsBildirim` kayıtlarını tekrar gönderiyor. "Bekleyen Alma Bildirimleri" ise TİTCK'ın kendi
sunucusundan CANLI gelen, henüz bizim veritabanımızda karşılığı OLMAYAN satırlar — "Alma Bildir"
her satır için YENİ bir `UtsBildirim` oluşturup hemen gönderiyor (`bekleyenAlmaBildir` →
`POST /admin/uts/bildirim-olustur`, `hemenGonder:true`). Bu yüzden AYNI `toplu-gonder`
endpoint'ini kullanamazsınız — YENİ bir backend endpoint gerekiyor:

- `POST /admin/uts/bekleyen-alma-toplu-bildir` — body: `{ subeKodu, satirlar: BekleyenAlmaSatir[] }`
  (seçilen satırların tamamı). Backend'de her satır için `bildirimOlusturVeGonder({tip:'ALMA', ...,
  hemenGonder:true})` çağırıp sonuçları (`{uno, durum, hata?}[]`) toplu dönsün — döngüyü backend'de
  yapın, frontend'den N ayrı istek atmayın.
- Frontend: `bekleyenSecili` (Set<string>, satır anahtarı olarak `uno` ya da `bid` kullanılabilir)
  state'i ekleyin, checkbox sütunu + "Tümünü Seç" / "Seçilenleri Bildir (N)" butonları ekleyin,
  sonuç mesajında kaç tanesinin başarılı/başarısız olduğunu gösterin (madde 4'teki başarı
  listesiyle tutarlı formatta).

## 2) Ham/birleşik GS1 kodunun gösterimi

Netleştirme bekledim ama onay geldi, en makul yorumla ikisini birden uygulayın (düşük maliyetli,
zarar vermez):

- **"Bekleyen Alma Bildirimleri" tablosuna** yeni bir sütun ekleyin: TİTCK'tan ayrı ayrı gelen
  `uno`+`lno`+`sno` alanlarını, Görkem'in "eşsiz numara" dediği GS1 formatında YENİDEN BİRLEŞTİRİP
  gösterin (örn. `01${uno}10${lno}21${sno}` tarzı, gerçek GS1 AI sırasına uygun) — bunun GERÇEK ham
  veri olmadığını, bizim yeniden oluşturduğumuz bir gösterim olduğunu unutmayın (TİTCK bize zaten
  ayrıştırılmış veri veriyor, ham/orijinal string bize hiç ulaşmıyor).
- **"Bildirim Oluştur" sekmesinde** (bizim GİRDİĞİMİZ barkodlar), her satırın yanında zaten
  ayrıştırdığımız `barkod`/`seriNo`/`lotNo`'nun yanına, kullanıcının orijinal yapıştırdığı HAM
  string'i de (varsa) küçük gri bir metin olarak gösterin — bu GERÇEK ham veri, karşılaştırma için
  faydalı.

## 3) "Alma Bildir" ile "Ürün Girişi" arasında sağlama/bağlantı

Şu an bu ikisi TAMAMEN BAĞLANTISIZ: `bekleyenAlmaBildir` sadece TİTCK'a bildirim gönderiyor,
Odoo/stok tarafına HİÇBİR ŞEY yazmıyor (`admin.controller.ts`'teki `/uts/bildirim-olustur`
handler'ı, `bildirimOlusturVeGonder`, hepsi sadece `prisma.utsBildirim` + TİTCK API — `execute()`
çağrısı yok). İstenen köprü:

- `UtsBildirim` (Prisma şeması) için yeni bir alan ekleyin: `urunGirisiYapildiMi: boolean`
  (varsayılan `false`) ya da `urunGirisiTarihi: DateTime?`.
- "Bekleyen Alma Bildirimleri" tablosunda her satıra (ve madde 4'teki başarı listesine) bir
  **"Depoya Ürün Girişi Yap"** butonu/linki ekleyin — tıklanınca Depo Yönetimi → Ürün Girişi
  ekranına, o satırın barkod/lot/adet bilgisi ÖNCEDEN DOLDURULMUŞ şekilde yönlendirsin (query
  param ya da paylaşılan bir state/draft mekanizmasıyla — `DepoPage.tsx`'teki mevcut taslak
  (`girisNo` draft) mantığına bakıp uygun birini seçin).
- Ürün girişi o barkod/lot için TAMAMLANDIĞINDA, ilgili `UtsBildirim` kaydında
  `urunGirisiYapildiMi=true` işaretlensin (barkod eşleşmesiyle, `/urun-giris` endpoint'inde ilgili
  `UtsBildirim` kaydı varsa güncelleyin).
- "Alma Bildir" yapılmış AMA `urunGirisiYapildiMi=false` olan (ve üzerinden belirli bir süre geçmiş,
  örn. 3 gün) kayıtları listeleyip Görkem'e "şu ürünler UTS'te kabul edildi ama depoya HENÜZ
  girilmedi" diye uyaran bir görünüm (mevcut sayaçların yanına küçük bir uyarı rozeti) ekleyin.

Bu tam otomatik bir eşleştirme değil (barkod/lot eşleşmesi manuel tetiklemeyle oluyor) ama Görkem'in
istediği "sağlama" (unutma/gözden kaçırma riskine karşı görünürlük) ihtiyacını karşılıyor.

## 4) Kalıcı "başarıyla gönderildi" listesi + doğru sayaç (KESİN BUG, düzeltin)

`GET /admin/uts/kuyruk` (`admin.controller.ts` satır ~6695) şu an SADECE
`durum: { in: ['BEKLIYOR', 'HATA'] } ` çekiyor — başarıyla gönderilenler bu sorgudan tamamen hariç.
Bu yüzden sayfadaki "Gönderildi" sayacı (`kuyrukStats`, `UtsYonetimiPage.tsx` satır ~254-258)
YAPISAL OLARAK her zaman 0 gösterecek — gerçek bir sayaç değil. Düzeltin:

- Yeni bir endpoint: `GET /admin/uts/gonderilen` — `durum: 'GONDERILDI'` olan `UtsBildirim`
  kayıtlarını (son N gün/limitli, sayfalanabilir) döndürsün.
- "Bildirim Kuyruğu" sekmesine (ya da ayrı bir alt sekmeye) bu listeyi gösteren bir tablo ekleyin:
  tarih, tip, şube, karşı taraf, kalem sayısı, barkod/lot özeti.
- Üstteki "Gönderildi" sayaç kartını bu YENİ endpoint'ten gelen GERÇEK sayıyla besleyin (mevcut,
  her zaman 0 olan `kuyrukStats.gonderildi`'yi buna bağlayın ya da değiştirin).
- Görkem'in "altta listede başarılı yazan bir not olsun" isteğini bu liste karşılar — her başarılı
  gönderim burada kalıcı olarak görünsün, ekrandan gidince kaybolmasın.

## 5) TİTCK "Lot/Batch numarası 20 karakterden fazla olamaz" — ön-kontrol eksik

Ekran görüntüsündeki "Test" kaydında görülen gerçek TİTCK hatası. Şu an sadece boşluk kontrolü var
(`isUtsSeriLotEksik`), uzunluk kontrolü YOK. Düzeltin:

- `parseGs1DataMatrix.ts` (frontend) ve `gs1-parser.util.ts` (backend) içine
  `isUtsAlanCokUzun(seriNo?, lotNo?): boolean` benzeri bir kontrol ekleyin — TİTCK dokümantasyonuna
  göre (elinizdeki hata mesajından: Lot/Batch ≤ 20 karakter; Seri/Sıra için de TİTCK'ın kendi sınırı
  varsa aynı şekilde ekleyin, bilmiyorsanız en azından Lot için 20 sınırını uygulayın).
  `validateUtsKalemlerSeriLot()` (`uts.service.ts`) ve `UtsYonetimiPage.tsx`'teki ön-gönderim
  kontrolüne (madde daha önce eklediğimiz boşluk kontrolüyle AYNI yere) bu uzunluk kontrolünü de
  ekleyin — gerçek TİTCK'a gitmeden, açık bir hata mesajıyla ("Lot/Batch 20 karakterden uzun: X")
  engelleyin.
- Ekrandaki "Test" kaydının hangi ekrandan/hangi girdiyle oluştuğunu (muhtemelen "Bildirim
  Oluştur" sekmesinde manuel yazılmış bir Lot No) bulup, o girdi noktasında da aynı anlık uyarıyı
  gösterin (madde önceki oturumdaki `parseUyari` desenine benzer şekilde).

## Test

1. Bekleyen Alma Bildirimleri'nde 2+ satır seçip toplu bildirin, ikisinin de doğru şekilde
   TİTCK'a gittiğini/durumunun güncellendiğini gösterin.
2. Hem Bekleyen Alma hem Bildirim Oluştur ekranlarında kod gösterimini ekran görüntüsüyle gösterin.
3. Bir "Alma Bildir" sonrası ilgili barkodu Ürün Girişi'ne aktarıp tamamlayın,
   `urunGirisiYapildiMi` alanının güncellendiğini ve uyarı rozetinin kalktığını gösterin.
4. Gerçek bir bildirimi başarıyla gönderip, "Gönderildi" sayısının artık 0 DEĞİL doğru sayıyı
   gösterdiğini ve yeni listede kalıcı olarak göründüğünü kanıtlayın.
5. 20 karakterden uzun bir Lot No ile göndermeyi deneyip, TİTCK'a gitmeden ÖNCE net bir hata ile
   engellendiğini gösterin.

## Rapor formatı

Her madde için yapılan değişiklikler (dosya/satır) + test 1-5 sonucu (ekran görüntüleriyle).
