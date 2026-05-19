/** Daimi reçete tek satır özeti: "Daimi R: -2.00/-0.75/180 · L: -2.00/-0.75/180" */
export function formatDaimiPrescriptionSummary(rx: Record<string, unknown> | null | undefined): string {
  if (!rx) return ''
  const fmt = (side: 'r' | 'l') => {
    const sph = String(rx[`far_${side}_sph`] ?? '').trim()
    const cyl = String(rx[`far_${side}_cyl`] ?? '').trim()
    const aks = String(rx[`far_${side}_aks`] ?? '').trim()
    if (!sph && !cyl && !aks) return null
    return `${sph || '—'}/${cyl || '—'}/${aks || '—'}`
  }
  const r = fmt('r')
  const l = fmt('l')
  const parts: string[] = []
  if (r) parts.push(`R: ${r}`)
  if (l) parts.push(`L: ${l}`)
  if (!parts.length) return ''
  return `Daimi ${parts.join(' · ')}`
}

export function parseRxNumber(raw: string): number | null {
  const s = String(raw ?? '').trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function formatRxSph(n: number): string {
  const v = Math.round(n * 100) / 100
  const s = v.toFixed(2)
  return v > 0 ? `+${s}` : s
}

/** Yakın SPH = Daimi SPH + ADD */
export function nearSphFromFarAndAdd(farSph: string, add: string): string {
  const sph = parseRxNumber(farSph)
  const addN = parseRxNumber(add)
  if (sph == null || addN == null) return ''
  return formatRxSph(sph + addN)
}

/** ADD seçiliyken yakın değerleri: SPH = daimi + ADD, CYL/AKS = daimi ile aynı */
export function nearRxFromFarAndAdd(far: {
  sph: string
  cyl: string
  aks: string
  add: string
}): { sph: string; cyl: string; aks: string } {
  if (!far.add.trim()) {
    return { sph: '', cyl: '', aks: '' }
  }
  return {
    sph: nearSphFromFarAndAdd(far.sph, far.add),
    cyl: far.cyl,
    aks: far.aks,
  }
}
