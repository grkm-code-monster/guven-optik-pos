import type { Sale, SaleItem } from '../api/types'

export const LENS_RX = 'LENS_RX'
export const OPTICAL_FRAME_READY = 'OPTICAL_FRAME_READY'
export const SUNGLASSES_READY = 'SUNGLASSES_READY'

/** Odoo optik cam kategori ID'leri */
export const ODOO_OPTIK_CAM_CATEGORY_IDS = [
  4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41, 42, 43, 44,
] as const
const OPTIK_CAM_ID_SET = new Set<number>(ODOO_OPTIK_CAM_CATEGORY_IDS)

export function isOdooOptikCamCategoryId(id: number | null | undefined): boolean {
  if (id == null) return false
  return OPTIK_CAM_ID_SET.has(id)
}

function isLensMeasurementSaleItem(item: SaleItem): boolean {
  if (item.product?.category === LENS_RX) return true
  const catId = item.odooCategoryId ?? null
  const inList = catId != null && OPTIK_CAM_ID_SET.has(catId)
  const hasOdooProductId = item.odooProductId != null && String(item.odooProductId).trim() !== ''
  const hasOdooProductName = item.odooProductName != null && String(item.odooProductName).trim() !== ''
  if (hasOdooProductId && inList) return true
  if (hasOdooProductName && inList) return true
  // Çerçeveye bağlı cam kalemleri (linkType ile)
  const linkType = item.linkType
  if (linkType === 'FRAME_LENS' || linkType === 'CUSTOMER_FRAME') return true
  return false
}

/** Lab / montaj sürecine tabi kalem (TeslimatPage, backend sale-item-lab.util ile uyumlu) */
export { isLensMeasurementSaleItem }

export type LensOrderFrameTypeApi = 'KAPALI' | 'NILOR' | 'FASET'

export type PendingSaleConfirmBody = {
  payments: Array<{
    paymentType: string
    grossAmount: string
    installment?: number
    metadata?: Record<string, unknown>
  }>
  customerPaidTotal?: string
  thirdPartyContributionTotal?: string
  pricingInvoiceNote?: string
  pricingPaymentMode?: string
}

export type LensOrderMeasurementPayload = {
  saleItemId: string
  frameItemId: string | null | undefined
  ownFrame: boolean
  ownFrameNote?: string | null
  rightEyeActive: boolean
  leftEyeActive: boolean
  frameType: LensOrderFrameTypeApi
  rph?: string
  lph?: string
  corridor?: string
  rightDia?: string
  leftDia?: string
  vertex?: string
  pantoscopic?: string
  frameBow?: string
  templateA?: string
  templateB?: string
  dbl?: string
  ed?: string
  customBaseRight?: number | null
  customBaseLeft?: number | null
  prismR1Val?: string
  prismR1Aks?: number | null
  prismR2Val?: string
  prismR2Aks?: number | null
  prismL1Val?: string
  prismL1Aks?: number | null
  prismL2Val?: string
  prismL2Aks?: number | null
  engraving?: string | null
  shiftRIn?: string
  shiftROut?: string
  shiftRUp?: string
  shiftRDown?: string
  shiftLIn?: string
  shiftLOut?: string
  shiftLUp?: string
  shiftLDown?: string
}

export type ConfirmSaleClientPayload = PendingSaleConfirmBody & {
  lensOrderMeasurements?: LensOrderMeasurementPayload[]
}

