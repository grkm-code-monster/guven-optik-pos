# Uyumsoft Ayarları ekranından şifre değiştirince e-Fatura bağlantı cache'i temizlenmiyor

## Durum

Görkem, Tanımlamalar → Uyumsoft Ayarları ekranından doğrudan doğru kullanıcı adı/şifreleri
kendisi girecek. Ama bu ekranın kaydet işlemi şu an SADECE e-İrsaliye bağlantı önbelleğini
temizliyor — e-Fatura/genel istemci önbelleği temizlenmiyor. Yani `uyumsoft_username`/
`uyumsoft_password` değiştirilse bile, backend yeniden başlatılmadan eski (önbelleğe alınmış) SOAP
bağlantısı kullanılmaya devam eder.

## Kök neden (kodda doğrulandı)

`backend/src/modules/admin/admin.controller.ts`, `POST /sirket-ayar/:sirketId` (satır 6695-6716):
```ts
// e-İrsaliye kimlik bilgisi değiştiyse SOAP client cache'ini temizle
const keys = Object.keys(ayarlar as Record<string, string>)
if (keys.some((k) => k.startsWith('uyumsoft_eirsaliye_'))) {
  const { clearDespatchClientCache } = await import('../efatura/uyumsoft-irsaliye.service')
  clearDespatchClientCache(req.params.sirketId)
}
```
Sadece `uyumsoft_eirsaliye_` önekli anahtarlar için `clearDespatchClientCache()` çağrılıyor.
`uyumsoft_username`/`uyumsoft_password` (e-Fatura + genel istemci) değiştiğinde HİÇBİR cache
temizlenmiyor. `backend/src/modules/uyumsoft/uyumsoft.service.ts`'te zaten hazır bir
`clearUyumsoftClientCache(sirketId?: string)` fonksiyonu var (satır 66-69) — bu handler'da hiç
çağrılmıyor.

## İstenen

`POST /sirket-ayar/:sirketId` handler'ını genişletin: `uyumsoft_username` veya `uyumsoft_password`
anahtarlarından biri değiştiyse, `clearUyumsoftClientCache(req.params.sirketId)`'i de çağırın:
```ts
const keys = Object.keys(ayarlar as Record<string, string>)
if (keys.some((k) => k.startsWith('uyumsoft_eirsaliye_'))) {
  const { clearDespatchClientCache } = await import('../efatura/uyumsoft-irsaliye.service')
  clearDespatchClientCache(req.params.sirketId)
}
if (keys.includes('uyumsoft_username') || keys.includes('uyumsoft_password')) {
  const { clearUyumsoftClientCache } = await import('../uyumsoft/uyumsoft.service')
  clearUyumsoftClientCache(req.params.sirketId)
}
```

## Test

1. Tanımlamalar → Uyumsoft Ayarları'ndan bir şirketin `uyumsoft_username`/`uyumsoft_password`
   alanlarını değiştirip kaydedin — backend'i YENİDEN BAŞLATMADAN hemen bir e-Fatura/bağlantı testi
   deneyin, yeni kimlik bilgisinin ANINDA kullanıldığını (eski cache'e takılmadığını) gösterin.
2. Sadece e-İrsaliye alanlarını değiştirdiğinizde eski davranışın (sadece despatch cache temizleme)
   hâlâ çalıştığını doğrulayın — regresyon olmasın.

## Rapor formatı

Değişen satırlar + test sonucu (kayıttan hemen sonra yeni kimlik bilgisinin kullanıldığının kanıtı).
