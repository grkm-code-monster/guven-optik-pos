/**
 * Etiket görsellerini (PNG data URL) normal bir A4 yazıcıdan çıkacak şekilde
 * bir PDF'e dizer ve dosyayı indirir. Etiket yazıcısı/Argox sürücüsü GEREKMEZ —
 * kullanıcı PDF'i herhangi bir yazıcıdan (lazer/mürekkep püskürtmeli) bastırıp
 * makasla keser.
 */
import { createPdfDoc } from '../../utils/pdf-fonts'

export type EtiketGorselSayfa = {
  dataUrl: string
  genislikMm: number
  yukseklikMm: number
}

const A4_W_MM = 210
const A4_H_MM = 297
const KENAR_MM = 8
const BOSLUK_MM = 3

/**
 * Etiket görsellerini A4 sayfalara gridle yerleştirip PDF olarak indirir.
 * Her etiketin etrafına ince kesim kılavuz çizgisi eklenir.
 */
export async function etiketleriPdfOlustur(
  sayfalar: EtiketGorselSayfa[],
  dosyaAdi = 'depo-etiketleri.pdf',
): Promise<void> {
  if (!sayfalar.length) return

  const { genislikMm: w, yukseklikMm: h } = sayfalar[0]
  const doc = await createPdfDoc({ format: 'a4', unit: 'mm', orientation: 'portrait' })

  const usableW = A4_W_MM - KENAR_MM * 2
  const usableH = A4_H_MM - KENAR_MM * 2
  const cols = Math.max(1, Math.floor((usableW + BOSLUK_MM) / (w + BOSLUK_MM)))
  const rows = Math.max(1, Math.floor((usableH + BOSLUK_MM) / (h + BOSLUK_MM)))
  const sayfaBasi = cols * rows

  doc.setDrawColor(190)
  doc.setLineWidth(0.1)

  sayfalar.forEach((s, i) => {
    const sayfaIndex = Math.floor(i / sayfaBasi)
    const sayfaIci = i % sayfaBasi
    if (sayfaIndex > 0 && sayfaIci === 0) doc.addPage()

    const satir = Math.floor(sayfaIci / cols)
    const sutun = sayfaIci % cols
    const x = KENAR_MM + sutun * (w + BOSLUK_MM)
    const y = KENAR_MM + satir * (h + BOSLUK_MM)

    doc.addImage(s.dataUrl, 'PNG', x, y, w, h)
    doc.rect(x, y, w, h)
  })

  doc.save(dosyaAdi)
}
