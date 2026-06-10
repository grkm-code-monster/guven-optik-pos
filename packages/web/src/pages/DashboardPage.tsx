import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../store/auth.store'
import { apiClient } from '../api/client'
import { getDailyReport, getPersonalDailyReport, downloadExcel } from '../api/reports.api'
import { getCurrentShift } from '../api/shifts.api'
import type { DailyReport, User } from '../api/types'

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

function discountPct(gross?: string, discount?: string) {
  const g = Number(gross ?? 0)
  const d = Number(discount ?? 0)
  if (!g) return '—'
  return `${((d / g) * 100).toFixed(1)}%`
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

function SectionHeader({ title, showPdf }: { title: string; showPdf?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111' }}>{title}</h2>
      {showPdf ? (
        <button type="button" onClick={handlePrint} style={PDF_BTN_STYLE}>
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

function GunlukKasaTable({
  rows,
  showRep,
}: {
  rows: SalesDetailRow[]
  showRep?: boolean
}) {
  const cols = [
    'Alışveriş Tarihi',
    'Teslim Tarihi',
    'Müşteri',
    'Ürün Kalemleri',
    'Brüt Tutar',
    'Sipariş Bedeli',
    'Vergi Hariç',
    'İsk.%',
    'Nakit',
    'Taksit',
    'Oran',
    'Slip Top.',
    'Banka Kom.',
    'Reçete Bed.',
    'Müşteri Saati',
    'Kaçıncı Satışı',
    ...(showRep ? ['Temsilci'] : []),
  ]

  const totals = rows.reduce(
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

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                style={{
                  textAlign: 'left',
                  padding: '8px 6px',
                  borderBottom: '0.5px solid #e5e7eb',
                  fontSize: 11,
                  color: '#6b7280',
                  whiteSpace: 'nowrap',
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length} style={{ padding: 16, color: '#9ca3af' }}>
                Kayıt yok.
              </td>
            </tr>
          ) : null}
          {rows.map((s, idx) => (
            <tr key={s.saleId} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
              <td style={{ padding: '8px 6px' }}>{fmtDate(s.createdAt)}</td>
              <td style={{ padding: '8px 6px' }}>{s.deliveryDate ? fmtDate(s.deliveryDate) : '—'}</td>
              <td style={{ padding: '8px 6px' }}>{s.customerName}</td>
              <td style={{ padding: '8px 6px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.itemSummary || '—'}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(s.grossTotal)}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(s.netTotal)}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(s.taxExcluded)}</td>
              <td style={{ padding: '8px 6px' }}>{s.discountPct}%</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(s.cashAmount)}</td>
              <td style={{ padding: '8px 6px' }}>{s.cardPayments[0]?.installment ?? '—'}</td>
              <td style={{ padding: '8px 6px' }}>{s.cardPayments[0]?.bankName ?? '—'}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(cardSlipTotal(s))}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(cardCommissionTotal(s))}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(s.sgkAmount)}</td>
              <td style={{ padding: '8px 6px' }}>{fmtTime(s.createdAt)}</td>
              <td style={{ padding: '8px 6px' }}>{idx + 1}</td>
              {showRep ? (
                <td style={{ padding: '8px 6px' }}>{s.repName}</td>
              ) : null}
            </tr>
          ))}
          {rows.length > 0 ? (
            <tr style={{ fontWeight: 800, background: '#fafafa' }}>
              <td colSpan={4} style={{ padding: '8px 6px' }}>
                Toplam
              </td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(totals.gross)}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(totals.net)}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(totals.taxFree)}</td>
              <td style={{ padding: '8px 6px' }}>
                {totals.gross ? `${((totals.discount / totals.gross) * 100).toFixed(1)}%` : '—'}
              </td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(totals.cash)}</td>
              <td colSpan={2} style={{ padding: '8px 6px' }} />
              <td style={{ padding: '8px 6px' }}>{formatMoney(totals.slip)}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(totals.commission)}</td>
              <td style={{ padding: '8px 6px' }}>{formatMoney(totals.sgk)}</td>
              <td colSpan={showRep ? 3 : 2} style={{ padding: '8px 6px' }} />
            </tr>
          ) : null}
        </tbody>
      </table>
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
}: {
  report: DailyReport | null
  date: string
  onDateChange?: (d: string) => void
  showRep?: boolean
  repFilter?: string | null
  onRepFilter?: (name: string | null) => void
}) {
  const filtered = useMemo(() => {
    const rows = report?.salesDetail ?? []
    if (!repFilter) return rows
    return rows.filter((s) => s.repName === repFilter)
  }, [report?.salesDetail, repFilter])

  const hasShift = reportHasShift(report)

  return (
    <div>
      <SectionHeader
        title={`${report?.branchName ?? 'Şube'} — ${fmtDate(date)}`}
        showPdf
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
              { label: 'Brüt Ciro', value: formatMoney(report?.totalSales ?? report?.netCiro) },
              { label: 'Sipariş Bedeli', value: formatMoney(report?.totalNet) },
              { label: 'Nakit Giriş', value: formatMoney(report?.cashIn) },
              { label: 'Slip Toplamı', value: formatMoney(report?.cardGross) },
              { label: 'İskonto %', value: discountPct(report?.totalSales, report?.totalDiscount) },
              { label: 'Satış Adedi', value: String(report?.saleCount ?? report?.satisAdedi ?? 0) },
            ]}
          />
          <div style={{ marginTop: 16 }}>
            <GunlukKasaTable rows={filtered} showRep={showRep} />
          </div>
        </>
      ) : null}
    </div>
  )
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

  useEffect(() => {
    getPersonalDailyReport(date).then(setReport).catch(() => setReport(null))
  }, [date])

  useEffect(() => {
    async function fetchPersonelGorevler() {
      try {
        const deliveryRes = await apiClient.get('/sales/delivery')
        const deliverySales = deliveryRes.data?.data ?? []
        const mySales = deliverySales.filter((s: { userId?: string }) => s.userId === user.id)
        const teslimHazir = mySales.filter((s: { items?: { status: string }[] }) =>
          s.items?.some((i) => i.status === 'READY'),
        ).length
        setPersonelGorevler({ teslimHazir, loading: false })
      } catch (e) {
        console.error('Personel görevler fetch error', e)
        setPersonelGorevler((prev) => ({ ...prev, loading: false }))
      }
    }
    void fetchPersonelGorevler()
  }, [user.id])

  const tabs = ['Günlük Kasa', 'Performans & Görevler', 'Profilim']

  return (
    <div>
      {!shiftId || !reportHasShift(report) ? <VardiyaKapaliBanner /> : null}
      <TabBar tabs={tabs} active={tab} onChange={setTab} />
      {tab === 0 ? (
        <GunlukKasaView report={report} date={date} onDateChange={setDate} />
      ) : null}
      {tab === 1 ? (
        <div>
          <SectionHeader title="Performans & Görevler" showPdf />
          <PeriodFilter period={period} onPeriod={setPeriod} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} />
          <div style={{ ...CARD_STYLE, marginBottom: 16, borderLeft: `4px solid ${BLUE}` }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Bugün ne yapmalıyım?</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Laboratuvara gönderilmedi — yakında</div>
            <GorevSatiri
              label="Teslim için hazır, müşteri aranmadı"
              count={personelGorevler.teslimHazir}
              loading={personelGorevler.loading}
            />
            <div style={{ fontSize: 13, color: '#6b7280', paddingTop: 8 }}>Açık garanti — yakında</div>
          </div>
          <HedefBar current={Number(report?.totalNet ?? 0)} target={50000} label="Günlük hedef" />
          <div style={{ marginTop: 16 }}>
            <MetricCards items={[{ label: 'Ortalama Sepet', value: formatMoney(report?.ortalamaSepet) }]} />
          </div>
          <div style={{ marginTop: 16, ...CARD_STYLE }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Kategori dağılımı</div>
            <KategoriBars report={report} />
          </div>
          <div style={{ marginTop: 16, ...CARD_STYLE, color: '#6b7280' }}>
            <div style={{ fontWeight: 700, color: '#111', marginBottom: 6 }}>Prim durumu</div>
            Prim hesaplaması yakında aktif olacak.
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
            <div style={{ fontWeight: 700, marginBottom: 8 }}>SGK & İK belgeleri</div>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Yönetim tarafından yüklenir.</p>
          </div>
          <button type="button" style={{ ...BTN_STYLE, marginTop: 16, color: BLUE, borderColor: BLUE }}>
            Güncelleme talep et
          </button>
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
    loading: true,
  })

  const tabs = ['Mağaza Özeti', 'Günlük Kasa', 'Benim Satışlarım', 'Görevler', 'Personel', 'Raporlar']

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

        setGorevler({
          labBekleyen,
          teslimHazir,
          acikGaranti,
          vadesiGecenAcikHesap,
          loading: false,
        })
      } catch (e) {
        console.error('Görevler fetch error', e)
        setGorevler((prev) => ({ ...prev, loading: false }))
      }
    }
    void fetchGorevler()
  }, [])

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
        />
      ) : null}

      {tab === 2 ? (
        <GunlukKasaView report={personalReport} date={date} onDateChange={setDate} />
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
          <div style={{ ...CARD_STYLE, marginBottom: 16, color: '#6b7280' }}>
            <div style={{ fontWeight: 700, color: '#111', marginBottom: 6 }}>Görevli & vekalet</div>
            Yönetim panelinden atanacak (sonraki sprint).
          </div>
          <div style={CARD_STYLE}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Aylık personel performans</div>
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
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatMoney(r.ciro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === 5 ? (
        <div>
          <SectionHeader title="Raporlar" showPdf />
          <PeriodFilter period={period} onPeriod={setPeriod} customFrom={customFrom} customTo={customTo} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} />
          <MetricCards
            items={[
              { label: 'Net Ciro', value: formatMoney(report?.netCiro) },
              { label: 'Satış Adedi', value: String(report?.saleCount ?? 0) },
              { label: 'Ort. Sepet', value: formatMoney(report?.ortalamaSepet) },
              { label: 'İskonto', value: formatMoney(report?.totalDiscount) },
            ]}
          />
          <div style={{ ...CARD_STYLE, marginTop: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Kategori dağılımı</div>
            <KategoriBars report={report} />
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

function BolgeMudurDashboard() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
      <h2>Bölge Müdürü Paneli</h2>
      <p>Bu ekran yakında aktif olacak.</p>
    </div>
  )
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const role = user?.role

  if (!user) return <div style={{ padding: 24, color: '#6b7280' }}>Oturum bilgisi yükleniyor...</div>
  if (role === 'SALES_STAFF') return <PersonelDashboard user={user} />
  if (role === 'STORE_MANAGER') return <MudurDashboard user={user} />
  if (role === 'REGIONAL_MANAGER') return <BolgeMudurDashboard />
  return <MudurDashboard user={user} />
}
