import { useMemo, useState } from 'react'
import type { Sale } from '../../api/types'
import { apiClient } from '../../api/client'

type ItemStatus = 'DELIVERED' | 'IN_LAB' | 'ORDERED' | 'PENDING'

export default function StatusStep({
  sale,
  onNewSale,
}: {
  sale: Sale | null
  onNewSale: () => void
}) {
  const [picked, setPicked] = useState<ItemStatus>('DELIVERED')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const customerName = sale?.customer?.name ?? ''

  const itemsToUpdate = useMemo(() => {
    return (sale?.items ?? []).filter((i) => String(i.status).toUpperCase() !== 'VOID')
  }, [sale?.items])

  async function save() {
    if (!sale) return
    setSaving(true)
    setError(null)
    try {
      await Promise.all(
        itemsToUpdate.map((it) =>
          apiClient.patch(`/sales/${sale.id}/items/${it.id}/status`, {
            status: picked,
            deliveryDate: deliveryDate || undefined,
          }),
        ),
      )
      onNewSale()
    } catch (e: any) {
      console.error('Status save error', e)
      setError(e?.response?.data?.message ?? 'Durum kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  if (!sale) {
    return (
      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
        Satış yükleniyor...
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
      <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
        <div style={{ fontSize: '44px' }}>✅</div>
        <div style={{ fontSize: '22px', fontWeight: 900, color: '#111' }}>Satış Tamamlandı!</div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '6px' }}>
          Satış No: <span style={{ fontWeight: 800 }}>{sale.id}</span>
        </div>
        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
          Müşteri: <span style={{ fontWeight: 800 }}>{customerName || '—'}</span>
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <div style={{ fontWeight: 900, marginBottom: '10px' }}>Durum Seçimi</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          <StatusCard title="✅ Teslim Edildi" active={picked === 'DELIVERED'} onClick={() => setPicked('DELIVERED')} />
          <StatusCard title="🔬 Laboratuvara Verildi" active={picked === 'IN_LAB'} onClick={() => setPicked('IN_LAB')} />
          <StatusCard title="⏳ Cam Bekleniyor" active={picked === 'ORDERED'} onClick={() => setPicked('ORDERED')} />
          <StatusCard title="📌 Rezerve" active={picked === 'PENDING'} onClick={() => setPicked('PENDING')} />
        </div>
      </div>

      <div style={{ marginTop: '14px' }}>
        <div style={labelStyle}>Tahmini teslim tarihi</div>
        <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={inputStyle} />
      </div>

      {error ? <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px' }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#C8102E',
            color: 'white',
            cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 900,
            opacity: saving ? 0.6 : 1,
          }}
        >
          Kaydet & Bitir
        </button>
        <button
          type="button"
          onClick={onNewSale}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            backgroundColor: '#f3f4f6',
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          Yeni Satış
        </button>
      </div>
    </div>
  )
}

function StatusCard({ title, active, onClick }: { title: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${active ? '#C8102E' : '#e5e7eb'}`,
        backgroundColor: active ? '#fdf2f4' : 'white',
        borderRadius: '12px',
        padding: '14px',
        cursor: 'pointer',
        fontWeight: 900,
        textAlign: 'left',
      }}
    >
      {title}
    </button>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 800,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  fontSize: '14px',
  outline: 'none',
}

