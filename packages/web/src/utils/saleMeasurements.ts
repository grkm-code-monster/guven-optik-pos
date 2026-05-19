import type { Sale, SaleItem } from '../api/types'

export const LENS_RX = 'LENS_RX'
export const OPTICAL_FRAME_READY = 'OPTICAL_FRAME_READY'
export const SUNGLASSES_READY = 'SUNGLASSES_READY'

/** Odoo optik cam kategori ID'leri */
export const ODOO_OPTIK_CAM_CATEGORY_IDS = [
  4, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 37, 38, 39, 40, 41,
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
  return false
}

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
  console.log(
    '[lens check] items:',
    sale?.items?.map((i) => ({
      name: i.odooProductName,
      catId: i.odooCategoryId,
      prodId: i.odooProductId,
    })),
  )
  console.log('[lens check] needs step:', result)
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

export function lensPairingLabel(lens: SaleItem, idx: number): string {
  return `Cam ${idx + 1} (${itemLabel(lens)})`
}

export function framePairingLabel(frame: SaleItem, idx: number): string {
  return `Çerçeve ${idx + 1} (${itemLabel(frame)})`
}

function emptyDraft(saleItemId: string, frameId: string | null, ownFrame: boolean): LensMeasurementDraft {
  return {
    saleItemId,
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
  const lenses = getLensMeasurementSaleItems(sale.items)
  const frames = getMountFrameItems(sale.items)
  const multi = lenses.length > 1 || frames.length > 1

  return lenses.map((lens) => {
    if (!multi) {
      if (lenses.length === 1 && frames.length === 1) {
        return emptyDraft(lens.id, frames[0].id, false)
      }
      if (lenses.length === 1 && frames.length === 0) {
        return emptyDraft(lens.id, null, true)
      }
    }
    return emptyDraft(lens.id, null, false)
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

export function prescriptionReadoutFromCustomerRx(
  rx: Record<string, unknown> | null | undefined,
): { farR: string; farL: string } {
  if (!rx) return { farR: '—', farL: '—' }
  const toNum = (v: unknown): number | null => {
    if (v == null || v === '') return null
    if (typeof v === 'number' && Number.isFinite(v)) return v
    const n = Number(String(v).replace(',', '.').replace(/^\+/, ''))
    return Number.isFinite(n) ? n : null
  }
  const side = (s: 'r' | 'l') => {
    const sph = rx[`far_${s}_sph`] ?? rx[`${s}_sph`]
    const cyl = rx[`far_${s}_cyl`] ?? rx[`${s}_cyl`]
    const aks = rx[`far_${s}_aks`] ?? rx[`${s}_aks`]
    const add = rx[`far_${s}_add`] ?? rx[`${s}_add`]
    return [
      decStr(toNum(sph) ?? undefined),
      decStr(toNum(cyl) ?? undefined),
      aks != null && aks !== '' ? String(aks) : '—',
      fmtAdd(toNum(add) ?? undefined),
    ].join(' / ')
  }
  return { farR: side('r'), farL: side('l') }
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
  if (!d.ownFrame && !d.frameItemId) return false
  if (d.frameType === '') return false
  if (!d.rightEyeActive && !d.leftEyeActive) return false

  if (!parseReq(d.corridor) || !parseReq(d.vertex) || !parseReq(d.pantoscopic) || !parseReq(d.frameBow)) return false

  if (d.rightEyeActive) {
    if (!parseReq(d.rph) || !parseReq(d.rightDia)) return false
  }
  if (d.leftEyeActive) {
    if (!parseReq(d.lph) || !parseReq(d.leftDia)) return false
  }

  if (d.frameDimsEnabled) {
    if (!parseReq(d.templateA) || !parseReq(d.templateB) || !parseReq(d.dbl) || !parseReq(d.ed)) return false
  }

  if (d.customBaseEnabled) {
    if (!d.customBaseRight || !d.customBaseLeft) return false
  }
  if (d.prismEnabled) {
    const pairs = [
      [d.prismR1Val, d.prismR1Aks],
      [d.prismR2Val, d.prismR2Aks],
      [d.prismL1Val, d.prismL1Aks],
      [d.prismL2Val, d.prismL2Aks],
    ]
    for (const [pv, av] of pairs) {
      const hasP = parseReq(pv)
      const hasA = String(av).trim() !== '' && Number.isFinite(Number.parseInt(String(av), 10))
      if (hasP !== hasA) return false
    }
  }

  if (d.shiftSectionEnabled) {
    const shifts: Array<[boolean, string]> = [
      [d.shiftRIn, d.shiftRInVal],
      [d.shiftROut, d.shiftROutVal],
      [d.shiftRUp, d.shiftRUpVal],
      [d.shiftRDown, d.shiftRDownVal],
      [d.shiftLIn, d.shiftLInVal],
      [d.shiftLOut, d.shiftLOutVal],
      [d.shiftLUp, d.shiftLUpVal],
      [d.shiftLDown, d.shiftLDownVal],
    ]
    for (const [on, v] of shifts) {
      if (on && !parseReq(v)) return false
    }
  }

  if (d.engravingEnabled) {
    if (d.engraving.trim().length > 3) return false
    if (d.engraving && !/^[a-zA-Z0-9]*$/.test(d.engraving)) return false
  }

  return true
}

export function allMeasurementDraftsComplete(drafts: LensMeasurementDraft[]): boolean {
  return drafts.length > 0 && drafts.every(isMeasurementDraftComplete)
}

export function draftsToLensOrderMeasurements(drafts: LensMeasurementDraft[]): LensOrderMeasurementPayload[] {
  return drafts.map((d) => {
    const base: LensOrderMeasurementPayload = {
      saleItemId: d.saleItemId,
      frameItemId: d.ownFrame ? null : d.frameItemId,
      ownFrame: d.ownFrame,
      ownFrameNote: d.ownFrame && d.ownFrameNote.trim() ? d.ownFrameNote.trim() : null,
      rightEyeActive: d.rightEyeActive,
      leftEyeActive: d.leftEyeActive,
      frameType: d.frameType as LensOrderFrameTypeApi,
      rph: d.rightEyeActive ? Number(String(d.rph).replace(',', '.')).toFixed(2) : undefined,
      lph: d.leftEyeActive ? Number(String(d.lph).replace(',', '.')).toFixed(2) : undefined,
      corridor: Number(String(d.corridor).replace(',', '.')).toFixed(2),
      rightDia: d.rightEyeActive ? Number(String(d.rightDia).replace(',', '.')).toFixed(2) : undefined,
      leftDia: d.leftEyeActive ? Number(String(d.leftDia).replace(',', '.')).toFixed(2) : undefined,
      vertex: Number(String(d.vertex).replace(',', '.')).toFixed(2),
      pantoscopic: Number(String(d.pantoscopic).replace(',', '.')).toFixed(2),
      frameBow: Number(String(d.frameBow).replace(',', '.')).toFixed(2),
      templateA: d.frameDimsEnabled ? parseOptDec(d.templateA) : undefined,
      templateB: d.frameDimsEnabled ? parseOptDec(d.templateB) : undefined,
      dbl: d.frameDimsEnabled ? parseOptDec(d.dbl) : undefined,
      ed: d.frameDimsEnabled ? parseOptDec(d.ed) : undefined,
      customBaseRight: d.customBaseEnabled ? parseIntOpt(d.customBaseRight) ?? null : null,
      customBaseLeft: d.customBaseEnabled ? parseIntOpt(d.customBaseLeft) ?? null : null,
      engraving: d.engravingEnabled && d.engraving.trim() ? d.engraving.trim().slice(0, 3) : null,
      shiftRIn: d.shiftSectionEnabled ? shiftOut(d.shiftRIn, d.shiftRInVal) : undefined,
      shiftROut: d.shiftSectionEnabled ? shiftOut(d.shiftROut, d.shiftROutVal) : undefined,
      shiftRUp: d.shiftSectionEnabled ? shiftOut(d.shiftRUp, d.shiftRUpVal) : undefined,
      shiftRDown: d.shiftSectionEnabled ? shiftOut(d.shiftRDown, d.shiftRDownVal) : undefined,
      shiftLIn: d.shiftSectionEnabled ? shiftOut(d.shiftLIn, d.shiftLInVal) : undefined,
      shiftLOut: d.shiftSectionEnabled ? shiftOut(d.shiftLOut, d.shiftLOutVal) : undefined,
      shiftLUp: d.shiftSectionEnabled ? shiftOut(d.shiftLUp, d.shiftLUpVal) : undefined,
      shiftLDown: d.shiftSectionEnabled ? shiftOut(d.shiftLDown, d.shiftLDownVal) : undefined,
    }
    if (d.prismEnabled) {
      return {
        ...base,
        prismR1Val: parseOptDec(d.prismR1Val),
        prismR1Aks: parseIntOpt(d.prismR1Aks) ?? null,
        prismR2Val: parseOptDec(d.prismR2Val),
        prismR2Aks: parseIntOpt(d.prismR2Aks) ?? null,
        prismL1Val: parseOptDec(d.prismL1Val),
        prismL1Aks: parseIntOpt(d.prismL1Aks) ?? null,
        prismL2Val: parseOptDec(d.prismL2Val),
        prismL2Aks: parseIntOpt(d.prismL2Aks) ?? null,
      }
    }
    return base
  })
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
