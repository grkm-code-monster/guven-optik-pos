# Personel oluşturma/bağlama akışını tek ekrana toplama

## Arka plan (doğrulanmış sorun)

İki bağımsız, birbirinden habersiz personel akışı var:

- **Tanımlamalar → Personeller** ("+ Yeni Personel"): `POST /admin/employees`
  (`admin.controller.ts` satır ~1184) — doğrudan Odoo `hr.employee` oluşturuyor, kullanıcı adı+PIN
  girilirse doğrudan POS `User` kaydı da açıyor. **`Personel` tablosuna hiç dokunmuyor.**
- **İK & Prim → Personeller** ("+İşe Al" / "Bağla"): `Personel` tablosunda kayıt açıyor
  (`personel-ise-al`), sonra ayrı uçlarla Odoo/POS/PDKS'ye bağlıyor (`personel-odoo-bagla`,
  `personel-pos-bagla`, `personel-pos-olustur`, `personel-pdks`). Belge takibi ve prim hesaplama
  bu tabloya bağlı.

Sonuç: Tanımlamalar'dan açılan personelin Odoo/POS hesabı çalışır ama İK & Prim'de hiç görünmez,
belge/prim takibine girmez. Aynı zamanda `Personel.subeId`/`subeAdi` alanı neredeyse hep boş
(İK & Prim ekranında "Şube: —") çünkü gerçek şube ataması `User.branchId`'de tutuluyor, `Personel`
kaydına senkronize edilmiyor. Bu belirsizlik, PDKS GVN6/7/8 doğrulamasında "bu şubede POS
kullanıcısı yok mu, yoksa görünmüyor mu" sorusunu da net cevaplayamamamıza yol açtı.

## Hedef

Tek giriş noktası: **İK & Prim → Personeller**, `Personel` tablosu tüm personel bilgisinin
merkezi kaynağı olsun (Odoo/POS/PDKS bağlantıları + şube + belgeler + prim hep buradan). Tanımlamalar
→ Personeller yeni kayıt açmasın, sadece mevcut Odoo/POS hesaplarını görüntüleme + hızlı Odoo
bağlama amacıyla kalsın (o kısmı zaten iş görüyor, bozmayın).

---

## Adım 1 — ÖNCE ENVANTER ÇIKAR, RAPORLA (henüz veri değiştirme)

Aşağıdaki sayıları çıkarıp bana rapor edin:

1. Toplam `Personel` kaydı, kaçında `userId` dolu, kaçında `odooEmployeeId` dolu, kaçında `subeId`
   dolu.
2. Toplam POS `User` kaydı (aktif), kaç tanesinin karşılığında **hiç** `Personel` kaydı yok
   (yetim POS hesabı) — bunları liste halinde (isim, username, branchId) verin.
3. **GVN7 ve GVN8'e (`Branch.code`) `branchId` ile bağlı aktif `User` kaydı var mı, kaç tane, kimler** —
   bu, PDKS raporundaki "kullanıcı yok" tespitinin gerçek mi yoksa senkron eksikliği mi olduğunu
   netleştirecek net cevap.
4. Toplam Odoo `hr.employee` sayısı (aktif) ile karşılaştırıp kaçının `Personel.odooEmployeeId`
   olarak eşleşmediğini (yetim Odoo çalışanı) raporlayın.

Bu adımda hiçbir kayıt oluşturmayın/güncellemeyin, sadece sayın ve raporlayın.

## Adım 2 — Onay bekleyin

Rapor bana gelsin. Yetim hesap sayısı azsa (birkaç test/admin hesabı) elle düzeltiriz; çoksa toplu
backfill scripti üzerinde ayrıca konuşuruz. **Adım 3'e onaysız geçmeyin.**

## Adım 3 — Onay sonrası: backfill + senkron

