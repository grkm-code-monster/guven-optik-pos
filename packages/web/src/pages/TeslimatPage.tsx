import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../api/client'
import { useAuthStore } from '../store/auth.store'

const PRIMARY = '#8B0000'
const ACCENT = '#c0392b'

type StatusFilter = 'ALL' | 'ORDERED' | 'IN_LAB' | 'READY' | 'DELIVERED'

type SaleItem = {
  id: string
  status: string
  odooProductName?: string | null
  product?: { name: string; category?: string } | null
}

type DeliverySale = {
  id: string
  createdAt: string
  branchId: string
  customer?: { name: string; phone: string } | null
  items: SaleItem[]
}

type OdooLocation = { id: number; name: string }

const STATUS_PILLS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'ALL', label: 'Tümü' },
  { id: 'ORDERED', label: '🔵 Sipariş Verildi' },
  { id: 'IN_LAB', label: '🟡 Laboratuvarda' },
  { id: 'READY', label: '🟢 Hazır' },
  { id: 'DELIVERED', label: 'Teslim Edildi' },
]

const ITEM_ACTIONS: Array<{ status: string; label: string }> = [
  { status: 'ORDERED', label: 'Siparişe Verildi' },
  { status: 'IN_LAB', label: "Lab'a Gönder" },
  { status: 'READY', label: 'Hazır' },
  { status: 'DELIVERED', label: 'Teslim Et' },
]

function fmtDate(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR')
  } catch {
    return iso
  }
}

function itemLabel(item: SaleItem) {
  return item.odooProductName || item.product?.name || 'Ürün'
}

function itemStatusBadge(status: string) {
  const s = status?.toUpperCase?.() ?? ''
  const map: Record<string, { label: string; bg: string; color: string }> = {
    ORDERED: { label: 'Sipariş Verildi', bg: '#dbeafe', color: '#1e40af' },
    IN_LAB: { label: 'Laboratuvarda', bg: '#fef9c3', color: '#854d0e' },
    READY: { label: 'Hazır', bg: '#dcfce7', color: '#166534' },
    DELIVERED: { label: 'Teslim Edildi', bg: '#f3f4f6', color: '#6b7280' },
    PENDING: { label: 'Beklemede', bg: '#ffedd5', color: '#9a3412' },
  }
  const c = map[s] ?? { label: status, bg: '#f3f4f6', color: '#374151' }
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        backgroundColor: c.bg,
        color: c.color,
      }}
    >
      {c.label}
    </span>
  )
}

function cardBorderColor(items: SaleItem[]) {
  if (items.some((i) => i.status === 'READY')) return '#22c55e'
  if (items.some((i) => i.status === 'IN_LAB')) return '#eab308'
  if (items.some((i) => i.status === 'ORDERED')) return '#3b82f6'
  return '#9ca3af'
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export default function TeslimatPage() {
  const userBranchId = useAuthStore((s) => s.user?.branchId)

  const [sales, setSales] = useState<DeliverySale[]>([])
  const [locations, setLocations] = useState<OdooLocation[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (branchFilter && isUuid(branchFilter)) params.branchId = branchFilter
      const res = await apiClient.get('/sales/delivery', { params })
      const data: DeliverySale[] = res.data?.data ?? res.data ?? []
      setSales(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Teslimat listesi yüklenemedi')
      setSales([])
    } finally {
      setLoading(false)
    }
  }, [branchFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    apiClient
      .get('/admin/branches')
      .then((res) => setLocations(res.data?.data ?? []))
      .catch(() => setLocations([]))
  }, [])

  const visibleSales = useMemo(() => {
    return sales
      .map((sale) => {
        const items =
          statusFilter === 'ALL'
            ? sale.items.filter((i) => ['ORDERED', 'IN_LAB', 'READY'].includes(i.status))
            : sale.items.filter((i) => i.status === statusFilter)
        return { ...sale, items }
      })
      .filter((s) => s.items.length > 0)
  }, [sales, statusFilter])

  const stats = useMemo(() => {
    const pending = sales.filter((s) =>
      s.items.some((i) => ['ORDERED', 'IN_LAB', 'READY'].includes(i.status)),
    )
    return {
      total: pending.length,
      inLab: pending.filter((s) => s.items.some((i) => i.status === 'IN_LAB')).length,
      ready: pending.filter((s) => s.items.some((i) => i.status === 'READY')).length,
    }
  }, [sales])

  async function updateItemStatus(saleId: string, itemId: string, status: string) {
    const key = `${saleId}-${itemId}`
    setUpdatingKey(key)
    setError(null)
    try {
      await apiClient.patch(`/sales/${saleId}/items/${itemId}/status`, { status })
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Durum güncellenemedi')
    } finally {
      setUpdatingKey(null)
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${PRIMARY} 0%, #5c0000 100%)`,
          padding: '28px 24px',
          borderRadius: '0 0 24px 24px',
          margin: '-16px -16px 24px',
          color: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Teslimat</h1>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
              Sipariş ve teslimat durumu takibi
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, textAlign: 'right' }}>
            <span>
              Toplam bekleyen: <strong>{stats.total}</strong> satış
            </span>
            <span>
              Laboratuvarda: <strong>{stats.inLab}</strong>
            </span>
            <span>
              Hazır teslim: <strong>{stats.ready}</strong>
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1 }}>
          {STATUS_PILLS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setStatusFilter(p.id)}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: statusFilter === p.id ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
                backgroundColor: statusFilter === p.id ? '#fff5f5' : '#fff',
                color: statusFilter === p.id ? ACCENT : '#374151',
                fontWeight: statusFilter === p.id ? 800 : 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 13,
            minWidth: 160,
          }}
        >
          <option value="">Tüm şubeler</option>
          {userBranchId ? (
            <option value={userBranchId}>POS şubem</option>
          ) : null}
          {locations.map((loc) => (
            <option key={loc.id} value="">
              {loc.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: ACCENT,
            color: 'white',
            fontWeight: 800,
            fontSize: 13,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          Yenile
        </button>
      </div>

      {error ? <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p> : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}

      {!loading && statusFilter === 'DELIVERED' ? (
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          Teslim edilmiş kalemler bu listede görünmez. Diğer durum filtrelerini kullanın.
        </p>
      ) : null}

      {!loading && statusFilter !== 'DELIVERED' && visibleSales.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Gösterilecek satış bulunamadı.</p>
      ) : null}

      {!loading && visibleSales.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {visibleSales.map((sale) => (
            <div
              key={sale.id}
              style={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderLeft: `4px solid ${cardBorderColor(sale.items)}`,
                borderRadius: 12,
                padding: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                transition: 'box-shadow 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 900, fontSize: 16, color: ACCENT }}>
                  {sale.customer?.name ?? '—'}
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{sale.customer?.phone ?? '—'}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                  {fmtDate(sale.createdAt)} · #{String(sale.id).slice(0, 8)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sale.items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      borderTop: '1px solid #f3f4f6',
                      paddingTop: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{itemLabel(item)}</span>
                      {itemStatusBadge(item.status)}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {ITEM_ACTIONS.map((action) => {
                        const active = item.status === action.status
                        return (
                          <button
                            key={action.status}
                            type="button"
                            disabled={updatingKey === `${sale.id}-${item.id}`}
                            onClick={() => void updateItemStatus(sale.id, item.id, action.status)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              fontSize: 11,
                              fontWeight: active ? 800 : 600,
                              border: active ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
                              backgroundColor: active ? '#fff5f5' : '#fafafa',
                              color: active ? ACCENT : '#374151',
                              cursor: updatingKey ? 'wait' : 'pointer',
                            }}
                          >
                            {action.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
