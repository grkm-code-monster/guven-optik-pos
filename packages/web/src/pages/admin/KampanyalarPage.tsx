import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type CampaignInput,
  type CampaignRecord,
  type CampaignType,
  createCampaign,
  deleteCampaign,
  listCampaigns,
  patchCampaign,
  updateCampaign,
} from '../../api/campaigns.api'
import { adminApi } from './AdminLayout'

const TYPE_OPTIONS: Array<{ value: CampaignType; label: string }> = [
  { value: 'KASA', label: 'Kasa İndirimi' },
  { value: 'NAKIT_ORAN', label: 'Nakit Oran' },
  { value: 'IKI_AL_BIR_ODE', label: 'İki Al Bir Öde' },
  { value: 'URUN_BAZLI', label: 'Ürün Bazlı' },
  { value: 'COMBO', label: 'Combo' },
  { value: 'FORMUL', label: 'Formül' },
]

const SCOPE_OPTIONS = [
  { value: 'ALL', label: 'Tümü' },
  { value: 'CATEGORY', label: 'Kategori' },
  { value: 'PRODUCT', label: 'Ürün' },
  { value: 'CUSTOMER_SEGMENT', label: 'Müşteri Segmenti' },
] as const

type OdooBranch = { id: number; name: string }

type FormState = {
  name: string
  description: string
  type: CampaignType
  scope: CampaignInput['scope']
  scopeValue: string
  discountPct: string
  discountTL: string
  minBasket: string
  minQty: string
  formulMultiplier: string
  formulExtra: string
  formulMargin: string
  comboBuyQty: string
  comboPayQty: string
  startDate: string
  endDate: string
  priority: string
  autoApply: boolean
  manualAlso: boolean
  isActive: boolean
}

function emptyForm(): FormState {
  return {
    name: '',
    description: '',
    type: 'KASA',
    scope: 'ALL',
    scopeValue: '',
    discountPct: '',
    discountTL: '',
    minBasket: '',
    minQty: '0',
    formulMultiplier: '',
    formulExtra: '',
    formulMargin: '',
    comboBuyQty: '2',
    comboPayQty: '1',
    startDate: '',
    endDate: '',
    priority: '10',
    autoApply: true,
    manualAlso: false,
    isActive: true,
  }
}

function recordToForm(c: CampaignRecord): FormState {
  const combo = c.comboConfig ?? {}
  return {
    name: c.name,
    description: c.description ?? '',
    type: c.type,
    scope: c.scope,
    scopeValue: c.scopeValue ?? '',
    discountPct: c.discountPct != null ? String(c.discountPct) : '',
    discountTL: c.discountTL != null ? String(c.discountTL) : '',
    minBasket: c.minBasket != null ? String(c.minBasket) : '',
    minQty: c.minQty != null ? String(c.minQty) : '0',
    formulMultiplier: c.formulMultiplier != null ? String(c.formulMultiplier) : '',
    formulExtra: c.formulExtra != null ? String(c.formulExtra) : '',
    formulMargin: c.formulMargin != null ? String(c.formulMargin) : '',
    comboBuyQty: combo.buyQty != null ? String(combo.buyQty) : '2',
    comboPayQty: combo.payQty != null ? String(combo.payQty) : '1',
    startDate: c.startDate ? c.startDate.slice(0, 10) : '',
    endDate: c.endDate ? c.endDate.slice(0, 10) : '',
    priority: String(c.priority ?? 10),
    autoApply: c.autoApply,
    manualAlso: c.manualAlso,
    isActive: c.isActive,
  }
}

