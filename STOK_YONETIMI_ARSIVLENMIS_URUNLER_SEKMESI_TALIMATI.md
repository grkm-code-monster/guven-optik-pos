# Stok Yönetimi'ne ayrı "Arşivlenmiş Ürünler" sekmesi

## Durum

Görkem'in ekran görüntüsü: şu an üstte sadece **"Stok Yönetimi"** ve **"Stok Kontrol"** sekmeleri
var. Arşivdeki ürünleri görmek için kullanıcının önce "Stok Yönetimi" sekmesine girip, sol
filtrelerdeki gizli/fark edilmesi zor bir dropdown'dan ("Ürün durumu: Arşiv") seçim yapması
gerekiyor. Görkem'in şikayeti net: **"arşivden çıkar butonu yerleştirmişsin ama ben ürünü nereden
görüp seçip arşivden çıkarıcam?"** — yani bu özellik teknik olarak var ama KEŞFEDİLEMİYOR/açıkça
ULAŞILAMIYOR. İstenen: üçüncü, AÇIK bir sekme — "Arşivlenmiş Ürünler" — kendi filtreleriyle,
direkt arşivdeki ürünleri listeleyen ve arşivden çıkarma seçimi sunan.

## Mevcut altyapı (kodda doğrulandı) — TEKRAR YAZMAYIN, PARAMETRELEYİN

`packages/web/src/pages/admin/StokYonetimiPage.tsx`:

- `TABS` (satır 27-30) şu an sadece `yonetim`/`kontrol` içeriyor.
- `urunDurumu` state (`'aktif' | 'arsiv' | 'hepsi'`, satır 115 civarı) ZATEN `GET /stok-urunleri`e
  `durum` parametresi olarak gidiyor ve `arsiv` seçilince liste ZATEN doğru şekilde arşivdeki
  ürünleri gösteriyor, seçim çubuğu ZATEN "Arşivden Çıkar" butonuna dönüşüyor (satır 653-661
  civarındaki `urunDurumu === 'arsiv' ? (...Arşivden Çıkar...) : (...)` koşulu). **Yani alt yapı
  TAMAMEN hazır ve doğru çalışıyor — sadece ERİŞİM/KEŞFEDİLEBİLİRLİK sorunu var.**

Bu nedenle **tabloyu/filtreleri/seçim mantığını YENİDEN YAZMAYIN.** Mevcut "Stok Yönetimi"
sekmesinin gövdesini (filtre paneli + tablo + seçim çubuğu) olduğu gibi kullanıp, YENİ sekme için
sadece `urunDurumu`'nun BAŞLANGIÇ/KİLİTLİ değerini değiştirin.

## İstenen

### 1) Üçüncü sekme ekleyin

`TABS` dizisine yeni bir sekme ekleyin, örn.:

```ts
const TABS = [
  { id: 'yonetim', label: '🏷️ Stok Yönetimi' },
  { id: 'arsiv', label: '🗄️ Arşivlenmiş Ürünler' },
  { id: 'kontrol', label: '📊 Stok Kontrol' },
] as const
```

### 2) Sekmeye girince otomatik arşiv filtresi

Bu yeni sekmeye geçildiğinde (`activeTab === 'arsiv'`):

- `urunDurumu` OTOMATİK olarak `'arsiv'`ye ayarlansın (kullanıcı elle dropdown'dan seçmek zorunda
  KALMASIN) — sekmeye tıklanır tıklanmaz liste doğrudan arşivdeki ürünleri göstersin.
- Bu sekmedeyken "Ürün durumu" dropdown'unu (Aktif/Arşiv/Hepsi) GİZLEYİN ya da devre dışı bırakın —
  zaten bu sekmenin KENDİSİ "arşiv" anlamına geliyor, dropdown'a gerek yok, kafa karıştırmasın.
  Diğer filtreler (Arama, Kategori, Min/Max ₺, Şube, KDV) AYNEN kalsın.
- Sekmeden çıkıp "Stok Yönetimi"ye dönüldüğünde `urunDurumu`'nun tekrar `'aktif'`e (varsayılana)
  dönmesi mantıklı olur — ama bu davranışı seçerken kullanıcı deneyimini bozmayacak en basit yolu
  seçin (örn. sekme değişiminde `urunDurumu`'nu ilgili sekmenin varsayılanına resetleyin).

### 3) Tablo ve seçim çubuğu — mevcut mantık aynen kullanılsın

Bu sekmede aynı tablo/filtre bileşenini render edin (kod tekrarı YOK, aynı JSX/fonksiyonları
paylaşın). Mevcut `urunDurumu === 'arsiv'` dalı zaten "Seçili Ürünleri Arşivden Çıkar" davranışını
doğru veriyor — hiçbir ek değişiklik gerekmiyor, sadece bu sekmeden ERİŞİLEBİLİR hale getirin.

### 4) İsteğe bağlı iyileştirme — boş durumda yönlendirme

Arşivde hiç ürün yoksa, mevcut "Ürün bulunamadı" mesajı yerine bu sekmeye özel "Arşivde ürün yok"
gibi bir mesaj gösterilmesi kullanıcı deneyimini biraz daha netleştirir (zorunlu değil, isterseniz
ekleyin).

## Test (ZORUNLU)

1. "Arşivlenmiş Ürünler" sekmesine tıklayınca, HİÇBİR dropdown değiştirmeden, doğrudan arşivdeki
   ürünlerin (örn. daha önce arşivlenen OPTELLİ varyantı/ürünleri) listelendiğini gösterin.
2. Bu sekmede bir/birkaç ürün seçip "Arşivden Çıkar" ile geri çıkarıp, ürünün "Stok Yönetimi"
   sekmesindeki Aktif Ürünler listesinde tekrar göründüğünü doğrulayın.
3. "Stok Yönetimi" sekmesine dönüldüğünde filtrenin/listenin normal "Aktif Ürünler" davranışına
   döndüğünü (arşiv sekmesinin bu sekmeyi bozmadığını) doğrulayın.
4. "Stok Kontrol" sekmesinin ve mevcut diğer davranışların (Toplu Fiyat Güncelle, Dışa Aktar vb.)
   ETKİLENMEDİĞİNİ doğrulayın (regresyon kontrolü).

## Rapor formatı

Değişen dosyalar/satırlar + yeni sekmenin ekran görüntüsü + test 1-4'ün sonucu.
