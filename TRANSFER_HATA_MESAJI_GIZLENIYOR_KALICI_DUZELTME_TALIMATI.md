# Transfer hataları "Transfer oluşturulamadı" ile gizleniyor — kalıcı düzeltme

## Durum

Bu sorunu oturumda birkaç kez ayrı ayrı fark ettik ama hiç kalıcı düzeltmedik — her seferinde
backend terminaline/Network sekmesine bakarak dolaylı yoldan gerçek hatayı bulmak zorunda kaldık.
Artık kalıcı çözelim.

## Kök neden (kodda doğrulandı)

`packages/web/src/components/transfer/YeniTransfer.tsx`, `transferBaslat()` (satır 270-271):
```ts
} catch (e: any) {
  setError(e?.response?.data?.message ?? 'Transfer oluşturulamadı')
}
```
Backend'in `handleOdooFailure()` (`transfer.controller.ts`) hata durumunda `{ error, detail }`
alanlarıyla dönüyor, `message` alanı hiç yok — bu yüzden yukarıdaki kod her zaman fallback'e
düşüyor, gerçek hata asla ekrana çıkmıyor.

## İstenen

1. `YeniTransfer.tsx`'teki TÜM hata yakalama noktalarında (`transferBaslat()` satır 270-271 dahil,
   arama/lot seçimi vb. diğer catch blokları da) mesaj çıkarma mantığını genişletin:
   ```ts
   const msg = e?.response?.data?.message ?? e?.response?.data?.error ?? e?.response?.data?.detail
     ?? e?.message ?? 'Transfer oluşturulamadı'
   ```
2. Bu deseni tek bir ortak yardımcı fonksiyona çıkarın (ör. `extractApiErrorMessage(e, fallback)`,
   `packages/web/src/utils/` altında) ve hem `YeniTransfer.tsx` hem benzer başka ekranlarda aynı
   sorun olup olmadığını kontrol edip (grep ile `?? 'Transfer oluşturulamadı'` veya benzer sabit
   fallback metinleri arayın) varsa onları da bu ortak fonksiyona geçirin.
3. Backend tarafında da tutarlılık için `handleOdooFailure()`'ın döndürdüğü objeye `message` alanını
   da ekleyin (`error` ile aynı değer olabilir) — hem eski hem yeni frontend kodunun çalışmasını
   garantiler, çift taraflı güvenlik.

## Test

Bilerek bir hata senaryosu tetikleyip (ör. eksik alanla transfer denemesi) artık ekranda gerçek
Odoo/backend hata mesajının (generic "Transfer oluşturulamadı" değil) göründüğünü gösterin.

## Rapor formatı

Değişen dosyalar + önce/sonra ekran görüntüsü (aynı hata senaryosunda artık görünen gerçek mesaj).
