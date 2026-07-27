import { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import { useAuthStore } from '../store/auth.store'
import { apiClient } from '../api/client'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
)
import { getDailyReport, getPersonalDailyReport, getRangeReport, getMonthlyPersonelBreakdown, downloadExcel, getGunlukDurumNotu, saveGunlukDurumNotu, sendGunlukDurumNotuEmail, type PersonelAylikRow } from '../api/reports.api'
import { getCurrentShift } from '../api/shifts.api'
import type { DailyReport, User } from '../api/types'
import { downloadGunlukKasaPdf, generateGunlukKasaPdfBlob, formatKasaFormuBaslik } from '../utils/gunlukKasaPdf'

type SalesDetailRow = NonNullable<DailyReport['salesDetail']>[number]

const RED = '#A32D2D'
const GREEN = '#3B6D11'
const BLUE = '#185FA5'
const AMBER = '#BA7517'

const CARD_STYLE: React.CSSProperties = {
  background: '#f9f9f9',
  border: '0.5px solid #e5e7eb',
  borderRadius: 8,
  padding: '14px 16px',
}

const BTN_STYLE: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  backgroundColor: 'white',
  borderRadius: 8,
  padding: '8px 14px',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
}

const PDF_BTN_STYLE: React.CSSProperties = {
  ...BTN_STYLE,
  color: BLUE,
  borderColor: BLUE,
}

function formatMoney(v?: string | number | null) {
  if (v === undefined || v === null || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
}

function todayYMD() {
  return new Date().toISOString().split('T')[0]
}

function ayBaslangic() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}

function bugun() {
  return new Date().toISOString().split('T')[0]
}

function periodRangeDates(period: PeriodKey, customFrom?: string, customTo?: string) {
  const bitis = bugun()
  const now = new Date()
  if (period === 'today') return { start: bitis, end: bitis }
  if (period === 'week') {
    const day = now.getDay()
    const mondayOffset = day === 0 ? 6 : day - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - mondayOffset)
    return { start: monday.toISOString().split('T')[0], end: bitis }
  }
  if (period === 'month') return { start: ayBaslangic(), end: bitis }
  if (period === 'year') return { start: `${now.getFullYear()}-01-01`, end: bitis }
  return { start: customFrom ?? ayBaslangic(), end: customTo ?? bitis }
}

function periodToDateStrings(period: PeriodKey, customFrom?: string, customTo?: string) {
  const bitis = bugun()
  const now = new Date()
  if (period === 'today') return { baslangic: bitis, bitis }
  if (period === 'week') {
    const d = new Date()
    d.setDate(d.getDate() - 6)
    return { baslangic: d.toISOString().split('T')[0], bitis }
  }
  if (period === 'month') return { baslangic: ayBaslangic(), bitis }
  if (period === 'year') return { baslangic: `${now.getFullYear()}-01-01`, bitis }
  return { baslangic: customFrom ?? ayBaslangic(), bitis: customTo ?? bitis }
}

const chartCurrencyTicks = {
  callback: (v: string | number) =>
    new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(v)),
}

function dateRangeForDay(date: string) {
  const d = new Date(`${date}T00:00:00`)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() }
}

type PeriodKey = 'today' | 'week' | 'month' | 'year' | 'custom'

function periodRange(period: PeriodKey, customFrom?: string, customTo?: string) {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  let start: Date
  if (period === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  } else if (period === 'week') {
    start = new Date(end)
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  } else if (period === 'year') {
    start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
  } else {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : startOfMonth(now)
    const to = customTo ? new Date(`${customTo}T23:59:59`) : end
    return { dateFrom: from.toISOString(), dateTo: to.toISOString() }
  }
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() }
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

function handlePrint() {
  window.print()
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('tr-TR')
}

function fmtTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function cardSlipTotal(row: SalesDetailRow) {
  return row.cardPayments.reduce((s, p) => s + Number(p.grossAmount), 0)
}

function cardCommissionTotal(row: SalesDetailRow) {
  return row.cardPayments.reduce((s, p) => s + Number(p.commissionAmount), 0)
}

function summarizeGunlukKasaRows(rows: SalesDetailRow[]) {
  return rows
    .filter((s) => s.tip !== 'MASRAF')
    .reduce(
    (acc, s) => {
      acc.gross += Number(s.grossTotal)
      acc.net += Number(s.netTotal)
      acc.taxFree += Number(s.taxExcluded)
      acc.discount += Number(s.grossTotal) * (Number(s.discountPct) / 100)
      acc.cash += Number(s.cashAmount)
      acc.slip += cardSlipTotal(s)
      acc.commission += cardCommissionTotal(s)
      acc.sgk += Number(s.sgkAmount)
      return acc
    },
    { gross: 0, net: 0, taxFree: 0, discount: 0, cash: 0, slip: 0, commission: 0, sgk: 0 },
  )
}

function reportHasShift(report: DailyReport | null): boolean {
  if (!report) return false
  return (report as DailyReport & { shiftId?: string | null }).shiftId != null
}

function GorevSayaci({ count, loading, urgent }: { count: number; loading: boolean; urgent?: boolean }) {
  if (loading) return <span style={{ fontWeight: 800, color: '#6b7280' }}>...</span>
  const tone = count === 0 ? GREEN : urgent ? RED : AMBER
  const bg = count === 0 ? '#dcfce7' : urgent ? '#fee2e2' : '#fef3c7'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: bg,
        color: tone,
      }}
    >
      {count}
    </span>
  )
}

function GorevSatiri({
  label,
  count,
  loading,
  urgent,
}: {
  label: string
  count: number
  loading: boolean
  urgent?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        fontSize: 13,
        padding: '8px 0',
        borderBottom: '0.5px solid #e5e7eb',
      }}
    >
      <span>{label}</span>
      <GorevSayaci count={count} loading={loading} urgent={urgent} />
    </div>
  )
}

function VardiyaKapaliBanner() {
  return (
    <div
      style={{
        ...CARD_STYLE,
        marginBottom: 16,
        borderLeft: `4px solid ${AMBER}`,
        background: '#fffbeb',
        color: '#92400e',
        fontSize: 13,
      }}
    >
      Vardiya açık değil. Müdür hesabıyla vardiya açmanız gerekebilir.
    </div>
  )
}

function MetricCards({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {items.map((k) => (
        <div key={k.label} style={{ ...CARD_STYLE, flex: '1 1 140px', minWidth: 120 }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>{k.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: RED, marginTop: 6 }}>{k.value}</div>
        </div>
      ))}
    </div>
  )
}

function labIncidentTipLabel(type: string) {
  if (type === 'LENS_BROKEN') return 'Cam kırıldı'
  if (type === 'FRAME_BROKEN') return 'Çerçeve kırıldı'
  if (type === 'MEASUREMENT_SHIFT') return 'Ölçüm kaydırması'
  return type
}

function labIncidentCozumLabel(
  resolution: string | null | undefined,
  transferRef?: string | null,
) {
  if (resolution === 'TRANSFER') return transferRef ? `Transfer (${transferRef})` : 'Transfer'
  if (resolution === 'OZEL_SIPARIS') return 'Özel Sipariş'
  if (resolution === 'NONE') return 'Kayıt'
  if (!resolution) return 'Bekliyor'
  return resolution
}

