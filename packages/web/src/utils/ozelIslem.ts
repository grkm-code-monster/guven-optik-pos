/**
 * 18.11.2026 — Cam "Özel İşlem" kalemleri (renklendirme, odak kaydırma, prizma, inceltme…)
 *
 * Bir özel işlem, cama linkedItemId ile bağlı, linkType'ı OLMAYAN normal bir satış
 * kalemidir (camlar ise çerçeveye FRAME_LENS / CUSTOMER_FRAME ile bağlanır).
 *   maintenanceNature      → "Taraf: Sağ+Sol · Renk: Kahve · Yoğunluk: %80 · Tip: Degrade · Detay: …"
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

export type OzelIslemTaraf = 'Sağ' | 'Sol' | 'Sağ+Sol'

export type OzelIslemDetay = {
  taraf: OzelIslemTaraf
  renk: string
  yogunluk: string
  tip: string
  detay: string
}

const ETIKETLER: Array<[keyof Omit<OzelIslemDetay, 'taraf'> | 'taraf', string]> = [
  ['taraf', 'Taraf'],
  ['renk', 'Renk'],
  ['yogunluk', 'Yoğunluk'],
  ['tip', 'Tip'],
  ['detay', 'Detay'],
]

export function bosOzelIslemDetay(): OzelIslemDetay {
  return { taraf: 'Sağ+Sol', renk: '', yogunluk: '', tip: '', detay: '' }
}

export function nitelikOlustur(d: OzelIslemDetay): string {
  const parcalar: string[] = []
  for (const [k, etiket] of ETIKETLER) {
    let v = String(d[k] ?? '').trim()
    if (!v) continue
    if (k === 'yogunluk') v = `%${v.replace(/^%/, '')}`
    parcalar.push(`${etiket}: ${v}`)
  }
  return parcalar.join(' · ')
}

/** nitelikOlustur'un tersi (düzenleme ekranı için). "Detay" her zaman en sonda. */
export function nitelikCoz(s: string | null | undefined): OzelIslemDetay {
  const d = bosOzelIslemDetay()
  const metin = String(s ?? '')
  const detayIdx = metin.indexOf('Detay: ')
  const bas = detayIdx >= 0 ? metin.slice(0, detayIdx) : metin
  if (detayIdx >= 0) d.detay = metin.slice(detayIdx + 'Detay: '.length).trim()
  for (const parca of bas.split(' · ')) {
    const i = parca.indexOf(': ')
    if (i < 0) continue
    const etiket = parca.slice(0, i).trim()
    const v = parca.slice(i + 2).trim()
    if (etiket === 'Taraf' && (v === 'Sağ' || v === 'Sol' || v === 'Sağ+Sol')) d.taraf = v
    else if (etiket === 'Renk') d.renk = v
    else if (etiket === 'Yoğunluk') d.yogunluk = v.replace(/^%/, '')
    else if (etiket === 'Tip') d.tip = v
  }
  return d
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

export function isRenklendirme(ad: string | null | undefined): boolean {
  return /RENKLEND|BOYA/i.test(String(ad ?? '').toLocaleUpperCase('tr-TR'))
}
