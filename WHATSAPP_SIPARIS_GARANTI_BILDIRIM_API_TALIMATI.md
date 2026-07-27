# WhatsApp otomatik bildirim (sipariş hazır / garanti-iade tamamlandı) — sıfırdan kurulum

## Durum

Görkem, özel sipariş "HAZIR" durumuna geçtiğinde ve garanti/iade işlemi tamamlandığında müşteriye
otomatik WhatsApp mesajı gitmesini istiyor. Şu an sistemde bu YOK — mevcut "💬 WhatsApp" butonları
(`DepoPage.tsx` satır 948, `IKPage.tsx` satır 1339) sadece `wa.me` linki açıyor, kullanıcı elle
"Gönder"e basıyor; hiçbir API/kimlik bilgisi kullanmıyor. Gerçek otomasyon için Meta'nın **WhatsApp
Business Platform (Cloud API)**'sini sıfırdan entegre etmemiz gerekiyor.

## Görkem'in ÖNCE kendisinin yapması gerekenler (Meta tarafı — kod değil)

Bunlar bizim yazamayacağımız, Görkem'in kendi Meta hesabıyla yapması gereken adımlar:

1. **Meta Business Manager** hesabı olduğundan emin olun (business.facebook.com) — yoksa oluşturun.
2. **developers.facebook.com**'da bir "App" oluşturun (tip: Business), içine **WhatsApp** ürününü
   ekleyin.
3. Bir gönderici telefon numarası kaydedin/doğrulayın. **Önemli:** Bu numara, telefonda kurulu
   normal WhatsApp Business uygulamasıyla AYNI numara olamaz — Cloud API'ye bağlanan numara o
   telefon uygulamasından çıkar (ya yeni bir numara alın ya da mevcut numarayı Cloud API'ye
   taşıyın, ikisi birden aynı numarada çalışmaz).
4. **Access Token** alın — geliştirme için geçici (24 saatlik) token yeterli, canlıya geçerken
   "System User" ile **kalıcı (permanent) token** oluşturun.
5. **Phone Number ID** ve **WhatsApp Business Account ID (WABA ID)** — bunlar App Dashboard →
   WhatsApp → API Setup ekranında görünür.
