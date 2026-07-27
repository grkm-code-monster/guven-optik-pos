# Test scriptlerinin oluşturduğu döküntü kategorilerin silinmesi

## Durum

Görkem, Odoo'daki kategori listesinde şu test-artığı kayıtları gördü ve silinmesini istedi:

| ID | Ad |
|----|----|
| 64 | FAZ_B_1783961210976 |
| 65 | FAZ_B_1783961306078 |
| 66 | FAZ_C_1783961797138 |
| 67 | NOT47_1783968421791 |
| 70 | GS1IMP_1784802606537 |
| 71 | GS1IMP_1784802671343 |
| 72 | GS1IMP_1784802770005 |

Bunlar bu oturum boyunca çalıştırılan çeşitli test scriptlerinin (`test-envanter-import-gs1-uts-lot.ts`
gibi, kategori adı olarak zaman damgalı `PREFIX`/`TS` değişkenleri kullanan testler) canlı Odoo'da
bıraktığı, temizlenmemiş kalıntılar.

**KRİTİK — SİLİNMEYECEK:** Listede görünen **#45 "All / OPTİK ÇERÇEVE / ALT GRUP" kategorisine
KESİNLİKLE DOKUNMAYIN** — bu, ZAROSSI/OPTELLİ gibi GERÇEK ürünlerin kullandığı üretim kategorisi
(bu oturum boyunca defalarca doğrulandı). Görkem'in mesajındaki listede sadece karşılaştırma için
görünüyor, silinecekler arasında DEĞİL.

## İstenen

Sadece ID **64, 65, 66, 67, 70, 71, 72** için:

1. Her kategori için ÖNCE güvenlik kontrolü yapın: `product.template`/`product.category` üzerinde
   bu kategoriyi (`categ_id`) kullanan HERHANGİ bir ürün var mı (`search_count`, hem aktif hem
   arşivli — `context: active_test:false`). Alt kategorisi (child) var mı da kontrol edin.
2. Kullanan ürün/alt kategori YOKSA `product.category` `unlink` ile silin.
3. Kullanan ürün/alt kategori VARSA silmeyin — raporda "bu kategori hâlâ N üründe kullanılıyor,
   silinmedi" diye AÇIKÇA belirtin, hangi ürünler olduğunu listeleyin.

## Test

Silme sonrası 7 ID'nin de artık `product.category`'de bulunmadığını (ya da varsa neden
silinmediğini) gösterin. #45'in dokunulmadan durduğunu ayrıca doğrulayın.

## Rapor formatı

Silinen ID'ler + silinemeyenler (varsa gerekçesiyle) + #45'in etkilenmediğinin teyidi.
