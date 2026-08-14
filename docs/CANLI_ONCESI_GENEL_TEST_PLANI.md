# Güven Optik POS — Canlı Öncesi Genel Test Planı
Hazırlanma: 13.08.2026 · Ortam: **pos.guvenoptik.net.tr (production)**

## Nasıl kullanılır
- Aşağıdaki bölümleri **sırayla** takip edin — sıralama bilinçli: önce günlük en çok kullanılacak
  akış (Satış), sonra onu destekleyen akışlar (Stok, Transfer), sonra mali/yasal kritik akışlar
  (e-Fatura, UTS), en sonda arka ofis ekranları (Raporlar, İK, Patron Paneli).
- Her maddenin yanına ✅ / ❌ yazın, hata varsa kısa not düşün. En sonda toplu bir "Sonuç Tablosu"
  var, oraya özet geçin.
- Gerçek müşteri/ürün kullanmayın — test için özel bir isim kullanın: **"TEST MÜŞTERİ"**.
  Test satışlarını sonda birlikte gözden geçirip gerekirse VOID edelim (gerçek Odoo faturası
  kesiliyor, bu yüzden rastgele denemeyin — bu planı takip edin).
- Farklı rollerle giriş gerekecek: **Admin/Sistem Yöneticisi**, en az bir **kasiyer**, en az bir
  **şube müdürü**. Elinizde yoksa bana söyleyin, birlikte test kullanıcısı oluşturalım.
- Bir adımda beklenmedik bir şey görürseniz **durmayın, not edin, devam edin** — sonda hepsini
  birlikte değerlendiririz.

---

## Bölüm 0 — Temel Sağlık Kontrolü (5 dk)

- [ ] `pos.guvenoptik.net.tr` açılıyor, giriş ekranı düzgün görünüyor
- [ ] Admin hesabıyla giriş yapılabiliyor
- [ ] Kasiyer hesabıyla giriş yapılabiliyor
- [ ] Şube müdürü hesabıyla giriş yapılabiliyor
- [ ] Giriş sonrası PDKS uyarısı normal görünüyor mu (varsa) — "Vardiya açık değil" gibi mesajlar
      bilinen bir davranış, hata değil

---

## Bölüm 1 — Satış Akışı (EN KRİTİK, ~20 dk)

Bu, sistemin kalbi — her gün defalarca kullanılacak. En detaylı test burada.

1. Kasiyer hesabıyla giriş yapın, vardiya açık değilse müdür onayıyla açın.
2. **Yeni Satış** → Müşteri: "TEST MÜŞTERİ" (bireysel, VKN boş) seçin/oluşturun.
3. **Kalem Ekle** ile ürün arayın:
   - [ ] Ürün adıyla arama çalışıyor (örn. bir çerçeve markası yazın)
   - [ ] **"OTTO OPTİK" yazınca artık ürünler çıkıyor mu?** (bu oturumda düzeltildi, özellikle kontrol edin)
   - [ ] Model koduyla arama (örn. sadece "2140" yazın, RAYBAN yazmadan) sonuç veriyor mu
4. En az 1 çerçeve + 1 cam ekleyin (varsa reçeteli satış deneyin — SPH/CYL/AKS/ADD alanları).
5. **Ölçümler** modalı: "Standart" butonu montaj ölçülerini otomatik dolduruyor mu?
6. Personel giriş yapan kullanıcı uygunsa **Personel Fiyatı** checkbox'ını işaretleyin:
   - [ ] Checkbox **tek** görünüyor mu (2 kere görünme hatası düzeltildi, kontrol edin)
   - [ ] Maliyet/KDV/"%20 kârla hesaplandı" yazısı **görünmüyor** mu (müdürlerden gizlenmesi gerekiyordu)
7. İskonto uygulayın (örn. %10).
8. Ödeme adımı:
   - [ ] Nakit ödeme seçilebiliyor
   - [ ] Kredi kartı + banka/POS seçimi çalışıyor, "Manuel POS" seçeneği var
   - [ ] Açık Hesap seçeneği çalışıyor (test müşterisiyle deneyebilirsiniz)
9. **Satışı Onayla.**
10. Onay sonrası kontrol edin:
    - [ ] Satış PDF'i (fiş) indirilebiliyor, çerçeve-cam ilişkisi ve montaj ölçüleri tabloda görünüyor
    - [ ] Stok durumu tutarlı mı — Kalem ekranında, Stok Sorgula'da ve PDF'te aynı şeyi mi söylüyor
    - [ ] Satışlar listesinde yeni satış görünüyor, Durum/Tutar kolonları doğru