export type LensMeasurementDraft = {
  saleItemId: string
  /** Grup içindeki tüm cam kalemleri (tek kalemde yalnızca saleItemId) */
  saleItemIds: string[]
  groupLabel?: string
  frameItemId: string | null
  ownFrame: boolean
  ownFrameNote: string
  rightEyeActive: boolean
  leftEyeActive: boolean
  frameType: LensOrderFrameTypeApi | ''
  rph: string
  lph: string
  corridor: string
  rightDia: string
  leftDia: string
  vertex: string
  pantoscopic: string
  frameBow: string
  frameDimsEnabled: boolean
  templateA: string
  templateB: string
  dbl: string
  ed: string
  customBaseEnabled: boolean
  customBaseRight: string
  customBaseLeft: string
  prismEnabled: boolean
  prismR1Val: string
  prismR1Aks: string
  prismR2Val: string
  prismR2Aks: string
  prismL1Val: string
  prismL1Aks: string
  prismL2Val: string
  prismL2Aks: string
  shiftSectionEnabled: boolean
  engravingEnabled: boolean
  engraving: string
  shiftRIn: boolean
  shiftRInVal: string
  shiftROut: boolean
  shiftROutVal: string
  shiftRUp: boolean
  shiftRUpVal: string
  shiftRDown: boolean
  shiftRDownVal: string
  shiftLIn: boolean
  shiftLInVal: string
  shiftLOut: boolean
  shiftLOutVal: string
  shiftLUp: boolean
  shiftLUpVal: string
  shiftLDown: boolean
  shiftLDownVal: string
}

export function saleNeedsLensMeasurementStep(sale: Sale | null | undefined): boolean {
  const result = getLensMeasurementSaleItems(sale?.items).length > 0
  return result
}

export function getLensMeasurementSaleItems(items: SaleItem[] | undefined): SaleItem[] {
  return (items ?? []).filter(isLensMeasurementSaleItem)
}

export function getMountFrameItems(items: SaleItem[] | undefined): SaleItem[] {
  return (items ?? []).filter((i) => {
    const c = i.product?.category
    return c === OPTICAL_FRAME_READY || c === SUNGLASSES_READY
  })
}

function itemLabel(it: SaleItem): string {
  return (
    it.odooProductName ||
    (it.product?.name !== '__ODOO_PLACEHOLDER__' ? it.product?.name : null) ||
    'Odoo Ürünü'
  )
}

function frameGroupLabel(baseLabel: string, frame: SaleItem): string {
  const frameName = itemLabel(frame)
  return frameName && frameName !== 'Odoo Ürünü' ? `${baseLabel} (${frameName})` : baseLabel
}

export function lensPairingLabel(lens: SaleItem, idx: number): string {
  return `Cam ${idx + 1} (${itemLabel(lens)})`
}

export function framePairingLabel(frame: SaleItem, idx: number): string {
  return `Çerçeve ${idx + 1} (${itemLabel(frame)})`
}

const RX_GROUP_LABEL: Record<string, string> = {
  SINGLE: 'Daimi Gözlük',
  SINGLE_FAR: 'Daimi Gözlük',
  SINGLE_NEAR: 'Yakın Gözlük',
  PROGRESSIVE: 'Progresif Gözlük',
  BIFOCAL: 'Bifokal Gözlük',
  SUNGLASSES: 'Düzeltmesiz Gözlük',
}

function rxGroupBaseLabel(lens: SaleItem): string {
  const pt = lens.prescription?.prescriptionType ?? 'SINGLE'
  return RX_GROUP_LABEL[pt] ?? 'Gözlük'
}

export type MeasurementGroup = {
  groupId: string
  label: string
  saleItemIds: string[]
  lenses: SaleItem[]
}

/** Ölçüm formu için cam kalemlerini grupla (pairedItemId veya aynı linkedItemId) */
export function buildMeasurementGroups(items: SaleItem[] | undefined): MeasurementGroup[] {
  const lenses = getLensMeasurementSaleItems(items)
  const assigned = new Set<string>()
  const rawGroups: SaleItem[][] = []

  for (const lens of lenses) {
    if (assigned.has(lens.id)) continue
    if (lens.pairedItemId) {
      const partner = lenses.find((l) => l.id === lens.pairedItemId)
      if (partner && !assigned.has(partner.id)) {
        rawGroups.push([lens, partner])
        assigned.add(lens.id)
        assigned.add(partner.id)
        continue
      }
    }
  }

  const byFrame = new Map<string, SaleItem[]>()
  for (const lens of lenses) {
    if (assigned.has(lens.id)) continue
    if (lens.linkedItemId) {
      const arr = byFrame.get(lens.linkedItemId) ?? []
      arr.push(lens)
      byFrame.set(lens.linkedItemId, arr)
    }
  }
  for (const arr of byFrame.values()) {
    if (arr.length > 1) {
      rawGroups.push(arr)
      for (const l of arr) assigned.add(l.id)
    }
  }

  for (const lens of lenses) {
    if (!assigned.has(lens.id)) {
      rawGroups.push([lens])
      assigned.add(lens.id)
    }
  }

  const typeCounters = new Map<string, number>()
  return rawGroups.map((groupLenses) => {
    const base = rxGroupBaseLabel(groupLenses[0])
    const n = (typeCounters.get(base) ?? 0) + 1
    typeCounters.set(base, n)
    const ids = groupLenses.map((l) => l.id)
    return {
      groupId: ids.join('|'),
      label: `${base} ${n}`,
      saleItemIds: ids,
      lenses: groupLenses,
    }
  })
}

