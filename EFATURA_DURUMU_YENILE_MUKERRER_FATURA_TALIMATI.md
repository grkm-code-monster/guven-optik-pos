# "Durumu Yenile" her tıklamada yeni fatura numarası üretip tekrar gönderiyor — mükerrer kayıt

## Durum

Bir satışta e-Fatura gönderimi işlenirken (Uyumsoft motoru dahili olarak birkaç kez deniyor, bu birkaç
dakika sürebiliyor) kullanıcı "🔄 Durumu Yenile"ye basarsa, sistem sadece durumu SORGULAMIYOR —
sıfırdan YENİ bir fatura numarası üretip TEKRAR gönderim deniyor. Bu, aynı satıştan birden fazla
fatura numarası üretilmesine (`ANA2026000000008`/`009` mükerrer örneği, şimdi de `010` numarasının
başka bir satışla çakışması) yol açıyor.

## Kök neden (kodda doğrulandı)

- `packages/web/src/components/sale/StatusStep.tsx`, `durumuYenile()` (satır 176-187) →
  `onRefresh()` çağırıyor.
- `packages/web/src/pages/NewSalePage.tsx`, `handleRefreshSale()` (satır 249-258):
  ```ts
  await apiClient.post(`/efatura/satis-onay/${sale.id}`)
  ```
- `backend/src/modules/efatura/efatura.controller.ts`, `POST /satis-onay/:satisId` (satır 87-104):
  ```ts
  await tetikleSatisEFatura(satisId);
  ```
- `backend/src/modules/efatura/uyumsoft-efatura.service.ts`, `tetikleSatisEFatura()` (satır 883-...):
  ```ts
  if (!sale || sale.eFaturaDurum === 'GONDERILDI') return;
  // ... HER ZAMAN yeni faturaNo üretir, yeni gönderim dener
  const count = await prisma.fatura.count({ where: { sube: branchCode } });
  const faturaNo = faturaNoUret(branchCode, count + 1);
  ```
  Sadece `eFaturaDurum === 'GONDERILDI'` iken duruyor. `BEKLIYOR` (henüz işleniyor OLABİLİR ya da
  başarısız olup kuyrukta OLABİLİR — ikisi de aynı durum değeriyle temsil ediliyor) durumundayken her
  çağrı yeni bir numara/gönderim başlatıyor. Kullanıcı "Durumu Yenile"ye ne kadar sık basarsa o kadar
  çok mükerrer fatura numarası üretiliyor.

## İstenen

1. `tetikleSatisEFatura()`'ya, aynı satış için YAKIN ZAMANDA (ör. son 3 dakika içinde) zaten bir
   `faturaKuyruk` kaydı oluşturulmuşsa ve bu kaydın sonucu henüz KESİNLEŞMEMİŞSE, YENİ bir numara
   ÜRETMEDEN önce bunu kontrol eden bir koruma ekleyin. En basit güvenli yaklaşım: fonksiyonun en
   başına, `sale.eFaturaDurum === 'BEKLIYOR'` VE en son `faturaKuyruk` kaydı belirli bir süreden
   (ör. 2 dakika) daha yeniyse, YENİ gönderim denemesi yapmadan sadece mevcut durumu döndürüp çıkın
   (no-op) — "hâlâ işleniyor, birazdan tekrar kontrol edin" gibi.
2. `BEKLIYOR` durumunun süresi UZUN bir süre (ör. 5+ dakika) geçmişse, o zaman gerçek bir yeniden
   deneme (retry) makul — bu durumda yeni numara üretip tekrar deneyebilir (mevcut davranış).
3. Alternatif/ek olarak: `POST /efatura/satis-onay/:satisId` endpoint'i çağrıldığında, eğer sale için
   zaten çözümlenmemiş bir `faturaKuyruk` kaydı varsa, önce o kaydın ETTN'siyle outbox durumunu
   sorgulayıp (varsa `pollOutboxInvoiceStatus`/`confirmInvoiceOutboxStatus` benzeri mevcut
   fonksiyonları kullanarak) `eFaturaDurum`'u güncellemeyi deneyin — SADECE hâlâ çözümsüzse ve yeterli
   süre geçmişse yeni bir gönderim başlatın.
4. Kullanıcı deneyimi: "Durumu Yenile" butonunun metnini/davranışını netleştirin — eğer kısa süre
   içinde tekrar tıklanırsa (no-op durumunda) kullanıcıya "Hâlâ işleniyor, birkaç dakika bekleyin"
   gibi bir mesaj gösterin, sessizce hiçbir şey olmamış gibi durmasın.

## Test

1. Bir satış onaylayıp e-Fatura göndermeyi tetikleyin, HEMEN ardından "Durumu Yenile"ye 3-4 kez art
   arda basın — artık YENİ bir fatura numarası ÜRETİLMEDİĞİNİ (sadece mevcut durumun sorgulandığını)
   gösterin. `faturaKuyruk`/`fatura` tablosunda bu satış için tek bir kayıt olduğunu doğrulayın.
2. Gerçekten uzun süre (5+ dakika) beklenip hâlâ `BEKLIYOR` ise, bu sefer gerçek bir retry'ın
   çalıştığını (kullanıcı gerçekten sıkışmış bir faturayı elle tekrar deneyebilsin) doğrulayın.
3. Bugün çakışan `ANA2026000000010` numarasının artık tekrar üretilmediğini, her satışın kendi
   benzersiz numarasını aldığını gösterin.

## Rapor formatı

Değişen dosyalar/satırlar + mükerrer üretim testinin sonucu (art arda tıklama senaryosu, DB'de kaç
kayıt oluştuğu) + normal retry senaryosunun hâlâ çalıştığının kanıtı.
