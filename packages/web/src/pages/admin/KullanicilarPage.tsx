import { useCallback, useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

type AdminUser = {
  id: string
  name: string
  username: string
  role: string
  branchId: string
  isActive: boolean
  createdAt: string
}

const ROLES = ['SALES_STAFF', 'STORE_MANAGER', 'REGIONAL_MANAGER', 'ACCOUNTANT', 'ADMIN'] as const

export default function KullanicilarPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState<string>('SALES_STAFF')
  const [branchId, setBranchId] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.get('/admin/users')
      setUsers(res.data ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Kullanıcılar yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setName('')
    setUsername('')
    setPin('')
    setRole('SALES_STAFF')
    setBranchId(users[0]?.branchId ?? '')
    setModalOpen(true)
  }

  function openEdit(u: AdminUser) {
    setEditing(u)
    setName(u.name)
    setUsername(u.username)
    setPin('')
    setRole(u.role)
    setBranchId(u.branchId)
    setModalOpen(true)
  }

  async function saveUser() {
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        const body: Record<string, unknown> = { name, username, role, branchId }
        if (pin.trim()) body.pin = pin.trim()
        await adminApi.put(`/admin/users/${editing.id}`, body)
      } else {
        if (!pin.trim()) {
          setError('Yeni kullanıcı için PIN gerekli.')
          setSaving(false)
          return
        }
        await adminApi.post('/admin/users', {
          name: name.trim(),
          username: username.trim(),
          pin: pin.trim(),
          role,
          branchId: branchId.trim(),
        })
      }
      setModalOpen(false)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(id: string) {
    if (!confirm('Kullanıcı pasifleştirilsin mi?')) return
    setError(null)
    try {
      await adminApi.patch(`/admin/users/${id}/deactivate`)
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Silme başarısız')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Kullanıcılar</h1>
        <button
          type="button"
          onClick={openCreate}
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
          + Yeni Kullanıcı
        </button>
      </div>

      {error ? <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p> : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}

      {!loading ? (
        <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb' }}>
                <th style={{ textAlign: 'left', padding: 12 }}>Ad</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Kullanıcı</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Rol</th>
                <th style={{ textAlign: 'left', padding: 12 }}>Durum</th>
                <th style={{ textAlign: 'right', padding: 12 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 12, fontWeight: 700 }}>{u.name}</td>
                  <td style={{ padding: 12 }}>{u.username}</td>
                  <td style={{ padding: 12 }}>{u.role}</td>
                  <td style={{ padding: 12 }}>{u.isActive ? 'Aktif' : 'Pasif'}</td>
                  <td style={{ padding: 12, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      style={{ marginRight: 8, padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer' }}
                    >
                      Düzenle
                    </button>
                    {u.isActive ? (
                      <button
                        type="button"
                        onClick={() => void deactivate(u.id)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: 'none',
                          backgroundColor: '#fee2e2',
                          color: '#991b1b',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Pasifleştir
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 420,
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 900 }}>
              {editing ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                placeholder="Ad"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder="Kullanıcı adı"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
              />
              <input
                placeholder={editing ? 'PIN (boş bırak = değişmez)' : 'PIN'}
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                style={inputStyle}
              />
              <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                placeholder="Şube ID"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setModalOpen(false)} style={{ ...btnStyle, flex: 1, backgroundColor: '#f3f4f6', color: '#111' }}>
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveUser()}
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
