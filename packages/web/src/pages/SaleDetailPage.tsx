import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiClient } from '../api/client'
import { getSaleById, voidSale } from '../api/sales.api'

const cardStyle: CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
}

const pageWrap: CSSProperties = {
  maxWidth: 900,
  margin: '0 auto',
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const danger = '#c0392b'
const primary = '#C8102E'

function money(v?: string | number | null) {
  const n = Number(v ?? 0)
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
    Number.isFinite(n) ? n : 0,
  )
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR')
  } catch {
    return iso
  }
}

function headerSaleStatusBadge(status: string) {
  const s = status?.toUpperCase?.() ?? ''
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PAID: { label: 'Ödendi', bg: '#22c55e', color: '#fff' },
    DRAFT: { label: 'Taslak', bg: '#f97316', color: '#fff' },
    VOID: { label: 'İptal', bg: '#9ca3af', color: '#fff' },
  }
  const c = map[s] ?? { label: status, bg: '#6b7280', color: '#fff' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: c.bg,
        color: c.color,
        padding: '10px 18px',
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: '0.02em',
      }}
    >
      {c.label}
    </span>
  )
}

function itemStatusBadge(status: string) {
  const s = status?.toUpperCase?.() ?? ''
  const map: Record<string, { label: string; bg: string; color: string }> = {
    DELIVERED: { label: 'Teslim Edildi', bg: '#dcfce7', color: '#166534' },
    IN_LAB: { label: 'Laboratuvar', bg: '#fef9c3', color: '#854d0e' },
    ORDERED: { label: 'Cam Bekleniyor', bg: '#ffedd5', color: '#9a3412' },
    PENDING: { label: 'Beklemede', bg: '#ffedd5', color: '#9a3412' },
    WAITING: { label: 'Bekleniyor', bg: '#ffedd5', color: '#9a3412' },
    READY: { label: 'Hazır', bg: '#dbeafe', color: '#1e40af' },
  }
  const c = map[s] ?? { label: status, bg: '#f3f4f6', color: '#374151' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: c.bg,
        color: c.color,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {c.label}
    </span>
  )
}

function paymentDotColor(type: string) {
  const map: Record<string, string> = {
    CASH: '#22c55e',
    CARD: '#3b82f6',
    OPEN_ACCOUNT: '#f97316',
    TRANSFER: '#a855f7',
  }
  return map[type] ?? '#9ca3af'
}

function paymentTypeBadge(type: string) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: '#f3f4f6',
        color: '#111',
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {paymentTypeLabel(type)}
    </span>
  )
}

const STATUS_BTN_STYLES: Record<
  string,
  { border: string; color: string; hoverBg: string; hoverColor: string }
> = {
  IN_LAB: { border: '#eab308', color: '#854d0e', hoverBg: '#fef9c3', hoverColor: '#713f12' },
  ORDERED: { border: '#f97316', color: '#9a3412', hoverBg: '#ffedd5', hoverColor: '#7c2d12' },
  READY: { border: '#3b82f6', color: '#1e40af', hoverBg: '#dbeafe', hoverColor: '#1e3a8a' },
  DELIVERED: { border: '#22c55e', color: '#166534', hoverBg: '#dcfce7', hoverColor: '#14532d' },
}

function paymentTypeLabel(t: string) {
  const map: Record<string, string> = {
    CASH: 'Nakit',
    CARD: 'Kart',
    TRANSFER: 'Havale',
    OPEN_ACCOUNT: 'Açık Hesap',
  }
  return map[t] ?? t
}

