# Hazır Raporlarım — talep takibi (bekleyen/tamamlanmış) + mesajlaşma + bildirim

## Durum

"Hazır Raporlarım" sayfasında kullanıcı "Yeni Rapor Talep Et" ile bir istek gönderebiliyor, ama
gönderdikten sonra **hiçbir takip imkanı yok** — sadece "Rapor talebiniz iletildi. Yönetici
bilgilendirildi." mesajı görüp kayboluyor. Görkem, buraya **bekleyen talepler** ve **tamamlanmış
talepler** sekmeleri, gerekirse yöneticiyle talep içinde mesajlaşma, ve mesaj geldiğinde bildirim
istiyor.

## Kod tarafı — mevcut durum (kısmen hazır altyapı var)

- `ReportRequest` modeli (`schema.prisma` satır 1406-1415) zaten var: `talepEdenId`, `istekMetni`,
  `durum` (varsayılan `"BEKLIYOR"`), `olusturulanTemplateId` (bir şablon oluşturulunca doldurulan
  alan — bu fiilen "tamamlandı" sinyali).
- `POST /reports/requests` (talep oluşturma) zaten çalışıyor, kullanıcı tarafından erişilebilir.
- `GET /reports/requests` (`report.controller.ts` satır 279) **var ama sadece admin** için
  (`authorize(Role.ADMIN)`) ve **sadece bekleyenleri** listeliyor (`listPendingReportRequests()`)
  — normal kullanıcı kendi taleplerini hiç göremiyor.
- `reportEngineApi` (frontend, `report-engine.api.ts`) içinde `listRequests` fonksiyonu **sadece
  `reportEngineAdminApi`'ye bağlı**, normal kullanıcı client'ında (`reportEngineApi`) yok.
- **Mesajlaşma alanı/tablosu hiç yok** — `ReportRequest` modelinde mesaj/thread ile ilgili hiçbir
  alan/ilişki yok. Bu tamamen yeni bir özellik.

## İstenen

### 1) Kendi taleplerimi görebilme (bekleyen/tamamlanmış sekmeleri)

1. Backend: kullanıcının **kendi** taleplerini listeleyen bir endpoint ekleyin (örn. `GET
   /reports/my-requests`) — `talepEdenId = req.user.id` ile filtrelenmiş, TÜM durumları (sadece
   bekleyen değil) döndürsün.
2. Frontend (`RaporlarimPage.tsx`): "Bekleyen Talepler" ve "Tamamlanmış Talepler" iki sekme/liste
   ekleyin, `durum` alanına göre ayırın (`BEKLIYOR` vs `olusturulanTemplateId` dolu olanlar —
   backend'de net bir "tamamlandı" durumu yoksa, admin tarafında talebi "tamamlandı" olarak
   işaretleyebileceği bir alan/aksiyon da ekleyin, sadece template oluşmasına bağlı kalmayın).
3. Admin tarafı (`AdminLayout`/ilgili admin sayfası) için de aynı listeyi, taleplere yanıt
   verme/durum güncelleme aksiyonuyla birlikte gösterin (muhtemelen zaten bir admin rapor
   yönetim ekranı vardır, kontrol edin).

### 2) Talep içinde mesajlaşma

1. Yeni bir model ekleyin (örn. `ReportRequestMessage`: `id, requestId, gonderenId, mesaj,
   createdAt, okunduMu`).
2. `POST /reports/requests/:id/messages` (mesaj gönder) ve `GET /reports/requests/:id/messages`
   (mesajları listele) endpoint'leri ekleyin — hem kullanıcı hem admin kullanabilsin (yetki
   kontrolü: kullanıcı sadece kendi talebinin mesajlarını görebilsin, admin hepsini).
3. Frontend'de her talep kartında bir "mesajlar" alanı/paneli açın (garanti sayfasındaki
   `mesajGonder`/`addWarrantyMessage` deseni referans alınabilir, `GarantiPage.tsx` satır
   148-157 — aynı desen burada da uygulanabilir).

### 3) Bildirim

1. Yeni mesaj geldiğinde, mevcut bildirim sistemini (bu oturumda daha önce `createBildirimler`
   fonksiyonu görülmüştü, `bildirim.service.ts`) kullanarak karşı tarafa (kullanıcıya ya da
   admin'e) bir bildirim oluşturun.
2. Bunun POS arayüzündeki mevcut bildirim zili/sayacıyla (sağ üstteki 🔔 ikonu, ekran
   görüntülerinde görülüyor) entegre olduğunu doğrulayın.

## Test

1. Kullanıcı bir rapor talebi oluştursun, "Bekleyen Talepler" sekmesinde görünsün.
2. Admin bu talebe bir mesaj yazsın — kullanıcı tarafında bildirim çıksın, mesaj "Hazır
   Raporlarım" sayfasında görünsün.
3. Admin talebi tamamlandı işaretlesin (veya bir şablon oluştursun) — kullanıcı tarafında talep
   "Tamamlanmış Talepler" sekmesine geçsin.

## Rapor formatı

Şema değişikliği + yeni endpoint'ler + değişen dosyalar + ekran görüntüsü (iki sekme + mesajlaşma
+ bildirim).
