# "Kayıt başarısız" — Şirket Bilgileri (Uyumsoft Ayarları) kaydedilemiyor

## Durum

Görkem, Yönetim Paneli → Tanımlamalar → NG → Uyumsoft Ayarları modalinde vergi dairesi/il/ilçe/
telefon/e-posta/adres bilgilerini girip "Kaydet"e bastığında `alert("Kayıt başarısız")` hatası
alıyor (ekran görüntüsü mevcut). Bu tam olarak benim kendisinden istediğim veri girişiydi — kod
tarafında engelleyen bir şey var.

## Kod okunarak bulunan — güçlü şüpheli kök neden

`backend/src/modules/admin/admin.controller.ts` içinde **19 ayrı yerde** `new PrismaClient()`
ile **istek başına yeni bir Prisma client** oluşturuluyor (paylaşılan singleton
`../../database/prisma`'daki `prisma` kullanılmıyor). Örnek — tam da hatalı endpoint:

```ts
router.post('/sirket-ayar/:sirketId', async (req, res) => {
  try {
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()          // ← istek başına yeni bağlantı havuzu
    ...
    await prisma.$disconnect()                  // ← sadece BAŞARI yolunda disconnect var
    return res.json({ success: true })
  } catch (err: any) {
    return res.status(500).json({ error: err?.message })   // ← burada $disconnect YOK — sızıntı
  }
})
```

Bu iki sorunu birlikte barındırıyor:
1. Her istekte yeni bir `PrismaClient` = yeni bir bağlantı havuzu açılıyor — 19 farklı endpoint'te
   tekrarlanan bir desen, uzun bir test/kullanım oturumunda (bugün olduğu gibi, admin panelde
   onlarca işlem yapıldı) Postgres bağlantı limitine yaklaşabilir.
2. Hata (`catch`) yolunda `$disconnect()` **çağrılmıyor** — her başarısız istek bir bağlantıyı
   kalıcı olarak sızdırıyor (sunucu yeniden başlatılana kadar). Bu, bir kere başarısız olan bir
   isteğin sonraki istekleri de etkileme ihtimalini artırıyor — sarmal bir etki.

Bu, Görkem'in bugün gördüğü "Kayıt başarısız" hatasının en olası açıklaması, ama **kesin teşhis
için gerçek sunucu konsol logunu (o anki hatayı) kontrol edin** — `catch` bloğu `err?.message`'ı
response'a koyuyor ama frontend bunu göstermiyor (aşağıya bakın), bu yüzden gerçek mesaj şu an
sadece backend terminal loglarında olabilir.

## İkincil sorun — frontend gerçek hatayı gizliyor

`TanimlamalarPage.tsx` → `uyumsoftKaydet()`:
```ts
} catch { alert('Kayıt başarısız') } finally { ... }
```
Backend `err?.message`'ı döndürüyor olsa bile burada hiç okunmuyor — generic mesaj gösteriliyor.
Bu satır ve aynı dosyadaki benzer üç yer (`iysKaydet`, `gunlukRaporKaydet`, satır ~1210/1244/1263
civarı) `e?.response?.data?.error` okuyup göstermeli (dosyanın başka yerlerinde, satır 224 gibi,
zaten doğru yapılan bir örnek var — `e?.response?.data?.message ?? 'Kayıt başarısız'`).

## İstenen

1. **Önce teşhis:** `POST /admin/sirket-ayar/ng` isteğini NG için gerçek verilerle tekrar
   deneyip backend terminalindeki gerçek hata mesajını (varsa Postgres "too many clients" /
   "connection pool timeout" gibi bir şey mi, yoksa başka bir şey mi) raporlayın — kesin kök
   nedeni netleştirin, tahminimi doğrulayın ya da çürütün.
2. **Kalıcı fix — sadece bu endpoint değil, hepsi:** `admin.controller.ts`'teki **19**
   `new PrismaClient()` çağrısının tamamını paylaşılan singleton (`import { prisma } from
   '../../database/prisma'`) ile değiştirin, `await prisma.$disconnect()` çağrılarını kaldırın
   (singleton uygulama ömrü boyunca açık kalır, istek başına kapatılmaz). Bu, bu dosyadaki diğer
   endpoint'lerde de (transfer, ürün girişi, stok kontrol — hepsi aynı dosyada) aynı sınıf
   hatanın sessizce oluşmasını önler; sadece `sirket-ayar` route'unu düzeltmek yeterli olmaz,
   çünkü aynı bağlantı havuzunu diğer 18 endpoint de paylaşıyor.
3. Frontend'te yukarıdaki 3-4 `catch { alert('Kayıt başarısız') }` yerini gerçek backend
   mesajını gösterecek şekilde düzeltin.
4. Test: NG için vergi dairesi/il/ilçe/telefon/e-posta/adres bilgilerini kaydedip başarılı
   olduğunu, GET ile geri okunduğunu gösterin. Ardından art arda 15-20 admin işlemi (farklı
   endpoint'ler) yapıp bağlantı sızıntısı belirtisi (yavaşlama, "too many clients" hatası)
   olmadığını doğrulayın.

## Rapor formatı

Gerçek hata mesajı (teşhis) + değişen dosya/satır sayısı + NG kaydının başarılı ekran görüntüsü.
