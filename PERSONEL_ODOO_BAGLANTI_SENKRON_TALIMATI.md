# Personel↔User Odoo bağlantısı senkron hatası

## Sorun (doğrulanmış)

`Personel.odooEmployeeId` ve `User.odooEmployeeId` iki ayrı, birbirinden bağımsız alan
(`schema.prisma` satır ~20 ve Personel modelinde ayrı ayrı tanımlı). İki farklı uç bunları
bağımsız yazıyor:

- `POST /admin/personel-odoo-bagla/:id` (`admin.controller.ts` satır ~4358) — sadece
  `Personel.odooEmployeeId` yazıyor. İK & Prim → Personeller "Bağla" burayı kullanıyor.
- `POST /admin/users/:id/link-employee` — sadece `User.odooEmployeeId` yazıyor. Tanımlamalar →
  Personeller "Odoo Çalışan Bağla" burayı kullanıyor.

`TanimlamalarPage.tsx` satır 841-842'deki "✓ Bağlı" rozeti **sadece `User.odooEmployeeId`'ye**
bakıyor. Sonuç: İK & Prim'den bağlanan biri Tanımlamalar'da hâlâ "bağlı değil" görünüyor, kullanıcı
tekrar bağlamaya zorlanıyor (Görkem'in bildirdiği sorun tam bu).

Bu, şube (`subeId`) senkronunda daha önce çözdüğümüz sorunla birebir aynı desen.

## Yapılacak

1. `personel-odoo-bagla/:id` route'unu güncelleyin: `Personel.odooEmployeeId` yazarken, eğer
   `Personel.userId` doluysa aynı anda `User.odooEmployeeId`'yi de aynı değere yazın (tek
   transaction'da).
2. `users/:id/link-employee` route'unu güncelleyin: `User.odooEmployeeId` yazarken, eğer o
   User'a bağlı bir `Personel` kaydı varsa (`personelId` FK ya da `personelByUser` ilişkisi)
   `Personel.odooEmployeeId`'yi de aynı değere yazın.
3. **Tek seferlik düzeltme:** Mevcut kayıtlarda iki alan arasında uyuşmazlık olan (biri dolu
   diğeri boş, ya da farklı ID) kaç kişi var, raporlayın; hangi alan doğruysa (muhtemelen
   `Personel.odooEmployeeId`, çünkü İK & Prim akışı daha güncel/kapsamlı) diğerine kopyalayın.
   Farklı iki ID'de dolu olan (çelişkili) kayıt varsa otomatik düzeltmeyin, bana raporlayın.

## Kabul kriteri

- İK & Prim'den bağlanan biri Tanımlamalar → Personeller'de de "✓ Bağlı" görünüyor (ve tersi).
- Uyuşmazlık raporu bana geldi, çelişkili kayıt varsa onaysız düzeltilmedi.

Bitince kısa rapor isterim.
