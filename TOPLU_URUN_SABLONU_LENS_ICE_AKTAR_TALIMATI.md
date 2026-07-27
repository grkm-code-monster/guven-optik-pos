# Toplu ürün şablonu — ULTRA KONTAKT LENS serisi (37 kayıt)

## Amaç

Görkem'in verdiği Excel listesindeki 37 kontakt lens ürününü (nitelik/varyant YOK — her satır
kendi başına bağımsız bir `product.template`) Odoo'da toplu oluşturmak. Bu bir kerelik veri
girişi — kalıcı bir "Excel'den toplu şablon içe aktar" UI özelliği istenmiyor şu an, sadece bu
listenin doğru şekilde sisteme girmesi isteniyor. (İleride bu tür talepler sık gelirse, kalıcı bir
içe aktarma ekranı ayrıca konuşulur.)

## Kararlaştırılan alanlar (Görkem'le netleşti)

- **Şirket:** Güven Optik 1959 (ortak katalog) → `company_id = 1`
- **İzleme:** Lot takipli → `tracking = 'lot'`
- **Fiyat/Maliyet:** `list_price = 0`, `standard_price = 0` — "fatura girişinde yazarız" dedi,
  şimdi girilmeyecek.
- **Barkodu boş olan 7 satır:** barkodsuz oluşturulacak (`barcode = false`), atlanmayacak.
- **Kategori:** hepsi aynı — "All / LENS / STANDART"
- **KDV:** hepsi %10

## Kaynak endpoint — referans alın, aynı mantığı kullanın

`admin.controller.ts` → `POST /admin/odoo-sablon-olustur` (satır ~5623), zaten "Ürün
Yapılandırma" ekranındaki tek-tek "Yeni şablon oluştur" formunun kullandığı, çalışan endpoint.
Script'i bunun **aynı `product.template` alan mantığıyla** yazın (aynı endpoint'i HTTP ile 37 kez
çağırmak yerine, script içinde aynı `tmplData` şeklini oluşturup doğrudan `execute()` ile Odoo'ya
yazmanız daha basit/güvenilir olur — HTTP auth'a uğraşmayın):

```ts
{
  name: row.ad,
  type: 'product',
  categ_id: categId,                 // aşağıda çözülecek
  list_price: 0,
  standard_price: 0,
  default_code: false,               // Excel'de iç referans yok, boş bırakın
  barcode: row.barkod || false,
  sale_ok: true,
  purchase_ok: true,
  can_be_expensed: false,
  invoice_policy: 'order',
  tracking: 'lot',
  company_id: 1,
  taxes_id: [[6, 0, [taxId]]],       // aşağıda çözülecek
}
```

## Script adımları

1. **Kategori çözümü (bir kere):** `product.category.search_read` ile `complete_name = 'All /
   LENS / STANDART'` olan kaydı bulun. Yoksa hata verip durun — kategoriyi kafanıza göre
   oluşturmayın, bana sorun.
2. **Vergi çözümü (bir kere):** `account.tax.search_read` ile `type_tax_use='sale'` ve
   `amount=10` olan kaydı bulun. Yoksa yine durup bana sorun (muhtemelen zaten var, ama garanti
   olsun).
3. **Idempotent olun:** her satır için önce aynı `name` (tam eşleşme) veya (varsa) aynı `barcode`
   ile mevcut bir `product.template` var mı kontrol edin — varsa **atlayın**, tekrar
   oluşturmayın (script yarıda kesilip tekrar çalıştırılabilir olsun).
4. 37 satırı sırayla oluşturun, her biri için sonucu (`created` / `skipped-duplicate` / `error`)
   loglayın.
5. Sonunda özet: kaç oluşturuldu, kaç atlandı, hata olan var mı.

## Veri (37 satır — tam liste, Excel'den birebir)

```
ad,barkod
ULTRA KONTAKT LENS 0000,
ULTRA KONTAKT LENS -0025,
ULTRA KONTAKT LENS -0050,
ULTRA KONTAKT LENS -0075,
ULTRA KONTAKT LENS -0100,785811314545
ULTRA KONTAKT LENS -0125,785811314552
ULTRA KONTAKT LENS -0150,785811314569
ULTRA KONTAKT LENS -0175,785811314576
ULTRA KONTAKT LENS -0200,785811314583
ULTRA KONTAKT LENS -0225,785811314590
ULTRA KONTAKT LENS -0250,785811314606
ULTRA KONTAKT LENS -0275,785812139741
ULTRA KONTAKT LENS -0300,785812139758
ULTRA KONTAKT LENS -0325,785812139765
ULTRA KONTAKT LENS -0350,785811314644
ULTRA KONTAKT LENS -0375,785811314651
ULTRA KONTAKT LENS -0400,785811314668
ULTRA KONTAKT LENS -0425,785811314675
ULTRA KONTAKT LENS -0450,785811314682
ULTRA KONTAKT LENS -0475,785811314699
ULTRA KONTAKT LENS -0500,785811314705
ULTRA KONTAKT LENS -0525,785811314712
ULTRA KONTAKT LENS -0550,785811314729
ULTRA KONTAKT LENS -0575,785812139864
ULTRA KONTAKT LENS -0600,785811314743
ULTRA KONTAKT LENS -0650,785811314750
ULTRA KONTAKT LENS -0700,785811314767
ULTRA KONTAKT LENS -0750,785811314774
ULTRA KONTAKT LENS -0800,785811314781
ULTRA KONTAKT LENS -0850,
ULTRA KONTAKT LENS -0900,785811314804
ULTRA KONTAKT LENS -0950,785811314811
ULTRA KONTAKT LENS -1000,785811314828
ULTRA KONTAKT LENS -1050,785812139963
ULTRA KONTAKT LENS -1100,785812139970
ULTRA KONTAKT LENS -1150,785812139987
ULTRA KONTAKT LENS -1200,785811314866
```

## Test / Rapor formatı

Script çıktısını (kaç oluşturuldu/atlandı/hata) + "Ürün Yapılandırma" ekranında bu 37 kaydın
göründüğünü (kategori "All / LENS / STANDART", şirket Güven Optik 1959, izleme "Lot", vergi %10
olarak) 2-3 örnekle ekran görüntüsüyle doğrulayın.
