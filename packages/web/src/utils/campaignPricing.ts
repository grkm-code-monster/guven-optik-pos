import type { CampaignRecord, CampaignType, ComboConfig } from '../api/campaigns.api'

export const CAMPAIGN_TYPE_OPTIONS = [
  { id: 'KASA', label: 'Kasa İndirimi', desc: 'Sabit tutar' },
  { id: 'NAKIT_ORAN', label: 'Nakit Kampanyası', desc: 'Yüzde (nakit seçiliyken)' },
  { id: 'IKI_AL_BIR_ODE', label: 'İki Al Bir Öde', desc: 'En ucuz kaleme kadar bedava' },
  { id: 'URUN_BAZLI', label: 'Ürün Bazlı', desc: 'Kalem bazında oran / tutar' },
  { id: 'COMBO', label: 'Combo', desc: 'Al / öde adet kuralı' },
  { id: 'FORMUL', label: 'Formül', desc: 'Çarpan + ekstra + marj sınırı' },
] as const

export type CampaignTypeId = (typeof CAMPAIGN_TYPE_OPTIONS)[number]['id']

export type CampaignLineDiscountMode = 'PCT' | 'FIXED'

export type CampaignUrunLinesState = Record<
  string,
  { sel: boolean; mode: CampaignLineDiscountMode; valueStr: string }
>

/** Listeye eklenen kampanya kartı (POS manuel) */
export type AppliedCampaignCard = {
  id: string
  kind: CampaignTypeId
  kasaAmountStr?: string
  nakitPercentStr?: string
  urun?: CampaignUrunLinesState
  /** DB kaydından geldiğinde */
  dbRecord?: CampaignRecord
}

export type CampaignEvaluationLine = {
  id: string
  summaryText: string
  discountTRY: number
}

