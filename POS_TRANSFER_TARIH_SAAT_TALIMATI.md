# Bekleyen Transferler ekranına atanma + kabul tarih/saati ekle

## Durum

Görkem, POS "Transferler → Bekleyen Transferler" ekranında (`BekleyenTransferler.tsx`) her
transfer kartında **hangi tarih/saatte transferin atandığını VE hangi tarih/saatte kabul
edildiğini** görmek istiyor. Şu an kartta tek bir `t.tarih` alanı var (örn.
"2026-07-14 07:08:22") ve bu aslında Odoo `stock.picking.scheduled_date` — kabul (validate)
zamanı değil, sadece planlanan/atanma zamanı.

## Kök neden (kod okunarak doğrulandı)

- `backend/src/modules/transfer/transfer.service.ts`:
  - `pickingFields` (satır ~784 ve ~806, hem gelen hem giden sorgusunda) sadece
    `['id','name','location_id','location_dest_id','scheduled_date','origin','note','state']`
    çekiyor — `create_date` ve `date_done` **yok**.
  - `mapPickingToTransfer()` (satır ~401-424) sadece `tarih: p.scheduled_date` döndürüyor.
  - Her iki sorgu da `BEKLEYEN_PICKING_STATES = ['confirmed','assigned']` ile filtreli (satır
    191) — yani **kabul edilmiş (`done`) picking'ler bu listede hiç görünmüyor**. Bu yüzden
    "kabul edilmiş" tarihi eklesek bile şu anki ekranda hiçbir kart bunu göstermeyecek, çünkü
    kabul edilenler zaten listeden düşüyor.
- Frontend `BekleyenTransferler.tsx` satır ~244: `{t.tarih} · {t.gonderen} → ... ` — tek tarih
  gösteriyor.

## İstenen

1. **Backend** — `pickingFields` listesine `create_date` ve `date_done` ekleyin.
   `mapPickingToTransfer()`'da iki alan döndürün:
   - `atanmaTarihi: p.create_date` (transfer ne zaman oluşturuldu/atandı)
   - `kabulTarihi: p.date_done ?? null` (henüz kabul edilmediyse `null`)
2. **Kapsam genişletme (kabul tarihinin görünebilmesi için gerekli):** Gelen/Giden
   sorgularına, `BEKLEYEN_PICKING_STATES` yanında son **14 gün içinde `done` durumuna geçmiş**
   picking'leri de dahil edin (örn. `['state','in',['confirmed','assigned','done']]` +
   `date_done` üzerinden son 14 gün filtresi, ya da ayrı bir "Tamamlanan" alt sekmesi — hangisi
   daha temizse siz karar verin, ama mutlaka kabul edilmiş en az birkaç örnek görünür olsun).
   Bunu yaparken performans için `limit`i (şu an 50) koruyun.
3. **Frontend** — `BekleyenTransferler.tsx` satır ~244 civarındaki kart metnini iki satıra
   çıkarın:
   - "Atandı: DD.MM.YYYY HH:mm"
   - "Kabul: DD.MM.YYYY HH:mm" (henüz kabul edilmediyse "Kabul: Bekliyor")
   Tarih formatlaması için mevcut bir tarih-format yardımcı fonksiyon varsa onu kullanın, yoksa
   basit bir `Intl.DateTimeFormat('tr-TR', ...)` ile TR formatında (gün.ay.yıl saat:dakika)
   gösterin.
4. Hem "Gelen" hem "Giden" sekmesinde test edin: en az bir bekleyen (kabul: Bekliyor) ve en az
   bir kabul edilmiş (kabul tarihi dolu) örnek ekran görüntüsüyle gösterin.

## Rapor formatı

Kod değişikliği özeti + hem bekleyen hem kabul edilmiş bir transferin ekran görüntüsü (Atandı ve
Kabul satırları görünür şekilde).
