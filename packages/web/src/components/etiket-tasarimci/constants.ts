export type ElementType =
  | 'kulakcik'
  | 'cizgi'
  | 'cerceve'
  | 'urunAdi'
  | 'icReferans'
  | 'renkVaryant'
  | 'icReferansRenk'
  | 'fiyat'
  | 'kdvDahildir'
  | 'sonGuncelleme'
  | 'seriNo'
  | 'barcode128'
  | 'gs1datamatrix'
  | 'gs1Kod'
  | 'serbestMetin'

export type CanvasElement = {
  id: string
  type: ElementType
  x: number
  y: number
  x2?: number
  y2?: number
  width?: number
  height?: number
  fontSize?: number
  fontWeight?: string | number
  fill?: string
  text?: string
  locked?: boolean
}

export type EtiketSablon = {
  id?: string
  ad: string
  kategori: string
  elemanlar: CanvasElement[]
  etiketGenislik: number
  etiketYukseklik: number
}

export type EtiketVeri = {
  urunAdi?: string
  icReferans?: string
  renkVaryant?: string
  fiyat?: string | number
  seriNo?: string
  barkod?: string
  utsKodu?: string
  sonGuncelleme?: string
}

export const KATEGORILER = [
  { id: 'CERCEVE', label: 'Çerçeve' },
  { id: 'GUNES', label: 'Güneş Gözlüğü' },
  { id: 'AKSESUAR', label: 'Aksesuar' },
  { id: 'GENEL', label: 'Genel' },
] as const

export const BOYUTLAR = [
  { label: '100×50 mm', w: 100, h: 50 },
  { label: '80×40 mm', w: 80, h: 40 },
  { label: '60×30 mm', w: 60, h: 30 },
] as const

export const DOTS_PER_MM = 8

export function mmToDots(mm: number) {
  return Math.round(mm * DOTS_PER_MM)
}

export const ORNEK_VERI: EtiketVeri = {
  urunAdi: 'ÖRNEK ÜRÜN ADI',
  icReferans: 'REF001',
  renkVaryant: 'Siyah',
  fiyat: 999,
  seriNo: 'SN-123456',
  barkod: 'REF001',
  utsKodu: '08681234567890',
  sonGuncelleme: '22.06.2026',
}

export const PALETTE: Array<{
  type: ElementType
  label: string
  defaults: Partial<CanvasElement>
}> = [
  { type: 'urunAdi', label: 'Ürün Adı', defaults: { fontSize: 17 } },
  { type: 'icReferans', label: 'İç Referans', defaults: { fontSize: 13 } },
  { type: 'renkVaryant', label: 'Renk/Varyant', defaults: { fontSize: 13 } },
  { type: 'icReferansRenk', label: 'İç Ref + Renk', defaults: { fontSize: 13 } },
  { type: 'fiyat', label: 'Fiyat', defaults: { fontSize: 32 } },
  { type: 'kdvDahildir', label: 'KDV DAHİLDİR', defaults: { fontSize: 9 } },
  { type: 'sonGuncelleme', label: 'Son Fiyat Güncelleme', defaults: { fontSize: 9 } },
  { type: 'seriNo', label: 'Seri No', defaults: { fontSize: 9 } },
  { type: 'barcode128', label: 'Barkod (Code128)', defaults: { width: 255, height: 100 } },
  { type: 'gs1datamatrix', label: 'GS1 DataMatrix', defaults: { width: 120, height: 120 } },
  { type: 'serbestMetin', label: 'Serbest Metin', defaults: { fontSize: 12, text: 'Metin' } },
]

/** Optik Çerçeve (UTS'li) — sabit ZPL dot koordinatları, viewBox 0 0 800 400 */
export const SABLON_UTSLI_ELEMENTS: CanvasElement[] = [
  { id: 'cerceve', type: 'cerceve', x: 1, y: 1, width: 798, height: 398, locked: true },
  { id: 'kulakcik', type: 'kulakcik', x: 0, y: 0, width: 80, height: 400, locked: true },
  { id: 'ayirici-v', type: 'cizgi', x: 80, y: 0, x2: 80, y2: 400, locked: true },
  { id: 'urunAdi', type: 'urunAdi', x: 95, y: 30, fontSize: 17, fontWeight: 'bold', fill: '#111' },
  { id: 'icRefRenk', type: 'icReferansRenk', x: 95, y: 75, fontSize: 13, fill: '#333' },
  { id: 'fiyat', type: 'fiyat', x: 95, y: 130, fontSize: 32, fontWeight: 'bold', fill: '#000' },
  { id: 'kdv', type: 'kdvDahildir', x: 95, y: 175, fontSize: 9, fill: '#999' },
  { id: 'ayirici-h', type: 'cizgi', x: 95, y: 195, x2: 520, y2: 195, locked: true },
  { id: 'sonGunc', type: 'sonGuncelleme', x: 95, y: 215, fontSize: 9, fill: '#aaa' },
  { id: 'seri', type: 'seriNo', x: 95, y: 245, fontSize: 9, fill: '#aaa' },
  { id: 'gs1', type: 'gs1datamatrix', x: 550, y: 15, width: 120, height: 200 },
  { id: 'gs1k1', type: 'gs1Kod', x: 678, y: 220, fontSize: 8, fill: '#666', text: '(01) 08681234567890' },
  { id: 'gs1k2', type: 'gs1Kod', x: 678, y: 240, fontSize: 8, fill: '#666', text: '(21) SN-123456' },
  { id: 'gs1k3', type: 'gs1Kod', x: 678, y: 260, fontSize: 8, fill: '#666', text: '(11) 220622' },
  { id: 'gs1k4', type: 'gs1Kod', x: 678, y: 280, fontSize: 8, fill: '#666', text: '(10) 1' },
]

