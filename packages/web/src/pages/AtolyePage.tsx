import { useCallback, useEffect, useState } from 'react'
import {
  confirmLabIncidentTransfer,
  getAtolyeKuyruk,
  reportLabIncident,
  updateSaleItemStatus,
  type AtolyeKuyrukItem,
  type LabIncidentType,
  type LabStokLokasyon,
  type ReportLabIncidentResult,
} from '../api/sales.api'
import { useAuthStore } from '../store/auth.store'

const PRIMARY = '#8B0000'
const ACCENT = '#c0392b'

type TabId = 'IN_LAB' | 'READY'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'IN_LAB', label: '📥 Gelen Siparişler' },
  { id: 'READY', label: '✅ Bugün Tamamlanan' },
]

const INCIDENT_OPTIONS: Array<{ id: LabIncidentType; label: string }> = [
  { id: 'LENS_BROKEN', label: 'Cam kırıldı' },
  { id: 'FRAME_BROKEN', label: 'Çerçeve kırıldı' },
  { id: 'MEASUREMENT_SHIFT', label: 'Ölçüm kaydırması' },
]

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR')
  } catch {
    return iso
  }
}

function itemLabel(item: AtolyeKuyrukItem) {
  return item.odooProductName || item.product?.name || 'Ürün'
}

type IncidentPanelState = {
  open: boolean
  incidentType: LabIncidentType
  note: string
  submitting: boolean
  result: ReportLabIncidentResult | null
  selectedLokasyon: LabStokLokasyon | null
  transferLoading: boolean
  doneMessage: string | null
}

const defaultPanelState = (): IncidentPanelState => ({
  open: false,
  incidentType: 'LENS_BROKEN',
  note: '',
  submitting: false,
  result: null,
  selectedLokasyon: null,
  transferLoading: false,
  doneMessage: null,
})

