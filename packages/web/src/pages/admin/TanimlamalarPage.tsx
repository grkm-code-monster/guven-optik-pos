import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from './AdminLayout'

type TabId = 'komisyon' | 'personeller' | 'subeler' | 'sirket-tanimlari'

const INSTALLMENTS = [1, 2, 3, 6, 9, 12] as const
const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'SALES_STAFF', label: 'Satış Personeli' },
  { value: 'SALES_PERSON', label: 'Satış Temsilcisi' },
  { value: 'STORE_MANAGER', label: 'Mağaza Müdürü' },
  { value: 'REGIONAL_MANAGER', label: 'Bölge Müdürü' },
  { value: 'ACCOUNTANT', label: 'Muhasebe' },
  { value: 'ADMIN', label: 'Yönetici' },
]

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

type OdooBranch = {
  id: number
  name: string
  street?: string | false
  phone?: string | false
  email?: string | false
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
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20 }}>
        {tab === 'komisyon' ? <KomisyonTab /> : null}
        {tab === 'personeller' ? <PersonellerTab /> : null}
        {tab === 'subeler' ? <SubelerTab /> : null}
        {tab === 'sirket-tanimlari' ? <SirketTanimlariTab /> : null}
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

  return (
    <div>
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

      {!loading && banks.length === 0 ? <p style={{ color: '#6b7280' }}>Kayıtlı banka bulunamadı.</p> : null}
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
  uyumsoftUser?: string | null
  adres?: string | null
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
  uyumsoftUser: '',
  uyumsoftPass: '',
  adres: '',
  telefon: '',
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
          <input
            placeholder="Adres"
            value={f.adres}
            onChange={(e) => setF((p) => ({ ...p, adres: e.target.value }))}
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
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
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="Uyumsoft kullanıcı"
              value={f.uyumsoftUser}
              onChange={(e) => setF((p) => ({ ...p, uyumsoftUser: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              placeholder="Uyumsoft şifre"
              type="password"
              value={f.uyumsoftPass}
              onChange={(e) => setF((p) => ({ ...p, uyumsoftPass: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
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
      uyumsoftUser: b.uyumsoftUser ?? '',
      uyumsoftPass: '',
      adres: b.adres ?? '',
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
                <span style={badge(!!b.uyumsoftUser, '✓ UYM', '✗ UYM')}>
                  {b.uyumsoftUser ? '✓ UYM' : '✗ UYM'}
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

type OdooDepartment = {
  id: number
  name: string
  company_id?: OdooM2O
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

function defaultGuvenCompanyId(companies: OdooBranch[]): string {
  const guven = companies.find((c) => String(c.name).toUpperCase().includes('GÜVEN'))
  return guven ? String(guven.id) : companies[0] ? String(companies[0].id) : ''
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
  const [companies, setCompanies] = useState<OdooBranch[]>([])
  const [departments, setDepartments] = useState<OdooDepartment[]>([])
  const [posUsers, setPosUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [tcKimlik, setTcKimlik] = useState('')
  const [dogumTarihi, setDogumTarihi] = useState('')
  const [iseBaslamaTarihi, setIseBaslamaTarihi] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [mobilePhone, setMobilePhone] = useState('')
  const [workEmail, setWorkEmail] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<string>('SALES_STAFF')
  const [branchId, setBranchId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [empRes, deptRes, branchRes, usersRes] = await Promise.all([
        adminApi.get('/admin/employees'),
        adminApi.get('/admin/departments'),
        adminApi.get('/admin/branches'),
        adminApi.get('/admin/users'),
      ])
      const loadedCompanies: OdooBranch[] = branchRes.data?.data ?? []
      setEmployees(empRes.data?.data ?? [])
      setDepartments(deptRes.data?.data ?? [])
      setCompanies(loadedCompanies)
      setPosUsers(usersRes.data ?? [])
      const guvenId = defaultGuvenCompanyId(loadedCompanies)
      if (guvenId) setCompanyId(guvenId)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Personeller yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const branchOptions = useMemo(() => {
    const fromUsers = [...new Set(posUsers.map((u) => u.branchId).filter(Boolean))]
    if (fromUsers.length > 0) {
      return fromUsers.map((id) => ({ value: id, label: `POS Şube: ${id.slice(0, 8)}…` }))
    }
    return companies.map((c) => ({ value: String(c.id), label: c.name }))
  }, [posUsers, companies])

  const filteredDepartments = useMemo(() => {
    if (!companyId) return departments
    return departments.filter((d) => {
      const cid = Array.isArray(d.company_id) ? d.company_id[0] : null
      return cid === Number(companyId)
    })
  }, [departments, companyId])

  const posUserByName = useMemo(() => {
    const map = new Map<string, AdminUser>()
    for (const u of posUsers) {
      if (!u.isActive) continue
      map.set(normalizePersonName(u.name), u)
    }
    return map
  }, [posUsers])

  function openCreate() {
    setName('')
    setTcKimlik('')
    setDogumTarihi('')
    setIseBaslamaTarihi('')
    setCompanyId(defaultGuvenCompanyId(companies))
    setDepartmentId('')
    setJobTitle('')
    setMobilePhone('')
    setWorkEmail('')
    setUsername('')
    setPin('')
    setRole('SALES_STAFF')
    setBranchId(branchOptions[0]?.value ?? '')
    setModalOpen(true)
  }

  async function saveEmployee() {
    if (!name.trim()) {
      setError('Ad Soyad zorunludur.')
      return
    }
    if (username.trim() && pin.trim() && !branchId.trim()) {
      setError('POS erişimi için şube seçin.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await adminApi.post('/admin/employees', {
        name: name.trim(),
        tcKimlik: tcKimlik.trim() || undefined,
        dogumTarihi: dogumTarihi || undefined,
        iseBaslamaTarihi: iseBaslamaTarihi || undefined,
        companyId: companyId ? Number(companyId) : 1,
        departmentId: departmentId ? Number(departmentId) : undefined,
        jobTitle: jobTitle.trim() || undefined,
        mobilePhone: mobilePhone.trim() || undefined,
        workEmail: workEmail.trim() || undefined,
        username: username.trim() || undefined,
        pin: pin.trim() || undefined,
        role: username.trim() ? role : undefined,
        branchId: branchId.trim() || undefined,
      })
      if (!res.data?.success) {
        setError(res.data?.error ?? 'Kayıt başarısız')
        return
      }
      setModalOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          type="button"
          onClick={openCreate}
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
          + Yeni Personel
        </button>
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

      {modalOpen ? (
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
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 520,
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontWeight: 900 }}>Yeni Personel</h2>

            <SectionTitle>Zorunlu</SectionTitle>
            <input
              placeholder="Ad Soyad *"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              style={{ ...inputStyle, marginBottom: 16 }}
            />

            <SectionTitle>Kişisel</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <input
                placeholder="TC Kimlik No"
                value={tcKimlik}
                onChange={(ev) => setTcKimlik(ev.target.value)}
                style={inputStyle}
                maxLength={11}
              />
              <label style={{ fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>Doğum Tarihi</span>
                <input
                  type="date"
                  value={dogumTarihi}
                  onChange={(ev) => setDogumTarihi(ev.target.value)}
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              </label>
            </div>

            <SectionTitle>Çalışma</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <label style={{ fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>İşe Başlama Tarihi</span>
                <input
                  type="date"
                  value={iseBaslamaTarihi}
                  onChange={(ev) => setIseBaslamaTarihi(ev.target.value)}
                  style={{ ...inputStyle, marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>Şirket</span>
                <select
                  value={companyId}
                  onChange={(ev) => {
                    setCompanyId(ev.target.value)
                    setDepartmentId('')
                  }}
                  style={{ ...inputStyle, marginTop: 4 }}
                >
                  <option value="">Şirket seçin...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>Departman</span>
                <select
                  value={departmentId}
                  onChange={(ev) => setDepartmentId(ev.target.value)}
                  style={{ ...inputStyle, marginTop: 4 }}
                >
                  <option value="">Departman seçin...</option>
                  {filteredDepartments.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <input
                placeholder="Unvan"
                value={jobTitle}
                onChange={(ev) => setJobTitle(ev.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="Telefon"
                value={mobilePhone}
                onChange={(ev) => setMobilePhone(ev.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="E-posta"
                type="email"
                value={workEmail}
                onChange={(ev) => setWorkEmail(ev.target.value)}
                style={inputStyle}
              />
            </div>

            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: '#6b7280',
                letterSpacing: '0.06em',
                marginBottom: 8,
                marginTop: 4,
              }}
            >
              POS ERİŞİMİ (Opsiyonel)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <input
                placeholder="Kullanıcı Adı"
                value={username}
                onChange={(ev) => setUsername(ev.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="PIN"
                type="password"
                maxLength={6}
                value={pin}
                onChange={(ev) => setPin(ev.target.value)}
                style={inputStyle}
              />
              <select value={role} onChange={(ev) => setRole(ev.target.value)} style={inputStyle}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <label style={{ fontSize: 12 }}>
                <span style={{ color: '#6b7280', fontWeight: 600 }}>Şube</span>
                <select
                  value={branchId}
                  onChange={(ev) => setBranchId(ev.target.value)}
                  style={{ ...inputStyle, marginTop: 4 }}
                >
                  <option value="">Şube seçin...</option>
                  {branchOptions.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{ ...btnStyle, flex: 1, backgroundColor: '#f3f4f6', color: '#111' }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveEmployee()}
                style={{ ...btnStyle, flex: 1, backgroundColor: '#1a1a2e', color: 'white' }}
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
  { id: 'adese', label: 'ADESE', tamAd: 'Adese Optik Ltd. Şti.', vkn: '', subeler: ['GVN1', 'GVN3', 'GVN6', 'GVN7', 'GVN8', 'GVN9'] },
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

function SubeBlok({ sube, sirketId }: { sube: string; sirketId: SirketId }) {
  const [acik, setAcik] = useState(false)
  const pdks403 = PDKS_403_SUBELER.includes(sube)
  const ngSubeler = ['GVN2', 'GVN10']
  const pdksAktif = sirketId === 'ng' && ngSubeler.includes(sube)
  const utsAktif = sirketId === 'ng' && ngSubeler.includes(sube)

  const pdksDurum = pdks403 ? 'hata' : pdksAktif ? 'aktif' : 'pasif'
  const pdksDetay = pdks403 ? 'Patron PDKS: 403 hatası — destek bekleniyor' : pdksAktif ? 'Mekan ID tanımlı' : 'Mekan ID girilmedi'

  const ozet = [
    `PDKS ${pdksAktif ? '✓' : pdks403 ? '⚠' : '—'}`,
    `UTS ${utsAktif ? '✓' : '—'}`,
    'WhatsApp —',
    'Worldline —',
  ].join(' · ')

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
      <div
        onClick={() => setAcik(a => !a)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f9fafb', cursor: 'pointer' }}
      >
        <div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#1a1a2e' }}>{sube}</span>
          <span style={{ fontSize: 12, color: pdks403 ? '#991b1b' : '#6b7280', marginLeft: 10 }}>{ozet}</span>
        </div>
        <span style={{ fontSize: 12, color: '#9ca3af', transform: acik ? 'rotate(180deg)' : 'rotate(0)', display: 'inline-block', transition: 'transform .2s' }}>▼</span>
      </div>
      {acik && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid #e5e7eb' }}>
          <SubeEntegrasyon baslik="Patron PDKS" durum={pdksDurum} alanAdi="Mekan ID" alanDeger={pdksAktif ? '(kayıtlı)' : ''} />
          <SubeEntegrasyon baslik="UTS token" durum={utsAktif ? 'aktif' : 'pasif'} alanAdi="Token" alanDeger={utsAktif ? '••••••••••' : ''} />
          <SubeEntegrasyon baslik="WhatsApp" durum="pasif" alanAdi="Telefon no" alanDeger="" />
          <SubeEntegrasyon baslik="Worldline terminal" durum="pasif" alanAdi="Terminal ID" alanDeger="" sonMu />
        </div>
      )}
    </div>
  )
}

function SubeEntegrasyon({ baslik, durum, alanAdi, alanDeger, sonMu }: {
  baslik: string; durum: 'aktif' | 'pasif' | 'hata'; alanAdi: string; alanDeger: string; sonMu?: boolean
}) {
  const badgeMap = {
    aktif: { bg: '#dcfce7', color: '#166534', label: 'Aktif' },
    pasif: { bg: '#f3f4f6', color: '#6b7280', label: 'Pasif' },
    hata: { bg: '#fee2e2', color: '#991b1b', label: 'Hata' },
  }
  const b = badgeMap[durum]
  return (
    <div style={{ borderBottom: sonMu ? 'none' : '1px solid #f3f4f6', paddingBottom: 10, marginBottom: sonMu ? 0 : 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{baslik}</span>
        <span style={{ background: b.bg, color: b.color, fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 700 }}>{b.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#6b7280', minWidth: 80 }}>{alanAdi}</span>
        <span style={{ fontSize: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 8px', flex: 1, color: alanDeger ? '#1a1a2e' : '#9ca3af' }}>
          {alanDeger || '—'}
        </span>
        <button type="button" style={{ ...btnStyle, fontSize: 12, padding: '4px 10px', background: '#f3f4f6', color: '#374151' }}>
          {durum === 'aktif' ? 'Düzenle' : 'Ayarla'}
        </button>
      </div>
    </div>
  )
}

function SirketTanimlariTab() {
  const [aktifSirket, setAktifSirket] = useState<SirketId>('ng')
  const [iysModal, setIysModal] = useState(false)
  const [iysForm, setIysForm] = useState({ iys_iys_code: '', iys_brand_code: '', iys_username: '', iys_password: '' })
  const [iysYukleniyor, setIysYukleniyor] = useState(false)
  const [iysKaydediliyor, setIysKaydediliyor] = useState(false)
  const [iysAyarlar, setIysAyarlar] = useState<Record<string, string>>({})

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
    } catch { alert('Kayıt başarısız') } finally { setIysKaydediliyor(false) }
  }

  const iysAktif = !!(iysAyarlar.iys_iys_code && iysAyarlar.iys_brand_code && iysAyarlar.iys_username)

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
          durum={aktifSirket === 'ng' ? 'aktif' : 'bekliyor'}
          detay={aktifSirket === 'ng' ? 'NejlaGumuskesen_WebServis' : 'Credentials bekleniyor'}
          onTest={aktifSirket === 'ng' ? () => alert('Test ediliyor...') : undefined}
          onDuzenle={() => alert('Düzenle')}
        />
        <EntegrasyonKarti
          icon="🏢" baslik="Odoo"
          durum={aktifSirket === 'ng' ? 'aktif' : 'pasif'}
          detay={aktifSirket === 'ng' ? 'localhost:8069 · odoo_ng' : '—'}
          onTest={aktifSirket === 'ng' ? () => alert('Test ediliyor...') : undefined}
          onDuzenle={() => alert('Düzenle')}
        />
        <EntegrasyonKarti
          icon="📨" baslik="İYS / KVKK"
          durum={iysAktif ? 'aktif' : 'pasif'}
          detay={iysAktif ? `İYS Kodu: ${iysAyarlar.iys_iys_code} · Marka: ${iysAyarlar.iys_brand_code}` : 'Henüz ayarlanmadı'}
          onDuzenle={() => { void iysAyarlariniYukle(aktifSirket); setIysModal(true) }}
        />
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
      </div>

      <SectionTitle>Şube bazlı entegrasyonlar</SectionTitle>
      {sirket.subeler.map(sube => (
        <SubeBlok key={sube} sube={sube} sirketId={aktifSirket} />
      ))}
    </div>
  )
}
