# Uyumsoft'tan gelen fatura çekme — çok yavaş, tarihler eksik/tutarsız, OPA2026000289021 bulunamıyor

## Durum

Görkem, dar bir tarih aralığı (2-3 gün) seçmesine rağmen "Uyumsoft'tan Çek" işleminin hâlâ çok
uzun sürdüğünü, listede fatura tarihlerinin düzgün görünmediğini (aradığını kolayca bulamadığını)
ve OPA2026000289021 numaralı faturayı hâlâ eksik/bulamadan çekemediğini bildiriyor.

## Kod tarafı — üç ayrı, birbirini büyüten sorun bulundu

### 1) Performans — sıralı (paralel değil) N+1 detay çağrısı — ASIL YAVAŞLIK KAYNAĞI

`gelen-fatura.service.ts`, `cekGelenFaturalar()` (satır 213-221):

```ts
for (const item of liste.items) {
  ...
  const detay = await getInboxInvoice(uyumsoftSirketId, item.documentId);   // ← her fatura için AYRI, SIRALI SOAP çağrısı
  ...
}
```

`pageSize` varsayılan 50 (`Math.min(Math.max(opts?.pageSize ?? 50, 1), 100)`, satır 199) —
yani 2-3 günlük aralıkta 30-50 fatura varsa, bunların HER BİRİ için ayrı ayrı, **birbiri
ardına beklenerek** (paralel değil) tam detay SOAP çağrısı yapılıyor. Her çağrı 1-2 saniye
sürse bile toplamda 30-100 saniyeye kolayca çıkar — Görkem'in yaşadığı "çok bekletiyor" tam
olarak bu.

### 2) Tarih — liste görünümünde her zaman doğru gelmeyebilir

`uyumsoft.service.ts`, `parseInboxListItem()` (satır 403-418) — Uyumsoft'un LİSTE API'si zaten
`issueDate` alanını `raw.ExecutionDate`'ten dönüyor, ama **`supplierTitle`/`supplierVkn` liste
seviyesinde hep boş** (satır 407-408, sabit `''`) — tedarikçi adı sadece detay çağrısıyla geliyor.
Yani şu an #1'deki eager-detay-çağrısı hem yavaşlığın hem de (dolaylı olarak, her satırın tedarikçi
adını göstermek için) var olma sebebi. Ayrıca `ExecutionDate` (liste) ile detaydaki gerçek UBL
`IssueDate` (satır 538, `ublAlanOku(inv.IssueDate)`) **farklı alanlar olabilir** — biri "işlem
tarihi", diğeri "fatura düzenleme tarihi" anlamına gelebilir, bunları karıştırmak Görkem'in "tarih
tutmuyor" hissine sebep olabilir.

Frontend liste (`DepoPage.tsx` satır 5483) `f.faturaTarihi || '—'` gösteriyor — backend'den boş
gelirse çizgi görünür, bu da "tarihler düzgün gözükmüyor" şikayetini doğrudan açıklıyor.

### 3) Sıralama — tarihe göre değil, kayıt oluşturma zamanına göre

`listeleGelenFaturalar()` (satır 173): `orderBy: { createdAt: 'desc' }` — yani liste **bizim
veritabanımıza ne zaman yazıldığına göre** sıralanıyor, faturanın gerçek tarihine göre değil. Bu da
"aradığımı kolayca bulamıyorum" hissini güçlendiriyor — kullanıcı tarihe göre taramak istiyor ama
liste sırası buna uymuyor.

## GÜNCELLEME — "Daha fazla yükle" hiçbir şey yapmıyor gibi görünüyor

Görkem, listenin altındaki "Daha fazla yükle (sayfa 5, toplam ~405)" butonuna bastığında
"Yükleniyor..." yazısının göründüğünü ama hiçbir değişiklik olmadığını bildirdi. Kodda **iki ayrı
sorun** buldum:

