import { autoTable } from 'jspdf-autotable'
import type jsPDF from 'jspdf'
import { createPdfDoc, PDF_FONT_FAMILY } from './pdf-fonts'

/**
 * E-Ticaret siparişleri için kargo çıktısı: müşteri adı/adres/telefon + sipariş
 * kalemleri. Mağaza müdürünün kargo paketine yapıştırıp göndermesi için basit
 * bir çıktı — resmi e-İrsaliye ile karıştırılmamalı.
 */

export type KargoCiktisiItem = {
  ad: string
  adet: number
}

export type KargoCiktisiParams = {
  partnerSiparisNo: string
  referansNo?: string | null
  musteriAdSoyad: string
  musteriTelefon?: string | null
  musteriAdres?: string | null
  musteriIl?: string | null
  musteriIlce?: string | null
  items: KargoCiktisiItem[]
}

async function buildKargoCiktisiPdfDoc(params: KargoCiktisiParams): Promise<jsPDF> {
  const { partnerSiparisNo, referansNo, musteriAdSoyad, musteriTelefon, musteriAdres, musteriIl, musteriIlce, items } = params
  const doc = await createPdfDoc({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14
  const generatedAt = new Date().toLocaleString('tr-TR')

  doc.setFont(PDF_FONT_FAMILY, 'bold')
  doc.setFontSize(18)
  doc.setTextColor(163, 45, 45)
  doc.text('GÜVEN OPTİK — E-Ticaret', marginX, 16)

  doc.setFontSize(13)
  doc.setTextColor(17, 24, 39)
  doc.text('Kargo Çıktısı', marginX, 23)

  doc.setFont(PDF_FONT_FAMILY, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(55, 65, 81)
  doc.text(`Sipariş No: ${partnerSiparisNo}${referansNo ? `   ·   Satış Ref: ${referansNo}` : ''}`, marginX, 31)

  doc.setFont(PDF_FONT_FAMILY, 'bold')
  doc.setFontSize(11)
  doc.text('Alıcı Bilgileri', marginX, 41)
  doc.setFont(PDF_FONT_FAMILY, 'normal')
  doc.setFontSize(10)
  doc.text(`Ad Soyad: ${musteriAdSoyad || '—'}`, marginX, 48)
  doc.text(`Telefon: ${musteriTelefon || '—'}`, marginX, 54)
  const adresSatiri = [musteriAdres, musteriIlce, musteriIl].filter(Boolean).join(', ') || '—'
  const adresLines = doc.splitTextToSize(`Adres: ${adresSatiri}`, pageWidth - marginX * 2)
  doc.text(adresLines, marginX, 60)

  const tableStartY = 60 + adresLines.length * 5 + 8

  const headers = ['Ürün', 'Adet']
  const body = items.map((it) => [it.ad || '—', String(it.adet)])
  const toplamAdet = items.reduce((sum, it) => sum + it.adet, 0)
  const totalRow = ['Toplam', String(toplamAdet)]

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: marginX, right: marginX, bottom: 14 },
    theme: 'grid',
    styles: {
      font: PDF_FONT_FAMILY,
      fontSize: 10,
      cellPadding: 3,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      font: PDF_FONT_FAMILY,
      fillColor: [163, 45, 45],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10,
    },
    footStyles: {
      font: PDF_FONT_FAMILY,
      fillColor: [250, 250, 250],
      textColor: [17, 24, 39],
      fontStyle: 'bold',
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 140 },
      1: { halign: 'center', cellWidth: 30 },
    },
    head: [headers],
    body: body.length > 0 ? body : [['Kalem yok.', '']],
    foot: body.length > 0 ? [totalRow] : undefined,
    showFoot: body.length > 0 ? 'lastPage' : undefined,
  })

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont(PDF_FONT_FAMILY, 'normal')
    doc.setFontSize(8)
    doc.setTextColor(107, 114, 128)
    doc.text(`Oluşturulma: ${generatedAt}`, marginX, pageHeight - 6)
    doc.text(`Sayfa ${page} / ${pageCount}`, pageWidth - marginX, pageHeight - 6, { align: 'right' })
  }

  return doc
}

export async function downloadKargoCiktisiPdf(params: KargoCiktisiParams): Promise<void> {
  const doc = await buildKargoCiktisiPdfDoc(params)
  doc.save(`Kargo-Cikti-${params.partnerSiparisNo}.pdf`)
}
