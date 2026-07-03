import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchCustomers, updateCustomer, getCustomerById } from '../api/customers.api'

type Musteri = {
  id: string
  name: string
  phone: string
  note?: string | null
  identityNo?: string | null
  birthDate?: string | null
  ePostaEmail?: string | null
}

export default function MusterilerPage() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [musteriler, setMusteriler] = useState<Musteri[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [secili, setSecili] = useState<Musteri | null>(null)
  const [duzenle, setDuzenle] = useState(false)
  const [form, setForm] = useState<Partial<Musteri>>({})
  const [kaydetYukleniyor, setKaydetYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)

  useEffect(() => {
    if (q.length < 3) { setMusteriler([]); return }
    const t = setTimeout(() => void ara(), 300)
    return () => clearTimeout(t)
  }, [q])

  async function ara() {
    setYukleniyor(true)
    try {
      const res = await searchCustomers(q)
      setMusteriler(res)
    } catch {
      setMusteriler([])
    } finally {
      setYukleniyor(false)
    }
  }

  async function musteriSec(m: Musteri) {
    try {
      const detay = await getCustomerById(m.id)
      setSecili(detay as Musteri)
      setForm({
        name: detay.name,
        phone: detay.phone,
        note: detay.note,
        identityNo: (detay as any).identityNo ?? '',
        birthDate: (detay as any).birthDate ? String((detay as any).birthDate).slice(0, 10) : '',
        ePostaEmail: (detay as any).ePostaEmail ?? '',
      })
      setDuzenle(false)
      setHata(null)
      setBasari(null)
    } catch {
      setHata('Müşteri detayı yüklenemedi.')
    }
  }

  async function kaydet() {
    if (!secili) return
    setKaydetYukleniyor(true)
    setHata(null)
    setBasari(null)
    try {
      await updateCustomer(secili.id, {
        name: form.name?.trim(),
        phone: form.phone?.trim(),
        note: form.note?.trim() || undefined,
        identityNo: form.identityNo?.trim() || undefined,
        birthDate: form.birthDate ? new Date(form.birthDate).toISOString() : undefined,
        ePostaEmail: form.ePostaEmail?.trim() || undefined,
      })
      setBasari('Müşteri güncellendi.')
      setDuzenle(false)
      void ara()
    } catch (e: any) {
      setHata(e?.response?.data?.message ?? 'Güncelleme başarısız.')
    } finally {
      setKaydetYukleniyor(false)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb',
    borderRadius: 8, fontSize: 13, boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, display: 'block' }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#1a1a2e' }}>Müşteriler</h1>
      </div>

      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Ad, telefon veya TC kimlik ile ara... (en az 3 karakter)"
        style={{ ...inp, marginBottom: 16, fontSize: 14 }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: secili ? '1fr 1.4fr' : '1fr', gap: 16 }}>
        <div>
          {yukleniyor && <div style={{ color: '#9ca3af', fontSize: 13 }}>Aranıyor...</div>}
          {!yukleniyor && q.length >= 2 && musteriler.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: 24, textAlign: 'center', background: '#f9fafb', borderRadius: 12 }}>Müşteri bulunamadı</div>
          )}
          {musteriler.map(m => (
            <div
              key={m.id}
              onClick={() => void musteriSec(m)}
              style={{
                border: `2px solid ${secili?.id === m.id ? '#1a1a2e' : '#e5e7eb'}`,
                borderRadius: 12, padding: '12px 14px', marginBottom: 8,
                cursor: 'pointer', background: 'white',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14, color: '#1a1a2e' }}>{m.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{m.phone}</div>
            </div>
          ))}
        </div>

        {secili && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, background: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#1a1a2e' }}>{secili.name}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => navigate(`/sales?customerId=${secili.id}`)}
                  style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer' }}
                >
                  Satışları Gör
                </button>
                <button
                  type="button"
                  onClick={() => setDuzenle(d => !d)}
                  style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #1a1a2e', background: duzenle ? '#1a1a2e' : 'white', color: duzenle ? 'white' : '#1a1a2e', cursor: 'pointer', fontWeight: 700 }}
                >
                  {duzenle ? 'İptal' : 'Düzenle'}
                </button>
              </div>
            </div>

            {hata && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{hata}</div>}
            {basari && <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{basari}</div>}

            {duzenle ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div><label style={label}>Ad Soyad*</label><input style={inp} value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label style={label}>Telefon*</label><input style={inp} value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><label style={label}>TC Kimlik No</label><input style={inp} value={form.identityNo ?? ''} onChange={e => setForm(f => ({ ...f, identityNo: e.target.value }))} maxLength={11} /></div>
                <div><label style={label}>Doğum Tarihi</label><input style={inp} type="date" value={form.birthDate ?? ''} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} /></div>
                <div><label style={label}>E-posta</label><input style={inp} value={form.ePostaEmail ?? ''} onChange={e => setForm(f => ({ ...f, ePostaEmail: e.target.value }))} /></div>
                <div><label style={label}>Not</label><textarea style={{ ...inp, resize: 'vertical', minHeight: 60 }} value={form.note ?? ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></div>
                <button
                  type="button"
                  onClick={() => void kaydet()}
                  disabled={kaydetYukleniyor}
                  style={{ padding: '10px', borderRadius: 8, border: 'none', background: '#C8102E', color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}
                >
                  {kaydetYukleniyor ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                {[
                  ['Telefon', secili.phone],
                  ['TC Kimlik', (secili as any).identityNo],
                  ['Doğum Tarihi', (secili as any).birthDate ? new Date((secili as any).birthDate).toLocaleDateString('tr-TR') : null],
                  ['E-posta', (secili as any).ePostaEmail],
                  ['Not', secili.note],
                ].map(([k, v]) => v ? (
                  <div key={k} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: '#9ca3af', minWidth: 100 }}>{k}</span>
                    <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{v}</span>
                  </div>
                ) : null)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
