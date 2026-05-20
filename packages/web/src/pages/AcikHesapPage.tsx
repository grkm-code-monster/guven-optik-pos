import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { apiClient } from '../api/client'

type Row = {
  customer: { id: string; name: string; phone: string }
  totalDebt: number
  paidAmount: number
  remainingDebt: number
}

const cardStyle: CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
}

const danger = '#c0392b'
const primary = '#C8102E'

export default function AcikHesapPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [selected, setSelected] = useState<Row | null>(null)

  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState<'CASH' | 'CARD' | 'HAVALE'>('CASH')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const totals = useMemo(() => {
    const customerCount = rows.length
    const totalRemaining = rows.reduce((acc, r) => acc + Number(r.remainingDebt || 0), 0)
    return { customerCount, totalRemaining }
  }, [rows])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/open-account')
      const list = res.data?.data ?? []
      setRows(Array.isArray(list) ? list : [])
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Açık hesaplar alınamadı')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openPaymentModal(r: Row) {
    setSelected(r)
    setAmount('')
    setPaymentType('CASH')
    setNote('')
    setModalOpen(true)
  }

  async function submitPayment() {
    if (!selected) return
    const n = Number(String(amount).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setError('Tutar geçerli olmalı.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiClient.post('/open-account/payment', {
        customerId: selected.customer.id,
        amount: n,
        paymentType,
        note: note?.trim() || null,
      })
      setModalOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Ödeme kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontWeight: 900, fontSize: 18 }}>Açık Hesap</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280' }}>Açık hesap müşteri</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{totals.customerCount}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280' }}>Toplam açık bakiye</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: danger }}>
            {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(totals.totalRemaining)}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontWeight: 900 }}>Müşteriler</div>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
              borderRadius: 10,
              padding: '8px 12px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            Yenile
          </button>
        </div>

        {error ? <div style={{ marginTop: 10, color: danger, fontSize: 13 }}>{error}</div> : null}
        {loading ? <div style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>Yükleniyor...</div> : null}

        {!loading ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>Açık hesap bulunamadı.</div>
            ) : null}
            {rows.map((r) => (
              <div
                key={r.customer.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, color: '#111' }}>{r.customer.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{r.customer.phone}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 800 }}>Toplam borç</div>
                    <div style={{ fontWeight: 900 }}>
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(r.totalDebt)}
                    </div>
                  </div>
                  <div
                    style={{
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: danger,
                      padding: '6px 10px',
                      borderRadius: 999,
                      fontWeight: 900,
                      fontSize: 12,
                      minWidth: 110,
                      textAlign: 'center',
                    }}
                  >
                    {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(r.remainingDebt)}
                  </div>
                  <button
                    type="button"
                    onClick={() => openPaymentModal(r)}
                    style={{
                      backgroundColor: '#16a34a',
                      color: 'white',
                      border: 'none',
                      borderRadius: 10,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontWeight: 900,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Ödeme Gir
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {modalOpen && selected ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div style={{ ...cardStyle, width: '100%', maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontWeight: 900 }}>Ödeme Gir</div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  borderRadius: 10,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                Kapat
              </button>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.06em' }}>MÜŞTERİ</div>
                <div style={{ fontWeight: 900, marginTop: 4 }}>{selected.customer.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{selected.customer.phone}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.06em' }}>KALAN BORÇ</div>
                <div style={{ fontWeight: 900, marginTop: 4, color: danger }}>
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(selected.remainingDebt)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <label>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.06em', marginBottom: 6 }}>
                  TUTAR
                </div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    outline: 'none',
                    fontSize: 14,
                  }}
                />
              </label>

              <label>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.06em', marginBottom: 6 }}>
                  ÖDEME TİPİ
                </div>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    outline: 'none',
                    fontSize: 14,
                    backgroundColor: 'white',
                  }}
                >
                  <option value="CASH">Nakit</option>
                  <option value="CARD">Kart</option>
                  <option value="HAVALE">Havale</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'block', marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.06em', marginBottom: 6 }}>
                NOT (opsiyonel)
              </div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Not"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  outline: 'none',
                  fontSize: 14,
                }}
              />
            </label>

            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  flex: 1,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  fontWeight: 900,
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitPayment()}
                style={{
                  flex: 1,
                  border: 'none',
                  backgroundColor: primary,
                  color: 'white',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  fontWeight: 900,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

