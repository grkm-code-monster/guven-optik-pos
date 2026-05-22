import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { apiClient } from '../api/client'
import { searchCustomers } from '../api/customers.api'
import { getDailyReport } from '../api/reports.api'
import { getSales } from '../api/sales.api'
import { getCurrentShift } from '../api/shifts.api'

function formatMoney(v?: string) {
  if (!v) return '-'
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
}

function todayYMD() {
  return new Date().toISOString().split('T')[0]
}

function todayRangeLocal() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() }
}

function SaleStatusBadge({ status }: { status: string }) {
  const s = status?.toUpperCase?.() ?? ''
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PAID: { label: 'Tamamlandı', bg: '#d1fae5', color: '#065f46' },
    DELIVERED: { label: 'Tamamlandı', bg: '#d1fae5', color: '#065f46' },
    ORDERED: { label: 'Laboratuvara Gönderildi', bg: '#fef3c7', color: '#92400e' },
    IN_LAB: { label: 'Laboratuvara Gönderildi', bg: '#fef3c7', color: '#92400e' },
    DRAFT: { label: 'Beklemede', bg: '#f3f4f6', color: '#374151' },
    PENDING: { label: 'Beklemede', bg: '#f3f4f6', color: '#374151' },
    READY: { label: 'Hazır', bg: '#dbeafe', color: '#1e40af' },
  }
  const c = map[s] ?? { label: status || '—', bg: '#f3f4f6', color: '#374151' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        backgroundColor: c.bg,
        color: c.color,
        padding: '3px 10px',
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {c.label}
    </span>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const shiftId = useAuthStore((s) => s.shiftId)
  const user = useAuthStore((s) => s.user)

  const [report, setReport] = useState<any>(null)
  const [sales, setSales] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [shift, setShift] = useState<any | null>(null)
  const [shiftLoading, setShiftLoading] = useState(false)

  const [cashModalOpen, setCashModalOpen] = useState(false)
  const [cashType, setCashType] = useState<'CASH_IN' | 'CASH_OUT' | 'ADVANCE'>('CASH_IN')
  const [cashAmount, setCashAmount] = useState('')
  const [cashDesc, setCashDesc] = useState('')
  const [cashSaving, setCashSaving] = useState(false)
  const [cashError, setCashError] = useState<string | null>(null)

  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [custQ, setCustQ] = useState('')
  const [custResults, setCustResults] = useState<any[]>([])
  const [custLoading, setCustLoading] = useState(false)
  const [custError, setCustError] = useState<string | null>(null)

  const shiftBanner = useMemo(() => {
    if (!shiftId) return null
    if (shiftLoading) return { text: 'Vardiya bilgisi yükleniyor...', since: '' }
    if (shift?.openedAt) {
      const opened = new Date(shift.openedAt)
      const now = new Date()
      const diffMs = now.getTime() - opened.getTime()
      const hours = Math.floor(diffMs / 3600000)
      const minutes = Math.floor((diffMs % 3600000) / 60000)
      const durationText = `${hours}s ${minutes}dk önce açıldı`
      return { text: 'Vardiya Açık', since: durationText }
    }
    return { text: 'Vardiya Açık', since: 'Vardiya bilgisi yükleniyor...' }
  }, [shiftId, shiftLoading, shift?.openedAt])

  useEffect(() => {
    const date = todayYMD()
    setError(null)
    if (shiftId) {
      setShiftLoading(true)
      getCurrentShift()
        .then((s) => setShift(s))
        .catch((e: any) => console.error('Dashboard shift API error', e))
        .finally(() => setShiftLoading(false))
    }
    Promise.all([
      getDailyReport(date)
        .then(setReport)
        .catch((e: any) => {
          console.error('Dashboard report API error', e)
          setReport(null)
        }),
      getSales(todayRangeLocal())
        .then((list) => {
          console.log('[Dashboard] open sales', list)
          const open = (list ?? []).filter((s) => s.status !== 'VOID')
          setSales(open.slice(0, 20))
        })
        .catch((e: any) => {
          console.error('Dashboard open sales API error', e)
          setSales([])
        }),
    ]).catch((e: any) => {
      console.error('Dashboard API error', e)
    })
  }, [])

  useEffect(() => {
    if (!customerModalOpen) return
    const q = custQ.trim()
    if (q.length < 3) {
      setCustResults([])
      return
    }
    const t = setTimeout(() => {
      setCustLoading(true)
      setCustError(null)
      searchCustomers(q)
        .then(setCustResults)
        .catch((e: any) => {
          console.error('Customer search error', e)
          setCustError(e?.response?.data?.message ?? 'Müşteri araması başarısız')
          setCustResults([])
        })
        .finally(() => setCustLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [custQ, customerModalOpen])

  async function saveCashMovement() {
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
      await apiClient.post('/cash-movements', {
        type: cashType,
        amount,
        description,
      })
      setCashModalOpen(false)
      setCashAmount('')
      setCashDesc('')
    } catch (e: any) {
      console.error('Cash movement save error', e)
      setCashError(e?.response?.data?.message ?? 'Kasa hareketi kaydedilemedi')
    } finally {
      setCashSaving(false)
    }
  }

  const canClose = user?.role === 'STORE_MANAGER' || user?.role === 'ADMIN'

  return (
    <div className="space-y-4">
      {shiftBanner ? (
        <div
          style={{
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            borderRadius: '10px',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div>
            <div style={{ color: '#16a34a', fontWeight: 700 }}>{shiftBanner.text}</div>
            <div style={{ color: '#16a34a', opacity: 0.9, fontSize: '13px' }}>Vardiya {shiftBanner.since}</div>
          </div>
          {canClose ? (
            <button
              type="button"
              style={{
                backgroundColor: '#C8102E',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Gün Sonu Kapat
            </button>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          Aktif vardiya yok. Müdür hesabıyla vardiya açmanız gerekebilir.
        </div>
      )}

      {error ? <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '14px',
            overflow: 'hidden',
          }}
        >
            {[
              { title: 'Toplam Ciro', value: formatMoney(report?.netCiro) },
              { title: 'Kasa Nakit', value: formatMoney(report?.kasaNakit) },
              { title: 'Toplam Banka', value: formatMoney(report?.toplamBanka) },
              { title: 'Beklenen Kasa', value: formatMoney(report?.expectedCash) },
            ].map((k) => (
              <div
                key={k.title}
                style={{
                  flex: '1 1 180px',
                  minWidth: 0,
                  maxWidth: '100%',
                  backgroundColor: 'white',
                  borderRadius: '14px',
                  padding: '22px 20px',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
                  border: '1px solid #f3f4f6',
                  borderTop: '4px solid #B91C1C',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 700,
                  }}
                >
                  {k.title}
                </div>
                <div
                  style={{
                    fontSize: 'clamp(1.2rem, 2.5vw, 1.8rem)',
                    fontWeight: 800,
                    color: '#B91C1C',
                    marginTop: '10px',
                    lineHeight: 1.1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {k.value}
                </div>
              </div>
            ))}
        </div>

        <div
          className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]"
          style={{ gap: '16px', alignItems: 'start', overflow: 'hidden' }}
        >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              overflow: 'hidden',
            }}
          >
            {[
              { title: 'Satış Adedi', value: String(report?.satisAdedi ?? report?.saleCount ?? 0) },
              { title: 'Ortalama Sepet', value: formatMoney(report?.ortalamaSepet) },
              { title: 'SGK Hakkı', value: formatMoney(report?.toplamSgkHakki) },
              { title: 'Vakıf Ödemesi', value: formatMoney(report?.toplamVakifOdemesi) },
            ].map((k) => (
              <div
                key={k.title}
                style={{
                  flex: '1 1 140px',
                  minWidth: 0,
                  maxWidth: '100%',
                  backgroundColor: 'white',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                  border: '1px solid #f3f4f6',
                  overflow: 'hidden',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {k.title}
                </div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#111827', marginTop: '8px' }}>{k.value}</div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#374151', marginBottom: '10px' }}>Kategori Dağılımı</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '10px',
              }}
            >
              {(
                [
                  ['GUNES_GOZLUGU', 'Güneş Gözlüğü'],
                  ['CAM', 'Cam'],
                  ['LENS', 'Lens'],
                  ['OPTIK_CERCEVE', 'Çerçeve'],
                  ['AKSESUAR', 'Aksesuar'],
                  ['SOLUSYON', 'Solüsyon'],
                ] as const
              ).map(([key, label]) => (
                <div
                  key={key}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    padding: '14px 12px',
                    textAlign: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    border: '1px solid #f3f4f6',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280' }}>{label}</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#B91C1C', marginTop: '6px' }}>
                    {report?.kategoriBreakdown?.[key] ?? 0}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '14px',
            padding: '16px',
            boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
            border: '1px solid #f3f4f6',
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#B91C1C', marginBottom: '12px' }}>Personel</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: '8px',
              fontSize: '11px',
              fontWeight: 700,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              paddingBottom: '8px',
              borderBottom: '1px solid #f3f4f6',
            }}
          >
            <div>Temsilci</div>
            <div style={{ textAlign: 'right' }}>Adet</div>
            <div style={{ textAlign: 'right' }}>Ciro</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', maxHeight: '420px', overflow: 'auto' }}>
            {(report?.temsilciBreakdown ?? []).length === 0 ? (
              <div style={{ fontSize: '13px', color: '#9ca3af' }}>Kayıt yok.</div>
            ) : null}
            {(report?.temsilciBreakdown ?? []).map((r: { repName: string; saleCount: number; ciro: string }) => (
              <div
                key={`${r.repName}-${r.saleCount}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: '8px',
                  alignItems: 'center',
                  fontSize: '13px',
                }}
              >
                <div style={{ fontWeight: 700, color: '#111827', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.repName}
                </div>
                <div style={{ fontWeight: 800, color: '#374151', textAlign: 'right' }}>{r.saleCount}</div>
                <div style={{ fontWeight: 800, color: '#B91C1C', textAlign: 'right' }}>{formatMoney(r.ciro)}</div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>

      <div
        style={{
          marginTop: '16px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          backgroundColor: 'white',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'white',
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '1rem', color: '#111' }}>Açık Satışlar</div>
          <a
            href="#"
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#c0392b',
              textDecoration: 'none',
            }}
          >
            Tümü →
          </a>
        </div>
        {sales.length === 0 ? (
          <div style={{ padding: '14px 20px', fontSize: '0.875rem', color: '#6b7280' }}>Kayıt yok.</div>
        ) : null}
        {sales.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate(`/sales/${s.id}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '14px 20px',
              border: 'none',
              borderBottom: '1px solid #f3f4f6',
              backgroundColor: 'white',
              cursor: 'pointer',
              transition: 'background 0.15s',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#fafafa'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white'
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  color: '#111',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.customer?.name ?? '—'}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                {s.itemsCount ? `${s.itemsCount} kalem` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: '12px' }}>
              <SaleStatusBadge status={s.status} />
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111' }}>{formatMoney(s.netTotal)}</div>
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setCashError(null)
          setCashModalOpen(true)
        }}
        style={{
          width: '100%',
          padding: '14px 20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          backgroundColor: 'white',
          fontWeight: 600,
          fontSize: '0.95rem',
          color: '#111',
          cursor: 'pointer',
          marginTop: '12px',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#fafafa'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'white'
        }}
      >
        Kasa Hareketi
      </button>

      {/* KASA HAREKETİ MODAL */}
      {cashModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: 'white',
              borderRadius: '14px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontWeight: 900 }}>Kasa Hareketi</div>
              <button
                type="button"
                onClick={() => setCashModalOpen(false)}
                style={{
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Kapat
              </button>
            </div>

            {cashError ? <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px' }}>{cashError}</div> : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginTop: '12px' }}>
              <label>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                  Tür
                </div>
                <select
                  value={cashType}
                  onChange={(e) => setCashType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'white',
                  }}
                >
                  <option value="CASH_IN">Nakit Giriş</option>
                  <option value="CASH_OUT">Nakit Çıkış</option>
                  <option value="ADVANCE">Avans</option>
                </select>
              </label>

              <label>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                  Tutar
                </div>
                <input
                  inputMode="decimal"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', outline: 'none' }}
                />
              </label>

              <label>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                  Açıklama
                </div>
                <input
                  value={cashDesc}
                  onChange={(e) => setCashDesc(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '14px', outline: 'none' }}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void saveCashMovement()}
              disabled={cashSaving}
              style={{
                width: '100%',
                marginTop: '14px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#C8102E',
                color: 'white',
                cursor: cashSaving ? 'not-allowed' : 'pointer',
                fontWeight: 900,
                opacity: cashSaving ? 0.6 : 1,
              }}
            >
              Kaydet
            </button>
          </div>
        </div>
      ) : null}

      {/* MÜŞTERİ ARA MODAL */}
      {customerModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: 'white',
              borderRadius: '14px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              padding: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontWeight: 900 }}>Müşteri Ara</div>
              <button
                type="button"
                onClick={() => setCustomerModalOpen(false)}
                style={{
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Kapat
              </button>
            </div>

            <div style={{ marginTop: '12px' }}>
              <input
                value={custQ}
                onChange={(e) => setCustQ(e.target.value)}
                placeholder="Telefon veya ad (min 3 karakter)"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>

            {custError ? <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px' }}>{custError}</div> : null}
            {custLoading ? <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '10px' }}>Aranıyor...</div> : null}

            <div style={{ marginTop: '10px', maxHeight: '320px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {custResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: '14px', color: '#111' }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{c.phone}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