function emptyDraft(
  saleItemId: string,
  saleItemIds: string[],
  frameId: string | null,
  ownFrame: boolean,
  groupLabel?: string,
): LensMeasurementDraft {
  return {
    saleItemId,
    saleItemIds,
    groupLabel,
    frameItemId: frameId,
    ownFrame,
    ownFrameNote: '',
    rightEyeActive: true,
    leftEyeActive: true,
    frameType: '',
    rph: '',
    lph: '',
    corridor: '',
    rightDia: '',
    leftDia: '',
    vertex: '',
    pantoscopic: '',
    frameBow: '',
    frameDimsEnabled: false,
    templateA: '',
    templateB: '',
    dbl: '',
    ed: '',
    customBaseEnabled: false,
    customBaseRight: '',
    customBaseLeft: '',
    prismEnabled: false,
    prismR1Val: '',
    prismR1Aks: '',
    prismR2Val: '',
    prismR2Aks: '',
    prismL1Val: '',
    prismL1Aks: '',
    prismL2Val: '',
    prismL2Aks: '',
    shiftSectionEnabled: false,
    engravingEnabled: false,
    engraving: '',
    shiftRIn: false,
    shiftRInVal: '',
    shiftROut: false,
    shiftROutVal: '',
    shiftRUp: false,
    shiftRUpVal: '',
    shiftRDown: false,
    shiftRDownVal: '',
    shiftLIn: false,
    shiftLInVal: '',
    shiftLOut: false,
    shiftLOutVal: '',
    shiftLUp: false,
    shiftLUpVal: '',
    shiftLDown: false,
    shiftLDownVal: '',
  }
}

export function buildInitialMeasurementDrafts(sale: Sale): LensMeasurementDraft[] {
  const groups = buildMeasurementGroups(sale.items)
  const frames = getMountFrameItems(sale.items)

  return groups.map((group) => {
    const primary = group.lenses[0]
    const linkedFrame = primary.linkedItemId
      ? frames.find((f) => f.id === primary.linkedItemId)
      : undefined
    const isCustomerFrame = primary.linkType === 'CUSTOMER_FRAME'

    if (linkedFrame) {
      return emptyDraft(primary.id, group.saleItemIds, linkedFrame.id, false, frameGroupLabel(group.label, linkedFrame))
    }
    if (isCustomerFrame) {
      return emptyDraft(primary.id, group.saleItemIds, null, true, `${group.label} Kendi Çerçevesi`)
    }
    if (group.lenses.length === 1 && frames.length === 1) {
      return emptyDraft(primary.id, group.saleItemIds, frames[0].id, false, frameGroupLabel(group.label, frames[0]))
    }
    if (group.lenses.length === 1 && frames.length === 0) {
      return emptyDraft(primary.id, group.saleItemIds, null, true, `${group.label} Kendi Çerçevesi`)
    }
    return emptyDraft(primary.id, group.saleItemIds, null, false, group.label)
  })
}

function decStr(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  const t = abs.toFixed(2)
  if (v > 0) return `+${t}`
  if (v < 0) return `-${t}`
  return '0.00'
}

function fmtAdd(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toFixed(2)
}

export function prescriptionReadoutForItem(item: SaleItem | undefined): { farR: string; farL: string } {
  const p = item?.prescription
  if (!p) return { farR: '—', farL: '—' }
  const farR = [decStr(p.r_sph), decStr(p.r_cyl), p.r_aks != null ? String(p.r_aks) : '—', fmtAdd(p.r_add)].join(' / ')
  const farL = [decStr(p.l_sph), decStr(p.l_cyl), p.l_aks != null ? String(p.l_aks) : '—', fmtAdd(p.l_add)].join(' / ')
  return { farR, farL }
}

function rxToNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = Number(String(v).replace(',', '.').replace(/^\+/, ''))
  return Number.isFinite(n) ? n : null
}

export function prescriptionReadoutFromCustomerRx(
  rx: Record<string, unknown> | null | undefined,
): { farR: string; farL: string } {
  if (!rx) return { farR: '—', farL: '—' }
  const side = (s: 'r' | 'l') => {
    const sph = rx[`far_${s}_sph`] ?? rx[`${s}_sph`]
    const cyl = rx[`far_${s}_cyl`] ?? rx[`${s}_cyl`]
    const aks = rx[`far_${s}_aks`] ?? rx[`${s}_aks`]
    const add = rx[`far_${s}_add`] ?? rx[`${s}_add`]
    return [
      decStr(rxToNum(sph) ?? undefined),
      decStr(rxToNum(cyl) ?? undefined),
      aks != null && aks !== '' ? String(aks) : '—',
      fmtAdd(rxToNum(add) ?? undefined),
    ].join(' / ')
  }
  return { farR: side('r'), farL: side('l') }
}

function customerRxPd(rx: Record<string, unknown> | null | undefined, s: 'r' | 'l'): number | null {
  if (!rx) return null
  return rxToNum(rx[`far_${s}_pd`] ?? rx[`${s}_pd`])
}

/** SAĞ/SOL PD (pupil mesafesi) — kalem reçetesi öncelikli, yoksa müşteri reçetesine düşer. */
export function prescriptionPdReadout(
  item: SaleItem | undefined,
  customerRx: Record<string, unknown> | null | undefined,
): { pdR: string; pdL: string } {
  const p = item?.prescription
  const pdR = p?.r_pd != null ? decStr(p.r_pd).replace(/^\+/, '') : customerRxPd(customerRx, 'r') != null ? decStr(customerRxPd(customerRx, 'r')).replace(/^\+/, '') : '—'
  const pdL = p?.l_pd != null ? decStr(p.l_pd).replace(/^\+/, '') : customerRxPd(customerRx, 'l') != null ? decStr(customerRxPd(customerRx, 'l')).replace(/^\+/, '') : '—'
  return { pdR, pdL }
}

/**
 * Kalemin kendi reçete kaydı (varsa) ile müşteri profilindeki en son reçeteyi alan bazında
 * birleştirir: kalemin SPH/CYL/AKS/ADD değeri doluysa onu, boşsa müşteri reçetesindeki
 * değeri kullanır. Sadece "kalemde Prescription kaydı var ama içi boş" durumunda eskiden
 * hep '—' görünen alanları müşteri reçetesinden doldurur.
 */
export function prescriptionReadoutMerged(
  item: SaleItem | undefined,
  customerRx: Record<string, unknown> | null | undefined,
): { farR: string; farL: string } {
  const itemReadout = prescriptionReadoutForItem(item)
  const custReadout = prescriptionReadoutFromCustomerRx(customerRx)
  const pick = (fromItem: string, fromCustomer: string) => {
    const itemParts = fromItem.split(' / ')
    const custParts = fromCustomer.split(' / ')
    return itemParts.map((v, i) => (v && v !== '—' ? v : custParts[i] ?? '—')).join(' / ')
  }
  return {
    farR: pick(itemReadout.farR, custReadout.farR),
    farL: pick(itemReadout.farL, custReadout.farL),
  }
}

function parseReq(s: string): boolean {
  const t = String(s).trim().replace(',', '.')
  return t !== '' && Number.isFinite(Number(t))
}

function parseOptDec(s: string): string | undefined {
  const t = String(s).trim().replace(',', '.')
  if (!t) return undefined
  if (!Number.isFinite(Number(t))) return undefined
  return Number(t).toFixed(2)
}

function parseIntOpt(s: string): number | null | undefined {
  const t = String(s).trim()
  if (!t) return undefined
  const n = Number.parseInt(t, 10)
  if (!Number.isFinite(n)) return undefined
  return n
}

