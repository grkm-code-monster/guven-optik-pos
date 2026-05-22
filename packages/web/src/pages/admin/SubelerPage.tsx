import { useCallback, useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

type Branch = {
  id: string
  name: string
  code: string
  isActive: boolean
}

export default function SubelerPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.get('/admin/branches')
      setBranches(res.data ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Şubeler yüklenemedi (API henüz hazır olmayabilir)')
      setBranches([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openEdit(b: Branch) {
    setEditing(b)
    setName(b.name)
    setCode(b.code)
  }

  async function saveBranch() {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      await adminApi.put(`/admin/branches/${editing.id}`, { name: name.trim(), code: code.trim() })
      setEditing(null)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(b: Branch) {
    setError(null)
    try {
      await adminApi.patch(`/admin/branches/${b.id}`, { isActive: !b.isActive })
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Güncelleme başarısız')
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 20px', fontSize: 24, fontWeight: 900 }}>Şubeler</h1>
      {error ? <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p> : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}

      {!loading && branches.length > 0 ? (
        <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ textAlign: 'left', padding: 12 }}>Ad</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Kod</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Durum</th>
                <th style={{ textAlign: 'right', padding: 12 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 12, fontWeight: 700 }}>{b.name}</td>
                  <td style={{ padding: 12 }}>{b.code}</td>
                  <td style={{ padding: 12 }}>{b.isActive ? 'Aktif' : 'Pasif'}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => openEdit(b)}
                      style={{ marginRight: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer' }}
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleActive(b)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: 'none',
                        backgroundColor: b.isActive ? '#fef3c7' : '#dcfce7',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      {b.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && branches.length === 0 ? (
        <p style={{ color: '#6b7280' }}>Şube listesi boş veya API henüz tanımlı değil.</p>
      ) : null}

      {editing ? (
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
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400 }}>
            <h2 style={{ margin: '0 0 16px', fontWeight: 900 }}>Şube Düzenle</h2>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad" style={inputStyle} />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Kod"
              style={{ ...inputStyle, marginTop: 10 }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setEditing(null)} style={{ ...btnStyle, flex: 1, backgroundColor: '#f3f4f6' }}>
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveBranch()}
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
