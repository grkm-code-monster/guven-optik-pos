# ZAROSSI barkodları hâlâ "zaten kayıtlı" — test scripti gerçek import mi yaptı?

## Durum

`ARSIVLEME_BARKOD_UTS_DELETE_PREFIX_TALIMATI.md` raporunda "Test 5" (ZAROSSI barkodları:
22442529, 22442680, 22442697, 86932839003381) canlı Odoo'ya karşı gerçek
`uygulaEnvanterImport()` çağrısı yaptı ve "4/4 başarılı" dedi — ama bu bir test/rollback ortamı
DEĞİL, GERÇEK VERİTABANI. Şimdi Görkem Depo Yönetimi → Excel Envanter ekranından AYNI 4 satırı
tekrar yüklemeye çalışınca yine "Barkod Odoo'da zaten kayıtlı" hatası alıyor.

**Kuvvetle muhtemel açıklama:** test scripti bu barkodları GERÇEKTEN yeniden içe aktardı (yeni
`product.product` kayıtları/lot'lar oluşturdu) ve script bunları TEMİZLEMEDİ (test 1/3/4'teki gibi
`unlink` ile geri almadı — sadece test 5'in sonunda hiçbir rollback/cleanup kodu yok). Yani Görkem
şu an AYNI envanteri İKİNCİ KEZ aktarmaya çalışıyor olabilir ve hata bu yüzden DOĞRU/beklenen bir
davranış olabilir — gerçek bug değil.

## İstenen — ÖNCE TEŞHİS, KOD DEĞİŞİKLİĞİ YAPMADAN

1. Şu an Odoo'da barkod 22442529, 22442680, 22442697, 86932839003381 için `product.product`
   `search_read` yapın (`context: {active_test:false}` ile, hem aktif hem arşivli dahil). Her
   barkod için KAÇ KAYIT var, hangileri `active=true`, hangileri `DELETE_` önekiyle arşivde,
   raporlayın.
2. Eğer test scripti sırasında GERÇEKTEN yeni aktif kayıtlar oluşmuşsa (yani ZAROSSI test 5
   çalıştığında oluşan ürünler hâlâ orada duruyorsa): bu kayıtların `stock.quant`/`stock.lot`
   durumunu (ANADEPO'da 1'er adet, doğru/temiz lot no + UTS kodu) kontrol edip Görkem'e "envanteriniz
   ZATEN başarıyla sisteme girdi, tekrar yüklemenize gerek yok" diye AÇIKÇA raporlayın.
3. Eğer öyle değilse (kayıtlar bir şekilde silinmiş/geri alınmışsa ama barkod hâlâ ARŞİVDE eski
   haliyle duruyorsa, yani `DELETE_` önekini almamışsa), o zaman `DELETE_` önek mekanizmasının
   NEDEN bu 4 kayıt için çalışmadığını (idempotency kontrolü, ctx/company_id uyuşmazlığı,
   vs.) araştırıp gerçek kök nedeni bulun ve düzeltin.
4. Test scriptinin GERÇEK/canlı veri üzerinde çalıştığında (özellikle "Test 5" gibi gerçek barkodlu
   senaryolarda) kalıcı yan etki bırakmaması için script disiplinini gözden geçirin — ileride
   benzer testler için canlı veriyi sessizce değiştirip temizlememe riskini not edin.

## Rapor formatı

4 barkodun şu anki GERÇEK Odoo durumu (kaç kayıt, hangisi aktif/arşivli, stok/lot bilgisi) +
Görkem'e net bir "ne yapması gerekiyor" talimatı (tekrar yüklesin mi, yüklemesin mi).
