# "Optik Çerçeve" ekran yazısını "Optik Gözlük" yap

## Durum

Görkem, POS "Yeni Satış → 2. Ürünler → + Kalem Ekle" adımındaki ürün tipi seçim kartında
görünen **"Optik Çerçeve"** yazısının **"Optik Gözlük"** olarak değişmesini istiyor
(ekran görüntüsündeki kart: 🕶 Optik Çerçeve).

## Kaynak (kod okunarak bulundu)

`packages/web/src/components/sale/ItemsStep.tsx`:
- Satır 26: `{ type: 'FRAME', title: 'Optik Çerçeve', icon: '🕶' },` — bu, ekran
  görüntüsündeki kartın başlığı.
- Satır 903: `{pickedType?.type === 'FRAME' ? 'Optik Çerçeve' : 'Güneş Gözlüğü'} — nasıl devam
  edelim?` — aynı akışın bir sonraki adımında tekrar geçiyor.

**ÖNEMLİ — sadece görünen metni değiştirin, `type: 'FRAME'` kodunu DEĞİŞTİRMEYİN.** Bu değer
kategori eşleştirme, Odoo ürün arama ve diğer akışlarda kullanılıyor olabilir; sadece
`title`/görünen string'i değiştirin.

## Kapsam dışı bırakılan (ŞİMDİLİK dokunmayın, sadece raporlayın)

Kod tabanında "Optik Çerçeve" metni başka yerlerde de var, ama bunlar farklı ekranlar/amaçlar
— **değiştirmeden önce bana sormadan dokunmayın**, sadece nerede geçtiğini listeleyin:
- `GarantiPage.tsx` / `GarantiYonetimPage.tsx` — garanti kayıtlarında ürün tipi etiketi
  (`OPTICAL_FRAME_READY`/`OPTICAL_FRAME_RX` → "Optik Çerçeve")
- `etiket-tasarimci/constants.ts` ve `sablon-registry.ts` — fiziksel ürün etiketi (barkod
  etiketi) şablon adları ("Optik Çerçeve (UTS'li)" vb.)
- `admin/DepoPage.tsx` — demo/örnek veri

Bunlar müşteri karşısında değil, farklı bağlamlarda (garanti kaydı, etiket şablonu, demo veri)
olduğu için şimdilik dokunmayın; sadece kısa bir liste halinde raporlayın, isterse Görkem ayrıca
karar verir.

## İstenen

1. `ItemsStep.tsx` satır 26 ve 903'teki görünen `'Optik Çerçeve'` string'lerini
   `'Optik Gözlük'` yapın (`type: 'FRAME'` aynı kalsın).
2. POS'ta "Yeni Satış → Kalem Ekle" akışını test edip kartın ve sonraki adımın artık
   "Optik Gözlük" yazdığını ekran görüntüsüyle doğrulayın.
3. Yukarıdaki "kapsam dışı" listesindeki diğer geçişleri (dosya + satır) kısaca raporlayın.

## Rapor formatı

Değişen dosya/satırlar + yeni ekran görüntüsü + kapsam dışı bırakılan yerlerin kısa listesi.
