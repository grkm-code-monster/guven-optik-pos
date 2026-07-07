import { useEffect, useMemo, useState } from 'react'
import type { Sale } from '../../api/types'
import type { PricingOverview } from '../../utils/sgkPricing'
import { apiClient } from '../../api/client'
import { confirmSale } from '../../api/sales.api'

const HAVALE_BANKALARI = [
  'Ziraat Bankası',
  'Halkbank',
  'Vakıfbank',
  'Garanti BBVA',
  'İş Bankası',
  'Yapı Kredi',
  'Akbank',
  'Denizbank',
  'QNB Finansbank',
  'TEB',
  'ING Bank',
  'HSBC',
  'Enpara',
  'Papara',
] as const

type UiPaymentType = 'CASH' | 'CARD' | 'TRANSFER' | 'OPEN_ACCOUNT'

type PaymentRow = {
  id: string
  paymentType: UiPaymentType
  grossAmount: string
  bankId?: string
  posDeviceId?: string
  installment?: number
  bankName?: string
}

export type PendingPaymentPayload = {
  payments: Array<{
    paymentType: string
    grossAmount: string
    bankId?: string
    posDeviceId?: string
    installment?: number
    bankName?: string
  }>
  faturaKesilsin?: boolean
}

export default function PaymentStep({
  sale,
  onNext,
  onBack,
  deferConfirm = false,
  pricingOverview = null,
}: {
  sale: Sale | null
  onNext: (payload?: PendingPaymentPayload) => void
  onBack: () => void
  /** true: ödemeyi kaydetmeden sonraki adıma geç (onay adımında confirm) */
  deferConfirm?: boolean
  pricingOverview?: PricingOverview | null
}) {
  const netTotal =
    pricingOverview?.customerPaysTRY != null
      ? pricingOverview.customerPaysTRY
      : Number(sale?.netTotal ?? 0)

  const [rows, setRows] = useState<PaymentRow[]>([])
  const [type, setType] = useState<UiPaymentType>('CASH')
  const [amount, setAmount] = useState('')
  const [bankId, setBankId] = useState('')
  const [posDeviceId, setPosDeviceId] = useState('')
  const [installment, setInstallment] = useState(1)
  const [transferBankName, setTransferBankName] = useState('')
  const [banks, setBanks] = useState<Array<{ id: string; name: string }>>([])
  const [posDevicesByBankId, setPosDevicesByBankId] = useState<Map<string, Array<{ id: string; name: string }>>>(new Map())
  const [loadingBanks, setLoadingBanks] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [faturaKesilsin, setFaturaKesilsin] = useState(true)

  const totalPayments = useMemo(() => rows.reduce((acc, r) => acc + Number(r.grossAmount || 0), 0), [rows])
  const remaining = useMemo(() => Math.max(0, netTotal - totalPayments), [netTotal, totalPayments])
  const canConfirm = useMemo(() => Math.abs(netTotal - totalPayments) <= 0.01 && netTotal > 0, [netTotal, totalPayments])

  useEffect(() => {
    if (type !== 'CARD') return
    setLoadingBanks(true)
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
      .catch((e) => console.error('Banks fetch error', e))
      .finally(() => setLoadingBanks(false))
  }, [type])

  function addRow() {
    setError(null)
    const a = amount.trim()
    if (!a || Number(a) <= 0 || Number.isNaN(Number(a))) {
      setError('Tutar geçerli olmalı.')
      return
    }
    if (type === 'CARD') {
      if (!bankId) {
        setError('Banka seçin.')
        return
      }
      if (!posDeviceId) {
        setError('POS seçin.')
        return
      }
    }
    if (type === 'TRANSFER' && !transferBankName.trim()) {
      setError('Havale için banka adı giriniz.')
      return
    }

    const row: PaymentRow = {
      id: crypto.randomUUID(),
      paymentType: type,
      grossAmount: a,
      bankId: type === 'CARD' ? bankId : undefined,
      posDeviceId: type === 'CARD' ? posDeviceId : undefined,
      installment: type === 'CARD' ? installment : undefined,
      bankName: type === 'TRANSFER' ? transferBankName.trim() : undefined,
    }
    setRows((r) => [...r, row])
    setAmount('')
    setTransferBankName('')
  }

  function removeRow(id: string) {
    setRows((r) => r.filter((x) => x.id !== id))
  }

  function buildPayload(): PendingPaymentPayload {
    return {
      payments: rows.map((r) => ({
        paymentType: r.paymentType,
        grossAmount: r.grossAmount,
        bankId: r.bankId,
        posDeviceId: r.posDeviceId,
        installment: r.installment,
        bankName: r.bankName,
      })),
      faturaKesilsin,
    }
  }

  async function confirm() {
    if (!sale) return
    setSaving(true)
    setError(null)
    try {
      const payload = buildPayload()
      if (deferConfirm) {
        onNext(payload)
        return
      }
      await confirmSale(sale.id, payload)
      onNext()
    } catch (e: any) {
      console.error('Confirm sale error', e)
      setError(e?.response?.data?.message ?? 'Satış onaylanamadı')
    } finally {
      setSaving(false)
    }
  }

  if (!sale) {
    return (
      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
        Satış yükleniyor...
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
      <div style={{ fontWeight: 900, marginBottom: '12px' }}>Ödeme</div>

      {sale?.items?.length ? (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontWeight: 800, marginBottom: '8px', fontSize: '13px' }}>Satış kalemleri</div>
          {(sale.items ?? []).map((item) => {
            const urunAdi =
              item.odooProductName ||
              (item.product?.name !== '__ODOO_PLACEHOLDER__' ? item.product?.name : null) ||
              'Odoo Ürünü'
            return (
              <div key={item.id} style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                {urunAdi}
              </div>
            )
          })}
        </div>
      ) : null}

      <div style={{ border: '1px solid #fecaca', backgroundColor: '#fef2f2', borderRadius: '12px', padding: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Kalan
        </div>
        <div style={{ fontSize: '28px', fontWeight: 900, color: '#991b1b', marginTop: '6px' }}>
          {formatMoney(String(remaining))}
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <div style={{ fontWeight: 800, marginBottom: '8px' }}>Ödemeler</div>
        {rows.length === 0 ? <div style={{ fontSize: '13px', color: '#6b7280' }}>Henüz ödeme eklenmedi.</div> : null}
        {rows.map((r) => (
          <div
            key={r.id}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginTop: '8px',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#111' }}>{labelType(r.paymentType)}</div>
              {r.paymentType === 'TRANSFER' && r.bankName ? (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{r.bankName}</div>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '13px', fontWeight: 900 }}>{formatMoney(r.grossAmount)}</div>
              <button
                type="button"
                onClick={() => removeRow(r.id)}
                style={{
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                Sil
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '14px', borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
        <div style={{ fontWeight: 900, marginBottom: '10px' }}>Ödeme Ekle</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <FieldSelect
            label="Tür"
            value={type}
            onChange={(v) => setType(v as UiPaymentType)}
            options={[
              { value: 'CASH', label: 'Nakit' },
              { value: 'CARD', label: 'Kredi Kartı' },
              { value: 'TRANSFER', label: 'Havale' },
              { value: 'OPEN_ACCOUNT', label: 'Açık Hesap' },
            ]}
          />
          <FieldInput label="Tutar" value={amount} onChange={setAmount} inputMode="decimal" />
        </div>

        {type === 'CARD' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <FieldSelect
              label="Banka"
              value={bankId}
              onChange={(v) => {
                setBankId(v)
                setPosDeviceId('')
              }}
              options={[{ value: '', label: loadingBanks ? 'Yükleniyor...' : 'Seçiniz' }, ...banks.map((b) => ({ value: b.id, label: b.name }))]}
            />
            <FieldSelect
              label="POS"
              value={posDeviceId}
              onChange={setPosDeviceId}
              options={[
                { value: '', label: 'Seçiniz' },
                ...(posDevicesByBankId.get(bankId) ?? []).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
        ) : null}

        {type === 'TRANSFER' && (
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
              BANKA (hangi bankaya yatırıldı) *
            </label>
            <select
              value={transferBankName}
              onChange={(e) => setTransferBankName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                marginTop: 4,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                background: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="">Banka seçin...</option>
              {HAVALE_BANKALARI.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === 'CARD' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <FieldSelect
              label="Taksit"
              value={String(installment)}
              onChange={(v) => setInstallment(Number(v))}
              options={[
                { value: '1', label: '1' },
                { value: '3', label: '3' },
                { value: '6', label: '6' },
                { value: '9', label: '9' },
                { value: '12', label: '12' },
              ]}
            />
            <div />
          </div>
        ) : null}

        <button
          type="button"
          onClick={addRow}
          style={{
            marginTop: '12px',
            width: '100%',
            padding: '12px 14px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#C8102E',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 900,
          }}
        >
          + Ekle
        </button>

        {error ? <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px' }}>{error}</div> : null}
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          marginTop: '14px',
          padding: '12px',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          cursor: 'pointer',
          backgroundColor: '#f9fafb',
        }}
      >
        <input
          type="checkbox"
          checked={faturaKesilsin}
          onChange={(e) => setFaturaKesilsin(e.target.checked)}
          style={{ marginTop: '2px', width: '16px', height: '16px', cursor: 'pointer' }}
        />
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
          ✅ Resmi e-Fatura Kesilsin
        </span>
      </label>

      <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            backgroundColor: '#f3f4f6',
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          ← Geri
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!canConfirm || saving}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#C8102E',
            color: 'white',
            cursor: !canConfirm || saving ? 'not-allowed' : 'pointer',
            fontWeight: 900,
            opacity: !canConfirm || saving ? 0.5 : 1,
          }}
        >
          {deferConfirm ? 'Devam Et →' : 'Onayla →'}
        </button>
      </div>
    </div>
  )
}

function FieldInput({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  inputMode?: any
}) {
  return (
    <label>
      <div style={labelStyle}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        style={inputStyle}
      />
    </label>
  )
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label>
      <div style={labelStyle}>{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, backgroundColor: 'white' }}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
function labelType(t: UiPaymentType) {
  if (t === 'CASH') return 'Nakit'
  if (t === 'CARD') return 'Kredi Kartı'
  if (t === 'TRANSFER') return 'Havale'
  return 'Açık Hesap'
}

function formatMoney(v?: string) {
  if (!v) return '-'
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 800,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  fontSize: '14px',
  outline: 'none',
}


