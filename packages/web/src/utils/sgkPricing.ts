import {
  type AppliedCampaignCard,
  evaluateCampaignStack,
} from './campaignPricing'

/** SGK cam katkı tablosu (tek / çok odaklı), SPH için [min, max) */
export const SGK_TABLO = [
  { min: 0, max: 2, tek: 40, cok: 162 },
  { min: 2, max: 4, tek: 50, cok: 190 },
  { min: 4, max: 6, tek: 83, cok: 195 },
  { min: 6, max: 8, tek: 93, cok: 200 },
  { min: 8, max: 10, tek: 140, cok: 205 },
  { min: 10, max: 13, tek: 168, cok: 210 },
  { min: 13, max: 16, tek: 170, cok: 215 },
  { min: 16, max: 21, tek: 172, cok: 220 },
  { min: 21, max: 999, tek: 174, cok: 225 },
] as const

export const VAKIF_OPTIONS = ['TZH Vakfı', 'TBMM Vakfı'] as const

export type PaymentPricingMode = 'NORMAL' | 'SGK' | 'VAKIF' | 'OZEL_SIGORTA'

export type SgkModalFormState = {
  farR: boolean
  farL: boolean
  farBoth: boolean
  cokOdakli: boolean
  nearR: boolean
  nearL: boolean
  nearBoth: boolean
  frameDaimi: boolean
  frameYakin: boolean
  frameOrigin: 'YERLI' | 'ITHAL' | null
}

export type SgkComputedLine = {
  key: string
  label: string
  sphSummary: string
  amountTRY: number
}

export type SgkModalSnapshot = {
  lines: SgkComputedLine[]
  frameContributionTRY: number
  sgkContributionTotalTRY: number
  pricingInvoiceNote: string
}

export type PricingOverview = {
  mode: PaymentPricingMode
  modeLabel: string
  catalogSaleNetTRY: number
  sgkContributionTotalTRY: number
  sgkComputedLines: SgkComputedLine[]
  frameContributionTRY: number
  thirdPartyCoverageTRY: number
  campaignSummaryLines: string[]
  campaignDiscountTotalTRY: number
  customerPaysTRY: number
  pricingInvoiceNote: string | null
  giftVoucherCode?: string | null
  giftVoucherAmountTRY?: number
}

export function isMultiFocalPrescription(prescriptionType: string | undefined | null): boolean {
  const t = (prescriptionType ?? '').toUpperCase()
  return t === 'PROGRESSIVE' || t === 'BIFOCAL'
}

export function inferFrameOriginFromBarcode(barcode: string | null | undefined): 'YERLI' | 'ITHAL' | null {
  const b = (barcode ?? '').trim()
  if (!b) return null
  if (/^868|^869/i.test(b)) return 'YERLI'
  return 'ITHAL'
}

export function frameContributionTry(origin: 'YERLI' | 'ITHAL'): number {
  return origin === 'YERLI' ? 500 : 350
}

export function lookupSgkPerEyeAmount(absSph: number, multiFocal: boolean): number {
  const last = SGK_TABLO[SGK_TABLO.length - 1]
  for (const row of SGK_TABLO) {
    if (row === last) {
      if (absSph >= row.min) return multiFocal ? row.cok : row.tek
      continue
    }
    if (absSph >= row.min && absSph < row.max) {
      return multiFocal ? row.cok : row.tek
    }
  }
  return multiFocal ? last.cok : last.tek
}

export function parseSphDiopter(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.abs(raw)
  const s = String(raw).trim().replace(',', '.')
  if (!s) return null
  const n = Number(s.replace(/^\+/, ''))
  if (!Number.isFinite(n)) return null
  return Math.abs(n)
}

export function parseSphDisplay(raw: unknown): { text: string; abs: number } {
  const abs = parseSphDiopter(raw)
  if (abs == null) return { text: '—', abs: 0 }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.').replace(/^\+/, ''))
  const text = Number.isFinite(n) ? (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2)) : String(abs)
  return { text, abs }
}

export function maxAbsSphFromPrescription(p: { r_sph?: unknown; l_sph?: unknown }): number {
  const r = parseSphDiopter(p.r_sph)
  const l = parseSphDiopter(p.l_sph)
  if (r == null && l == null) return 0
  return Math.max(r ?? 0, l ?? 0)
}

type RxLike = Record<string, unknown>

function rxFarSph(rx: RxLike, side: 'r' | 'l'): unknown {
  return rx[`far_${side}_sph`] ?? (side === 'r' ? rx.r_sph : rx.l_sph)
}

