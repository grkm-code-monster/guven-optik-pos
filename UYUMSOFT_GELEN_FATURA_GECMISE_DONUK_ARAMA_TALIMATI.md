# Uyumsoft gelen fatura çekme — geçmişe dönük arama yok, eski fatura bulunamıyor

## Durum

Görkem, Depo Yönetimi → Ürün Girişi → "Uyumsoft'tan Otomatik Gelen Faturalar" modalinde
**OPA2026000289021** numaralı faturayı "Uyumsoft'tan Çek" ile bulamıyor.

## Kök neden (kod okunarak doğrulandı)

`DepoPage.tsx` → `gelenFaturalariCek()`:
```ts
const res = await adminApi.post('/efatura/gelen/cek', {
  onlyUnread: true,
  pageSize: 30,
  sirketId: gelenSirketId,
})
```
Tarih aralığı hiç gönderilmiyor. Backend (`gelen-fatura.service.ts` → `cekGelenFaturalar`):
```ts
const baslangic = opts?.baslangic ? new Date(opts.baslangic) : new Date(Date.now() - 30 * 86400000);
const bitis = opts?.bitis ? new Date(opts.bitis) : new Date();
const pageSize = opts?.pageSize ?? 30;
```
Yani her "Uyumsoft'tan Çek" tıklaması **sadece son 30 günü, sadece ilk 30 kaydı, sadece
"okunmamış" (`onlyUnread`) olanları** çekiyor. Modalde tarih seçimi için hiçbir alan yok — bu
üç sınırlamayı değiştirmenin frontend'den bir yolu yok.

`OPA2026000289021` muhtemelen şu üç sebepten biriyle görünmüyor:
1. 30 günden eski.
2. Uyumsoft tarafında zaten "okunmuş/görülmüş" işaretli (`isSeen=true`) — `onlyUnread:true`
   olduğu için bu tür faturalar sonuçtan filtreleniyor (`uyumsoft.service.ts` satır ~567-569).
3. Aralıktaki fatura sayısı 30'u geçiyorsa, sayfalama (`PageIndex`) hiç kullanılmıyor — ilk
   sayfadan sonrası hiç çekilmiyor.

**Not:** Uyumsoft'un SOAP servisi (`GetInboxInvoiceListAsync`) fatura numarasına göre doğrudan
arama desteklemiyor — sadece tarih aralığı + sayfalama + durum filtresi var. Yani "OPA..." diye
arama yapmak için önce doğru tarih aralığında faturayı listeye çekmemiz, sonra listede
filtrelememiz gerekiyor.

## İstenen

1. Modale bir **tarih aralığı seçici** ekleyin (başlangıç/bitiş, varsayılan yine son 30 gün
   olabilir ama kullanıcı değiştirebilsin — örn. "son 90 gün", "son 6 ay" gibi hazır seçenekler
   + manuel tarih girişi).
2. **"Sadece okunmamışlar" filtresini kullanıcının kapatabileceği bir seçenek** yapın (checkbox,
   varsayılan açık) — geçmişe dönük arama yaparken bunu kapatabilsin, yoksa zaten görülmüş
   faturalar hiç gelmez.
3. `pageSize`'ı artırın veya **sayfalama** ekleyin ("Daha fazla yükle" / sonraki sayfa) — tek
   seferde 30 kayıtla sınırlı kalmasın.
4. Modale gelen liste üzerinde **fatura numarasına göre metin araması** (basit bir arama kutusu,
   client-side filtre yeterli) ekleyin — kullanıcı "OPA2026000289021" yazınca listede varsa
   anında bulsun.
5. Test: OPA2026000289021'i (veya 30 günden eski, tarihini bildiğiniz başka bir NG faturasını)
   genişletilmiş tarih aralığı + "okunmamış" filtresi kapalıyken çekip bulduğunuzu gösterin.

## Rapor formatı

Değişen dosya/satırlar + tarih aralığı seçiciyle eski bir faturayı bulma ekran görüntüsü.