11. **Kart Bas (ZC100)** kullanıyorsanız: çoklu kalem + reçete bilgisi karta basılıyor mu?
12. Bir satışı **onaylamadan yarım bırakıp** çıkın, geri dönün — taslak (draft) korunuyor mu?

---

## Bölüm 2 — Stok Sorgula & Ürün Arama (10 dk)

Bu oturumda tamamen yenilendi, özellikle test edin.

1. **Stok Sorgula** ekranına girin.
2. "2140" arayın:
   - [ ] Tek bir ürün kartı olarak gruplanmış geliyor mu (aynı varyant tekrar tekrar listelenmiyor)
   - [ ] Karta tıklayınca **lokasyon + UTS/Lot-Seri kırılımı** açılıyor mu
3. "C1" arayın:
   - [ ] Niteliğinde C1/C1M/C15M vb. olan **tüm** çerçeve/güneş gözlüğü varyantları geliyor mu
     (sadece isim değil, nitelik eşleşmesi)
4. Lokasyon filtresiyle (örn. tek bir şube) daraltıp tekrar arayın — sonuç filtreleniyor mu?
5. "Sadece stokta olanlar" işaretini kaldırıp deneyin — stoksuz ürünler de geliyor mu?
6. Onaylanmış bir satıştaki ürünün artık "kullanılabilir" stokta **görünmediğini** doğrulayın.

---

## Bölüm 3 — Transfer (Depo/Şube arası, ~20 dk)

