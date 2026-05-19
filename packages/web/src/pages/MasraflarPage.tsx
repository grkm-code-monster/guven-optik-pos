import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { apiClient } from '../api/client'

type ExpenseCategory = { id: number; name: string }

type CustomerResult = { id: string; name: string; phone?: string | null }

function getStoredUserName(): string {
  try {
    const authRaw = localStorage.getItem('optik-auth')
    if (authRaw) {
      const parsed = JSON.parse(authRaw) as {
        state?: { user?: { name?: string } }
        user?: { name?: string }
        userName?: string
        name?: string
      }
      const fromAuth =
        parsed?.state?.user?.name ?? parsed?.user?.name ?? parsed?.userName ?? parsed?.name
      if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim()
    }

    const userName = localStorage.getItem('userName')
    if (userName?.trim()) return userName.trim()

    const userRaw = localStorage.getItem('user')
    if (userRaw?.trim()) {
      try {
        const parsed = JSON.parse(userRaw) as { name?: string } | string
        if (typeof parsed === 'string' && parsed.trim()) return parsed.trim()
        if (parsed && typeof parsed === 'object' && parsed.name?.trim()) return parsed.name.trim()
      } catch {
        return userRaw.trim()
      }
    }
  } catch {
    /* ignore */
  }
  return ''
}

function buildDefaultNot(): string {
  const name = getStoredUserName()
  return name ? `Ödemeyi yapan: ${name}` : 'Ödemeyi yapan: '
}

const cardStyle: CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '20px',
}

const labelStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#6b7280',
  letterSpacing: '0.02em',
  marginBottom: '6px',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
}

