import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const BELGE_TIPLERI = [
  { value: 'IS_SOZLESMESI', label: 'İş Sözleşmesi' },
  { value: 'SGK', label: 'SGK Belgesi' },
  { value: 'KIMLIK', label: 'Kimlik Fotokopisi' },
  { value: 'IKAMETGAH', label: 'İkametgah Belgesi' },
  { value: 'SAGLIK_RAPORU', label: 'Sağlık Raporu' },
  { value: 'DIGER', label: 'Diğer' },
]

export default function BelgeYuklePage() {
  const { personelId } = useParams<{ personelId: string }>()
  const [personel, setPersonel] = useState<any>(null)
  const [yuklenenBelgeler, setYuklenenBelgeler] = useState<any[]>([])
  const [form, setForm] = useState({
    tip: 'IS_SOZLESMESI', ad: '', notlar: '',
  })
  const [dosya, setDosya] = useState<File | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [basarili, setBasarili] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!personelId) return
    axios.get(`/api/admin/public/personel-belge-form/${personelId}`)
      .then((res) => {
        setPersonel(res.data.data)
        setYuklenenBelgeler(res.data.data.belgeler ?? [])
      })
      .catch(() => setHata('Personel bulunamadı'))
  }, [personelId])

  async function yukle() {
    if (!dosya || !form.ad.trim()) {
      setHata('Belge adı ve dosya zorunlu')
      return
    }
    if (dosya.size > 5 * 1024 * 1024) {
      setHata('Dosya 5MB\'den büyük olamaz')
      return
    }
    setYukleniyor(true)
    setHata(null)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(dosya)
      })
      await axios.post(
        `/api/admin/public/personel-belge-yukle/${personelId}`,
        {
          tip: form.tip,
          ad: form.ad,
          base64,
          mimeType: dosya.type,
          dosyaAdi: dosya.name,
          notlar: form.notlar,
        },
      )
      setBasarili(true)
      setDosya(null)
      setForm({ tip: 'IS_SOZLESMESI', ad: '', notlar: '' })
      if (fileRef.current) fileRef.current.value = ''
      const res = await axios.get(
        `/api/admin/public/personel-belge-form/${personelId}`,
      )
      setYuklenenBelgeler(res.data.data.belgeler ?? [])
      setTimeout(() => setBasarili(false), 3000)
    } catch (e: any) {
      setHata(e?.response?.data?.error ?? 'Yükleme başarısız')
    } finally { setYukleniyor(false) }
  }

  if (hata && !personel) return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui', background: '#f9fafb',
    }}
    >
      <div style={{
        background: '#fff', padding: 32, borderRadius: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        textAlign: 'center', maxWidth: 400,
      }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <div style={{ fontSize: 16, color: '#ef4444' }}>{hata}</div>
      </div>
    </div>
  )

  if (!personel) return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui',
    }}
    >
      <div style={{ color: '#6b7280' }}>Yükleniyor...</div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: '#f9fafb',
      fontFamily: 'system-ui', padding: '24px 16px',
    }}
    >
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        <div style={{
          background: '#1a1a2e', color: '#fff',
          borderRadius: 16, padding: '20px 24px',
          marginBottom: 20, textAlign: 'center',
        }}
        >
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>
            Güven Optik 1959
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {personel.ad} {personel.soyad}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
            Belge Yükleme Formu
          </div>
        </div>

        {yuklenenBelgeler.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: 12,
            padding: 16, marginBottom: 16,
            border: '1px solid #e5e7eb',
          }}
          >
            <div style={{
              fontSize: 13, fontWeight: 600,
              marginBottom: 10, color: '#374151',
            }}
            >
              Yüklenen Belgeler ({yuklenenBelgeler.length})
            </div>
            {yuklenenBelgeler.map((b: any, i: number) => (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center',
                  gap: 8, padding: '6px 0',
                  borderBottom: i < yuklenenBelgeler.length - 1
                    ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <span style={{ fontSize: 16 }}>
                  {b.onaylandi ? '✅' : '⏳'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>
                    {b.ad}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>
                    {BELGE_TIPLERI.find((t) => t.value === b.tip)?.label}
                    {' · '}
                    {b.onaylandi ? 'Onaylandı' : 'Onay bekliyor'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{
          background: '#fff', borderRadius: 12,
          padding: 20, border: '1px solid #e5e7eb',
        }}
        >
          <div style={{
            fontSize: 14, fontWeight: 600,
            marginBottom: 16, color: '#1a1a2e',
          }}
          >
            Yeni Belge Yükle
          </div>

          {basarili && (
            <div style={{
              background: '#dcfce7', border: '1px solid #86efac',
              borderRadius: 8, padding: '10px 14px',
              marginBottom: 14, fontSize: 13, color: '#166534',
            }}
            >
              ✓ Belge başarıyla yüklendi!
            </div>
          )}

          {hata && (
            <div style={{
              background: '#fee2e2', border: '1px solid #fca5a5',
              borderRadius: 8, padding: '10px 14px',
              marginBottom: 14, fontSize: 13, color: '#dc2626',
            }}
            >
              {hata}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{
              fontSize: 12, color: '#6b7280',
              display: 'block', marginBottom: 4,
            }}
            >
              Belge Tipi *
            </label>
            <select
              value={form.tip}
              onChange={(e) => setForm((p) => ({ ...p, tip: e.target.value }))}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: 14, background: '#fff',
              }}
            >
              {BELGE_TIPLERI.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{
              fontSize: 12, color: '#6b7280',
              display: 'block', marginBottom: 4,
            }}
            >
              Belge Adı *
            </label>
            <input
              type="text"
              value={form.ad}
              onChange={(e) => setForm((p) => ({ ...p, ad: e.target.value }))}
              placeholder="ör: Mayıs 2026 SGK Belgesi"
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: 14, boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{
              fontSize: 12, color: '#6b7280',
              display: 'block', marginBottom: 4,
            }}
            >
              Not (opsiyonel)
            </label>
            <textarea
              value={form.notlar}
              onChange={(e) => setForm((p) => ({ ...p, notlar: e.target.value }))}
              placeholder="Açıklama..."
              rows={2}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: 14, resize: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{
              fontSize: 12, color: '#6b7280',
              display: 'block', marginBottom: 4,
            }}
            >
              Dosya *
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px dashed #d1d5db', borderRadius: 8,
                fontSize: 13, boxSizing: 'border-box',
              }}
            />
            <div style={{
              fontSize: 11, color: '#9ca3af', marginTop: 4,
            }}
            >
              Max 5MB · PDF, JPG, PNG, DOC
            </div>
          </div>

          <button
            type="button"
            onClick={() => void yukle()}
            disabled={yukleniyor || !dosya || !form.ad.trim()}
            style={{
              width: '100%', padding: '13px',
              background: yukleniyor ? '#9ca3af' : '#1a1a2e',
              color: '#fff', border: 'none',
              borderRadius: 10, fontSize: 15,
              fontWeight: 600, cursor: yukleniyor ? 'wait' : 'pointer',
            }}
          >
            {yukleniyor ? 'Yükleniyor...' : '📎 Belgeyi Yükle'}
          </button>
        </div>

        <div style={{
          textAlign: 'center', marginTop: 20,
          fontSize: 11, color: '#9ca3af',
        }}
        >
          Güven Optik 1959 — İnsan Kaynakları
        </div>
      </div>
    </div>
  )
}
