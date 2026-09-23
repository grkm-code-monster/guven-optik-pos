# Güven 2 Şubesi — Canlı Geçiş Süreci (Ürün Yok, Satış Devam Ediyor)

Durum: Sistem yarın sabah Güven 2'de çalışmaya başlıyor ama ürünlerin hiçbiri henüz girilmedi. Müşteriyle satış ekipleri ilgileniyor, onlar bir **form** dolduruyor (satış kaydı açmak için gereken her bilgi formda var). Görkem ve Yaprak müşteriyle muhatap olmuyor — formu alıp sisteme işliyorlar.

## Roller

| Kişi | Görev | Kullanacağı ekranlar |
|---|---|---|
| **Satış ekipleri** | Müşteriyle ilgilenir, satışı yapar, **formu doldurup** Görkem/Yaprak'a verir | (sistemi kullanmıyorlar) |
| **Görkem** | Form geldikçe: ürün sistemde yoksa önce ürünü açar, sonra satış kaydını girer. Boşta kaldıkça stoktaki ürünleri sisteme girmeye devam eder | Depo Yönetimi → 🆕 Ürün Girişi, 📊 Excel Envanter, Yeni Satış |
| **Yaprak** | Form geldikçe **sadece satış kaydını** sisteme girer (ürün girişine dokunmaz) | Yeni Satış |

## Altın Kural

> Yaprak formdaki ürünü sistemde ararken **bulamazsa satış kaydını hemen açmaz** — formu Görkem'e verir, ürün girilene kadar bekler. Ürün girilince forma geri döner, satış kaydını tamamlar.

Yaprak'a öğreteceğin ilk şey bu olsun. Sebep: ürün sistemde yoksa satış kaydı da doğru açılamaz, stok da hiç doğru olmaz — sonradan telafisi çok daha zor.

## Senaryo A — Formdaki ürün sistemde YOK (yarın sabah çoğu form böyle olacak)

| Sıra | Kim | Ne yapar |
|---|---|---|
| 1 | Satış ekibi | Müşteriye satışı yapar, formu doldurur (ürün, fiyat, ödeme, müşteri bilgisi vb.), Görkem veya Yaprak'a teslim eder |
| 2 | Yaprak (form ona geldiyse) | Formdaki ürünü Yeni Satış'ta arar, bulamaz → formu Görkem'e iletir |
| 3 | Görkem | Depo Yönetimi → **🆕 Ürün Girişi** sekmesinden ürünü hızlıca açar: barkod (varsa), ürün adı, kategori, satış fiyatı, KDV, stok adedi. Tek ürün girmek genelde birkaç saniye sürer |
| 4 | Görkem veya Yaprak | Ürün girildikten sonra **Yeni Satış**'a döner, formdaki bilgilerle (müşteri, ürün, ödeme) satış kaydını girer, onaylar |
| 5 | Görkem | Sıradaki forma / ürün girişine devam eder |

## Senaryo B — Formdaki ürün sistemde ZATEN var

| Sıra | Kim | Ne yapar |
|---|---|---|
| 1 | Görkem ya da Yaprak | Formu alır, **Yeni Satış** ekranından ürünü arar, formdaki bilgilerle satış kaydını girer, onaylar — ürün girişine gerek yok |

## Görkem'in arka planda (form arası boşluklarda) yaptığı iş

Sırayla, öncelik en çok satılanlarda olacak şekilde:

1. **Vitrindeki / raftaki en çok satılan ürünler** — tek tek Ürün Girişi ile (barkod okutarak en hızlısı)
2. **Kalan stok** — aynı anda çok sayıda benzer ürün varsa (örn. aynı marka güneş gözlüğü serisi), tek tek yerine 📊 **Excel Envanter** ile toplu aktarmak çok daha hızlı — bir Excel listesi hazırlayıp tek seferde yükleyebilirsin
3. Her ürün girişinden sonra barkod etiketi varsa/okutulabiliyorsa doğrulama yap (yanlış barkod girilmiş olmasın)

## Gün İçinde Kontrol Noktaları

| Ne zaman | Kontrol |
|---|---|
| Öğlen arası | Elde bekleyen (ürün girişi tamamlanmamış) form var mı bak, varsa kapat. Stok Yönetimi'nden o ana kadar kaç ürün girildiğini, Satışlar ekranından kaç satış girildiğini karşılaştır |
| Gün sonu | Satış ekiplerinden gelen TÜM formların sisteme işlendiğinden emin ol (bekleyen form kalmasın). Formları sakla — sonradan karşılaştırma/denetim için lazım olabilir |

## Yaprak'a Öğretilecek Tek Akış — Yeni Satış (Formdan Kayıt Girme)

1. **Yeni Satış** ekranını aç
2. Formdaki müşteriyi sistemde ara/seç ya da yeni müşteri oluştur (isim/telefon formda yazıyor olmalı)
3. **Kalem Ekle** → formdaki ürünü adı veya barkoduyla ara → sepete ekle (formda birden fazla ürün varsa hepsini ekle)
   - *Ürün bulunamazsa: Altın Kural'ı uygula, formu Görkem'e ilet*
4. Formdaki ödeme bilgisine göre ödeme türünü seç (nakit / kredi kartı / açık hesap) ve tutarı gir
5. Satışı onayla / tamamla
6. Formu, işlendi diye ayrı bir yere koy (karışmasın diye "işlenmiş formlar" gibi bir yığın oluştur)

Bu 6 adımı birkaç kez birlikte deneyip Yaprak'ı alıştırman yeterli — geri kalanı (ürün girişi, raporlama, stok) tamamen Görkem'de kalıyor.
