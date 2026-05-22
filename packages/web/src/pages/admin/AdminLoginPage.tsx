import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../api/client'

const ADMIN_TOKEN_KEY = 'admin-token'
const ADMIN_USER_KEY = 'admin-user'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.post('/auth/login', {
        username: username.trim(),
        pin,
      })
      const { token, user } = res.data
      if (user.role !== 'ADMIN' && user.role !== 'STORE_MANAGER') {
        setError('Yetkisiz erişim')
        return
      }
      localStorage.setItem(ADMIN_TOKEN_KEY, token)
      localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user))
      navigate('/admin/dashboard', { replace: true })
    } catch {
      setError('Yetkisiz erişim')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a2e',
        padding: 16,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: 16,
          padding: 32,
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <h1 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 900, textAlign: 'center' }}>
          Yönetim Paneli
        </h1>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label style={{ display: 'block', marginBottom: 16 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>Kullanıcı adı</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              style={{
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>PIN</span>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.slice(0, 6))}
              maxLength={6}
              autoComplete="current-password"
              style={{
                width: '100%',
                marginTop: 6,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </label>
          {error ? (
            <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={loading || !username.trim() || pin.length < 4}
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 10,
              border: 'none',
              backgroundColor: '#1a1a2e',
              color: 'white',
              fontWeight: 800,
              fontSize: 15,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading || !username.trim() || pin.length < 4 ? 0.6 : 1,
            }}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş'}
          </button>
        </form>
      </div>
    </div>
  )
}
