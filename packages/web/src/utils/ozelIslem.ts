/**
 * 18.11.2026 — Cam "Özel İşlem" kalemleri (renklendirme, odak kaydırma, prizma, inceltme…)
 *
 * Bir özel işlem, cama linkedItemId ile bağlı, linkType'ı OLMAYAN normal bir satış
 * kalemidir (camlar ise çerçeveye FRAME_LENS / CUSTOMER_FRAME ile bağlanır).
 *   maintenanceNature      → "Taraf: Sağ+Sol · Renk: Kahve · …" veya "Sağ → … | Sol → …" (bkz. nitelikOlustur)
 *   maintenanceDescription → firmaya not
 */
import type { SaleItem } from '../api/types'
import { isLensMeasurementSaleItem } from './saleMeasurements'

type KalemBenzeri = Pick<SaleItem, 'id' | 'linkedItemId' | 'linkType' | 'status'> & Partial<SaleItem>

export function isOzelIslemItem(item: KalemBenzeri): boolean {
  if (!item.linkedItemId || item.linkType) return false
  return !isLensMeasurementSaleItem(item as SaleItem)
}

function aktif(it: { status?: unknown }): boolean {
  return String(it.status ?? '').toUpperCase() !== 'VOID'
}

/** Bu cama bağlı (silinmemiş) özel işlemler */
export function camOzelIslemleri<T extends KalemBenzeri>(items: T[] | undefined, camId: string): T[] {
  return (items ?? []).filter((it) => aktif(it) && it.linkedItemId === camId && isOzelIslemItem(it))
}

/** Liste ekranlarında camın altında gösterilecek özel işlemleri ayırır:
 *  bağlı olduğu cam listede varsa o işlem ayrıca listelenmez. */
export function ustSeviyeKalemler<T extends KalemBenzeri>(items: T[]): T[] {
  const ids = new Set(items.filter(aktif).map((i) => i.id))
  return items.filter((it) => !(isOzelIslemItem(it) && it.linkedItemId && ids.has(it.linkedItemId)))
}

/** Bir camın (sağ/sol) işlem değerleri: alan etiketi → değer. "Detay" serbest metindir. */
export type TarafDegerleri = Record<string, string>

/** 18.11.2026 (2) — Sağ ve sol tek pencerede:
 *  - ikisi aynı  → "Taraf: Sağ+Sol · Renk: Kahve · Yoğunluk: %80 · Detay: …"
 *  - tek cam     → "Taraf: Sağ · …"
 *  - farklı      → "Sağ → Renk: Kahve · Detay: … | Sol → Renk: Gri" */
export type OzelIslemTaraflari = {
  sag: boolean
  sol: boolean
  ayni: boolean
  sagDeger: TarafDegerleri
  solDeger: TarafDegerleri
}

export type OzelIslemAlan = { etiket: string; secenekler?: string[]; serbest?: boolean; ipucu?: string }

/** İşlem adına göre her cam için sorulacak alanlar ("Detay" hepsinde en sonda ayrıca var). */
export function ozelIslemAlanlari(ad: string | null | undefined): OzelIslemAlan[] {
  const a = String(ad ?? '').toLocaleUpperCase('tr-TR')
  if (/RENKLEND|BOYA/.test(a)) {
    return [
      { etiket: 'Renk', secenekler: ['Kahve', 'Gri', 'Yeşil', 'Mavi', 'Pembe', 'Sarı', 'Mor'], serbest: true, ipucu: 'Renk (örn. G15)' },
      { etiket: 'Yoğunluk', secenekler: ['%10', '%25', '%50', '%75', '%85'], serbest: true, ipucu: '%' },
      { etiket: 'Tip', secenekler: ['Düz', 'Degrade', 'Çift degrade'] },
    ]
  }
  if (/ODAK/.test(a)) {
    return [
      { etiket: 'Yatay', secenekler: ['İçe', 'Dışa'] },
      { etiket: 'Yatay mm', serbest: true, ipucu: 'mm' },
      { etiket: 'Dikey', secenekler: ['Yukarı', 'Aşağı'] },
      { etiket: 'Dikey mm', serbest: true, ipucu: 'mm' },
    ]
  }
  if (/PR[İI]ZMA/.test(a)) {
    return [
      { etiket: 'Prizma', serbest: true, ipucu: 'Δ (dpt)' },
      { etiket: 'Baz', secenekler: ['Yukarı', 'Aşağı', 'İçe', 'Dışa'], serbest: true, ipucu: 'veya derece' },
    ]
  }
  if (/[İI]NCELT|ÇAP/.test(a)) {
    return [{ etiket: 'Çap mm', serbest: true, ipucu: 'mm' }]
  }
  return []
}

