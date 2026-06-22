export const KATEGORI_MAP = [
  { anahtar: ['OPTİK CAM', 'OPTIK CAM', 'STOK CAM', 'STOK_CAM'], kategori: 'CAM' },
  { anahtar: ['OPTİK ÇERÇEVE', 'OPTIK CERCEVE', 'ÇERÇEVE', 'CERCEVE'], kategori: 'ÇERÇEVE' },
  { anahtar: ['LENS', 'KONTAKT', 'KONTAKTİF'], kategori: 'LENS' },
  { anahtar: ['SOLÜSYON', 'SOLUSYON', 'SOLUTION'], kategori: 'SOLÜSYON' },
  { anahtar: ['GÜNEŞ', 'GUNES', 'GÜNEŞ GÖZLÜĞÜ'], kategori: 'GÜNEŞ GÖZLÜĞÜ' },
  { anahtar: ['AKSESUAR'], kategori: 'AKSESUAR' },
] as const

export type KategoriEtiket = (typeof KATEGORI_MAP)[number]['kategori'] | 'DİĞER'

export function kategoriTespit(kategoriPath: string): KategoriEtiket {
  const upper = kategoriPath.toUpperCase()
  for (const k of KATEGORI_MAP) {
    if (k.anahtar.some((a) => upper.includes(a))) return k.kategori
  }
  return 'DİĞER'
}
