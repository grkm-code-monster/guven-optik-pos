export type ElementType =
  | 'kulakcik'
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
  | 'serbestMetin'

export type CanvasElement = {
  id: string
  type: ElementType
  x: number
  y: number
  width?: number
  height?: number
  fontSize?: number
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
  utsKodu: '08612345678903',
  sonGuncelleme: new Date().toLocaleDateString('tr-TR'),
}

export const PALETTE: Array<{
  type: ElementType
  label: string
  defaults: Partial<CanvasElement>
}> = [
  { type: 'urunAdi', label: 'Ürün Adı', defaults: { fontSize: 16 } },
  { type: 'icReferans', label: 'İç Referans', defaults: { fontSize: 12 } },
  { type: 'renkVaryant', label: 'Renk/Varyant', defaults: { fontSize: 12 } },
  { type: 'icReferansRenk', label: 'İç Ref + Renk', defaults: { fontSize: 12 } },
  { type: 'fiyat', label: 'Fiyat', defaults: { fontSize: 30 } },
  { type: 'kdvDahildir', label: 'KDV DAHİLDİR', defaults: { fontSize: 9 } },
  { type: 'sonGuncelleme', label: 'Son Fiyat Güncelleme', defaults: { fontSize: 9 } },
  { type: 'seriNo', label: 'Seri No', defaults: { fontSize: 12 } },
  { type: 'barcode128', label: 'Barkod (Code128)', defaults: { width: 255, height: 100 } },
  { type: 'gs1datamatrix', label: 'GS1 DataMatrix', defaults: { width: 115, height: 115 } },
  { type: 'serbestMetin', label: 'Serbest Metin', defaults: { fontSize: 12, text: 'Metin' } },
]

function kulakcik(yukseklikDots: number): CanvasElement {
  return {
    id: 'kulakcik',
    type: 'kulakcik',
    x: 0,
    y: 0,
    width: 80,
    height: yukseklikDots,
    locked: true,
  }
}

export const SABLON_UTSLI: EtiketSablon = {
  ad: "Optik Çerçeve (UTS'li)",
  kategori: 'CERCEVE',
  etiketGenislik: 100,
  etiketYukseklik: 50,
  elemanlar: [
    kulakcik(400),
    { id: 'e1', type: 'urunAdi', x: 95, y: 30, fontSize: 16 },
    { id: 'e2', type: 'icReferansRenk', x: 95, y: 50, fontSize: 12 },
    { id: 'e3', type: 'fiyat', x: 95, y: 85, fontSize: 30 },
    { id: 'e4', type: 'kdvDahildir', x: 95, y: 101, fontSize: 9 },
    { id: 'e5', type: 'sonGuncelleme', x: 95, y: 125, fontSize: 9 },
    { id: 'e6', type: 'gs1datamatrix', x: 540, y: 10, width: 115, height: 115 },
  ],
}

export const SABLON_UTSSIZ: EtiketSablon = {
  ad: "Optik Çerçeve (UTS'siz)",
  kategori: 'CERCEVE',
  etiketGenislik: 100,
  etiketYukseklik: 50,
  elemanlar: [
    kulakcik(400),
    { id: 'e1', type: 'urunAdi', x: 95, y: 30, fontSize: 16 },
    { id: 'e2', type: 'icReferansRenk', x: 95, y: 50, fontSize: 12 },
    { id: 'e3', type: 'fiyat', x: 95, y: 85, fontSize: 30 },
    { id: 'e4', type: 'kdvDahildir', x: 95, y: 101, fontSize: 9 },
    { id: 'e5', type: 'sonGuncelleme', x: 95, y: 125, fontSize: 9 },
    { id: 'e6', type: 'barcode128', x: 540, y: 8, width: 255, height: 100 },
  ],
}

export const BASLANGIC_SABLONLARI = [SABLON_UTSLI, SABLON_UTSSIZ]

export function elementLabel(type: ElementType): string {
  if (type === 'kulakcik') return 'Kulakçık'
  return PALETTE.find((p) => p.type === type)?.label ?? type
}

export function previewText(el: CanvasElement, veri: EtiketVeri): string {
  switch (el.type) {
    case 'kulakcik': return ''
    case 'urunAdi': return veri.urunAdi ?? 'ÖRNEK ÜRÜN ADI'
    case 'icReferans': return veri.icReferans ?? 'REF001'
    case 'renkVaryant': return veri.renkVaryant ?? 'Siyah'
    case 'icReferansRenk': return `${veri.icReferans ?? 'REF001'} · ${veri.renkVaryant ?? 'Siyah'}`
    case 'fiyat': return `${Number(veri.fiyat ?? 999).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`
    case 'kdvDahildir': return 'KDV DAHİLDİR'
    case 'sonGuncelleme': return veri.sonGuncelleme ?? new Date().toLocaleDateString('tr-TR')
    case 'seriNo': return `Seri: ${veri.seriNo ?? 'SN-123456'}`
    case 'serbestMetin': return el.text ?? 'Metin'
    case 'barcode128': return '|||| CODE128 ||||'
    case 'gs1datamatrix': return '▣ GS1 DM'
    default: return ''
  }
}
