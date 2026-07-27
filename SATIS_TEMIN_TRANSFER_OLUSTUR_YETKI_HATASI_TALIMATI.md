# Satış "5.5 Temin" adımında INSUFFICIENT_PERMISSION — kök neden bulundu: `prefix()` eşleşme hatası

## Durum

STORE_MANAGER rolündeki İlker Yolcu, satış akışının "5.5. Temin" adımında yerel stok yokken başka
lokasyondan (ANADEPO, 1 adet) transfer talebi açmaya çalışınca `INSUFFICIENT_PERMISSION` hatası
alıyor. Ekranda "Transfer hatası veya kısmi tamamlanma var" uyarısı çıkıyor.

## Kök neden (kodda doğrulandı)

Frontend "5.5 Temin" adımı (`packages/web/src/components/sale/StokTeminStep.tsx`, satır 215) şu
uç noktayı çağırıyor:
```ts
const res = await apiClient.post('/admin/transfer-olustur', { ... })
```

`admin.controller.ts`'te `/transfer-olustur` route'unun kendisinde (satır 3322) hiçbir rol kontrolü
yok — ama router'ın GENELİNE uygulanan ortak middleware var (satır 400-403):
```ts
router.use((req, res, next) => {
  const { yetkiler, roles } = resolveAdminRouteAccess(req.path);
  return authorizeOrYetki(yetkiler, ...roles)(req, res, next);
});
```

`resolveAdminRouteAccess()` (`backend/src/modules/admin/ek-yetki.ts`, satır 254-261),
`ADMIN_ROUTE_RULES` listesinde path'e uyan ilk kuralı arıyor, uymazsa **varsayılana düşüyor**:
```ts
return { yetkiler: [], roles: [Role.ADMIN] };  // sadece ADMIN, hiç yetki alternatifi yok
```

`/transfer-olustur` için kural VAR (satır 82-86):
```ts
{
  test: (p) => prefix(p, '/transfer-'),
  yetkiler: [EK_YETKI.DEPO_TRANSFER],
  roles: POS_ROLES,   // SALES_STAFF, STORE_MANAGER, WAREHOUSE_MANAGER, REGIONAL_MANAGER, ADMIN
},
```
Ama **`prefix()` fonksiyonu (satır 70-72) segment sınırı arıyor**:
```ts
function prefix(path: string, p: string): boolean {
  return path === p || path.startsWith(`${p}/`);
}
```
`prefix(p, '/transfer-')` şu ifadeye açılıyor: `p === '/transfer-' || p.startsWith('/transfer-/')`.
Gerçek route'lar ise `/transfer-olustur`, `/transfer-kabul`, `/transfer-aksiyon-log`,
`/transfer-urun-ara` — hiçbiri `/transfer-` ile TAM eşleşmiyor, hiçbiri `/transfer-/` ile
BAŞLAMIYOR (araya `/` gelmiyor, direkt kelime ekleniyor: `transfer-olustur`). Yani **bu kural hiçbir
zaman eşleşmiyor**, tüm `/transfer-*` uçları sessizce varsayılana (`roles: [Role.ADMIN]`, yetki
alternatifi yok) düşüyor. STORE_MANAGER, DEPO_TRANSFER yetkisi olsa bile bu yüzden 403 alıyor.

## Aynı desende iki bug daha (bonus, aynı kökten)

`ek-yetki.ts` satır 113-133 ("Depo: Ürün girişi" kuralı) içinde de aynı hatalı kalıp var:
```ts
prefix(p, '/urun-varyanlar') ||
prefix(p, '/cari-') ||       // satır 122 — /cari-ara, /cari-olustur route'larıyla asla eşleşmez
...
prefix(p, '/nitelik-') ||    // satır 124 — /nitelik-listesi, /nitelik-olustur ile asla eşleşmez
```
Gerçek route'lar `/cari-ara`, `/cari-olustur`, `/nitelik-listesi`, `/nitelik-olustur` (admin.controller.ts
satır 1522, 1562, 1657, 1699) — hiçbiri `/cari-/...` veya `/nitelik-/...` formatında değil, aynı
sebeple bu kural da hiç tetiklenmiyor. Buradaki fark: bu kuralın `roles` değeri zaten `[Role.ADMIN]`
(varsayılanla aynı), o yüzden ADMIN kullanıcılar fark etmiyor — ama `DEPO_URUN_GIRIS`/
`URUN_YAPILANDIRMA` ek yetkisi olup ADMIN rolü olmayan kullanıcılar bu iki uçta da sessizce
engelleniyor olmalı (test edilmedi ama aynı kök neden, aynı anda düzeltilmeli).

`/ozel-siparis` kuralı (satır 76-80) ise `prefix()` yerine doğrudan `p.startsWith('/ozel-siparis')`
kullanıyor — bu YÜZDEN doğru çalışıyor, doğru desen budur.

## İstenen

1. `ek-yetki.ts` satır 83'teki `prefix(p, '/transfer-')` ifadesini `p.startsWith('/transfer-')` ile
   değiştirin (tıpkı `/ozel-siparis` kuralındaki gibi ham `startsWith`).
2. Aynı dosyada satır 122 ve 124'teki `prefix(p, '/cari-')` ve `prefix(p, '/nitelik-')` ifadelerini
   de `p.startsWith('/cari-')` / `p.startsWith('/nitelik-')` ile değiştirin.
3. `prefix()` fonksiyonunun kullanıldığı TÜM diğer satırları (`/urun-varyanlar`, `/sync-retry`,
   `/sync-override`, `/branch/`, `/sirket-ayar/` vb.) tek tek kontrol edin — her birinin gerçek
   route path'leriyle (admin.controller.ts'te `router.xxx('/...')` tanımları) segment sınırı
   (`/xxx/...`) formatında mı yoksa bitişik kelime (`/xxx-...`) formatında mı olduğunu doğrulayın;
   segment sınırı doğruysa `prefix()` kalsın, bitişikse `startsWith()`'e çevirin. Bu, aynı hatanın
   başka bir yerde tekrar etmediğinden emin olmak için gerekli.

## Test

1. STORE_MANAGER (İlker Yolcu) ile satışta yerel stok olmayan bir ürün seçip "5.5 Temin" adımında
   başka lokasyondan (ör. ANADEPO) transfer talebi açmayı deneyin — artık `INSUFFICIENT_PERMISSION`
   almadan transfer talebinin oluştuğunu/akışın devam ettiğini gösterin.
2. `/admin/transfer-kabul` ve `/admin/transfer-urun-ara` uçlarını da POS_ROLES'ten (ADMIN olmayan)
   bir kullanıcıyla test edip artık erişilebildiğini doğrulayın.
3. `/admin/cari-ara` ve `/admin/nitelik-listesi` uçlarını `DEPO_URUN_GIRIS` veya `URUN_YAPILANDIRMA`
   ek yetkisi olan (ADMIN olmayan) bir kullanıcıyla test edin — artık erişilebildiğini gösterin.
4. Regresyon: ADMIN kullanıcıyla tüm bu uçların hâlâ normal çalıştığını, yetkisi olmayan sıradan bir
   SALES_STAFF'ın (DEPO_TRANSFER yetkisi yoksa) hâlâ 403 aldığını doğrulayın (fix'in aşırı
   gevşetmediğini kanıtlamak için).

## Rapor formatı

Değişen satırlar (ek-yetki.ts) + varsa `prefix()` kontrolünde bulunan başka hatalı kural + dört test
senaryosunun sonucu (STORE_MANAGER temin akışı ekran görüntüsü dahil).
