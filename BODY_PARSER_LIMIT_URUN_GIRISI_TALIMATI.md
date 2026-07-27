# Büyük fatura (205 satır) onayında INTERNAL_ERROR — Express body-parser limiti

## Durum

Görkem, OPA2026000289021 (Opak Optik San.Tic.A.Ş, 205 satır) faturasını Ürün Girişi akışında
5. adımda ("Onay") kaydetmeye çalışınca `POST /admin/urun-giris` **500** dönüyor, ekranda
`INTERNAL_ERROR` (bizim genel fallback mesajımız) görünüyor.

## Kök neden hipotezi (yüksek güven, ama kesinleştirin)

`backend/src/app.ts` satır 32: `app.use(express.json());` — **`limit` parametresi verilmemiş**,
Express/body-parser varsayılanı **100kb**. 205 satırlık `satirlar` + her satır miktarı kadar
çoğalan `lotlar` dizisi (her lot ~15-20 alan taşıyor — `lotlariOlustur()`, `DepoPage.tsx`
satır ~2942) birlikte gönderildiğinde payload rahatlıkla 100kb'ı aşar.

Bunun doğru teşhis olduğunu şu şekilde destekliyor:
- Route handler'ın kendi try/catch'i (`admin.controller.ts` ~3165-3169, `[urun-giris hata]`
  logu) hiç tetiklenmemiş — Cursor tüm logları taradı, bulamadı. Body-parser hatası route
  handler'a hiç girmeden, Express middleware katmanında oluşur — bizim custom log hiç yazılmaz.
- Ekrandaki mesaj tam olarak `app.ts`'in genel 500 fallback'i (`INTERNAL_ERROR`) ile eşleşiyor,
  route'un kendi `res.status(500).json({ error: msg })`'i değil (o gerçek mesajı taşırdı).
- 205 satır + lotlar tam da bu boyutu aşacak ölçekte.

## İstenen

1. `app.ts` satır 32'yi güncelleyin:
   ```ts
   app.use(express.json({ limit: '15mb' }));
   ```
   (15mb makul bir üst sınır — çok daha büyük faturalar da olabilir, aşırı cömert olmayın ama
   sıkışmayın da.)
2. Aynı dosyada başka body-parser çağrısı varsa (örn. `express.urlencoded`) onu da kontrol edin,
   gerekiyorsa aynı limiti uygulayın.
3. **Doğrulayın:** OPA2026000289021'i (205 satır) gerçekten tekrar onaylayıp `/admin/urun-giris`
   isteğinin artık 500 vermediğini, başarıyla tamamlandığını gösterin.
4. Eğer bu değişiklikten SONRA hâlâ 500 alırsanız, bu benim hipotezimin yanlış olduğu anlamına
   gelir — o zaman route handler'ın kendi try/catch'i tetiklenmiş olacağından `[urun-giris hata]`
   satırı bu sefer loglarda görünmeli, gerçek mesajı bana getirin.

## Rapor formatı

`app.ts` diff'i + 205 satırlık faturanın başarıyla kaydedildiğinin kanıtı (ekran görüntüsü veya
oluşan PO/picking id'leri).
