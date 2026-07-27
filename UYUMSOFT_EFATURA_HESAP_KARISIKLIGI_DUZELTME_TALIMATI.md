# ACİL — e-Fatura, muhtemelen yanlış Uyumsoft hesabıyla deneniyor (bizim hatamız olabilir)

## Durum

Görkem'in kritik uyarısı: bu oturumdan ÖNCE e-Fatura düzenli çalışıyordu (sadece eksik VKN/il/ilçe/
adres gibi VERİ sorunlarında tekil faturalar hataya düşüyordu). e-İrsaliye ise hiç çalışmıyordu. Bu
oturumda ben `UYUMSOFT_WEBSERVIS_SIFRE_GUNCELLEME_TALIMATI.md` talimatıyla NG ve ADESE için HEM
`uyumsoft_username`/`uyumsoft_password` (e-Fatura + genel istemci) HEM
`uyumsoft_eirsaliye_username`/`uyumsoft_eirsaliye_password` (e-İrsaliye'ye özel) kayıtlarını AYNI
yeni değere (`NejlaGumuskesen_WebServis2` / ADESE için `AdeseOptik_WebServis7`) güncellettim.

O talimatı uygularken Cursor'un raporunda şu satır vardı: **"e-Fatura anahtarları
`NejlaGumuskesen_WebServis` (sonunda '2' yok) kullanıyordu; e-İrsaliye anahtarları zaten doğruydu."**
Bu, DEĞİŞİKLİKTEN ÖNCE sistemde ZATEN İKİ AYRI, kasıtlı olarak farklı Uyumsoft web servis hesabı
olduğunu gösteriyor: `NejlaGumuskesen_WebServis` (muhtemelen uzun süredir kullanılan, e-Fatura'nın
çalıştığı hesap) ve `NejlaGumuskesen_WebServis2` (muhtemelen sonradan SADECE e-İrsaliye için açılmış,
farklı yetki kapsamına sahip bir hesap).

**Hipotez:** Ben iki hesabı tek hesapmış gibi ele alıp e-Fatura'nın kullandığı ÇALIŞAN hesabı
(`WebServis`), sadece e-İrsaliye yetkisi olan yeni hesapla (`WebServis2`) ezdirmiş olabilirim. Şu an
e-Fatura'da aldığımız "Firmanızın e-Arşiv gönderme yetkisi yok" hatası, bu hipotezle tam örtüşüyor —
`WebServis2` hesabının e-Arşiv/e-Fatura yetkisi olmayabilir, sadece e-İrsaliye için açılmış olabilir.

## İstenen — ÖNCE geri alma denemesi, kod değişikliği DEĞİL

1. `SirketAyar` tablosunda `sirketId = 'ng'`, `anahtar = 'uyumsoft_username'` ve
   `'uyumsoft_password'` kayıtlarını (SADECE bu ikisini — `uyumsoft_eirsaliye_username`/
   `uyumsoft_eirsaliye_password`'a DOKUNMAYIN, onlar `WebServis2` olarak kalsın, e-İrsaliye için
   doğru) eski değerlere geri döndürün:
   - `uyumsoft_username` = `NejlaGumuskesen_WebServis`
   - `uyumsoft_password` = `36uOz3Jn` (bu, oturum başında `.env`'de bulduğumuz orijinal değerdi —
     Görkem'in dediğine göre o dönemde fatura çalışıyordu, bu şifrenin hâlâ geçerli olduğunu
     varsayıyoruz ama garanti değil, test adımı bunu doğrulayacak)
2. `backend/.env`'deki `UYUMSOFT_USERNAME`/`UYUMSOFT_PASSWORD` fallback değerlerini de aynı şekilde
   `NejlaGumuskesen_WebServis` / `36uOz3Jn`'e geri döndürün (tutarlılık için).
3. ADESE için AYNI durumun geçerli olup olmadığını kontrol edin — ADESE'nin daha önce e-Fatura'da
   gerçekten çalışan, farklı bir web servis kullanıcısı var mıydı (Görkem'e sorup teyit edin,
   ADESE'de durum NG'den farklı olabilir, ADESE'nin e-Fatura'sı bu oturumdan önce hiç
   kullanılmamış/test edilmemiş olabilir).
4. Backend'i yeniden başlatın (SOAP client cache temizlensin).

## Test

1. `testConnection('ng')` çalıştırıp `NejlaGumuskesen_WebServis` ile hâlâ bağlantı kurulabildiğini
   doğrulayın (InvalidSecurity DÖNERSE, bu şifre artık geçersiz demektir — bu durumda hipotez kısmen
   yanlış çıkar, Görkem'in bu spesifik hesabın GÜNCEL şifresini Uyumsoft'tan alması gerekir, panikle
   başka bir şeye dokunmayın, bana haber verin).
2. InvalidSecurity YOKSA, gerçek bir satış üzerinden e-Fatura göndermeyi deneyin — "e-Arşiv gönderme
   yetkisi yok" hatası ARTIK ÇIKMIYORSA, hipotez doğrulanmış olur: sorun tamamen bizim credential
   karıştırmamızdandı, Uyumsoft'ta hiçbir şeyin açılmasına gerek yoktu.
3. Hâlâ aynı "e-Arşiv yetkisi yok" hatası çıkarsa, bu iki hesabın da e-Arşiv yetkisi olmadığı ya da
   başka bir şey olduğu anlamına gelir — bu durumda gerçekten Uyumsoft'a sormamız gerekir, ama en
   azından bu ihtimali elemiş oluruz.

## ÖNEMLİ

Bu talimatı uygularken e-İrsaliye'ye ait `uyumsoft_eirsaliye_*` kayıtlarına KESİNLİKLE dokunmayın —
onlar zaten doğru (`WebServis2`), 1195 sorunu tamamen ayrı ve farklı bir konu (belge format sorunu),
bu talimatla karıştırılmasın.

## Rapor formatı

Değişen DB kayıtları (eski/yeni değer) + testConnection sonucu + gerçek e-Fatura gönderim testinin
sonucu (hata var mı yok mu, varsa tam metni).
