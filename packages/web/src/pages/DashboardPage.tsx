import { useEffect, useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
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

export default function DashboardPage() {
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
      Promise.allSettled([getSales({ status: 'ORDERED' }), getSales({ status: 'IN_LAB' })]).then((r) => {
        const list: any[] = []
        for (const x of r) {
          if (x.status === 'fulfilled') list.push(...x.value)
        }
        setSales(list.slice(0, 10))
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { title: 'Toplam Satış', value: formatMoney(report?.totalSales), hint: 'Brüt' },
          { title: 'Net Ciro', value: formatMoney(report?.totalNet), hint: 'Net' },
          { title: 'Komisyon', value: formatMoney(report?.totalCommission), hint: 'Kart' },
          { title: 'Beklenen Kasa', value: formatMoney(report?.expectedCash), hint: 'Kasa' },
        ].map((k) => (
          <div
            key={k.title}
            style={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 700,
              }}
            >
              {k.title}
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#111', marginTop: '6px' }}>{k.value}</div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-bold">Açık Satışlar</div>
          <a className="text-sm font-semibold text-brand-red hover:underline" href="#">
            Tümü →
          </a>
        </div>
        <div className="space-y-2">
          {sales.length === 0 ? <div className="text-sm text-gray-500">Kayıt yok.</div> : null}
          {sales.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{s.customer?.name ?? '—'}</div>
                <div className="text-xs text-gray-500 truncate">{s.itemsCount ? `${s.itemsCount} kalem` : ''}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge status={s.status} />
                <div className="text-sm font-bold">{formatMoney(s.netTotal)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Button onClick={() => (window.location.href = '/sales/new')}>+ Yeni Satış</Button>
        <Button
          variant="secondary"
          onClick={() => {
            setCashError(null)
            setCashModalOpen(true)
          }}
        >
          Kasa Hareketi
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setCustError(null)
            setCustQ('')
            setCustResults([])
            setCustomerModalOpen(true)
          }}
        >
          Müşteri Ara
        </Button>
        <Button variant="secondary" onClick={() => (window.location.href = '/reports')}>
          Raporlar
        </Button>
      </div>

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

