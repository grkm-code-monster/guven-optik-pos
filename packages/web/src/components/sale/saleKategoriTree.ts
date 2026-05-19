import type { ItemType } from './saleKategoriTree.types'

export type KategoriLeaf = { label: string; kategoriId: number }
export type KategoriBranch = { label: string; children: KategoriNode[] }
export type KategoriNode = KategoriLeaf | KategoriBranch

export function isKategoriLeaf(node: KategoriNode): node is KategoriLeaf {
  return 'kategoriId' in node
}

/** Ürün tipi seçilince doğrudan arama (alt kategori ekranı yok) */
export const DIREKT_KATEGORI_ID: Partial<Record<ItemType, number>> = {
  FRAME: 6,
  SUN: 7,
  ACCESSORY: 8,
}

export function hasKategoriTree(type: ItemType): boolean {
  return Boolean(KATEGORI_TREE[type]?.length)
}

export function getKategoriTreeRoot(type: ItemType): KategoriNode[] {
  return KATEGORI_TREE[type] ?? []
}

const LENS_TREE: KategoriNode[] = [
  {
    label: 'Progresif',
    children: [
      { label: 'Üst Grup', kategoriId: 11 },
      { label: 'Orta Üst Grup', kategoriId: 12 },
      { label: 'Orta Grup', kategoriId: 13 },
      { label: 'Alt', kategoriId: 14 },
    ],
  },
  {
    label: 'Tek Odaklı',
    children: [
      {
        label: 'Kişiye Özel',
        children: [
          { label: 'Kişiye Özel HD', kategoriId: 17 },
          { label: 'Kişiye Özel HD MAX', kategoriId: 18 },
          { label: 'Kişiye Özel HD ANTİFATİQ', kategoriId: 19 },
          { label: 'Kişiye Özel MAX ANTİFATİQ', kategoriId: 20 },
        ],
      },
      {
        label: 'Miyopi',
        children: [
          { label: 'Miyopi Kontrol', kategoriId: 22 },
          { label: 'Myocare', kategoriId: 23 },
        ],
      },
      {
        label: 'Standart Üretim',
        children: [
          { label: 'Plus HD', kategoriId: 25 },
          { label: 'Standart HD', kategoriId: 26 },
        ],
      },
    ],
  },
  {
    label: 'Bifokal',
    children: [
      { label: 'Bifokal D Segment', kategoriId: 28 },
      { label: 'Bifokal A-Line', kategoriId: 29 },
      { label: 'Bifokal Çizgisiz', kategoriId: 30 },
    ],
  },
  {
    label: 'Özel Cam',
    children: [{ label: 'Ofis', kategoriId: 32 }],
  },
  {
    label: 'Stok Cam',
    children: [
      {
        label: 'Beyaz',
        children: [
          { label: 'Standart', kategoriId: 35 },
          { label: 'Plus', kategoriId: 36 },
          { label: 'Prime', kategoriId: 37 },
        ],
      },
      {
        label: 'Fotokromik',
        children: [
          { label: 'Standart', kategoriId: 39 },
          { label: 'Plus', kategoriId: 40 },
          { label: 'Prime', kategoriId: 41 },
        ],
      },
    ],
  },
]

const KATEGORI_TREE: Partial<Record<ItemType, KategoriNode[]>> = {
  SOLUTION: [
    { label: 'Büyük', kategoriId: 52 },
    { label: 'Orta', kategoriId: 53 },
    { label: 'Küçük', kategoriId: 54 },
    { label: 'Damla', kategoriId: 55 },
  ],
  CONTACT: [
    { label: 'Standart', kategoriId: 46 },
    { label: 'Günlük', kategoriId: 47 },
    { label: 'Torik', kategoriId: 48 },
    { label: 'Multifokal', kategoriId: 49 },
    { label: 'Renkli', kategoriId: 50 },
  ],
  LENS: LENS_TREE,
}
