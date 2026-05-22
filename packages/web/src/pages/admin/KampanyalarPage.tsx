import { useCallback, useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

type Campaign = {
  id: string
  name: string
  description?: string
  isActive: boolean
  startDate?: string
  endDate?: string
}

export default function KampanyalarPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.get('/admin/campaigns')
      setCampaigns(res.data ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Kampanyalar yüklenemedi (API henüz hazır olmayabilir)')
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function createCampaign() {
    setSaving(true)
    setError(null)
    try {
      await adminApi.post('/admin/campaigns', {
        name: name.trim(),
        description: description.trim() || undefined,
        isActive: true,
      })
      setModalOpen(false)
      setName('')
      setDescription('')
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: Campaign) {
    setError(null)
    try {
      await adminApi.patch(`/admin/campaigns/${c.id}`, { isActive: !c.isActive })
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Güncelleme başarısız')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Kampanyalar</h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
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
          + Yeni Kampanya
        </button>
      </div>

      {error ? <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p> : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}

      {!loading && campaigns.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {campaigns.map((c) => (
            <div
              key={c.id}
              style={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>{c.name}</div>
                {c.description ? (
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{c.description}</div>
                ) : null}
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                  {c.isActive ? 'Aktif' : 'Pasif'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void toggleActive(c)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: 'none',
                  backgroundColor: c.isActive ? '#fef3c7' : '#dcfce7',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {c.isActive ? 'Pasifleştir' : 'Aktifleştir'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && campaigns.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Kampanya listesi boş veya API henüz tanımlı değil.</p>
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
          }}
        >
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420 }}>
            <h2 style={{ margin: '0 0 16px', fontWeight: 900 }}>Yeni Kampanya</h2>
            <input
              placeholder="Kampanya adı"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="Açıklama (opsiyonel)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, marginTop: 10, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setModalOpen(false)} style={{ ...btnStyle, flex: 1, backgroundColor: '#f3f4f6' }}>
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving || !name.trim()}
                onClick={() => void createCampaign()}
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
