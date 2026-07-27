# "Record does not exist or has been deleted" — product.product(1913,) — Satın Alma Siparişi hatası

## Durum

OPA2026000289021 ürün girişi onayında, body-parser fix'ten sonra artık isteğin kendisi geçiyor
ama şimdi yeni bir hata var:
```
✕ Satın alma siparişi: Record does not exist or has been deleted. (Record: product.product(1913,), User: 7)
```
#1913, tam olarak az önce toplu Excel aktarımıyla oluşturduğumuz **ULTRA KONTAKT LENS -0100**
`product.template` ID'si (Görkem barkodla arayıp bu satırı buna eşleştirmiş — barkod arama
düzeltmesi tam işe yaradı). Ama hata `product.product(1913,)` diyor — `product.template` değil.

## Güçlü hipotez — company_id yanlış seçilmiş olabilir

Odoo'da "Record does not exist or has been deleted" hatası, kayıt gerçekten yoksa VEYA
**mevcut kullanıcı/şirket bağlamı o kaydı ir.rule (multi-company) kısıtlamasıyla göremiyorsa**
aynı şekilde fırlatılır — ikisi kullanıcıya aynı görünür.

37 ULTRA KONTAKT LENS ürününü oluştururken Görkem "Güven Optik 1959 (ortak katalog — **tüm
şubeler/şirketler görsün**)" dedi, biz de `company_id: 1` yazdık (`sablon-excel-import.service.ts`
→ `SIRKET_AD_TO_ID`, `'güven optik 1959': 1`). **Ama Odoo'nun standart çoklu şirket modelinde,
bir ürünün gerçekten TÜM şirketlere açık/paylaşılan olması için `company_id` alanının `1` değil,
`False`/boş olması gerekir** — `company_id=1` aksine SADECE 1 numaralı şirkete özel/kısıtlı
anlamına gelir, diğer şirket bağlamında (bu ürün girişi muhtemelen NG/ADESE/POTENTIAL'dan biri
altında yapılıyor) görünmeyebilir/erişilemeyebilir. Bu, Görkem'in söylediği "ortak katalog"
niyetiyle tam ters bir sonuç doğurmuş olabilir.

**Bunu varsayım olarak sunuyorum, kesinleştirmeden düzeltmeyin — önce doğrulayın:**

## İstenen — önce teşhis

1. Bu ürün girişinin hangi `sirketId`/`cid` (NG mi, ADESE mi, POTENTIAL mi) altında yapıldığını
   bulun (muhtemelen frontend'deki `secilenSirketId`, gönderilen payload'da mevcut).
2. Odoo'da mevcut, **zaten çalışan** ve gerçekten birden fazla şirkette görünür/kullanılabilir
   bir ürün örneği bulun — onun `company_id` alanı `False` mu, yoksa başka bir şey mi, kontrol
   edin. Bu, bizim varsayımımızı doğrulayacak/çürütecek kesin kanıt.
3. `execute('product.product', 'search_read', [[['product_tmpl_id','=',1913]]], {fields:
   ['id','company_id']})` çağrısını hem `cid` olmadan hem de bu ürün girişinin kullandığı
   `cid` ile ayrı ayrı deneyin — hangisinde kayıt görünüyor hangisinde görünmüyor, bu farkı
   raporlayın.

## Eğer hipotez doğrulanırsa — düzeltme

1. 37 ULTRA KONTAKT LENS `product.template` kaydının `company_id` alanını `False` yapın (toplu
   `write`).
2. `sablon-excel-import.service.ts` → `SIRKET_AD_TO_ID`'de `'güven optik 1959'` değerini `1`
   yerine bir "false/paylaşılan" durumuna karşılık gelecek şekilde güncelleyin — kod tarafında
   `company_id` alanını hiç set etmeyin (Odoo `create()`'de alan gönderilmezse zaten boş/False
   kalır) ya da açıkça `false` gönderin, `1` göndermeyin. `resolveSirketId()`'in dönüş tipini
   `number | false` yapmanız gerekebilir.
3. Aynı mantık `POS_TRANSFER...`/diğer yerlerde "Güven Optik 1959" seçilince `company_id: 1`
   yazan başka kod var mı kontrol edin (örn. `admin/odoo-sablon-olustur` endpoint'i, daha önceki
   tek seferlik script) — tutarlı olsun.

## Eğer hipotez YANLIŞSA

Farklı bir kök neden var demektir (örn. gerçekten silinmiş bir kayıt, cache sorunu, yanlış ID
eşleşmesi `resolveProductVariantId`'de). O zaman gerçek nedeni bulup ayrıca raporlayın —
kafanıza göre "company_id'yi false yapalım" deyip geçmeyin, önce 2-3 numaralı adımlardaki
kanıtı görün.

## Rapor formatı

Teşhis adımlarının sonucu (hangi cid'de görünür/görünmez, referans ürünün company_id'si) +
(doğrulandıysa) düzeltme sonrası bu spesifik satırın başarıyla eşleşip PO'ya eklendiğinin kanıtı.
