import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiClient as api } from '../api/client'

type Satis = {
  id: string
  referansNo?: string | null
  status: string
  createdAt: string
  totalAmount: number
  itemsCount: number
  customer?: { name: string; phone: string } | null
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  COMPLETED: { label: 'Tamamlandı', bg: '#dcfce7', color: '#166534' },
  PAID: { label: 'Ödendi', bg: '#dcfce7', color: '#166534' },
  DRAFT: { label: 'Taslak', bg: '#fef9c3', color: '#854d0e' },
  PENDING: { label: 'Bekliyor', bg: '#fef9c3', color: '#854d0e' },
  CANCELLED: { label: 'İptal', bg: '#fee2e2', color: '#991b1b' },
  PARTIAL: { label: 'Kısmi', bg: '#dbeafe', color: '#1e40af' },
}

export default function SatislarPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlCustomerId = searchParams.get('customerId')
  const [satislar, setSatislar] = useState<Satis[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [aramaMetin, setAramaMetin] = useState('')
  const [statusFilter, setStatusFilter] = useState('PAID')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    void yukle()
  }, [statusFilter, dateFrom, dateTo, urlCustomerId])

  async function yukle() {
    setYukleniyor(true)
    setHata(null)
    try {
      const params = new URLSearchParams()
      if (urlCustomerId) params.set('customerId', urlCustomerId)
      if (statusFilter) params.set('status', statusFilter)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const res = await api.get(`/sales?${params.toString()}`)
      setSatislar(res.data ?? [])
    } catch {
      setHata('Satışlar yüklenemedi.')
    } finally {
      setYukleniyor(false)
    }
  }

  const filtrelenmis = satislar.filter((s) => {
    if (!aramaMetin) return true
    const q = aramaMetin.toLowerCase()
    return (
      s.customer?.name?.toLowerCase().includes(q) ||
      s.customer?.phone?.includes(q) ||
      s.referansNo?.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    )
  })

  return (
    <div style={{ padding: '24px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#1a1a2e' }}>Satışlar</h1>
        <button
          type="button"
          onClick={() => navigate('/sales/new')}
          style={{ padding: '10px 20px', backgroundColor: '#C8102E', color: 'white', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
        >
          + Yeni Satış
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={aramaMetin}
          onChange={(e) => setAramaMetin(e.target.value)}
          placeholder="Müşteri adı, telefon, referans no veya ID ara..."
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
        >
          <option value="">Tüm durumlar</option>
          <option value="COMPLETED">Tamamlandı</option>
          <option value="PAID">Ödendi</option>
          <option value="DRAFT">Taslak (Yarım Kalan)</option>
          <option value="PENDING">Bekliyor</option>
          <option value="PARTIAL">Kısmi</option>
          <option value="CANCELLED">İptal</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
        />
      </div>

      {hata && <div style={{ color: '#991b1b', background: '#fee2e2', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>{hata}</div>}

      {yukleniyor ? (
        <div style={{ color: '#9ca3af', fontSize: 14, padding: 24, textAlign: 'center' }}>Yükleniyor...</div>
      ) : filtrelenmis.length === 0 ? (
        <div style={{ color: '#9ca3af', fontSize: 14, padding: 24, textAlign: 'center', background: '#f9fafb', borderRadius: 12 }}>Satış bulunamadı</div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Referans</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Tarih</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Müşteri</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Ürün Sayısı</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Tutar</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Durum</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtrelenmis.map((s) => {
                const st = STATUS_LABEL[s.status] ?? { label: s.status, bg: '#f3f4f6', color: '#374151' }
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#374151', fontWeight: 700 }}>
                      {s.referansNo ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>
                      {new Date(s.createdAt).toLocaleDateString('tr-TR')}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700, color: '#1a1a2e' }}>{s.customer?.name ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.customer?.phone ?? ''}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>{s.itemsCount} ürün</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1a1a2e' }}>
                      {s.totalAmount != null ? `${Number(s.totalAmount).toLocaleString('tr-TR')} ₺` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ background: st.bg, color: st.color, fontSize: 11, padding: '3px 9px', borderRadius: 999, fontWeight: 700 }}>{st.label}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => navigate(`/sales/${s.id}`)}
                          style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: 'white', cursor: 'pointer', color: '#374151' }}
                        >
                          Detay
                        </button>
                        {s.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() => navigate(`/sales/new?saleId=${s.id}`)}
                            style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #C8102E', borderRadius: 6, background: '#C8102E', cursor: 'pointer', color: 'white', fontWeight: 700 }}
                          >
                            Devam Et
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
