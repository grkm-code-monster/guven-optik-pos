# Güven Optik POS — Proje Özeti
Son güncelleme: 03.07.2026

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
- ERP: Odoo 16 (port 8069) — XML-RPC
- DB: optikpos (PostgreSQL)

## PDKS Mekan ID Eşleşmesi
GVN1=5732, GVN2=5727, GVN3=5733, GVN5=5735, GVN6=5781, GVN7=5779, GVN8=8026, GVN9=5734, ANADEPO=8027, GVN10=eksik

## Entegrasyonlar
- Odoo: Aktif (NG)
- Uyumsoft: Aktif (NG) — ADESE/POTENTIAL credentials bekleniyor
- Patron PDKS: Aktif (GVN2, GVN10) — GVN6/7/8 403 hatası
- UTS: Aktif (şube bazlı token)
- İYS/KVKK: Altyapı hazır — credentials bekleniyor
- WhatsApp Business: Bekliyor
- Worldline POS: Bekliyor

## Tamamlanan Modüller
- POS: Müşteri arama (POS+Odoo), reçete 2 sekme, stok cam SPH+CYL öneri+transpoze, DRAFT devam, KVK mock
- Satışlar: Liste (PAID varsayılan), detay 3 sekme, DRAFT devam butonu
- Müşteriler: Arama+düzenleme, TC kimlik, Odoo birleşik, satış görüntüleme
- Depo: Uyumsoft fatura, bekleyen fatura kartları, sipariş ürün girişi, transfer
- Admin: Tanımlamalar, Şirket Tanımları (NG/ADESE/POTENTIAL), İYS modal, Kampanyalar
- Dashboard: DRAFT uyarısı, Görevler sekmesi
- Garanti: Temel kayıt (GTK-XXXX), lot izlenebilirlik, iade flow DB altyapısı

## Yapılacaklar (Öncelik)
1. Garanti & İade admin ekranı — iade talepleri, tedarikçi gruplandırma, onay akışı
2. Kullanıcı/personel kurulumu — tüm şubeler
3. İYS entegrasyonu — credentials gelince
4. ADESE/POTENTIAL Uyumsoft — credentials bekleniyor
5. GVN6/7/8 PDKS — 403 hatası, destek bekleniyor
6. GVN10 PDKS mekan ID — eksik
7. Worldline — haber bekleniyor
8. WhatsApp Business API
9. Kontakt lens stok önerisi
10. Tedarikçi ürün adı kaydı

## DB Notları (03.07.2026)
- Migration reset yapıldı — Campaign, SirketAyar tabloları direkt SQL ile oluşturuldu
- WarrantyClaim: 6 yeni alan (returnBranchId, supplierId, returnDeadline, cargoTrackingNo, adminApprovedAt, adminApprovedBy)
- Şubeler yeniden oluşturuldu: ANADEPO, GVN1-3, GVN5-10
- Enum'lar (CampaignType, CampaignScope) direkt SQL ile oluşturuldu

## Önemli Dosyalar
- backend/src/modules/admin/admin.controller.ts (~5700+ satır)
- backend/src/modules/odoo/odoo.service.ts
- backend/src/modules/pdks/pdks.service.ts
- backend/src/modules/warranty/warranty.service.ts
- packages/web/src/pages/admin/DepoPage.tsx (~1400 satır)
- packages/web/src/components/sale/CustomerStep.tsx (~1532 satır)
- packages/web/src/components/sale/ItemsStep.tsx (~1089 satır)
