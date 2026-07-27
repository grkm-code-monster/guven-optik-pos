import { autoTable } from 'jspdf-autotable'
import type jsPDF from 'jspdf'
import { createPdfDoc, PDF_FONT_FAMILY } from './pdf-fonts'

export type GunlukKasaPdfRow = {
  saleId: string
  createdAt: string
  deliveryDate: string | null
  customerName: string
  itemSummary: string
  grossTotal: string
  netTotal: string
  taxExcluded: string
  discountPct: string
  cashAmount: string
  sgkAmount: string
  cardPayments: Array<{
    bankName: string
    installment: number
    grossAmount: string
    commissionAmount?: string
  }>
  repName?: string
}

export type GunlukKasaPdfSummary = {
  gross: number
  net: number
  taxFree: number
  discount: number
  cash: number
  slip: number
  sgk: number
}

export type GunlukKasaPdfParams = {
  branchName: string
  date: string
  rows: GunlukKasaPdfRow[]
  summary: GunlukKasaPdfSummary
  showRep?: boolean
  durumNotu?: string
}

function fmtPdfMoney(value: string | number | null | undefined): string {
  if (value === undefined || value === null || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n)) return String(value)
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtPdfDate(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('tr-TR')
}

function cardSlipTotal(row: GunlukKasaPdfRow): number {
  return row.cardPayments.reduce((sum, payment) => sum + Number(payment.grossAmount), 0)
}

function truncate(text: string, max = 42): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function fmtPdfCurrency(value: string | number | null | undefined): string {
  if (value === undefined || value === null || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n)) return String(value)
  return `₺${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`
}

export function formatKasaFormuBaslik(branchName: string, date: string): string {
  const iso = date.slice(0, 10)
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return `${branchName} - TARİHLİ KASA FORMU`
  return `${branchName} - ${d}/${m}/${y} TARİHLİ KASA FORMU`
}

