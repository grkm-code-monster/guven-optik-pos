# ULTRA KONTAKT LENS ürünlerinde Stok Kontrol'de lot/UTS kaydı hiç görünmüyor

## Durum

Görkem, ULTRA KONTAKT LENS ürünlerini (örn. barkod 785812139987 "ULTRA KONTAKT LENS -1150",
785812139970 "-1100", 785811314804 "-0900") "tek tek" (manuel) ve "faturalı giriş" ile
`POST /urun-giris` üzerinden sisteme girdi — bu ürünlerin ANADEPO'da gerçek stoğu var. Ama Stok
Kontrol'ün yeni Lot/UTS açılır panelinde bu ürünler için "Bu ürün için lot/UTS kaydı yok" boş
mesajı çıkıyor. Görkem'in beklentisi buradan lot seçip transfer yapabilmekti — bu akış şu an
tamamen kapalı.

## Şu ana kadar okuma yoluyla (kod değişikliği yapmadan) bulduklarım

1. **`admin.controller.ts` içinde `POST /urun-giris`'in lot oluşturma adımında (satır ~2955)
   kesin bir hata var:**

   ```ts
   const { lotId } = await getOrCreateStockLot(lot.lotNo, productId, cid, lot.barkod);
   ```

   `getOrCreateStockLot` (`stock-lot.service.ts` satır 53) 5. parametre olarak `utsKodu` kabul
   ediyor ve doluysa `stock.lot.x_uts_kodu` alanına yazıyor — ama bu çağrıda `lot.utsKodu` HİÇ
   geçilmiyor. Yani `/urun-giris` akışından girilen HİÇBİR ürünün UTS kodu `stock.lot`'a
   yazılmıyor olmalı, kullanıcı ekranda ne girmiş olursa olsun. Bu KESİN bir bug — düzeltilmesi
   gerekiyor:

   ```ts
   const { lotId } = await getOrCreateStockLot(lot.lotNo, productId, cid, lot.barkod, lot.utsKodu);
   ```

2. Ancak bu tek başına "hiç lot kaydı yok" görünümünü açıklamaz — UTS eksik olsa bile lot'un
   kendisi (`lotNo`/seri no) Stok Kontrol panelinde görünmesi beklenir (`mapQuantToUrun` fonksiyonu
   `stock.quant.lot_id` doluysa lot adını zaten gösteriyor, UTS'den bağımsız). Yani `stock.quant`
   satırında `lot_id` hiç dolu değil ya da Stok Kontrol'ün sorguladığı lokasyonda o ürüne ait HİÇ
   `stock.quant` satırı yok gibi görünüyor. Kesin kök nedeni AŞAĞIDAKİ teşhis olmadan bilemiyorum —
   varsayım yapmadan, gerçek veriyle doğrulamamız lazım.

3. `import-ultra-kontakt-lens-sablon.ts` scriptine göre bu ürünler `tracking: 'lot'` ile
   oluşturulmuş (yani tracking yanlış ayarlanmış değil — bu ihtimal muhtemelen elenir, ama
   YİNE DE aşağıdaki teşhiste ürünün GÜNCEL `tracking` değerini teyit edin, biri sonradan
   değiştirmiş olabilir).

## İstenen — ÖNCE TEŞHİS (kod değişikliği yapmadan), SONRA düzeltme

### 1) Teşhis

Repo'da zaten hazır bir okuma-amaçlı script var: `backend/scripts/diag-ultra-lens-lot-uts.ts`.
Çalıştırın:

```
cd backend && npx tsx scripts/diag-ultra-lens-lot-uts.ts
```

Bu script barkod 785812139987, 785812139970, 785811314804 için: ürünün `tracking`/`company_id`/
`active` durumunu, `stock.lot` kayıtlarını, TÜM lokasyonlardaki `stock.quant` kayıtlarını (lot_id
dahil) ve `stock.move.line` geçmişini (lot_id, state, kaynak/hedef lokasyon) basıyor. Çıktıyı
tam olarak raporlayın.

Buradan şunu netleştirin:
- `stock.quant` satırı(ları) var mı, hangi lokasyonda, `lot_id` dolu mu boş mu?
- `stock.move.line` kayıtlarında `lot_id` yazılmış mı, `state='done'` mu?
- Eğer `stock.quant.lot_id` boşsa: bu ürünler için `/urun-giris` çağrısı sırasında lot oluşturma
  adımı (`getOrCreateStockLot`/`assignLotsAndValidatePicking`) gerçekten çalışmış mı, yoksa
  sessizce hataya düşüp (`hatalar` dizisine yazıp) picking lot'suz mu tamamlanmış? Bunun için
  aynı ürünlerin geçmiş `/urun-giris` çağrılarına ait backend loglarını (varsa) veya bu ürünlerin
  bağlı olduğu `stock.picking`/`purchase.order` kayıtlarının durumunu da kontrol edin.
- Stok Kontrol'ün lot panelinin sorguladığı `sube`/lokasyon (`transfer.service.ts`
  `searchUrunLotsByProduct` → `fetchQuantsAtLocation`) ile ürünün GERÇEKTE stoklu olduğu lokasyon
  (ANADEPO mu, başka bir şirket/şube mi) eşleşiyor mu? `company_id` uyuşmazlığı olabilir mi?

