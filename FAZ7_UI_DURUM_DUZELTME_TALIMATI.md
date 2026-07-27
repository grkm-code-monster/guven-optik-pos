# Faz 7 sonrası düzeltme — "Tamamlandı" etiketi UI hatası

Teşhis raporunda (FAZ7_CANLI_TEST_BULGULARI.md, Bulgu #1) bulunan kök nedeni düzeltin.
Diğer iki bulgu için aksiyon gerekmiyor: çift rezervasyon test verisi olduğu için temizlenmeyecek,
e-İrsaliye engeli kod dışı (Uyumsoft yetki) — dokunmayın.

## Kural

Backend `success: true` iken bile `durum` alanı `'bekliyor'` olabilir (aynı şirket içi VEYA
şirketler arası transferlerde, karşı taraf henüz kabul etmediyse). UI, `success` yerine `durum`'a
bakmalı:

- `durum === 'basarili'` → "✓ Tamamlandı"
- `durum === 'bekliyor'` → "→ Gönderildi — {hedefLok} kabul bekliyor" (farklı renk, örn. turuncu/mavi,
  yeşil olmasın — henüz bitmedi izlenimi vermemeli)
- `durum === 'kismi'` / `basarisiz` → mevcut hata akışı aynen kalsın

## Düzeltilecek yerler

1. **`packages/web/src/pages/admin/DepoPage.tsx`** (`LotTransferTab`)
   - Satır 216-217: `res.data?.success` yerine `transferler[0]?.durum` oku, `liste` state'ine
     `transferTamam: boolean` yerine (veya ek olarak) `durum: 'bekliyor' | 'basarili' | ...` alanı ekle.
   - Satır 329-330, 342-343: `l.transferTamam` yerine `l.durum` bazlı render — 'bekliyor' için ayrı etiket.
   - Satır 232, 376: "tümünü transfer et" ve buton disable mantığı `durum === 'basarili'` olanları
     tamam sayacak şekilde güncellensin — 'bekliyor' olanlar tekrar gönderilmeye çalışılmamalı (zaten
     gönderildi, tekrar tıklanırsa yeni bir picking daha açar — bugün yaşadığımız çift rezervasyon
     tam da bu).

2. **`packages/web/src/components/sale/StokTeminStep.tsx`**
   - Satır 224-236: `success` → `stokDurum: 'MEVCUT'` ataması `durum === 'basarili'` şartına bağlansın;
     `'bekliyor'` iken farklı bir durum ("Transfer yolda") gösterilsin, ürün kaynak lokasyonda hâlâ
     mevcutmuş gibi yeşil "MEVCUT" gösterilmesin.
   - Satır 337-341: `transferDurumlari` içine `'bekliyor'` değerini de yansıtın.

3. **`packages/web/src/components/transfer/YeniTransfer.tsx`**
   - Satır 186-187: Backend zaten `durum` dönüyor (`transfer.service.ts` satır 757) — mesajı
     `sonuc.message`/`sonuc.durum`'a göre kur, sabit "Transfer oluşturuldu" yazmayın.

4. **`BekleyenTransferler.tsx`** — değişiklik gerekmiyor (zaten `t.durum` gösteriyor, kabul akışı ayrı).

## Kabul kriteri

Lot Transfer'de aynı şirket içi bir transfer başlatıldığında ekranda "Tamamlandı" değil "Gönderildi —
kabul bekliyor" görünmeli; hedef şube "Bekleyen Transferler"den kabul edene kadar bu satır tekrar
transfer edilebilir/aktif görünmemeli (tekrar tıklanınca ikinci bir picking açmasın).

Bitince kısa bir önce/sonra ekran görüntüsüyle raporlayın, ben kontrol edip kapatacağım.