function temiz(v: string): string {
  return String(v ?? '').replace(/\s*\|\s*/g, ' / ').replace(/\s*→\s*/g, ' - ').trim()
}

function degerMetni(d: TarafDegerleri): string {
  const parcalar: string[] = []
  for (const [k, v] of Object.entries(d)) {
    if (k === 'Detay') continue
    let t = temiz(v).replace(/\s*·\s*/g, ', ')
    if (k === 'Yoğunluk' && /^\d+$/.test(t)) t = `%${t}`
    if (t) parcalar.push(`${k}: ${t}`)
  }
  const detay = temiz(d.Detay ?? '')
  if (detay) parcalar.push(`Detay: ${detay}`)
  return parcalar.join(' · ')
}

function degerCoz(metin: string): TarafDegerleri {
  const d: TarafDegerleri = {}
  const i = metin.indexOf('Detay: ')
  const bas = i >= 0 ? metin.slice(0, i) : metin
  if (i >= 0) d.Detay = metin.slice(i + 'Detay: '.length).trim()
  for (const parca of bas.split(' · ')) {
    const j = parca.indexOf(': ')
    if (j < 0) continue
    const k = parca.slice(0, j).trim()
    if (k && k !== 'Taraf') d[k] = parca.slice(j + 2).trim()
  }
  return d
}

export function bosTaraflar(): OzelIslemTaraflari {
  return { sag: true, sol: true, ayni: true, sagDeger: {}, solDeger: {} }
}

export function nitelikOlustur(t: OzelIslemTaraflari): string {
  if (t.sag && t.sol && !t.ayni) {
    const sag = degerMetni(t.sagDeger)
    const sol = degerMetni(t.solDeger)
    return `Sağ → ${sag || '—'} | Sol → ${sol || '—'}`
  }
  const taraf = t.sag && t.sol ? 'Sağ+Sol' : t.sag ? 'Sağ' : 'Sol'
  const deger = degerMetni(t.sol && !t.sag ? t.solDeger : t.sagDeger)
  return deger ? `Taraf: ${taraf} · ${deger}` : `Taraf: ${taraf}`
}

/** nitelikOlustur'un tersi (düzenleme ekranı için); eski "Taraf: …" kayıtlarını da okur. */
export function nitelikCoz(s: string | null | undefined): OzelIslemTaraflari {
  const metin = String(s ?? '').trim()
  const t = bosTaraflar()
  if (!metin) return t
  if (metin.startsWith('Sağ → ') && metin.includes(' | Sol → ')) {
    const [a, b] = metin.split(' | Sol → ')
    t.ayni = false
    t.sagDeger = degerCoz(a.slice('Sağ → '.length).replace(/^—$/, ''))
    t.solDeger = degerCoz(b.replace(/^—$/, ''))
    return t
  }
  const m = metin.match(/^Taraf: (Sağ\+Sol|Sağ|Sol)/)
  const taraf = m?.[1] ?? 'Sağ+Sol'
  t.sag = taraf !== 'Sol'
  t.sol = taraf !== 'Sağ'
  const d = degerCoz(metin)
  // eski kayıtlarda yoğunluk "%" olmadan da yazılmış olabilir
  if (d['Yoğunluk'] && !d['Yoğunluk'].startsWith('%')) d['Yoğunluk'] = `%${d['Yoğunluk']}`
  t.sagDeger = { ...d }
  t.solDeger = { ...d }
  return t
}

/** Ekranda satır satır göstermek için ("Sağ → … | Sol → …" iki satır olur) */
export function nitelikSatirlari(s: string | null | undefined): string[] {
  return String(s ?? '').split(' | ').map((x) => x.trim()).filter(Boolean)
}

export function ozelIslemAdi(it: Partial<SaleItem>): string {
  const ad = it.odooProductName || it.product?.name || 'Özel İşlem'
  return String(ad).includes('PLACEHOLDER') ? 'Özel İşlem' : String(ad)
}

/** Tek satırlık özet: "Renklendirme (Taraf: Sağ+Sol · Renk: Kahve) — Firmaya not: …" */
export function ozelIslemOzeti(it: Partial<SaleItem>): string {
  const ad = ozelIslemAdi(it)
  const nitelik = it.maintenanceNature?.trim()
  const not = it.maintenanceDescription?.trim()
  return `${ad}${nitelik ? ` (${nitelik})` : ''}${not ? ` — Firmaya not: ${not}` : ''}`
}

