# Bulut Geçişi, Otomatik Dağıtım, Yedekleme ve Güvenlik — Planlama Notu

Bu bir talimat değil, ileride ele almak üzere tuttuğumuz bir NOT'tur. Görkem'in sistemi canlıya
(buluta) taşırken istediği gereksinimler burada toplanıyor. Uygulamaya geçmeden önce her madde
ayrıca detaylandırılıp bağımsız bir talimata dönüştürülmeli.

## 1) Yönetim panelinden tek tuşla commit + bulut güncelleme

- Panelde bir "Yayınla / Güncelle" butonu olmalı: kod üzerinde değişiklik yapıldığında bu buton
  otomatik commit atıp buluttaki (canlı) ortamı güncellesin.
- Netleştirilmesi gerekenler (ileride): hangi bulut/hosting sağlayıcısı kullanılacak, deploy
  pipeline'ı nasıl tetiklenecek (CI/CD mi, doğrudan SSH/script mi), butona basan kişinin
  yetkisi/onay adımı olacak mı (yanlışlıkla canlıya hatalı kod gitmesin), rollback (geri alma)
  imkanı olacak mı.

## 2) Sunucu içi sürekli yedekleme

- Veriler (PostgreSQL veritabanı + Odoo verisi + yüklenen dosyalar) sunucu içinde SÜREKLİ/düzenli
  aralıklarla yedeklenmeli.
- Netleştirilmesi gerekenler: yedekleme sıklığı (saatlik/günlük), saklama süresi (kaç yedek
  tutulacak), yedeklerin nerede tutulacağı (aynı sunucu + ayrı bir yer — madde 4 ile bağlantılı).

## 3) Güvenlik hiçbir zaman gevşetilmemeli

- Genel ilke olarak not edildi — ileride somut bir güvenlik kontrol listesine (erişim yetkileri,
  şifreleme, güncel bağımlılıklar, sızma testi vb.) dönüştürülmeli.

## 4) Veri kaybına karşı çoklu yedek noktası

- "Sisteme bir saldırı, bozulma ya da çökme durumunda" diye belirtildi — yani tek bir yedek yeterli
  değil, en az 1-2 farklı konumda (örn. sunucu içi + sunucu dışı/bulut depolama) yedek tutulmalı.
- Bu, madde 2'nin devamı — birlikte tasarlanmalı.

## 5) 5 yıllık geçmiş verinin "kapalı" (kilitli/arşiv) hâle getirilmesi

- Türkiye'de ticari/mali kayıtlar için yasal saklama süresi genelde 5 yıldır (VUK vb.) — Görkem'in
  kastı muhtemelen bu: geçmişe dönük (muhtemelen 5 yıldan eski) kayıtların ARTIK
  değiştirilemeyecek/silinemeyecek şekilde kilitlenmesi (arşivlenmesi), ama YİNE DE erişilebilir
  kalması (denetim/mali inceleme ihtimaline karşı).
- Netleştirilmesi gerekenler: "5 yıllık" ifadesi son 5 yılın SAKLANMASI mı yoksa 5 yıldan ESKİ
  verinin kilitlenmesi mi anlamına geliyor — Görkem'e ileride bu ayrıca sorulmalı.

## 6) Performans — sistem yorulmamalı, sadece dönemsel "devir" işlemleri çalışmalı

- Arşivleme/kilitleme mekanizması sistemi YAVAŞLATMAMALI — sürekli arka planda ağır bir tarama
  değil, belirli dönemlerde (yıl sonu/dönem kapanışı gibi) çalışan "devir" (rollover) işlemleri
  şeklinde tasarlanmalı.

## Sonraki adım

Bu notlardaki her madde, gerçek uygulamaya geçilmeden önce ayrı ayrı netleştirilip (hosting
sağlayıcısı, yedekleme aracı, arşivleme kuralları gibi somut kararlarla) bağımsız talimatlara
dönüştürülecek. Şimdilik sadece kayıt altına alındı, kod tarafında HİÇBİR değişiklik yapılmadı.
