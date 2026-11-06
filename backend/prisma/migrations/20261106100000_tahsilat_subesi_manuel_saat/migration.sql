-- 06.11.2026
-- 1) Açık hesap tahsilatı, parayı ALAN şubenin kasasında görünsün (ör. GVN1 satışının borcu GVN2'de
--    ödenince GVN2 kasası). Yeni kolon boş olabilir; boşsa eskisi gibi satışın şubesi kullanılır.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "tahsilatBranchId" TEXT;
-- Dünkü güncellemeden beri girilen tahsilatlarda giren personel kayıtlı → onun şubesi yazılır.
UPDATE "Payment" p
SET "tahsilatBranchId" = u."branchId"
FROM "User" u
WHERE p."createdByUserId" = u."id"
  AND p."tahsilatBranchId" IS NULL
  AND p."paymentType" IN ('CASH', 'CARD', 'TRANSFER');

-- 2) Manuel tahsilat saatleri: veritabanı saat dilimi Europe/Istanbul olduğu için kayıtlar
--    Türkiye saatiyle yazılmıştı (diğer tüm tablolar UTC) → ekranda 3 saat ileri görünüyordu.
--    Hepsi UTC'ye çevrilir (anlık zaman değişmez, sadece saklama biçimi düzelir).
UPDATE "ManuelTahsilat"
SET "createdAt" = ("createdAt" AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'UTC';
