import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { adminApi } from './AdminLayout'
import {
  reportEngineAdminApi,
  type ReportField,
  type ReportRequestRow,
  type ReportTemplateRow,
} from '../../api/report-engine.api'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const ROLES = [
  'SALES_STAFF',
  'STORE_MANAGER',
  'WAREHOUSE_MANAGER',
  'REGIONAL_MANAGER',
  'ACCOUNTANT',
  'ADMIN',
] as const

const ROLE_LABELS: Record<string, string> = {
  SALES_STAFF: 'Satış Personeli',
  STORE_MANAGER: 'Mağaza Müdürü',
  WAREHOUSE_MANAGER: 'Depo Müdürü',
  REGIONAL_MANAGER: 'Bölge Müdürü',
  ACCOUNTANT: 'Muhasebeci',
  ADMIN: 'Yönetici',
}

type BranchRow = { id: string; name: string; code: string }
type UserRow = { id: string; name: string; username: string; role: string }

function adminUserRole() {
  try {
    const raw = localStorage.getItem('admin-user')
    return raw ? (JSON.parse(raw) as { role?: string; id?: string }).role : null
  } catch {
    return null
  }
}

function adminUserId() {
  try {
    const raw = localStorage.getItem('admin-user')
    return raw ? (JSON.parse(raw) as { id?: string }).id : null
  } catch {
    return null
  }
}

function toIsoStart(date: string) {
  if (!date) return undefined
  return `${date}T00:00:00.000Z`
}

function toIsoEnd(date: string) {
  if (!date) return undefined
  return `${date}T23:59:59.999Z`
}

function toggleItem(list: string[], key: string, max: number) {
  if (list.includes(key)) return list.filter((k) => k !== key)
  if (list.length >= max) return list
  return [...list, key]
}

