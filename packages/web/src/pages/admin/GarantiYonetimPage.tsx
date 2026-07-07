import { useEffect, useState, useCallback, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { adminApi } from './AdminLayout'
import { getWarrantyStatsAdmin, type WarrantyClaim } from '../../api/warranty.api'
import WarrantyDetailPanel from './WarrantyDetailPanel'

type AdminRole = 'ADMIN' | 'STORE_MANAGER' | 'WAREHOUSE_MANAGER' | 'SALES_STAFF' | 'REGIONAL_MANAGER' | 'ACCOUNTANT'

const ADMIN_PANEL_ROLES: AdminRole[] = ['ADMIN', 'STORE_MANAGER', 'WAREHOUSE_MANAGER']

function getAdminUser(): { role?: AdminRole; id?: string; name?: string } | null {
  try {
    const raw = localStorage.getItem('admin-user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const DURUM_LABEL: Record<string, string> = {
  OPEN: 'Açık', SENT_TO_SUPPLIER: 'Firmaya gönderildi',
  WAITING_RESPONSE: 'Yanıt bekleniyor', IN_RETURN_PROCESS: 'İade sürecinde',
  RESOLVED: 'Çözümlendi', OUT_OF_WARRANTY: 'Garanti dışı',
}
const DURUM_RENK: Record<string, string> = {
  OPEN: { bg: '#fef9c3', color: '#854d0e' },
  SENT_TO_SUPPLIER: { bg: '#dbeafe', color: '#1e40af' },
  WAITING_RESPONSE: { bg: '#ede9fe', color: '#4c1d95' },
  IN_RETURN_PROCESS: { bg: '#fce7f3', color: '#831843' },
  RESOLVED: { bg: '#dcfce7', color: '#166534' },
  OUT_OF_WARRANTY: { bg: '#fee2e2', color: '#991b1b' },
}
const KATEGORI_LABEL: Record<string, string> = {
  LENS_RX: 'Cam', OPTICAL_FRAME_READY: 'Optik Çerçeve',
  OPTICAL_FRAME_RX: 'Optik Çerçeve', SUNGLASSES_READY: 'Güneş Gözlüğü',
  SUNGLASSES_RX: 'Güneş Gözlüğü', CONTACT_LENS_READY: 'Kontak Lens',
  CONTACT_LENS_RX: 'Kontak Lens', SOLUTION: 'Solüsyon', ACCESSORY: 'Aksesuar',
}

type ViewMode = 'liste' | 'tedarikci'

type SupplierSummary = {
  supplierName: string
  openCount: number
  nearestDeadline: string | null
}

function daysUntilDeadline(iso: string | null) {
  if (!iso) return Infinity
  return (new Date(iso).getTime() - Date.now()) / 86400000
}

function isUrgentDeadline(iso: string | null) {
  const d = daysUntilDeadline(iso)
  return d <= 3 && d >= 0
}

function claimDeadlineUrgent(c: WarrantyClaim & { returnDeadline?: string | null }) {
  return isUrgentDeadline(c.returnDeadline ?? null)
}

export default function GarantiYonetimPage() {
  const adminUser = useMemo(() => getAdminUser(), [])
  const role = adminUser?.role

  const [stats, setStats] = useState<any>(null)
  const [claims, setClaims] = useState<WarrantyClaim[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [katFilter, setKatFilter] = useState('')
  const [panelClaimId, setPanelClaimId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [subeMap, setSubeMap] = useState<Record<string, string>>({})
  const [branches, setBranches] = useState<Array<{ id: string; name?: string; code?: string }>>([])
  const [viewMode, setViewMode] = useState<ViewMode>('liste')
  const [supplierSummary, setSupplierSummary] = useState<SupplierSummary[]>([])
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null)

  const isStoreManager = role === 'STORE_MANAGER'

  const supplierSuggestions = useMemo(
    () => [...new Set(claims.map((c) => c.supplierName).filter(Boolean) as string[])],
    [claims],
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [s, cRes] = await Promise.all([
        getWarrantyStatsAdmin(),
        adminApi.get('/warranty/claims', {
          params: {
            q: search || undefined,
            status: statusFilter || undefined,
            type: typeFilter || undefined,
          },
        }),
      ])
      setStats(s)
      let list = cRes.data ?? []
      if (katFilter) list = list.filter((cl: WarrantyClaim) => cl.productCategory === katFilter)
      setClaims(list)
    } catch {
      setClaims([])
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, typeFilter, katFilter])

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await adminApi.get('/warranty/claims/suppliers-summary')
      const list: SupplierSummary[] = res.data ?? []
      list.sort((a, b) => {
        const aU = isUrgentDeadline(a.nearestDeadline)
        const bU = isUrgentDeadline(b.nearestDeadline)
        if (aU !== bU) return aU ? -1 : 1
        return b.openCount - a.openCount
      })
      setSupplierSummary(list)
    } catch {
      setSupplierSummary([])
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  useEffect(() => {
    if (viewMode === 'tedarikci' && !isStoreManager) void loadSuppliers()
  }, [viewMode, isStoreManager, loadSuppliers])

  useEffect(() => {
    adminApi.get('/admin/branch-list').then((r) => {
      const list = r.data?.data ?? r.data ?? []
      const map: Record<string, string> = {}
      const arr: Array<{ id: string; name?: string; code?: string }> = []
      list.forEach((b: any) => {
        map[b.id] = b.name ?? b.code
        arr.push({ id: b.id, name: b.name, code: b.code })
      })
      setSubeMap(map)
      setBranches(arr)
    }).catch(() => {})
  }, [])

  if (!role || !ADMIN_PANEL_ROLES.includes(role)) {
    return <Navigate to="/admin/login" replace />
  }

  function renderClaimRows(list: WarrantyClaim[]) {
    if (loading) {
      return <tr><td colSpan={8} style={{ padding: 16, color: '#6b7280', textAlign: 'center' }}>Yükleniyor...</td></tr>
    }
    if (list.length === 0) {
      return <tr><td colSpan={8} style={{ padding: 16, color: '#6b7280', textAlign: 'center' }}>Kayıt bulunamadı.</td></tr>
    }
    return list.map((c) => {
      const renk = DURUM_RENK[c.status] ?? { bg: '#f3f4f6', color: '#374151' }
      const urgent = claimDeadlineUrgent(c as WarrantyClaim & { returnDeadline?: string | null })
      return (
        <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6', background: urgent ? '#fffbeb' : undefined }}>
          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#C8102E' }}>
            {urgent && <span title="İade son tarihi yaklaşıyor" style={{ marginRight: 4 }}>⚠️</span>}
            {c.claimNo}
          </td>
          <td style={{ padding: '10px 12px' }}>{new Date(c.createdAt).toLocaleDateString('tr-TR')}</td>
          <td style={{ padding: '10px 12px', fontWeight: 500 }}>{c.customer?.name ?? '—'}</td>
          <td style={{ padding: '10px 12px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.productName ?? '—'}</td>
          <td style={{ padding: '10px 12px' }}>{c.productCategory ? (KATEGORI_LABEL[c.productCategory] ?? c.productCategory) : '—'}</td>
          <td style={{ padding: '10px 12px', color: '#6b7280' }}>{subeMap[c.branchId ?? ''] ?? c.branchId ?? '—'}</td>
          <td style={{ padding: '10px 12px' }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: renk.bg, color: renk.color, fontWeight: 600 }}>
              {DURUM_LABEL[c.status] ?? c.status}
            </span>
          </td>
          <td style={{ padding: '10px 12px' }}>
            <button
              type="button"
              onClick={() => setPanelClaimId(c.id)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #e5e7eb', background: 'white', fontWeight: 600 }}
            >
              Detay
            </button>
          </td>
        </tr>
      )
    })
  }

  const claimsTable = (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
            {['GTK No', 'Tarih', 'Müşteri', 'Ürün', 'Kategori', 'Şube', 'Durum', ''].map((h) => (
              <td key={h} style={{ padding: '10px 12px', color: '#6b7280', fontWeight: 600 }}>{h}</td>
            ))}
          </tr>
        </thead>
        <tbody>{renderClaimRows(claims)}</tbody>
      </table>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Garanti & İade</h1>
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
          {role === 'ADMIN' ? 'Yönetici' : role === 'WAREHOUSE_MANAGER' ? 'Depo' : 'Mağaza Müdürü'}
        </span>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: '1.5rem' }}>
          {[
            { lbl: 'Açık', val: stats.open, color: '#854d0e' },
            { lbl: 'Firmada', val: stats.sent, color: '#1e40af' },
            { lbl: 'Çözümlendi', val: stats.resolved, color: '#166534' },
            { lbl: 'Garanti dışı', val: stats.outOfWarranty, color: '#991b1b' },
          ].map((c) => (
            <div key={c.lbl} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{c.lbl}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="GTK no, barkod, müşteri..."
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
          <option value="">Tüm durumlar</option>
          {Object.entries(DURUM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
          <option value="">Tüm tipler</option>
          <option value="CUSTOMER_WARRANTY">Garanti (müşteri)</option>
          <option value="STOCK_WARRANTY">Garanti (stok)</option>
          <option value="SATISFACTION_RETURN">Memnuniyet iadesi</option>
          <option value="EXCESS_ORDER_RETURN">Fazla sipariş iadesi</option>
        </select>
        <select value={katFilter} onChange={(e) => setKatFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
          <option value="">Tüm kategoriler</option>
          {Object.entries(KATEGORI_LABEL).filter(([k], i, a) => a.findIndex(([, v]) => v === KATEGORI_LABEL[k]) === i).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {!isStoreManager && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 12, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
          {([
            ['liste', 'Liste'],
            ['tedarikci', 'Tedarikçi Bazlı Grupla'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => { setViewMode(mode); setExpandedSupplier(null) }}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: viewMode === mode ? '#1a1a2e' : 'white',
                color: viewMode === mode ? 'white' : '#374151',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {viewMode === 'liste' || isStoreManager ? claimsTable : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {supplierSummary.length === 0 && !loading && (
            <div style={{ padding: 16, color: '#6b7280', textAlign: 'center', background: 'white', borderRadius: 10, border: '1px solid #e5e7eb' }}>
              Tedarikçi özeti bulunamadı.
            </div>
          )}
          {supplierSummary.map((s) => {
            const urgent = isUrgentDeadline(s.nearestDeadline)
            const open = expandedSupplier === s.supplierName
            const supplierClaims = claims.filter(
              (c) => c.supplierName?.toLowerCase() === s.supplierName.toLowerCase(),
            )
            return (
              <div
                key={s.supplierName}
                style={{
                  border: `1px solid ${urgent ? '#fde68a' : '#e5e7eb'}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: urgent ? '#fffbeb' : 'white',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedSupplier(open ? null : s.supplierName)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#1a1a2e' }}>
                      {urgent && <span style={{ marginRight: 6 }}>⚠️</span>}
                      {s.supplierName}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {s.openCount} açık talep
                      {s.nearestDeadline && (
                        <> · En yakın son tarih: {new Date(s.nearestDeadline).toLocaleDateString('tr-TR')}</>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 18, color: '#9ca3af' }}>{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <div style={{ borderTop: '1px solid #e5e7eb' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          {['GTK No', 'Tarih', 'Müşteri', 'Ürün', 'Kategori', 'Şube', 'Durum', ''].map((h) => (
                            <td key={h} style={{ padding: '8px 12px', color: '#6b7280', fontWeight: 600 }}>{h}</td>
                          ))}
                        </tr>
                      </thead>
                      <tbody>{renderClaimRows(supplierClaims)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <WarrantyDetailPanel
        claimId={panelClaimId}
        open={panelClaimId != null}
        onClose={() => setPanelClaimId(null)}
        onUpdated={() => { void loadData(); if (viewMode === 'tedarikci') void loadSuppliers() }}
        role={role as 'ADMIN' | 'STORE_MANAGER' | 'WAREHOUSE_MANAGER'}
        adminUserId={(adminUser as { id?: string; userId?: string } | null)?.id ?? (adminUser as { userId?: string } | null)?.userId}
        branches={branches}
        subeMap={subeMap}
        supplierSuggestions={supplierSuggestions}
      />
    </div>
  )
}
