import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from './AdminLayout'

type TabId = 'komisyon' | 'personeller' | 'subeler'

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
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', padding: 20 }}>
        {tab === 'komisyon' ? <KomisyonTab /> : null}
        {tab === 'personeller' ? <PersonellerTab /> : null}
        {tab === 'subeler' ? <SubelerTab /> : null}
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

type OdooLocation = {
  id: number
  name: string
  complete_name?: string
  company_id?: [number, string] | false
}

function SubelerTab() {
  const [locations, setLocations] = useState<OdooLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.get('/admin/branches')
      if (!res.data?.success) {
        setError(res.data?.error ?? 'Lokasyonlar yüklenemedi')
        setLocations([])
        return
      }
      setLocations(res.data.data ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Lokasyonlar yüklenemedi')
      setLocations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 900 }}>Şubeler</h2>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <a
          href="http://localhost:8069/web#action=stock.action_location_form"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            backgroundColor: '#fff',
            color: '#1a1a2e',
            fontWeight: 800,
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          Odoo&apos;da Yönet
        </a>
      </div>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
        Mağaza lokasyonları Odoo stok modülünden yönetilir. Aşağıdaki liste aktif iç lokasyonlardan çekilir.
      </p>

      {error ? <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p> : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}

      {!loading && locations.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {locations.map((loc) => (
            <div
              key={loc.id}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15 }}>{loc.name}</div>
              {loc.complete_name ? (
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{loc.complete_name}</div>
              ) : null}
              {Array.isArray(loc.company_id) ? (
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>{loc.company_id[1]}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {!loading && locations.length === 0 && !error ? (
        <p style={{ color: '#6b7280' }}>Aktif lokasyon bulunamadı.</p>
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
