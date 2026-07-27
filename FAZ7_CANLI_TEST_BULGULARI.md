# Faz 7 — Canlı Test Bulguları (ANA-DEPO → GVN2)

Test transferi: NG/ANA-DEPO → NG/GVN2, ürün OTTO OPTİK ÇERÇEVE, lot `.0108681715130217212104112 10630101`
(UTS'li, aynı şirket / farklı lokasyon senaryosu — Senaryo 2).

Ekran görüntülerinden 3 bulgu çıktı. Bunları **sadece araştırın, log/DB'den kesin nedeni bulun,
rapor edin** — hangi düzeltmenin yapılacağına birlikte karar vereceğiz, şimdilik kod değiştirmeyin.

## 1) UI: "Tamamlandı" etiketi yanlış — durum kontrolü eksik

`packages/web/src/pages/admin/DepoPage.tsx` içindeki `LotTransferTab::tekTransfer()`:

```js
if (res.data?.success) {
  setListe(prev => prev.map(l => l.id === id ? { ...l, transferYapiliyor: false, transferTamam: true } : l))
}
```

Sadece `success` bakıyor, `durum` alanına (`bekliyor` / `basarili`) bakmıyor. Faz 3'ten beri aynı
şirket içi transferler `baslatSirketIciTransfer` ile **iki aşamalı** (picking validate edilmiyor,
`durum: 'bekliyor'` dönüyor) — yani "Tamamlandı" yazması yanlış, olması gereken "Gönderildi — GVN2
kabul bekliyor" gibi bir etiket. Cross-company (Lot Transfer'de farklı şirket seçilirse) de aynı
şekilde `durum: 'bekliyor'` dönüyor, aynı sorun geçerli.

**İstenen:** Bu satırı ve olası benzer yerleri (`YeniTransfer.tsx`, `BekleyenTransferler.tsx`) tarayıp
`sonuc.durum === 'basarili'` ise "Tamamlandı", `durum === 'bekliyor'` ise "Gönderildi — kabul bekliyor"
gösterecek şekilde raporlayın (henüz değiştirmeyin, sadece hangi dosya/satırların etkilendiğini listeleyin).

## 2) Odoo: 1 adetlik lotta 2,00 ayrılan miktar (rezervasyon tutarsızlığı)

Ekran görüntüsü: `NG/Stok/ANA-DEPO`, lot `...2104112...`, Stok Miktarı **1,00**, Ayrılan Miktar **2,00**.
Aynı ürünün 4. satırında da (lot `...2094112...`) 1,00 stokta 1,00 ayrılan var.

**İstenen:** Bu lot'u (`stock.lot.name` ile ara) Odoo'da referans alan **tüm** `stock.move.line` /
`stock.picking` kayıtlarını (state `confirmed`/`assigned`/`waiting`, yani done/cancel olmayanlar) listeleyin.
Kaç ayrı picking bu lot'u rezerve ediyor, hangi tarihte oluşmuşlar, `origin` alanları ne diyor —
bunları raporlayın. Amaç: bu ikinci rezervasyonun nereden geldiğini (eski/yarım kalmış bir transfer mi,
mükerrer picking oluşturma bug'ı mı) bulmak.

## 3) e-İrsaliye gönderilmedi — TransferAksiyonLog + Bildirim kontrolü

`E_IRSALIYE_TRANSFER_ENABLED=true` (.env'de doğrulandı), yani atlanmadı — denendi ve muhtemelen
başarısız oldu ya da hiç tetiklenmedi. Bu transferin `transferRef`'ini (backend loglarından veya
Odoo picking `origin` alanından — format `TRANSFER-<timestamp>`) bulup:

- `TransferAksiyonLog` tablosunda bu `transferRef` için `aksiyon = 'EIRSALIYE'` kaydını çekin —
  `durum` ve `mesaj` alanlarını raporlayın.
- Kayıt hiç yoksa (`postActionsBaslat` hiç çağrılmamış demektir) — bu durumda `baslatSirketIciTransfer`
  fonksiyonunun gerçekten `postActionsBaslat`'ı çağırıp çağırmadığını, çağırıyorsa hangi noktada
  exception yiyip yutulmuş olabileceğini (try/catch var mı) kod okuyarak kontrol edin.
- `Bildirim` tablosunda (admin/muhasebe rolüne düşen) "e-İrsaliye gönderilemedi" mesajı var mı,
  varsa tam metnini raporlayın.

**Ayrıca not:** Aynı şirket içi transferde alıcı VKN = gönderici VKN olacak (GVN2 de NG'ye ait).
`isEDespatchUser`/`sendDespatch` çağrısının aynı VKN'yi hem gönderen hem alıcı olarak göndermesi
Uyumsoft tarafında özel bir davranışa (hata ya da farklı bir akış) yol açıyor olabilir — bunu da
log'da arayın, eğer hata mesajı buna işaret ediyorsa özellikle belirtin.

## Rapor formatı

Üç madde için de: ne bulundu, hangi dosya/tablo/kayıt, tam hata mesajı (varsa). Kod değişikliği
önermeyin, sadece teşhis. Görkem ile birlikte hangisinin nasıl düzeltileceğine sonra karar vereceğiz.
