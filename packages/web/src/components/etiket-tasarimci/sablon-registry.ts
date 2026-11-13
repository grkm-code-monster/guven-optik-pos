import type { SablonId, SablonTanim } from './sablon-types'

/**
 * 13.11.2026 — Şablon listesi (sadece kimlik + ad + boyut).
 * Görünüm ve baskı TAMAMEN veritabanındaki şablondan gelir ("Etiket Merkezi → Şablonlar").
 * Eski "Etiket Tasarımcısı" sayfası ve ona ait çizim/ZPL dosyaları kaldırıldı.
 */
export const SABLONLAR: SablonTanim[] = [
  { id: 'gunes-aksesuar', ad: 'Güneş Gözlüğü / Aksesuar', aciklama: 'Katlanır · 102×20 mm', etiketGenislik: 102, etiketYukseklik: 20 },
  { id: 'optik-cerceve-uts', ad: "Optik Çerçeve (UTS'li)", aciklama: 'Katlanır · 102×20 mm · UTS karekodu', etiketGenislik: 102, etiketYukseklik: 20 },
  { id: 'depo-kutu', ad: 'Depo Etiketi', aciklama: '50×30 mm · A4 PDF', etiketGenislik: 50, etiketYukseklik: 30 },
  { id: 'kampanya-yuzde', ad: 'Kampanya — Yüzde İndirim', aciklama: '%XX İNDİRİM · 102×20 mm', etiketGenislik: 102, etiketYukseklik: 20 },
  { id: 'kampanya-fiyat', ad: 'Kampanya — Fiyat Düşüşü', aciklama: 'ESKİ → YENİ fiyat · 102×20 mm', etiketGenislik: 102, etiketYukseklik: 20 },
  { id: 'kampanya-ikinci', ad: 'Kampanya — İkinci Ürün', aciklama: '2. ÜRÜN %50 · 102×20 mm', etiketGenislik: 102, etiketYukseklik: 20 },
]

export function sablonBul(id: SablonId): SablonTanim | undefined {
  return SABLONLAR.find((s) => s.id === id)
}
