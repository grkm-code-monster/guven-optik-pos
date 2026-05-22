import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from './AdminLayout'

const INSTALLMENTS = [1, 2, 3, 6, 9, 12] as const

type Rate = {
  id: string
  bankId: string
  installment: number
  commissionRate: string
  startDate: string
}

type Bank = {
  id: string
  name: string
  rates: Rate[]
}

export default function KomisyonPage() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.get('/admin/banks')
      const data: Bank[] = res.data ?? []
      setBanks(data)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Bankalar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (banks.length > 0 && !selectedBankId) setSelectedBankId(banks[0].id)
  }, [banks, selectedBankId])

  const selectedBank = useMemo(
    () => banks.find((b) => b.id === selectedBankId) ?? null,
    [banks, selectedBankId],
  )

  useEffect(() => {
    if (!selectedBank) {
      setDraft({})
      return
    }
    const next: Record<number, string> = {}
    for (const inst of INSTALLMENTS) {
      const rate = selectedBank.rates
        .filter((r) => r.installment === inst)
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0]
      next[inst] = rate ? String(Number(rate.commissionRate) * 100) : ''
    }
    setDraft(next)
  }, [selectedBank])

  async function save() {
    if (!selectedBank) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    const today = new Date().toISOString().split('T')[0]
    try {
      for (const inst of INSTALLMENTS) {
        const raw = draft[inst]?.trim()
        if (!raw) continue
        const pct = Number(raw.replace(',', '.'))
        if (!Number.isFinite(pct) || pct < 0) continue
        const commissionRate = String(pct / 100)
        const existing = selectedBank.rates
          .filter((r) => r.installment === inst)
          .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0]
        if (existing) {
          await adminApi.put(`/admin/banks/${selectedBank.id}/rates/${existing.id}`, {
            commissionRate,
          })
        } else {
          await adminApi.post(`/admin/banks/${selectedBank.id}/rates`, {
            installment: inst,
            commissionRate,
            startDate: today,
          })
        }
      }
      setSuccess('Komisyon oranları kaydedildi.')
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 20px', fontSize: 24, fontWeight: 900 }}>Komisyon Oranları</h1>
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}
      {error ? <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p> : null}
      {success ? <p style={{ color: '#16a34a', fontSize: 13 }}>{success}</p> : null}

      {!loading && banks.length > 0 ? (
        <>
          <label style={{ display: 'block', marginBottom: 16, maxWidth: 320 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Banka</span>
            <select
              value={selectedBankId}
              onChange={(e) => setSelectedBankId(e.target.value)}
              style={{
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                background: 'white',
              }}
            >
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: 12, fontWeight: 800 }}>Taksit</th>
                  <th style={{ textAlign: 'left', padding: 12, fontWeight: 800 }}>Komisyon (%)</th>
                </tr>
              </thead>
              <tbody>
                {INSTALLMENTS.map((inst) => (
                  <tr key={inst} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: 12, fontWeight: 700 }}>{inst}</td>
                    <td style={{ padding: 12 }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="örn. 2.5"
                        value={draft[inst] ?? ''}
                        onChange={(e) => setDraft((d) => ({ ...d, [inst]: e.target.value }))}
                        style={{
                          width: '100%',
                          maxWidth: 160,
                          padding: '8px 10px',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            disabled={saving || !selectedBank}
            onClick={() => void save()}
            style={{
              marginTop: 16,
              padding: '12px 24px',
              borderRadius: 10,
              border: 'none',
              backgroundColor: '#1a1a2e',
              color: 'white',
              fontWeight: 800,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </>
      ) : null}

      {!loading && banks.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Kayıtlı banka bulunamadı.</p>
      ) : null}
    </div>
  )
}