function parsePositiveNum(raw: string): number {
  const n = Number(String(raw).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

function parsePct(raw: string | number | null | undefined): number {
  const n = Number(String(raw ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 100)
}

function moneyTryFromItemLine(raw: unknown): number {
  if (raw == null) return 0
  const n = Number(String(raw).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function formatNeg(n: number): string {
  const s = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(roundMoney(n)))
  return `-${s} ₺`
}

function isCampaignDateActive(rec: CampaignRecord, now = new Date()): boolean {
  if (rec.startDate && new Date(rec.startDate) > now) return false
  if (rec.endDate && new Date(rec.endDate) < now) return false
  return true
}

/** DB kampanyasını manuel kart formatına çevirir (POS’ta seçim için) */
export function dbCampaignToAppliedCard(rec: CampaignRecord): AppliedCampaignCard {
  const base: AppliedCampaignCard = { id: rec.id, kind: rec.type as CampaignTypeId, dbRecord: rec }
  if (rec.type === 'KASA' && rec.discountTL != null) {
    base.kasaAmountStr = String(rec.discountTL)
  }
  if (rec.type === 'NAKIT_ORAN' && rec.discountPct != null) {
    base.nakitPercentStr = String(rec.discountPct)
  }
  return base
}

export const dbCampaignToCard = dbCampaignToAppliedCard

function effectivePctTl(rec: CampaignRecord): { pct: number; tl: number } {
  return {
    pct: rec.discountPct != null ? parsePct(rec.discountPct) : 0,
    tl: rec.discountTL != null ? parsePositiveNum(String(rec.discountTL)) : 0,
  }
}

function evaluateDbCampaign(
  rec: CampaignRecord,
  running: number,
  originals: { id: string; lineTotal?: string; product?: { name?: string } | null }[],
  nakitKampanyaAktif: boolean,
): { discount: number; summary: string } | null {
  if (!rec.isActive || !isCampaignDateActive(rec)) return null
  if (running <= 0) return null

  const minBasket = rec.minBasket != null ? parsePositiveNum(String(rec.minBasket)) : 0
  if (minBasket > 0 && running < minBasket) return null

  const minQty = rec.minQty ?? 0
  if (minQty > 0 && originals.length < minQty) return null

  const { pct, tl } = effectivePctTl(rec)

  switch (rec.type as CampaignType) {
    case 'KASA': {
      const fixed = tl > 0 ? tl : parsePositiveNum(String(rec.discountTL ?? ''))
      const d = Math.min(fixed, running)
      return { discount: d, summary: `Kasa İndirimi (${rec.name}): ${formatNeg(d)}` }
    }
    case 'NAKIT_ORAN': {
      if (!nakitKampanyaAktif) return null
      const p = pct > 0 ? pct : parsePct(rec.discountPct)
      const d = Math.min(running * (p / 100), running)
      return {
        discount: d,
        summary: p > 0 ? `Nakit (${rec.name} %${p}): ${formatNeg(d)}` : `Nakit (${rec.name}): ${formatNeg(d)}`,
      }
    }
    case 'IKI_AL_BIR_ODE': {
      let minLt = Infinity
      for (const it of originals) {
        const v = moneyTryFromItemLine(it.lineTotal)
        if (v > 0 && v < minLt) minLt = v
      }
      if (!Number.isFinite(minLt) || originals.length < 2) minLt = 0
      const d = Math.min(minLt, running)
      return { discount: d, summary: `İki Al Bir Öde (${rec.name}): ${formatNeg(d)}` }
    }
    case 'URUN_BAZLI': {
      if (pct <= 0 && tl <= 0) return null
      const d = Math.min(pct > 0 ? running * (pct / 100) : tl, running)
      return { discount: d, summary: `Ürün Bazlı (${rec.name}): ${formatNeg(d)}` }
    }
    case 'COMBO': {
      const cfg = (rec.comboConfig ?? {}) as ComboConfig
      const buy = cfg.buyQty ?? 2
      const pay = cfg.payQty ?? 1
      const freeUnits = Math.max(0, buy - pay)
      if (freeUnits <= 0 || originals.length < buy) return null
      const sorted = originals
        .map((it) => moneyTryFromItemLine(it.lineTotal))
        .filter((v) => v > 0)
        .sort((a, b) => a - b)
      const sets = Math.floor(sorted.length / buy)
      let d = 0
      for (let s = 0; s < sets; s++) {
        for (let u = 0; u < freeUnits; u++) {
          d += sorted[s * buy + u] ?? 0
        }
      }
      d = Math.min(d, running)
      return { discount: d, summary: `Combo ${buy} al ${pay} öde (${rec.name}): ${formatNeg(d)}` }
    }
    case 'FORMUL': {
      const mult = rec.formulMultiplier != null ? Number(rec.formulMultiplier) : 0
      const extra = rec.formulExtra != null ? parsePositiveNum(String(rec.formulExtra)) : 0
      const margin = rec.formulMargin != null ? parsePct(rec.formulMargin) : 100
      let d = running * mult + extra
      const maxByMargin = running * (margin / 100)
      d = Math.min(d, maxByMargin > 0 ? maxByMargin : running, running)
      d = Math.max(0, d)
      return { discount: d, summary: `Formül (${rec.name}): ${formatNeg(d)}` }
    }
    default:
      return null
  }
}

/** Sıralı kampanya hesabı */
export function evaluateCampaignStack(params: {
  catalogNetTRY: number
  items: { id: string; lineTotal?: string; product?: { name?: string } | null }[]
  campaigns: AppliedCampaignCard[]
  nakitKampanyaAktif: boolean
}): { lines: CampaignEvaluationLine[]; totalDiscountTRY: number } {
  const catalog = Number.isFinite(params.catalogNetTRY) ? Math.max(0, params.catalogNetTRY) : 0
  let running = catalog
  const out: CampaignEvaluationLine[] = []

  const originals = params.items ?? []
  const lineTotalsMap = (): Map<string, number> => {
    const m = new Map<string, number>()
    for (const it of originals) {
      m.set(it.id, moneyTryFromItemLine(it.lineTotal))
    }
    return m
  }

  for (const c of params.campaigns) {
    if (running <= 0) break

    if (c.dbRecord) {
      const ev = evaluateDbCampaign(c.dbRecord, running, originals, params.nakitKampanyaAktif)
      if (ev && ev.discount > 0) {
        out.push({ id: c.id, summaryText: ev.summary, discountTRY: ev.discount })
        running -= ev.discount
      }
      continue
    }

    switch (c.kind) {
      case 'KASA': {
        const fixed = parsePositiveNum(c.kasaAmountStr ?? '')
        const d = Math.min(fixed, running)
        out.push({
          id: c.id,
          summaryText: `Kasa İndirimi: ${formatNeg(d)}`,
          discountTRY: d,
        })
        running -= d
        break
      }
      case 'NAKIT_ORAN': {
        if (!params.nakitKampanyaAktif) break
        const pct = parsePct(c.nakitPercentStr ?? '')
        const dRaw = running * (pct / 100)
        const d = Math.min(Math.max(0, dRaw), running)
        out.push({
          id: c.id,
          summaryText:
            pct > 0
              ? `Nakit Kampanyası (%${pct === Math.round(pct) ? pct : pct}): ${formatNeg(d)}`
              : `Nakit Kampanyası: ${formatNeg(d)}`,
          discountTRY: d,
        })
        running -= d
        break
      }
      case 'IKI_AL_BIR_ODE': {
        let minLt = Infinity
        for (const it of originals) {
          const v = moneyTryFromItemLine(it.lineTotal)
          if (v > 0 && v < minLt) minLt = v
        }
        if (!Number.isFinite(minLt)) minLt = 0
        if (originals.length < 2) minLt = 0
        const d = Math.min(minLt, running)
        out.push({
          id: c.id,
          summaryText: `İki Al Bir Öde${originals.length < 2 ? ' (en az 2 kalem)' : ''}: ${formatNeg(d)}`,
          discountTRY: d,
        })
        running -= d
        break
      }
      case 'URUN_BAZLI': {
        const omap = lineTotalsMap()
        let rawSum = 0
        const urun = c.urun ?? {}
        const keysUsed = originals.length ? originals.map((x) => x.id) : Object.keys(urun)
        for (const sid of keysUsed) {
          const entry = urun[sid]
          if (!entry?.sel) continue
          const base = omap.get(sid)
          const ltBase = typeof base === 'number' ? base : 0
          if (ltBase <= 0) continue
          if (entry.mode === 'PCT') {
            const p = parsePct(entry.valueStr)
            rawSum += ltBase * (p / 100)
          } else {
            rawSum += Math.min(parsePositiveNum(entry.valueStr) || ltBase, ltBase)
          }
        }
        const d = Math.min(rawSum, running)
        out.push({
          id: c.id,
          summaryText: `Ürün Bazlı: ${formatNeg(d)}`,
          discountTRY: d,
        })
        running -= d
        break
      }
      case 'COMBO':
      case 'FORMUL':
        break
      default:
        break
    }
  }

  const totalDiscountTRY = Math.max(0, catalog - Math.max(0, running))
  return { lines: out, totalDiscountTRY }
}

/** Otomatik uygulanacak DB kampanyalarını sıralı hesapla */
export function evaluateAutoDbCampaigns(params: {
  catalogNetTRY: number
  items: { id: string; lineTotal?: string; product?: { name?: string } | null }[]
  records: CampaignRecord[]
  nakitKampanyaAktif: boolean
  branchId?: string
}): { lines: CampaignEvaluationLine[]; totalDiscountTRY: number } {
  const now = new Date()
  const active = params.records
    .filter((r) => r.isActive && r.autoApply && isCampaignDateActive(r, now))
    .filter((r) => {
      if (!params.branchId || !r.branchOverrides?.length) return true
      const ov = r.branchOverrides.find((o) => o.branchId === params.branchId)
      if (!ov) return true
      if (ov.isActive === false) return false
      return true
    })
    .sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10))

  const cards = active.map(dbCampaignToAppliedCard)
  return evaluateCampaignStack({
    catalogNetTRY: params.catalogNetTRY,
    items: params.items,
    campaigns: cards,
    nakitKampanyaAktif: params.nakitKampanyaAktif,
  })
}
