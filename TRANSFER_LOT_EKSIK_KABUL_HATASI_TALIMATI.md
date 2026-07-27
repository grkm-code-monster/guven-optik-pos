# Transfer kabul hatası — lot/seri eksik (ADESE/IN/00025, TRANSFER-1784101433075)

## Hata

GVN3'te "Kabul Et" denendiğinde: `XML-RPC fault: Ürünler için bir Lot / Seri numarası sağlamanız
gerekir: - OSSE OPTİK ÇERÇEVE`

## Kök neden (kod üzerinden doğrulandı)

`kabulSirketlerArasiTransfer()` (`sirketler-arasi-transfer.service.ts`) hedef picking'in
`stock.move.line`'ına sadece `quantity` yazıyor, `lot_id`'ye dokunmuyor — çünkü `lot_id`'nin
"başlat" aşamasında zaten yazılmış olması bekleniyor (`resolveHedefLotId()` fonksiyonu üzerinden).
Ama `resolveHedefLotId()`:

```ts
if (!kalem.lotId) return undefined;
```

Bu transfer için kalemde `lotId` hiç gelmemiş — muhtemelen "Yeni Transfer" ekranında ürün
seçilirken spesifik bir lot seçilmeden devam edilmiş (OSSE OPTİK ÇERÇEVE lot/seri takipli bir ürün).
Bu yüzden hedef picking satırına hiç lot yazılamamış, Odoo kabul/validate sırasında reddediyor.

## İstenen — iki ayrı adım

### 1) Bu sıkışmış transferi (ADESE/IN/00025) tamamlama — ÖNCE TEŞHİS, SONRA UYGULA

1. Kaynak tarafta (NG/ANADEPO) bu transferin çıkış picking'ini bulun, hangi gerçek lottan
   (muhtemelen bu oturumda retrofix edilen `GRS-2026-07-9291-S01-001` / NG'nin yeni lotu) stok
   düştüğünü teyit edin.
2. O lotun adını kullanarak ADESE (hedefSirketId) altında aynı isimli bir lot bulun/oluşturun
   (bu oturumda Lot #105 retrofix'inde uygulanan "aynı isimle yeni şirkette lot" mantığının aynısı).
3. ADESE/IN/00025 picking'inin move line'ına bu lot id'sini yazıp validate edin.
4. **Bu canlı/gerçek bir stok kaydı — uygulamadan önce hangi lotu kullanacağınızı ve adımları bana
   kısaca bildirin, onay sonrası uygulayın.** Mükerrer lot/stok oluşturma riskine karşı dikkatli
   olun (daha önce Lot #105'te yaşadığımız gibi).

### 2) Kalıcı düzeltme — aynı hata bir daha olmasın

1. `baslatSirketlerArasiTransfer` (ve aynı mantığı kullanan şirket-içi transfer akışı) için: lot/seri
   takipli bir ürün (`tracking != 'none'`) transfere eklenirken `kalem.lotId` boşsa, transferi
   **başlatmadan önce** net bir hata döndürün ("Bu ürün lot/seri takipli, transfer için lot
   seçilmeli" gibi) — şu anki gibi sessizce geçip kabul aşamasında (başka bir kullanıcı, başka bir
   ekranda) patlamasın.
2. "Yeni Transfer" ekranında (POS ve admin panel ikisinde de) lot/seri takipli ürün seçildiğinde
   lot seçimi zorunlu olsun (dropdown/liste ile mevcut lotlardan seçtirin), boş bırakılamasın.
3. Bu değişikliği yaptıktan sonra, aynı senaryoyu (lot takipli bir ürünle, lot seçmeden transfer
   başlatmayı) deneyip artık en baştan engellendiğini doğrulayıp bana rapor edin.

## Rapor formatı

Madde 1 için: hangi lotu kullanacağınız + adımlar (onay bekleyin, sonra uygulayın, sonucu Odoo
ekran görüntüsüyle doğrulayın). Madde 2 için: değişiklik + yeni bir test transferiyle artık erken
engellendiğinin kanıtı.
