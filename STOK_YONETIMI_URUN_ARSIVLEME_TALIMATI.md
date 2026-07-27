# Stok Yönetimi'nde ürün arşivleme (toplu arşivle + arşiv görünümü)

## İstek

İki parça:

1. **Acil, tek seferlik temizlik:** Renk/model/ölçü olmadan yanlış oluşmuş 3 adet "OPTELLİ OPTİK
   ÇERÇEVE" kaydı (barkod `8682037201319`, `8682037201630`, `8682037200190` — hepsi ANADEPO'da 1'er
   adet stoklu) artık aktif katalogda görünmemeli, arşivlenmeli.
2. **Kalıcı özellik:** Stok Yönetimi'nde ürünleri arayıp seçerek toplu arşivleyebilmek + arşivdeki
   ürünleri ayrı bir görünümde görüp gerekirse geri çıkarabilmek (arşivden çıkar). Odoo ile bağlı
   olmalı — yani bu, Odoo'nun standart `active` alanını kullanmalı (silme DEĞİL, gizleme/gösterme).

## Mevcut durum (kodda doğrulandı)

- `backend/src/modules/admin/stok-yonetimi.service.ts`, `listStokUrunleri()` (satır 110-164):
  domain'de **sabit** `['active', '=', true]` var (satır 115) — arşivlenmiş ürünleri listelemenin
  hiçbir yolu yok, hiçbir filtre parametresi bunu değiştiremiyor.
- Aynı fonksiyon zaten her satırda `aktif: !!t.active` alanını dönüyor (satır 150) — yani tip/alan
  altyapısı kısmen hazır, sadece domain filtresi ve arşivleme/arşivden-çıkarma endpoint'i eksik.
- Arşivleme/arşivden çıkarma (Odoo `write` ile `active: false/true`) için HİÇBİR endpoint yok —
  kod genelinde `product.template`/`product.product` üzerine `active` yazan tek bir `execute(...,
  'write', ...)` çağrısı bulunamadı.
- Toplu işlem için ZATEN doğru bir örnek desen var: `topluFiyatGuncelle()` (satır 294+) — `urunIds`
  dizisini 50'lik gruplar (`BATCH`) halinde işliyor, her biri için ayrı try/catch ile
  `{urunId, basarili, hata?}` sonuç listesi dönüyor. Yeni toplu arşivleme fonksiyonu AYNI deseni
  izlemeli.
- Frontend'de `packages/web/src/pages/admin/StokYonetimiPage.tsx` içinde ZATEN çoklu seçim altyapısı
  var: `seciliUrunler` (satır 146), checkbox'lar (satır 639, 682, 763), "toplu fiyat güncelle"
  aksiyonu (satır 391+). Yeni "arşivle" butonu bu AYNI seçim mekanizmasını kullanmalı, tekerleği
  yeniden icat etmeyin.

## İstenen

### 1) Acil temizlik — 3 OPTELLİ kaydı hemen arşivlensin

Aşağıdaki backend değişikliği tamamlandıktan sonra (ya da doğrudan tek seferlik bir script/komutla,
tercihiniz), barkodu `8682037201319`, `8682037201630`, `8682037200190` olan 3 `product.template`
kaydını `active: false` yapın. Bunların stok geçmişi/hareketleri SİLİNMEMELİ — sadece aktif
katalogdan/aramadan gizlenmeli. Raporda bu 3 kaydın arşivlendiğini ve Stok Yönetimi'nde artık aktif
listede GÖRÜNMEDİĞİNİ doğrulayın.

### 2) Backend — toplu arşivle / arşivden çıkar

`stok-yonetimi.service.ts`'e `topluFiyatGuncelle()` ile AYNI BATCH deseninde iki yeni fonksiyon
ekleyin:

