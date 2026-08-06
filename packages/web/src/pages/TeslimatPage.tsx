import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../api/client'
import { useAuthStore } from '../store/auth.store'
import {
  getSubeOzelSiparisler,
  kaydetOzelSiparisKarekodlar,
  musteriTeslimOzelSiparis,
  type OzelSiparis,
} from '../api/ozelSiparis.api'
import { OZEL_SIPARIS_DURUM_RENK, normalizeOzelSiparisDurum } from '../constants/ozelSiparis'
import { isLensMeasurementSaleItem } from '../utils/saleMeasurements'
import type { SaleItem as SaleItemType } from '../api/types'
import BarkodKameraInput from '../components/BarkodKameraInput'

const PRIMARY = '#8B0000'
const ACCENT = '#c0392b'

type PageTab = 'teslimat' | 'kargo-tara' | 'ozel-hazir'
type StatusFilter = 'ALL' | 'ORDERED' | 'IN_LAB' | 'READY' | 'DELIVERED'

type SaleItem = SaleItemType & {
  status: string
  atolyeBranchId?: string | null
  sentToLabAt?: string | null
}

type AtolyeBranch = { id: string; name: string; code: string }

type DeliverySale = {
  id: string
  createdAt: string
  branchId: string
  customer?: { name: string; phone: string } | null
  items: SaleItem[]
}

type OdooLocation = { id: number; name: string }

const PAGE_TABS: Array<{ id: PageTab; label: string }> = [
  { id: 'teslimat', label: 'Satış Teslimat' },
  { id: 'kargo-tara', label: 'Kargo Tara' },
  { id: 'ozel-hazir', label: 'Özel Sipariş Teslim' },
]

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