function AtolyeOlaylariOzet({ report }: { report: DailyReport | null }) {
  const [expanded, setExpanded] = useState(false)
  const lab = report?.labIncidents
  if (!lab?.toplam) return null

  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          ...CARD_STYLE,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          borderLeft: '4px solid #d97706',
          background: '#fffbeb',
        }}
      >
        <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>
          ⚠️ Atölye Olayları
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#b45309', marginTop: 6 }}>{lab.toplam}</div>
        <div style={{ fontSize: 12, color: '#78350f', marginTop: 4 }}>
          Cam: {lab.lensBroken} · Çerçeve: {lab.frameBroken} · Ölçüm: {lab.measurementShift}
          {' · '}
          {expanded ? '▲ Gizle' : '▼ Detay'}
        </div>
      </button>
      {expanded ? (
        <div style={{ ...CARD_STYLE, marginTop: 8, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Saat</th>
                <th style={{ padding: '8px 10px' }}>Müşteri</th>
                <th style={{ padding: '8px 10px' }}>Tip</th>
                <th style={{ padding: '8px 10px' }}>Çözüm</th>
              </tr>
            </thead>
            <tbody>
              {lab.kayitlar.map((k) => (
                <tr key={k.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                    {new Date(k.saat).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    {k.musteriAdi}
                    {k.saleId ? (
                      <span style={{ display: 'block', fontSize: 11, color: '#9ca3af' }}>
                        #{k.saleId.slice(0, 8)}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ padding: '8px 10px' }}>{labIncidentTipLabel(k.incidentType)}</td>
                  <td style={{ padding: '8px 10px' }}>
                    {labIncidentCozumLabel(k.resolutionType, k.transferRef)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function TabBar({ tabs, active, onChange }: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {tabs.map((t, i) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(i)}
          style={{
            ...BTN_STYLE,
            borderColor: active === i ? RED : '#e5e7eb',
            color: active === i ? RED : '#374151',
            backgroundColor: active === i ? '#fff5f5' : 'white',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

function SectionHeader({
  title,
  showPdf,
  onPdf,
}: {
  title: string
  showPdf?: boolean
  onPdf?: () => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111' }}>{title}</h2>
      {showPdf ? (
        <button type="button" onClick={onPdf ?? handlePrint} style={PDF_BTN_STYLE}>
          PDF
        </button>
      ) : null}
    </div>
  )
}

function KategoriBars({ report }: { report: DailyReport | null }) {
  const cats = [
    ['GUNES_GOZLUGU', 'Güneş Gözlüğü'],
    ['CAM', 'Cam'],
    ['LENS', 'Lens'],
    ['OPTIK_CERCEVE', 'Çerçeve'],
    ['AKSESUAR', 'Aksesuar'],
    ['SOLUSYON', 'Solüsyon'],
    ['DIGER', 'Diğer'],
  ] as const
  const max = Math.max(1, ...cats.map(([k]) => report?.kategoriBreakdown?.[k] ?? 0))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {cats.map(([key, label]) => {
        const val = report?.kategoriBreakdown?.[key] ?? 0
        const pct = (val / max) * 100
        return (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>{label}</span>
              <span style={{ fontWeight: 700 }}>{val}</span>
            </div>
            <div style={{ height: 8, background: '#eee', borderRadius: 4 }}>
              <div style={{ width: `${pct}%`, height: '100%', background: RED, borderRadius: 4 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

type GunlukKasaSutunKey =
  | 'alisverisTarihi'
  | 'teslimTarihi'
  | 'musteri'
  | 'urunKalemleri'
  | 'brutTutar'
  | 'siparisBedeli'
  | 'vergiHaric'
  | 'iskonto'
  | 'nakit'
  | 'taksit'
  | 'oran'
  | 'slipTop'
  | 'bankaKom'
  | 'receteBed'
  | 'musteriSaati'
  | 'kacinciSatis'
  | 'temsilci'

type GunlukKasaTotals = ReturnType<typeof summarizeGunlukKasaRows>

type GunlukKasaSutunDef = {
  key: GunlukKasaSutunKey
  label: string
  varsayilanGorunur: boolean
  totalType: 'label' | 'value' | 'blank'
  totalRender?: (totals: GunlukKasaTotals) => React.ReactNode
}

const GUNLUK_KASA_SUTUNLARI: GunlukKasaSutunDef[] = [
  { key: 'alisverisTarihi', label: 'Alışveriş Tarihi', varsayilanGorunur: true, totalType: 'label' },
  { key: 'teslimTarihi', label: 'Teslim Tarihi', varsayilanGorunur: true, totalType: 'label' },
  { key: 'musteri', label: 'Müşteri', varsayilanGorunur: true, totalType: 'label' },
  { key: 'urunKalemleri', label: 'Ürün Kalemleri', varsayilanGorunur: true, totalType: 'label' },
  {
    key: 'brutTutar',
    label: 'Brüt Tutar',
    varsayilanGorunur: true,
    totalType: 'value',
    totalRender: (t) => formatMoney(t.gross),
  },
  {
    key: 'siparisBedeli',
    label: 'Sipariş Bedeli',
    varsayilanGorunur: true,
    totalType: 'value',
    totalRender: (t) => formatMoney(t.net),
  },
  {
    key: 'vergiHaric',
    label: 'Vergi Hariç',
    varsayilanGorunur: true,
    totalType: 'value',
    totalRender: (t) => formatMoney(t.taxFree),
  },
  {
    key: 'iskonto',
    label: 'İsk.%',
    varsayilanGorunur: true,
    totalType: 'value',
    totalRender: (t) => (t.gross ? `${((t.discount / t.gross) * 100).toFixed(1)}%` : '—'),
  },
  {
    key: 'nakit',
    label: 'Nakit',
    varsayilanGorunur: true,
    totalType: 'value',
    totalRender: (t) => formatMoney(t.cash),
  },
  { key: 'taksit', label: 'Taksit', varsayilanGorunur: false, totalType: 'blank' },
  { key: 'oran', label: 'Oran', varsayilanGorunur: false, totalType: 'blank' },
  {
    key: 'slipTop',
    label: 'Slip Top.',
    varsayilanGorunur: false,
    totalType: 'value',
    totalRender: (t) => formatMoney(t.slip),
  },
  {
    key: 'bankaKom',
    label: 'Banka Kom.',
    varsayilanGorunur: false,
    totalType: 'value',
    totalRender: (t) => formatMoney(t.commission),
  },
  {
    key: 'receteBed',
    label: 'Reçete Bed.',
    varsayilanGorunur: false,
    totalType: 'value',
    totalRender: (t) => formatMoney(t.sgk),
  },
  { key: 'musteriSaati', label: 'Müşteri Saati', varsayilanGorunur: false, totalType: 'blank' },
  { key: 'kacinciSatis', label: 'Kaçıncı Satışı', varsayilanGorunur: false, totalType: 'blank' },
  { key: 'temsilci', label: 'Temsilci', varsayilanGorunur: true, totalType: 'blank' },
]

const GUNLUK_KASA_SUTUN_STORAGE_KEY = 'gunlukKasaSutunTercihi'

const GUNLUK_KASA_TD_STYLE: React.CSSProperties = { padding: '8px 6px' }

function defaultGunlukKasaSutunTercihi(): Record<GunlukKasaSutunKey, boolean> {
  return Object.fromEntries(
    GUNLUK_KASA_SUTUNLARI.map((c) => [c.key, c.varsayilanGorunur]),
  ) as Record<GunlukKasaSutunKey, boolean>
}

function loadGunlukKasaSutunTercihi(): Record<GunlukKasaSutunKey, boolean> {
  const defaults = defaultGunlukKasaSutunTercihi()
  try {
    const raw = localStorage.getItem(GUNLUK_KASA_SUTUN_STORAGE_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Record<GunlukKasaSutunKey, boolean>>
    return { ...defaults, ...parsed }
  } catch {
    return defaults
  }
}

function saveGunlukKasaSutunTercihi(pref: Record<GunlukKasaSutunKey, boolean>) {
  localStorage.setItem(GUNLUK_KASA_SUTUN_STORAGE_KEY, JSON.stringify(pref))
}

function renderGunlukKasaCell(
  key: GunlukKasaSutunKey,
  s: SalesDetailRow,
  ctx: { isMasraf: boolean; masrafAciklama: string; saleNo: number | null },
): React.ReactNode {
  const dash = '—'
  switch (key) {
    case 'alisverisTarihi':
      return fmtDate(s.createdAt)
    case 'teslimTarihi':
      return ctx.isMasraf ? dash : s.deliveryDate ? new Date(s.deliveryDate).toLocaleDateString('tr-TR') : dash
    case 'musteri':
      return ctx.isMasraf ? dash : s.customerName
    case 'urunKalemleri':
      return ctx.isMasraf ? `🔴 MASRAF: ${ctx.masrafAciklama}` : s.itemSummary || dash
    case 'brutTutar':
      return ctx.isMasraf ? dash : formatMoney(s.grossTotal)
    case 'siparisBedeli':
      return ctx.isMasraf ? dash : formatMoney(s.netTotal)
    case 'vergiHaric':
      return ctx.isMasraf ? dash : formatMoney(s.taxExcluded)
    case 'iskonto':
      return ctx.isMasraf ? dash : `${s.discountPct}%`
    case 'nakit':
      return formatMoney(s.cashAmount)
    case 'taksit':
      return ctx.isMasraf ? dash : (s.cardPayments[0]?.installment ?? dash)
    case 'oran':
      return ctx.isMasraf ? dash : (s.cardPayments[0]?.bankName ?? dash)
    case 'slipTop':
      return ctx.isMasraf ? dash : formatMoney(cardSlipTotal(s))
    case 'bankaKom':
      return ctx.isMasraf ? dash : formatMoney(cardCommissionTotal(s))
    case 'receteBed':
      return ctx.isMasraf ? dash : formatMoney(s.sgkAmount)
    case 'musteriSaati':
      return fmtTime(s.createdAt)
    case 'kacinciSatis':
      return ctx.saleNo ?? dash
    case 'temsilci':
      return s.repName
    default:
      return dash
  }
}

function gunlukKasaCellStyle(key: GunlukKasaSutunKey, isMasraf: boolean): React.CSSProperties {
  if (key === 'urunKalemleri') {
    return {
      ...GUNLUK_KASA_TD_STYLE,
      maxWidth: 180,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      ...(isMasraf ? { color: RED, fontWeight: 700 } : {}),
    }
  }
  if (key === 'nakit' && isMasraf) {
    return { ...GUNLUK_KASA_TD_STYLE, color: RED, fontWeight: 700 }
  }
  return GUNLUK_KASA_TD_STYLE
}

function renderGunlukKasaTotalsCells(activeCols: GunlukKasaSutunDef[], totals: GunlukKasaTotals) {
  const cells: React.ReactNode[] = []
  let i = 0
  while (i < activeCols.length) {
    const col = activeCols[i]
    if (col.totalType === 'label') {
      let span = 0
      while (i + span < activeCols.length && activeCols[i + span].totalType === 'label') span += 1
      cells.push(
        <td key={col.key} colSpan={span} style={GUNLUK_KASA_TD_STYLE}>
          Toplam
        </td>,
      )
      i += span
    } else if (col.totalType === 'value') {
      cells.push(
        <td key={col.key} style={GUNLUK_KASA_TD_STYLE}>
          {col.totalRender?.(totals) ?? '—'}
        </td>,
      )
      i += 1
    } else {
      let span = 0
      while (i + span < activeCols.length && activeCols[i + span].totalType === 'blank') span += 1
      cells.push(<td key={col.key} colSpan={span} style={GUNLUK_KASA_TD_STYLE} />)
      i += span
    }
  }
  return cells
}

function GunlukKasaTable({
  rows,
  showRep,
}: {
  rows: SalesDetailRow[]
  showRep?: boolean
}) {
  const [sutunPanelAcik, setSutunPanelAcik] = useState(false)
  const [sutunTercihi, setSutunTercihi] = useState<Record<GunlukKasaSutunKey, boolean>>(
    () => loadGunlukKasaSutunTercihi(),
  )

  const configurableCols = useMemo(
    () => GUNLUK_KASA_SUTUNLARI.filter((c) => c.key !== 'temsilci' || showRep),
    [showRep],
  )

  const activeCols = useMemo(
    () => configurableCols.filter((c) => sutunTercihi[c.key]),
    [configurableCols, sutunTercihi],
  )

  const totals = summarizeGunlukKasaRows(rows)

  function toggleSutun(key: GunlukKasaSutunKey) {
    setSutunTercihi((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveGunlukKasaSutunTercihi(next)
      return next
    })
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setSutunPanelAcik((v) => !v)}
          style={{ ...BTN_STYLE, fontSize: 12 }}
        >
          📋 Sütunlar
        </button>
      </div>
      {sutunPanelAcik ? (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 36,
            zIndex: 30,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            padding: '12px 14px',
            minWidth: 220,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Görünür sütunlar</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {configurableCols.map((col) => (
              <label
                key={col.key}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={sutunTercihi[col.key]}
                  onChange={() => toggleSutun(col.key)}
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {activeCols.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: 'left',
                    padding: '8px 6px',
                    borderBottom: '0.5px solid #e5e7eb',
                    fontSize: 11,
                    color: '#6b7280',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={Math.max(activeCols.length, 1)} style={{ padding: 16, color: '#9ca3af' }}>
                  Kayıt yok.
                </td>
              </tr>
            ) : null}
            {(() => {
              let saleCounter = 0
              return rows.map((s) => {
                const isMasraf = s.tip === 'MASRAF'
                const saleNo = isMasraf ? null : ++saleCounter
                const masrafAciklama = isMasraf ? s.itemSummary.replace(/^MASRAF:\s*/, '') : ''
                return (
                  <tr key={s.saleId} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                    {activeCols.map((col) => (
                      <td key={col.key} style={gunlukKasaCellStyle(col.key, isMasraf)}>
                        {renderGunlukKasaCell(col.key, s, { isMasraf, masrafAciklama, saleNo })}
                      </td>
                    ))}
                  </tr>
                )
              })
            })()}
            {rows.length > 0 && activeCols.length > 0 ? (
              <tr style={{ fontWeight: 800, background: '#fafafa' }}>
                {renderGunlukKasaTotalsCells(activeCols, totals)}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PeriodFilter({
  period,
  onPeriod,
  customFrom,
  customTo,
  onCustomFrom,
  onCustomTo,
}: {
  period: PeriodKey
  onPeriod: (p: PeriodKey) => void
  customFrom: string
  customTo: string
  onCustomFrom: (v: string) => void
  onCustomTo: (v: string) => void
}) {
  const opts: { key: PeriodKey; label: string }[] = [
    { key: 'today', label: 'Bugün' },
    { key: 'week', label: 'Bu hafta' },
    { key: 'month', label: 'Bu ay' },
    { key: 'year', label: 'Bu yıl' },
    { key: 'custom', label: 'Özel aralık' },
  ]
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onPeriod(o.key)}
          style={{
            ...BTN_STYLE,
            borderColor: period === o.key ? BLUE : '#e5e7eb',
            color: period === o.key ? BLUE : '#374151',
          }}
        >
          {o.label}
        </button>
      ))}
      {period === 'custom' ? (
        <>
          <input type="date" value={customFrom} onChange={(e) => onCustomFrom(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          <span>—</span>
          <input type="date" value={customTo} onChange={(e) => onCustomTo(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />
        </>
      ) : null}
    </div>
  )
}

function CashMovementModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [cashType, setCashType] = useState<'CASH_IN' | 'CASH_OUT' | 'ADVANCE' | 'TRANSFER_OUT'>('CASH_IN')
  const [cashAmount, setCashAmount] = useState('')
  const [cashDesc, setCashDesc] = useState('')
  const [cashSaving, setCashSaving] = useState(false)
  const [cashError, setCashError] = useState<string | null>(null)

  if (!open) return null

  async function save() {
    setCashError(null)
    const amount = cashAmount.trim()
    const description = cashDesc.trim()
    if (!amount || Number(amount) <= 0 || Number.isNaN(Number(amount))) {
      setCashError('Tutar geçerli olmalı.')
      return
    }
    if (description.length < 5) {
      setCashError('Açıklama en az 5 karakter olmalı.')
      return
    }
    setCashSaving(true)
    try {
      await apiClient.post('/cash-movements', { type: cashType, amount, description })
      onClose()
      setCashAmount('')
      setCashDesc('')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setCashError(err?.response?.data?.message ?? 'Kasa hareketi kaydedilemedi')
    } finally {
      setCashSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}>
      <div style={{ width: '100%', maxWidth: 520, background: 'white', borderRadius: 14, border: '1px solid #e5e7eb', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 900 }}>Kasa Hareketi</div>
          <button type="button" onClick={onClose} style={BTN_STYLE}>Kapat</button>
        </div>
        {cashError ? <div style={{ color: RED, fontSize: 13, marginTop: 10 }}>{cashError}</div> : null}
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Tür</div>
            <select value={cashType} onChange={(e) => setCashType(e.target.value as typeof cashType)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <option value="CASH_IN">Nakit Giriş</option>
              <option value="CASH_OUT">Nakit Çıkış</option>
              <option value="ADVANCE">Avans</option>
              <option value="TRANSFER_OUT">Bankaya Nakit Yatırma</option>
            </select>
          </label>
          <label>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Tutar</div>
            <input value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          </label>
          <label>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Açıklama</div>
            <input value={cashDesc} onChange={(e) => setCashDesc(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={cashSaving}
          style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 8, border: 'none', background: RED, color: 'white', fontWeight: 800, cursor: cashSaving ? 'not-allowed' : 'pointer', opacity: cashSaving ? 0.6 : 1 }}
        >
          Kaydet
        </button>
      </div>
    </div>
  )
}

function HedefBar({ current, target, label }: { current: number; target: number; label: string }) {
  const pct = Math.min(100, target ? (current / target) * 100 : 0)
  return (
    <div style={CARD_STYLE}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ height: 12, background: '#eee', borderRadius: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: GREEN, borderRadius: 6 }} />
      </div>
      <div style={{ fontSize: 12, marginTop: 6, color: '#6b7280' }}>
        {formatMoney(current)} / {formatMoney(target)} ({pct.toFixed(0)}%)
      </div>
    </div>
  )
}

function GunlukKasaView({
  report,
  date,
  onDateChange,
  showRep,
  repFilter,
  onRepFilter,
  branchId,
  canSendEmail,
}: {
  report: DailyReport | null
  date: string
  onDateChange?: (d: string) => void
  showRep?: boolean
  repFilter?: string | null
  onRepFilter?: (name: string | null) => void
  branchId: string
  canSendEmail?: boolean
}) {
  const filtered = useMemo(() => {
    const rows = report?.salesDetail ?? []
    if (!repFilter) return rows
    return rows.filter((s) => s.repName === repFilter)
  }, [report?.salesDetail, repFilter])

  const summary = useMemo(() => summarizeGunlukKasaRows(filtered), [filtered])

  const hasShift = reportHasShift(report)

  const [notMetin, setNotMetin] = useState('')
  const [notDraft, setNotDraft] = useState('')
  const [notYukleniyor, setNotYukleniyor] = useState(false)
  const [notKaydediliyor, setNotKaydediliyor] = useState(false)
  const [notKayitZamani, setNotKayitZamani] = useState<string | null>(null)
  const [sabitAlicilar, setSabitAlicilar] = useState<string[]>([])
  const [emailModalAcik, setEmailModalAcik] = useState(false)
  const [ekAliciInput, setEkAliciInput] = useState('')
  const [emailGonderiliyor, setEmailGonderiliyor] = useState(false)
  const [gonderimZamani, setGonderimZamani] = useState<string | null>(null)

  useEffect(() => {
    if (!branchId || !date) return
    setNotYukleniyor(true)
    getGunlukDurumNotu(branchId, date)
      .then((data) => {
        setNotMetin(data.metin)
        setNotDraft(data.metin)
        setNotKayitZamani(data.updatedAt)
        setSabitAlicilar(data.sabitAlicilar ?? [])
      })
      .catch(() => {
        setNotMetin('')
        setNotDraft('')
        setNotKayitZamani(null)
        setSabitAlicilar([])
      })
      .finally(() => setNotYukleniyor(false))
  }, [branchId, date])

  async function notKaydet(metin: string) {
    if (!branchId || !date) return
    setNotKaydediliyor(true)
    try {
      const saved = await saveGunlukDurumNotu(branchId, date, metin)
      setNotMetin(saved.metin)
      setNotDraft(saved.metin)
      setNotKayitZamani(saved.updatedAt)
    } catch {
      alert('Not kaydedilemedi.')
    } finally {
      setNotKaydediliyor(false)
    }
  }

  async function emailGonder() {
    if (!branchId || !date) return
    const ekList = ekAliciInput
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean)
    setEmailGonderiliyor(true)
    try {
      if (notDraft !== notMetin) {
        await notKaydet(notDraft)
      }
      const branchName = report?.branchName ?? 'Şube'
      const pdfFilename = `${formatKasaFormuBaslik(branchName, date)}.pdf`
      const pdfBlob = await generateGunlukKasaPdfBlob({
        branchName,
        date,
        rows: filtered,
        summary,
        showRep,
        durumNotu: notDraft,
      })
      const result = await sendGunlukDurumNotuEmail(branchId, date, pdfBlob, pdfFilename, ekList)
      setGonderimZamani(result.gonderimZamani)
      setEmailModalAcik(false)
      setEkAliciInput('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      alert(msg ?? 'E-posta gönderilemedi.')
    } finally {
      setEmailGonderiliyor(false)
    }
  }

  function handleGunlukKasaPdf() {
    void downloadGunlukKasaPdf({
      branchName: report?.branchName ?? 'Şube',
      date,
      rows: filtered,
      summary,
      showRep,
      durumNotu: notDraft,
    })
  }

  return (
    <div>
      <SectionHeader
        title={`${report?.branchName ?? 'Şube'} — ${fmtDate(date)}`}
        showPdf
        onPdf={handleGunlukKasaPdf}
      />
      {onDateChange ? (
        <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} style={{ marginBottom: 12, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />
      ) : null}
      {showRep && onRepFilter ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => onRepFilter(null)} style={{ ...BTN_STYLE, borderColor: !repFilter ? RED : '#e5e7eb', color: !repFilter ? RED : '#374151' }}>Tümü</button>
          {(report?.temsilciBreakdown ?? []).map((r) => (
            <button
              key={r.repName}
              type="button"
              onClick={() => onRepFilter(r.repName)}
              style={{ ...BTN_STYLE, borderColor: repFilter === r.repName ? RED : '#e5e7eb', color: repFilter === r.repName ? RED : '#374151' }}
            >
              {r.repName}
            </button>
          ))}
        </div>
      ) : null}
      {hasShift ? (
        <>
          <MetricCards
            items={[
              { label: 'Brüt Ciro', value: formatMoney(summary.gross) },
              { label: 'Sipariş Bedeli', value: formatMoney(summary.net) },
              { label: 'Nakit Giriş', value: formatMoney(summary.cash) },
              { label: 'Nakit Çıkış', value: formatMoney(report?.cashOut) },
              { label: 'Slip Toplamı', value: formatMoney(summary.slip) },
              {
                label: 'İskonto %',
                value: summary.gross ? `${((summary.discount / summary.gross) * 100).toFixed(1)}%` : '—',
              },
              { label: 'Satış Adedi', value: String(filtered.length) },
              ...(report?.labIncidents?.toplam
                ? [{ label: '⚠️ Atölye Olayları', value: String(report.labIncidents.toplam) }]
                : []),
            ]}
          />
          <AtolyeOlaylariOzet report={report} />
          <div style={{ marginTop: 16 }}>
            <GunlukKasaTable rows={filtered} showRep={showRep} />
          </div>
        </>
      ) : null}

      <div style={{ ...CARD_STYLE, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 800 }}>Günlük Durum Notu</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {notKayitZamani ? (
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                Kaydedildi {new Date(notKayitZamani).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            {gonderimZamani ? (
              <span style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>
                Gönderildi ✓ {new Date(gonderimZamani).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            {canSendEmail ? (
              <button
                type="button"
                onClick={() => setEmailModalAcik(true)}
                style={{ ...BTN_STYLE, borderColor: BLUE, color: BLUE, fontWeight: 700 }}
              >
                📧 E-posta Gönder
              </button>
            ) : null}
          </div>
        </div>
        <textarea
          value={notDraft}
          disabled={notYukleniyor}
          onChange={(e) => setNotDraft(e.target.value)}
          onBlur={() => {
            if (notDraft !== notMetin) void notKaydet(notDraft)
          }}
          placeholder={'Örn:\n• Bugün 12 satış yapıldı, yoğun saat 14:00–16:00\n• Stokta olmayan: Ray-Ban RB2140 kahve\n• SGK denetimi için evraklar hazırlandı'}
          style={{
            width: '100%',
            minHeight: 140,
            padding: 12,
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 13,
            lineHeight: 1.5,
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            disabled={notKaydediliyor || notDraft === notMetin}
            onClick={() => void notKaydet(notDraft)}
            style={{
              ...BTN_STYLE,
              background: notDraft === notMetin ? '#f3f4f6' : RED,
              color: notDraft === notMetin ? '#9ca3af' : 'white',
              borderColor: notDraft === notMetin ? '#e5e7eb' : RED,
              fontWeight: 700,
            }}
          >
            {notKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>

      {emailModalAcik ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 480, maxWidth: '90vw' }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>Günlük Durum Raporu — E-posta</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Sabit alıcılar</div>
              {sabitAlicilar.length ? (
                <div style={{ fontSize: 13, color: '#374151', background: '#f9fafb', borderRadius: 8, padding: 10 }}>
                  {sabitAlicilar.join(', ')}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Admin panelden sabit alıcı tanımlanmamış.</div>
              )}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                Ek alıcı ekle (virgülle ayırın)
              </label>
              <input
                type="text"
                value={ekAliciInput}
                onChange={(e) => setEkAliciInput(e.target.value)}
                placeholder="ornek@firma.com, diger@firma.com"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setEmailModalAcik(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', cursor: 'pointer', fontWeight: 700 }}>İptal</button>
              <button
                type="button"
                disabled={emailGonderiliyor || (!sabitAlicilar.length && !ekAliciInput.trim())}
                onClick={() => void emailGonder()}
                style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontWeight: 700, opacity: emailGonderiliyor ? 0.7 : 1 }}
              >
                {emailGonderiliyor ? 'Gönderiliyor...' : 'Gönder'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const BELGE_TIP_LABELS: Record<string, string> = {
  IS_SOZLESMESI: 'İş Sözleşmesi',
  SGK_GIRIS: 'SGK Giriş',
  MAAS_BORDROSU: 'Maaş Bordrosu',
  KIMLIK: 'Kimlik',
  IKAMETGAH: 'İkametgah',
  SAGLIK: 'Sağlık',
  DIGER: 'Diğer',
}

type PersonelBelgeRow = {
  id: string
  tip: string
  ad: string
  dosyaAdi: string
  onaylandi: boolean
  createdAt: string
}

function PersonelDashboard({ user }: { user: User }) {
  const shiftId = useAuthStore((s) => s.shiftId)
  const [tab, setTab] = useState(0)
  const [date, setDate] = useState(todayYMD())
  const [report, setReport] = useState<DailyReport | null>(null)
  const [period, setPeriod] = useState<PeriodKey>('today')
  const [customFrom, setCustomFrom] = useState(todayYMD())
  const [customTo, setCustomTo] = useState(todayYMD())
  const [personelGorevler, setPersonelGorevler] = useState({ teslimHazir: 0, loading: true })
  const [draftSatisSayisi, setDraftSatisSayisi] = useState(0)
  const [primData, setPrimData] = useState<{ id: string; primTutari?: number; primKural?: { ad?: string } }[]>([])
  const [belgeler, setBelgeler] = useState<PersonelBelgeRow[]>([])
  const [benimPersonelId, setBenimPersonelId] = useState<string | null>(null)
  const [belgeYukleniyor, setBelgeYukleniyor] = useState(false)

  useEffect(() => {
    getPersonalDailyReport(date).then(setReport).catch(() => setReport(null))
  }, [date])

  useEffect(() => {
    async function fetchPersonelGorevler() {
      const buAyBas = new Date()
      buAyBas.setDate(1)
      buAyBas.setHours(0, 0, 0, 0)

      try {
        const [deliveryRes, primRes] = await Promise.all([
          apiClient.get('/sales/delivery'),
          apiClient
            .get('/admin/prim-kazanimlar', {
              params: { baslangic: buAyBas.toISOString().split('T')[0] },
            })
            .catch(() => ({ data: { data: [] } })),
        ])
        const deliverySales = deliveryRes.data?.data ?? []
        const mySales = deliverySales.filter((s: { userId?: string }) => s.userId === user.id)
        const teslimHazir = mySales.filter((s: { items?: { status: string }[] }) =>
          s.items?.some((i) => i.status === 'READY'),
        ).length
        setPersonelGorevler({ teslimHazir, loading: false })
        setPrimData(primRes.data?.data ?? [])
        try {
          const draftRes = await apiClient.get('/sales?status=DRAFT')
          setDraftSatisSayisi((draftRes.data ?? []).length)
        } catch { setDraftSatisSayisi(0) }
      } catch (e) {
        console.error('Personel görevler fetch error', e)
        setPersonelGorevler((prev) => ({ ...prev, loading: false }))
        setPrimData([])
      }
    }
    void fetchPersonelGorevler()
  }, [user.id])

  useEffect(() => {
    apiClient
      .get('/admin/personeller')
      .then((res) => {
        const personeller = res.data?.data ?? []
        const benimPersonel = personeller.find((p: { userId?: string }) => p.userId === user.id)
        if (!benimPersonel) {
          setBenimPersonelId(null)
          setBelgeler([])
          return null
        }
        setBenimPersonelId(benimPersonel.id)
        return apiClient.get(`/admin/personel/${benimPersonel.id}/belgeler`)
      })
      .then((res) => {
        if (res) setBelgeler(res.data?.data ?? [])
      })
      .catch(() => {
        setBenimPersonelId(null)
        setBelgeler([])
      })
  }, [user.id])

  async function belgeGuncelle(tip: string, file: File) {
    if (!benimPersonelId) return
    setBelgeYukleniyor(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const base64 = (e.target?.result as string).split(',')[1]
        const tipLabel = BELGE_TIP_LABELS[tip] ?? tip
        await apiClient.post(`/admin/personel/${benimPersonelId}/belge-yukle`, {
          tip,
          ad: `${tipLabel} — ${new Date().toLocaleDateString('tr-TR')}`,
          dosyaAdi: file.name,
          icerik: base64,
          mimeType: file.type || 'application/octet-stream',
          boyut: file.size,
        })
        const res = await apiClient.get(`/admin/personel/${benimPersonelId}/belgeler`)
        setBelgeler(res.data?.data ?? [])
      } catch {
        /* sessiz */
      } finally {
        setBelgeYukleniyor(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const toplamPrim = primData.reduce((a, p) => a + (p.primTutari ?? 0), 0)
  const myRep = useMemo(
    () =>
      (report?.temsilciBreakdown ?? []).find(
        (r) => r.repName?.toLowerCase().trim() === user.name?.toLowerCase().trim(),
      ),
    [report?.temsilciBreakdown, user.name],
  )
  const aylikHedef = myRep?.aylikHedef ?? 0

  const tabs = ['Günlük Kasa', 'Performans & Görevler', 'Profilim']

  return (
    <div>
      {!shiftId || !reportHasShift(report) ? <VardiyaKapaliBanner /> : null}
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
      {tab === 0 ? (
        <GunlukKasaView report={report} date={date} onDateChange={setDate} branchId={user.branchId} />
      ) : null}
      {tab === 1 ? (
        <div>
          <SectionHeader title="Performans & Görevler" showPdf />
          <PeriodFilter period={period} onPeriod={setPeriod} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} />
          <div style={{ ...CARD_STYLE, marginBottom: 16, borderLeft: `4px solid ${BLUE}` }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Bugün ne yapmalıyım?</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Laboratuvara gönderilmedi — yakında</div>
            {draftSatisSayisi > 0 ? (
              <div
                onClick={() => window.location.href = '/sales?status=DRAFT'}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', borderRadius: 8, marginBottom: 8,
                  background: '#fef9c3', border: '1px solid #fde68a', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: '#854d0e' }}>⚠ Yarım kalan satış</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: '#854d0e', background: '#fde68a', borderRadius: 999, padding: '2px 10px' }}>{draftSatisSayisi}</span>
              </div>
            ) : null}
            <GorevSatiri
              label="Teslim için hazır, müşteri aranmadı"
              count={personelGorevler.teslimHazir}
              loading={personelGorevler.loading}
            />
            <div style={{ fontSize: 13, color: '#6b7280', paddingTop: 8 }}>Açık garanti — yakında</div>
          </div>
          {aylikHedef > 0 ? (
            <HedefBar
              current={Number(report?.netCiro ?? 0)}
              target={aylikHedef}
              label="Aylık hedef"
            />
          ) : (
            <div style={{ ...CARD_STYLE, color: '#6b7280', fontSize: 13 }}>
              Aylık hedef tanımlanmadı
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <MetricCards items={[{ label: 'Ortalama Sepet', value: formatMoney(report?.ortalamaSepet) }]} />
          </div>
          <div style={{ marginTop: 16, ...CARD_STYLE }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Kategori dağılımı</div>
            <KategoriBars report={report} />
          </div>
          <div style={{ marginTop: 16, ...CARD_STYLE }}>
            <div style={{ fontWeight: 700, color: '#111', marginBottom: 6 }}>Prim durumu</div>
            {primData.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>Henüz prim hesaplanmadı</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Bu ay kazanılan prim</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: BLUE }}>{formatMoney(toplamPrim)}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, marginBottom: 10 }}>
                  {primData.length} kazanım
                </div>
                {primData.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 13,
                      padding: '6px 0',
                      borderTop: '1px solid #f3f4f6',
                    }}
                  >
                    <span>{p.primKural?.ad ?? '—'}</span>
                    <span style={{ fontWeight: 700, color: GREEN }}>{formatMoney(p.primTutari)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
          <div style={{ marginTop: 16, ...CARD_STYLE }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Kampanya katılımı</div>
            {(report?.kampanyaBreakdown ?? []).length === 0 ? (
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Kayıt yok.</div>
            ) : (
              report?.kampanyaBreakdown?.map((k) => (
                <div key={k.type} style={{ fontSize: 13 }}>{k.type}: {k.count}</div>
              ))
            )}
          </div>
        </div>
      ) : null}
      {tab === 2 ? (
        <div>
          <SectionHeader title="Profilim" />
          <div style={CARD_STYLE}>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div><strong>Ad:</strong> {user.name}</div>
              <div><strong>Kullanıcı adı:</strong> {user.username}</div>
              <div><strong>Rol:</strong> {user.role}</div>
            </div>
          </div>
          <div style={{ ...CARD_STYLE, marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>SGK & İK belgeleri</div>
            {!benimPersonelId ? (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                Personel kaydınız henüz bağlanmamış. Yönetim ile iletişime geçin.
              </p>
            ) : belgeler.length === 0 ? (
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Henüz belge yüklenmemiş.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {belgeler.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 0',
                      borderTop: '1px solid #f3f4f6',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          backgroundColor: '#e0e7ff',
                          color: '#3730a3',
                        }}
                      >
                        {BELGE_TIP_LABELS[b.tip] ?? b.tip}
                      </span>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{b.ad}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        {new Date(b.createdAt).toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 20,
                          backgroundColor: b.onaylandi ? '#dcfce7' : '#fef3c7',
                          color: b.onaylandi ? GREEN : AMBER,
                        }}
                      >
                        {b.onaylandi ? 'Yüklendi' : 'Onay bekliyor'}
                      </span>
                      <label
                        style={{
                          ...BTN_STYLE,
                          fontSize: 11,
                          padding: '4px 10px',
                          cursor: belgeYukleniyor ? 'wait' : 'pointer',
                          color: BLUE,
                          borderColor: BLUE,
                          opacity: belgeYukleniyor ? 0.6 : 1,
                        }}
                      >
                        Güncelle
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          style={{ display: 'none' }}
                          disabled={belgeYukleniyor}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) void belgeGuncelle(b.tip, file)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MudurDashboard({ user }: { user: User }) {
  const shiftId = useAuthStore((s) => s.shiftId)
  const [tab, setTab] = useState(0)
  const [date, setDate] = useState(todayYMD())
  const [report, setReport] = useState<DailyReport | null>(null)
  const [personalReport, setPersonalReport] = useState<DailyReport | null>(null)
  const [repFilter, setRepFilter] = useState<string | null>(null)
  const [cashOpen, setCashOpen] = useState(false)
  const [checklist, setChecklist] = useState([false, false, false])
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [customFrom, setCustomFrom] = useState(todayYMD())
  const [customTo, setCustomTo] = useState(todayYMD())
  const [shift, setShift] = useState<{ openedAt?: string } | null>(null)
  const [gorevler, setGorevler] = useState({
    labBekleyen: 0,
    teslimHazir: 0,
    acikGaranti: 0,
    vadesiGecenAcikHesap: 0,
    draftSatis: 0,
    loading: true,
  })
  const [gorevli, setGorevli] = useState<{
    tip: 'GUNLUK' | 'YEDEK' | 'YOK'
    user: { id: string; name: string; role: string } | null
    baslangic?: string | null
    bitis?: string | null
    notlar?: string | null
    yedekSorumlu?: { id: string; name: string; role: string } | null
  } | null>(null)
  const [gorevliModalAcik, setGorevliModalAcik] = useState(false)
  const [gorevliForm, setGorevliForm] = useState({
    userId: '',
    tarih: todayYMD(),
    baslangic: '09:00',
    bitis: '18:00',
    notlar: '',
  })
  const [branchPersoneller, setBranchPersoneller] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [gorevliKaydediliyor, setGorevliKaydediliyor] = useState(false)
  const [rangeReport, setRangeReport] = useState<DailyReport | null>(null)
  const [rangeLoading, setRangeLoading] = useState(false)
  const [monthlyPersonel, setMonthlyPersonel] = useState<PersonelAylikRow[]>([])
  const [monthlyPersonelLoading, setMonthlyPersonelLoading] = useState(false)

  const tabs = ['Mağaza Özeti', 'Günlük Kasa', 'Benim Satışlarım', 'Görevler', 'Personel', 'Raporlar']

  async function gorevliYenile() {
    try {
      const res = await apiClient.get('/admin/gorevli/bugun')
      setGorevli(res.data)
    } catch {
      setGorevli(null)
    }
  }

  useEffect(() => {
    if (shiftId) getCurrentShift().then(setShift).catch(() => setShift(null))
  }, [shiftId])

  useEffect(() => {
    getDailyReport(date).then(setReport).catch(() => setReport(null))
  }, [date])

  useEffect(() => {
    getPersonalDailyReport(date).then(setPersonalReport).catch(() => setPersonalReport(null))
  }, [date])

  useEffect(() => {
    if (tab !== 5) return
    const { start, end } = periodRangeDates(period, customFrom, customTo)
    setRangeLoading(true)
    getRangeReport(start, end)
      .then(setRangeReport)
      .catch(() => setRangeReport(null))
      .finally(() => setRangeLoading(false))
  }, [tab, period, customFrom, customTo])

  useEffect(() => {
    if (tab !== 4) return
    const now = new Date()
    setMonthlyPersonelLoading(true)
    getMonthlyPersonelBreakdown(now.getMonth() + 1, now.getFullYear())
      .then(setMonthlyPersonel)
      .catch(() => setMonthlyPersonel([]))
      .finally(() => setMonthlyPersonelLoading(false))
  }, [tab])

  useEffect(() => {
    async function fetchGorevler() {
      try {
        const [deliveryRes, warrantyRes, openAccountRes] = await Promise.all([
          apiClient.get('/sales/delivery'),
          apiClient.get('/warranty', { params: { status: 'OPEN' } }),
          apiClient.get('/open-account'),
        ])

        const deliverySales = deliveryRes.data?.data ?? []

        const labBekleyen = deliverySales.filter((s: { items?: { status: string }[] }) =>
          s.items?.some((i) => i.status === 'ORDERED'),
        ).length

        const teslimHazir = deliverySales.filter((s: { items?: { status: string }[] }) =>
          s.items?.some((i) => i.status === 'READY'),
        ).length

        const acikGaranti = (warrantyRes.data ?? []).length

        const openAccountData = openAccountRes.data?.data ?? []
        const vadesiGecenAcikHesap = openAccountData.filter(
          (c: { remainingDebt: number }) => c.remainingDebt > 0,
        ).length

        let draftSatis = 0
        try {
          const draftRes = await apiClient.get('/sales?status=DRAFT')
          draftSatis = (draftRes.data ?? []).length
        } catch { draftSatis = 0 }

        setGorevler({
          labBekleyen,
          teslimHazir,
          acikGaranti,
          vadesiGecenAcikHesap,
          draftSatis,
          loading: false,
        })
        void gorevliYenile()
      } catch (e) {
        console.error('Görevler fetch error', e)
        setGorevler((prev) => ({ ...prev, loading: false }))
      }
    }
    void fetchGorevler()
  }, [])

  useEffect(() => {
    if (!gorevliModalAcik || !user.branchId) return
    apiClient
      .get(`/admin/branch/${user.branchId}/personeller`)
      .then((res) => setBranchPersoneller(res.data?.data ?? []))
      .catch(() => setBranchPersoneller([]))
  }, [gorevliModalAcik, user.branchId])

  async function gorevliKaydet() {
    if (!gorevliForm.userId) return
    setGorevliKaydediliyor(true)
    try {
      await apiClient.post('/admin/gorevli/ata', {
        userId: gorevliForm.userId,
        tarih: gorevliForm.tarih,
        baslangic: gorevliForm.baslangic || undefined,
        bitis: gorevliForm.bitis || undefined,
        notlar: gorevliForm.notlar || undefined,
      })
      setGorevliModalAcik(false)
      await gorevliYenile()
    } catch {
      alert('Görevli atanamadı.')
    } finally {
      setGorevliKaydediliyor(false)
    }
  }

  async function exportExcel() {
    try {
      const blob = await downloadExcel(date)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gunluk-kasa-${date}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Excel dışa aktarılamadı.')
    }
  }

  return (
    <div>
      {shiftId ? (
        <div style={{ ...CARD_STYLE, marginBottom: 16, borderLeft: `4px solid ${GREEN}`, background: '#f0fdf4' }}>
          <div style={{ color: GREEN, fontWeight: 700 }}>Vardiya Açık</div>
          <div style={{ fontSize: 12, color: GREEN }}>
            {shift?.openedAt ? `${fmtDate(shift.openedAt)} ${fmtTime(shift.openedAt)}` : 'Vardiya bilgisi yükleniyor...'}
          </div>
        </div>
      ) : (
        <VardiyaKapaliBanner />
      )}

      {gorevli?.user ? (
        <div
          style={{
            background: '#FAEEDA',
            border: '0.5px solid #FAC775',
            borderRadius: 8,
            padding: '8px 14px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13, color: '#633806' }}>
            {gorevli.tip === 'GUNLUK'
              ? `Bugünkü görevli: ${gorevli.user.name}` +
                (gorevli.baslangic ? ` · ${gorevli.baslangic}–${gorevli.bitis}` : '')
              : `Yedek sorumlu aktif: ${gorevli.user.name}`}
          </span>
          <button
            type="button"
            style={{ ...BTN_STYLE, fontSize: 11, padding: '3px 10px' }}
            onClick={() => setGorevliModalAcik(true)}
          >
            Değiştir
          </button>
        </div>
      ) : null}

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 0 ? (
        <div>
          <SectionHeader title="Mağaza Özeti" showPdf />
          {!reportHasShift(report) ? <VardiyaKapaliBanner /> : null}
          <MetricCards
            items={[
              { label: 'Günlük Ciro', value: formatMoney(report?.netCiro ?? report?.totalSales) },
              { label: 'Kasa Nakit', value: formatMoney(report?.kasaNakit ?? report?.cashTotal) },
              { label: 'Toplam Kart', value: formatMoney(report?.toplamBanka ?? report?.cardNet) },
              { label: 'SGK Hakları', value: formatMoney(report?.toplamSgkHakki) },
              { label: 'Vakıf Ödemesi', value: formatMoney(report?.toplamVakifOdemesi) },
              { label: 'Satış Adedi', value: String(report?.satisAdedi ?? report?.saleCount ?? 0) },
              { label: 'Ort. Sepet', value: formatMoney(report?.ortalamaSepet) },
              { label: 'Banka Kom.', value: formatMoney(report?.totalCommission) },
            ]}
          />
          <div style={{ ...CARD_STYLE, marginTop: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 12, color: RED }}>Personel performans</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: 8 }}>Temsilci</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Adet</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Ciro</th>
                </tr>
              </thead>
              <tbody>
                {(report?.temsilciBreakdown ?? []).map((r) => (
                  <tr key={r.repName} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                    <td style={{ padding: 8 }}>{r.repName}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{r.saleCount}</td>
                    <td style={{ padding: 8, textAlign: 'right', color: RED, fontWeight: 700 }}>{formatMoney(r.ciro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16 }}>
            <HedefBar current={Number(report?.totalNet ?? 0)} target={200000} label="Aylık hedef (placeholder)" />
          </div>
        </div>
      ) : null}

      {tab === 1 ? (
        <GunlukKasaView
          report={report}
          date={date}
          onDateChange={setDate}
          showRep
          repFilter={repFilter}
          onRepFilter={setRepFilter}
          branchId={user.branchId}
          canSendEmail
        />
      ) : null}

      {tab === 2 ? (
        <GunlukKasaView report={personalReport} date={date} onDateChange={setDate} branchId={user.branchId} />
      ) : null}

      {tab === 3 ? (
        <div>
          <SectionHeader title="Görevler" showPdf />
          <div style={{ ...CARD_STYLE, marginBottom: 12, borderLeft: `4px solid ${RED}` }}>
            <div style={{ fontWeight: 800, color: RED, marginBottom: 8 }}>Acil görevler</div>
            <GorevSatiri
              label="Laboratuvara gönderilmedi"
              count={gorevler.labBekleyen}
              loading={gorevler.loading}
              urgent
            />
            <GorevSatiri
              label="Vadesi gelen açık hesap"
              count={gorevler.vadesiGecenAcikHesap}
              loading={gorevler.loading}
              urgent
            />
            <div
              onClick={() => gorevler.draftSatis > 0 ? window.location.href = '/sales?status=DRAFT' : undefined}
              style={{ cursor: gorevler.draftSatis > 0 ? 'pointer' : 'default' }}
            >
              <GorevSatiri
                label="Yarım kalan satış"
                count={gorevler.draftSatis}
                loading={gorevler.loading}
                urgent={gorevler.draftSatis > 0}
              />
            </div>
          </div>
          <div style={{ ...CARD_STYLE, marginBottom: 12, borderLeft: `4px solid ${AMBER}` }}>
            <div style={{ fontWeight: 800, color: AMBER, marginBottom: 8 }}>Bugün takip et</div>
            <GorevSatiri
              label="Teslim için hazır, müşteri aranmadı"
              count={gorevler.teslimHazir}
              loading={gorevler.loading}
            />
            <GorevSatiri
              label="Açık garanti kaydı"
              count={gorevler.acikGaranti}
              loading={gorevler.loading}
            />
          </div>
          <div style={{ ...CARD_STYLE, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Gün sonu kontrol listesi</div>
            {['Kasa sayımı yapıldı', 'Slip kontrolü tamamlandı', 'Açık satışlar gözden geçirildi'].map((label, i) => (
              <label key={label} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={checklist[i]}
                  onChange={(e) => {
                    const next = [...checklist]
                    next[i] = e.target.checked
                    setChecklist(next)
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <button type="button" onClick={() => setCashOpen(true)} style={{ ...BTN_STYLE, width: '100%', padding: 14, fontSize: 14 }}>
            Kasa Hareketi
          </button>
          <CashMovementModal open={cashOpen} onClose={() => setCashOpen(false)} />
        </div>
      ) : null}

      {tab === 4 ? (
        <div>
          <SectionHeader title="Personel" showPdf />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ ...CARD_STYLE, borderLeft: `4px solid ${AMBER}` }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Kalıcı yedek sorumlu</div>
              {gorevli?.yedekSorumlu ? (
                <div style={{ fontSize: 14, fontWeight: 700 }}>{gorevli.yedekSorumlu.name}</div>
              ) : (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Tanımlanmadı (Tanımlamalar → Şubeler)</div>
              )}
            </div>
            <div style={{ ...CARD_STYLE, borderLeft: `4px solid ${BLUE}` }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Bugünkü görevli</div>
              {gorevli?.tip === 'GUNLUK' && gorevli.user ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{gorevli.user.name}</div>
                  {gorevli.baslangic ? (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      {gorevli.baslangic}–{gorevli.bitis}
                    </div>
                  ) : null}
                  {gorevli.notlar ? (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{gorevli.notlar}</div>
                  ) : null}
                </>
              ) : gorevli?.tip === 'YEDEK' && gorevli.user ? (
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Günlük atama yok — yedek aktif: <strong>{gorevli.user.name}</strong>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>Bugün için görevli atanmadı</div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setGorevliForm((f) => ({ ...f, tarih: todayYMD(), userId: '' }))
              setGorevliModalAcik(true)
            }}
            style={{ ...BTN_STYLE, marginBottom: 16, color: BLUE, borderColor: BLUE, fontWeight: 700 }}
          >
            Görevli Ata
          </button>
          <div style={CARD_STYLE}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Aylık personel performans</div>
            {monthlyPersonelLoading ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor…</div>
            ) : null}
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: 8 }}>Temsilci</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Adet</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Ciro</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Aylık Hedef</th>
                  <th style={{ padding: 8, minWidth: 120 }}>İlerleme</th>
                </tr>
              </thead>
              <tbody>
                {monthlyPersonel.length === 0 && !monthlyPersonelLoading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 16, color: '#9ca3af' }}>Bu ay satış kaydı yok.</td>
                  </tr>
                ) : null}
                {monthlyPersonel.map((r) => (
                  <tr key={r.repName} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                    <td style={{ padding: 8 }}>{r.repName}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{r.saleCount}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatMoney(r.ciro)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>
                      {(r.aylikHedef ?? 0) > 0 ? formatMoney(r.aylikHedef) : '—'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {(r.aylikHedef ?? 0) > 0 ? (
                        <IlerlemeCubugu value={Number(r.ciro)} max={r.aylikHedef ?? 1} />
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {gorevliModalAcik ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420 }}>
            <h3 style={{ margin: '0 0 16px', fontWeight: 800 }}>Görevli Ata</h3>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Tarih</label>
            <input
              type="date"
              value={gorevliForm.tarih}
              onChange={(e) => setGorevliForm((f) => ({ ...f, tarih: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Personel</label>
            <select
              value={gorevliForm.userId}
              onChange={(e) => setGorevliForm((f) => ({ ...f, userId: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 12 }}
            >
              <option value="">Seçin...</option>
              {branchPersoneller.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Başlangıç</label>
                <input
                  type="time"
                  value={gorevliForm.baslangic}
                  onChange={(e) => setGorevliForm((f) => ({ ...f, baslangic: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Bitiş</label>
                <input
                  type="time"
                  value={gorevliForm.bitis}
                  onChange={(e) => setGorevliForm((f) => ({ ...f, bitis: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Notlar</label>
            <input
              value={gorevliForm.notlar}
              onChange={(e) => setGorevliForm((f) => ({ ...f, notlar: e.target.value }))}
              placeholder="Opsiyonel"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 16, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setGorevliModalAcik(false)} style={{ ...BTN_STYLE, flex: 1 }}>
                İptal
              </button>
              <button
                type="button"
                disabled={gorevliKaydediliyor || !gorevliForm.userId}
                onClick={() => void gorevliKaydet()}
                style={{ ...BTN_STYLE, flex: 1, backgroundColor: BLUE, color: 'white', borderColor: BLUE, fontWeight: 700 }}
              >
                {gorevliKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 5 ? (
        <div>
          <SectionHeader title="Raporlar" showPdf />
          <PeriodFilter period={period} onPeriod={setPeriod} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} />
          {rangeLoading ? <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Yükleniyor…</div> : null}
          <MetricCards
            items={[
              { label: 'Net Ciro', value: formatMoney(rangeReport?.netCiro) },
              { label: 'Satış Adedi', value: String(rangeReport?.saleCount ?? 0) },
              { label: 'Ort. Sepet', value: formatMoney(rangeReport?.ortalamaSepet) },
              { label: 'İskonto', value: formatMoney(rangeReport?.totalDiscount) },
            ]}
          />
          <div style={{ ...CARD_STYLE, marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Kategori dağılımı</div>
            <KategoriBars report={rangeReport} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button type="button" onClick={() => void exportExcel()} style={{ ...BTN_STYLE, color: GREEN, borderColor: GREEN }}>
              Excel dışa aktar
            </button>
            <button type="button" onClick={handlePrint} style={PDF_BTN_STYLE}>
              PDF al
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type BolgeSekme = 'bolge' | 'magazalar' | 'personel' | 'kasa' | 'benim' | 'raporlar'

type SubeBreakdownRow = {
  branchId: string
  subeAdi: string
  ciro: number
  satisAdedi: number
}

function BolgeMetricCards({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {items.map((k) => (
        <div key={k.label} style={{ ...CARD_STYLE, flex: '1 1 140px', minWidth: 120 }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>{k.label}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: BLUE, marginTop: 6 }}>{k.value}</div>
        </div>
      ))}
    </div>
  )
}

function BolgeTabBar({ tabs, active, onChange }: { tabs: { key: BolgeSekme; label: string }[]; active: BolgeSekme; onChange: (k: BolgeSekme) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          style={{
            ...BTN_STYLE,
            borderColor: active === t.key ? BLUE : '#e5e7eb',
            color: active === t.key ? BLUE : '#374151',
            backgroundColor: active === t.key ? '#eff6ff' : 'white',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function BolgeSectionHeader({ title, showPdf }: { title: string; showPdf?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111' }}>{title}</h2>
      {showPdf ? (
        <button type="button" onClick={handlePrint} style={{ ...PDF_BTN_STYLE, color: BLUE, borderColor: BLUE }}>
          PDF
        </button>
      ) : null}
    </div>
  )
}

function IlerlemeCubugu({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ height: 8, background: '#eee', borderRadius: 4, minWidth: 80 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: BLUE, borderRadius: 4 }} />
    </div>
  )
}

function BolgeKategoriDoughnut({ kategori }: { kategori: Record<string, { ciro?: number }> | null }) {
  return (
    <div style={{ position: 'relative', height: 200 }}>
      <Doughnut
        data={{
          labels: ['Güneş', 'Cam', 'Lens', 'Çerçeve', 'Aksesuar', 'Solüsyon'],
          datasets: [{
            data: [
              Number(kategori?.GUNES_GOZLUGU?.ciro ?? kategori?.GUNES_GOZLUGU ?? 0),
              Number(kategori?.CAM?.ciro ?? kategori?.CAM ?? 0),
              Number(kategori?.LENS?.ciro ?? kategori?.LENS ?? 0),
              Number(kategori?.OPTIK_CERCEVE?.ciro ?? kategori?.OPTIK_CERCEVE ?? 0),
              Number(kategori?.AKSESUAR?.ciro ?? kategori?.AKSESUAR ?? 0),
              Number(kategori?.SOLUSYON?.ciro ?? kategori?.SOLUSYON ?? 0),
            ],
            backgroundColor: ['#A32D2D', '#185FA5', '#3B6D11', '#BA7517', '#6B3FA0', '#888780'],
            borderWidth: 0,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
        }}
      />
    </div>
  )
}

function BolgeLineChart({ gunluk }: { gunluk: { tarih: string; ciro: number }[] }) {
  return (
    <div style={{ position: 'relative', height: 160 }}>
      <Line
        data={{
          labels: gunluk.map((g) => g.tarih),
          datasets: [{
            label: 'Günlük Ciro',
            data: gunluk.map((g) => Number(g.ciro)),
            borderColor: BLUE,
            backgroundColor: 'rgba(24,95,165,0.1)',
            tension: 0.3,
            fill: true,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { ticks: chartCurrencyTicks } },
        }}
      />
    </div>
  )
}

function BolgeMudurDashboard({ user }: { user: User }) {
  const [ozet, setOzet] = useState<{
    netTotal: number
    nakit: number
    kart: number
    sgk: number
    acikHesap: number
    satisAdedi: number
    ortalamaSepet: number
    yeniMusteriSayisi: number
    subeBreakdown: SubeBreakdownRow[]
  } | null>(null)
  const [personel, setPersonel] = useState<{ ad: string; satisAdedi: number; ciro: number }[]>([])
  const [kategori, setKategori] = useState<Record<string, { ciro?: number }> | null>(null)
  const [gunluk, setGunluk] = useState<{ tarih: string; ciro: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [aktifSekme, setAktifSekme] = useState<BolgeSekme>('bolge')
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [customFrom, setCustomFrom] = useState(ayBaslangic())
  const [customTo, setCustomTo] = useState(bugun())
  const [filtre, setFiltre] = useState({ baslangic: ayBaslangic(), bitis: bugun() })
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [branchPersonel, setBranchPersonel] = useState<{ ad: string; satisAdedi: number; ciro: number }[]>([])
  const [personalReport, setPersonalReport] = useState<DailyReport | null>(null)
  const [personalDate, setPersonalDate] = useState(todayYMD())

  const sekmeler: { key: BolgeSekme; label: string }[] = [
    { key: 'bolge', label: 'Bölge Geneli' },
    { key: 'magazalar', label: 'Mağazalar' },
    { key: 'personel', label: 'Tüm Personel' },
    { key: 'kasa', label: 'Kasa Tablosu' },
    { key: 'benim', label: 'Benim Satışlarım' },
    { key: 'raporlar', label: 'Raporlar' },
  ]

  useEffect(() => {
    setFiltre(periodToDateStrings(period, customFrom, customTo))
  }, [period, customFrom, customTo])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = { baslangic: filtre.baslangic, bitis: filtre.bitis }
        const [o, p, k, g] = await Promise.all([
          apiClient.get('/reports/patron/ozet', { params }),
          apiClient.get('/reports/patron/personel', { params }),
          apiClient.get('/reports/patron/kategori', { params }),
          apiClient.get('/reports/patron/gunluk-seri', { params }),
        ])
        setOzet(o.data)
        setPersonel(p.data)
        setKategori(k.data)
        setGunluk(g.data)
        const branches: SubeBreakdownRow[] = o.data?.subeBreakdown ?? []
        if (branches.length && !selectedBranchId) {
          setSelectedBranchId(branches[0].branchId)
        }
      } catch (e) {
        console.error('Bölge müdürü veri yükleme hatası', e)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [filtre.baslangic, filtre.bitis])

  useEffect(() => {
    if (!selectedBranchId) return
    apiClient
      .get('/reports/patron/personel', {
        params: { baslangic: filtre.baslangic, bitis: filtre.bitis, subeId: selectedBranchId },
      })
      .then((r) => setBranchPersonel(r.data))
      .catch(() => setBranchPersonel([]))
  }, [selectedBranchId, filtre.baslangic, filtre.bitis])

  useEffect(() => {
    if (aktifSekme !== 'benim') return
    getPersonalDailyReport(personalDate).then(setPersonalReport).catch(() => setPersonalReport(null))
  }, [aktifSekme, personalDate])

  const maxSubeCiro = useMemo(
    () => Math.max(1, ...(ozet?.subeBreakdown ?? []).map((s) => s.ciro)),
    [ozet?.subeBreakdown],
  )
  const maxPersonelCiro = useMemo(
    () => Math.max(1, ...personel.map((p) => p.ciro)),
    [personel],
  )
  const selectedBranch = useMemo(
    () => (ozet?.subeBreakdown ?? []).find((s) => s.branchId === selectedBranchId) ?? null,
    [ozet?.subeBreakdown, selectedBranchId],
  )

  async function exportExcel() {
    try {
      const blob = await downloadExcel(filtre.bitis)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gunluk-kasa-${filtre.bitis}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Excel dışa aktarılamadı.')
    }
  }

  return (
    <div>
      <BolgeTabBar tabs={sekmeler} active={aktifSekme} onChange={setAktifSekme} />
      {loading ? <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Yükleniyor...</div> : null}

      {aktifSekme === 'bolge' && ozet ? (
        <div>
          <BolgeSectionHeader title="Bölge Geneli" showPdf />
          <PeriodFilter
            period={period}
            onPeriod={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFrom={setCustomFrom}
            onCustomTo={setCustomTo}
          />
          <BolgeMetricCards
            items={[
              { label: 'Bölge Ciro', value: formatMoney(ozet.netTotal) },
              { label: 'Nakit', value: formatMoney(ozet.nakit) },
              { label: 'Kart', value: formatMoney(ozet.kart) },
              { label: 'SGK', value: formatMoney(ozet.sgk) },
              { label: 'Açık Hesap', value: formatMoney(ozet.acikHesap) },
              { label: 'Satış Adedi', value: String(ozet.satisAdedi) },
              { label: 'Ort. Sepet', value: formatMoney(ozet.ortalamaSepet) },
              { label: 'Yeni Müşteri', value: String(ozet.yeniMusteriSayisi) },
            ]}
          />
          <div style={{ ...CARD_STYLE, marginTop: 16 }}>
            <div style={{ fontWeight: 800, marginBottom: 12, color: BLUE }}>Mağaza karşılaştırması</div>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: 8 }}>Mağaza</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Satış</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Ciro</th>
                  <th style={{ padding: 8, minWidth: 120 }}>İlerleme</th>
                </tr>
              </thead>
              <tbody>
                {(ozet.subeBreakdown ?? []).map((s) => (
                  <tr key={s.branchId} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                    <td style={{ padding: 8 }}>{s.subeAdi}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{s.satisAdedi}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, color: BLUE }}>{formatMoney(s.ciro)}</td>
                    <td style={{ padding: 8 }}><IlerlemeCubugu value={s.ciro} max={maxSubeCiro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ ...CARD_STYLE, marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Günlük ciro trendi</div>
            <BolgeLineChart gunluk={gunluk} />
          </div>
          <div style={{ marginTop: 16 }}>
            <HedefBar current={ozet.netTotal} target={500000} label="Aylık hedef (placeholder)" />
          </div>
        </div>
      ) : null}

      {aktifSekme === 'magazalar' && ozet ? (
        <div>
          <BolgeSectionHeader title="Mağazalar" showPdf />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {(ozet.subeBreakdown ?? []).map((s) => (
              <button
                key={s.branchId}
                type="button"
                onClick={() => setSelectedBranchId(s.branchId)}
                style={{
                  ...BTN_STYLE,
                  borderColor: selectedBranchId === s.branchId ? BLUE : '#e5e7eb',
                  color: selectedBranchId === s.branchId ? BLUE : '#374151',
                  backgroundColor: selectedBranchId === s.branchId ? '#eff6ff' : 'white',
                }}
              >
                {s.subeAdi}
              </button>
            ))}
          </div>
          {selectedBranch ? (
            <>
              <BolgeMetricCards
                items={[
                  { label: 'Ciro', value: formatMoney(selectedBranch.ciro) },
                  { label: 'Satış Adedi', value: String(selectedBranch.satisAdedi) },
                  { label: 'Ort. Sepet', value: formatMoney(selectedBranch.satisAdedi ? selectedBranch.ciro / selectedBranch.satisAdedi : 0) },
                ]}
              />
              <div style={{ ...CARD_STYLE, marginTop: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 12 }}>Personel — {selectedBranch.subeAdi}</div>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: 8 }}>Ad</th>
                      <th style={{ textAlign: 'right', padding: 8 }}>Satış</th>
                      <th style={{ textAlign: 'right', padding: 8 }}>Ciro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchPersonel.length === 0 ? (
                      <tr><td colSpan={3} style={{ padding: 16, color: '#9ca3af' }}>Kayıt yok.</td></tr>
                    ) : null}
                    {branchPersonel.map((p) => (
                      <tr key={p.ad} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                        <td style={{ padding: 8 }}>{p.ad}</td>
                        <td style={{ padding: 8, textAlign: 'right' }}>{p.satisAdedi}</td>
                        <td style={{ padding: 8, textAlign: 'right', fontWeight: 700 }}>{formatMoney(p.ciro)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ color: '#6b7280', fontSize: 13 }}>Mağaza seçin veya veri yükleniyor.</div>
          )}
        </div>
      ) : null}

      {aktifSekme === 'personel' ? (
        <div>
          <BolgeSectionHeader title="Tüm Personel" showPdf />
          <PeriodFilter
            period={period}
            onPeriod={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFrom={setCustomFrom}
            onCustomTo={setCustomTo}
          />
          <div style={CARD_STYLE}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                  <th style={{ textAlign: 'left', padding: 8 }}>Ad</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Satış</th>
                  <th style={{ textAlign: 'right', padding: 8 }}>Ciro</th>
                  <th style={{ padding: 8, minWidth: 120 }}>İlerleme</th>
                </tr>
              </thead>
              <tbody>
                {personel.map((p) => (
                  <tr key={p.ad} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                    <td style={{ padding: 8 }}>{p.ad}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{p.satisAdedi}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 700, color: BLUE }}>{formatMoney(p.ciro)}</td>
                    <td style={{ padding: 8 }}><IlerlemeCubugu value={p.ciro} max={maxPersonelCiro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {aktifSekme === 'kasa' ? (
        <div>
          <BolgeSectionHeader title="Kasa Tablosu" showPdf />
          <div style={{ ...CARD_STYLE, color: '#6b7280', fontSize: 13 }}>
            Kasa tablosu yakında — şube bazlı günlük kasa
          </div>
        </div>
      ) : null}

      {aktifSekme === 'benim' ? (
        <GunlukKasaView report={personalReport} date={personalDate} onDateChange={setPersonalDate} branchId={user.branchId} />
      ) : null}

      {aktifSekme === 'raporlar' && ozet ? (
        <div>
          <BolgeSectionHeader title="Raporlar" showPdf />
          <PeriodFilter
            period={period}
            onPeriod={setPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFrom={setCustomFrom}
            onCustomTo={setCustomTo}
          />
          <BolgeMetricCards
            items={[
              { label: 'Bölge Ciro', value: formatMoney(ozet.netTotal) },
              { label: 'Satış Adedi', value: String(ozet.satisAdedi) },
              { label: 'Ort. Sepet', value: formatMoney(ozet.ortalamaSepet) },
              { label: 'Yeni Müşteri', value: String(ozet.yeniMusteriSayisi) },
            ]}
          />
          <div style={{ ...CARD_STYLE, marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Kategori dağılımı</div>
            <BolgeKategoriDoughnut kategori={kategori} />
          </div>
          <div style={{ ...CARD_STYLE, marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Günlük trend</div>
            <BolgeLineChart gunluk={gunluk} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button type="button" onClick={() => void exportExcel()} style={{ ...BTN_STYLE, color: GREEN, borderColor: GREEN }}>
              Excel dışa aktar
            </button>
            <button type="button" onClick={handlePrint} style={{ ...PDF_BTN_STYLE, color: BLUE, borderColor: BLUE }}>
              PDF al
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const role = user?.role

  if (!user) return <div style={{ padding: 24, color: '#6b7280' }}>Oturum bilgisi yükleniyor...</div>
  if (role === 'SALES_STAFF') return <PersonelDashboard user={user} />
  if (role === 'STORE_MANAGER') return <MudurDashboard user={user} />
  if (role === 'REGIONAL_MANAGER') return <BolgeMudurDashboard user={user} />
  return <MudurDashboard user={user} />
}