### 2) Kesin bulunan bug'ı düzeltin

`admin.controller.ts` satır ~2955'teki `getOrCreateStockLot` çağrısına `lot.utsKodu` parametresini
ekleyin (yukarıdaki kod bloğu). Bu, bundan sonraki TÜM `/urun-giris` girişlerinde UTS kodunun
doğru yazılmasını sağlayacak.

### 3) Teşhise göre kök nedeni düzeltin

Teşhis sonucuna göre (örnekler — hangisi doğruysa onu uygulayın, varsayım yapmayın):
- Eğer `stock.quant.lot_id` gerçekten boşsa ve `stock.move.line`'da da lot atanmamışsa:
  `assignLotsAndValidatePicking`'in bu ürünler için NEDEN çalışmadığını/atlandığını bulun (hata
  yutulmuş olabilir — `hatalar` dizisine düşüp kullanıcıya "başarılı" gibi görünmüş olabilir,
  kontrol edin).
- Eğer lokasyon/şirket uyuşmazlığıysa: Stok Kontrol'ün lot sorgusunun doğru lokasyonu
  hedeflemesini sağlayın.
- Eğer geçmiş kayıtlarda gerçekten hiç lot oluşmamışsa (yani bu ürünler o zamanki bug yüzünden
  lot'suz stoğa girmiş): mevcut stoklu ama lot'suz bu ürünler için GERİYE DÖNÜK bir düzeltme
  gerekip gerekmediğini (örn. mevcut `stock.quant`'a manuel lot ataması) değerlendirin ve
  Görkem'e "eski girişler lot'suz kaldı, yeni girişler düzelecek" mi yoksa "eskilerini de
  düzeltebiliriz" mi net şekilde raporlayın — kör bir toplu düzeltme yapmayın, önce raporlayın.

## Test

1. Düzeltme sonrası YENİ bir `/urun-giris` (test ortamında, mevcut ürünlerden biriyle, gerçek
   barkod kullanmadan — çakışma yaratmayın) ile UTS kodunun `stock.lot.x_uts_kodu`'na yazıldığını
   ve Stok Kontrol panelinde lot+UTS'in göründüğünü doğrulayın.
2. 3 gerçek ULTRA KONTAKT LENS barkodunun (785812139987, 785812139970, 785811314804) teşhis
   sonucunu ve (varsa) geriye dönük düzeltme sonrası son durumunu raporlayın.

## Rapor formatı

Teşhis script çıktısı (tam) + kök neden açıklaması + yapılan kod düzeltmesi (dosya/satır) +
geriye dönük düzeltme gerekip gerekmediği + test sonucu.
