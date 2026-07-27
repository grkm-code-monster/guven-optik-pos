# PDKS — GVN6/GVN7/GVN8 mekan ID düzeltmesi

## Arka plan

Daha önce Patron PDKS destek ekibi GVN6/7/8 için 403 hatası aldığımızı doğrulamıştı, kendi
tarafımızdaki kod zaten doğru uçları (`/organizations/{id}/places` liste ucu) kullanıyor —
sorun muhtemelen bu üç şube için ya `Branch.pdksPlaceId` hiç girilmemiş ya da yanlış/eski bir ID
girilmiş. Eldeki eski destek dosyasına bu oturumda erişemiyorum, o yüzden canlı API'den taze veri
çekip eşleştirelim.

## Adım 1 — Patron'dan canlı mekan listesini çekin

`backend/src/modules/pdks/pdks.service.ts` içindeki `getKonumlar()` fonksiyonunu (ya da aynı
mantıkla tek seferlik bir script, `backend/scripts/` altına) çalıştırıp
`/organizations/{PDKS_ORG_ID}/places` ucundan dönen **tüm mekanları** (id + isim) raporlayın.

## Adım 2 — GVN6/GVN7/GVN8'i isimle eşleştirin

Dönen liste içinde GVN6, GVN7, GVN8'e karşılık gelen mekanları (isim/adres benzerliğiyle) bulun.
Emin olamadığınız eşleşme varsa (isim net değilse) bana sorun, tahmin etmeyin.

## Adım 3 — Mevcut kayıtla karşılaştırın

Şu an DB'de bu 3 şube için `Branch.pdksPlaceId` ne yazıyor (boş mu, yanlış bir ID mi) — raporlayın.
Adım 2'de bulduğunuz doğru ID ile aynı değilse, `Branch.pdksPlaceId` alanını doğru ID ile
güncelleyin (Tanımlamalar → Şubeler ekranından da yapılabilir, ama toplu ve hızlı olması için
doğrudan DB update / admin API çağrısı tercih edilebilir).

## Adım 4 — Doğrulama

Güncelleme sonrası bu 3 şubeden birinde çalışan bir personel için `hasTodayAttendance` /
`hasTodayEntryAtPlace` akışını (veya İK & Prim → Personeller ekranındaki PDKS senkron testini)
gerçek bir çağrıyla deneyip 403 almadığını doğrulayın.

## Rapor formatı

Adım 1'in tam çıktısı (mekan id + isim tablosu), Adım 2'deki eşleştirme kararınız, Adım 3'teki
eski/yeni ID karşılaştırması, Adım 4'ün sonucu. Emin olmadığınız eşleştirmeyi yapmadan önce bana
sorun.