function formToInput(f: FormState): CampaignInput {
  const num = (s: string) => {
    const n = Number(String(s).replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return {
    name: f.name.trim(),
    description: f.description.trim() || undefined,
    type: f.type,
    scope: f.scope,
    scopeValue: f.scopeValue.trim() || undefined,
    discountPct: num(f.discountPct),
    discountTL: num(f.discountTL),
    minBasket: num(f.minBasket),
    minQty: parseInt(f.minQty, 10) || 0,
    formulMultiplier: num(f.formulMultiplier),
    formulExtra: num(f.formulExtra),
    formulMargin: num(f.formulMargin),
    comboConfig:
      f.type === 'COMBO'
        ? { buyQty: parseInt(f.comboBuyQty, 10) || 2, payQty: parseInt(f.comboPayQty, 10) || 1 }
        : null,
    startDate: f.startDate || null,
    endDate: f.endDate || null,
    priority: parseInt(f.priority, 10) || 10,
    autoApply: f.autoApply,
    manualAlso: f.manualAlso,
    isActive: f.isActive,
    branchOverrides: [],
  }
}

function typeLabel(t: CampaignType): string {
  return TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t
}

export default function KampanyalarPage() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([])
  const [branches, setBranches] = useState<OdooBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CampaignRecord | null>(null)
  const [form, setForm] = useState<FormState>(() => emptyForm())
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rows, branchRes] = await Promise.all([
        listCampaigns(),
        adminApi.get('/admin/branches').catch(() => ({ data: { data: [] } })),
      ])
      setCampaigns(rows)
      const bData = branchRes.data?.data ?? branchRes.data ?? []
      setBranches(Array.isArray(bData) ? bData : [])
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.response?.data?.message ?? 'Kampanyalar yüklenemedi')
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'active') return campaigns.filter((c) => c.isActive)
    if (filter === 'inactive') return campaigns.filter((c) => !c.isActive)
    return campaigns
  }, [campaigns, filter])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(c: CampaignRecord) {
    setEditing(c)
    setForm(recordToForm(c))
    setModalOpen(true)
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const input = formToInput(form)
      if (editing) await updateCampaign(editing.id, input)
      else await createCampaign(input)
      setModalOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.response?.data?.message ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: CampaignRecord) {
    setError(null)
    try {
      await patchCampaign(c.id, { isActive: !c.isActive })
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.response?.data?.message ?? 'Güncelleme başarısız')
    }
  }

  async function remove(c: CampaignRecord) {
    if (!window.confirm(`"${c.name}" silinsin mi?`)) return
    setError(null)
    try {
      await deleteCampaign(c.id)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.response?.data?.message ?? 'Silme başarısız')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Kampanyalar</h1>
        <button type="button" onClick={openCreate} style={primaryBtn}>
          + Yeni Kampanya
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['all', 'active', 'inactive'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid #e5e7eb',
              backgroundColor: filter === f ? '#1a1a2e' : 'white',
              color: filter === f ? 'white' : '#374151',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'Tümü' : f === 'active' ? 'Aktif' : 'Pasif'}
          </button>
        ))}
      </div>

      {error ? <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p> : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}

      {!loading && filtered.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((c) => (
            <div key={c.id} style={cardStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800 }}>{c.name}</span>
                  <span style={badge(c.isActive ? '#dcfce7' : '#f3f4f6', c.isActive ? '#166534' : '#6b7280')}>
                    {c.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                  <span style={badge('#ede9fe', '#5b21b6')}>{typeLabel(c.type)}</span>
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>Öncelik: {c.priority}</span>
                </div>
                {c.description ? <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{c.description}</div> : null}
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                  {c.startDate ? `Başlangıç: ${c.startDate.slice(0, 10)}` : 'Başlangıç: —'}
                  {' · '}
                  {c.endDate ? `Bitiş: ${c.endDate.slice(0, 10)}` : 'Bitiş: —'}
                  {c.discountPct != null ? ` · %${c.discountPct}` : ''}
                  {c.discountTL != null ? ` · ${c.discountTL}₺` : ''}
                </div>
                {c.branchOverrides && c.branchOverrides.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    {c.branchOverrides.length} şube özelleştirmesi
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => openEdit(c)} style={ghostBtn}>
                  Düzenle
                </button>
                <button type="button" onClick={() => void toggleActive(c)} style={ghostBtn}>
                  {c.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                </button>
                <button type="button" onClick={() => void remove(c)} style={{ ...ghostBtn, color: '#b91c1c' }}>
                  Sil
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Kampanya bulunamadı.</p>
      ) : null}

      {branches.length > 0 && !modalOpen ? (
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 24 }}>
          Şube listesi Odoo lokasyonlarından yüklendi ({branches.length} kayıt). Şube özelleştirmesi düzenleme ekranında genişletilebilir.
        </p>
      ) : null}

      {modalOpen ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h2 style={{ margin: '0 0 16px', fontWeight: 900 }}>{editing ? 'Kampanya Düzenle' : 'Yeni Kampanya'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '70vh', overflow: 'auto' }}>
              <Field label="Ad *">
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} />
              </Field>
              <Field label="Açıklama">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Tür">
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CampaignType }))}
                    style={inputStyle}
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Kapsam">
                  <select
                    value={form.scope}
                    onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as FormState['scope'] }))}
                    style={inputStyle}
                  >
                    {SCOPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {form.scope !== 'ALL' ? (
                <Field label="Kapsam değeri">
                  <input
                    value={form.scopeValue}
                    onChange={(e) => setForm((f) => ({ ...f, scopeValue: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              ) : null}
              {(form.type === 'KASA' || form.type === 'NAKIT_ORAN' || form.type === 'URUN_BAZLI') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="İndirim %">
                    <input
                      value={form.discountPct}
                      onChange={(e) => setForm((f) => ({ ...f, discountPct: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="İndirim ₺">
                    <input
                      value={form.discountTL}
                      onChange={(e) => setForm((f) => ({ ...f, discountTL: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                </div>
              )}
              {form.type === 'COMBO' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Al adet">
                    <input
                      value={form.comboBuyQty}
                      onChange={(e) => setForm((f) => ({ ...f, comboBuyQty: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Öde adet">
                    <input
                      value={form.comboPayQty}
                      onChange={(e) => setForm((f) => ({ ...f, comboPayQty: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                </div>
              ) : null}
              {form.type === 'FORMUL' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Field label="Çarpan">
                    <input
                      value={form.formulMultiplier}
                      onChange={(e) => setForm((f) => ({ ...f, formulMultiplier: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Ekstra ₺">
                    <input
                      value={form.formulExtra}
                      onChange={(e) => setForm((f) => ({ ...f, formulExtra: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Marj %">
                    <input
                      value={form.formulMargin}
                      onChange={(e) => setForm((f) => ({ ...f, formulMargin: e.target.value }))}
                      style={inputStyle}
                    />
                  </Field>
                </div>
              ) : null}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Field label="Min sepet ₺">
                  <input
                    value={form.minBasket}
                    onChange={(e) => setForm((f) => ({ ...f, minBasket: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Min adet">
                  <input
                    value={form.minQty}
                    onChange={(e) => setForm((f) => ({ ...f, minQty: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Öncelik">
                  <input
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Başlangıç">
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Bitiş">
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.autoApply}
                  onChange={(e) => setForm((f) => ({ ...f, autoApply: e.target.checked }))}
                />
                Otomatik uygula
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.manualAlso}
                  onChange={(e) => setForm((f) => ({ ...f, manualAlso: e.target.checked }))}
                />
                Manuel seçimde de göster
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Aktif
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setModalOpen(false)} style={{ ...btnStyle, flex: 1, backgroundColor: '#f3f4f6' }}>
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving || !form.name.trim()}
                onClick={() => void save()}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151' }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  )
}

function badge(bg: string, color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    backgroundColor: bg,
    color,
  }
}

const cardStyle: React.CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
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

const primaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: 'none',
  backgroundColor: '#1a1a2e',
  color: 'white',
  fontWeight: 800,
  cursor: 'pointer',
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 999,
  border: '1px solid #e5e7eb',
  backgroundColor: 'white',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 50,
}

const modalStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: 12,
  padding: 24,
  width: '100%',
  maxWidth: 560,
  maxHeight: '90vh',
  overflow: 'auto',
}