export default function AtolyePage() {
  const user = useAuthStore((s) => s.user)
  const branchId = user?.branchId ?? ''

  const [tab, setTab] = useState<TabId>('IN_LAB')
  const [items, setItems] = useState<AtolyeKuyrukItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [panels, setPanels] = useState<Record<string, IncidentPanelState>>({})

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getAtolyeKuyruk({ branchId, durum: tab })
      setItems(data)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Kuyruk yüklenemedi.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [branchId, tab])

  useEffect(() => {
    load()
  }, [load])

  function panelFor(itemId: string): IncidentPanelState {
    return panels[itemId] ?? defaultPanelState()
  }

  function setPanel(itemId: string, patch: Partial<IncidentPanelState>) {
    setPanels((prev) => ({
      ...prev,
      [itemId]: { ...panelFor(itemId), ...patch },
    }))
  }

  function toggleIncidentPanel(itemId: string) {
    const cur = panelFor(itemId)
    if (cur.open) {
      setPanel(itemId, { open: false })
    } else {
      setPanel(itemId, { ...defaultPanelState(), open: true })
    }
  }

  async function markReady(item: AtolyeKuyrukItem) {
    if (updatingId) return
    setUpdatingId(item.id)
    try {
      await updateSaleItemStatus(item.sale.id, item.id, 'READY')
      await load()
      if (tab === 'IN_LAB') setTab('READY')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Durum güncellenemedi.')
    } finally {
      setUpdatingId(null)
    }
  }

  async function submitIncident(item: AtolyeKuyrukItem) {
    const p = panelFor(item.id)
    if (p.submitting) return
    setPanel(item.id, { submitting: true, doneMessage: null, result: null })
    try {
      const result = await reportLabIncident({
        saleItemId: item.id,
        incidentType: p.incidentType,
        note: p.note.trim() || undefined,
      })
      if (result.resolutionType === 'NONE') {
        setPanel(item.id, {
          submitting: false,
          result,
          doneMessage: 'Kaydedildi.',
        })
        return
      }
      if (result.stokBulundu && result.lokasyonlar?.length) {
        setPanel(item.id, {
          submitting: false,
          result,
          selectedLokasyon: result.lokasyonlar[0],
        })
        return
      }
      setPanel(item.id, {
        submitting: false,
        result,
        doneMessage: result.message ?? 'Tedarikçiden sipariş açıldı.',
      })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setPanel(item.id, { submitting: false })
      setError(msg ?? 'Sorun bildirimi kaydedilemedi.')
    }
  }

  async function confirmTransfer(item: AtolyeKuyrukItem) {
    const p = panelFor(item.id)
    if (!p.result?.incidentId || !p.selectedLokasyon || p.transferLoading) return
    setPanel(item.id, { transferLoading: true })
    try {
      const res = await confirmLabIncidentTransfer(p.result.incidentId, p.selectedLokasyon.lokasyonId)
      setPanel(item.id, {
        transferLoading: false,
        doneMessage: res.message ?? 'Transfer talebi açıldı.',
      })
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      setPanel(item.id, { transferLoading: false })
      setError(msg ?? 'Transfer açılamadı.')
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: PRIMARY }}>Atölye İş Süreci</h1>
        <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
          Laboratuvara gönderilen siparişleri işleyin ve hazır olanları satış ekibine bildirin.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: tab === t.id ? `2px solid ${PRIMARY}` : '1px solid #e5e7eb',
              background: tab === t.id ? '#fef2f2' : 'white',
              color: tab === t.id ? PRIMARY : '#374151',
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fef2f2', color: ACCENT, borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6b7280', fontSize: 14 }}>Yükleniyor…</div>
      ) : items.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: '#6b7280',
            background: '#f9fafb',
            borderRadius: 12,
            border: '1px dashed #e5e7eb',
          }}
        >
          {tab === 'IN_LAB' ? 'Bekleyen sipariş yok.' : 'Bugün tamamlanan sipariş yok.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => {
            const p = panelFor(item.id)
            return (
              <div
                key={item.id}
                style={{
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: '16px 18px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                      {item.sale.customer?.name ?? 'Müşteri'}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                      {item.sale.customer?.phone ?? '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: '#6b7280' }}>
                    <div>Satış #{String(item.sale.id).slice(0, 8)}</div>
                    <div style={{ marginTop: 2 }}>Sipariş: {fmtDate(item.sale.createdAt)}</div>
                    {item.sentToLabAt && (
                      <div style={{ marginTop: 2 }}>Lab&apos;a gönderim: {fmtDate(item.sentToLabAt)}</div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    padding: '10px 12px',
                    background: '#f9fafb',
                    borderRadius: 8,
                    fontSize: 14,
                    color: '#374151',
                  }}
                >
                  <strong>{itemLabel(item)}</strong>
                  {item.product?.category && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#9ca3af' }}>({item.product.category})</span>
                  )}
                </div>

                {tab === 'IN_LAB' && (
                  <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={updatingId === item.id}
                      onClick={() => markReady(item)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: updatingId === item.id ? '#9ca3af' : PRIMARY,
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: updatingId === item.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {updatingId === item.id ? 'Kaydediliyor…' : '✅ Hazır — Satışa Gönder'}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleIncidentPanel(item.id)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: `1px solid ${ACCENT}`,
                        background: p.open ? '#fff7ed' : 'white',
                        color: ACCENT,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      ⚠️ Sorun Bildir
                    </button>
                  </div>
                )}

                {tab === 'IN_LAB' && p.open && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      borderRadius: 10,
                      border: '1px solid #fed7aa',
                      background: '#fffbeb',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 10 }}>
                      Sorun türü
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                      {INCIDENT_OPTIONS.map((opt) => (
                        <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`incident-${item.id}`}
                            checked={p.incidentType === opt.id}
                            onChange={() => setPanel(item.id, { incidentType: opt.id, result: null, doneMessage: null })}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                    <textarea
                      value={p.note}
                      onChange={(e) => setPanel(item.id, { note: e.target.value })}
                      placeholder="Not (isteğe bağlı)"
                      rows={2}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        fontSize: 13,
                        marginBottom: 10,
                        resize: 'vertical',
                      }}
                    />

                    {!p.result && !p.doneMessage && (
                      <button
                        type="button"
                        disabled={p.submitting}
                        onClick={() => submitIncident(item)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: 8,
                          border: 'none',
                          background: p.submitting ? '#9ca3af' : ACCENT,
                          color: 'white',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: p.submitting ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {p.submitting ? 'Gönderiliyor…' : 'Bildir'}
                      </button>
                    )}

                    {p.doneMessage && (
                      <div style={{ padding: '10px 12px', background: '#ecfdf5', color: '#166534', borderRadius: 8, fontSize: 13 }}>
                        {p.doneMessage}
                      </div>
                    )}

                    {p.result?.stokBulundu && p.result.lokasyonlar && !p.doneMessage && (
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                          Başka lokasyonda stok bulundu — kaynak seçin:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                          {p.result.lokasyonlar.map((loc) => (
                            <label
                              key={loc.kod}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: p.selectedLokasyon?.kod === loc.kod ? `2px solid ${PRIMARY}` : '1px solid #e5e7eb',
                                background: 'white',
                                fontSize: 13,
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="radio"
                                name={`loc-${item.id}`}
                                checked={p.selectedLokasyon?.kod === loc.kod}
                                onChange={() => setPanel(item.id, { selectedLokasyon: loc })}
                              />
                              <span>
                                <strong>{loc.kod}</strong>
                                {' — '}
                                kullanılabilir: {loc.kullanilabilir}
                              </span>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={!p.selectedLokasyon || p.transferLoading}
                          onClick={() => confirmTransfer(item)}
                          style={{
                            padding: '8px 14px',
                            borderRadius: 8,
                            border: 'none',
                            background: !p.selectedLokasyon || p.transferLoading ? '#9ca3af' : PRIMARY,
                            color: 'white',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: !p.selectedLokasyon || p.transferLoading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {p.transferLoading ? 'Açılıyor…' : 'Bu Lokasyondan Transfer Talebi Aç'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
