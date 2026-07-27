# Şirketler arası transfer — Uyumsoft'a fatura gitmedi (teşhis)

## Durum

Görkem, Yönetim Paneli'nden ANA-DEPO (NG) → GVN3 (ADESE) transferi başlattı (ürün: OSSE OPTİK
ÇERÇEVE, transferRef **TRANSFER-1784101433075**). Odoo'da satış faturası (INV/2026/00018, ADESE
müşteri, 1 adet, tutar 0,00 TL — ürünün maliyeti/standard_price'ı hiç girilmemiş olduğu için 0
çıkması normal, o kısım sorun değil) oluşmuş ve `action_post` ile onaylanmış. **Ama Uyumsoft'ta bu
faturaya karşılık gelen hiçbir kayıt yok.**

Not: Stok/picking tarafı muhtemelen sorun değil — GVN3 tarafında "Kabul Et" henüz yapılmamış
olabilir (Odoo'da picking hâlâ "Gelen", "Stokta" değil), bu ayrı ve beklenen bir durum, bu talimat
kapsamında değil.

## İstenen — sadece teşhis

1. `TransferAksiyonLog` tablosunda `transferRef = 'TRANSFER-1784101433075'` için tüm kayıtları
   çekin (özellikle `aksiyon = 'EFATURA'`) — `durum` ve `mesaj` alanlarını tam olarak raporlayın.
   Kayıt hiç yoksa, `tetikleTransferEFatura`'nın bu transfer için hiç çağrılmadığını gösterir —
   `baslatSirketlerArasiTransfer` / `runTransferPostActions` akışını kod üzerinden izleyip nerede
   atlandığını bulun.
2. Kayıt varsa ve `durum='basarisiz'` ise tam hata mesajını verin — özellikle 0 tutarlı/0 fiyatlı
   satırın Uyumsoft `SendInvoice` tarafından reddedilip reddedilmediğine bakın (satır tutarı 0 olan
   bir e-Fatura göndermek genelde reddedilir — bu ihtimal güçlü, teyit edin).
3. `Fatura` / `FaturaKuyruk` tablolarında bu transfer için (`transferId` alanı) bir kayıt var mı,
   varsa durumu ne (kuyrukta bekliyor mu, hata mı verdi)?
4. Backend loglarında bu transfer zamanına ait (`[uyumsoft]`, `[transfer]`, `SendInvoice` geçen)
   satırları paylaşın.

## Bulgu incelendi — devam talimatı

Kod okundu: `mukellefiyetSorgula()` → `isEInvoiceUser(vkn, sirketId='ng')` →
`c.IsEInvoiceUserAsync(...)` çağrısı kendi içinde standart görünüyor, bariz bir kodlama hatası
(yanlış parametre, yanlış sıra) yok. Ama Uyumsoft'un ret mesajı ("e-fatura **tipinde olan**
faturaların PROFILEID alanı EARSIVFATURA olamaz") kendi içinde çelişkili: Uyumsoft'un kendisi bu
VKN'yi (**0071251547**) e-fatura tipinde tanıyor, ama bizim ön sorgumuz (`IsEInvoiceUserAsync`)
`false` dönmüş. Yani sorgu ile gerçek gönderim davranışı çelişiyor.

**İstenen ek adımlar:**

1. `isEInvoiceUser('0071251547', 'ng')`'i **tek başına, izole** çalıştırıp ham SOAP yanıtını
   (`IsEInvoiceUserResult` ve varsa yanındaki diğer alanlar) tam olarak loglayın. Gerçekten `false`
   mü dönüyor, yoksa response parse edilirken bir şey mi kayboluyor?
2. Eğer gerçekten `false` dönüyorsa ama Uyumsoft SendInvoice bunu e-fatura tipinde tanıyorsa — bu
   muhtemelen `IsEInvoiceUserAsync`'in güvenilmez/tutarsız bir uç olduğu anlamına gelir. Bu
   durumda **kalıcı çözüm**: `eFaturaGonder`'a bir fallback ekleyin — `SendInvoice` bu spesifik
   hatayla (`PROFILEID alanı EARSIVFATURA olamaz`) reddederse, **otomatik olarak `TEMELFATURA`
   profiliyle bir kez daha deneyin** (alias'ı da bu durumda tekrar `getUserAliasses` ile çekip
   doğru göndericeye iletin). Böylece ön sorgu ne dönerse dönsün, gerçek gönderim başarısız
   olmaz.
3. `FaturaKuyruk` kaydı `ANA2026000000005`'i bu düzeltme sonrası tekrar denetip (cron zaten 5 kez
   denemiş, `deneme` sınırına takılmış olabilir — sınırı sıfırlamanız/manuel tetiklemeniz
   gerekebilir) gerçekten Uyumsoft'a ulaştığını doğrulayın.