function rxNearSph(rx: RxLike, side: 'r' | 'l'): unknown {
  return rx[`near_${side}_sph`] ?? rx[`near_${side}_sph`]
}

function addGlassLine(
  lines: SgkComputedLine[],
  key: string,
  label: string,
  sphRaw: unknown,
  multi: boolean,
): void {
  const { text, abs } = parseSphDisplay(sphRaw)
  if (!sphRaw && abs === 0) return
  const perEye = lookupSgkPerEyeAmount(abs, multi)
  lines.push({
    key,
    label,
    sphSummary: text,
    amountTRY: perEye,
  })
}

export function computeSgkFromModalSelections(
  rx: RxLike,
  form: SgkModalFormState,
): { ok: true; snapshot: SgkModalSnapshot } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const multi = form.cokOdakli
  const lines: SgkComputedLine[] = []

  const anyCam =
    form.farR || form.farL || form.farBoth || form.nearR || form.nearL || form.nearBoth || form.cokOdakli
  const anyFrame = form.frameDaimi || form.frameYakin

  if (!anyCam && !anyFrame) {
    errors.push('En az bir cam veya çerçeve kapsamı seçin.')
  }

  if (form.farR) {
    const sph = rxFarSph(rx, 'r')
    if (parseSphDiopter(sph) == null) errors.push('Daimi sağ cam için SPH bulunamadı.')
    else addGlassLine(lines, 'farR', 'Daimi Sağ Cam', sph, multi)
  }
  if (form.farL) {
    const sph = rxFarSph(rx, 'l')
    if (parseSphDiopter(sph) == null) errors.push('Daimi sol cam için SPH bulunamadı.')
    else addGlassLine(lines, 'farL', 'Daimi Sol Cam', sph, multi)
  }
  if (form.farBoth) {
    const sr = rxFarSph(rx, 'r')
    const sl = rxFarSph(rx, 'l')
    if (parseSphDiopter(sr) == null || parseSphDiopter(sl) == null) {
      errors.push('Daimi her iki göz için SPH bulunamadı.')
    } else {
      addGlassLine(lines, 'farBothR', 'Daimi Sağ (çift)', sr, multi)
      addGlassLine(lines, 'farBothL', 'Daimi Sol (çift)', sl, multi)
    }
  }

  if (form.nearR) {
    const sph = rxNearSph(rx, 'r')
    if (parseSphDiopter(sph) == null) errors.push('Yakın sağ cam için SPH bulunamadı.')
    else addGlassLine(lines, 'nearR', 'Yakın Sağ Cam', sph, multi)
  }
  if (form.nearL) {
    const sph = rxNearSph(rx, 'l')
    if (parseSphDiopter(sph) == null) errors.push('Yakın sol cam için SPH bulunamadı.')
    else addGlassLine(lines, 'nearL', 'Yakın Sol Cam', sph, multi)
  }
  if (form.nearBoth) {
    const sr = rxNearSph(rx, 'r')
    const sl = rxNearSph(rx, 'l')
    if (parseSphDiopter(sr) == null || parseSphDiopter(sl) == null) {
      errors.push('Yakın her iki göz için SPH bulunamadı.')
    } else {
      addGlassLine(lines, 'nearBothR', 'Yakın Sağ (çift)', sr, multi)
      addGlassLine(lines, 'nearBothL', 'Yakın Sol (çift)', sl, multi)
    }
  }

  let frameTRY = 0
  if (anyFrame) {
    if (!form.frameOrigin) {
      errors.push('Çerçeve için Yerli veya İthal seçin.')
    } else {
      frameTRY = frameContributionTry(form.frameOrigin)
    }
  }

  if (errors.length) return { ok: false, errors }

  const glassTotal = lines.reduce((s, l) => s + l.amountTRY, 0)
  const sgkTotal = glassTotal + frameTRY
  const camParts = lines.map((l) => `${l.label} ${l.amountTRY}₺`).join(' + ')
  const cercevePart = frameTRY > 0 ? `Çerçeve ${frameTRY}₺` : ''
  const mid = cercevePart ? `${camParts} + ${cercevePart}` : camParts
  const note = mid ? `SGK Hakkı: ${mid} = ${sgkTotal}₺` : ''

  return {
    ok: true,
    snapshot: {
      lines,
      frameContributionTRY: frameTRY,
      sgkContributionTotalTRY: sgkTotal,
      pricingInvoiceNote: note,
    },
  }
}