- Yetim POS `User` kayıtları için (test/admin hesapları hariç — Adım 1 raporunda ayırt edin)
  otomatik `Personel` kaydı oluşturun: `ad/soyad` = User.name'den, `subeId`/`subeAdi` =
  User.branchId üzerinden gerçek şube bilgisinden, `userId` bağlantısı kurulsun.
- Yetim Odoo çalışanları için de aynı şekilde `Personel` kaydı açın (`odooEmployeeId` bağlantısı).
- İK & Prim'in "Bağla" akışlarını (`personel-pos-bagla`, `personel-pos-olustur`) gözden geçirin:
  POS bağlama/oluşturma anında `Personel.subeId`/`subeAdi`'nin de `User.branchId`'den otomatik
  senkronize edildiğinden emin olun (şu an muhtemelen bu adım eksik, "Şube: —" sorununun kaynağı).

## Adım 4 — Tanımlamalar → Personeller'i sadeleştirin

- "+ Yeni Personel" formunu (yeni Odoo çalışanı + POS hesabı **oluşturma**) kaldırın.
- Sayfada kısa bir not/yönlendirme ekleyin: "Yeni personel işe alımı için → İK & Prim → Personeller
  → + İşe Al".
- Sayfadaki mevcut "POS Kullanıcıları" listesi ve "Odoo Çalışan Bağla" görüntüleme/bağlama
  işlevi **kalsın** — bunlar yeni kayıt açmıyor, mevcut hesapları yönetmeye yarıyor, bozmayın.

## Adım 2 — ONAY (Görkem, envanter raporu sonrası)

1. **Yetim POS (4 hesap — admin/test):** Backfill'e dahil etmeyin, atlayın. Onaylandı.
2. **Odoo bağlantısı (22 kişi, isim eşleştirmesi):** Onaylandı, mevcut `Personel` kayıtlarına
   `odooEmployeeId` yazın. **Fatma Nazlı AKŞEHİRLİ ÖZ (Odoo id=5) bu turda dahil edilmesin** —
   PDKS'te karşılığı yok, eşleştirme zorunluluğu yok, atlayın.
3. **Şube (subeId/subeAdi) kaynağı — sıralı strateji:**
   - Önce Odoo `department_id` isimlerini branch listesiyle (GVN1, GVN2, ... ANADEPO vb.)
     karşılaştırın. İsimler gerçekten şube ile birebir/yakın eşleşiyorsa (örn. departman adı
     "GVN3" ya da "Güven Optik 1959 - 3" gibi tanınabilir bir şube adıysa) bu kaynağı kullanın.
   - Departman isimleri şubeyle örtüşmüyorsa (genel "Satış", "Depo" gibi işlevsel adlarsa), bu
     kişiler için son 30-60 günlük PDKS giriş kayıtlarına (`entries`) bakıp en sık göründükleri
     mekanı `subeId`/`subeAdi` olarak atayın.
   - Hangi kaynağın kaç kişi için kullanıldığını (Odoo departman ile kaç kişi, PDKS log ile kaç
     kişi, hiçbiriyle bulunamayan kaç kişi) raporlayın — hiçbir kaynakta bulunamayanları boş
     bırakın, tahmin etmeyin.
4. **POS bağlama akışına şube senkronu eklenmesi ve Tanımlamalar → Personeller sadeleştirmesi
   (Adım 3-4):** Onaylandı, uygulayın.

## Kabul kriteri

- Adım 1 raporu onaysız hiçbir veri değişikliğine yol açmamış olmalı.
- Backfill sonrası İK & Prim → Personeller'de "Şube: —" görünen satır sayısı ciddi oranda azalmış
  olmalı (gerçek şubesi olmayan, örn. yönetim/admin hesapları hariç).
- GVN7/GVN8 için gerçek POS kullanıcı durumu (var mı yok mu) artık net biliniyor olmalı.
- Tanımlamalar → Personeller'de artık yeni kayıt açılamıyor, sadece görüntüleme/Odoo bağlama var.

Bitince kısa rapor + ekran görüntüsüyle bildirin, ben kontrol edip kapatacağım.
