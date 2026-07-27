# Stok Kontrol'de lot/seri satırları seçilebilir olmalı — buradan transfer başlatılabilsin

## Durum

Görkem'in orijinal isteği (bu Lot/UTS panelini yaptırdığımız ilk talimatta da geçiyordu):
"Stok kontrol kısmından transferler yapıyoruz." Şu an panel sadece BİLGİ amaçlı, salt-okunur bir
alt tablo (LOT/SERİ NO, ŞUBE, MIKTAR, UTS KODU, UTS DURUMU) — satırlar seçilemiyor, buradan
transfer başlatılamıyor. Görkem'in beklentisi: bir lot/seri satırını seçip, doğrudan o satırdan
transfer işlemini başlatabilmek — POS satış ekranındaki mekanizmanın aynısı.

## DÜZELTME (önceki taslağımda hataydı) — mevcut transfer altyapısı zaten StokKontrolTab.tsx'te var

İlk yazdığımda `YeniTransfer.tsx`'teki `createTransfer()`/`/transfer/olustur` akışını önermiştim.
Kodu tekrar okuyunca gördüm ki **`StokKontrolTab.tsx`'te ÜRÜN BAZLI toplu transfer zaten çalışır
durumda** — bunu YENİDEN YAZMAYIN, sadece LOT seviyesine genişletin:

- `secili` (Set<productId>) — checkbox ile ürün seçimi (satır ~227-234, mevcut "Seçili Varyantları
  Dışa Aktar" ile aynı desenin transfer versiyonu).
- `transferModalAc()` / `transferOlustur()` (satır ~245-310) — hedef şube seçtirip
  `olusturTransferTalebi(kalemler)` çağırıyor.
- `olusturTransferTalebi()` (`api/stok.api.ts` satır 256) → `POST /admin/transfer-olustur`
  (POS'un `StokTeminStep.tsx`'inin kullandığı AYNI endpoint).
- `TransferKalem` tipi (`stok.api.ts` satır 247) **zaten `lotId?: number | null` alanı içeriyor**
  — ama `transferOlustur()` içinde (satır 277) şu an HER ZAMAN `lotId: null` sabit geçiliyor:
  ```ts
  kalemler.push({ kaynak: kaynakId, hedef: hedefId, productId: u.productId, lotId: null, miktar: 1, urunAdi: u.urunAdi })
  ```

Yani altyapı %90 hazır — eksik olan tek şey: kullanıcının genişletilmiş lot/UTS panelinden BELİRLİ
bir lotu seçebilmesi ve o `lotId`'nin bu `null` yerine gerçek değerle `kalemler`e geçmesi.

## İstenen

1. `StokKontrolTab.tsx`'teki lot/UTS alt tablosuna (LOT/SERİ NO, ŞUBE, MIKTAR, UTS KODU, UTS DURUMU
   sütunları) her satır için bir seçim UI'ı ekleyin (radyo düğmesi ya da satır sonunda küçük bir
   "Bu Lotu Transfer Et" butonu — ürün genelinde ZATEN var olan checkbox/`secili` mekanizmasıyla
   KARIŞTIRMAYIN, bu YENİ, lot-özel bir seçim).
2. Bir lot satırı seçildiğinde, mevcut `transferModalAc()`/hedef-şube-seçme modalını AÇAN aynı UI'ı
   yeniden kullanın ama:
   - Çıkış lokasyonu artık ürünün "birincil stok şubesi" (`primaryStockBranch`) değil, DOĞRUDAN o
     lot satırının ŞUBE'si olsun (sabit, değiştirilemez).
   - `transferOlustur()`'daki `kalemler.push({...})` çağrısında `lotId: null` yerine seçilen
     `lot.lotId` geçilsin.
3. Aynı üründe birden fazla lot varsa (örn. ULTRA KONTAKT LENS -0125'in 13 lotu), kullanıcı
   istediği TEK lotu seçip SADECE onu transfer edebilmeli — ürün genelindeki mevcut toplu-transfer
   akışını bozmadan, bunun YANINDA bir seçenek olarak eklensin.
4. Transfer gönderildikten sonra o ürünün lot cache'ini (`lotCache`) temizleyip `yukleLotlar()`'ı
   tekrar çağırarak paneli otomatik yenileyin, kullanıcı güncel durumu görsün.

## Sınır durumları

- Aynı üründe birden fazla lot varsa (örn. ULTRA KONTAKT LENS'in bir bedeninde 13 lot vardı),
  kullanıcı istediği TEK bir lotu seçip transfer edebilmeli — hepsini birden değil (lot bazlı
  transfer, ürün bazlı toplu transfer değil).
- Kaynak şube = hedef şube seçilirse engelleyin (anlamsız transfer).
- Zaten "yolda" (bekleyen transfer) durumundaki bir lot tekrar seçilirse kullanıcıyı uyarın —
  `getBekleyenTransferler()` (`transfer.api.ts`) fonksiyonunu kullanarak bekleyen transferleri
  kontrol edip UI'da işaretleyebilirsiniz (opsiyonel, zaman kalırsa).

## Test

1. ULTRA KONTAKT LENS -0125 gibi çok lotlu bir üründe (13 lot, farklı şubelerde) Stok Kontrol'ü
   açıp bir lotu seçip başka bir şubeye transfer başlatın, `/admin/transfer-olustur`'a giden
   `kalemler`'de gerçek `lotId`'nin (artık `null` değil) gittiğini ve transferin
   "Bekleyen Transferler"de doğru lotla göründüğünü doğrulayın.
2. ZAROSSI gibi tek lotlu bir üründe de aynı akışı deneyin.
3. Kaynak=hedef seçildiğinde engellemenin çalıştığını gösterin.
4. Transfer sonrası panelin otomatik yenilendiğini (miktarın/lokasyonun güncellendiğini) gösterin.

## Rapor formatı

Yapılan UI değişikliği (dosya/satır) + kullanılan API çağrısının tam payload'ı + test 1-4 sonucu
(ekran görüntüsüyle) + varsa eklenen sınır-durum kontrolleri.
