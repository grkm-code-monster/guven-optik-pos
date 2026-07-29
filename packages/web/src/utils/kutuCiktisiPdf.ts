import { autoTable } from 'jspdf-autotable'
import type jsPDF from 'jspdf'
import { createPdfDoc, PDF_FONT_FAMILY } from './pdf-fonts'

/**
 * Şube transferleri için "kutu çıktısı" / sevkiyat listesi — lojistik/kurye
 * için hangi kutuda hangi ürünlerden kaçar adet olduğunu gösteren, fiyatsız
 * bir paketleme listesi. Resmi e-İrsaliye ile karıştırılmamalı; bu sadece
 * depo/kurye için basit bir kontrol listesidir.
 */

export type KutuCiktisiPdfItem = {
  ad: string
  varyant?: string | null
  seriNo?: string | null
  lotNo?: string | null
  barkod?: string | null
  beklenenAdet?: number | null
}

export type KutuCiktisiPdfParams = {
  refNo: string
  gonderen?: string | null
  alici?: string | null
  personel?: string | null
  tarih?: string | null
  items: KutuCiktisiPdfItem[]
}

function fmtTarih(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

async function buildKutuCiktisiPdfDoc(params: KutuCiktisiPdfParams): Promise<jsPDF> {
  const { refNo, gonderen, alici, personel, tarih, items } = params
  const doc = await createPdfDoc({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14
  const generatedAt = new Date().toLocaleString('tr-TR')

  doc.setFont(PDF_FONT_FAMILY, 'bold')
  doc.setFontSize(18)
  doc.setTextColor(163, 45, 45)
  doc.text('GÜVEN OPTİK', marginX, 16)

  doc.setFontSize(13)
  doc.setTextColor(17, 24, 39)
  doc.text('Kutu İçerik Listesi (Sevkiyat)', marginX, 23)

  doc.setFont(PDF_FONT_FAMILY, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(55, 65, 81)
  doc.text(`Transfer Ref: ${refNo}`, marginX, 31)
  doc.text(`${gonderen ?? '—'}  →  ${alici ?? '—'}`, marginX, 37)
  doc.text(`Personel: ${personel ?? '—'}   ·   Tarih: ${fmtTarih(tarih)}`, marginX, 43)

  const tableStartY = 50

  const headers = ['Ürün Adı', 'Varyant / Nitelik', 'Lot / Seri No', 'Barkod', 'Miktar']
  const body = items.map((it) => [
    it.ad || '—',
    it.varyant || '—',
    it.seriNo || it.lotNo || '—',
    it.barkod || '—',
    String(it.beklenenAdet ?? 1),
  ])
  const toplamAdet = items.reduce((sum, it) => sum + (it.beklenenAdet ?? 1), 0)
  const totalRow = ['Toplam', '', '', `${items.length} kalem`, String(toplamAdet)]

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: marginX, right: marginX, bottom: 14 },
    theme: 'grid',
    styles: {
      font: PDF_FONT_FAMILY,
      fontSize: 9,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      font: PDF_FONT_FAMILY,
      fillColor: [163, 45, 45],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    footStyles: {
      font: PDF_FONT_FAMILY,
      fillColor: [250, 250, 250],
      textColor: [17, 24, 39],
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 45 },
      2: { cellWidth: 35 },
      3: { cellWidth: 30 },
      4: { halign: 'center', cellWidth: 18 },
    },
    head: [headers],
    body: body.length > 0 ? body : [['Kalem yok.', '', '', '', '']],
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

export async function generateKutuCiktisiPdfBlob(params: KutuCiktisiPdfParams): Promise<Blob> {
  const doc = await buildKutuCiktisiPdfDoc(params)
  return doc.output('blob')
}

export async function downloadKutuCiktisiPdf(params: KutuCiktisiPdfParams): Promise<void> {
  const doc = await buildKutuCiktisiPdfDoc(params)
  doc.save(`Kutu-Cikti-${params.refNo}.pdf`)
}