export function getFirstLensPrescription(items: any[]): RxLike | null {
  for (const item of items ?? []) {
    const p = item?.prescription
    if (!p) continue
    return {
      far_r_sph: p.far_r_sph ?? p.r_sph,
      far_l_sph: p.far_l_sph ?? p.l_sph,
      near_r_sph: p.near_r_sph,
      near_l_sph: p.near_l_sph,
      r_sph: p.r_sph,
      l_sph: p.l_sph,
    }
  }
  return null
}

function parseMoneyStr(raw: string): number {
  const n = Number(String(raw).trim().replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const MODE_LABELS: Record<PaymentPricingMode, string> = {
  NORMAL: 'Normal',
  SGK: 'SGK',
  VAKIF: 'Vakıf Ödemesi',
  OZEL_SIGORTA: 'Özel Sigorta',
}

export function buildPricingOverview(
  saleNetTotal: number,
  items: any[],
  mode: PaymentPricingMode,
  opts: {
    foundationName?: string
    foundationAmountStr?: string
    insuranceCompanyNote?: string
    sgkModalSnapshot?: SgkModalSnapshot | null
    campaigns?: AppliedCampaignCard[]
    nakitKampanyaAktif?: boolean
    giftVoucher?: { code: string; amountTRY: number } | null
  },
): PricingOverview {
  const catalogSaleNetTRY = roundMoney(Math.max(0, saleNetTotal))

  let sgkContributionTotalTRY = 0
  let sgkComputedLines: SgkComputedLine[] = []
  let frameContributionTRY = 0
  let thirdPartyCoverageTRY = 0
  let pricingInvoiceNote: string | null = null

  if (mode === 'SGK' && opts.sgkModalSnapshot) {
    sgkComputedLines = opts.sgkModalSnapshot.lines
    frameContributionTRY = opts.sgkModalSnapshot.frameContributionTRY
    sgkContributionTotalTRY = opts.sgkModalSnapshot.sgkContributionTotalTRY
    thirdPartyCoverageTRY = sgkContributionTotalTRY
    pricingInvoiceNote = opts.sgkModalSnapshot.pricingInvoiceNote
  } else if (mode === 'VAKIF') {
    thirdPartyCoverageTRY = roundMoney(parseMoneyStr(opts.foundationAmountStr ?? ''))
    const vakif = opts.foundationName ?? VAKIF_OPTIONS[0]
    if (thirdPartyCoverageTRY > 0) {
      pricingInvoiceNote = `Vakıf Ödemesi (${vakif}): ${thirdPartyCoverageTRY}₺`
    }
  } else if (mode === 'OZEL_SIGORTA' && opts.insuranceCompanyNote?.trim()) {
    pricingInvoiceNote = `Özel sigorta: ${opts.insuranceCompanyNote.trim()}`
  }

  const afterThirdParty = Math.max(0, roundMoney(catalogSaleNetTRY - thirdPartyCoverageTRY))

  const campaignEval = evaluateCampaignStack({
    catalogNetTRY: afterThirdParty,
    items: items ?? [],
    campaigns: opts.campaigns ?? [],
    nakitKampanyaAktif: opts.nakitKampanyaAktif ?? false,
  })

  const campaignSummaryLines = campaignEval.lines.map((l) => l.summaryText)
  const campaignDiscountTotalTRY = roundMoney(campaignEval.totalDiscountTRY)

  let customerPaysTRY = Math.max(0, roundMoney(afterThirdParty - campaignDiscountTotalTRY))

  const rawGift = opts.giftVoucher ? roundMoney(opts.giftVoucher.amountTRY) : 0
  const giftAmt = Math.min(rawGift, customerPaysTRY)
  customerPaysTRY = Math.max(0, roundMoney(customerPaysTRY - giftAmt))

  return {
    mode,
    modeLabel: MODE_LABELS[mode],
    catalogSaleNetTRY,
    sgkContributionTotalTRY,
    sgkComputedLines,
    frameContributionTRY,
    thirdPartyCoverageTRY,
    campaignSummaryLines,
    campaignDiscountTotalTRY,
    customerPaysTRY,
    pricingInvoiceNote,
    giftVoucherCode: opts.giftVoucher && giftAmt > 0 ? opts.giftVoucher.code : null,
    giftVoucherAmountTRY: giftAmt > 0 ? giftAmt : undefined,
  }
}
