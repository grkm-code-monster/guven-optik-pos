# Sol menüden "Günlük Kasa Raporu" sekmesini kaldır

## Durum

Görkem, "Kontrol Paneli" içindeki "Günlük Kasa" sekmesi aynı işlevi zaten gördüğü için, sol
menüdeki ayrı "📊 Günlük Kasa Raporu" (`/reports` rotası) linkinin gereksiz kaldığını, kaldırmamızı
istiyor.

## Kod tarafı

`packages/web/src/components/layout/Sidebar.tsx` satır 135-152 — `/reports` rotasına giden
`NavLink`, "📊 Günlük Kasa Raporu" etiketiyle.

## İstenen

1. Bu `NavLink` bloğunu sol menüden kaldırın.
2. `/reports` route'unun (`Raporlar` sayfası, tarih seçip "Rapor Getir"/"Excel İndir" yapan ekran)
   kod olarak silinmesi GEREKMİYOR — sadece menüden kaldırın, route tanımı dursun (ileride tekrar
   gerekebilir, kırılgan bir silme yapmayın). Route'a başka bir yerden (örn. Kontrol Paneli
   içinden "detaylı rapor" linki gibi) referans veren bir yer varsa, kontrol edip bilgilendirin.
3. Kontrol Paneli'ndeki "Günlük Kasa" sekmesinin gerçekten aynı veriyi/işlevi (tarih seçip
   Excel indirme dahil) sağladığını doğrulayın — sağlamıyorsa (örn. Excel indirme sadece eski
   `/reports` sayfasında varsa) bunu Görkem'e ayrıca belirtin, sessizce özellik kaybına yol
   açmayın.

## Test

Sol menüde "Günlük Kasa Raporu" linkinin artık görünmediğini, Kontrol Paneli → "Günlük Kasa"
sekmesinin sorunsuz çalıştığını gösterin.

## Rapor formatı

Değişen dosya/satır + öncesi/sonrası sol menü ekran görüntüsü.