1. **Asıl neden muhtemelen yukarıdaki #1 (yavaşlık) ile aynı** — "Daha fazla yükle" da
   `gelenFaturalariCek(true)` çağırıyor, o da yine `/efatura/gelen/cek`'i (Uyumsoft'tan gerçek
   zamanlı, sıralı/N+1 detay çağrısıyla çeken AYNI pahalı endpoint) çağırıyor — sadece yerelde
   önbelleklenmiş sonraki sayfayı okumuyor. 405 kayıtlık bir arşivde sayfa 5'i "yüklemek", yine
   ~50 faturanın hepsini sıralı olarak Uyumsoft'tan tekrar detaylı çekmeye çalışıyor demek —
   yukarıdaki paralelleştirme düzeltmesi bunu da hızlandıracak, ama muhtemelen kullanıcı sadece
   "hiç bitmiyor" hissi yaşıyor, teknik olarak "kırık" değil.
2. **Gerçek, ayrı bir bug — sayfalar birbirinin üstüne yazılıyor, birikmiyor:**
   `gelenFaturalariCek()` (satır 2726): `setGelenFaturalar(res.data?.data ?? [])` — yeni sayfa
   geldiğinde state'i **tamamen değiştiriyor**, önceki sayfalardaki kayıtların üzerine mevcut
   listeye EKLEMİYOR. Yani "Daha fazla yükle" aslında çalışsa bile, önceki gösterilen kayıtları
   kaybedip sadece yeni sayfanın ~50 kaydını gösterecek — kullanıcı ekranda genelde birbirine çok
   benzeyen tedarikçi/tutar satırları gördüğü için bunu fark etmemiş olabilir, "değişiklik olmadı"
   sanmış olabilir.

