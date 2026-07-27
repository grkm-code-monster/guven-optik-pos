# Ürün Yapılandırma — Excel'den toplu ürün şablonu aktarma (kalıcı özellik)

## Durum / önceki talimatın yerini alıyor

Önceki `TOPLU_URUN_SABLONU_LENS_ICE_AKTAR_TALIMATI.md` bir kerelik script öneriyordu. Görkem bu
işin **tekrarlanacağını** söyledi ve "Ürün Yapılandırma" ekranına kalıcı bir "Excel'den Toplu
Ürün Şablonu Aktar" özelliği istedi. **Bu talimat onun yerine geçiyor — o script'i ayrıca
çalıştırmayın, bu yeni özelliği bitirip ULTRA KONTAKT LENS'in 37 satırını bu özellik üzerinden,
gerçek bir uçtan uca test olarak aktarın.**

## Nereye eklenecek

`UrunYapilandirmaPage.tsx` → Adım 2 "Ürün şablonu" ekranında, şu an "Mevcut şablon seç" /
"Yeni şablon oluştur" iki buton var (ekran görüntüsü mevcut) — üçüncü bir buton/sekme ekleyin:
**"Excel'den Toplu Aktar"**.

## Akış (Görkem'in istediği sıra)

### 1. Örnek şablon indir
Bir "Örnek şablonu indir" bağlantısı/butonu — backend `exceljs` (zaten bağımlılıklarda mevcut,
`gelen-fatura` akışında da kullanılıyor olabilir, kontrol edin) ile başlık satırlı bir `.xlsx`
üretsin:

| Kategori (tam yol) | Ürün Şablon Adı | Barkod | İç Referans | KDV Oranı | Satış Fiyatı | Maliyet | Şirket | İzleme |
|---|---|---|---|---|---|---|---|---|
| All / LENS / STANDART | ULTRA KONTAKT LENS -0100 | 785811314545 | | 10 | | | Güven Optik 1959 | Lot |

Sadece **Kategori** ve **Ürün Şablon Adı** zorunlu; diğerleri boş bırakılabilir (varsayılanlar:
Şirket boşsa "Güven Optik 1959", İzleme boşsa "Yok", fiyat/maliyet boşsa 0, KDV boşsa sorulsun/
varsayılan olmasın — kullanıcı seçsin).

### 2. Yükle
Kullanıcı doldurduğu `.xlsx`'i yükler. Backend `exceljs` ile başlık satırını ve ilk birkaç
satırı okuyup **tespit edilen sütun adlarını + örnek verileri** frontend'e döndürsün (önizleme).

### 3. Sütun eşleştirme
`DepoPage.tsx`'teki mevcut "Uyumsoft Fatura Satırları — Sütun Eşleştirme" UI desenini
(`UyumsoftKolonMap`, her hedef alan için bir dropdown ile Excel'deki hangi sütunun eşleneceğini
seçtirme, "yoksay" seçeneği) **birebir aynı etkileşim mantığıyla** burada da kullanın — tekerleği
yeniden icat etmeyin. Hedef alanlar: Kategori*, Ürün Şablon Adı*, Barkod, İç Referans, KDV Oranı,
Satış Fiyatı, Maliyet, Şirket, İzleme (* zorunlu).

### 4. Önizleme / doğrulama (aktarmadan önce)
Eşleştirme yapıldıktan sonra, aktarmadan önce bir önizleme gösterin:
- Sayfadaki her **benzersiz** kategori değeri için Odoo'da `product.category.complete_name`
  eşleşmesi bulunup bulunamadığını gösterin (bulunamayan varsa aktarmayı engelleyin, hangi
  satırların etkilendiğini listeleyin — kategoriyi kafanızdan oluşturmayın).
- Her benzersiz KDV oranı için `account.tax` (`type_tax_use='sale'`, `amount=oran`) bulunup
  bulunmadığını gösterin.
- Zorunlu alanı (Kategori/Ürün Adı) boş olan satırları ayrı listeleyin — bunlar aktarılmayacak,
  kullanıcı görsün.

### 5. Aktar
Onay sonrası, her satır için (önceki talimatta tarif edilen alan mantığıyla, bkz. aşağı) Odoo'da
`product.template.create` çağırın:
```ts
{
  name, type: 'product', categ_id, list_price, standard_price,
  default_code: icReferans || false, barcode: barkod || false,
  sale_ok: true, purchase_ok: true, can_be_expensed: false,
  invoice_policy: 'order', tracking: izleme || 'none',
  company_id: sirketId, taxes_id: [[6, 0, [taxId]]],
}
```
**Idempotent olun:** aynı isim veya barkodla mevcut bir `product.template` varsa **atlayın**,
tekrar oluşturmayın (kullanıcı aynı dosyayı yanlışlıkla iki kez yükleyebilir).

### 6. Sonuç raporu
Görkem'in özellikle istediği kısım — aktarma bittiğinde (ya da devam ederken canlı) şunu
gösterin: **"X aktarıldı, Y atlandı (zaten vardı), Z hata"** + hata/atlanan satırların kısa bir
listesi (satır no + sebep). Büyük dosyalarda (yüzlerce satır) ilerlemeyi de gösterin (örn. "42/37
işlendi" gibi bir sayaç — ya da tamamı bitene kadar spinner + sonunda tam rapor, hangisi daha
kolaysa).

## Gerçek test verisi — bu özelliğin ilk canlı testi

37 satırlık ULTRA KONTAKT LENS listesini (Kategori: "All / LENS / STANDART", KDV %10, Şirket:
Güven Optik 1959, İzleme: Lot, fiyat/maliyet boş) bu yeni özellik üzerinden gerçekten aktarın —
tam liste önceki talimat dosyasında (`TOPLU_URUN_SABLONU_LENS_ICE_AKTAR_TALIMATI.md` içindeki
"Veri" bölümü) var, oradan alın. Bu hem özelliğin gerçek testi hem de Görkem'in asıl ihtiyacı
olan veri girişi olur.

## Rapor formatı

Yeni ekranın adım adım ekran görüntüleri (şablon indirme, yükleme, sütun eşleştirme, önizleme,
sonuç raporu) + 37 satırlık gerçek aktarımın sonuç raporu ("X aktarıldı, Y atlandı, Z hata").
