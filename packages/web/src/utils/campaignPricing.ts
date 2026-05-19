/** Hardcode kampanya türleri — yönetim paneli entegrasyonu sonraya. */
export const CAMPAIGN_TYPE_OPTIONS = [
  { id: 'KASA', label: 'Kasa İndirimi', desc: 'Sabit tutar' },
  { id: 'NAKIT_ORAN', label: 'Nakit Kampanyası', desc: 'Yüzde (nakit seçiliyken)' },
  { id: 'IKI_AL_BIR_ODE', label: 'İki Al Bir Öde', desc: 'En ucuz kaleme kadar bedava' },
  { id: 'URUN_BAZLI', label: 'Ürün Bazlı', desc: 'Kalem bazında oran / tutar' },
] as const

export type CampaignTypeId = (typeof CAMPAIGN_TYPE_OPTIONS)[number]['id']

export type CampaignLineDiscountMode = 'PCT' | 'FIXED'

export type CampaignUrunLinesState = Record<
  string,
  { sel: boolean; mode: CampaignLineDiscountMode; valueStr: string }
>

/** Listeye eklenen kampanya kartı */
export type AppliedCampaignCard = {
  id: string
  kind: CampaignTypeId
  /** Kasa */
  kasaAmountStr?: string
  /** Nakit */
  nakitPercentStr?: string
  /** Ürün bazlı kalemler (ekleme anındaki anahtarlar; satış değişince evaluate güncellenir) */
  urun?: CampaignUrunLinesState
}

export type CampaignEvaluationLine = {
  id: string
  /** Örn. "Kasa İndirimi: -500,00 ₺" */
  summaryText: string
  discountTRY: number
}

function parsePositiveNum(raw: string): number {
  const n = Number(String(raw).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 0
  return n
}

function parsePct(raw: string): number {
  const n = Number(String(raw).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 100)
}

function moneyTryFromItemLine(raw: unknown): number {
  if (raw == null) return 0
  const n = Number(String(raw).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Sıralı kampanya hesabı — her adımdan sonra kalan tutara güncellenir */
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

    switch (c.kind) {
      case 'KASA': {
        const fixed = parsePositiveNum(c.kasaAmountStr ?? '')
        const d = Math.min(fixed, running)
        const fmt = formatNeg(d)
        out.push({
          id: c.id,
          summaryText: `Kasa İndirimi: ${fmt}`,
          discountTRY: d,
        })
        running -= d
        break
      }
      case 'NAKIT_ORAN': {
        if (!params.nakitKampanyaAktif) {
          break
        }
        const pct = parsePct(c.nakitPercentStr ?? '')
        const dRaw = running * (pct / 100)
        const d = Math.min(Math.max(0, dRaw), running)
        const fmt = formatNeg(d)
        out.push({
          id: c.id,
          summaryText: pct > 0 ? `Nakit Kampanyası (%${pct === Math.round(pct) ? pct : pct}): ${fmt}` : `Nakit Kampanyası: ${fmt}`,
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
        const fmt = formatNeg(d)
        out.push({
          id: c.id,
          summaryText: `İki Al Bir Öde${originals.length < 2 ? ' (en az 2 kalem)' : ''}: ${fmt}`,
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
        const fmt = formatNeg(d)
        out.push({
          id: c.id,
          summaryText: `Ürün Bazlı: ${fmt}`,
          discountTRY: d,
        })
        running -= d
        break
      }
      default:
        break
    }
  }

  const totalDiscountTRY = Math.max(0, catalog - Math.max(0, running))

  return { lines: out, totalDiscountTRY }
}

function formatNeg(n: number): string {
  const s = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Math.round((n + Number.EPSILON) * 100) / 100))
  return `-${s} ₺`
}