function openAccountRemaining(payments: any[]) {
  const openPayments = payments.filter((p) => p.paymentType === 'OPEN_ACCOUNT')
  const openAccountTotal = openPayments.reduce((acc, p) => acc + Number(p.grossAmount), 0)
  if (openAccountTotal === 0) return 0

  const firstOpenDate = openPayments
    .map((p) => new Date(p.createdAt))
    .sort((a, b) => a.getTime() - b.getTime())[0]

  const closedAmount = payments
    .filter(
      (p) =>
        p.paymentType !== 'OPEN_ACCOUNT' &&
        new Date(p.createdAt).getTime() > firstOpenDate.getTime(),
    )
    .reduce((acc, p) => acc + Number(p.grossAmount), 0)

  return Math.max(0, openAccountTotal - closedAmount)
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [sale, setSale] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)

  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidSaving, setVoidSaving] = useState(false)

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payType, setPayType] = useState<'CASH' | 'CARD' | 'HAVALE'>('CASH')
  const [payNote, setPayNote] = useState('')
  const [havaleBankName, setHavaleBankName] = useState('')
  const [banks, setBanks] = useState<Array<{ id: string; name: string }>>([])
  const [posDevicesByBankId, setPosDevicesByBankId] = useState<Map<string, Array<{ id: string; name: string }>>>(
    new Map(),
  )
  const [bankId, setBankId] = useState('')
  const [posDeviceId, setPosDeviceId] = useState('')
  const [installment, setInstallment] = useState(1)
  const [paySaving, setPaySaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await getSaleById(id)
      setSale(data)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Satış yüklenemedi')
      setSale(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (payType !== 'CARD') return
    apiClient
      .get('/admin/banks')
      .then((res) => {
        const data = res.data ?? []
        setBanks(data.map((b: any) => ({ id: b.id, name: b.name })))
        const map = new Map<string, Array<{ id: string; name: string }>>()
        for (const b of data) {
          map.set(
            b.id,
            (b.posDevices ?? []).map((p: any) => ({ id: p.id, name: p.name })),
          )
        }
        setPosDevicesByBankId(map)
      })
      .catch(() => {})
  }, [payType])

  const bankNameById = useMemo(() => new Map(banks.map((b) => [b.id, b.name])), [banks])

  const items = useMemo(
    () => (sale?.items ?? []).filter((i: any) => String(i.status).toUpperCase() !== 'VOID'),
    [sale?.items],
  )

  const openRemaining = useMemo(
    () => openAccountRemaining(sale?.payments ?? []),
    [sale?.payments],
  )

  const hasOpenAccount = useMemo(
    () => (sale?.payments ?? []).some((p: any) => p.paymentType === 'OPEN_ACCOUNT'),
    [sale?.payments],
  )

  async function updateAllItemStatus(status: string) {
    if (!sale?.id) return
    setStatusSaving(true)
    setError(null)
    try {
      await Promise.all(
        items.map((it: any) =>
          apiClient.patch(`/sales/${sale.id}/items/${it.id}/status`, { status }),
        ),
      )
      setSuccess('Kalem durumları güncellendi.')
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Durum güncellenemedi')
    } finally {
      setStatusSaving(false)
    }
  }

  async function submitVoid() {
    if (!sale?.id || voidReason.trim().length < 5) {
      setError('İptal nedeni en az 5 karakter olmalı.')
      return
    }
    setVoidSaving(true)
    setError(null)
    try {
      await voidSale(sale.id, { voidReason: voidReason.trim() })
      navigate('/')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Satış iptal edilemedi')
    } finally {
      setVoidSaving(false)
    }
  }

  async function submitOpenPayment() {
    if (!sale?.id || !sale?.customerId) return
    const n = Number(String(payAmount).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setError('Tutar geçerli olmalı.')
      return
    }
    if (payType === 'CARD' && (!bankId || !posDeviceId)) {
      setError('Banka ve POS seçin.')
      return
    }
    setPaySaving(true)
    setError(null)
    try {
      await apiClient.post('/open-account/payment', {
        customerId: sale.customerId,
        saleId: sale.id,
        amount: n,
        paymentType: payType === 'HAVALE' ? 'BANK_TRANSFER' : payType,
        note:
          payType === 'HAVALE' && havaleBankName.trim()
            ? `Havale bankası: ${havaleBankName.trim()}${payNote ? ` — ${payNote}` : ''}`
            : payNote?.trim() || null,
        bankId: payType === 'CARD' ? bankId : undefined,
        posDeviceId: payType === 'CARD' ? posDeviceId : undefined,
        installment: payType === 'CARD' ? installment : undefined,
      })
      setPayModalOpen(false)
      setSuccess('Açık hesap ödemesi kaydedildi.')
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Ödeme kaydedilemedi')
    } finally {
      setPaySaving(false)
    }
  }

  const posOptions = bankId ? posDevicesByBankId.get(bankId) ?? [] : []
  const canVoid = sale?.status === 'PAID' || sale?.status === 'DRAFT'

  if (loading) {
    return (
      <div style={{ ...pageWrap, color: '#6b7280' }}>Yükleniyor...</div>
    )
  }

  if (!sale) {
    return (
      <div style={pageWrap}>
        <div style={{ color: danger }}>{error ?? 'Satış bulunamadı.'}</div>
        <button type="button" onClick={() => navigate('/')} style={{ marginTop: 12, fontWeight: 800 }}>
          ← Geri
        </button>
      </div>
    )
  }

  return (
    <div style={pageWrap}>
      <div
        style={{
          background: 'linear-gradient(135deg, #8B0000 0%, #5c0000 100%)',
          padding: 32,
          borderRadius: '0 0 24px 24px',
          margin: '-24px -24px 0',
          color: '#fff',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            border: 'none',
            background: 'none',
            color: 'rgba(255,255,255,0.85)',
            fontWeight: 800,
            cursor: 'pointer',
            padding: 0,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          ← Geri
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontWeight: 900,
                fontSize: 28,
                letterSpacing: '0.04em',
              }}
            >
              Satış #{String(sale.id).slice(0, 8)}
            </div>
            <div style={{ marginTop: 10, fontSize: '1.4rem', fontWeight: 800, color: '#FFD700' }}>
              {sale.customer?.name ?? '—'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>
              {sale.customer?.phone ?? '—'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
              {fmtDate(sale.createdAt)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
            {sale.odooSaleOrderId ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.6)',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.95)',
                }}
              >
                Odoo #{sale.odooSaleOrderId}
              </span>
            ) : null}
            {headerSaleStatusBadge(sale.status)}
          </div>
        </div>
      </div>

      {success ? (
        <div style={{ ...cardStyle, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#166534' }}>
          {success}
        </div>
      ) : null}
      {error ? <div style={{ color: danger, fontSize: 13, fontWeight: 600 }}>{error}</div> : null}

      <div style={{ ...cardStyle, borderLeft: '4px solid #8B0000' }}>
        <div style={{ fontWeight: 900, marginBottom: 14, fontSize: 16 }}>Kalemler</div>
        <div>
          {items.map((it: any, idx: number) => (
            <div
              key={it.id}
              style={{
                padding: '14px 4px',
                borderBottom: idx < items.length - 1 ? '1px solid #e5e7eb' : 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fff5f5'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 800, flex: 1, fontSize: 16 }}>
                  {it.name ?? it.odooProductName ?? it.product?.name ?? 'Ürün'}
                </div>
                {itemStatusBadge(it.status)}
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 12,
                  fontSize: 11,
                }}
              >
                <div>
                  <div style={{ color: '#9ca3af', fontWeight: 700, marginBottom: 2 }}>Adet</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{it.qty}</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontWeight: 700, marginBottom: 2 }}>Fiyat</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{money(it.unitPrice)}</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontWeight: 700, marginBottom: 2 }}>İndirim</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{money(it.discount)}</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontWeight: 700, marginBottom: 2 }}>KDV</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{money(it.taxAmount)}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', fontWeight: 700 }}>
                Satır toplamı:{' '}
                <span style={{ color: '#111', fontWeight: 900, fontSize: 14 }}>{money(it.lineTotal)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, backgroundColor: '#fafafa' }}>
        <div style={{ fontWeight: 900, marginBottom: 14, fontSize: 16 }}>Finansal Özet</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Ara toplam
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.grossTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              İndirim
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.discountTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              KDV
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.taxTotal)}</div>
          </div>
          {Number(sale.sgkAmount) > 0 ? (
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                SGK katkısı
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.sgkAmount)}</div>
            </div>
          ) : null}
          {Number(sale.prescriptionAmount) > 0 ? (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: '#9ca3af',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Vakıf / reçete katkısı
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.prescriptionAmount)}</div>
            </div>
          ) : null}
          <div style={{ gridColumn: '1 / -1', paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Genel Toplam
            </div>
            <div style={{ fontWeight: 900, fontSize: 28, marginTop: 4, color: danger }}>{money(sale.netTotal)}</div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 14, fontSize: 16 }}>Ödemeler</div>
        {(sale.payments ?? []).length === 0 ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Ödeme kaydı yok.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {(sale.payments ?? []).map((p: any, idx: number) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: idx < (sale.payments ?? []).length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: paymentDotColor(p.paymentType),
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    {paymentTypeBadge(p.paymentType)}
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{money(p.grossAmount)}</div>
                  </div>
                  <div style={{ color: '#9ca3af', marginTop: 4, fontSize: 12 }}>{fmtDate(p.createdAt)}</div>
                  {p.paymentType === 'CARD' ? (
                    <div style={{ marginTop: 6, color: '#6b7280', fontSize: 12 }}>
                      {p.bankId ? `Banka: ${bankNameById.get(p.bankId) ?? p.bankId}` : null}
                      {p.installment ? ` · Taksit: ${p.installment}` : null}
                      {p.commissionAmount ? ` · Komisyon: ${money(p.commissionAmount)}` : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 16 }}>Durum Değiştir</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
          Mevcut durum tüm kalemlere uygulanır.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'Laboratuvara Gönderildi', status: 'IN_LAB' },
            { label: 'Cam Bekleniyor', status: 'ORDERED' },
            { label: 'Hazır', status: 'READY' },
            { label: 'Teslim Edildi', status: 'DELIVERED' },
          ].map((btn) => {
            const st = STATUS_BTN_STYLES[btn.status]
            return (
              <button
                key={btn.status}
                type="button"
                disabled={statusSaving}
                onClick={() => void updateAllItemStatus(btn.status)}
                onMouseEnter={(e) => {
                  if (statusSaving) return
                  e.currentTarget.style.backgroundColor = st.hoverBg
                  e.currentTarget.style.color = st.hoverColor
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = st.color
                }}
                style={{
                  border: `2px solid ${st.border}`,
                  backgroundColor: 'transparent',
                  color: st.color,
                  borderRadius: 999,
                  padding: '10px 18px',
                  cursor: statusSaving ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  fontSize: 13,
                  opacity: statusSaving ? 0.6 : 1,
                  transition: 'background-color 0.15s, color 0.15s',
                }}
              >
                {btn.label}
              </button>
            )
          })}
        </div>
      </div>

      {canVoid ? (
        <div style={{ ...cardStyle, backgroundColor: '#fff5f5', borderColor: '#fecaca' }}>
          <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 16, color: danger }}>İptal</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14, fontSize: 13, color: '#7f1d1d' }}>
            <span style={{ fontSize: 18, lineHeight: 1.2 }}>⚠️</span>
            <span>
              Satışı iptal etmek geri alınamaz. İptal nedeni kayıt altına alınır ve yetkili onayı gerektirir.
            </span>
          </div>
          {!voidOpen ? (
            <button
              type="button"
              onClick={() => setVoidOpen(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#8B0000'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = danger
              }}
              style={{
                backgroundColor: danger,
                color: 'white',
                border: 'none',
                borderRadius: 999,
                padding: '12px 20px',
                fontWeight: 900,
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
            >
              Satışı İptal Et
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="İptal nedeni (min. 5 karakter)"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #fecaca',
                  borderRadius: 12,
                  outline: 'none',
                  fontSize: 14,
                  backgroundColor: '#fff',
                }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setVoidOpen(false)}
                  style={{
                    flex: 1,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    borderRadius: 999,
                    padding: '10px 14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={voidSaving}
                  onClick={() => void submitVoid()}
                  onMouseEnter={(e) => {
                    if (!voidSaving) e.currentTarget.style.backgroundColor = '#8B0000'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = danger
                  }}
                  style={{
                    flex: 1,
                    border: 'none',
                    backgroundColor: danger,
                    color: 'white',
                    borderRadius: 999,
                    padding: '10px 14px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    opacity: voidSaving ? 0.7 : 1,
                    transition: 'background-color 0.15s',
                  }}
                >
                  İptali Onayla
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {hasOpenAccount && openRemaining > 0 ? (
        <div style={cardStyle}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Açık Hesap Ödeme</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: danger, marginBottom: 12 }}>
            Kalan: {money(openRemaining)}
          </div>
          <button
            type="button"
            onClick={() => {
              setPayAmount(String(openRemaining))
              setPayModalOpen(true)
            }}
            style={{
              backgroundColor: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              padding: '10px 14px',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Ödeme Gir
          </button>
        </div>
      ) : null}

      {payModalOpen ? (
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
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Açık Hesap Ödemesi</div>
            <div style={{ marginBottom: 10, color: danger, fontWeight: 900 }}>
              Kalan: {money(openRemaining)}
            </div>
            <label>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>TUTAR</div>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  outline: 'none',
                }}
              />
            </label>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(['CASH', 'CARD', 'HAVALE'] as const).map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                  <input type="radio" checked={payType === t} onChange={() => setPayType(t)} />
                  {t === 'CASH' ? 'Nakit' : t === 'CARD' ? 'Kredi Kartı' : 'Havale'}
                </label>
              ))}
            </div>
            {payType === 'CARD' ? (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <select
                  value={bankId}
                  onChange={(e) => {
                    setBankId(e.target.value)
                    setPosDeviceId('')
                  }}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                >
                  <option value="">Banka</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  value={posDeviceId}
                  onChange={(e) => setPosDeviceId(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                >
                  <option value="">POS</option>
                  {posOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={installment}
                  onChange={(e) => setInstallment(Number(e.target.value))}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                >
                  {[1, 3, 6, 9, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} taksit
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {payType === 'HAVALE' ? (
              <input
                value={havaleBankName}
                onChange={(e) => setHavaleBankName(e.target.value)}
                placeholder="Havale bankası"
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                }}
              />
            ) : null}
            <input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Not (opsiyonel)"
              style={{
                width: '100%',
                marginTop: 10,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
              }}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                style={{
                  flex: 1,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  borderRadius: 10,
                  padding: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={paySaving}
                onClick={() => void submitOpenPayment()}
                style={{
                  flex: 1,
                  border: 'none',
                  backgroundColor: primary,
                  color: 'white',
                  borderRadius: 10,
                  padding: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  opacity: paySaving ? 0.7 : 1,
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
