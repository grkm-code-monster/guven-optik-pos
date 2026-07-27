# Stok Yönetimi — tek bir varyantı arşivleyebilme (şablonu değil)

## Durum — ekran görüntüleriyle doğrulandı

Görkem'in Stok Yönetimi'nde "optell" araması: **OPTELLİ OPTİK ÇERÇEVE** şablonu 3 varyantla geliyor
(`MODEL: OP11854/RENK: C6-5/ÖLÇÜ: 53`, `MODEL: OP11836/RENK: C6-5/ÖLÇÜ: 53`, `MODEL: OP11850/RENK:
C6-5/ÖLÇÜ: 50`). **Bu ürün/şablon GEREKLİ** — sadece bunlardan **BİRİ yanlış** ve Görkem bunu bulup
SADECE O VARYANTI arşivlemek istiyor, şablonu ya da diğer 2 varyantı DEĞİL.

İki ekran görüntüsü mevcut davranışı gösteriyor:

1. **Etiket sekmesi** (varyant satırındaki checkbox'lar "Seçili Varyantlara Etiket Bas" içindir) —
   burada varyant bazlı seçim ZATEN çalışıyor, ama sadece etiket basma aksiyonu için.
2. **Normal Stok Yönetimi listesi** — "Seçili Ürünleri Arşivle" butonu sadece ŞABLON satırındaki
   checkbox'a bağlı (`secili` state, `u.id` = template id). Varyant alt satırlarındaki checkbox'lar
   burada arşivleme için HİÇ kullanılmıyor — kullanıcı bir varyant satırını işaretlese bile üstteki
   "Seçili Ürünleri Arşivle" butonu ŞABLONU arşivler, o TEK varyantı değil.

## Kök neden (kodda doğrulandı)

- `packages/web/src/pages/admin/StokYonetimiPage.tsx`: `secili` (Set, template id'leri) →
  `topluArsivle()`/`topluArsivdenCikar()` → `topluStokUrunArsivle`/`topluStokUrunArsivdenCikar` API
  çağrıları — HEP `stok-urunleri/arsivle` uç noktasına, HEP template id'siyle gidiyor.
- Varyant seçimi için AYRI bir state zaten var: `secilenVaryantlar` (Map, `varyantKey(tmplId,
  variantId)` anahtarlı, satır 236-258, `toggleVaryantSec`), ve buna bağlı "Seçili Varyantlara
  Etiket Bas" butonu (satır 681-696) — ama bu SADECE etiket basma akışına (`acVaryantEtiketModal`)
  bağlı, arşivleme aksiyonu YOK.
- `backend/src/modules/admin/admin.controller.ts`, `GET /odoo-sablon/:tmplId/varyantlar` (satır
  5538-5553): `product.product` `search_read` çağrısında `active` domain'i YOK, `context` de YOK —
  yani Odoo'nun varsayılan davranışı (aktif olmayanları gizleme) geçerli. **Bir varyant
  arşivlendiğinde bu uç nokta onu ARTIK HİÇ DÖNMEZ** — kullanıcı arşivlediği varyantı bulup geri
  çıkaramaz, sessizce kaybolur.
- `backend/src/modules/admin/stok-yonetimi.service.ts`'te `product.product` üzerine `active` yazan
  BAĞIMSIZ (template'ten ayrı) bir fonksiyon yok — mevcut `setTemplateActiveBatch()` (satır 382-410)
  hem template'i hem TÜM varyantlarını birlikte arşivliyor, tek bir varyantı hedefleme imkanı yok.

## İstenen

### 1) Backend — varyant bazlı arşivle/arşivden çıkar (şablona ve kardeş varyantlara DOKUNMADAN)

`stok-yonetimi.service.ts`'e, `setTemplateActiveBatch()` ile AYNI BATCH (50) deseninde, ama SADECE
`product.product` üzerinde çalışan iki yeni fonksiyon ekleyin:

```
topluVaryantArsivle(variantIds: number[])       // product.product write({active:false})
topluVaryantArsivdenCikar(variantIds: number[]) // product.product write({active:true})
```

**KRİTİK GÜVENLİK KURALI:** bu iki fonksiyon KESİNLİKLE `product.template` üzerine YAZMASIN,
sadece verilen `variantIds` (product.product id'leri) üzerinde çalışsın. Kardeş varyantlara da
dokunulmasın. `active=false` yazarken de `write` çağrısına `context: {active_test: false}`
geçirmeniz gerekebilir (Odoo'nun varsayılan aktif-kaydı-arama davranışı write hedefini bulmayı
engellemesin diye) — `setTemplateActiveBatch`'teki `inactiveCtx` deseniyle aynı.

`admin.controller.ts`'e iki yeni endpoint ekleyin:
- `POST /odoo-sablon/varyant-arsivle` — body `{variantIds: number[]}`.
- `POST /odoo-sablon/varyant-arsivden-cikar` — body `{variantIds: number[]}`.

`GET /odoo-sablon/:tmplId/varyantlar`'ı güncelleyin: `search_read` çağrısına `context: {active_test:
false}` ekleyin VE domain'e `active` filtresi eklemeyin (`'in', [true, false]` gibi AÇIKÇA) — böylece
bu uç nokta ARTIK arşivlenmiş varyantları da dönsün. Yanıta her varyant için `active` (boolean)
alanını da ekleyin (fields listesine `active` ekleyin) — frontend'in arşivli/aktif ayrımını
gösterebilmesi için.

### 2) Frontend — mevcut varyant seçim mekanizmasını arşivleme için de kullanın

`secilenVaryantlar` seçim mekanizması ZATEN var (etiket basma için) — YENİDEN KULLANIN, yeni bir
seçim state icat ETMEYİN. "Seçili Varyantlara Etiket Bas" butonunun yanına iki yeni buton ekleyin:

- **"Seçili Varyantları Arşivle"** — onay diyaloğuyla (mevcut şablon-arşivleme onay metninin
  varyant versiyonu: "N varyant arşivlenecek, ürün/şablon ve diğer varyantlar ETKİLENMEYECEK,
  istediğinizde geri çıkarabilirsiniz. Devam edilsin mi?"), `POST /odoo-sablon/varyant-arsivle`
  çağırıp ilgili şablonun varyant listesini (`varyantCache`) yeniden yükleyin.
- **"Seçili Varyantları Arşivden Çıkar"** — `POST /odoo-sablon/varyant-arsivden-cikar`.

Varyant alt satırlarının render'ında (satır ~823-887 civarı), `v.active === false` olan satırları
görsel olarak farklı gösterin (örn. soluk/gri metin + "Arşivde" etiketi, mevcut şablon listesindeki
yeşil "Aktif"/gri "Arşivde" rozet deseniyle tutarlı) — böylece arşivlenmiş bir varyant, o şablonun
varyant listesi genişletildiğinde HÂLÂ GÖRÜNÜR olur ve kullanıcı onu bulup "Arşivden Çıkar"
diyebilir.

### 3) Şablon davranışı — DOKUNULMAYACAK alan

Bir şablonun TÜM varyantları arşivlense bile, şablonun kendi `active` alanını OTOMATİK
DEĞİŞTİRMEYİN — şablon arşivleme/arşivden çıkarma tamamen AYRI, kasıtlı bir kullanıcı eylemi olarak
kalsın (mevcut "Seçili Ürünleri Arşivle" davranışı). Bu talimat SADECE varyant seviyesinde yeni bir
bağımsız aksiyon ekliyor, şablon seviyesindeki mevcut davranışı DEĞİŞTİRMİYOR.

## Test (ZORUNLU)

1. OPTELLİ OPTİK ÇERÇEVE şablonunu genişletip, 3 varyanttan SADECE BİRİNİ (örn. `MODEL: OP11836`)
   seçip "Seçili Varyantları Arşivle" ile arşivleyin. Odoo'da doğrulayın: sadece o `product.product`
   kaydı `active=false`, ŞABLON hâlâ `active=true`, DİĞER 2 VARYANT hâlâ `active=true`.
2. Aynı şablonu tekrar genişletip, arşivlenen varyantın HÂLÂ LİSTEDE (arşivli olarak işaretli)
   göründüğünü, diğer 2 varyantın normal göründüğünü gösterin.
3. Arşivlenen varyantı "Arşivden Çıkar" ile geri çıkarıp tekrar normal göründüğünü doğrulayın.
4. Satış ekranı ürün aramasında, arşivlenmiş TEK varyantın barkoduyla arama yapıldığında ÇIKMADIĞINI,
   ama DİĞER 2 varyantın barkoduyla arandığında NORMAL ÇIKTIĞINI doğrulayın (bu, şablon bazlı
   arşivlemeden farklı olarak kısmi/varyant bazlı etkiyi kanıtlar).

## Rapor formatı

Değişen dosyalar/satırlar + yeni endpoint'ler + test 1-4'ün Odoo'daki gerçek sonucu (variant id +
active durumu + şablonun/kardeş varyantların ETKİLENMEDİĞİNİN kanıtı).
