import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { adminApi } from './AdminLayout'

type DeployStatus = {
  status: 'idle' | 'running' | 'success' | 'failed'
  startedAt: string | null
  finishedAt: string | null
  currentStep: string | null
  failedStep: string | null
  error: string | null
}

type DeployStep = { id: string; label: string; command: string }

const STATUS_LABEL: Record<DeployStatus['status'], string> = {
  idle: 'Beklemede',
  running: 'Çalışıyor…',
  success: 'Başarılı',
  failed: 'Başarısız',
}

const STATUS_COLOR: Record<DeployStatus['status'], string> = {
  idle: '#6b7280',
  running: '#2563eb',
  success: '#059669',
  failed: '#dc2626',
}

function fmtTarih(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR')
  } catch {
    return iso
  }
}

export default function DeployPage() {
  const adminUser = (() => {
    try {
      const raw = localStorage.getItem('admin-user')
      return raw ? JSON.parse(raw) as { role?: string } : null
    } catch {
      return null
    }
  })()

  const [status, setStatus] = useState<DeployStatus | null>(null)
  const [logTail, setLogTail] = useState('')
  const [steps, setSteps] = useState<DeployStep[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const durumYukle = useCallback(async () => {
    try {
      const res = await adminApi.get('/admin/deploy/status')
      setStatus(res.data?.data ?? null)
      setLogTail(res.data?.logTail ?? '')
      setSteps(res.data?.steps ?? [])
      setError(null)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; error?: string } }; message?: string }
      setError(err?.response?.data?.message ?? err?.message ?? 'Durum alınamadı')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void durumYukle()
  }, [durumYukle])

  useEffect(() => {
    if (status?.status !== 'running') return
    const t = setInterval(() => void durumYukle(), 3000)
    return () => clearInterval(t)
  }, [status?.status, durumYukle])

  if (adminUser?.role !== 'ADMIN') {
    return <Navigate to="/admin/tanimlamalar" replace />
  }

  async function simdiGuncelle() {
    setStarting(true)
    setError(null)
    try {
      await adminApi.post('/admin/deploy')
      await durumYukle()
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { message?: string } }; message?: string }
      if (err?.response?.status === 409) {
        setError('Bir deploy zaten çalışıyor. Bitmesini bekleyin.')
      } else {
        setError(err?.response?.data?.message ?? err?.message ?? 'Deploy başlatılamadı')
      }
    } finally {
      setStarting(false)
    }
  }

  const calisiyor = status?.status === 'running' || starting

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8, color: 'var(--color-text-primary)' }}>
        Sunucu Güncelleme (Deploy)
      </h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
        Production sunucusunda çalışan backend, repo kökünde sırayla git pull, bağımlılık kurulumu,
        migration, build ve pm2 restart adımlarını çalıştırır. İşlem sunucu üzerinde yapılır — bu
        bilgisayardan SSH gerekmez.
      </p>

      <div
        style={{
          background: 'var(--color-background-secondary)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
          border: '1px solid var(--color-border, #e5e7eb)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 16 }}>
          <button
            type="button"
            disabled={calisiyor || loading}
            onClick={() => void simdiGuncelle()}
            style={{
              padding: '12px 22px',
              borderRadius: 10,
              border: 'none',
              backgroundColor: calisiyor ? '#9ca3af' : '#059669',
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
              cursor: calisiyor ? 'not-allowed' : 'pointer',
            }}
          >
            {calisiyor ? 'Deploy çalışıyor…' : 'Şimdi Güncelle'}
          </button>
          <button
            type="button"
            onClick={() => void durumYukle()}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid var(--color-border, #e5e7eb)',
              background: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Yenile
          </button>
        </div>

        {error ? (
          <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>
        ) : null}

        {loading && !status ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Yükleniyor…</div>
        ) : status ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Durum</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: STATUS_COLOR[status.status] }}>
                {STATUS_LABEL[status.status]}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Son başlangıç</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtTarih(status.startedAt)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Son bitiş</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtTarih(status.finishedAt)}</div>
            </div>
            {status.currentStep ? (
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Şu anki adım</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{status.currentStep}</div>
              </div>
            ) : null}
            {status.failedStep ? (
              <div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Hatalı adım</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>{status.failedStep}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {status?.error ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 8,
              backgroundColor: '#fef2f2',
              color: '#991b1b',
              fontSize: 13,
            }}
          >
            {status.error}
          </div>
        ) : null}
      </div>

      {steps.length > 0 ? (
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Deploy adımları (sabit)</h2>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
            {steps.map((s) => (
              <li key={s.id}>
                <strong>{s.label}</strong>
                <code style={{ marginLeft: 8, fontSize: 12, color: '#374151' }}>{s.command}</code>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div>
        <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Deploy log (son kısım)</h2>
        <pre
          style={{
            margin: 0,
            padding: 14,
            borderRadius: 10,
            backgroundColor: '#111827',
            color: '#e5e7eb',
            fontSize: 11,
            lineHeight: 1.45,
            overflow: 'auto',
            maxHeight: 420,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {logTail || '(Henüz log yok)'}
        </pre>
      </div>

      <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 16, lineHeight: 1.5 }}>
        Bu özellik yalnızca production sunucusunda anlamlıdır. Sunucu kurulumunda git erişimi, pm2
        ve Node.js ortamının hazır olması gerekir. İlkbyte kurulumu tamamlandıktan sonra birlikte
        test edilecektir.
      </p>
    </div>
  )
}
