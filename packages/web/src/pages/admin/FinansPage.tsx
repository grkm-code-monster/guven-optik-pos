import { useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const btnPrimary: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }
const btnSmall: React.CSSProperties = { ...btn, padding: '5px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#374151' }

type Varlik = {
  id: string; ad: string; tip: string; katman: string
  sirketId: number | null; sirketAdi: string | null
  subeAdi: string | null; para_birimi: string
  aciklama: string | null; bakiye?: number
}

type Ortak = {
  id: string; ad: string; soyad: string | null
  telefon: string | null; bakiye?: number
}

type Hareket = {
  id: string; tarih: string; tip: string; katman: string
  tutar: number; paraBirimi: string; aciklama: string | null
  odemeYontemi: string | null; sirketAdi: string | null
  kaynakVarlik?: { ad: string } | null
  hedefVarlik?: { ad: string } | null
  ortak?: { ad: string } | null
}

const TIP_RENK: Record<string, string> = {
  BANKA: '#3b82f6', KASA: '#10b981', POS: '#8b5cf6',
  ORTAK: '#f59e0b', CEK: '#ef4444', DBS: '#6366f1', EK_HESAP: '#ec4899'
}

const KATMAN_BADGE = (katman: string) => (
  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
    backgroundColor: katman === 'RESMI' ? '#dbeafe' : '#fef3c7',
    color: katman === 'RESMI' ? '#1d4ed8' : '#92400e' }}>
    {katman === 'RESMI' ? '⚖️ Resmi' : '🔒 Operasyonel'}
  </span>
)

const SIRKETLER = [
  { id: 1, ad: 'GÜVEN OPTİK 1959' },
  { id: 2, ad: 'NG' },
  { id: 3, ad: 'ADESE' },
  { id: 4, ad: 'POTENTIAL' },
]