function drawSummaryCards(
  doc: jsPDF,
  summary: GunlukKasaPdfSummary,
  saleCount: number,
  y: number,
): number {
  const kenarBosluk = 14
  const sayfaGenislik = doc.internal.pageSize.getWidth()
  const kartSayisi = 6
  const kartAralik = 4
  const kartYukseklik = 20
  const kartGenislik = (sayfaGenislik - kenarBosluk * 2 - kartAralik * (kartSayisi - 1)) / kartSayisi
  const discountPct = summary.gross ? `${((summary.discount / summary.gross) * 100).toFixed(1)}%` : '—'

  const kartlar = [
    { baslik: 'BRÜT CİRO', deger: fmtPdfCurrency(summary.gross) },
    { baslik: 'SİPARİŞ BEDELİ', deger: fmtPdfCurrency(summary.net) },
    { baslik: 'NAKİT GİRİŞ', deger: fmtPdfCurrency(summary.cash) },
    { baslik: 'SLİP TOPLAMI', deger: fmtPdfCurrency(summary.slip) },
    { baslik: 'İSKONTO %', deger: discountPct },
    { baslik: 'SATIŞ ADEDİ', deger: String(saleCount) },
  ]

  kartlar.forEach((kart, i) => {
    const x = kenarBosluk + i * (kartGenislik + kartAralik)

    doc.setFillColor(192, 57, 43)
    doc.roundedRect(x, y, kartGenislik, kartYukseklik, 4, 4, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFont(PDF_FONT_FAMILY, 'bold')
    doc.setFontSize(8)
    doc.text(kart.baslik, x + kartGenislik / 2, y + 7, { align: 'center' })

    doc.setFontSize(16)
    doc.text(kart.deger, x + kartGenislik / 2, y + 16, { align: 'center' })
  })

  return y + kartYukseklik
}

function drawDurumNotuSection(
  doc: jsPDF,
  notMetin: string,
  startY: number,
  marginX: number,
): void {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - marginX * 2
  let y = startY + 10

  if (y > pageHeight - 30) {
    doc.addPage()
    y = 20
  }

  doc.setFont(PDF_FONT_FAMILY, 'bold')
  doc.setFontSize(12)
  doc.setTextColor(163, 45, 45)
  doc.text('Günlük Durum Notu', marginX, y)
  y += 7

  doc.setFont(PDF_FONT_FAMILY, 'normal')
  doc.setFontSize(9)
  doc.setTextColor(55, 65, 81)
  const text = notMetin.trim() || '—'
  const lines = doc.splitTextToSize(text, contentWidth) as string[]
  for (const line of lines) {
    if (y > pageHeight - 16) {
      doc.addPage()
      y = 20
    }
    doc.text(line, marginX, y)
    y += 5
  }
}

async function buildGunlukKasaPdfDoc(params: GunlukKasaPdfParams): Promise<jsPDF> {
  const { branchName, date, rows, summary, showRep, durumNotu = '' } = params
  const doc = await createPdfDoc({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 14
  const generatedAt = new Date().toLocaleString('tr-TR')
  const discountPct = summary.gross ? `${((summary.discount / summary.gross) * 100).toFixed(1)}%` : '—'

  doc.setFont(PDF_FONT_FAMILY, 'bold')
  doc.setFontSize(18)
  doc.setTextColor(163, 45, 45)
  doc.text('GÜVEN OPTİK', marginX, 14)

  doc.setFontSize(13)
  doc.setTextColor(17, 24, 39)
  doc.text('Günlük Kasa Raporu', marginX, 21)

  doc.setFont(PDF_FONT_FAMILY, 'normal')
  doc.setFontSize(10)
  doc.setTextColor(55, 65, 81)
  doc.text(`${branchName} · ${fmtPdfDate(date)}`, marginX, 27)
  doc.text(`Oluşturulma: ${generatedAt}`, marginX, 32)

  const tableStartY = drawSummaryCards(doc, summary, rows.length, 38) + 6

  const headers = [
    'Alışveriş Tarihi',
    'Teslim Tarihi',
    'Müşteri',
    'Ürün Kalemleri',
    'Brüt Tutar',
    'Sipariş Bedeli',
    'Vergi Hariç',
    'İsk.%',
    'Nakit',
    'Taksit',
    'Oran',
    'Slip Top.',
    'Reçete Bed.',
    ...(showRep ? ['Temsilci'] : []),
  ]

  const body = rows.map((row) => [
    fmtPdfDate(row.createdAt),
    row.deliveryDate ? fmtPdfDate(row.deliveryDate) : '—',
    truncate(row.customerName, 24),
    truncate(row.itemSummary || '—', 36),
    fmtPdfMoney(row.grossTotal),
    fmtPdfMoney(row.netTotal),
    fmtPdfMoney(row.taxExcluded),
    `${row.discountPct}%`,
    fmtPdfMoney(row.cashAmount),
    row.cardPayments[0]?.installment != null ? String(row.cardPayments[0].installment) : '—',
    row.cardPayments[0]?.bankName ?? '—',
    fmtPdfMoney(cardSlipTotal(row)),
    fmtPdfMoney(row.sgkAmount),
    ...(showRep ? [row.repName ?? '—'] : []),
  ])

  const totalRow = [
    'Toplam',
    '',
    '',
    '',
    fmtPdfMoney(summary.gross),
    fmtPdfMoney(summary.net),
    fmtPdfMoney(summary.taxFree),
    discountPct,
    fmtPdfMoney(summary.cash),
    '',
    '',
    fmtPdfMoney(summary.slip),
    fmtPdfMoney(summary.sgk),
    ...(showRep ? [''] : []),
  ]

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: marginX, right: marginX, bottom: 14 },
    theme: 'grid',
    styles: {
      font: PDF_FONT_FAMILY,
      fontSize: 7,
      cellPadding: 1.2,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      font: PDF_FONT_FAMILY,
      fillColor: [163, 45, 45],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7,
    },
    footStyles: {
      font: PDF_FONT_FAMILY,
      fillColor: [250, 250, 250],
      textColor: [17, 24, 39],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 18 },
      2: { cellWidth: 24 },
      3: { cellWidth: 38 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', cellWidth: 16 },
      6: { halign: 'right', cellWidth: 16 },
      7: { halign: 'right', cellWidth: 10 },
      8: { halign: 'right', cellWidth: 14 },
      9: { halign: 'center', cellWidth: 10 },
      10: { cellWidth: 16 },
      11: { halign: 'right', cellWidth: 14 },
      12: { halign: 'right', cellWidth: 14 },
      ...(showRep ? { 13: { cellWidth: 20 } } : {}),
    },
    head: [headers],
    body: body.length > 0 ? body : [['Kayıt yok.', ...Array(headers.length - 1).fill('')]],
    foot: body.length > 0 ? [totalRow] : undefined,
    showFoot: body.length > 0 ? 'lastPage' : undefined,
  })

  const tableEndY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableStartY
  drawDurumNotuSection(doc, durumNotu, tableEndY, marginX)

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

export async function generateGunlukKasaPdfBlob(params: GunlukKasaPdfParams): Promise<Blob> {
  const doc = await buildGunlukKasaPdfDoc(params)
  return doc.output('blob')
}

export async function downloadGunlukKasaPdf(params: GunlukKasaPdfParams): Promise<void> {
  const doc = await buildGunlukKasaPdfDoc(params)
  doc.save(`${formatKasaFormuBaslik(params.branchName, params.date)}.pdf`)
}
