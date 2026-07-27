# Ürün Girişi — varyant seçtirmiyor (teşhis)

## Bulgu

Depo Yönetimi → Ürün Girişi → 3. Ürün Satırları adımında "OSSE GÖZLÜK ÇERÇEVESİ OS132" arandığında
sadece "OSSE OPTİK ÇERÇEVE" şablonu geldi, seçilince varyant sorulmadan direkt template ile satır
oluştu. Görkem bu ürün için Odoo'da varyant tanımladığını söylüyor.

## Kod okuması (yapıldı, referans alın)

`DepoPage.tsx` `templateSec()` (satır ~2684): `GET /admin/urun-varyanlar/:templateId` çağırıyor —
dönen dizi uzunluğu 1 ise **popup göstermeden** direkt o tek varyantla devam ediyor; 1'den fazlaysa
popup açıyor. **Kritik: `catch` bloğunda (satır ~2703-2706) hata olursa da sessizce template ile
devam ediyor, kullanıcıya hiçbir uyarı/hata göstermiyor.** Yani hem "gerçekten tek varyant var" hem
"varyant sorgusu patladı" durumları kullanıcı tarafında birbirinden ayırt edilemiyor.

Backend `GET /admin/urun-varyanlar/:templateId` (`admin.controller.ts` satır ~5025):
`product.product` modelini `product_tmpl_id = templateId` filtresiyle arıyor.

## İstenen

1. **Önce veriyi doğrulayın:** "OSSE OPTİK ÇERÇEVE" ürününün Odoo'daki gerçek `product.template`
   id'sini bulun, o template için Odoo'da kaç `product.product` (varyant) kaydı olduğunu doğrudan
   Odoo'dan (script/console ile) kontrol edin. Ayrıca template'in `attribute_line_ids` alanı dolu mu
   (yani gerçekten nitelik/varyant tanımlanmış mı) bakın.
2. `GET /admin/urun-varyanlar/:templateId` ucunu bu template id ile gerçekten çağırıp ne döndüğünü
   (kaç kayıt, hata var mı) raporlayın — backend loglarında `[urun-varyanlar hata]` var mı kontrol
   edin.
3. Sonucu üç ihtimalden hangisine göre yorumlayın:
   - **(a) Odoo'da gerçekten tek varyant var** — Görkem'in Odoo'da nitelik tanımını
     tamamlamadığı/kaydetmediği bir durum, kod doğru çalışıyor. Görkem'e Odoo tarafında nasıl
     kontrol edeceğini (Ürün Yapılandırma ekranından mı, Odoo'nun kendisinden mi) açıklayın.
   - **(b) Birden fazla varyant var ama `/admin/urun-varyanlar/:id` hata veriyor** — hatayı düzeltin.
   - **(c) Birden fazla varyant var, uç doğru dönüyor ama frontend'de gösterilmiyor** — frontend
     bug'ı, `templateSec()`'i düzeltin.
4. **Ayrıca (her durumda yapılması gereken UX düzeltmesi):** `catch` bloğundaki sessiz fallback'i
   kaldırın — hata olursa kullanıcıya görünür bir uyarı gösterin ("Varyant bilgisi alınamadı, şablon
   ile devam ediliyor" gibi), sessizce yutmayın. Böylece bu durum bir daha belirsiz kalmaz.

## Rapor formatı

Hangi ihtimal (a/b/c) doğru çıktı, kanıt (Odoo sorgu sonucu, log), yapılan düzeltme (varsa) ve UX
uyarısının eklenip eklenmediği. Kod değişikliği yapmadan önce 1-3 adımlarının sonucunu bana kısaca
özetleyin, büyük bir düzeltme değilse onaysız devam edebilirsiniz.