export default function FinansPage() {
  const [sekme, setSekme] = useState<'dashboard' | 'varliklar' | 'hareketler' | 'ortaklar'>('dashboard')

  // Dashboard
  const [ozet, setOzet] = useState<{ varliklar: (Varlik & { bakiye: number })[]; ortaklar: (Ortak & { bakiye: number })[] } | null>(null)
  const [ozetYukleniyor, setOzetYukleniyor] = useState(false)

  // Varlıklar
  const [varliklar, setVarliklar] = useState<Varlik[]>([])
  const [varlikFormu, setVarlikFormu] = useState(false)
  const [yeniVarlik, setYeniVarlik] = useState({ ad: '', tip: 'KASA', katman: 'RESMI', sirketId: 1, sirketAdi: 'GÜVEN OPTİK 1959', subeAdi: '', para_birimi: 'TRY', aciklama: '' })

  // Hareketler
  const [hareketler, setHareketler] = useState<Hareket[]>([])
  const [hareketFormu, setHareketFormu] = useState(false)
  const [yeniHareket, setYeniHareket] = useState({ tip: 'TAHSILAT', katman: 'RESMI', kaynakVarlikId: '', hedefVarlikId: '', tutar: '', odemeYontemi: 'NAKIT', aciklama: '', sirketId: 1, sirketAdi: 'GÜVEN OPTİK 1959' })

  // Ortaklar
  const [ortaklar, setOrtaklar] = useState<Ortak[]>([])
  const [ortakFormu, setOrtakFormu] = useState(false)
  const [yeniOrtak, setYeniOrtak] = useState({ ad: '', soyad: '', telefon: '', email: '' })

  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { void ozetYukle() }, [])
  useEffect(() => {
    if (sekme === 'varliklar') void varliklarYukle()
    if (sekme === 'hareketler') { void varliklarYukle(); void hareketlerYukle() }
    if (sekme === 'ortaklar') void ortaklarYukle()
  }, [sekme])

  async function ozetYukle() {
    setOzetYukleniyor(true)
    try {
      const res = await adminApi.get('/admin/finans-ozet')
      setOzet(res.data)
    } catch { } finally { setOzetYukleniyor(false) }
  }

  async function varliklarYukle() {
    try {
      const res = await adminApi.get('/admin/finansal-varliklar')
      setVarliklar(res.data?.data ?? [])
    } catch { }
  }

  async function hareketlerYukle() {
    try {
      const res = await adminApi.get('/admin/finans-hareketler?limit=50')
      setHareketler(res.data?.data ?? [])
    } catch { }
  }

  async function ortaklarYukle() {
    try {
      const res = await adminApi.get('/admin/ortaklar')
      setOrtaklar(res.data?.data ?? [])
    } catch { }
  }

  async function varlikKaydet() {
    setLoading(true); setMesaj(null)
    try {
      await adminApi.post('/admin/finansal-varlik-ekle', yeniVarlik)
      setMesaj({ tip: 'ok', text: 'Varlık eklendi' })
      setVarlikFormu(false)
      void varliklarYukle()
      void ozetYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  async function hareketKaydet() {
    setLoading(true); setMesaj(null)
    try {
      await adminApi.post('/admin/finans-hareket-ekle', { ...yeniHareket, tutar: Number(yeniHareket.tutar) })
      setMesaj({ tip: 'ok', text: 'Hareket kaydedildi' })
      setHareketFormu(false)
      void hareketlerYukle()
      void ozetYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  async function ortakKaydet() {
    setLoading(true); setMesaj(null)
    try {
      await adminApi.post('/admin/ortak-ekle', yeniOrtak)
      setMesaj({ tip: 'ok', text: 'Ortak eklendi' })
      setOrtakFormu(false)
      void ortaklarYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  const toplamVarlik = ozet?.varliklar.reduce((a, v) => a + (v.bakiye || 0), 0) ?? 0
  const resmiVarlik = ozet?.varliklar.filter(v => v.katman === 'RESMI').reduce((a, v) => a + (v.bakiye || 0), 0) ?? 0
  const operasyonelVarlik = ozet?.varliklar.filter(v => v.katman === 'OPERASYONEL').reduce((a, v) => a + (v.bakiye || 0), 0) ?? 0

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#1a1a2e', marginBottom: 20 }}>💰 Finans Yönetim Merkezi</div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
        {([['dashboard', '📊 Dashboard'], ['varliklar', '🏦 Finansal Varlıklar'], ['hareketler', '💸 Hareketler'], ['ortaklar', '👥 Ortaklar']] as const).map(([s, label]) => (
          <button key={s} type="button" onClick={() => setSekme(s)}
            style={{ padding: '10px 20px', fontSize: 13, fontWeight: sekme === s ? 900 : 600, color: sekme === s ? '#1a1a2e' : '#9ca3af', background: 'none', border: 'none', borderBottom: sekme === s ? '2px solid #1a1a2e' : '2px solid transparent', marginBottom: -2, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {mesaj && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 700,
          backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b' }}>
          {mesaj.tip === 'ok' ? '✓ ' : '✕ '}{mesaj.text}
        </div>
      )}

      {/* DASHBOARD */}
      {sekme === 'dashboard' && (
        <div>
          {ozetYukleniyor ? (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Yükleniyor...</div>
          ) : (
            <>
              {/* Özet kartlar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Toplam Finansal Varlık</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#166534' }}>₺{toplamVarlik.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                </div>
                <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>⚖️ Resmi Varlık</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#1d4ed8' }}>₺{resmiVarlik.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                </div>
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>🔒 Operasyonel Varlık</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#92400e' }}>₺{operasyonelVarlik.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                </div>
              </div>

              {/* Varlık listesi */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Finansal Varlıklar</div>
                {ozet?.varliklar.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 30, backgroundColor: '#f9fafb', borderRadius: 12 }}>
                    Henüz finansal varlık tanımlanmamış.<br />
                    <button type="button" onClick={() => setSekme('varliklar')} style={{ ...btnPrimary, marginTop: 12 }}>Varlık Ekle</button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                    {ozet?.varliklar.map(v => (
                      <div key={v.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, backgroundColor: 'white' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: TIP_RENK[v.tip] ?? '#374151', backgroundColor: `${TIP_RENK[v.tip] ?? '#374151'}15`, padding: '2px 8px', borderRadius: 20 }}>{v.tip}</span>
                          {KATMAN_BADGE(v.katman)}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 2 }}>{v.ad}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>{v.sirketAdi} {v.subeAdi && `· ${v.subeAdi}`}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: v.bakiye >= 0 ? '#059669' : '#ef4444' }}>
                          ₺{v.bakiye.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ortak bakiyeleri */}
              {(ozet?.ortaklar.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Ortak Bakiyeleri</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {ozet?.ortaklar.map(o => (
                      <div key={o.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, backgroundColor: 'white' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>👤 {o.ad} {o.soyad}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: o.bakiye >= 0 ? '#059669' : '#ef4444' }}>
                          ₺{o.bakiye.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.bakiye >= 0 ? 'Şirkete alacaklı' : 'Şirketten alacaklı'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* FİNANSAL VARLIKLAR */}
      {sekme === 'varliklar' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Finansal Varlıklar ({varliklar.length})</div>
            <button type="button" onClick={() => setVarlikFormu(!varlikFormu)} style={btnPrimary}>+ Yeni Varlık</button>
          </div>

          {varlikFormu && (
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Yeni Finansal Varlık</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Varlık Adı *</label>
                  <input value={yeniVarlik.ad} onChange={e => setYeniVarlik(p => ({ ...p, ad: e.target.value }))} placeholder="ör: NG Garanti Hesabı" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Tip *</label>
                  <select value={yeniVarlik.tip} onChange={e => setYeniVarlik(p => ({ ...p, tip: e.target.value }))} style={inp}>
                    {['BANKA', 'KASA', 'POS', 'ORTAK', 'CEK', 'DBS', 'EK_HESAP'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Katman *</label>
                  <select value={yeniVarlik.katman} onChange={e => setYeniVarlik(p => ({ ...p, katman: e.target.value }))} style={inp}>
                    <option value="RESMI">⚖️ Resmi</option>
                    <option value="OPERASYONEL">🔒 Operasyonel</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şirket</label>
                  <select value={yeniVarlik.sirketId} onChange={e => {
                    const s = SIRKETLER.find(x => x.id === Number(e.target.value))
                    setYeniVarlik(p => ({ ...p, sirketId: Number(e.target.value), sirketAdi: s?.ad ?? '' }))
                  }} style={inp}>
                    {SIRKETLER.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şube / Mağaza</label>
                  <input value={yeniVarlik.subeAdi} onChange={e => setYeniVarlik(p => ({ ...p, subeAdi: e.target.value }))} placeholder="ör: GVN1, ANADEPO" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Açıklama</label>
                  <input value={yeniVarlik.aciklama} onChange={e => setYeniVarlik(p => ({ ...p, aciklama: e.target.value }))} placeholder="ör: Maaş ödemesi için kullanılır" style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setVarlikFormu(false)} style={btnSmall}>İptal</button>
                <button type="button" onClick={varlikKaydet} disabled={loading || !yeniVarlik.ad.trim()} style={btnPrimary}>
                  {loading ? 'Kaydediliyor...' : '✓ Kaydet'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
            {varliklar.map(v => (
              <div key={v.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TIP_RENK[v.tip] ?? '#374151', backgroundColor: `${TIP_RENK[v.tip] ?? '#374151'}15`, padding: '2px 8px', borderRadius: 20 }}>{v.tip}</span>
                  {KATMAN_BADGE(v.katman)}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{v.ad}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{v.sirketAdi} {v.subeAdi && `· ${v.subeAdi}`}</div>
                {v.aciklama && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{v.aciklama}</div>}
              </div>
            ))}
            {varliklar.length === 0 && <div style={{ fontSize: 13, color: '#9ca3af' }}>Henüz varlık eklenmemiş.</div>}
          </div>
        </div>
      )}

      {/* HAREKETLER */}
      {sekme === 'hareketler' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Para Hareketleri</div>
            <button type="button" onClick={() => setHareketFormu(!hareketFormu)} style={btnPrimary}>+ Yeni Hareket</button>
          </div>

          {hareketFormu && (
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Yeni Hareket</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Hareket Tipi *</label>
                  <select value={yeniHareket.tip} onChange={e => setYeniHareket(p => ({ ...p, tip: e.target.value }))} style={inp}>
                    {['TAHSILAT', 'ODEME', 'VIRMAN', 'ORTAK_DESTEGI', 'ORTAK_ODEME', 'SIRKET_TRANSFER', 'POS_TAHSILAT', 'CEK_CIKIS', 'CEK_TAHSIL', 'NAKIT_CIKIS', 'OPERASYONEL', 'FATURASIZ'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Katman *</label>
                  <select value={yeniHareket.katman} onChange={e => setYeniHareket(p => ({ ...p, katman: e.target.value }))} style={inp}>
                    <option value="RESMI">⚖️ Resmi</option>
                    <option value="OPERASYONEL">🔒 Operasyonel</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Tutar (₺) *</label>
                  <input type="number" value={yeniHareket.tutar} onChange={e => setYeniHareket(p => ({ ...p, tutar: e.target.value }))} placeholder="0.00" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Kaynak Varlık</label>
                  <select value={yeniHareket.kaynakVarlikId} onChange={e => setYeniHareket(p => ({ ...p, kaynakVarlikId: e.target.value }))} style={inp}>
                    <option value="">— Seçin —</option>
                    {varliklar.map(v => <option key={v.id} value={v.id}>{v.ad} ({v.sirketAdi})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Hedef Varlık</label>
                  <select value={yeniHareket.hedefVarlikId} onChange={e => setYeniHareket(p => ({ ...p, hedefVarlikId: e.target.value }))} style={inp}>
                    <option value="">— Seçin —</option>
                    {varliklar.map(v => <option key={v.id} value={v.id}>{v.ad} ({v.sirketAdi})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Ödeme Yöntemi</label>
                  <select value={yeniHareket.odemeYontemi} onChange={e => setYeniHareket(p => ({ ...p, odemeYontemi: e.target.value }))} style={inp}>
                    {['NAKIT', 'HAVALE', 'EFT', 'KART', 'CEK', 'DBS'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Açıklama</label>
                  <input value={yeniHareket.aciklama} onChange={e => setYeniHareket(p => ({ ...p, aciklama: e.target.value }))} placeholder="Hareket açıklaması..." style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setHareketFormu(false)} style={btnSmall}>İptal</button>
                <button type="button" onClick={hareketKaydet} disabled={loading || !yeniHareket.tutar} style={btnPrimary}>
                  {loading ? 'Kaydediliyor...' : '✓ Kaydet'}
                </button>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Tarih</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Tip</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Katman</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Kaynak → Hedef</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Açıklama</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>Tutar</th>
                </tr>
              </thead>
              <tbody>
                {hareketler.map(h => (
                  <tr key={h.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{new Date(h.tarih).toLocaleDateString('tr-TR')}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, backgroundColor: '#f3f4f6', fontWeight: 700 }}>{h.tip}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>{KATMAN_BADGE(h.katman)}</td>
                    <td style={{ padding: '10px 14px', color: '#374151' }}>
                      {h.kaynakVarlik?.ad ?? '—'} → {h.hedefVarlik?.ad ?? '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6b7280' }}>{h.aciklama ?? '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                      ₺{h.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {hareketler.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Henüz hareket kaydedilmemiş</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ORTAKLAR */}
      {sekme === 'ortaklar' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Ortaklar ({ortaklar.length})</div>
            <button type="button" onClick={() => setOrtakFormu(!ortakFormu)} style={btnPrimary}>+ Yeni Ortak</button>
          </div>

          {ortakFormu && (
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Yeni Ortak</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Ad *</label>
                  <input value={yeniOrtak.ad} onChange={e => setYeniOrtak(p => ({ ...p, ad: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Soyad</label>
                  <input value={yeniOrtak.soyad} onChange={e => setYeniOrtak(p => ({ ...p, soyad: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Telefon</label>
                  <input value={yeniOrtak.telefon} onChange={e => setYeniOrtak(p => ({ ...p, telefon: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>E-posta</label>
                  <input value={yeniOrtak.email} onChange={e => setYeniOrtak(p => ({ ...p, email: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setOrtakFormu(false)} style={btnSmall}>İptal</button>
                <button type="button" onClick={ortakKaydet} disabled={loading || !yeniOrtak.ad.trim()} style={btnPrimary}>
                  {loading ? 'Kaydediliyor...' : '✓ Kaydet'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
            {ortaklar.map(o => (
              <div key={o.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>👤 {o.ad} {o.soyad}</div>
                {o.telefon && <div style={{ fontSize: 12, color: '#6b7280' }}>📞 {o.telefon}</div>}
                <button type="button" onClick={() => setSekme('hareketler')} style={{ ...btnSmall, marginTop: 8, fontSize: 11 }}>Hareketleri Gör</button>
              </div>
            ))}
            {ortaklar.length === 0 && <div style={{ fontSize: 13, color: '#9ca3af' }}>Henüz ortak eklenmemiş.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
