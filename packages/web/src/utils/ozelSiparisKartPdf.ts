import type jsPDF from 'jspdf'
import { createPdfDoc, PDF_FONT_FAMILY } from './pdf-fonts'

/**
 * Reçeteli gözlük camı garanti/reçete kartı — ZC100 kart yazıcı ile basılır.
 *
 * ÖNEMLİ: Kartın kendisi (kırmızı GÜVEN OPTİK şeridi, logo, tablo çizgileri,
 * "Müşteri No / Date / Type / Eye / Sph / Cyl / Axe / Add / User" etiketleri
 * ve alttaki ADESE garanti metni) ÖNCEDEN BASILI PVC kart olarak geliyor.
 * Bu PDF SADECE değişken değerleri (siyah metin) o hazır kartın boş
 * hücrelerine denk gelecek konumlara yazar — arka plan/çizgi/logo basmaz.
 *
 * Kart standart kredi kartı boyutu: 85.6mm x 54mm (CR80, yatay).
 *
 * Aşağıdaki X/Y koordinatları kartın fotoğrafına bakılarak tahmini olarak
 * ayarlandı. İlk fiziksel baskıdan sonra hizalama kaymışsa, sadece bu
 * dosyadaki KOORDINATLAR sabitini nudge edip tekrar deneyin — buton her
 * seferinde yeniden basılabilir.
 */

const KART_GENISLIK_MM = 85.6
const KART_YUKSEKLIK_MM = 54

// Kartın solundaki kırmızı logo şeridi ~bu genişlikte — metin ondan sonra başlar
// v4: her şey 1cm (10mm) sağa kaydırıldı
const BEYAZ_ALAN_BASLANGIC_X = 3

// v3 — kullanıcının fiziksel ölçümüne göre düzeltildi (30.07.2026):
// Müşteri No / Tarih / Ürün Adı: 20mm sola, 10mm aşağı
// Reçete bilgileri (tablo): 20mm sola, 5mm aşağı
// Müşteri Adı: 20mm sola, 2mm aşağı
const KOORDINATLAR = {
  musteriNo: { x: BEYAZ_ALAN_BASLANGIC_X + 20, y: 27 },
  tarih: { x: BEYAZ_ALAN_BASLANGIC_X + 48, y: 27 },
  tip: { x: BEYAZ_ALAN_BASLANGIC_X + 12, y: 33.5 },
  // Tablo: Eye/Göz | Sph | Cyl | Axe | Add sütunları
  tabloSutun: {
    sph: BEYAZ_ALAN_BASLANGIC_X + 20,
    cyl: BEYAZ_ALAN_BASLANGIC_X + 34,
    axe: BEYAZ_ALAN_BASLANGIC_X + 48,
    add: BEYAZ_ALAN_BASLANGIC_X + 61,
  },
  satirSag: 38.5,
  satirSol: 46,
  kullanici: { x: BEYAZ_ALAN_BASLANGIC_X + 14, y: 50 },
}

export type OzelSiparisKartParams = {
  musteriAdi: string
  musteriTelefon?: string | null
  urunAdi: string
  sagSph?: number | null
  sagCyl?: number | null
  sagAks?: number | null
  sagAdd?: number | null
  solSph?: number | null
  solCyl?: number | null
  solAks?: number | null
  solAdd?: number | null
  tarih?: string | null
}

function fmt(v?: number | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(2)}`
}

async function buildOzelSiparisKartDoc(params: OzelSiparisKartParams): Promise<jsPDF> {
  const doc = await createPdfDoc({
    orientation: 'landscape',
    unit: 'mm',
    format: [KART_YUKSEKLIK_MM, KART_GENISLIK_MM],
  })

  doc.setFont(PDF_FONT_FAMILY, 'normal')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)

  const tarihStr = params.tarih
    ? new Date(params.tarih).toLocaleDateString('tr-TR')
    : new Date().toLocaleDateString('tr-TR')

  // Müşteri No alanına — ayrı bir sıra numaramız olmadığı için telefon yazılır
  doc.text(params.musteriTelefon || '—', KOORDINATLAR.musteriNo.x, KOORDINATLAR.musteriNo.y)
  doc.text(tarihStr, KOORDINATLAR.tarih.x, KOORDINATLAR.tarih.y)
  doc.text(params.urunAdi || '—', KOORDINATLAR.tip.x, KOORDINATLAR.tip.y)

  const { sph, cyl, axe, add } = KOORDINATLAR.tabloSutun
  doc.text(fmt(params.sagSph), sph, KOORDINATLAR.satirSag)
  doc.text(fmt(params.sagCyl), cyl, KOORDINATLAR.satirSag)
  doc.text(params.sagAks != null ? `${params.sagAks}°` : '—', axe, KOORDINATLAR.satirSag)
  doc.text(fmt(params.sagAdd), add, KOORDINATLAR.satirSag)

  doc.text(fmt(params.solSph), sph, KOORDINATLAR.satirSol)
  doc.text(fmt(params.solCyl), cyl, KOORDINATLAR.satirSol)
  doc.text(params.solAks != null ? `${params.solAks}°` : '—', axe, KOORDINATLAR.satirSol)
  doc.text(fmt(params.solAdd), add, KOORDINATLAR.satirSol)

  doc.setFont(PDF_FONT_FAMILY, 'bold')
  doc.text(params.musteriAdi || '—', KOORDINATLAR.kullanici.x, KOORDINATLAR.kullanici.y)

  return doc
}

export async function downloadOzelSiparisKartPdf(params: OzelSiparisKartParams): Promise<void> {
  const doc = await buildOzelSiparisKartDoc(params)
  doc.save(`Garanti-Karti-${(params.musteriAdi || 'musteri').replace(/\s+/g, '-')}.pdf`)
}
