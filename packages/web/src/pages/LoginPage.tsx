import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api/auth.api'
import { useAuthStore } from '../store/auth.store'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const token = useAuthStore((s) => s.token)

  const [config] = useState(() => {
    const defaults = {
      brandName: 'GÜVEN OPTİK',
      brandYear: '1959',
      primaryColor: '#C8102E',
      logoUrl: null as string | null,
    }
    try {
      const stored = localStorage.getItem('tenantConfig')
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults
    } catch {
      return defaults
    }
  })

  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const trimmedUsername = useMemo(() => username.trim(), [username])

  useEffect(() => {
    if (token) navigate('/', { replace: true })
  }, [token, navigate])

  async function submit(p: string) {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await login(trimmedUsername, p)
      setAuth(res.token, { id: res.user.id, name: res.user.name, role: res.user.role, branchId: res.user.branchId }, res.shiftId)
      if (!res.shiftId) navigate('/shift/open', { replace: true })
      else navigate('/', { replace: true })
    } catch (e: any) {
      const code = e?.response?.data?.error
      const msg = e?.response?.data?.message
      if (code === 'ACCOUNT_LOCKED') setError('Hesap 5 dakika kilitlendi')
      else setError(msg ?? 'Giriş başarısız')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit() {
    void submit(pin)
  }

  useEffect(() => {
    if (pin.length === 6) void submit(pin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '32px',
          width: '100%',
          maxWidth: '360px',
          margin: '0 16px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
        }}
      >
        {/* LOGO */}
        <div
          style={{
            backgroundColor: config.primaryColor,
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px',
            textAlign: 'center',
          }}
        >
          {config.logoUrl ? (
            <img src={config.logoUrl} style={{ height: '48px', margin: '0 auto' }} alt={config.brandName} />
          ) : (
            <>
              <div style={{ color: 'white', fontSize: '22px', fontWeight: 'bold' }}>{config.brandName}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', marginTop: '4px' }}>{config.brandYear}</div>
            </>
          )}
        </div>

        {/* KULLANICI ADI */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '11px',
              fontWeight: '600',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '6px',
            }}
          >
            Kullanıcı Adı
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="kullanıcı adı"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              outline: 'none',
            }}
          />
        </div>

        {/* PIN GÖSTERGE */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '16px' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                backgroundColor: i < pin.length ? config.primaryColor : 'transparent',
                border: i < pin.length ? 'none' : '2px solid #d1d5db',
              }}
            />
          ))}
        </div>

        {/* PIN PAD */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button
              key={n}
              onClick={() => setPin((v) => (v.length < 6 ? v + n : v))}
              style={{
                height: '56px',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                backgroundColor: 'white',
                fontSize: '18px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
              type="button"
            >
              {n}
            </button>
          ))}
          <div />
          <button
            onClick={() => setPin((v) => (v.length < 6 ? v + '0' : v))}
            style={{
              height: '56px',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
            type="button"
          >
            0
          </button>
          <button
            onClick={() => setPin((v) => v.slice(0, -1))}
            style={{
              height: '56px',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
            type="button"
          >
            Sil
          </button>
        </div>

        {/* HATA */}
        {error && (
          <p style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center', marginBottom: '8px' }}>{error}</p>
        )}

        {/* GİRİŞ YAP */}
        <button
          onClick={handleSubmit}
          disabled={pin.length < 6 || !username.trim() || loading}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '10px',
            backgroundColor: config.primaryColor,
            color: 'white',
            fontSize: '15px',
            fontWeight: 'bold',
            border: 'none',
            cursor: pin.length < 6 || !username.trim() ? 'not-allowed' : 'pointer',
            opacity: pin.length < 6 || !username.trim() ? 0.5 : 1,
          }}
          type="button"
        >
          {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>
      </div>
    </div>
  )
}

