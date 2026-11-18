/**
 * 18.11.2026 — VP. HAZIR GÜNEŞ CAMI (Odoo kategori #83 "BAKIM / Güneş Camları")
 *
 * Her kombinasyon ayrı stoklu kart; barkodu kombinasyonu taşır
 * (bkz. backend/scripts/gunes-cami-kart-ac.ts ve GUNES_STOK_CAM_KOMBINASYON.xlsx):
 *   086800002 + Hammadde(1-4) + Özellik(1-2) + Renk(1-8) + Baz(0=flat,2,4,6,8) + Kaplama(1-3)
 */
export const GUNES_CAMLARI_KATEGORI_ID = 83
export const GUNES_BARKOD_ONEKI = '086800002'

export type Secenek = { kod: string; ad: string }

export const HAMMADDELER: Secenek[] = [
  { kod: '1', ad: 'CR39' },
  { kod: '2', ad: 'Film' },
  { kod: '3', ad: 'Mineral' },
  { kod: '4', ad: 'Polikarbon' },
]
export const OZELLIKLER: Secenek[] = [
  { kod: '1', ad: 'Polarize' },
  { kod: '2', ad: 'Sun' },
]
export const RENKLER: Secenek[] = [
  { kod: '1', ad: 'Antirefle' },
  { kod: '2', ad: 'Kahverengi' },
  { kod: '3', ad: 'Füme' },
  { kod: '4', ad: 'Yeşil' },
  { kod: '5', ad: 'Kahverengi Degrade' },
  { kod: '6', ad: 'Füme Degrade' },
  { kod: '7', ad: 'Yeşil Degrade' },
  { kod: '8', ad: 'Diğer' },
]
export const BAZLAR: Secenek[] = [
  { kod: '0', ad: 'Flat' },
  { kod: '2', ad: '2' },
  { kod: '4', ad: '4' },
  { kod: '6', ad: '6' },
  { kod: '8', ad: '8' },
]
export const KAPLAMALAR: Secenek[] = [
  { kod: '1', ad: 'AR' },
  { kod: '2', ad: 'Kaplamasız' },
  { kod: '3', ad: 'Ayna' },
]

export const DIGER_RENK_KODU = '8'

export type GunesSecim = { hammadde: string; ozellik: string; renk: string; baz: string; kaplama: string }

export const ALAN_SIRASI: Array<{ alan: keyof GunesSecim; baslik: string; secenekler: Secenek[] }> = [
  { alan: 'hammadde', baslik: 'Hammadde', secenekler: HAMMADDELER },
  { alan: 'ozellik', baslik: 'Özellik', secenekler: OZELLIKLER },
  { alan: 'renk', baslik: 'Renk', secenekler: RENKLER },
  { alan: 'baz', baslik: 'Baz', secenekler: BAZLAR },
  { alan: 'kaplama', baslik: 'Kaplama', secenekler: KAPLAMALAR },
]

export function bosSecim(): GunesSecim {
  return { hammadde: '', ozellik: '', renk: '', baz: '', kaplama: '' }
}

export function secimTamMi(s: GunesSecim): boolean {
  return Boolean(s.hammadde && s.ozellik && s.renk && s.baz && s.kaplama)
}

export function barkodOlustur(s: GunesSecim): string {
  return `${GUNES_BARKOD_ONEKI}${s.hammadde}${s.ozellik}${s.renk}${s.baz}${s.kaplama}`
}

export function barkodCoz(barkod: string | null | undefined): GunesSecim | null {
  const b = String(barkod ?? '').trim()
  if (b.length !== GUNES_BARKOD_ONEKI.length + 5 || !b.startsWith(GUNES_BARKOD_ONEKI)) return null
  const r = b.slice(GUNES_BARKOD_ONEKI.length)
  return { hammadde: r[0], ozellik: r[1], renk: r[2], baz: r[3], kaplama: r[4] }
}

/** Bir seçenek, diğer seçimlerle birlikte var olan bir karta götürüyor mu? (yoksa düğme pasif) */
export function secenekMumkunMu(barkodlar: Set<string>, secim: GunesSecim, alan: keyof GunesSecim, kod: string): boolean {
  const deneme = { ...secim, [alan]: kod }
  for (const b of barkodlar) {
    const c = barkodCoz(b)
    if (!c) continue
    let uyar = true
    for (const { alan: a } of ALAN_SIRASI) {
      if (deneme[a] && c[a] !== deneme[a]) {
        uyar = false
        break
      }
    }
    if (uyar) return true
  }
  return false
}

export function isHazirGunesCamiItem(it: { odooCategoryId?: number | null; odooProductName?: string | null }): boolean {
  return it.odooCategoryId === GUNES_CAMLARI_KATEGORI_ID || /^VP\. HAZIR GÜNEŞ CAMI /.test(String(it.odooProductName ?? ''))
}
