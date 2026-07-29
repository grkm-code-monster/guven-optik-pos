import { useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

const inp: React.CSSProperties = { padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: 'white', width: '100%', boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const btnPrimary: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }
const btnSmall: React.CSSProperties = { ...btn, padding: '5px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#374151' }
const label: React.CSSProperties = { fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }
const card: React.CSSProperties = { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 8 }

const GRUP_LABEL: Record<string, string> = {
  KIMLIK_KISISEL: 'Kişisel ve Kimlik Belgeleri',
  EGITIM_MESLEKI: 'Eğitim ve Mesleki Belgeler',
  SAGLIK_YASAL: 'Sağlık ve Yasal Belgeler',
  DIGER: 'Diğer Belgeler',
  FIRMA_YONETIMI: 'Firma Tarafından Yönetilen',
}

const SOZLESME_TURLERI = [
  { value: 'TAM_ZAMANLI', label: 'Tam Zamanlı Personel' },
  { value: 'YARI_ZAMANLI', label: 'Yarı Zamanlı Personel' },
  { value: 'OPTISYEN', label: 'Optisyen' },
  { value: 'DIGER', label: 'Diğer' },
]

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function PersonelAyarlarModulu() {
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  // Belge kategorileri
  const [kategoriler, setKategoriler] = useState<any[]>([])
  const [yeniKategori, setYeniKategori] = useState({ kod: '', ad: '', grup: 'DIGER', zorunlu: false })
  const [kategoriFormu, setKategoriFormu] = useState(false)

  // Sözleşme şablonları
  const [sablonlar, setSablonlar] = useState<any[]>([])
  const [yeniSablon, setYeniSablon] = useState({ ad: '', tur: 'TAM_ZAMANLI' })
  const [sablonYukleniyor, setSablonYukleniyor] = useState(false)

  useEffect(() => {
    void kategorileriYukle()
    void sablonlariYukle()
  }, [])

  async function kategorileriYukle() {
    try {
      const res = await adminApi.get('/admin/personel-belge-kategorileri')
      setKategoriler(res.data?.data ?? [])
    } catch {
      setKategoriler([])
    }
  }

  async function sablonlariYukle() {
    try {
      const res = await adminApi.get('/admin/personel-sozlesme-sablonlari')
      setSablonlar(res.data?.data ?? [])
    } catch {
      setSablonlar([])
    }
  }

  async function kategoriEkle() {
    if (!yeniKategori.kod.trim() || !yeniKategori.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Kod ve ad zorunlu' })
      return
    }
    try {
      await adminApi.post('/admin/personel-belge-kategorileri', yeniKategori)
      setMesaj({ tip: 'ok', text: 'Kategori eklendi' })
      setYeniKategori({ kod: '', ad: '', grup: 'DIGER', zorunlu: false })
      setKategoriFormu(false)
      void kategorileriYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Ekleme hatası' })
    }
  }

  async function kategoriGuncelle(id: string, data: Record<string, any>) {
    try {
      await adminApi.put(`/admin/personel-belge-kategorileri/${id}`, data)
      void kategorileriYukle()
    } catch {
      setMesaj({ tip: 'err', text: 'Güncelleme hatası' })
    }
  }

  async function kategoriSil(id: string) {
    if (!confirm('Bu kategori silinsin mi?')) return
    try {
      await adminApi.delete(`/admin/personel-belge-kategorileri/${id}`)
      void kategorileriYukle()
    } catch {
      setMesaj({ tip: 'err', text: 'Silme hatası (kategori kullanımda olabilir)' })
    }
  }

  async function sablonYukle(file: File) {
    if (!yeniSablon.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Şablon adı zorunlu' })
      return
    }
    setSablonYukleniyor(true)
    setMesaj(null)
    try {
      const base64 = await fileToBase64(file)
      await adminApi.post('/admin/personel-sozlesme-sablonlari', {
        ad: yeniSablon.ad.trim(), tur: yeniSablon.tur,
        base64, mimeType: file.type || 'application/pdf', dosyaAdi: file.name,
      })
      setMesaj({ tip: 'ok', text: 'Şablon yüklendi' })
      setYeniSablon({ ad: '', tur: 'TAM_ZAMANLI' })
      void sablonlariYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Yükleme hatası' })
    } finally {
      setSablonYukleniyor(false)
    }
  }

  async function sablonAktifToggle(id: string, aktif: boolean) {
    try {
      await adminApi.put(`/admin/personel-sozlesme-sablonlari/${id}`, { aktif })
      void sablonlariYukle()
    } catch {
      setMesaj({ tip: 'err', text: 'İşlem hatası' })
    }
  }

  async function sablonSil(id: string) {
    if (!confirm('Bu şablon silinsin mi?')) return
    try {
      await adminApi.delete(`/admin/personel-sozlesme-sablonlari/${id}`)
      void sablonlariYukle()
    } catch {
      setMesaj({ tip: 'err', text: 'Silme hatası (bu şablon atanmış olabilir)' })
    }
  }

  const gruplu = kategoriler.reduce((acc: Record<string, any[]>, k) => {
    if (!acc[k.grup]) acc[k.grup] = []
    acc[k.grup].push(k)
    return acc
  }, {})

  return (
    <div>
      {mesaj ? (
        <div style={{
          fontSize: 13, padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontWeight: 700,
          backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b',
        }}>
          {mesaj.tip === 'ok' ? '✓ ' : '✕ '}{mesaj.text}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'flex-start' }}>
        {/* BELGE KATEGORİLERİ */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>📂 Belge Kategorileri ({kategoriler.length})</div>
            <button type="button" onClick={() => setKategoriFormu(!kategoriFormu)} style={btnPrimary}>+ Yeni Kategori</button>
          </div>

          {kategoriFormu ? (
            <div style={card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={label}>Kod (benzersiz) *</label>
                  <input value={yeniKategori.kod} onChange={(e) => setYeniKategori((p) => ({ ...p, kod: e.target.value.toUpperCase() }))} placeholder="ör: OZEL_BELGE" style={inp} />
                </div>
                <div>
                  <label style={label}>Ad *</label>
                  <input value={yeniKategori.ad} onChange={(e) => setYeniKategori((p) => ({ ...p, ad: e.target.value }))} placeholder="ör: Özel Belge" style={inp} />
                </div>
                <div>
                  <label style={label}>Grup</label>
                  <select value={yeniKategori.grup} onChange={(e) => setYeniKategori((p) => ({ ...p, grup: e.target.value }))} style={inp}>
                    {Object.entries(GRUP_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={yeniKategori.zorunlu} onChange={(e) => setYeniKategori((p) => ({ ...p, zorunlu: e.target.checked }))} />
                    Zorunlu belge
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setKategoriFormu(false)} style={btnSmall}>Vazgeç</button>
                <button type="button" onClick={() => void kategoriEkle()} style={btnPrimary}>Kaydet</button>
              </div>
            </div>
          ) : null}

          {Object.entries(gruplu).map(([grup, liste]) => (
            <div key={grup} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>{GRUP_LABEL[grup] ?? grup}</div>
              {liste.map((k) => (
                <div key={k.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: k.aktif ? 1 : 0.5 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{k.ad}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{k.kod}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={k.zorunlu} onChange={(e) => void kategoriGuncelle(k.id, { zorunlu: e.target.checked })} />
                      Zorunlu
                    </label>
                    <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={k.aktif} onChange={(e) => void kategoriGuncelle(k.id, { aktif: e.target.checked })} />
                      Aktif
                    </label>
                    <button type="button" onClick={() => void kategoriSil(k.id)} style={{ ...btnSmall, color: '#ef4444' }}>Sil</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {kategoriler.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, textAlign: 'center' }}>
              Henüz kategori yok. Sunucuda <code>seed-personel-belge-kategorileri.ts</code> script'i çalıştırılarak varsayılan liste yüklenebilir, ya da buradan manuel eklenebilir.
            </div>
          ) : null}
        </div>

        {/* SÖZLEŞME ŞABLONLARI */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>📄 Sözleşme Şablonları ({sablonlar.length})</div>

          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Yeni Şablon / Yeni Versiyon Yükle</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={label}>Şablon Adı *</label>
                <input value={yeniSablon.ad} onChange={(e) => setYeniSablon((p) => ({ ...p, ad: e.target.value }))} placeholder="ör: Tam Zamanlı Personel İş Sözleşmesi" style={inp} />
              </div>
              <div>
                <label style={label}>Sözleşme Türü</label>
                <select value={yeniSablon.tur} onChange={(e) => setYeniSablon((p) => ({ ...p, tur: e.target.value }))} style={inp}>
                  {SOZLESME_TURLERI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <label style={{ ...btnPrimary, display: 'inline-block', cursor: sablonYukleniyor ? 'wait' : 'pointer', opacity: sablonYukleniyor ? 0.6 : 1 }}>
              {sablonYukleniyor ? 'Yükleniyor...' : '+ Şablon Dosyası Seç (PDF/DOC)'}
              <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} disabled={sablonYukleniyor} onChange={(e) => { const f = e.target.files?.[0]; if (f) void sablonYukle(f); e.target.value = '' }} />
            </label>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
              Aynı isimde tekrar yüklerseniz yeni versiyon olarak eklenir, önceki versiyon otomatik pasif olur.
            </div>
          </div>

          {sablonlar.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, textAlign: 'center' }}>Henüz şablon yok</div>
          ) : sablonlar.map((s) => (
            <div key={s.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: s.aktif ? 1 : 0.5 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{s.ad} <span style={{ fontSize: 10, color: '#9ca3af' }}>v{s.versiyon}</span></div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>{SOZLESME_TURLERI.find((t) => t.value === s.tur)?.label ?? s.tur} · {s.dosyaAdi}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={s.aktif} onChange={(e) => void sablonAktifToggle(s.id, e.target.checked)} />
                  Aktif
                </label>
                <button type="button" onClick={() => void sablonSil(s.id)} style={{ ...btnSmall, color: '#ef4444' }}>Sil</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
