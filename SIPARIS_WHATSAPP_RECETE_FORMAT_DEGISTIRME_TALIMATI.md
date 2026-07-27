# WhatsApp mesajı — Reçete satırı formatı değişsin

## Durum

Görkem, WhatsApp mesajındaki "Reçete" satırlarının formatını değiştirmek istiyor.

**Şu anki format:**
```
Sağ Göz — SPH: 0, CYL: -0.25, AKS: 10, PD: 30
Sol Göz — SPH: 0, CYL: -0.5, AKS: 0, PD: 30
```

**İstenen format:**
```
Sağ Göz — 0,00 -0.25, AKS: 10
Sol Göz — 0,00 -0.50, AKS: 0
```

Dikkat edilecek noktalar (Görkem'in verdiği örnekten çıkarıldı):
- `SPH:` etiketi kalksın, değer direkt yazılsın, **virgüllü, 2 ondalık basamaklı** ("0" → "0,00").
- `CYL:` etiketi kalksın, değer direkt yazılsın, **noktalı, 2 ondalık basamaklı** ("-0.25" aynen
  kalıyor, "-0.5" → "-0.50" oluyor — yani SPH virgül, CYL nokta kullanıyor, bu ayrım bilinçli,
  değiştirmeyin).
- `AKS:` etiketi KALSIN, değer aynen yazılsın (aynen "AKS: 10" gibi).
- `PD:` ve `ADD:` bu satırdan tamamen kaldırılsın.

## İstenen değişiklik

`packages/web/src/pages/admin/DepoPage.tsx`, `formatGozSatiri()` fonksiyonu (satır ~756-772) ve
onu çağıran iki yer (`buildSiparisDetayMesaji()` içinde, satır ~776-777) şu şekilde güncellensin:

```ts
function formatSphDeger(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCylDeger(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toFixed(2)
}

function formatGozSatiri(
  label: string,
  sph: unknown,
  cyl: unknown,
  aks: unknown,
): string | null {
  const degerler: string[] = []
  if (hasMesajDeger(sph)) degerler.push(formatSphDeger(sph))
  if (hasMesajDeger(cyl)) degerler.push(formatCylDeger(cyl))
  const aksVar = hasMesajDeger(aks)
  if (!degerler.length && !aksVar) return null
  const parts: string[] = []
  if (degerler.length) parts.push(degerler.join(' '))
  if (aksVar) parts.push(`AKS: ${aks}`)
  return `${label} — ${parts.join(', ')}`
}
```

Çağrı noktalarını (ADD/PD argümanlarını kaldırarak) güncelleyin:
```ts
const sag = formatGozSatiri('Sağ Göz', detay.sagSph, detay.sagCyl, detay.sagAks)
const sol = formatGozSatiri('Sol Göz', detay.solSph, detay.solCyl, detay.solAks)
```
`detay.sagAdd`/`detay.sagPd`/`detay.solAdd`/`detay.solPd` artık bu satıra hiç geçmesin (ADD/PD'nin
başka bir yerde — ör. reçete bölümünün altında ayrı bir satır olarak — gösterilmesi isteniyorsa bunu
Görkem'e sorup netleştirin, şu talimat kapsamında SADECE bu satırdan kaldırmanız isteniyor, başka
yere taşınması istenmiyor).

## Test

Aynı sipariş (Yaprak Gezer, SPH 0/CYL -0.25/AKS 10/PD 30 sağ; SPH 0/CYL -0.5/AKS 0/PD 30 sol) için
WhatsApp mesajını üretip, Reçete bölümünün BİREBİR şu şekilde çıktığını gösterin:
```
Sağ Göz — 0,00 -0.25, AKS: 10
Sol Göz — 0,00 -0.50, AKS: 0
```

## Rapor formatı

Değişen satırlar + üretilen tam mesaj örneği (Görkem'in verdiği hedef format ile birebir
karşılaştırın).