- `topluUrunArsivle(urunIds: number[])` — her `product.template` id'si için `write({active:
  false})`. `product.product` (varyant) seviyesinde de ayrıca `active` alanı olduğundan, bir
  şablonu arşivlediğinizde TÜM varyantlarının da fiilen arşivlenip arşivlenmediğini Odoo'da test
  edin (Odoo'da genelde template arşivlenince varyantlar da arşivlenir, ama bunu VARSAYMAYIN, test
  raporunda GÖSTERİN — değilse `product.product` tarafında da ayrıca `product_tmpl_id in urunIds`
  ile toplu `write` yapmanız gerekebilir).
- `topluUrunArsivdenCikar(urunIds: number[])` — aynı mantık, `active: true`.
- Her ikisi de `topluFiyatGuncelle` gibi `{urunId, basarili, hata?}` sonuç dizisi dönsün.

`listStokUrunleri(filtre)`'ye yeni bir opsiyonel filtre alanı ekleyin, örn. `durum?: 'aktif' |
'arsiv' | 'hepsi'` (varsayılan `'aktif'` — mevcut davranış AYNEN korunsun, geriye dönük uyumluluk
bozulmasın):

- `'aktif'` → domain'e `['active', '=', true]` (mevcut sabit davranış).
- `'arsiv'` → domain'e `['active', '=', false]`.
- `'hepsi'` → domain'e `active` filtresi HİÇ eklenmesin (Odoo varsayılan olarak `active=false`
  kayıtları zaten gizler, bu yüzden `hepsi` seçeneği için Odoo tarafında `active` alanını domain'e
  `'in', [true, false]` şeklinde AÇIKÇA eklemeniz gerekebilir — Odoo ORM'inin bu davranışını test
  edip raporda belirtin).

`admin.controller.ts`'e iki yeni endpoint ekleyin:

- `POST /stok-urunleri/arsivle` — body `{urunIds: number[]}` → `topluUrunArsivle`.
- `POST /stok-urunleri/arsivden-cikar` — body `{urunIds: number[]}` → `topluUrunArsivdenCikar`.
- `GET /stok-urunleri`'ne mevcut query parametrelerinin yanına `durum` parametresini de ekleyin
  (`req.query.durum`), `listStokUrunleri`'ye geçirin.

### 3) Frontend — arşivle butonu + Arşiv görünümü

`StokYonetimiPage.tsx`'te:

- Mevcut "Toplu Fiyat Güncelle" aksiyonunun yanına **"Seçili Ürünleri Arşivle"** butonu ekleyin —
  `seciliUrunler`'i kullanır, tıklanınca bir onay diyaloğu göstersin ("N ürün arşivlenecek, aktif
  listeden/kataloğ­dan/satıştan kaybolacak ama silinmeyecek, istediğinizde geri çıkarabilirsiniz —
  Devam edilsin mi?"), onaylanırsa `POST /stok-urunleri/arsivle` çağırıp listeyi yenileyin.
- Sayfaya bir **durum filtresi** ekleyin (mevcut `stokDurumu` dropdown'ıyla aynı desende): "Aktif
  Ürünler" (varsayılan) / "Arşiv" / "Hepsi". "Arşiv" seçiliyken tablo arşivdeki ürünleri göstersin
  ve her satırda (ya da toplu seçimle) **"Arşivden Çıkar"** butonu olsun — tıklanınca `POST
  /stok-urunleri/arsivden-cikar` çağırıp listeyi yenilesin.
- Arşiv görünümünde de mevcut arama/kategori/fiyat filtrelerinin ÇALIŞMAYA devam ettiğini
  doğrulayın (durum filtresi diğerleriyle BİRLİKTE çalışmalı, onları geçersiz kılmamalı).

### 4) Yan etki kontrolü — arşivlenen ürünler başka ekranlarda çıkmamalı

Arşivlenen bir ürünün satış ekranı ürün arama, transfer ürün arama, UTS ürün arama gibi diğer
`product.template`/`product.product` arama noktalarında da (varsayılan olarak) GÖRÜNMEMESİ
beklenir — bu noktaların çoğu muhtemelen zaten Odoo'nun varsayılan `active=true` davranışına
güveniyor (domain'e hiç `active` eklemeseler bile Odoo ORM'i varsayılan olarak arşivlenmiş kayıtları
gizler), ama emin olmak için en azından satış ekranı ürün aramasını test edin — arşivlenen bir
ürünün satışta ARANAMADIĞINI doğrulayın.

## Test

1. 1. maddedeki 3 OPTELLİ kaydının arşivlendiğini ve Stok Yönetimi "Aktif Ürünler" görünümünde
   artık ÇIKMADIĞINI gösterin.
2. Aynı 3 kaydın yeni "Arşiv" görünümünde göründüğünü gösterin.
3. Arşivden birini "Arşivden Çıkar" ile geri çıkarıp "Aktif Ürünler" listesinde tekrar GÖRÜNDÜĞÜNÜ
   doğrulayın.
4. Varyantlı bir şablonu (örn. birden fazla renk/ölçüsü olan bir ürün) arşivleyip, TÜM
   varyantlarının Odoo'da fiilen arşivlendiğini (`product.product` seviyesinde de) doğrulayın.
5. Arşivlenen bir ürünün stok/hareket GEÇMİŞİNİN silinmediğini (sadece `active=false` olduğunu)
   Odoo'dan gösterin.
6. Arşivlenmiş bir ürünün satış ekranı ürün aramasında ÇIKMADIĞINI doğrulayın.

## Rapor formatı

Değişen dosyalar/satırlar + yeni endpoint'ler + 3 OPTELLİ kaydının arşivlenmiş halinin ekran
görüntüsü + test 1-6'nın sonuçları.
