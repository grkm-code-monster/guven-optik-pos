import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from './AdminLayout'

type TabId = 'komisyon' | 'personeller' | 'subeler' | 'sirket-tanimlari' | 'eticaret'

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

type AdminUser = {
  id: string
  name: string
  username: string
  role: string
  branchId: string
  isActive: boolean
  createdAt: string
  personelId?: string | null
  odooEmployeeId?: number | null
  personel?: {
    id: string
    ad: string
    soyad: string
    pozisyon: string
    subeId: string | null
    aylikHedef: number
  } | null
}

type OdooEmployeeOption = {
  id: number
  name: string
  job_title?: string | false
  department_id?: [number, string] | false
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: '12px 18px',
    border: 'none',
    borderBottom: active ? '3px solid #1a1a2e' : '3px solid transparent',
    background: 'transparent',
    color: active ? '#1a1a2e' : '#6b7280',
    fontWeight: active ? 800 : 500,
    fontSize: 14,
    cursor: 'pointer',
  }
}

function roleBadgeStyle(role: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    ADMIN: { bg: '#ede9fe', color: '#5b21b6' },
    STORE_MANAGER: { bg: '#dbeafe', color: '#1e40af' },
    SALES_STAFF: { bg: '#f3f4f6', color: '#374151' },
    REGIONAL_MANAGER: { bg: '#ffedd5', color: '#9a3412' },
    ACCOUNTANT: { bg: '#dcfce7', color: '#166534' },
  }
  const c = map[role] ?? { bg: '#f3f4f6', color: '#374151' }
  return {
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: c.bg,
    color: c.color,
  }
}

export default function TanimlamalarPage() {
  const [tab, setTab] = useState<TabId>('komisyon')

  return (
    <div>
      <h1 style={{ margin: '0 0 20px', fontSize: 24, fontWeight: 900 }}>Tanımlamalar</h1>
      <div
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 4,
          borderBottom: '1px solid #e5e7eb',
          marginBottom: 24,
          backgroundColor: 'white',
          borderRadius: '12px 12px 0 0',
          padding: '0 8px',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <button
          type="button"
          style={{ ...tabBtn(tab === 'komisyon'), flexShrink: 0, whiteSpace: 'nowrap' }}
          onClick={() => setTab('komisyon')}
        >
          Komisyon Oranları
        </button>
        <button
          type="button"
          style={{ ...tabBtn(tab === 'personeller'), flexShrink: 0, whiteSpace: 'nowrap' }}
          onClick={() => setTab('personeller')}
        >
          Personeller
        </button>
        <button
          type="button"
          style={{ ...tabBtn(tab === 'subeler'), flexShrink: 0, whiteSpace: 'nowrap', minWidth: 72 }}
          onClick={() => setTab('subeler')}
        >
          <span style={{ fontFamily: 'system-ui, sans-serif' }}>Şubeler</span>
        </button>
        <button
          type="button"
          style={{ ...tabBtn(tab === 'sirket-tanimlari'), flexShrink: 0, whiteSpace: 'nowrap' }}
          onClick={() => setTab('sirket-tanimlari')}
        >
          <span style={{ fontFamily: 'system-ui, sans-serif' }}>Şirket Tanımları</span>
        </button>
        <button
          type="button"
          style={{ ...tabBtn(tab === 'eticaret'), flexShrink: 0, whiteSpace: 'nowrap' }}
          onClick={() => setTab('eticaret')}
        >
          <span style={{ fontFamily: 'system-ui, sans-serif' }}>E-Ticaret</span>
        </button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20 }}>
        {tab === 'komisyon' ? <KomisyonTab /> : null}
        {tab === 'personeller' ? <PersonellerTab /> : null}
        {tab === 'subeler' ? <SubelerTab /> : null}
        {tab === 'sirket-tanimlari' ? <SirketTanimlariTab /> : null}
        {tab === 'eticaret' ? <EticaretTab /> : null}
      </div>
    </div>
  )
}

function KomisyonTab() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [selectedBankId, setSelectedBankId] = useState('')
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showAddBank, setShowAddBank] = useState(false)
  const [newBankName, setNewBankName] = useState('')
  const [addingBank, setAddingBank] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.get('/admin/banks')
      setBanks(res.data ?? [])
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
          await adminApi.put(`/admin/banks/${selectedBank.id}/rates/${existing.id}`, { commissionRate })
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

  async function addBank() {
    const name = newBankName.trim()
    if (!name) {
      setError('Banka adı girin.')
      return
    }
    setAddingBank(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await adminApi.post('/admin/banks', { name })
      const created = res.data as { id?: string; name?: string }
      setNewBankName('')
      setShowAddBank(false)
      setSuccess(`"${created?.name ?? name}" bankası eklendi.`)
      await load()
      if (created?.id) setSelectedBankId(created.id)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Banka eklenemedi')
    } finally {
      setAddingBank(false)
    }
  }

  return (
    <div>
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}
      {error ? <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p> : null}
      {success ? <p style={{ color: '#16a34a', fontSize: 13 }}>{success}</p> : null}

      {!loading ? (
        <div style={{ marginBottom: 20 }}>
          {!showAddBank ? (
            <button
              type="button"
              onClick={() => setShowAddBank(true)}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                fontWeight: 800,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              + Banka Ekle
            </button>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', maxWidth: 480 }}>
              <input
                type="text"
                placeholder="Banka adı (örn. Akbank)"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addBank()
                }}
                style={{
                  flex: '1 1 200px',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
              <button
                type="button"
                disabled={addingBank}
                onClick={() => void addBank()}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#1a1a2e',
                  color: 'white',
                  fontWeight: 800,
                  cursor: addingBank ? 'wait' : 'pointer',
                  opacity: addingBank ? 0.7 : 1,
                }}
              >
                {addingBank ? 'Ekleniyor...' : 'Kaydet'}
              </button>
              <button
                type="button"
                disabled={addingBank}
                onClick={() => {
                  setShowAddBank(false)
                  setNewBankName('')
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                İptal
              </button>
            </div>
          )}
        </div>
      ) : null}

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

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
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
        <p style={{ color: '#6b7280' }}>Kayıtlı banka bulunamadı. Yukarıdan yeni banka ekleyin.</p>
      ) : null}
    </div>
  )
}

