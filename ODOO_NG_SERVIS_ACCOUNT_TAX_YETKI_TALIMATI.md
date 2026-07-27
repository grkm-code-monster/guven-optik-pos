# Odoo — "NG Servis" (uid=7) kullanıcısına account.tax okuma izni verilemiyor

## Durum

Transfer ekranında "Şirketler arası — KDV uygulanır" tipindeki transferlerde "Transferi Başlat"a
basınca şu hata alınıyor:

```
XML-RPC fault: ... NG Servis (id=7) doesn't have 'oku' access to: - Vergi (account.tax) ...
```

Görkem, Odoo arayüzünden (Ayarlar → Kullanıcılar & Firmalar → Kullanıcılar → NG Servis → Erişim
Yetkileri → Muhasebe alanını "Faturalandırma Yöneticisi" yaptı, kaydetti) izni genişletmeyi denedi
ama **aynı hata aynen tekrar çıktı**. UI üzerinden çözülemedi — bu Odoo kurulumunda erişim
kurallarının (hata mesajının bile özelleştirilmiş olması gösteriyor ki) standart olmayabileceğini
düşündürüyor. Kesin ve doğrulanabilir bir çözüm için doğrudan admin API üzerinden düzeltilmesi
isteniyor.

## Bağlam (kodda mevcut)

`backend/src/modules/odoo/odoo.service.ts`, `SIRKET_ODOO_CREDENTIALS` (satır 44-48):

```ts
export const SIRKET_ODOO_CREDENTIALS: Record<number, { uid: number; password: string }> = {
  1: { uid: 2, password: 'admin123' },   // tam yetkili admin
  2: { uid: 7, password: 'ng123' },      // NG Servis — account.tax okuyamıyor
  3: { uid: 6, password: 'adese123' },
  4: { uid: 8, password: 'potential123' },
};
```

1 numaralı şirketin kimlik bilgileri (uid=2) tam admin yetkili — bunu kullanarak NG Servis'in
(uid=7) erişimini programatik olarak düzeltin.

## İstenen

Bir kerelik, çalıştırılıp silinebilecek bir admin script yazın (`backend/scripts/` altına, mevcut
`diag-opa289021-fatura.ts` / `bench-gelen-fatura-cek.ts` scriptleriyle aynı desende) ve çalıştırıp
sonucu raporlayın:

1. Admin kimlik bilgileriyle (companyId=1, uid=2) XML-RPC bağlantısı açın.
2. `res.users` üzerinden `uid=7` (NG Servis) kaydını okuyup `groups_id` alanındaki grup id'lerini
   listeleyin — hangi gruplara üye olduğunu tam olarak görün.
3. `ir.model.access` üzerinde `model_id` alanı `account.tax` modeline karşılık gelen kaydı bulun
   (önce `ir.model` üzerinden `model = 'account.tax'` ile model id'sini çözün), bu modele dair
   mevcut erişim kurallarını (`search_read`, `fields: ['name','group_id','perm_read','perm_write','perm_create','perm_unlink']`)
   listeleyip raporlayın — NG Servis'in üye olduğu gruplardan HİÇBİRİNİN `perm_read=True` bir
   `account.tax` kaydına sahip olmadığını doğrulayın (yani sorunun UI'daki "Faturalandırma
   Yöneticisi" seçiminin gerçekte hangi gruba karşılık geldiğini ve o grubun neden yeterli
   olmadığını netleştirin).
4. Düzeltme: NG Servis'in üye olduğu gruplardan birine (tercihen zaten "Faturalandırma Yöneticisi"
   seçimiyle eklenen gruba) `account.tax` için `perm_read=True` bir `ir.model.access` kaydı
   `create` edin (yoksa yeni oluşturun, varsa `write` ile `perm_read=True` yapın) — sadece okuma
   yeterli, `perm_write`/`perm_create`/`perm_unlink` **False** kalsın (gereksiz yetki genişletmeyin).
5. Aynı sorunun ADESE (uid=6) ve POTENTIAL (uid=8) servis kullanıcılarında da var olup olmadığını
   kontrol edin (aynı script ile, aynı modele karşı `perm_read` durumlarını okuyun) — varsa onları
   da aynı şekilde düzeltin, yoksa sadece raporlayın (gereksiz değişiklik yapmayın).
6. Düzeltmeden sonra, NG Servis'in kendi kimlik bilgileriyle (uid=7, password='ng123') doğrudan
   `account.tax` üzerinde `search_read` deneyip gerçekten okuyabildiğini script içinde test edin.

## Test

1. Script çıktısında: önce/sonra `perm_read` durumu, hangi grup(lar)a hangi izin eklendiği.
2. NG Servis kimlik bilgileriyle yapılan doğrudan `account.tax` okuma testinin başarılı olduğu.
3. Görkem'in canlı ekranda aynı "Şirketler arası" transferi tekrar deneyip artık hata almadığını
   teyit edebileceği bir not.

## Rapor formatı

Script dosyası + çalıştırma çıktısı (önce/sonra perm_read tablosu) + hangi grup(lar)a ne eklendiği +
ADESE/POTENTIAL için sonuç.