### 3a. Lot Transfer (aynı/farklı şirket)
1. **Depo Yönetimi → Transferler → Lot Transfer.**
2. Kaynak şube/depo seçin, ürün arayın, lot/UTS seçin, hedef şube seçin, **Transfer Oluştur.**
3. Hedef şube kullanıcısıyla giriş yapıp **Gelen Transferler**'den transferi **Kabul Et.**
4. Kontrol:
   - [ ] Kaynak stok düştü, hedef stok arttı (Stok Sorgula'dan doğrulayın)
   - [ ] Farklı şirketler arası ise (örn. NG→ADESE): e-Fatura kuyruğa girdi mi? (Muhasebe/Finans → Faturalar)
   - [ ] UTS bildirim kuyruğuna VERME/ALMA kaydı düştü mü? (UTS Yönetimi → Kuyruk)
   - [ ] İrsaliye PDF alınabiliyor mu?

### 3b. Stok Kontrol'den transfer
1. **Stok Yönetimi → Stok Kontrol** sekmesine girin.
2. Bir ürünü açıp lot/UTS listesini görün, oradan doğrudan transfer başlatın.
3. [ ] Odoo "Lot/Seri numarası sağlamanız gerekir" hatası **almıyor** musunuz (bu, daha önce
      düzeltilen bir sorundu — tekrar çıkarsa bana bildirin)

---

## Bölüm 4 — e-Fatura / e-İrsaliye / UTS (KRİTİK — yasal, ~15 dk)

1. Bölüm 1'de yaptığınız satış için: **Muhasebe → Faturalar** (veya Raporlar → e-Fatura).
   - [ ] Satışın faturası kuyrukta/gönderilmiş görünüyor mu, durumu ne (BEKLIYOR/GONDERILDI/HATA)?
   - [ ] HATA ise "Yeniden Gönder" deneyin, sonucu not edin.
2. Bölüm 3'te yaptığınız şirketler arası transfer için:
   - [ ] Gerçek Uyumsoft fatura numarası oluştu mu (sadece Odoo iç kaydı değil)?
3. **UTS Yönetimi → Bildirim Kuyruğu:**
   - [ ] Bekleyen bildirimler listeleniyor mu
   - [ ] Şube token'ı girilmiş bir şubede "Toplu Gönder" deneyin
   - [ ] UTS Dış Firma Rehberi'nde NG/ADESE/POTENTIAL firmaları listeleniyor mu

---

## Bölüm 5 — Açık Hesap (10 dk)

1. **Açık Hesap** ekranına girin, TEST MÜŞTERİ'nin bakiyesini bulun.
2. Kısmi ödeme yapın (birden fazla açık satışı olan bir müşteride, varsa).
3. [ ] Ödeme doğru satış(lar)a dağıtılıyor mu (FIFO mantığı)
4. [ ] Odoo'da fatura/ödeme mutabakatı gerçekleşiyor mu (Odoo tarafında kontrol edilebilirse)
5. [ ] Vadesi geçen açık hesap görevi Kontrol Paneli'nde/Görevler'de çıkıyor mu

---

## Bölüm 6 — Garanti & İade (10 dk)

1. Onaylanmış bir test satışı üzerinden **Garanti & İade** talebi açın.
2. [ ] "Tamamlanmış satış bulunamadı" hatası **almıyor** musunuz (bilinen bir sorundu, hâlâ
      açık olabilir — çıkarsa not edin)
3. Talebi onaylayıp transfer/tedarikçi akışını tamamlayın, PDF/mesaj kısmını deneyin.

---

## Bölüm 7 — Özel Sipariş (10 dk)

1. **Depo → Siparişler** (veya ilgili ekran) → yeni özel sipariş oluşturun.
2. Karekod ile teslim alma adımını deneyin.
3. [ ] Durum bildirimleri (şube yöneticisi/depo) doğru tetikleniyor mu
4. [ ] Müşteri teslim adımında WhatsApp (wa.me) linki oluşuyor mu

---

## Bölüm 8 — Excel Envanter & Sayım (10 dk)

1. **Depo → 📊 Excel Envanter** → şablon indirin, birkaç satır doldurup önizleme yapın (gerçek
   veriye yazmadan önce önizlemede durun).
2. Emin olduğunuzda küçük bir test partisiyle gerçek yazmayı deneyin, Odoo'da yansıdığını kontrol edin.
3. **Depo → Sayım** sekmesinde bir sayım yapıp kaydedin:
   - [ ] Başarı mesajı gerçekten Odoo'ya yazıldığını mı gösteriyor, yoksa sessiz hata mı var
        (geçmişte bilinen bir sorundu — mutlaka Odoo tarafında da doğrulayın)

---

## Bölüm 9 — Etiket Bas & PROMAX (10 dk + mağaza testi)

1. **Etiket Bas** modalını açın, bir üründe adet girin.
2. [ ] Girilen adet **PDF çıktısında** doğru yansıyor mu (bilinen açık bir sorun — hâlâ çıkabilir)
3. **Stok Yönetimi** varyant akışında etiket adedinin stoktan otomatik dolduğunu doğrulayın.
4. **PROMAX yazıcıyla fiziksel test basımı** — bu adımı mağazada gerçek yazıcıyla yapın (daha
   önce hiç denenmemişti). Barkod/UTS okunabilirliğini, boyut/hizalamayı kontrol edin.

---

## Bölüm 10 — Fiyatı Değişen Ürünler (5 dk)

1. **Stok Sorgula → Fiyatı Değişen Ürünler** sekmesine girin.
2. [ ] Etiket basılması gereken ürünler listeleniyor mu, "Etiket Bas" ve "okundu" işaretleme çalışıyor mu

---

## Bölüm 11 — Laboratuvar (varsa atölye şubesi, 10 dk)

1. Atölye rolüyle giriş yapıp bir işi laboratuvar sürecine alın.
2. Kırılma/hasar bildirimi deneyin.
3. [ ] Rapor entegrasyonuna yansıyor mu

---

## Bölüm 12 — Kargo Tara (5 dk)

1. Bir transferi Kargo Tara ile tarayın.
2. [ ] "Beklenen adet" doğru gösteriliyor mu (qty:2 girilen bir kalemde geçmişte 1 gösteriyordu)
3. [ ] "Taranan kodları gönder" butonu aktifleşiyor mu

---

## Bölüm 13 — Raporlar & PDF Çıktıları (15 dk)

| Ekran | Kontrol |
|-------|---------|
| Satış detay | Fiş PDF indir — logo, tarih, şube adı, imza alanları doğru mu |
| Transfer detay | İrsaliye PDF indir |
| Stok Sorgula | Stok raporu PDF |
| Raporlar → Satış Raporu | Bugünün tarihiyle filtrele, az önceki test satışı görünüyor mu |
| Günlük Kasa Raporu | Nakit/kart/SGK/vakıf toplamları doğru mu |
| Rapor Matrisi | En az bir özel rapor deneyin |

---

## Bölüm 14 — Patron Görünümü (10 dk)

1. ADMIN rolüyle **Patron Paneli**'ne girin.
2. [ ] Bugünkü satışlar görünüyor mu (geçmişte bir satış hiç görünmüyordu — kontrol edin)
3. [ ] Mağaza Özeti, Personel performans, Aylık hedef kartları dolu mu
4. **Şirket Karlılık Raporu** henüz yapılmadı — bu bölümde eksik olması normal, bekleyen bir iş.

---

## Bölüm 15 — İK & Prim & PDKS (10 dk)

1. **İK & Prim** ekranına girin, personel listesini kontrol edin.
2. [ ] PDKS senkronu çalışıyor mu (mekan ID'leri olan şubeler için)
3. [ ] Personel-Odoo eşleştirmesi Tanımlamalar ve İK ekranlarında **tutarlı** görünüyor mu (iki
      ayrı yerden bağlanan biri her iki ekranda da "bağlı" görünmeli)
4. Prim hesaplama kurallarını bir personelde deneyin.

---

## Bölüm 16 — Muhasebe & Finans (10 dk)

1. **Muhasebe** → dashboard, faturalar, cari hesaplar genel görünümü kontrol edin.
2. **Finans Yönetimi** → SGK/Vakıf ödeme kaydı, banka listesi (Tanımlamalar'dan yönetilebilir mi).
3. **Masraflar** ekranından bir test masraf girin, Odoo `hr.expense`'e düştüğünü kontrol edin.

---

## Bölüm 17 — Kontrol Paneli, Görevler, Bildirimler, Chatbot (10 dk)

1. **Kontrol Paneli → Görevler** — tüm görev kartları tıklanabiliyor mu (geçmişte sadece "Yarım
   kalan satış" tıklanabiliyordu).
2. Bildirim zilini kontrol edin, okundu işaretleme çalışıyor mu.
3. Chatbot'a birkaç soru sorun:
   - "Satış nasıl yapılır?"
   - "UTS token nereden alınır?"
   - Kasiyer rolüyle: "Tüm şubelerin stok raporunu görmek istiyorum" → kısıtlama mesajı vermeli

---

## Bilinen açık maddeler — test sırasında karşılaşırsanız şaşırmayın

Bunlar zaten bildiğimiz, henüz çözülmemiş konular. Test sırasında çıkarsa **not edin ama takılıp
kalmayın**, bunlar ayrı iş kalemleri:

- Reçeteye uygun stok cam önerisi kayboldu
- Açık Hesap: 30 gün sonra otomatik WhatsApp hatırlatma henüz yok
- Finans: "Mahsuptaki Ödemeler" (SGK/Vakıf tahsilat) takip alanı yok
- Müşteriler → Satışları Gör ekranına geçince arama sonuç getirmeyebilir
- Uyumsoft'a fatura düşmeme + admin kullanıcı şube ataması belirsizliği (üzerinde çalışılıyor)
- Satış onaylanınca e-fatura **otomatik** tetiklenmiyor olabilir (manuel tetikleme gerekebilir)
- OTTO OPTİK ÇERÇEVE Odoo'da hâlâ standart bir kategoriye atanmamış (arama artık çalışıyor ama
  kategori filtresiyle arandığında çıkmayabilir)
- Eski Odoo'dan veri aktarımı henüz yapılmadı
- UTS Envanteri Excel'i ile ne yapılacağı netleşmedi

---

## Sonuç Tablosu (test bitince doldurun)

| Bölüm | Sonuç (✅/❌/kısmen) | Notlar |
|-------|---------------------|--------|
| 0 — Temel Sağlık | | |
| 1 — Satış Akışı | | |
| 2 — Stok Sorgula | | |
| 3 — Transfer | | |
| 4 — e-Fatura/e-İrsaliye/UTS | | |
| 5 — Açık Hesap | | |
| 6 — Garanti & İade | | |
| 7 — Özel Sipariş | | |
| 8 — Excel Envanter/Sayım | | |
| 9 — Etiket Bas/PROMAX | | |
| 10 — Fiyatı Değişen Ürünler | | |
| 11 — Laboratuvar | | |
| 12 — Kargo Tara | | |
| 13 — Raporlar/PDF | | |
| 14 — Patron Görünümü | | |
| 15 — İK/Prim/PDKS | | |
| 16 — Muhasebe/Finans | | |
| 17 — Kontrol Paneli/Chatbot | | |

Bitince bu tabloyu (fotoğraf/ekran görüntüsü ya da yazarak) bana iletin — hataları önceliklendirip
sırayla çözelim.