6. **Mesaj şablonları (template) oluşturup Meta onayına gönderin.** Bu KRİTİK: Meta, işletmenin
   müşteriyle 24 saatlik aktif konuşma penceresi dışında (yani müşteri size yazmamışken siz
   başlatıyorsanız — bizim senaryomuz tam olarak bu) SADECE önceden onaylanmış şablonlarla mesaj
   göndermenize izin veriyor. En az iki şablon gerekiyor:
   - "Sipariş hazır" bildirimi (ör. `siparis_hazir`: "Sayın {{1}}, {{2}} ürününüz mağazamızda hazır,
     teslim alabilirsiniz.")
   - "Garanti/iade tamamlandı" bildirimi (ör. `garanti_tamamlandi`: "Sayın {{1}}, {{2}} ürününüzün
     garanti/iade işlemi tamamlandı.")
   Şablon onayı Meta tarafında birkaç saat/gün sürebilir, bu yüzden Görkem'in bunu ERKEN başlatması
   önemli — kod tarafı hazır olsa bile şablon onaylanmadan gerçek mesaj gidemez.
7. Yukarıdaki 4 değeri (Access Token, Phone Number ID, WABA ID, onaylanmış şablon adları) bize/Cursor'a
   iletin — kod bunlarla çalışacak.

## Kod tarafı (kodda doğrulandı — mevcut altyapı)

- `Customer` modelinde (`schema.prisma` satır 87-90) `phone` alanı zaten var ve zorunlu/unique —
  müşteri telefonu her zaman mevcut, ek veri toplamaya gerek yok.
- Şu an sistemde SADECE staff'a (personele) yönelik in-app bildirim sistemi var
  (`backend/src/modules/bildirim/bildirim.service.ts` — `createBildirim`, `listBildirimler`) —
  bu tamamen farklı bir şey, müşteriye mesaj GÖNDERMİYOR, sadece admin panelindeki zil ikonuna
  düşüyor. WhatsApp entegrasyonu bununla karıştırılmamalı, tamamen ayrı, yeni bir modül olmalı.
- Uygun tetikleme noktaları (kodda doğrulandı):
  - `backend/src/modules/ozel-siparis/ozel-siparis.service.ts`, `updateOzelSiparisDurum()`
    (satır 86-138) — `yeniDurum === 'HAZIR'` olduğunda (bkz. `OZEL_SIPARIS_DURUM_SIRASI`,
    `ozel-siparis.constants.ts`) tetiklenmeli. Şu an `sendSiparisDurumBildirimi()` (satır 63-84)
    sadece personele bildirim atıyor — buraya, durum `HAZIR` olduğunda müşteriye WhatsApp gönderen
    ayrı bir çağrı eklenmeli (personel bildirimini bozmadan, ek olarak).
  - Garanti/iade tamamlanma noktası: `backend/src/modules/warranty/warranty.service.ts` — hangi
    fonksiyonun "tamamlandı" durumunu işlediğini (muhtemelen bir `updateWarrantyStatus` veya benzeri,
    bu talimatı uygularken kendiniz tespit edin) bulup aynı deseni uygulayın.

## İstenen

1. Yeni bir modül: `backend/src/modules/whatsapp/whatsapp.service.ts` — Meta Graph API'ye
   `POST https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages` çağrısı yapan
   `sendWhatsappTemplate(to: string, templateName: string, params: string[])` fonksiyonu.
2. Kimlik bilgilerini (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`)
   `.env`'e ekleyin — Uyumsoft'ta yaptığımız gibi ileride şirket bazlı ayrım gerekirse
   `SirketAyar` tablosuna taşınabilir, ama WhatsApp numarası muhtemelen mağaza/firma geneli tek
   numara olacağı için başlangıçta `.env` yeterli olabilir — Görkem'e sorup netleştirin.
3. `updateOzelSiparisDurum()`'a, `yeniDurum === 'HAZIR'` olduğunda `sendWhatsappTemplate()`'i
   `siparis.musteriTelefon` (veya ilişkili `Customer.phone`) ile çağıran bir ek adım koyun —
   `sendSiparisDurumBildirimi()`'nin hemen yanına, onu bozmadan.
4. Garanti/iade tamamlanma noktasına aynı deseni (uygun şablonla) uygulayın.
5. Gönderim başarısız olursa (numara geçersiz, şablon reddedilmiş, rate limit vb.) sessizce
   yutmayın — konsola loglayın ve mümkünse ilgili siparişe/garanti kaydına bir not düşün, ama
   ANA işlemi (durum güncellemesi) bloklamayın — fire-and-forget, e-İrsaliye post-action deseniyle
   aynı mantık.
6. Şablon isimleri/parametre sırası Meta onayından geldikten sonra kesinleşecek — kod tarafında
   şablon adını sabit yazmak yerine küçük bir config/sabitler dosyasında tutup kolayca
   değiştirilebilir yapın.

## Test

1. Meta'nın test numarası (App Dashboard'daki "Test Number") ve kendi telefonunuzla, gerçek API
   kimlik bilgileriyle bir "sipariş hazır" mesajının gerçekten WhatsApp'a düştüğünü gösterin.
2. Durum `HAZIR` dışındaki bir geçişte (ör. `URETIMDE`) YANLIŞLIKLA mesaj gitmediğini doğrulayın.
3. Geçersiz/eksik telefon numarasıyla dener­ken sistemin çökmediğini, hatanın loglandığını gösterin.

## Rapor formatı

Eklenen dosyalar + `.env` anahtarları (değerler hariç, sadece isimler) + tetikleme noktaları +
gerçek test mesajının ekran görüntüsü (WhatsApp'ta gelen mesaj).