Kod değişikliğine (madde 2) geçmeden önce madde 1'in ham yanıtını bana getirin — gerçekten API'nin
tutarsız davrandığını görmek istiyorum, tahmin üzerine düzeltme yapmayalım.

## Madde 1 sonucu incelendi — ONAY + genişletilmiş kapsam

Doğru teşhis: API tutarsız değil, saf bir **parse bug'ı**. `result?.IsEInvoiceUserResult === true`
hiçbir zaman doğru olamaz çünkü `IsEInvoiceUserResult` düz boolean değil, `{ attributes: { Value,
IsSucceded } }` şeklinde bir obje — yani bu fonksiyon VKN ne olursa olsun **her zaman `false`**
dönüyor ve olmuş.

**Onaylanan düzeltme:** `isEInvoiceUser` içinde `result?.IsEInvoiceUserResult?.attributes?.Value ===
'true'` (ve `IsSucceded` kontrolü — sorgu başarısızsa hataya düşün, sessizce `false` dönmeyin)
şeklinde düzeltin. EARSIV→TEMEL fallback'i (Madde 1'deki 2. öneri) yine de ekleyin, bir güvenlik ağı
olarak kalsın — ama asıl düzeltme bu parse hatası.

**Ek — kapsam genişletme (önemli):** Bu fonksiyon hem transfer e-Faturasında hem **POS satış
e-Faturasında** (`tetikleSatisEFatura`) ortak kullanılıyor. Bug'ın günlerdir/haftalardır her yerde
aktif olduğu anlaşılıyor — yani ADESE dışında, gerçekten e-Fatura mükellefi olan başka bir müşteriye
(POS satışından) kesilen fatura da varsa, aynı hatayla `FaturaKuyruk`'ta sessizce `BASARISIZ` kalmış
olabilir. Düzeltmeyi yaptıktan sonra:
1. `FaturaKuyruk` tablosunda **tüm geçmişte**, `durum='BASARISIZ'` ve hata mesajında "EARSIVFATURA
   olamaz" geçen kaç kayıt var, listeleyin (sadece bu transfer değil, tüm satış/transfer kayıtları).
2. Bulunanları düzeltme sonrası tekrar tetikleyin/kuyruğa alın.
3. `deneme` sayacı 5'e ulaşıp durmuş olan `ANA2026000000005` dahil hepsini bu kapsamda ele alın.

Madde 2'ye geçebilirsiniz.

## Madde 2 sonucu — kod üzerinden bağımsız doğrulandı, KAPATILDI

`uyumsoft.service.ts` (`parseIsEInvoiceUserResult` — attributes.Value + IsSucceded kontrolü),
`uyumsoft-efatura.service.ts` (`mukellefiyetSorgula` artık ReceiverboxAliases okuyor ve hata durumunda
throw ediyor; `eFaturaGonder` içinde EARSIV-reddi güvenlik ağı — aynı ETTN ile TEMELFATURA+alias retry)
tek tek okunup rapordaki değişikliklerle birebir eşleştiği doğrulandı. Geçmiş tarama sonucu (POS'ta
başka takılı kayıt yok) rapor edildiği gibi kabul edildi. Bu talimat kapatıldı.

Kalan: (1) Bu transfer için UTS bildirimi kontrolü — Görkem UTS Yönetimi'ne erişebildiğinde teyit
edecek. (2) GVN3 tarafında "Kabul Et" henüz yapılmadıysa, stok döngüsünü tamamlamak için yapılmalı.

## Rapor formatı

Kesin neden (0 tutar reddi mi, hiç tetiklenmemiş mi, başka bir hata mı), kanıt (log/DB kaydı tam
metni). Kod değişikliği önermeden önce bana getirin — muhtemel çözüm yönü muhtemelen "0 tutarlı
transfer faturalarını Uyumsoft'a göndermeden önce engelle + kullanıcıya net uyarı ver" olacak ama
önce gerçek nedeni netleştirelim.