function shiftOut(active: boolean, val: string): string | undefined {
  if (!active) return undefined
  return parseOptDec(val)
}

export function isMeasurementDraftComplete(d: LensMeasurementDraft): boolean {
  // En az bir göz aktif olmalı VEYA hiç göz aktif değilse de geçsin
  // RPH veya LPH girilmişse tamamlanmış say
  if (d.rph || d.lph || d.corridor || d.rightDia || d.leftDia) {
    return true
  }
  // Hiç ölçüm girilmemişse de geçsin (opsiyonel)
  return true
}

export function allMeasurementDraftsComplete(drafts: LensMeasurementDraft[]): boolean {
  return drafts.length > 0 && drafts.every(isMeasurementDraftComplete)
}

function fmtDecField(s: string): string | undefined {
  const t = String(s).trim().replace(',', '.')
  if (!t || !Number.isFinite(Number(t))) return undefined
  return Number(t).toFixed(2)
}

function draftToPayload(
  d: LensMeasurementDraft,
  saleItemId: string,
  eyeMode: 'both' | 'right' | 'left',
): LensOrderMeasurementPayload {
  const rightOn = eyeMode === 'both' ? d.rightEyeActive : eyeMode === 'right'
  const leftOn = eyeMode === 'both' ? d.leftEyeActive : eyeMode === 'left'

  const base: LensOrderMeasurementPayload = {
    saleItemId,
    frameItemId: d.ownFrame ? null : d.frameItemId,
    ownFrame: d.ownFrame,
    ownFrameNote: d.ownFrame && d.ownFrameNote.trim() ? d.ownFrameNote.trim() : null,
    rightEyeActive: rightOn,
    leftEyeActive: leftOn,
    frameType: d.frameType as LensOrderFrameTypeApi,
    rph: rightOn ? fmtDecField(d.rph) : undefined,
    lph: leftOn ? fmtDecField(d.lph) : undefined,
    corridor: fmtDecField(d.corridor),
    rightDia: rightOn ? fmtDecField(d.rightDia) : undefined,
    leftDia: leftOn ? fmtDecField(d.leftDia) : undefined,
    vertex: fmtDecField(d.vertex),
    pantoscopic: fmtDecField(d.pantoscopic),
    frameBow: fmtDecField(d.frameBow),
    templateA: d.frameDimsEnabled ? parseOptDec(d.templateA) : undefined,
    templateB: d.frameDimsEnabled ? parseOptDec(d.templateB) : undefined,
    dbl: d.frameDimsEnabled ? parseOptDec(d.dbl) : undefined,
    ed: d.frameDimsEnabled ? parseOptDec(d.ed) : undefined,
    customBaseRight: d.customBaseEnabled && rightOn ? parseIntOpt(d.customBaseRight) ?? null : null,
    customBaseLeft: d.customBaseEnabled && leftOn ? parseIntOpt(d.customBaseLeft) ?? null : null,
    engraving: d.engravingEnabled && d.engraving.trim() ? d.engraving.trim().slice(0, 3) : null,
    shiftRIn: d.shiftSectionEnabled && rightOn ? shiftOut(d.shiftRIn, d.shiftRInVal) : undefined,
    shiftROut: d.shiftSectionEnabled && rightOn ? shiftOut(d.shiftROut, d.shiftROutVal) : undefined,
    shiftRUp: d.shiftSectionEnabled && rightOn ? shiftOut(d.shiftRUp, d.shiftRUpVal) : undefined,
    shiftRDown: d.shiftSectionEnabled && rightOn ? shiftOut(d.shiftRDown, d.shiftRDownVal) : undefined,
    shiftLIn: d.shiftSectionEnabled && leftOn ? shiftOut(d.shiftLIn, d.shiftLInVal) : undefined,
    shiftLOut: d.shiftSectionEnabled && leftOn ? shiftOut(d.shiftLOut, d.shiftLOutVal) : undefined,
    shiftLUp: d.shiftSectionEnabled && leftOn ? shiftOut(d.shiftLUp, d.shiftLUpVal) : undefined,
    shiftLDown: d.shiftSectionEnabled && leftOn ? shiftOut(d.shiftLDown, d.shiftLDownVal) : undefined,
  }
  if (d.prismEnabled) {
    return {
      ...base,
      prismR1Val: rightOn ? parseOptDec(d.prismR1Val) : undefined,
      prismR1Aks: rightOn ? parseIntOpt(d.prismR1Aks) ?? null : null,
      prismR2Val: rightOn ? parseOptDec(d.prismR2Val) : undefined,
      prismR2Aks: rightOn ? parseIntOpt(d.prismR2Aks) ?? null : null,
      prismL1Val: leftOn ? parseOptDec(d.prismL1Val) : undefined,
      prismL1Aks: leftOn ? parseIntOpt(d.prismL1Aks) ?? null : null,
      prismL2Val: leftOn ? parseOptDec(d.prismL2Val) : undefined,
      prismL2Aks: leftOn ? parseIntOpt(d.prismL2Aks) ?? null : null,
    }
  }
  return base
}

