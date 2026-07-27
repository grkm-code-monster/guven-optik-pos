# Yeni Satış Sayfası — Mobilde Taşan Grid Düzeltmesi

## Sorun

Telefondan `/sales/new` (Yeni Satış) açıldığında sağdaki "Özet" paneli ekrandan taşıyor, "Genel Toplam" gibi satırlar kesiliyor. Kök neden: `packages/web/src/pages/NewSalePage.tsx` dosyasının en dış render'ında (satır ~273) sabit iki-sütunlu bir grid var:

```tsx
<div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' }}>
```

`320px` sabit genişlikli sağ sütun (Özet paneli), dar telefon ekranlarında (~360-400px) ana içerikle birlikte sığmıyor ve yatay taşmaya sebep oluyor. Bu, daha önce yapılan sidebar/AppLayout mobil düzeltmesinin kapsamı dışındaydı (sayfa içerikleri ayrı bırakılmıştı) — şimdi bu spesifik sayfa için aynı "mobil algılama" pattern'i uygulanacak.

## Yapılacaklar

### 1) Paylaşılan bir `useIsMobile` hook'u oluştur (yoksa)

`packages/web/src/hooks/useSidebarResponsive.ts` içinde zaten `MOBILE_BREAKPOINT_PX = 768` sabiti ve `matchMedia` tabanlı bir mobil tespiti var. Bunu tekrar yazmamak için, aynı dosyaya (veya yeni `packages/web/src/hooks/useIsMobile.ts` dosyasına) şu genel amaçlı hook'u ekle:

```ts
export function useIsMobile(breakpointPx: number = MOBILE_BREAKPOINT_PX): boolean {
  const [mobil, setMobil] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${breakpointPx}px)`).matches
  })
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`)
    const onChange = () => setMobil(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpointPx])
  return mobil
}
```

### 2) `NewSalePage.tsx`'te kullan

- `const mobil = useIsMobile()` ekle.
- Satır ~273'teki dış grid'i şu şekilde değiştir:

```tsx
<div
  style={{
    display: mobil ? 'flex' : 'grid',
    flexDirection: mobil ? 'column' : undefined,
    gridTemplateColumns: mobil ? undefined : '1fr 320px',
    gap: '16px',
  }}
>
```

Bu sayede mobilde tek sütun (üstte adım butonları + aktif adımın içeriği, altında Özet paneli), masaüstünde mevcut iki sütunlu görünüm aynen korunur.

- Sağdaki "Özet" panelinin `height: 'fit-content'` stiline dokunmana gerek yok, tek sütun akışında zaten doğal yüksekliğini alır.

### 3) Adım butonları (1. Müşteri, 2. Ürünler ...)

Bu butonlar zaten `flexWrap: 'wrap'` ile sarmalanıyor, ek bir değişiklik gerekmiyor — sadece dış grid tek sütuna indiğinde bunlar da düzgün genişlikte kalacak.

### 4) Kapsam

Bu talimat SADECE `NewSalePage.tsx`'in dış grid'ini kapsıyor. `ItemsStep`, `PricingStep`, `PaymentStep`, `LensMeasurementStep`, `StokTeminStep`, `StatusStep` gibi alt adım component'lerinin kendi içindeki tablo/form düzenleri bu talimatın kapsamı DIŞINDA — onlar ayrı, gerektikçe ele alınacak.

## Test

- DevTools mobil simülasyonda (ör. iPhone 12, 390px genişlik) `/sales/new` sayfasını aç: Özet paneli artık taşmamalı, adım butonlarının altında tam genişlikte görünmeli.
- Masaüstünde (>768px) sayfanın görünümü ÖNCEKİYLE AYNI kalmalı (iki sütun, sağda sabit 320px Özet paneli).
- `tsc --noEmit` temiz olmalı.
