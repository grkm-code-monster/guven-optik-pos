# Reçete Ekleme Ekranları — Mobilde Sıkışan R/L Göz Kutuları Düzeltmesi

## Sorun

`packages/web/src/components/sale/CustomerStep.tsx` içindeki iki modal — **"Gözlük Reçetesi Ekle"** (`rxModalOpen`, `RxRow` kullanıyor) ve **"Lens Reçetesi Ekle"** (`lensRxModalOpen`, `LensRow` kullanıyor) — R (Sağ) ve L (Sol) göz kutularını şu sabit grid ile yan yana diziyor:

```tsx
<div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center' }}>
```

Ortadaki `auto` sütun, dikey yazılı ("Aynı →", `writingMode: 'vertical-rl'`) bir kopyalama butonu. Dar telefon ekranında R ve L kutuları neredeyse yarı genişliğe düşüyor; her kutunun içinde de SPH/CYL/AKS (ve bazen ADD) için 3-4 sütunlu ikinci bir grid daha var — bu iç içe sıkışma, 11px font'lu seçim kutularını okunamaz hale getiriyor. Bu, `RxRow` (satır ~1472) ve `LensRow` (satır ~1625) fonksiyonlarının her ikisinde de aynı desende tekrarlanıyor.

## Yapılacaklar

### 1) `useIsMobile` hook'unu içe aktar

`packages/web/src/hooks/useSidebarResponsive.ts` içinde zaten `useIsMobile()` var (sidebar ve Yeni Satış grid düzeltmelerinde kullanıldı). `CustomerStep.tsx`'in başına ekle:

```ts
import { useIsMobile } from '../../hooks/useSidebarResponsive'
```

### 2) `RxRow` component'i (satır ~1472)

- Fonksiyonun içine `const mobil = useIsMobile()` ekle.
- Dış grid'i şöyle değiştir:

```tsx
<div
  style={{
    display: mobil ? 'flex' : 'grid',
    flexDirection: mobil ? 'column' : undefined,
    gridTemplateColumns: mobil ? undefined : '1fr auto 1fr',
    gap: '12px',
    alignItems: mobil ? 'stretch' : 'center',
  }}
>
```

- "Aynı →" kopyalama butonunun stilini mobilde normal (yatay) bir tam-genişlik butona çevir — `writingMode: 'vertical-rl'` sadece masaüstünde kalsın:

```tsx
style={{
  padding: mobil ? '10px 12px' : '8px 10px',
  borderRadius: '8px',
  border: '1px solid #C8102E',
  backgroundColor: '#fdf2f4',
  color: '#C8102E',
  fontSize: mobil ? '13px' : '11px',
  fontWeight: '700',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  writingMode: mobil ? 'horizontal-tb' : 'vertical-rl',
  width: mobil ? '100%' : undefined,
}}
```

Buton metnini mobilde "Sağı Sola Kopyala" gibi daha açıklayıcı yapabilirsin (opsiyonel, "Aynı →" da kalabilir).

- R ve L kutularının içindeki SPH/CYL/AKS(/ADD) iç grid'i (satır ~1509-1521 ve ~1586-1598) mobilde 2 sütuna düşür (3-4 sütun yerine), okunabilirlik için:

```tsx
style={{
  display: 'grid',
  gridTemplateColumns: mobil ? '1fr 1fr' : (r.add ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr'),
  gap: '6px',
  marginTop: '10px',
}}
```

(L tarafı için de aynı mantık, `l.add` ile.)

### 3) `LensRow` component'i (satır ~1625)

Aynı üç değişikliği burada da uygula:
- `const mobil = useIsMobile()` ekle.
- Dış `1fr auto 1fr` grid'i mobilde dikey `flex column`'a çevir.
- "Aynı →" butonunu mobilde yatay + tam genişlik yap.
- R/L içindeki SPH/CYL/AKS 3 sütunlu grid'i mobilde 2 sütuna düşür (satır ~1660 ve ~1728).

### 4) Modal genel padding (opsiyonel iyileştirme)

`rxModalOpen` ve `lensRxModalOpen` modallarının dış kutusundaki `padding: 24` değerini mobilde `16`'ya düşürebilirsin (`CustomerStep` component'inde zaten `useIsMobile` importlanacaksa, `const mobil = useIsMobile()` ana component'e de eklenip modal `<div>` stiline `padding: mobil ? 16 : 24` verilebilir). Bu opsiyonel, öncelik R/L kutularının düzeltilmesi.

## Kapsam

Sadece `CustomerStep.tsx` içindeki `RxRow` ve `LensRow` component'leri (dolayısıyla hem "Yeni Reçete Ekle" hem "Lens Reçetesi Ekle" hem de "Hızlı Müşteri Oluştur" modalındaki gömülü reçete sekmeleri, çünkü hepsi aynı `RxRow`/`LensRow`'u kullanıyor). Reçete geçmişi kartları (satır ~498-584, `receteHistory.map`) zaten `display:'grid', gridTemplateColumns:'1fr 1fr'` kullanıyor ama küçük/kısa metin içerdiği için muhtemelen sorun değil — dokunma, önce yukarıdaki değişiklikleri yapıp test et.

## Test

- DevTools mobil simülasyonda (iPhone 12, ~390px): "+ Yeni Reçete Ekle" ve "+ Lens Reçetesi Ekle" butonlarına bas, R ve L kutularının alt alta, tam genişlikte ve okunabilir geldiğini doğrula.
- Masaüstünde (>768px) görünüm ÖNCEKİYLE AYNI kalmalı (R | Aynı → | L yan yana).
- `tsc --noEmit` temiz olmalı.
