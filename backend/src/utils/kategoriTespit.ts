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

/**
 * Odoo kategori yolunu ("All / GÜNEŞ GÖZLÜĞÜ / ALT" gibi) segmentlere ayırıp
 * ana kategoriyi eşleştiren segmenti bulur, hemen bir sonraki segmenti
 * (varsa) "alt kategori" olarak döner. Alt segment yoksa null döner.
 *
 * Bu, her ana kategorinin Odoo'daki gerçek alt kırılımını (Güneş/Çerçeve için
 * Alt/Orta/Orta Üst/Üst tier'ları, Lens/Aksesuar/Solüsyon için ürün tipi
 * alt kategorileri, Cam için ürün grubu alt kategorileri) tek bir genel
 * mekanizmayla, hardcode isim listesi olmadan yakalamayı sağlar.
 */
export function kategoriAltKirilimTespit(
  kategoriPath: string,
): { etiket: KategoriEtiket; altKategori: string | null } {
  const segments = kategoriPath
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)

  for (let i = 0; i < segments.length; i++) {
    const upper = segments[i].toUpperCase()
    const found = KATEGORI_MAP.find((k) => k.anahtar.some((a) => upper.includes(a)))
    if (found) {
      const alt = segments[i + 1] ?? null
      return { etiket: found.kategori, altKategori: alt }
    }
  }
  return { etiket: 'DİĞER', altKategori: null }
}
