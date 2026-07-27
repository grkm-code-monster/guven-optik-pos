# Kategori ikilenmesi — var olan kategori yeniden oluşturulmasın

## Durum

Görkem'in açık talimatı: **"Kategorilerde aynı şekilde varsa açmasın sakın. Bir tanesini 2 tane
yapmış zaten."** Yani sistemde GERÇEKTEN bir kategori zaten ikiye bölünmüş durumda. Bu, daha önce
tamamlanan `SABLON_EXCEL_IMPORT_RENK_MODEL_OLCU_EKSIK_TALIMATI.md`'nin 2.2 bölümünde de belirtilmişti
ama o talimatın kapanış raporu SADECE 2.1 (varyant güvenlik kuralı) kapsıyordu — 2.2 hiç ele
alınmadı. Bu talimat, 2.2'yi AYRI ve net bir iş olarak yeniden veriyor.

## Kök neden (kodda doğrulandı) — iki call site, ikisi de aynı hatalı desen

Kod taramasında `product.category` + `create` kombinasyonu üç yerde bulundu. Bunlardan İKİSİ aynı
riskli deseni taşıyor: önce `name` alanında **`ilike` (bulanık/kısmi) arama**, bulamazsa HEMEN yeni
kategori `create`.

**1) `backend/src/modules/admin/odoo-varyant-import.service.ts`, `createEnvanterSablon()` (satır
317-332):**

```ts
const cats = await execute(
  'product.category', 'search_read',
  [[['name', 'ilike', input.kategori.trim()]]],
  { fields: ['id', 'name'], limit: 1 },
) as { id: number }[];
if (cats.length) {
  categId = cats[0].id;
} else {
  categId = Number(await execute(
    'product.category', 'create',
    [{ name: input.kategori.trim() }],
  ));
}
```

**2) `backend/src/modules/admin/admin.controller.ts`, `POST /urun-olustur` (satır 1460-1473,
"YENİ ÜRÜN ŞABLONU OLUŞTUR" endpoint'i — Görkem'in akışında muhtemelen "önce ürün şablonu ve varyant
tanımladım" derken kullandığı İLK adım budur):**

```ts
let categId: number | null = null;
if (categ_name?.trim()) {
  const cats = await execute(
    'product.category',
    'search_read',
    [[['name', 'ilike', categ_name.trim()]]],
    { fields: ['id', 'name'], limit: 1 },
  );
  if (Array.isArray(cats) && cats.length > 0) {
    categId = cats[0].id;
  } else {
    categId = await execute('product.category', 'create', [{ name: categ_name.trim() }]);
  }
}
```

`ilike` bulanık arama, baştaki/sondaki boşluk, büyük/küçük harf ya da Türkçe karakter (İ/I/ı/i)
farklılıkları yüzünden var olan bir kategoriyi BULAMAYIP ikinci bir kopyasını yaratabiliyor — bu iki
noktadan biri (muhtemelen 2. nokta, çünkü Görkem'in ilk adımı) gözlemlenen ikilenmenin kaynağı.

**Karşılaştırma — zaten doğru olan üçüncü nokta, DOKUNMAYIN:** `sablon-excel-import.service.ts`'deki
`resolveKategoriId()` (satır ~279-287) TAM `complete_name` eşleşmesi arıyor, bulamazsa `null`
dönüyor ve import satırı reddediyor — kategori OLUŞTURMUYOR. Bu fonksiyon zaten temiz, bu talimat
kapsamında değişiklik istemiyoruz.

**Dördüncü call site — kasıtlı, ayrı ele alınsın:** `admin.controller.ts`, `POST
/odoo-kategori-ekle` (satır 5330-5341) kullanıcının BİLEREK "yeni kategori ekle" dediği bir uç nokta
(muhtemelen frontend'de "Yeni Kategori" butonu). Otomatik/sessiz oluşturma değil ama YİNE DE aynı
güvenlik prensibi (aşağıda) burada da uygulanmalı — kullanıcı "ekle" dese bile, girilen isimle
neredeyse aynı bir kategori zaten varsa sessizce ikinci bir tane açmak yerine kullanıcıyı uyarmalı.

## İstenen davranış

Bu üç noktanın (1, 2, 4) HEPSİNDE kategori arama/oluşturma mantığını şu şekilde değiştirin:

1. Önce **TAM eşleşme** deneyin: `name` (ya da varsa hiyerarşi önemliyse `complete_name`) üzerinde
   `trim()`lenmiş, `=` (birebir) eşleşme. `ilike` ile DEĞİL.
2. Tam eşleşme yoksa, hemen `create` etmeyin — bir sonraki adım olarak var olan kategoriler arasında
   NORMALİZE EDİLMİŞ bir karşılaştırma yapın (baştaki/sondaki boşluklar temizlenmiş, büyük/küçük harf
   ve Türkçe karakter farkları göz ardı edilerek). Böyle bir eşleşme bulunursa ONU kullanın, yeni
   oluşturmayın.
3. Sadece gerçekten hiçbir eşleşme (ne tam ne normalize) yoksa yeni `product.category` oluşturun.
4. Belirsiz durumda (örneğin normalize karşılaştırmada BİRDEN FAZLA yakın aday bulunursa) sessizce
   birini seçip kullanmayın/oluşturmayın — 1 ve 2 numaralı call site'lar için: import/oluşturma
   işlemini bu satır için `hata`/`skipped-category-ambiguous` gibi net bir durumla işaretleyip
   kullanıcıya "kategori adı birden fazla olası eşleşmeye sahip, tam adını netleştirin" gibi AÇIK
   bir mesaj verin. 4 numaralı call site (`/odoo-kategori-ekle`) için: kullanıcıya bir onay/uyarı
   diyaloğu gösterip "böyle bir kategori zaten var, yine de yeni mi oluşturulsun?" diye sorun (ya da
   en azından bir uyarı mesajıyla yanıtlayıp frontend'de göstertin).
5. Bu değişiklik mevcut, ZATEN ikiye bölünmüş kategoriyi OTOMATİK birleştirmez/silmez — bu ayrı,
   manuel bir veri temizliği konusu, bu talimat kapsamı DIŞINDA. Sadece BUNDAN SONRA yeni ikilenme
   OLUŞMASINI engelleyin.

## Test (ZORUNLU)

1. Var olan bir kategori adını (örn. "Optik Çerçeve") baştan/sondan boşluklu, büyük/küçük harf
   farklı bir yazımla (" optik çerçeve ", "OPTİK ÇERÇEVE") hem `/urun-olustur` hem
   `odoo-varyant-import`/`createEnvanterSablon` akışından deneyip, YENİ bir `product.category`
   OLUŞMADIĞINI, var olanın kullanıldığını Odoo'da (kategori sayısı/id ile) doğrulayın.
2. `/odoo-kategori-ekle` uç noktasından aynı yakın-eşleşme senaryosunu deneyip, kullanıcıya
   uyarı/onay davranışının çalıştığını gösterin.
3. Gerçekten yeni, hiçbir kategoriyle eşleşmeyen bir isimle deneyip, normal oluşturma davranışının
   BOZULMADIĞINI doğrulayın (regresyon kontrolü).

## Rapor formatı

Değişen dosyalar/satırlar + üç call site'ın öncesi/sonrası kod karşılaştırması + test 1-3'ün
Odoo'daki gerçek sonucu (kategori id/isim listesi ile).