export default function MasraflarPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [tutar, setTutar] = useState('')
  const [tedarikci, setTedarikci] = useState('')
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [partnerResults, setPartnerResults] = useState<CustomerResult[]>([])
  const [partnerLoading, setPartnerLoading] = useState(false)
  const [partnerDropdownOpen, setPartnerDropdownOpen] = useState(false)
  const partnerBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [odemeYontemi, setOdemeYontemi] = useState<'Nakit' | 'Kart'>('Nakit')
  const [paymentMode, setPaymentMode] = useState<'own_account' | 'company_account'>('company_account')
  const [not, setNot] = useState(() => buildDefaultNot())

  const [loadingCats, setLoadingCats] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const searchSuppliers = async (query: string) => {
    try {
      const res = await apiClient.get(`/expenses/suppliers?q=${encodeURIComponent(query)}`)
      const data = res.data
      if (data.data && Array.isArray(data.data)) {
        const list = data.data.map((item: { id: number; name: string; phone?: string | null }) => ({
          id: String(item.id),
          name: item.name,
          phone: item.phone ?? null,
        }))
        setPartnerResults(list.slice(0, 8))
      } else {
        setPartnerResults([])
      }
    } catch {
      setPartnerResults([])
    }
  }

  useEffect(() => {
    setLoadingCats(true)
    setError(null)
    apiClient
      .get('/expenses/categories')
      .then((res) => {
        const data = res.data?.data ?? []
        setCategories(Array.isArray(data) ? data : [])
      })
      .catch((e: any) => {
        const msg =
          e?.response?.data?.error ??
          e?.message ??
          'Masraf kategorileri yüklenemedi. (hr.expense / Odoo modülü kurulu olmayabilir.)'
        setError(msg)
        setCategories([])
      })
      .finally(() => setLoadingCats(false))
  }, [])

  useEffect(() => {
    const q = tedarikci.trim()
    if (q.length < 3) {
      setPartnerResults([])
      setPartnerLoading(false)
      return
    }

    const t = setTimeout(() => {
      setPartnerLoading(true)
      void searchSuppliers(q)
        .then(() => setPartnerDropdownOpen(true))
        .finally(() => setPartnerLoading(false))
    }, 300)

    return () => clearTimeout(t)
  }, [tedarikci])

  function resetForm() {
    setCategoryId('')
    setAciklama('')
    setTutar('')
    setTedarikci('')
    setPartnerId(null)
    setPartnerResults([])
    setPartnerDropdownOpen(false)
    setOdemeYontemi('Nakit')
    setPaymentMode('company_account')
    setNot(buildDefaultNot())
  }

  function selectPartner(p: CustomerResult) {
    setTedarikci(p.name)
    setPartnerId(p.id)
    setPartnerResults([])
    setPartnerDropdownOpen(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!categoryId || !aciklama.trim() || !tutar.trim() || !tedarikci.trim()) {
      setError('Zorunlu alanları doldurun.')
      return
    }

    const amount = Number(String(tutar).replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Tutar geçerli olmalı.')
      return
    }

    const supplierLine = partnerId
      ? `Tedarikçi/Kişi: ${tedarikci.trim()} (#${partnerId})`
      : `Tedarikçi/Kişi: ${tedarikci.trim()}`
    const descriptionParts = [supplierLine]
    if (not.trim()) descriptionParts.push(not.trim())

    setSaving(true)
    try {
      await apiClient.post('/expenses', {
        name: aciklama.trim(),
        product_id: Number(categoryId),
        total_amount: amount,
        employee_id: 1,
        payment_mode: paymentMode,
        description: descriptionParts.join('\n'),
      })
      setSuccess('Masraf kaydı başarıyla oluşturuldu.')
      resetForm()
    } catch (e: any) {
      const msg =
        e?.response?.data?.error ??
        e?.response?.data?.message ??
        e?.message ??
        'Masraf kaydedilemedi.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#111' }}>Masraflar</div>

      {success ? (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#166534',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : null}

      <form onSubmit={(ev) => void handleSubmit(ev)} style={cardStyle}>
        <div style={{ display: 'grid', gap: '16px' }}>
          <label>
            <div style={labelStyle}>
              Kategori <span style={{ color: '#c0392b' }}>*</span>
            </div>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{ ...inputStyle, backgroundColor: 'white' }}
              disabled={loadingCats}
              required
            >
              <option value="">{loadingCats ? 'Yükleniyor…' : 'Kategori seçin'}</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div style={labelStyle}>
              Açıklama <span style={{ color: '#c0392b' }}>*</span>
            </div>
            <input
              type="text"
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              style={inputStyle}
              required
            />
          </label>

          <label>
            <div style={labelStyle}>
              Tutar (TL) <span style={{ color: '#c0392b' }}>*</span>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={tutar}
              onChange={(e) => setTutar(e.target.value)}
              style={inputStyle}
              required
            />
          </label>

          <label style={{ display: 'block', position: 'relative' }}>
            <div style={labelStyle}>
              Tedarikçi / Kişi <span style={{ color: '#c0392b' }}>*</span>
            </div>
            <input
              type="text"
              value={tedarikci}
              onChange={(e) => {
                setTedarikci(e.target.value)
                setPartnerId(null)
                if (e.target.value.trim().length >= 2) {
                  setPartnerDropdownOpen(true)
                } else {
                  setPartnerResults([])
                  setPartnerDropdownOpen(false)
                }
              }}
              onFocus={() => {
                if (partnerBlurTimer.current) clearTimeout(partnerBlurTimer.current)
                if (tedarikci.trim().length >= 2 && partnerResults.length > 0) {
                  setPartnerDropdownOpen(true)
                }
              }}
              onBlur={() => {
                partnerBlurTimer.current = setTimeout(() => setPartnerDropdownOpen(false), 150)
              }}
              style={inputStyle}
              required
              autoComplete="off"
            />
            {partnerDropdownOpen && tedarikci.trim().length >= 2 ? (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: '100%',
                  marginTop: '4px',
                  zIndex: 20,
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  maxHeight: '220px',
                  overflowY: 'auto',
                }}
              >
                {partnerLoading ? (
                  <div style={{ padding: '10px 14px', fontSize: '13px', color: '#6b7280' }}>Aranıyor…</div>
                ) : null}
                {!partnerLoading && partnerResults.length === 0 ? (
                  <div style={{ padding: '10px 14px', fontSize: '13px', color: '#6b7280' }}>
                    Sonuç yok — serbest metin girebilirsiniz
                  </div>
                ) : null}
                {partnerResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectPartner(p)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      border: 'none',
                      borderBottom: '1px solid #f3f4f6',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      fontSize: '14px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fafafa'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white'
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#111' }}>{p.name}</div>
                    {p.phone ? (
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{p.phone}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </label>

          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ ...labelStyle, marginBottom: '8px' }}>
              {'Ödeme Yöntemi'} <span style={{ color: '#c0392b' }}>*</span>
            </legend>
            <div style={{ display: 'flex', gap: '16px' }}>
              {(['Nakit', 'Kart'] as const).map((opt) => (
                <label
                  key={opt}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="odemeYontemi"
                    value={opt}
                    checked={odemeYontemi === opt}
                    onChange={() => setOdemeYontemi(opt)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ ...labelStyle, marginBottom: '8px' }}>
              {'Ödeme Sorumlusu'} <span style={{ color: '#c0392b' }}>*</span>
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="paymentMode"
                  value="own_account"
                  checked={paymentMode === 'own_account'}
                  onChange={() => setPaymentMode('own_account')}
                />
                {'Personel Öder'}
              </label>
              <label
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="paymentMode"
                  value="company_account"
                  checked={paymentMode === 'company_account'}
                  onChange={() => setPaymentMode('company_account')}
                />
                {'Şirketten'}
              </label>
            </div>
          </fieldset>

          <label>
            <div style={labelStyle}>{'Not'}</div>
            <textarea
              value={not}
              onChange={(e) => setNot(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            marginTop: '20px',
            width: '100%',
            padding: '14px 20px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: '#c0392b',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.95rem',
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </form>
    </div>
  )
}