export default function RaporMatrisPage() {
  const isAdmin = adminUserRole() === 'ADMIN'
  const [dimensions, setDimensions] = useState<ReportField[]>([])
  const [measures, setMeasures] = useState<ReportField[]>([])
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([])
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([])
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [subeId, setSubeId] = useState('')
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [templateAd, setTemplateAd] = useState('')
  const [templateAciklama, setTemplateAciklama] = useState('')
  const [accessUserIds, setAccessUserIds] = useState<string[]>([])
  const [accessRoles, setAccessRoles] = useState<string[]>([])
  const [savedTemplate, setSavedTemplate] = useState<ReportTemplateRow | null>(null)
  const [scheduleSiklik, setScheduleSiklik] = useState<'GUNLUK' | 'HAFTALIK' | 'AYLIK'>('GUNLUK')
  const [scheduleSaat, setScheduleSaat] = useState('09:00')
  const [scheduleGun, setScheduleGun] = useState(1)
  const [requests, setRequests] = useState<ReportRequestRow[]>([])
  const [saveLoading, setSaveLoading] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      reportEngineAdminApi.getAvailableFields(),
      adminApi.get<BranchRow[]>('/admin/branch-list'),
      adminApi.get<UserRow[]>('/admin/users'),
      reportEngineAdminApi.listRequests(),
    ]).then(([fields, branchRes, userRes, reqList]) => {
      setDimensions(fields.dimensions)
      setMeasures(fields.measures)
      setBranches(branchRes.data)
      setUsers(userRes.data.filter((u) => u.role))
      setRequests(reqList)
      const me = adminUserId()
      if (me) setAccessUserIds([me])
    }).catch(() => setError('Veriler yüklenemedi.'))
  }, [])

  const chartData = useMemo(() => {
    if (!rows.length || !selectedDimensions.length || !selectedMeasures.length) return null
    const dimKey = selectedDimensions[0]
    const measureKey = selectedMeasures[0]
    const labels = rows.map((r) => String(r[dimKey] ?? ''))
    const values = rows.map((r) => Number(r[measureKey] ?? 0))
    const dimLabel = dimensions.find((d) => d.key === dimKey)?.label ?? dimKey
    const measureLabel = measures.find((m) => m.key === measureKey)?.label ?? measureKey
    return {
      labels,
      datasets: [{ label: measureLabel, data: values, backgroundColor: '#C8102E' }],
      dimLabel,
      measureLabel,
    }
  }, [rows, selectedDimensions, selectedMeasures, dimensions, measures])

  const tableColumns = useMemo(
    () => [...selectedDimensions, ...selectedMeasures],
    [selectedDimensions, selectedMeasures],
  )

  function buildQueryBody() {
    const filters: Record<string, string> = {}
    const start = toIsoStart(dateStart)
    const end = toIsoEnd(dateEnd)
    if (start) filters.tarihBaslangic = start
    if (end) filters.tarihBitis = end
    if (subeId) filters.subeId = subeId
    return {
      dimensions: selectedDimensions,
      measures: selectedMeasures,
      filters,
    }
  }

  async function handlePreview() {
    if (selectedDimensions.length === 0 || selectedMeasures.length === 0) {
      setError('En az bir boyut ve bir ölçü seçin.')
      return
    }
    setPreviewLoading(true)
    setError(null)
    setMessage(null)
    try {
      const res = await reportEngineAdminApi.queryReport(buildQueryBody())
      setRows(res.rows)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? 'Önizleme başarısız.')
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleSaveTemplate() {
    if (!templateAd.trim()) {
      setError('Şablon adı gerekli.')
      return
    }
    if (selectedDimensions.length === 0 || selectedMeasures.length === 0) {
      setError('Kaydetmeden önce boyut ve ölçü seçin.')
      return
    }
    setSaveLoading(true)
    setError(null)
    setMessage(null)
    try {
      const body = buildQueryBody()
      const template = await reportEngineAdminApi.createTemplate({
        ad: templateAd.trim(),
        aciklama: templateAciklama.trim() || undefined,
        boyutlar: body.dimensions,
        olculer: body.measures,
        filtreler: body.filters,
        erisimler: {
          userIds: accessUserIds,
          roles: accessRoles,
        },
      })
      setSavedTemplate(template)
      setMessage(`"${template.ad}" şablonu kaydedildi.`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? 'Şablon kaydedilemedi.')
    } finally {
      setSaveLoading(false)
    }
  }

  async function handleCreateSchedule() {
    if (!savedTemplate) return
    setScheduleLoading(true)
    setError(null)
    try {
      await reportEngineAdminApi.createSchedule({
        reportTemplateId: savedTemplate.id,
        siklik: scheduleSiklik,
        saat: scheduleSaat,
        gun: scheduleSiklik === 'GUNLUK' ? undefined : scheduleGun,
      })
      setMessage('Otomatik e-posta zamanlaması eklendi.')
      const updated = await reportEngineAdminApi.listTemplates()
      const found = updated.find((t) => t.id === savedTemplate.id)
      if (found) setSavedTemplate(found)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? 'Zamanlama eklenemedi.')
    } finally {
      setScheduleLoading(false)
    }
  }

  function toggleAccessUser(id: string) {
    setAccessUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function toggleAccessRole(role: string) {
    setAccessRoles((prev) =>
      prev.includes(role) ? prev.filter((x) => x !== role) : [...prev, role],
    )
  }

  if (!isAdmin) {
    return <Navigate to="/admin/tanimlamalar" replace />
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900 }}>Rapor Matrisi</h1>
      <p style={{ margin: '0 0 20px', color: '#6b7280' }}>
        Boyut ve ölçü seçerek rapor oluşturun, şablon kaydedin ve otomatik e-posta planlayın.
      </p>

      {error ? (
        <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      ) : null}
      {message ? (
        <div style={{ padding: 12, background: '#ecfdf5', color: '#047857', borderRadius: 8, marginBottom: 16 }}>
          {message}
        </div>
      ) : null}

      <section style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Bekleyen Rapor Talepleri</h2>
        {requests.length === 0 ? (
          <p style={{ margin: 0, color: '#6b7280' }}>Bekleyen talep yok.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {requests.map((r) => (
              <div
                key={r.id}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 12,
                  background: '#fafafa',
                }}
              >
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {new Date(r.createdAt).toLocaleString('tr-TR')}
                </div>
                <div style={{ marginTop: 4 }}>{r.istekMetni}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
        <aside style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800 }}>Boyutlar (max 3)</h3>
          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            {dimensions.map((d) => {
              const active = selectedDimensions.includes(d.key)
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setSelectedDimensions((prev) => toggleItem(prev, d.key, 3))}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: active ? '2px solid #C8102E' : '1px solid #e5e7eb',
                    background: active ? '#fef2f2' : '#fff',
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 800 }}>Ölçüler (max 5)</h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {measures.map((m) => {
              const active = selectedMeasures.includes(m.key)
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setSelectedMeasures((prev) => toggleItem(prev, m.key, 5))}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: active ? '2px solid #C8102E' : '1px solid #e5e7eb',
                    background: active ? '#fef2f2' : '#fff',
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
        </aside>

        <div style={{ display: 'grid', gap: 16 }}>
          <section style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Filtreler</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                Başlangıç
                <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                Bitiş
                <input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                Şube
                <select value={subeId} onChange={(e) => setSubeId(e.target.value)} style={{ minWidth: 180 }}>
                  <option value="">Tümü</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={previewLoading}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#C8102E',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {previewLoading ? 'Yükleniyor…' : 'Önizle'}
              </button>
            </div>
          </section>

          {rows.length > 0 ? (
            <section style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Sonuçlar</h2>
              {chartData ? (
                <div style={{ height: 280, marginBottom: 16 }}>
                  <Bar
                    data={{ labels: chartData.labels, datasets: chartData.datasets }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: true } },
                    }}
                  />
                </div>
              ) : null}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {tableColumns.map((col) => (
                        <th
                          key={col}
                          style={{
                            textAlign: 'left',
                            padding: 8,
                            borderBottom: '2px solid #e5e7eb',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {dimensions.find((d) => d.key === col)?.label
                            ?? measures.find((m) => m.key === col)?.label
                            ?? col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx}>
                        {tableColumns.map((col) => (
                          <td key={col} style={{ padding: 8, borderBottom: '1px solid #f3f4f6' }}>
                            {String(row[col] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>Şablonu Kaydet</h2>
            <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                Ad
                <input value={templateAd} onChange={(e) => setTemplateAd(e.target.value)} />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                Açıklama
                <textarea
                  value={templateAciklama}
                  onChange={(e) => setTemplateAciklama(e.target.value)}
                  rows={2}
                />
              </label>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Erişim — Kullanıcılar</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 120, overflowY: 'auto' }}>
                  {users.map((u) => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={accessUserIds.includes(u.id)}
                        onChange={() => toggleAccessUser(u.id)}
                      />
                      {u.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Erişim — Roller</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ROLES.map((role) => (
                    <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={accessRoles.includes(role)}
                        onChange={() => toggleAccessRole(role)}
                      />
                      {ROLE_LABELS[role] ?? role}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleSaveTemplate()}
                disabled={saveLoading}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#1a1a2e',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  width: 'fit-content',
                }}
              >
                {saveLoading ? 'Kaydediliyor…' : 'Şablonu Kaydet'}
              </button>
            </div>
          </section>

          {savedTemplate ? (
            <section style={{ background: '#fff', borderRadius: 12, padding: 16 }}>
              <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>
                Otomatik E-posta — {savedTemplate.ad}
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Sıklık
                  <select
                    value={scheduleSiklik}
                    onChange={(e) => setScheduleSiklik(e.target.value as typeof scheduleSiklik)}
                  >
                    <option value="GUNLUK">Günlük</option>
                    <option value="HAFTALIK">Haftalık</option>
                    <option value="AYLIK">Aylık</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  Saat
                  <input
                    type="time"
                    value={scheduleSaat}
                    onChange={(e) => setScheduleSaat(e.target.value)}
                  />
                </label>
                {scheduleSiklik !== 'GUNLUK' ? (
                  <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
                    {scheduleSiklik === 'HAFTALIK' ? 'Haftanın günü (0=Pazar)' : 'Ayın günü'}
                    <input
                      type="number"
                      min={scheduleSiklik === 'HAFTALIK' ? 0 : 1}
                      max={scheduleSiklik === 'HAFTALIK' ? 6 : 31}
                      value={scheduleGun}
                      onChange={(e) => setScheduleGun(Number(e.target.value))}
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleCreateSchedule()}
                  disabled={scheduleLoading}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#C8102E',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {scheduleLoading ? 'Ekleniyor…' : 'Zamanlama Ekle'}
                </button>
              </div>
              {savedTemplate.zamanlamalar?.length ? (
                <ul style={{ marginTop: 12, paddingLeft: 20, color: '#374151' }}>
                  {savedTemplate.zamanlamalar.map((z) => (
                    <li key={z.id}>
                      {z.siklik} — {z.saat}
                      {z.gun != null ? ` (gün: ${z.gun})` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