function KargoTaraPanel() {
  const [siparisler, setSiparisler] = useState<OzelSiparis[]>([])
  const [secili, setSecili] = useState<OzelSiparis | null>(null)
  const [tarananlar, setTarananlar] = useState<string[]>([])
  const [barkodInput, setBarkodInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const yukle = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSubeOzelSiparisler(['KARGODA', 'TESLIM_ALINDI'])
      setSiparisler(data)
    } catch {
      setSiparisler([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void yukle() }, [yukle])

  useEffect(() => {
    if (secili) {
      setTarananlar([])
      setBarkodInput('')
    }
  }, [secili])

  function barkodEkle(raw: string) {
    const kod = raw.trim()
    if (!kod || tarananlar.includes(kod)) return
    setTarananlar((p) => [...p, kod])
    setBarkodInput('')
  }

  async function kodlariGonder() {
    if (!secili || !tarananlar.length) return
    setGonderiliyor(true)
    setMesaj(null)
    try {
      await kaydetOzelSiparisKarekodlar(secili.id, tarananlar)
      setMesaj({ tip: 'ok', text: 'Kodlar kaydedildi, sipariş teslim alındı olarak işaretlendi' })
      setSecili(null)
      setTarananlar([])
      await yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Kayıt başarısız' })
    } finally {
      setGonderiliyor(false)
    }
  }

  return (
    <div>
      {mesaj ? (
        <p style={{ color: mesaj.tip === 'ok' ? '#166534' : '#ef4444', fontSize: 13, marginBottom: 12 }}>{mesaj.text}</p>
      ) : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: secili ? '1fr 1.1fr' : '1fr', gap: 16 }}>
        <div>
          {!loading && siparisler.length === 0 ? (
            <p style={{ color: '#6b7280' }}>Kargoda veya teslim alınmış sipariş yok.</p>
          ) : null}
          {siparisler.map((s) => {
            const d = OZEL_SIPARIS_DURUM_RENK[normalizeOzelSiparisDurum(s.durum)]
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSecili(s)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  border: `2px solid ${secili?.id === s.id ? ACCENT : '#e5e7eb'}`,
                  borderRadius: 12, padding: 14, marginBottom: 10, cursor: 'pointer', backgroundColor: 'white',
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14 }}>{s.urunAdi}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.musteriAdi} · {s.miktar} adet</div>
                <span style={{ fontSize: 11, marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 20, backgroundColor: d?.bg, color: d?.color, fontWeight: 700 }}>
                  {d?.label ?? s.durum}
                </span>
              </button>
            )
          })}
        </div>

        {secili ? (
          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>{secili.urunAdi}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 1.6 }}>
              <div><strong>Müşteri:</strong> {secili.musteriAdi}</div>
              <div><strong>Telefon:</strong> {secili.musteriTelefon || '—'}</div>
              <div><strong>Beklenen adet:</strong> {secili.miktar}</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <BarkodKameraInput
                value={barkodInput}
                onChange={setBarkodInput}
                onScan={(kod) => barkodEkle(kod)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    barkodEkle(barkodInput)
                  }
                }}
                placeholder="Barkod okutun..."
                inputStyle={{ border: '2px solid #e5e7eb', fontSize: 14 }}
              />
            </div>

            {tarananlar.length > 0 ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Taranan kodlar</div>
                {tarananlar.map((k) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>
                    <span style={{ fontFamily: 'monospace' }}>{k}</span>
                  </div>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void kodlariGonder()}
              disabled={gonderiliyor || tarananlar.length === 0}
              style={{
                width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                backgroundColor: tarananlar.length ? ACCENT : '#d1d5db',
                color: 'white', fontWeight: 800, fontSize: 14, cursor: tarananlar.length ? 'pointer' : 'not-allowed',
              }}
            >
              {gonderiliyor ? 'Gönderiliyor...' : 'Taranan kodları gönder'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function OzelHazirPanel() {
  const [siparisler, setSiparisler] = useState<OzelSiparis[]>([])
  const [loading, setLoading] = useState(true)
  const [islemId, setIslemId] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const yukle = useCallback(async () => {
    setLoading(true)
    try {
      setSiparisler(await getSubeOzelSiparisler(['HAZIR']))
    } catch {
      setSiparisler([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void yukle() }, [yukle])

  async function teslimEt(s: OzelSiparis) {
    setIslemId(s.id)
    setMesaj(null)
    try {
      const res = await musteriTeslimOzelSiparis(s.id)
      if (res.waLink) {
        window.open(res.waLink, '_blank', 'noopener,noreferrer')
      }
      setMesaj({ tip: 'ok', text: 'Sipariş teslim edildi' + (res.odooSonuc ? ` · ${res.odooSonuc}` : '') })
      await yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Teslim kaydedilemedi' })
    } finally {
      setIslemId(null)
    }
  }

  return (
    <div>
      {mesaj ? (
        <p style={{ color: mesaj.tip === 'ok' ? '#166534' : '#ef4444', fontSize: 13, marginBottom: 12 }}>{mesaj.text}</p>
      ) : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}
      {!loading && siparisler.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Hazır özel sipariş yok.</p>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {siparisler.map((s) => (
          <div key={s.id} style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderLeft: '4px solid #22c55e', borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: ACCENT }}>{s.musteriAdi}</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>{s.urunAdi}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.musteriTelefon || '—'}</div>
            <button
              type="button"
              onClick={() => void teslimEt(s)}
              disabled={islemId === s.id}
              style={{
                marginTop: 12, width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                backgroundColor: '#059669', color: 'white', fontWeight: 800, fontSize: 13,
                cursor: islemId === s.id ? 'wait' : 'pointer',
              }}
            >
              {islemId === s.id ? 'İşleniyor...' : 'Teslim Edildi'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function TeslimatPage() {
  const userBranchId = useAuthStore((s) => s.user?.branchId)
  const [pageTab, setPageTab] = useState<PageTab>('teslimat')

  const [sales, setSales] = useState<DeliverySale[]>([])
  const [locations, setLocations] = useState<OdooLocation[]>([])
  const [atolyeBranches, setAtolyeBranches] = useState<AtolyeBranch[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)
  const [labModal, setLabModal] = useState<{ saleId: string; itemId: string; label: string } | null>(null)
  const [seciliAtolyeId, setSeciliAtolyeId] = useState('')
  const [labModalSaving, setLabModalSaving] = useState(false)

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
    if (pageTab === 'teslimat') void load()
  }, [load, pageTab])

  useEffect(() => {
    apiClient
      .get('/admin/branches')
      .then((res) => setLocations(res.data?.data ?? []))
      .catch(() => setLocations([]))
    apiClient
      .get('/sales/atolye-branches')
      .then((res) => setAtolyeBranches(res.data?.data ?? []))
      .catch(() => setAtolyeBranches([]))
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

  async function updateItemStatus(saleId: string, itemId: string, status: string, atolyeBranchId?: string) {
    const key = `${saleId}-${itemId}`
    setUpdatingKey(key)
    setError(null)
    try {
      await apiClient.patch(`/sales/${saleId}/items/${itemId}/status`, {
        status,
        ...(atolyeBranchId ? { atolyeBranchId } : {}),
      })
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Durum güncellenemedi')
    } finally {
      setUpdatingKey(null)
    }
  }

  function labGonderAc(saleId: string, item: SaleItem) {
    setLabModal({ saleId, itemId: item.id, label: itemLabel(item) })
    setSeciliAtolyeId(atolyeBranches[0]?.id ?? '')
    setError(null)
  }

  async function labGonderOnayla() {
    if (!labModal || !seciliAtolyeId) {
      setError('Atölye şubesi seçin.')
      return
    }
    setLabModalSaving(true)
    setError(null)
    try {
      await updateItemStatus(labModal.saleId, labModal.itemId, 'IN_LAB', seciliAtolyeId)
      setLabModal(null)
      setSeciliAtolyeId('')
    } finally {
      setLabModalSaving(false)
    }
  }

  function itemActionClick(saleId: string, item: SaleItem, action: { status: string; label: string }) {
    if (action.status === 'IN_LAB') {
      labGonderAc(saleId, item)
      return
    }
    void updateItemStatus(saleId, item.id, action.status)
  }

  function showItemAction(item: SaleItem, actionStatus: string): boolean {
    if (actionStatus === 'IN_LAB' && !isLensMeasurementSaleItem(item)) return false
    return true
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
          {pageTab === 'teslimat' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, textAlign: 'right' }}>
              <span>Toplam bekleyen: <strong>{stats.total}</strong> satış</span>
              <span>Laboratuvarda: <strong>{stats.inLab}</strong></span>
              <span>Hazır teslim: <strong>{stats.ready}</strong></span>
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {PAGE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPageTab(t.id)}
            style={{
              padding: '10px 16px', borderRadius: 999, fontSize: 13, fontWeight: pageTab === t.id ? 800 : 600,
              border: pageTab === t.id ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
              backgroundColor: pageTab === t.id ? '#fff5f5' : 'white',
              color: pageTab === t.id ? ACCENT : '#374151', cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pageTab === 'kargo-tara' ? <KargoTaraPanel /> : null}
      {pageTab === 'ozel-hazir' ? <OzelHazirPanel /> : null}

      {pageTab === 'teslimat' ? (
        <>
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
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, minWidth: 160 }}
            >
              <option value="">Tüm şubeler</option>
              {userBranchId ? <option value={userBranchId}>POS şubem</option> : null}
              {locations.map((loc) => (
                <option key={loc.id} value="">{loc.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: ACCENT,
                color: 'white', fontWeight: 800, fontSize: 13, cursor: loading ? 'wait' : 'pointer',
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
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
                  }}
                >
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 900, fontSize: 16, color: ACCENT }}>{sale.customer?.name ?? '—'}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{sale.customer?.phone ?? '—'}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                      {fmtDate(sale.createdAt)} · #{String(sale.id).slice(0, 8)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {sale.items.map((item) => (
                      <div key={item.id} style={{ borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{itemLabel(item)}</span>
                          {itemStatusBadge(item.status)}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {ITEM_ACTIONS.filter((action) => showItemAction(item, action.status)).map((action) => {
                            const active = item.status === action.status
                            return (
                              <button
                                key={action.status}
                                type="button"
                                disabled={updatingKey === `${sale.id}-${item.id}`}
                                onClick={() => itemActionClick(sale.id, item, action)}
                                style={{
                                  padding: '6px 10px', borderRadius: 8, fontSize: 11,
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
        </>
      ) : null}

      {labModal ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100,
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 420,
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 900 }}>Laboratuvara Gönder</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              <strong>{labModal.label}</strong> — hangi atölyeye gönderilsin?
            </p>
            {atolyeBranches.length === 0 ? (
              <p style={{ color: '#b45309', fontSize: 13, marginBottom: 16 }}>
                Tanımlı atölye şubesi bulunamadı. Yönetici panelinden şubeye atölye bayrağı ekleyin.
              </p>
            ) : (
              <select
                value={seciliAtolyeId}
                onChange={(e) => setSeciliAtolyeId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  fontSize: 14,
                  marginBottom: 16,
                }}
              >
                {atolyeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => { setLabModal(null); setSeciliAtolyeId('') }}
                disabled={labModalSaving}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void labGonderOnayla()}
                disabled={labModalSaving || !seciliAtolyeId || atolyeBranches.length === 0}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: ACCENT,
                  color: 'white',
                  fontWeight: 800,
                  cursor: labModalSaving ? 'wait' : 'pointer',
                  opacity: !seciliAtolyeId || atolyeBranches.length === 0 ? 0.6 : 1,
                }}
              >
                {labModalSaving ? 'Gönderiliyor...' : 'Gönder'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