export function draftsToLensOrderMeasurements(drafts: LensMeasurementDraft[]): LensOrderMeasurementPayload[] {
  const out: LensOrderMeasurementPayload[] = []
  for (const d of drafts) {
    const ids = d.saleItemIds?.length ? d.saleItemIds : [d.saleItemId]
    if (ids.length === 1) {
      out.push(draftToPayload(d, ids[0], 'both'))
    } else if (ids.length === 2) {
      out.push(draftToPayload(d, ids[0], 'right'))
      out.push(draftToPayload(d, ids[1], 'left'))
    } else {
      for (const id of ids) {
        out.push(draftToPayload(d, id, 'both'))
      }
    }
  }
  return out
}

export type MergedPrescriptionNumbers = {
  r_sph: number | null
  r_cyl: number | null
  r_aks: number | null
  r_add: number | null
  l_sph: number | null
  l_cyl: number | null
  l_aks: number | null
  l_add: number | null
}

/** Kart Bas / diğer sayısal reçete kullanımları için: kalemin kendi reçetesi
 *  (varsa, alan bazında) öncelikli, boş kalan alanlar müşteri profilindeki en
 *  son reçeteden tamamlanır. */
export function mergedPrescriptionNumbers(
  item: SaleItem | undefined,
  customerRx: Record<string, unknown> | null | undefined,
): MergedPrescriptionNumbers {
  const p = item?.prescription
  const custSide = (s: 'r' | 'l') => ({
    sph: rxToNum(customerRx?.[`far_${s}_sph`] ?? customerRx?.[`${s}_sph`]),
    cyl: rxToNum(customerRx?.[`far_${s}_cyl`] ?? customerRx?.[`${s}_cyl`]),
    aks: rxToNum(customerRx?.[`far_${s}_aks`] ?? customerRx?.[`${s}_aks`]),
    add: rxToNum(customerRx?.[`far_${s}_add`] ?? customerRx?.[`${s}_add`]),
  })
  const cr = custSide('r')
  const cl = custSide('l')
  return {
    r_sph: p?.r_sph ?? cr.sph,
    r_cyl: p?.r_cyl ?? cr.cyl,
    r_aks: p?.r_aks ?? cr.aks,
    r_add: p?.r_add ?? cr.add,
    l_sph: p?.l_sph ?? cl.sph,
    l_cyl: p?.l_cyl ?? cl.cyl,
    l_aks: p?.l_aks ?? cl.aks,
    l_add: p?.l_add ?? cl.add,
  }
}

/** Bu kalem/müşteri için (birleştirilmiş) hiç reçete verisi var mı? */
export function hasAnyPrescriptionData(numbers: MergedPrescriptionNumbers): boolean {
  return Object.values(numbers).some((v) => v != null)
}

export function updateDraft(
  drafts: LensMeasurementDraft[],
  saleItemId: string,
  patch: Partial<LensMeasurementDraft>,
): LensMeasurementDraft[] {
  return drafts.map((d) => (d.saleItemId === saleItemId ? { ...d, ...patch } : d))
}

export function updateDraftAt(
  drafts: LensMeasurementDraft[],
  index: number,
  patch: Partial<LensMeasurementDraft>,
): LensMeasurementDraft[] {
  return drafts.map((d, i) => (i === index ? { ...d, ...patch } : d))
}
