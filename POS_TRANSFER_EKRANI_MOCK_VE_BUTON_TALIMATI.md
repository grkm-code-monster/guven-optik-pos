# POS "Transferler" ekranı — sahte veri fallback'i + Kabul Et buton hatası (ACİL)

## Durum

`packages/web/src/components/transfer/BekleyenTransferler.tsx` — POS'taki "Transferler" ekranının
kaynağı. Görkem GVN3'e STORE_MANAGER (Kenan Kaptan) ile girdi, "Gelen Transferler" listesinde
`TRF-2026-0089 / 2026-05-15 / GVN1→GVN2 / Ahmet Yılmaz` diye bir kayıt gördü — bu gerçek değil,
dosyanın içindeki hardcoded `MOCK_BEKLEYEN` verisi.

## Kök neden 1 — sessiz mock fallback (ACİL, canlı öncesi mutlaka kapatılmalı)

```jsx
useMockFallback = source === 'pos'   // POS ekranları için varsayılan TRUE

// yukle():
if (useMockFallback && (!Array.isArray(gelen) || gelen.length === 0)) {
  setGelenTransferler(MOCK_BEKLEYEN)   // hiçbir görsel "DEMO" işareti yok
}
// hata durumunda da aynı şekilde mock'a düşüyor (catch bloğu)
```

Gerçek API (`getBekleyenTransferler`) hata verdiğinde VEYA gerçekten boş sonuç döndüğünde ekran
sessizce sahte veri gösteriyor. Bu iki durumu (gerçek boş liste / API hatası) ayırt etmek imkansız,
ayrıca gerçek bir bekleyen transfer varken bile bu mock hiç tetiklenmeyecek şekilde çalışmıyor —
şu an GVN3'te gerçek TRANSFER-1784101433075 görünmesi gerekirken mock devreye girmiş, yani gerçek
API ya hata veriyor ya da bu transferi döndürmüyor.

### İstenen düzeltme

1. `MOCK_BEKLEYEN` ve `useMockFallback` mekanizmasını **POS ekranından tamamen kaldırın**
   (`source === 'pos'` için `useMockFallback` her zaman `false` olsun, ya da mock kodunu silin).
   Canlı bir POS ekranı asla sahte veri göstermemeli — gerçek API hata verirse kullanıcıya net bir
   hata mesajı gösterilsin ("Transferler yüklenemedi, tekrar deneyin" gibi), sessizce demo veriyle
   doldurulmasın.
2. Mock kaldırıldıktan sonra GVN3'te gerçekten ne döndüğünü test edin — `getBekleyenTransferler('GVN3','pos')`
   gerçek API çağrısını (backend `listBekleyen`) doğrudan çağırıp TRANSFER-1784101433075'in
   gerçekten dönüp dönmediğine bakın:
   - Dönmüyorsa: backend `listBekleyen`'in domain filtresini (`location_dest_id`, `state in
     BEKLEYEN_PICKING_STATES = ['confirmed','assigned']`) kontrol edin — bu transfer şirketler
     arası (`sirketler-arasi-transfer.service.ts` üzerinden) oluşturulduğu için picking state'i
     farklı bir aşamada kalmış olabilir, gerçek nedeni bulup bana kısa raporlayın.
   - Hata veriyorsa: tam hata mesajını raporlayın.
3. Admin panelindeki (`source === 'admin'`) aynı bileşen zaten `useMockFallback` varsayılanı
   `false` alıyor (`useMockFallback = source === 'pos'` satırından anlaşılıyor) — o tarafa
   dokunmanıza gerek yok, sadece POS tarafını düzeltin.

## Kök neden 2 — "Kabul Et" butonu (kart üzerinde) gerçekten kabul etmiyor

```jsx
{gorunum === 'gelen' && canAccept ? (
  <button className="btn-kabul" onClick={() => detayAc(t)}>Kabul Et</button>
) : null}
```

Bu buton `detayAc(t)` çağırıyor — "Detay" butonuyla birebir aynı işlevi görüyor (sadece paneli
açıyor), gerçek kabul işlemi değil. Gerçek kabul, panel açıldıktan SONRA içeride görünen ikinci
"Kabul Et" butonuyla (`onClick={() => void kabulEt(t)}`, satır ~338) oluyor. Aynı isimli iki farklı
davranışlı buton kullanıcıyı yanıltıyor.

### İstenen düzeltme

Kart üzerindeki dış "Kabul Et" butonunu kaldırın, sadece "Detay" butonu kalsın (tıklayınca panel
açılır, orada gerçek "Kabul Et" ile işlem tamamlanır). İki ayrı "Kabul Et" ismi kullanıcıya
görünmesin.

## Rapor formatı

Mock kaldırıldıktan sonra GVN3'te gerçek API'nin ne döndürdüğü (transfer görünüyor mu, görünmüyorsa
neden), buton düzeltmesinin ekran görüntüsü. Bu talimat canlıya geçiş öncesi mutlaka kapatılmalı —
sahte veri gösteren ekran kabul edilemez, onay beklemeden uygulayabilirsiniz ama sonucu mutlaka
raporlayın.
