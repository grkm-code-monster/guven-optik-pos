import { useEffect, useState } from 'react'
import {
  downloadBlob,
  reportEngineApi,
  templateDimensions,
  templateMeasures,
  type ReportTemplateRow,
} from '../api/report-engine.api'

function scheduleLabel(z: { siklik: string; saat: string; gun?: number | null }) {
  const siklikMap: Record<string, string> = {
    GUNLUK: 'Günlük',
    HAFTALIK: 'Haftalık',
    AYLIK: 'Aylık',
  }
  let text = `${siklikMap[z.siklik] ?? z.siklik} — ${z.saat}`
  if (z.gun != null) text += ` (gün: ${z.gun})`
  return text
}

export default function RaporlarimPage() {
  const [templates, setTemplates] = useState<ReportTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)
  const [istekMetni, setIstekMetni] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  function reload() {
    setLoading(true)
    reportEngineApi
      .listTemplates()
      .then(setTemplates)
      .catch(() => setError('Raporlar yüklenemedi.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleExport(template: ReportTemplateRow, type: 'pdf' | 'excel') {
    setActionId(template.id)
    setError(null)
    setMessage(null)
    try {
      const body = {
        templateId: template.id,
        reportAdi: template.ad,
      }
      const stamp = new Date().toISOString().slice(0, 10)
      if (type === 'pdf') {
        const blob = await reportEngineApi.exportPdf(body)
        downloadBlob(blob, `${template.ad}-${stamp}.pdf`)
      } else {
        const blob = await reportEngineApi.exportExcel(body)
        downloadBlob(blob, `${template.ad}-${stamp}.xlsx`)
      }
      setMessage(`"${template.ad}" indirildi.`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? 'İndirme başarısız.')
    } finally {
      setActionId(null)
    }
  }

  async function handleSendEmail(template: ReportTemplateRow) {
    setActionId(template.id)
    setError(null)
    setMessage(null)
    try {
      await reportEngineApi.sendTemplateEmail(template.id)
      setMessage(`"${template.ad}" e-posta ile gönderildi.`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? 'E-posta gönderilemedi.')
    } finally {
      setActionId(null)
    }
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault()
    if (istekMetni.trim().length < 5) {
      setError('Talep metni en az 5 karakter olmalı.')
      return
    }
    setRequestLoading(true)
    setError(null)
    try {
      await reportEngineApi.createRequest(istekMetni.trim())
      setMessage('Rapor talebiniz iletildi. Yönetici bilgilendirildi.')
      setIstekMetni('')
      setRequestOpen(false)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err.response?.data?.message ?? 'Talep gönderilemedi.')
    } finally {
      setRequestLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900 }}>Hazır Raporlarım</h1>
          <p style={{ margin: 0, color: '#6b7280' }}>
            Size tanımlanan rapor şablonlarını çalıştırın veya yeni rapor talep edin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRequestOpen(true)}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#C8102E',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Yeni Rapor Talep Et
        </button>
      </div>

      {error ? (
        <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      ) : null}
      {message ? (
        <div style={{ padding: 12, background: '#ecfdf5', color: '#047857', borderRadius: 8, marginBottom: 16 }}>
          {message}
        </div>
      ) : null}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Yükleniyor…</p>
      ) : templates.length === 0 ? (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 24,
            border: '1px dashed #d1d5db',
            color: '#6b7280',
          }}
        >
          Henüz erişiminiz olan bir rapor şablonu yok.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {templates.map((t) => {
            const busy = actionId === t.id
            const dims = templateDimensions(t)
            const meas = templateMeasures(t)
            return (
              <article
                key={t.id}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 16,
                  border: '1px solid #e5e7eb',
                }}
              >
                <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{t.ad}</h2>
                {t.aciklama ? (
                  <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 14 }}>{t.aciklama}</p>
                ) : null}
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151' }}>
                  Boyutlar: {dims.join(', ') || '—'} · Ölçüler: {meas.join(', ') || '—'}
                </p>
                {t.zamanlamalar?.length ? (
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>
                    Zamanlama: {t.zamanlamalar.map(scheduleLabel).join(' · ')}
                  </p>
                ) : (
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#9ca3af' }}>Otomatik zamanlama yok</p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleExport(t, 'pdf')}
                    style={btnStyle}
                  >
                    PDF İndir
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleExport(t, 'excel')}
                    style={btnStyle}
                  >
                    Excel İndir
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleSendEmail(t)}
                    style={{ ...btnStyle, background: '#1a1a2e' }}
                  >
                    E-posta Gönder
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {requestOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => setRequestOpen(false)}
        >
          <form
            onSubmit={(e) => void handleCreateRequest(e)}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 440,
            }}
          >
            <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>Yeni Rapor Talep Et</h2>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
              İhtiyacınızı kısaca yazın
              <textarea
                value={istekMetni}
                onChange={(e) => setIstekMetni(e.target.value)}
                rows={4}
                placeholder="Örn: Aylık şube bazlı SGK raporu"
                required
                minLength={5}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setRequestOpen(false)} style={secondaryBtn}>
                İptal
              </button>
              <button type="submit" disabled={requestLoading} style={btnStyle}>
                {requestLoading ? 'Gönderiliyor…' : 'Gönder'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  background: '#C8102E',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
}

const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  background: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: 13,
}
