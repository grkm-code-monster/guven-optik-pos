# Güven Optik POS — Proje Özeti
Son güncelleme: 13.07.2026

## Şirket Yapısı
- **NG** (Nejla Gümüşkesen Optik) — VKN: 23819441406 — Odoo company ID: 2
  - Şubeler: GVN2, GVN10, ANADEPO
- **ADESE** (Adese Optik Ltd. Şti.) — Odoo company ID: 3
  - Şubeler: GVN1, GVN3, GVN6, GVN7, GVN8, GVN9
- **POTENTIAL** (Potential Ophthalmic Dış Tic. Ltd. Şti.) — Odoo company ID: 4
  - Şubeler: GVN5

## Teknik Altyapı
- Backend: Node.js + TypeScript + Prisma + PostgreSQL (port 3000)
- Frontend: React + Vite (port 5173)
- ERP: Odoo 17 (port 8069) — XML-RPC
- DB: optikpos (PostgreSQL)

## PDKS Mekan ID Eşleşmesi
GVN1=5732, GVN2=5727, GVN3=5733, GVN5=5735, GVN6=5781, GVN7=5779, GVN8=8026, GVN9=5734, ANADEPO=8027, GVN10=eksik

## Entegrasyonlar
| Sistem | Durum |
|--------|--------|
| Odoo | Aktif — çok şirketli (NG/ADESE/POTENTIAL) |
| Uyumsoft e-Fatura | NG: POS satışları gönderiliyor; **şirketler arası transfer faturaları GİTMİYOR** (Not #50) |
| Uyumsoft e-İrsaliye | Kod hazır; NG yetki eksik (EFT-IST-SRVS12); aynı şirket içi teyit edilmedi |
| Patron PDKS | GVN2/GVN10 aktif; GVN6/7/8 → 403 |
| UTS | Manuel bildirim ekranı var; **transfer akışında otomatik bildirim YOK** (Not #49) |
| İYS/KVKK | Altyapı hazır — credentials bekleniyor |
| WhatsApp / Worldline | Bekliyor |

## Tamamlanan Modüller (güncel)
- **POS:** Müşteri (POS+Odoo), reçete, stok cam öneri, DRAFT devam, confirmSale race koruması, draftMeta
- **Satış:** Liste/detay, ölçüm kalıcı, VOID Odoo güvenliği, açık hesap FIFO toplu ödeme
- **Depo:** Uyumsoft gelen fatura, ürün girişi, **Lot Transfer** (`transfer-olustur`), **Excel Toplu Envanter** (3 faz), sayım gerçek Odoo yazımı
- **Transfer:** Şirket içi picking; şirketler arası `executeSirketlerArasiTransfer` (fatura+picking+rollback); e-İrsaliye kısmen
- **Stok:** Stok Kontrol, Fiyatı Değişen Ürünler (5 faz), stok-adjustment servisi
- **Ürün:** Yapılandırma, dynamic varyant (Not #29), 1383 junk varyant temizliği, import sonrası otomatik temizlik
- **Laboratuvar:** Atölye ekranı, kırılma bildirimi, LabIncident, rapor entegrasyonu
- **Admin:** Tanımlamalar, Kampanyalar, Garanti/İade (Odoo transfer bağlı), Özel Sipariş şirketler arası
- **Muhasebe:** SGK/Vakıf ödeme, e-fatura POS satış, PDF indirme

## KRİTİK açık sorunlar (13.07.2026)
1. **Not #50** — Şirketler arası transfer Odoo faturası Uyumsoft/GİB'e gitmiyor
2. **Not #49** — Hiçbir transfer yolunda UTS bildirimi yok
3. **Not #48** — Stok Kontrol transferinde lot/UTS seçimi eksik
4. **Transfer 4'lüsü** merkezi değil — lot taşıma / e-irsaliye / e-fatura / UTS ayrı köşelerde

## Transfer prensibi (hedef)
Her transferde birlikte: (1) stok/lot taşıma ✅ (2) e-İrsaliye ⚠️ (3) e-Fatura (şirketler arası) ❌ Uyumsoft (4) UTS ❌

## Yapılacaklar (Öncelik)
1. **Not #50** — Şirketler arası e-Fatura → FaturaKuyruk/Uyumsoft
2. **Not #49** — Transfer UTS bildirimi
3. **Not #48** — Stok Kontrol lot seçimi (Lot Transfer referans)
4. Merkezi transfer sonrası aksiyon paketi
5. e-İrsaliye yetki (NG) + aynı şirket içi teyit
6. ADESE/POTENTIAL Uyumsoft credentials
7. GVN6/7/8 PDKS 403, GVN10 mekan ID
8. Not #44 — Eski Odoo veri aktarımı
9. PROMAX etiket test, UTS envanter Excel (kullanıcıdan)

## Önemli dosyalar (güncel)
- `backend/src/modules/admin/sirketler-arasi-transfer.service.ts` — şirketler arası transfer
- `backend/src/modules/admin/transfer-olustur.service.ts` — Lot Transfer + ortak transfer girişi
- `backend/src/modules/admin/stock-adjustment.service.ts` — sayım + envanter stok yazımı
- `backend/src/modules/admin/envanter-import-*.ts` — Excel toplu envanter
- `backend/src/modules/admin/varyant-import-temizlik.service.ts` — varyant otomatik temizlik
- `backend/src/modules/efatura/uyumsoft-efatura.service.ts` — e-Fatura (POS; transfer hariç)
- `packages/web/src/pages/admin/DepoPage.tsx` — Depo (Lot Transfer, Excel Envanter, sayım)
- `packages/web/src/components/depo/ExcelEnvanterImportTab.tsx` — Excel envanter UI