type PosBranch = {
  id: string
  name: string
  code: string
  isActive?: boolean
  sirketId?: number | null
  sirketAdi?: string | null
  vkn?: string | null
  odooLocationId?: number | null
  pdksPlaceId?: number | null
  adres?: string | null
  il?: string | null
  ilce?: string | null
  telefon?: string | null
}

const SIRKETLER = [
  { id: 1, ad: 'GÜVEN OPTİK 1959' },
  { id: 2, ad: 'NG' },
  { id: 3, ad: 'ADESE' },
  { id: 4, ad: 'POTENTIAL' },
]

const emptyForm = {
  name: '',
  code: '',
  sirketId: '',
  sirketAdi: '',
  vkn: '',
  odooLocationId: '',
  pdksPlaceId: '',
  adres: '',
  il: '',
  ilce: '',
  telefon: '',
}

function ilIlceTam(b: Pick<PosBranch, 'il' | 'ilce'>): boolean {
  return !!(b.il?.trim() && b.ilce?.trim())
}

function badge(ok: boolean, okLabel: string, failLabel: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: ok ? '#dcfce7' : '#fee2e2',
    color: ok ? '#166534' : '#b91c1c',
  }
}

function SubelerTab() {
  const [branches, setBranches] = useState<any[]>([])
  const [odooLokasyonlar, setOdooLokasyonlar] = useState<any[]>([])
  const [pdksYerler, setPdksYerler] = useState<any[]>([])
  const [secilenBranch, setSecilenBranch] = useState<string | null>(null)
  const [yeniForm, setYeniForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [brRes, odooRes, pdksRes] = await Promise.all([
        adminApi.get('/admin/branch-list'),
        adminApi.get('/admin/branches'),
        adminApi.get('/admin/pdks-places'),
      ])
      setBranches(brRes.data?.data ?? [])
      setOdooLokasyonlar(odooRes.data?.data ?? [])
      setPdksYerler(pdksRes.data?.data ?? [])
    } catch {
      setBranches([])
      setOdooLokasyonlar([])
      setPdksYerler([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function formAlanlari(
    f: typeof form,
    setF: React.Dispatch<React.SetStateAction<typeof form>>,
    onKaydet: () => void,
    kaydetLabel: string,
  ) {
    return (
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 16, backgroundColor: '#f9fafb' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <input
            placeholder="Şube Adı *"
            value={f.name}
            onChange={(e) => setF((p) => ({ ...p, name: e.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="Kod *"
            value={f.code}
            onChange={(e) => setF((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
            style={inputStyle}
          />
          <input
            placeholder="Telefon"
            value={f.telefon}
            onChange={(e) => setF((p) => ({ ...p, telefon: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <select
            value={f.sirketId}
            onChange={(e) => {
              const s = SIRKETLER.find((x) => String(x.id) === e.target.value)
              setF((p) => ({ ...p, sirketId: e.target.value, sirketAdi: s ? s.ad : '' }))
            }}
            style={inputStyle}
          >
            <option value="">Şirket seçin...</option>
            {SIRKETLER.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.ad}
              </option>
            ))}
          </select>
          <input
            placeholder="VKN"
            value={f.vkn}
            onChange={(e) => setF((p) => ({ ...p, vkn: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <input
            placeholder="Adres"
            value={f.adres}
            onChange={(e) => setF((p) => ({ ...p, adres: e.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="İl *"
            value={f.il}
            onChange={(e) => setF((p) => ({ ...p, il: e.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="İlçe *"
            value={f.ilce}
            onChange={(e) => setF((p) => ({ ...p, ilce: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <select
            value={f.odooLocationId}
            onChange={(e) => setF((p) => ({ ...p, odooLocationId: e.target.value }))}
            style={inputStyle}
          >
            <option value="">Odoo Lokasyon...</option>
            {odooLokasyonlar.map((l: any) => (
              <option key={l.id} value={String(l.id)}>
                {l.name ?? l.complete_name}
              </option>
            ))}
          </select>
          <select
            value={f.pdksPlaceId}
            onChange={(e) => setF((p) => ({ ...p, pdksPlaceId: e.target.value }))}
            style={inputStyle}
          >
            <option value="">PDKS Yer...</option>
            {pdksYerler.map((p: any) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={yukleniyor}
            onClick={onKaydet}
            style={{ ...btnStyle, padding: '10px 20px', backgroundColor: '#1a1a2e', color: 'white' }}
          >
            {yukleniyor ? 'Kaydediliyor...' : kaydetLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              setYeniForm(false)
              setSecilenBranch(null)
              setForm(emptyForm)
            }}
            style={{ ...btnStyle, padding: '10px 20px', backgroundColor: '#f3f4f6', color: '#374151' }}
          >
            İptal
          </button>
        </div>
      </div>
    )
  }

  async function kaydet(id?: string) {
    setYukleniyor(true)
    try {
      if (id) {
        await adminApi.put(`/admin/branch/${id}`, form)
      } else {
        await adminApi.post('/admin/branch', form)
      }
      setYeniForm(false)
      setSecilenBranch(null)
      setForm(emptyForm)
      await load()
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Kayıt başarısız')
    } finally {
      setYukleniyor(false)
    }
  }

  function duzenleAc(b: PosBranch) {
    setSecilenBranch(b.id)
    setYeniForm(false)
    setForm({
      name: b.name ?? '',
      code: b.code ?? '',
      sirketId: b.sirketId != null ? String(b.sirketId) : '',
      sirketAdi: b.sirketAdi ?? '',
      vkn: b.vkn ?? '',
      odooLocationId: b.odooLocationId != null ? String(b.odooLocationId) : '',
      pdksPlaceId: b.pdksPlaceId != null ? String(b.pdksPlaceId) : '',
      adres: b.adres ?? '',
      il: b.il ?? '',
      ilce: b.ilce ?? '',
      telefon: b.telefon ?? '',
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Şubeler</h2>
        <button
          type="button"
          onClick={() => {
            setYeniForm(true)
            setSecilenBranch(null)
            setForm(emptyForm)
          }}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: '#1a1a2e',
            color: 'white',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          + Yeni Şube
        </button>
      </div>

      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}

      {yeniForm
        ? formAlanlari(form, setForm, () => void kaydet(), 'Kaydet')
        : null}

      {secilenBranch
        ? formAlanlari(form, setForm, () => void kaydet(secilenBranch), 'Güncelle')
        : null}

      {!loading && branches.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {branches.map((b: PosBranch) => (
            <div
              key={b.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: 14,
                backgroundColor: 'white',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{b.name}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                    }}
                  >
                    {b.code}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      backgroundColor: b.isActive !== false ? '#dcfce7' : '#fee2e2',
                      color: b.isActive !== false ? '#166534' : '#b91c1c',
                    }}
                  >
                    {b.isActive !== false ? 'Aktif' : 'Pasif'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                {b.sirketAdi ?? '—'}
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                VKN: {b.vkn ?? '—'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                <span style={badge(!!b.odooLocationId, `✓ loc:${b.odooLocationId}`, '✗ Odoo')}>
                  {b.odooLocationId ? `✓ loc:${b.odooLocationId}` : '✗ Odoo'}
                </span>
                <span style={badge(!!b.pdksPlaceId, `✓ place:${b.pdksPlaceId}`, '✗ PDKS')}>
                  {b.pdksPlaceId ? `✓ place:${b.pdksPlaceId}` : '✗ PDKS'}
                </span>
                <span
                  style={badge(
                    ilIlceTam(b),
                    `${b.il}/${b.ilce}`,
                    '✗ İl/İlçe',
                  )}
                >
                  {ilIlceTam(b) ? `${b.il}/${b.ilce}` : '✗ İl/İlçe'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => duzenleAc(b)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: 'white',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                Düzenle
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && branches.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Şube bulunamadı.</p>
      ) : null}
    </div>
  )
}

type OdooM2O = [number, string] | false

type OdooEmployee = {
  id: number
  name: string
  work_email?: string | false
  mobile_phone?: string | false
  job_title?: string | false
  department_id?: OdooM2O
  company_id?: OdooM2O
  ssnid?: string | false
  birthday?: string | false
}

function m2oLabel(v?: OdooM2O): string {
  if (!v || !Array.isArray(v)) return '—'
  return v[1]
}

function maskTc(ssnid?: string | false): string {
  const s = String(ssnid ?? '').replace(/\D/g, '')
  if (s.length < 4) return '***'
  return `***${s.slice(-4)}`
}

function odooEmployeeUrl(id: number) {
  return `https://www.odoo.com/odoo/employees/${id}`
}

function normalizePersonName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function UserOdooLinkRow({
  user,
  onLinked,
}: {
  user: AdminUser
  onLinked: () => void
}) {
  const [open, setOpen] = useState(false)
  const [employees, setEmployees] = useState<OdooEmployeeOption[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function openPicker() {
    setOpen(true)
    setErr(null)
    setLoading(true)
    try {
      const res = await adminApi.get('/admin/odoo-employees')
      setEmployees(res.data?.data ?? [])
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Odoo çalışanları yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  async function linkEmployee() {
    if (!selectedId) return
    setLinking(true)
    setErr(null)
    try {
      await adminApi.post(`/admin/users/${user.id}/link-employee`, {
        odooEmployeeId: Number(selectedId),
      })
      setOpen(false)
      onLinked()
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Bağlantı kurulamadı')
    } finally {
      setLinking(false)
    }
  }

  if (user.odooEmployeeId) {
    return <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>✓ Bağlı</span>
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => void openPicker()}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: 'white',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Odoo Çalışan Bağla
        </button>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: 200, padding: '6px 10px', fontSize: 12 }}
            disabled={loading || linking}
          >
            <option value="">{loading ? 'Yükleniyor...' : 'Çalışan seç'}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.job_title ? ` — ${String(e.job_title)}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedId || linking}
            onClick={() => void linkEmployee()}
            style={{ ...btnStyle, padding: '6px 12px', fontSize: 12, backgroundColor: '#059669', color: 'white' }}
          >
            {linking ? '...' : 'Bağla'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{ ...btnStyle, padding: '6px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#374151' }}
          >
            İptal
          </button>
        </div>
      )}
      {err ? <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{err}</div> : null}
    </div>
  )
}

function PersonellerTab() {
  const [employees, setEmployees] = useState<OdooEmployee[]>([])
  const [posUsers, setPosUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [empRes, usersRes] = await Promise.all([
        adminApi.get('/admin/employees'),
        adminApi.get('/admin/users'),
      ])
      setEmployees(empRes.data?.data ?? [])
      setPosUsers(usersRes.data ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Personeller yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const posUserByName = useMemo(() => {
    const map = new Map<string, AdminUser>()
    for (const u of posUsers) {
      if (!u.isActive) continue
      map.set(normalizePersonName(u.name), u)
    }
    return map
  }, [posUsers])

  return (
    <div>
      <div style={{
        marginBottom: 16,
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        backgroundColor: '#f9fafb',
        fontSize: 13,
        color: '#4b5563',
        lineHeight: 1.6,
      }}>
        Yeni personel işe alımı için → <strong>İK &amp; Prim → Personeller → + İşe Al</strong>.
        Bu sekme mevcut Odoo çalışanlarını ve POS kullanıcılarını görüntülemek / Odoo bağlantısı kurmak içindir.
      </div>

      {error ? <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p> : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}

      {!loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 8 }}>
            <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 12 }}>POS Kullanıcıları</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Ad</th>
                  <th style={{ padding: 8 }}>Kullanıcı</th>
                  <th style={{ padding: 8 }}>Rol</th>
                  <th style={{ padding: 8 }}>Odoo</th>
                </tr>
              </thead>
              <tbody>
                {posUsers.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8, fontWeight: 700 }}>{u.name}</td>
                    <td style={{ padding: 8 }}>@{u.username}</td>
                    <td style={{ padding: 8 }}>
                      <span style={roleBadgeStyle(u.role)}>{u.role}</span>
                    </td>
                    <td style={{ padding: 8 }}>
                      <UserOdooLinkRow user={u} onLinked={() => void load()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {posUsers.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: 13, margin: '8px 0 0' }}>POS kullanıcısı yok.</p>
            ) : null}
          </div>

          {employees.map((e) => {
            const posUser = posUserByName.get(normalizePersonName(e.name)) ?? null
            return (
              <div
                key={e.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{e.name}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                      {e.job_title ? String(e.job_title) : '—'} · {m2oLabel(e.department_id)} ·{' '}
                      {m2oLabel(e.company_id)}
                    </div>
                    <div style={{ fontSize: 13, color: '#374151', marginTop: 8 }}>TC: {maskTc(e.ssnid)}</div>
                    {e.mobile_phone ? (
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>📞 {String(e.mobile_phone)}</div>
                    ) : null}
                    {e.work_email ? (
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>✉️ {String(e.work_email)}</div>
                    ) : null}
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: '1px solid #f3f4f6',
                      }}
                    >
                      {posUser ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>POS:</span>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>@{posUser.username}</span>
                          <span style={roleBadgeStyle(posUser.role)}>{posUser.role}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>POS erişimi yok</span>
                      )}
                    </div>
                  </div>
                  <a
                    href={odooEmployeeUrl(e.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#1a1a2e',
                      textDecoration: 'underline',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Odoo&apos;da Görüntüle
                  </a>
                </div>
              </div>
            )
          })}
          {employees.length === 0 ? <p style={{ color: '#6b7280' }}>Personel bulunamadı.</p> : null}
        </div>
      ) : null}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 8,
        marginTop: 4,
      }}
    >
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 14,
  boxSizing: 'border-box',
}

const btnStyle: React.CSSProperties = {
  padding: '12px',
  borderRadius: 10,
  border: 'none',
  fontWeight: 800,
  cursor: 'pointer',
}

type SirketId = 'ng' | 'adese' | 'potential'

const SIRKET_TANIMLARI: Array<{ id: SirketId; label: string; tamAd: string; vkn: string; subeler: string[] }> = [
  { id: 'ng', label: 'NG', tamAd: 'Nejla Gümüşkesen Optik', vkn: '23819441406', subeler: ['GVN2', 'GVN10', 'ANADEPO'] },
  { id: 'adese', label: 'ADESE', tamAd: 'Adese Optik Ltd. Şti.', vkn: '0071251547', subeler: ['GVN1', 'GVN3', 'GVN6', 'GVN7', 'GVN8', 'GVN9'] },
  { id: 'potential', label: 'POTENTIAL', tamAd: 'Potential Ophthalmic Dış Tic. Ltd. Şti.', vkn: '', subeler: ['GVN5'] },
]

const PDKS_403_SUBELER = ['GVN6', 'GVN7', 'GVN8']

function EntegrasyonKarti({
  icon, baslik, durum, detay, onTest, onDuzenle,
}: {
  icon: string; baslik: string; durum: 'aktif' | 'pasif' | 'bekliyor' | 'hata'
  detay: string; onTest?: () => void; onDuzenle?: () => void
}) {
  const badgeMap = {
    aktif: { bg: '#dcfce7', color: '#166534', label: 'Aktif' },
    pasif: { bg: '#f3f4f6', color: '#6b7280', label: 'Pasif' },
    bekliyor: { bg: '#fef9c3', color: '#854d0e', label: 'Credentials bekleniyor' },
    hata: { bg: '#fee2e2', color: '#991b1b', label: 'Hata' },
  }
  const b = badgeMap[durum]
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{icon}</span>{baslik}
        </div>
        <span style={{ background: b.bg, color: b.color, fontSize: 11, padding: '3px 9px', borderRadius: 999, fontWeight: 700 }}>{b.label}</span>
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>{detay}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {onTest && <button type="button" onClick={onTest} style={{ ...btnStyle, fontSize: 12, padding: '4px 10px', background: '#f3f4f6', color: '#374151' }}>Test et</button>}
        {onDuzenle && <button type="button" onClick={onDuzenle} style={{ ...btnStyle, fontSize: 12, padding: '4px 10px', background: '#f3f4f6', color: '#374151' }}>{durum === 'pasif' || durum === 'bekliyor' ? 'Ayarla' : 'Düzenle'}</button>}
      </div>
    </div>
  )
}

function EntegrasyonYonlendirmeNotu() {
  return (
    <div style={{
      marginTop: 20,
      padding: '12px 14px',
      borderRadius: 10,
      border: '1px solid #e5e7eb',
      backgroundColor: '#f9fafb',
      fontSize: 12,
      color: '#4b5563',
      lineHeight: 1.6,
    }}>
      <div style={{ fontWeight: 800, color: '#1a1a2e', marginBottom: 6 }}>Şube bazlı entegrasyonlar nerede?</div>
      <div>• UTS kurum no, token ve ortam → <strong>UTS Yönetimi</strong> → Şube Tanımlamaları</div>
      <div>• Odoo lokasyon ID, PDKS mekan ID, VKN, adres → <strong>Tanımlamalar → Şubeler</strong></div>
      <div style={{ marginTop: 6, color: '#92400e' }}>
        • PDKS 403 bekleyen şubeler: {PDKS_403_SUBELER.join(', ')}
      </div>
    </div>
  )
}

function adminKayitHataMesaji(e: unknown): string {
  const err = e as { response?: { data?: { error?: string; message?: string } } }
  return err?.response?.data?.error ?? err?.response?.data?.message ?? 'Kayıt başarısız'
}

function SirketTanimlariTab() {
  const [aktifSirket, setAktifSirket] = useState<SirketId>('ng')
  const [odooInfoModal, setOdooInfoModal] = useState(false)
  const [iysModal, setIysModal] = useState(false)
  const [iysForm, setIysForm] = useState({ iys_iys_code: '', iys_brand_code: '', iys_username: '', iys_password: '' })
  const [iysYukleniyor, setIysYukleniyor] = useState(false)
  const [iysKaydediliyor, setIysKaydediliyor] = useState(false)
  const [iysAyarlar, setIysAyarlar] = useState<Record<string, string>>({})
  const [uyumsoftModal, setUyumsoftModal] = useState(false)
  const [uyumsoftForm, setUyumsoftForm] = useState({
    uyumsoft_username: '',
    uyumsoft_password: '',
    uyumsoft_gonderen_birim: '',
    uyumsoft_eirsaliye_username: '',
    uyumsoft_eirsaliye_password: '',
    uyumsoft_eirsaliye_gonderen_birim: '',
    sirket_vkn: '',
    sirket_unvan: '',
    sirket_adres: '',
    sirket_il: '',
    sirket_ilce: '',
    sirket_vergi_dairesi: '',
    sirket_telefon: '',
    sirket_eposta: '',
  })
  const [uyumsoftYukleniyor, setUyumsoftYukleniyor] = useState(false)
  const [uyumsoftKaydediliyor, setUyumsoftKaydediliyor] = useState(false)
  const [uyumsoftAyarlar, setUyumsoftAyarlar] = useState<Record<string, string>>({})
  const [gunlukRaporModal, setGunlukRaporModal] = useState(false)
  const [gunlukRaporForm, setGunlukRaporForm] = useState({ gunluk_rapor_alicilari: '' })
  const [gunlukRaporYukleniyor, setGunlukRaporYukleniyor] = useState(false)
  const [gunlukRaporKaydediliyor, setGunlukRaporKaydediliyor] = useState(false)
  const [gunlukRaporAyarlar, setGunlukRaporAyarlar] = useState<Record<string, string>>({})

  const sirket = SIRKET_TANIMLARI.find(s => s.id === aktifSirket)!

  async function iysAyarlariniYukle(sirketId: string) {
    setIysYukleniyor(true)
    try {
      const res = await adminApi.get(`/admin/sirket-ayar/${sirketId}`)
      const data = res.data?.data ?? {}
      setIysAyarlar(data)
      setIysForm({
        iys_iys_code: data.iys_iys_code ?? '',
        iys_brand_code: data.iys_brand_code ?? '',
        iys_username: data.iys_username ?? '',
        iys_password: '',
      })
    } catch { setIysAyarlar({}) } finally { setIysYukleniyor(false) }
  }

  async function iysKaydet() {
    setIysKaydediliyor(true)
    try {
      await adminApi.post(`/admin/sirket-ayar/${aktifSirket}`, { ayarlar: iysForm })
      await iysAyarlariniYukle(aktifSirket)
      setIysModal(false)
    } catch (e) { alert(adminKayitHataMesaji(e)) } finally { setIysKaydediliyor(false) }
  }

  async function uyumsoftAyarlariniYukle(sirketId: string) {
    setUyumsoftYukleniyor(true)
    try {
      const res = await adminApi.get(`/admin/sirket-ayar/${sirketId}`)
      const data = res.data?.data ?? {}
      setUyumsoftAyarlar(data)
      setUyumsoftForm({
        uyumsoft_username: data.uyumsoft_username ?? '',
        uyumsoft_password: '',
        uyumsoft_gonderen_birim: data.uyumsoft_gonderen_birim ?? '',
        uyumsoft_eirsaliye_username: data.uyumsoft_eirsaliye_username ?? '',
        uyumsoft_eirsaliye_password: '',
        uyumsoft_eirsaliye_gonderen_birim: data.uyumsoft_eirsaliye_gonderen_birim ?? '',
        sirket_vkn: data.sirket_vkn ?? '',
        sirket_unvan: data.sirket_unvan ?? '',
        sirket_adres: data.sirket_adres ?? '',
        sirket_il: data.sirket_il ?? '',
        sirket_ilce: data.sirket_ilce ?? '',
        sirket_vergi_dairesi: data.sirket_vergi_dairesi ?? '',
        sirket_telefon: data.sirket_telefon ?? '',
        sirket_eposta: data.sirket_eposta ?? '',
      })
    } catch { setUyumsoftAyarlar({}) } finally { setUyumsoftYukleniyor(false) }
  }

  async function uyumsoftKaydet() {
    setUyumsoftKaydediliyor(true)
    try {
      await adminApi.post(`/admin/sirket-ayar/${aktifSirket}`, { ayarlar: uyumsoftForm })
      await uyumsoftAyarlariniYukle(aktifSirket)
      setUyumsoftModal(false)
    } catch (e) { alert(adminKayitHataMesaji(e)) } finally { setUyumsoftKaydediliyor(false) }
  }

  async function gunlukRaporAyarlariniYukle(sirketId: string) {
    setGunlukRaporYukleniyor(true)
    try {
      const res = await adminApi.get(`/admin/sirket-ayar/${sirketId}`)
      const data = res.data?.data ?? {}
      setGunlukRaporAyarlar(data)
      setGunlukRaporForm({ gunluk_rapor_alicilari: data.gunluk_rapor_alicilari ?? '' })
    } catch { setGunlukRaporAyarlar({}) } finally { setGunlukRaporYukleniyor(false) }
  }

  async function gunlukRaporKaydet() {
    setGunlukRaporKaydediliyor(true)
    try {
      await adminApi.post(`/admin/sirket-ayar/${aktifSirket}`, { ayarlar: gunlukRaporForm })
      await gunlukRaporAyarlariniYukle(aktifSirket)
      setGunlukRaporModal(false)
    } catch (e) { alert(adminKayitHataMesaji(e)) } finally { setGunlukRaporKaydediliyor(false) }
  }

  useEffect(() => {
    void uyumsoftAyarlariniYukle(aktifSirket)
    void gunlukRaporAyarlariniYukle(aktifSirket)
  }, [aktifSirket])

  const iysAktif = !!(iysAyarlar.iys_iys_code && iysAyarlar.iys_brand_code && iysAyarlar.iys_username)
  const uyumsoftDbKayitli = !!(uyumsoftAyarlar.uyumsoft_username)
  const eirsaliyeDbKayitli = !!(uyumsoftAyarlar.uyumsoft_eirsaliye_username)
  const uyumsoftAktif = uyumsoftDbKayitli || aktifSirket === 'ng'
  const uyumsoftDetay = uyumsoftDbKayitli
    ? `${uyumsoftAyarlar.uyumsoft_username}${uyumsoftAyarlar.uyumsoft_gonderen_birim ? ` · ${uyumsoftAyarlar.uyumsoft_gonderen_birim}` : ''}${uyumsoftAyarlar.sirket_unvan ? ` · ${uyumsoftAyarlar.sirket_unvan}` : ''}${eirsaliyeDbKayitli ? ' · e-İrsaliye ayrı hesap tanımlı' : ''}`
    : aktifSirket === 'ng'
      ? 'Varsayılan (.env)'
      : 'Credentials bekleniyor'
  const gunlukRaporAliciSayisi = (gunlukRaporAyarlar.gunluk_rapor_alicilari ?? '')
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean).length

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        {SIRKET_TANIMLARI.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => setAktifSirket(s.id)}
            style={{
              padding: '8px 16px', fontSize: 13, border: 'none', borderBottom: aktifSirket === s.id ? '2px solid #1a1a2e' : '2px solid transparent',
              background: 'transparent', color: aktifSirket === s.id ? '#1a1a2e' : '#6b7280', fontWeight: aktifSirket === s.id ? 800 : 500, cursor: 'pointer',
            }}
          >{s.label}</button>
        ))}
        <button type="button" style={{ padding: '8px 16px', fontSize: 13, border: 'none', borderBottom: '2px solid transparent', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>
          + Yeni şirket
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>{sirket.label} — {sirket.tamAd}</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
          VKN: {sirket.vkn || '(girilecek)'} · Şubeler: {sirket.subeler.join(', ')}
        </div>
      </div>

      <SectionTitle>Şirket bazlı entegrasyonlar</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <EntegrasyonKarti
          icon="🧾" baslik="Uyumsoft"
          durum={uyumsoftAktif ? 'aktif' : 'bekliyor'}
          detay={uyumsoftDetay}
          onTest={uyumsoftAktif ? () => alert('Test ediliyor...') : undefined}
          onDuzenle={() => { void uyumsoftAyarlariniYukle(aktifSirket); setUyumsoftModal(true) }}
        />
        <EntegrasyonKarti
          icon="🏢" baslik="Odoo"
          durum="aktif"
          detay="Tüm şirketler aynı merkezi Odoo sunucusunu kullanır — bu şirkete özel ayrı bağlantı gerekmez."
          onDuzenle={() => setOdooInfoModal(true)}
        />
        <EntegrasyonKarti
          icon="📨" baslik="İYS / KVKK"
          durum={iysAktif ? 'aktif' : 'pasif'}
          detay={iysAktif ? `İYS Kodu: ${iysAyarlar.iys_iys_code} · Marka: ${iysAyarlar.iys_brand_code}` : 'Henüz ayarlanmadı'}
          onDuzenle={() => { void iysAyarlariniYukle(aktifSirket); setIysModal(true) }}
        />
        <EntegrasyonKarti
          icon="📧" baslik="Günlük Rapor E-postası"
          durum={gunlukRaporAliciSayisi ? 'aktif' : 'pasif'}
          detay={gunlukRaporAliciSayisi ? `${gunlukRaporAliciSayisi} sabit alıcı` : 'Henüz alıcı tanımlanmadı'}
          onDuzenle={() => { void gunlukRaporAyarlariniYukle(aktifSirket); setGunlukRaporModal(true) }}
        />
        {uyumsoftModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 480, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>Uyumsoft Ayarları — {sirket.label}</div>
              {uyumsoftYukleniyor ? <div style={{ color: '#9ca3af', fontSize: 13 }}>Yükleniyor...</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.04em', marginTop: 4 }}>WEB SERVİS (e-Fatura)</div>
                  {[
                    { key: 'uyumsoft_username', label: 'Kullanıcı Adı', placeholder: 'Uyumsoft web servis kullanıcı adı' },
                    { key: 'uyumsoft_password', label: 'Şifre', placeholder: uyumsoftAyarlar.uyumsoft_password ? '••••••••' : 'Uyumsoft web servis şifresi', tip: 'password' },
                    { key: 'uyumsoft_gonderen_birim', label: 'Gönderen Birim', placeholder: 'örn: urn:mail:defaultgb@guvenoptik.com' },
                  ].map(({ key, label, placeholder, tip }) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
                      <input
                        type={tip ?? 'text'}
                        value={(uyumsoftForm as Record<string, string>)[key]}
                        onChange={e => setUyumsoftForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }}
                      />
                    </div>
                  ))}
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.04em', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>WEB SERVİS (e-İrsaliye — ayrı portal hesabı)</div>
                  <div style={{ fontSize: 11, color: '#6b7280', background: '#f0f9ff', borderRadius: 8, padding: '8px 12px' }}>
                    e-İrsaliye e-Fatura&apos;dan farklı bir Uyumsoft hesabında olabilir. Boş bırakılırsa e-Fatura kimliği kullanılır.
                  </div>
                  {[
                    { key: 'uyumsoft_eirsaliye_username', label: 'e-İrsaliye Kullanıcı Adı', placeholder: 'DespatchIntegration kullanıcı adı' },
                    { key: 'uyumsoft_eirsaliye_password', label: 'e-İrsaliye Şifre', placeholder: uyumsoftAyarlar.uyumsoft_eirsaliye_password ? '••••••••' : 'e-İrsaliye web servis şifresi', tip: 'password' },
                    { key: 'uyumsoft_eirsaliye_gonderen_birim', label: 'e-İrsaliye Gönderen Birim (opsiyonel)', placeholder: 'örn: urn:mail:eirsaliyegb@...' },
                  ].map(({ key, label, placeholder, tip }) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
                      <input
                        type={tip ?? 'text'}
                        value={(uyumsoftForm as Record<string, string>)[key]}
                        onChange={e => setUyumsoftForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }}
                      />
                    </div>
                  ))}
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.04em', marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>ŞİRKET BİLGİLERİ (FATURA GÖNDERİCİ)</div>
                  {[
                    { key: 'sirket_vkn', label: 'VKN', placeholder: 'örn: 0071251547' },
                    { key: 'sirket_unvan', label: 'Unvan', placeholder: 'Resmi şirket unvanı' },
                    { key: 'sirket_il', label: 'İl', placeholder: 'örn: MUĞLA' },
                    { key: 'sirket_ilce', label: 'İlçe', placeholder: 'örn: Milas' },
                    { key: 'sirket_vergi_dairesi', label: 'Vergi Dairesi', placeholder: 'örn: Milas' },
                    { key: 'sirket_telefon', label: 'Telefon', placeholder: '0212 000 00 00' },
                    { key: 'sirket_eposta', label: 'E-posta', placeholder: 'info@sirket.com' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
                      <input
                        type="text"
                        value={(uyumsoftForm as Record<string, string>)[key]}
                        onChange={e => setUyumsoftForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }}
                      />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Adres</label>
                    <textarea
                      value={uyumsoftForm.sirket_adres}
                      onChange={e => setUyumsoftForm(f => ({ ...f, sirket_adres: e.target.value }))}
                      placeholder="Açık adres"
                      rows={3}
                      style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>
                  {aktifSirket === 'ng' && !uyumsoftDbKayitli ? (
                    <div style={{ fontSize: 11, color: '#6b7280', background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}>
                      Kayıt yoksa sistem mevcut .env değerlerini kullanmaya devam eder.
                    </div>
                  ) : null}
                  {!uyumsoftAyarlar.sirket_unvan ? (
                    <div style={{ fontSize: 11, color: '#6b7280', background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}>
                      Şirket bilgileri boş bırakılırsa fatura gönderici alanları mevcut varsayılan değerlerle üretilir.
                    </div>
                  ) : null}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => setUyumsoftModal(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', cursor: 'pointer', fontWeight: 700 }}>İptal</button>
                <button type="button" onClick={() => void uyumsoftKaydet()} disabled={uyumsoftKaydediliyor} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontWeight: 700 }}>{uyumsoftKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}</button>
              </div>
            </div>
          </div>
        )}
        {odooInfoModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 460, maxWidth: '90vw' }}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 12 }}>Odoo Bağlantısı — {sirket.label}</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                <p style={{ margin: '0 0 10px' }}>
                  Tek bir merkezi Odoo sunucusu var; NG, ADESE ve POTENTIAL şirketlerinin hepsi aynı sunucuya bağlanır.
                  Şirket ayrımı, Odoo içindeki <strong>company</strong> kaydıyla (şirket kimliği) yapılır — bu ekrandan ayrıca
                  bağlantı kurulmasına veya kimlik bilgisi girilmesine gerek yoktur.
                </p>
                <p style={{ margin: '0 0 10px' }}>
                  Bir satış veya stok hareketi yapıldığında, işlemin hangi şubeden geldiğine bakılıp otomatik olarak
                  doğru Odoo şirket kaydına yazılır.
                </p>
                <p style={{ margin: 0 }}>
                  Bir şubenin hangi Odoo lokasyonuna bağlı olduğunu değiştirmek isterseniz: <strong>Tanımlamalar → Şubeler</strong> →
                  ilgili şubenin "Odoo Lokasyon ID" alanından yapılır.
                </p>
              </div>
              <div style={{ display: 'flex', marginTop: 18 }}>
                <button type="button" onClick={() => setOdooInfoModal(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontWeight: 700 }}>Anladım</button>
              </div>
            </div>
          </div>
        )}
        {iysModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 420, maxWidth: '90vw' }}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>İYS / KVKK Ayarları — {sirket.label}</div>
              {iysYukleniyor ? <div style={{ color: '#9ca3af', fontSize: 13 }}>Yükleniyor...</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { key: 'iys_iys_code', label: 'İYS Kodu (iysCode)', placeholder: 'örn: 000001' },
                    { key: 'iys_brand_code', label: 'Marka Kodu (brandCode)', placeholder: 'örn: 000100' },
                    { key: 'iys_username', label: 'Kullanıcı Adı', placeholder: 'İYS API kullanıcı adı' },
                    { key: 'iys_password', label: 'Şifre', placeholder: iysAyarlar.iys_password ? '••••••••' : 'İYS API şifresi', tip: 'password' },
                  ].map(({ key, label, placeholder, tip }) => (
                    <div key={key}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
                      <input
                        type={tip ?? 'text'}
                        value={(iysForm as any)[key]}
                        onChange={e => setIysForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }}
                      />
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#6b7280', background: '#f9fafb', borderRadius: 8, padding: '8px 12px' }}>
                    Sandbox: api.sandbox.iys.org.tr · Canlı: api.iys.org.tr
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => setIysModal(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', cursor: 'pointer', fontWeight: 700 }}>İptal</button>
                <button type="button" onClick={() => void iysKaydet()} disabled={iysKaydediliyor} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontWeight: 700 }}>{iysKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}</button>
              </div>
            </div>
          </div>
        )}
        {gunlukRaporModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'white', borderRadius: 16, padding: 24, width: 480, maxWidth: '90vw' }}>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>Günlük Rapor E-postası — {sirket.label}</div>
              {gunlukRaporYukleniyor ? <div style={{ color: '#9ca3af', fontSize: 13 }}>Yükleniyor...</div> : (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                    Sabit alıcı listesi (virgülle ayırın)
                  </label>
                  <textarea
                    value={gunlukRaporForm.gunluk_rapor_alicilari}
                    onChange={(e) => setGunlukRaporForm({ gunluk_rapor_alicilari: e.target.value })}
                    placeholder="mudur@guvenoptik.com, muhasebe@guvenoptik.com"
                    style={{ width: '100%', minHeight: 90, padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const, fontFamily: 'inherit' }}
                  />
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
                    Günlük Kasa sekmesinden gönderilen raporlar bu adreslere otomatik gider.
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => setGunlukRaporModal(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', cursor: 'pointer', fontWeight: 700 }}>İptal</button>
                <button type="button" onClick={() => void gunlukRaporKaydet()} disabled={gunlukRaporKaydediliyor} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontWeight: 700 }}>{gunlukRaporKaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <EntegrasyonYonlendirmeNotu />
    </div>
  )
}

type EticaretSube = {
  id: string
  name: string
  code: string
  sirketAdi: string | null
  eticaretSubesiMi: boolean
  eticaretOncelikSirasi: number | null
}

function EticaretTab() {
  const [loading, setLoading] = useState(true)
  const [ayar, setAyar] = useState<any>(null)
  const [subeler, setSubeler] = useState<EticaretSube[]>([])
  const [kullanicilar, setKullanicilar] = useState<any[]>([])
  const [oncelikSirasi, setOncelikSirasi] = useState<EticaretSube[]>([])
  const [havuzDisi, setHavuzDisi] = useState<EticaretSube[]>([])
  const [form, setForm] = useState({ partnerApiUrl: '', partnerApiToken: '', partnerDurumGuncelleUrl: '', eticaretSubeId: '', eticaretTemsilciUserId: '' })
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [yeniAnahtar, setYeniAnahtar] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.get('/admin/eticaret/ayarlar')
      const d = res.data?.data
      setAyar(d)
      setSubeler(res.data?.subeler ?? [])
      setKullanicilar(res.data?.kullanicilar ?? [])
      setForm({
        partnerApiUrl: d?.partnerApiUrl ?? '',
        partnerApiToken: '',
        partnerDurumGuncelleUrl: d?.partnerDurumGuncelleUrl ?? '',
        eticaretSubeId: d?.eticaretSubeId ?? '',
        eticaretTemsilciUserId: d?.eticaretTemsilciUserId ?? '',
      })
      const list: EticaretSube[] = res.data?.subeler ?? []
      setOncelikSirasi(list.filter((s) => s.eticaretOncelikSirasi != null))
      setHavuzDisi(list.filter((s) => s.eticaretOncelikSirasi == null))
    } catch {
      setAyar(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function kaydet() {
    setKaydediliyor(true)
    setMesaj(null)
    try {
      await adminApi.put('/admin/eticaret/ayarlar', form)
      setMesaj('Kaydedildi.')
      await load()
    } catch (e: any) {
      setMesaj(e?.response?.data?.error ?? 'Kaydedilemedi')
    } finally {
      setKaydediliyor(false)
    }
  }

  async function anahtarYenile() {
    if (!confirm('Yeni bir API anahtarı üretilecek, eskisi geçersiz olacak. Emin misin?')) return
    try {
      const res = await adminApi.post('/admin/eticaret/api-anahtari-yenile')
      setYeniAnahtar(res.data?.bizimApiAnahtari ?? null)
      await load()
    } catch (e: any) {
      setMesaj(e?.response?.data?.error ?? 'Anahtar üretilemedi')
    }
  }

  function havuzaEkle(sube: EticaretSube) {
    setHavuzDisi((p) => p.filter((s) => s.id !== sube.id))
    setOncelikSirasi((p) => [...p, sube])
  }
  function havuzdanCikar(sube: EticaretSube) {
    setOncelikSirasi((p) => p.filter((s) => s.id !== sube.id))
    setHavuzDisi((p) => [...p, sube])
  }
  function yerDegistir(index: number, yon: -1 | 1) {
    setOncelikSirasi((p) => {
      const next = [...p]
      const hedef = index + yon
      if (hedef < 0 || hedef >= next.length) return next
      ;[next[index], next[hedef]] = [next[hedef], next[index]]
      return next
    })
  }
  async function oncelikKaydet() {
    setKaydediliyor(true)
    try {
      await adminApi.put('/admin/eticaret/oncelik-sirasi', { subeIds: oncelikSirasi.map((s) => s.id) })
      setMesaj('Öncelik sırası kaydedildi.')
      await load()
    } catch (e: any) {
      setMesaj(e?.response?.data?.error ?? 'Kaydedilemedi')
    } finally {
      setKaydediliyor(false)
    }
  }

  if (loading) return <div style={{ padding: 20, color: '#6b7280' }}>Yükleniyor...</div>

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>E-Ticaret şubesi ve satış temsilcisi</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          E-ticaret siparişleri bu sanal şube adına, bu kullanıcı "satış temsilcisi" olarak kaydedilir. Bu şubenin kendi fiziki stoğu yoktur.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <select value={form.eticaretSubeId} onChange={(e) => setForm((p) => ({ ...p, eticaretSubeId: e.target.value }))} style={inputStyle}>
            <option value="">E-Ticaret şubesi seçin...</option>
            {subeler.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
          <select value={form.eticaretTemsilciUserId} onChange={(e) => setForm((p) => ({ ...p, eticaretTemsilciUserId: e.target.value }))} style={inputStyle}>
            <option value="">Satış temsilcisi (admin) seçin...</option>
            {kullanicilar.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 24, borderTop: '1px solid #f3f4f6', paddingTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Stok karşılama öncelik sırası</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          Sipariş geldiğinde şubeler bu sırayla kontrol edilir, stoğu olan ilk şube siparişi karşılar. Zamanla değişebilir.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Öncelik sırası</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, minHeight: 120 }}>
              {oncelikSirasi.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#9ca3af', minWidth: 18 }}>{i + 1}</span>
                  <span style={{ flex: 1 }}>{s.name} <span style={{ color: '#9ca3af' }}>({s.sirketAdi ?? '—'})</span></span>
                  <button type="button" onClick={() => yerDegistir(i, -1)} disabled={i === 0} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>↑</button>
                  <button type="button" onClick={() => yerDegistir(i, 1)} disabled={i === oncelikSirasi.length - 1} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>↓</button>
                  <button type="button" onClick={() => havuzdanCikar(s)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>Çıkar</button>
                </div>
              ))}
              {oncelikSirasi.length === 0 && <div style={{ padding: 16, fontSize: 12, color: '#9ca3af' }}>Henüz şube eklenmedi.</div>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Havuz dışı şubeler</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, minHeight: 120 }}>
              {havuzDisi.filter((s) => !s.eticaretSubesiMi).map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                  <span style={{ flex: 1 }}>{s.name} <span style={{ color: '#9ca3af' }}>({s.sirketAdi ?? '—'})</span></span>
                  <button type="button" onClick={() => havuzaEkle(s)} style={{ border: 'none', background: 'none', color: '#1a1a2e', fontWeight: 700, cursor: 'pointer' }}>Ekle →</button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button type="button" onClick={() => void oncelikKaydet()} disabled={kaydediliyor} style={{ ...btnStyle, marginTop: 12, width: 220 }}>
          {kaydediliyor ? 'Kaydediliyor...' : 'Öncelik sırasını kaydet'}
        </button>
      </div>

      <div style={{ marginBottom: 24, borderTop: '1px solid #f3f4f6', paddingTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Bize verilen API anahtarı (partner buradan stok/ürün çeker)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <code style={{ background: '#f3f4f6', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{ayar?.bizimApiAnahtari ?? '—'}</code>
          <button type="button" onClick={() => void anahtarYenile()} style={{ ...btnStyle, width: 160 }}>Anahtarı yenile</button>
        </div>
        {yeniAnahtar && (
          <div style={{ fontSize: 12, color: '#166534', background: '#dcfce7', padding: '8px 12px', borderRadius: 8 }}>
            Yeni anahtar: <code>{yeniAnahtar}</code> — bu anahtar bir daha tam olarak gösterilmeyecek, şimdi partnere ilet.
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Partner'ın bize verdiği API bilgileri (sipariş çekmek için)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <input placeholder="Sipariş API adresi (URL)" value={form.partnerApiUrl} onChange={(e) => setForm((p) => ({ ...p, partnerApiUrl: e.target.value }))} style={inputStyle} />
          <input placeholder={ayar?.partnerApiToken ? `Token (kayıtlı: ${ayar.partnerApiToken})` : 'Token'} value={form.partnerApiToken} onChange={(e) => setForm((p) => ({ ...p, partnerApiToken: e.target.value }))} style={inputStyle} />
        </div>
        <input placeholder="Durum güncelleme URL'i (opsiyonel — kargoya verildi bilgisini iletmek için)" value={form.partnerDurumGuncelleUrl} onChange={(e) => setForm((p) => ({ ...p, partnerDurumGuncelleUrl: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} />
        <button type="button" onClick={() => void kaydet()} disabled={kaydediliyor} style={{ ...btnStyle, width: 160 }}>
          {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        {mesaj && <div style={{ fontSize: 12, color: '#374151', marginTop: 8 }}>{mesaj}</div>}
      </div>
    </div>
  )
}
