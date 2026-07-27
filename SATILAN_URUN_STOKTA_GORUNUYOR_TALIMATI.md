# Satılan ürün hâlâ stokta görünüyor — "Standart 4/2 %25 İnceltme Beyaz -0350 0075"

## Durum

Görkem bu ürünü sattı ama stok ekranında hâlâ mevcut görünüyor — stok gerçek satış sonrasında
düşmüyor.

## Kod tarafı — güçlü hipotez

`sale.service.ts` satır 954-969, satış Odoo'ya işlenirken:

```ts
await execute('sale.order', 'action_confirm', [[odooOrderId]], {}, taxCompanyId);

try {
  const pickings = await execute('stock.picking', 'search_read',
    [[['sale_id', '=', odooOrderId], ['state', 'not in', ['done', 'cancel']]]],
    { fields: ['id', 'state'], limit: 10 }, taxCompanyId);
  for (const picking of pickings) {
    await execute('stock.picking', 'button_validate', [[picking.id]], {}, taxCompanyId);
  }
} catch (deliveryErr) {
  console.error('[Odoo] Teslimat hatası:', deliveryErr);   // ← sessizce yutuluyor
}
```

**`button_validate` başarısız olursa (veya Odoo bir "backorder" / "immediate transfer" onay
sihirbazı dönerse) hata sadece console'a loglanıyor, satış akışı yine de "başarılı" görünüyor.**
Picking `done` durumuna geçmezse stok kaynak lokasyonundan hiç düşmez — bu, tam olarak
gözlemlenen belirtiyle örtüşüyor.

Odoo'nun bilinen bir davranışı: yetersiz rezerve edilmiş miktar/lot uyuşmazlığı gibi durumlarda
`button_validate` direkt "done" yapmak yerine bir **wizard action** (`stock.backorder.confirmation`
veya benzeri) döndürür — bizim kodumuz bu wizard'ı hiç ele almıyor, tek `execute` çağrısıyla
bırakıyor.

## İstenen — önce teşhis

1. Bu satışın Odoo `sale.order` kaydını bulun (POS Satış ID notundan), bağlı `stock.picking`
   kaydının/kayıtlarının şu anki `state`'ini raporlayın — `done` mu, yoksa `confirmed`/`assigned`/
   başka bir ara durumda mı takılı kalmış?
2. Eğer takılıysa: o an `button_validate` çağrıldığında Odoo'nun gerçekte ne döndürdüğünü
   (hata mı, bir wizard action dict'i mi) bulun — backend loglarında `[Odoo] Teslimat hatası:`
   satırını arayın, tam hata mesajını raporlayın.
3. Bu ürünün lotlu/lotsuz takip edildiğini, picking satırında beklenen miktar ile mevcut/rezerve
   miktarın uyuşup uyuşmadığını kontrol edin (yetersiz stok rezervasyonu olası bir sebep).

## Düzeltme (teşhis sonucuna göre)

1. `button_validate` başarısız olursa **satışı görünürde başarılı bırakmayın** — en azından
   frontend'e/loglara açık bir uyarı düşün ("stok düşürülemedi, elle kontrol edin") ki bu sessizce
   kaybolmasın.
2. Eğer sorun bir onay sihirbazıysa (backorder vb.), `button_validate` sonrası dönen action'ı
   kontrol edip gerektiğinde ikinci bir çağrıyla (örn. `stock.immediate.transfer` veya
   `stock.backorder.confirmation` modelinde `process()`) işlemi tamamlayacak şekilde akışı
   genişletin.
3. Zaten stokta takılı kalmış bu spesifik ürün için mevcut picking'i bulup elle/scriptle
   tamamlayarak (ya da iptal edip doğru şekilde yeniden oluşturarak) stoğu düzeltin.

## Test

Aynı ürünü (veya benzer, düşük/sınırda stoklu bir ürünü) tekrar satıp picking'in gerçekten `done`
durumuna geçtiğini, stok ekranında miktarın düştüğünü kanıtlayın. Ayrıca kasıtlı olarak yetersiz
stoklu bir üründe artık sessiz başarısızlık yerine görünür bir hata/uyarı çıktığını gösterin.

## Rapor formatı

Teşhis sonuçları + gerçek Odoo hata/wizard içeriği + düzeltme diff'i + öncesi/sonrası stok
ekran görüntüsü.
