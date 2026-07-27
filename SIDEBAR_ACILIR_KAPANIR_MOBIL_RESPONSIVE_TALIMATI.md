# Sidebar Açılır/Kapanır + Mobil Responsive Talimatı

## Amaç

İki ayrı layout dosyasında sabit genişlikte, her zaman görünen sol menü var:

1. `packages/web/src/components/layout/Sidebar.tsx` + `packages/web/src/components/layout/AppLayout.tsx` (normal POS ekranları — satış, transfer, raporlar vs.)
2. `packages/web/src/pages/admin/AdminLayout.tsx` (Yönetim Paneli)

İkisinde de sidebar sabit piksel genişliğinde (`240px` / `260px`), her zaman DOM'da ve her zaman açık. Bunu şu şekilde değiştir:

- **Masaüstünde:** Sidebar'ı açıp kapatabilen bir toggle butonu (hamburger ikon ☰) header'a eklenecek. Kapalıyken sidebar tamamen gizlenecek (ya da ister 0 genişliğe insin, ister `display:none` olsun — önemli olan ana içeriğin tüm genişliği kaplaması). Tercih kullanıcının son seçimi `localStorage`'da saklanmalı ki sayfa yenilenince sıfırlanmasın.
- **Mobilde (viewport genişliği ~768px altı):** Sidebar varsayılan olarak KAPALI gelmeli, bir "off-canvas drawer" gibi davranmalı: toggle butonuna basınca sidebar sayfanın üzerine (position: fixed, z-index yüksek) kayarak açılmalı, arkasında yarı saydam bir overlay/backdrop olmalı, overlay'e tıklayınca ya da bir menü linkine tıklayınca sidebar otomatik kapanmalı. Ana içerik mobilde sidebar'dan etkilenmeden tam genişlik kullanmalı.
- **Ekran boyutu tespiti:** `window.matchMedia('(max-width: 768px)')` veya `window.innerWidth` + `resize` event listener ile mobil/masaüstü ayrımı yapılacak (bu proje inline style kullanıyor, ekstra bir CSS framework eklemeye gerek yok — mevcut inline-style pattern'i takip et). Ekran boyutu değiştiğinde (ör. tarayıcı penceresi küçültülüp büyütülürse, ya da telefon döndürülürse) state güncellenmeli.

## 1) `packages/web/src/components/layout/Sidebar.tsx`

- Component'e `acik: boolean` ve `onKapat: () => void` props ekle (veya bir context/store üzerinden yönet, tercih sende — en basiti prop olarak geçmek).
- Masaüstünde `acik=false` ise sidebar'ı render etme ya da `width: 0, overflow: hidden` yap (translateX ile kaydırmak daha akıcı bir deneyim verir: `transform: translateX(acik ? 0 : '-100%')`, `transition: 'transform 0.2s ease'`).
- Mobilde sidebar her zaman `position: fixed; top:0; left:0; height:100vh; z-index: 50` olmalı (drawer gibi davranması için), masaüstünde normal `flex` akışının bir parçası olarak kalmaya devam edebilir (static/relative).
- Nav linklerine tıklanınca (`NavLink onClick`) mobilde otomatik `onKapat()` çağrılmalı ki kullanıcı bir sayfaya gidince menü kendiliğinden kapansın.
- Sidebar içindeki her `NavLink`'e `onClick={() => { if (mobil) onKapat() }}` eklenmesi gerekiyor — bunun için Sidebar component'inin kendisi `window.innerWidth <= 768` kontrolünü yapabilir ya da dışarıdan `mobil: boolean` prop'u da alabilir.

## 2) `packages/web/src/components/layout/AppLayout.tsx`

- `const [sidebarAcik, setSidebarAcik] = useState(...)` state'i ekle. Başlangıç değeri: masaüstünde `localStorage.getItem('sidebarAcik') !== 'false'` (varsayılan açık), mobilde her zaman `false` (varsayılan kapalı).
- `window.matchMedia('(max-width: 768px)')` ile bir `mobil: boolean` state'i tut, resize/change event'iyle güncelle.
- Header'daki (`height: 56px` kırmızı bar) sol tarafına, sayfa başlığından önce bir hamburger buton ekle: `☰` ikonu, `onClick={() => setSidebarAcik(v => !v)}`. Masaüstünde tercih değiştiğinde `localStorage.setItem('sidebarAcik', String(yeniDeger))` ile kaydet.
- Mobilde sidebar açıkken, sidebar'ın arkasına tam ekran kaplayan bir overlay div ekle (`position: fixed; inset:0; background: rgba(0,0,0,0.4); z-index: 40`), üzerine tıklayınca `setSidebarAcik(false)` çağrılsın.
- Ana içerik alanının (`flex:1` olan div) `padding` değerlerini küçük ekranlarda azalt (ör. mobilde `padding: '8px'` yerine mevcut `16px`, header'daki `pageTitle` çok uzun olduğunda taşmaması için `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap` ekle).

## 3) `packages/web/src/pages/admin/AdminLayout.tsx`

Aynı mantığı burada da uygula:

- Sidebar (`<aside>`) için aynı açılır/kapanır + mobil drawer davranışı.
- Üstteki `Yönetim Paneli` başlığının yanına hamburger toggle butonu ekle (mevcut bildirim zili butonunun yanına, `justify-content: space-between` düzeni zaten var, üçüncü bir buton olarak eklenebilir ya da başlığın soluna konabilir).
- Menü gruplarındaki her `NavLink`'e mobilde tıklanınca sidebar'ı kapatacak `onClick` ekle.
- `<main>` elemanının `padding: 24` değerini mobilde küçült (ör. `padding: mobil ? 12 : 24`).

## 4) Genel mobil uyumluluk notu

Bu talimatın kapsamı sidebar + genel sayfa iskeleti ile sınırlı — POS içindeki tüm sayfaların (satış ekranı, depo, raporlar vs.) tek tek mobil optimize edilmesi ayrı ve çok daha büyük bir iş, bu talimatın parçası DEĞİL. Şimdilik hedef: telefondan açıldığında sidebar ekranı kaplamasın, kullanıcı menüyü açıp kapatabilsin, sayfa yatay taşma (horizontal scroll) yapmadan en azından okunabilir olsun. `index.html`'de zaten `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` mevcut, ek bir viewport ayarı gerekmiyor.

## 5) Test

- Masaüstünde: hamburger butonuna basınca sidebar açılıp kapanmalı, sayfa yenilenince son tercih korunmalı.
- Tarayıcı DevTools'ta mobil cihaz simülasyonuna geçip (ör. iPhone 12 boyutu) sidebar'ın varsayılan kapalı geldiğini, hamburger'a basınca overlay ile birlikte açıldığını, bir menü linkine tıklayınca otomatik kapandığını doğrula.
- Gerçek bir telefondan `http://89.252.133.40` adresini açıp aynı davranışı doğrula.

## Kapsam dışı (dokunma)

- Diğer tüm sayfa içerikleri, tablo/form düzenleri.
- Etiket motoru, deploy butonu, printer entegrasyonu — bu talimatla ilgisi yok.