export const SABLON_UTSLI: EtiketSablon = {
  ad: "Optik Çerçeve (UTS'li)",
  kategori: 'CERCEVE',
  etiketGenislik: 100,
  etiketYukseklik: 50,
  elemanlar: SABLON_UTSLI_ELEMENTS.map((e) => ({ ...e })),
}

export const SABLON_UTSSIZ: EtiketSablon = {
  ad: "Optik Çerçeve (UTS'siz)",
  kategori: 'CERCEVE',
  etiketGenislik: 100,
  etiketYukseklik: 50,
  elemanlar: [
    { id: 'cerceve', type: 'cerceve', x: 1, y: 1, width: 798, height: 398, locked: true },
    { id: 'kulakcik', type: 'kulakcik', x: 0, y: 0, width: 80, height: 400, locked: true },
    { id: 'ayirici-v', type: 'cizgi', x: 80, y: 0, x2: 80, y2: 400, locked: true },
    { id: 'urunAdi', type: 'urunAdi', x: 95, y: 35, fontSize: 17, fontWeight: 'bold', fill: '#111' },
    { id: 'icRefRenk', type: 'icReferansRenk', x: 95, y: 58, fontSize: 13, fill: '#333' },
    { id: 'fiyat', type: 'fiyat', x: 95, y: 98, fontSize: 32, fontWeight: 'bold', fill: '#000' },
    { id: 'kdv', type: 'kdvDahildir', x: 95, y: 116, fontSize: 9, fill: '#999' },
    { id: 'ayirici-h', type: 'cizgi', x: 95, y: 124, x2: 520, y2: 124, locked: true },
    { id: 'sonGunc', type: 'sonGuncelleme', x: 95, y: 140, fontSize: 9, fill: '#aaa' },
    { id: 'seri', type: 'seriNo', x: 95, y: 156, fontSize: 9, fill: '#aaa' },
    { id: 'barcode', type: 'barcode128', x: 540, y: 8, width: 255, height: 100 },
  ],
}

export const BASLANGIC_SABLONLARI = [SABLON_UTSLI, SABLON_UTSSIZ]

export function elementLabel(type: ElementType): string {
  const labels: Record<string, string> = {
    kulakcik: 'Kulakçık',
    cizgi: 'Çizgi',
    cerceve: 'Dış çerçeve',
    gs1Kod: 'GS1 kod satırı',
  }
  return labels[type] ?? PALETTE.find((p) => p.type === type)?.label ?? type
}

export function previewText(el: CanvasElement, veri: EtiketVeri): string {
  switch (el.type) {
    case 'kulakcik':
    case 'cizgi':
    case 'cerceve':
      return ''
    case 'urunAdi':
      return veri.urunAdi ?? 'ÖRNEK ÜRÜN ADI'
    case 'icReferans':
      return veri.icReferans ?? 'REF001'
    case 'renkVaryant':
      return veri.renkVaryant ?? 'Siyah'
    case 'icReferansRenk':
      return `${veri.icReferans ?? 'REF001'}  |  ${veri.renkVaryant ?? 'Siyah'}`
    case 'fiyat':
      return `${Number(veri.fiyat ?? 999).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`
    case 'kdvDahildir':
      return 'KDV DAHİLDİR'
    case 'sonGuncelleme':
      return `Son fiyat günc: ${veri.sonGuncelleme ?? '22.06.2026'}`
    case 'seriNo':
      return `Seri: ${veri.seriNo ?? 'SN-123456'}`
    case 'gs1Kod':
      return el.text ?? ''
    case 'serbestMetin':
      return el.text ?? 'Metin'
    case 'barcode128':
      return 'CODE128'
    case 'gs1datamatrix':
      return 'GS1'
    default:
      return ''
  }
}