**Düzeltme:** `loadMore === true` iken `setGelenFaturalar(prev => [...prev, ...(res.data?.data ??
[])])` gibi **biriktirerek** ekleyin (aynı `id`'li kayıt varsa tekrarlamayın — dedup). `loadMore
=== false` (yeni "Uyumsoft'tan Çek") durumunda mevcut sıfırlama davranışı (`setGelenFaturalar(res
.data?.data ?? [])`) doğru, ona dokunmayın.

## GÜNCELLEME 2 — önceki rapor yanlıştı, "biriktirme" fix'i UYGULANMAMIŞ + kanıtlı kök neden

Önceki rapor bu talimatın "Daha fazla yükle" bölümünü hiç zikretmeden "uygulandı" dendi ama kod hâlâ
eskisiyle aynı. `packages/web/src/pages/admin/DepoPage.tsx`, `gelenFaturalariCek()` fonksiyonunu
(satır ~2723-2742) tekrar okudum:

```ts
async function gelenFaturalariCek(loadMore = false) {
  ...
  const nextPage = loadMore ? gelenPageIndex + 1 : 0   // ← sayfa numarası DOĞRU artıyor
  const res = await adminApi.post('/efatura/gelen/cek', { ..., pageIndex: nextPage, ... })
  setGelenFaturalar(res.data?.data ?? [])               // ← HÂLÂ tamamen değiştiriyor, biriktirmiyor
  ...
}
```

Backend'e doğru sayfa isteniyor, ama gelen yeni sayfa state'e EKLENMİYOR, önceki sayfanın üzerine
YAZILIYOR. Sonuç: ekranda her zaman sadece en son çekilen TEK sayfa (en fazla 50 kayıt) görünüyor,
`gelenFaturalarFiltreli` araması da (satır 2349-2365) sadece o anki 50 kayıt içinde çalışıyor.

**Kanıt (Görkem'in canlı testi):** OPA2026000289021, Uyumsoft portalının kendisinde "Gelen Fatura >
Tümü" ekranında 10.07.2026 tarihli, "Onaylandı" durumda görünüyor — panelimizde sorgulanan
06.07-20.07.2026 aralığının tam içinde. Panel özet satırı "Uyumsoft: 197 kayıt · bu sayfa 50"
gösteriyor — yani aralıkta 197 kayıt var ama tek seferde sadece 50'si (1 sayfa) ekranda. Bu fatura
muhtemelen 2., 3. veya 4. sayfada, ama sayfalar birbirinin üzerine yazıldığı için kullanıcı hepsini
aynı anda arayamıyor, sayfaları teker teker gezip gözle taraması gerekiyor.

**Bu, önceki raporun "OPA2026000289021 artık Uyumsoft inbox'ında değil, bu yüzden bulunamıyor"
teşhisini geçersiz kılıyor** — fatura orada, sorun bizim tarafımızdaki bu birikmeme bug'ı.

**Kesin düzeltme (zorunlu, bu sefer atlanmasın):**

```ts
setGelenFaturalar(prev => {
  if (!loadMore) return res.data?.data ?? []
  const yeni = res.data?.data ?? []
  const mevcutIdler = new Set(prev.map(f => f.id))
  return [...prev, ...yeni.filter(f => !mevcutIdler.has(f.id))]
})
```

Test: "Daha fazla yükle"ye art arda 3-4 kez basıp listenin küçülmeden/sıfırlanmadan büyüdüğünü,
toplamın 197'ye yaklaştığını ve OPA2026000289021'in bu birikmiş listede arama kutusuyla
bulunabildiğini ekran görüntüsüyle gösterin. Bu maddeyi rapor özetinde AÇIKÇA "biriktirme fix'i
uygulandı ve test edildi" diye belirtin — bir önceki rapor gibi sessizce atlamayın.

## GÜNCELLEME 3 — "Tarih aralığı" filtresi, fatura tarihini DEĞİL, Uyumsoft kayıt tarihini filtreliyor

Görkem canlı testte modalda **Başlangıç 08.07.2026 / Bitiş 12.07.2026** seçip "Uyumsoft'tan Çek"e
bastı, ama gelen listede **2026-07-20** tarihli faturalar çıktı — seçtiği aralığın tamamen dışında.

**Kök neden:** `packages/web/src/pages/admin/DepoPage.tsx`, `gelenFaturalariCek()` içindeki
`aralik.baslangic`/`aralik.bitis`, backend'e `baslangic`/`bitis` olarak gidiyor →
`gelen-fatura.service.ts`, `cekGelenFaturalar()` (satır ~222-229) bunları doğrudan
`getInboxInvoiceList()`'e `createStartDate`/`createEndDate` olarak veriyor →
`uyumsoft.service.ts`, `getInboxInvoiceList()` bunları Uyumsoft SOAP çağrısına
`CreateStartDate`/`CreateEndDate` olarak gönderiyor (satır ~599-600). Bu, **faturanın Uyumsoft'un
kendi sisteminde ne zaman kayda geçtiği** tarihidir — GÜNCELLEME 2'de eklediğimiz gerçek fatura
tarihi (UBL `IssueDate`, ekranda gösterilen `faturaTarihi`) ile **aynı alan değil**, ikisi farklı
zamanlar olabilir.

Yani modaldaki "Tarih aralığı" etiketi kullanıcıya "fatura tarihi aralığı" izlenimi veriyor ama
aslında Uyumsoft-kayıt-tarihi aralığı filtreliyor. Ayrıca aynı SOAP çağrısında kullanılmayan (`null`
gönderilen) bir `ExecutionStartDate`/`ExecutionEndDate` parametre çifti de var (satır ~601-602) —
bunun gerçek fatura tarihine `CreateDate`'ten daha yakın olup olmadığı test edilmemiş.

**İstenen:**

1. Uyumsoft'un `ExecutionStartDate`/`ExecutionEndDate` parametrelerini `CreateStartDate`/
   `CreateEndDate` yerine (veya onlarla birlikte) deneyin — hangisi gerçek fatura tarihine daha
   yakın sonuç veriyor, birkaç gerçek örnekle karşılaştırıp raporlayın.
2. Hangi parametre kullanılırsa kullanılsın, Uyumsoft'un API'si **gerçek fatura tarihine göre tam
   isabetli filtreleme garantisi vermiyorsa**: `cekGelenFaturalar()` sonucundaki her kaydı, dönen
   `issueDate`/`faturaTarihi`'ye göre backend'de `opts.baslangic`/`opts.bitis` aralığına karşı
   post-filter'dan geçirin (aralık dışında kalanları sonuçtan çıkarın) — böylece kullanıcıya
   dönen liste her zaman gerçekten seçtiği fatura-tarihi aralığıyla eşleşsin.
3. Modaldaki "Tarih aralığı" etiketini kullanıcıya net olacak şekilde güncelleyin: eğer bu alan
   hâlâ Uyumsoft sorgu penceresini (performans/pagination için gerekli) kontrol ediyorsa, ayrı ve
   açık bir etiket kullanın (örn. "Uyumsoft arama penceresi") ve #2'deki post-filter sayesinde
   kullanıcının GÖRDÜĞÜ sonuçların her zaman gerçek fatura tarihiyle tutarlı olduğundan emin olun.
4. Test: 08.07-12.07 gibi dar bir aralık seçip çektiğinizde, listede görünen HİÇBİR kaydın
   `faturaTarihi`'nin bu aralığın dışında olmadığını (ör. 20.07 gibi bir tarih çıkmadığını) ekran
   görüntüsüyle kanıtlayın.

## İstenen

### Performans (öncelik #1)

1. `cekGelenFaturalar()`'daki sıralı `for` döngüsünü **sınırlı eşzamanlılıkla (concurrency cap,
   örn. 5-8 paralel istek)** paralel hale getirin — tamamen sınırsız paralel de atmayın (Uyumsoft
   tarafını yormasın). Bir kuyruk/batch mantığı (`p-limit` benzeri bir yardımcı, ya da elle
   `Promise.all` ile 5'li gruplar halinde işleme) kullanabilirsiniz.
2. Bu değişiklikten sonra 2-3 günlük, ~30-50 faturalık bir aralığın çekilme süresini öncesi/
   sonrası ölçüp raporlayın.

### Tarih tutarlılığı

1. Liste API'sindeki `ExecutionDate` ile detaydaki gerçek `IssueDate`'in aynı şeyi mi ifade
   ettiğini netleştirin (Uyumsoft dokümantasyonu veya birkaç gerçek faturayla karşılaştırarak).
   Kullanıcıya gösterilecek "fatura tarihi" olarak **gerçek fatura düzenleme tarihini (IssueDate)**
   kullanın, işlem/execution tarihini değil — bunlar farklıysa.
2. `faturaTarihi` hiçbir zaman boş/`'—'` kalmamalı — detay çağrısı (paralelleştirilmiş haliyle)
   zaten her kayıt için çalışıyor, bu değeri güvenilir şekilde dolduğundan emin olun.

### Sıralama ve arama (kolayca bulma)

1. Liste varsayılan sıralamasını `faturaTarihi` (gerçek fatura tarihi) alanına göre, en yeni üstte
   olacak şekilde değiştirin — `createdAt` yerine.
2. Mevcut arama kutusunun (`gelenAramaMetni`) fatura numarasının **kısmi** eşleşmelerinde de
   (örn. sadece "289021" yazınca da) çalıştığını doğrulayın, çalışmıyorsa düzeltin.
3. Tarih aralığı seçiciye ek olarak, listeyi doğrudan **belirli bir fatura tarihine** filtreleme
   imkanı (basit bir "şu tarihte gelenler" hızlı filtresi) eklemeyi değerlendirin.

### OPA2026000289021 — ayrı teşhis

1. Bu spesifik faturayı `getInboxInvoice` ile doğrudan (script/log ile) çekip ham cevabı inceleyin
   — "eksik bilgi geliyor" derken hangi alan(lar) eksik/boş geliyor tam olarak tespit edin (satır
   sayısı, tutar, tarih, tedarikçi?). Bu daha önce bu oturumda company_id/ULTRA LENS bağlamında
   incelenmiş bir faturaydı — o düzeltmenin bu faturanın kendisini etkilemediğini, bunun ayrı/yeni
   bir sorun olduğunu doğrulayın.
2. Kök nedeni bulup (Uyumsoft'un kendisi mi eksik veriyor, bizim parse mantığımız mı bir alanı
   atlıyor) raporlayın — kafanıza göre "tekrar deneyin" demeyin, gerçek nedeni bulun.

## Test

1. 2-3 günlük bir aralıkta "Uyumsoft'tan Çek" işleminin süresini öncesi/sonrası karşılaştırmalı
   gösterin (belirgin bir hızlanma olmalı).
2. Çekilen listede TÜM faturaların tarih alanının dolu (`—` değil) ve doğru sıralı göründüğünü
   gösterin.
3. OPA2026000289021'i arayıp bulabildiğinizi ve eksik bilgi sorununun kök nedenini/durumunu
   raporlayın.
4. "Daha fazla yükle"ye art arda birkaç kez basıp, her seferinde listenin ÖNCEKİ kayıtları
   koruyarak büyüdüğünü (üzerine yazmadığını), toplam sayının 405'e doğru ilerlediğini gösterin.

## Rapor formatı

Performans ölçümü (öncesi/sonrası saniye) + değişen dosyalar + OPA2026000289021 teşhis sonucu +
ekran görüntüsü (tarihli, sıralı liste).
