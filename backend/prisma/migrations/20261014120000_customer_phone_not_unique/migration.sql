-- Müşteri eşleşmesi artık telefon değil, T.C. kimlik no (identityNo) üzerinden yapılıyor.
-- Aynı telefonu paylaşan farklı müşteriler (örn. kardeşler) artık "telefon zaten kayıtlı"
-- hatasıyla engellenmesin diye Customer.phone üzerindeki benzersizlik (unique) kısıtı kaldırıldı.
DROP INDEX IF EXISTS "Customer_phone_key";
