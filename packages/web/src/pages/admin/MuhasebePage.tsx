import { useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

const inp: React.CSSProperties = { padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: 'white' }
const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const btnPrimary: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }
const btnSmall: React.CSSProperties = { ...btn, padding: '5px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#374151' }
const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12, backgroundColor: '#f9fafb' }
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12, borderTop: '1px solid #f3f4f6' }

const SIRKETLER = [
  { id: 0, ad: 'Tümü' },
  { id: 1, ad: 'GÜVEN OPTİK 1959' },
  { id: 2, ad: 'NG' },
  { id: 3, ad: 'ADESE' },
  { id: 4, ad: 'POTENTIAL' },
]

type DashboardSirket = {
  sirketId: number; sirketAdi: string
  toplamAlacak: number; toplamBorc: number
  buAySatis: number; buAyAlis: number
  vadesiGecmisSayisi: number; vadesiGecmisToplam: number
  faturaSayisi: { odenmemisSatis: number; odenmemisAlis: number }
  hata?: string
}

type Fatura = {
  id: number; name: string; tip: string; durum: string; odemeDurum: string
  cariAdi: string; tarih: string; vadeTarihi: string
  kdvHaric: number; toplam: number; kalan: number
  sirketAdi: string; sirketId: number; ref: string
}

type Cari = {
  id: number; ad: string; vat: string; alacak: number; borc: number; net: number
}

type TkDurum = 'BAGLI_DEGIL' | 'KURUS' | 'KALAN' | 'YANLIS_SIRKET' | 'FATURA_YOK'
type TkSatir = {
  paymentId: number; belge: string; tarih: string; tutar: number; kalan: number
  yevmiye: string; sirketId: number; sirketAdi: string
  satisId: string | null; satisNo: string | null; sube: string | null; musteri: string | null
  faturaId: number | null; faturaNo: string | null; faturaSirketi: string | null; faturaKalan: number | null
  durum: TkDurum
}
// 20.11.2026 — Tahsilat Kontrol: faturasıyla tam eşleşmeyen POS tahsilatları
const TK_DURUM: Record<TkDurum, { ad: string; aciklama: string; bg: string; color: string }> = {
  BAGLI_DEGIL: { ad: 'Faturaya bağlı değil', aciklama: 'Tahsilat ve fatura aynı şirkette ama eşleştirilmemiş — "Faturaya bağla" ile kapanır', bg: '#fef3c7', color: '#92400e' },
  YANLIS_SIRKET: { ad: 'Yanlış şirket', aciklama: 'Tahsilat faturadan farklı şirkette — taşıma komutuyla düzeltilir', bg: '#fee2e2', color: '#991b1b' },
  FATURA_YOK: { ad: 'Faturası yok', aciklama: 'Satışın Odoo\'da onaylı faturası yok', bg: '#f3e8ff', color: '#7c3aed' },
  KALAN: { ad: 'Fazla tahsilat', aciklama: 'Bağlı ama tahsilatın 1 TL\'den fazlası açıkta (fatura tutarından fazla alınmış)', bg: '#eff6ff', color: '#1d4ed8' },
  KURUS: { ad: 'Kuruş farkı', aciklama: 'Bağlı, 1 TL\'ye kadar yuvarlama farkı açıkta — muhasebeci kararıyla toplu kapatılacak', bg: '#f3f4f6', color: '#374151' },
}
const tl = (n: number) => `₺${(n ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function MuhasebePage() {
  const [sekme, setSekme] = useState<'dashboard' | 'faturalar' | 'cari' | 'tahsilat'>('dashboard')

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardSirket[]>([])
  const [dashYukleniyor, setDashYukleniyor] = useState(false)

  // Faturalar
  const [faturalar, setFaturalar] = useState<Fatura[]>([])
  const [faturaYukleniyor, setFaturaYukleniyor] = useState(false)
  const [filtre, setFiltre] = useState({ sirketId: 0, tip: 'tumu', durum: 'tumu', baslangic: '', bitis: '' })

  // Cari
  const [cariler, setCariler] = useState<Cari[]>([])
  const [cariYukleniyor, setCariYukleniyor] = useState(false)
  const [cariSirket, setCariSirket] = useState(0)
  const [cariArama, setCariArama] = useState('')

  // Tahsilat Kontrol
  const [tk, setTk] = useState<TkSatir[]>([])
  const [tkYukleniyor, setTkYukleniyor] = useState(false)
  const [tkHata, setTkHata] = useState('')
  const [tkFiltre, setTkFiltre] = useState({ sirketId: 0, baslangic: '', bitis: '' })
  const [tkDurum, setTkDurum] = useState<TkDurum | 'TUMU'>('TUMU')
  const [tkIslem, setTkIslem] = useState<Record<number, string>>({})
  const [tkToplu, setTkToplu] = useState('')

  useEffect(() => { void dashboardYukle() }, [])
  useEffect(() => {
    if (sekme === 'faturalar') void faturaYukle()
    if (sekme === 'cari') void cariYukle()
    if (sekme === 'tahsilat') void tkYukle()
  }, [sekme])

  async function dashboardYukle() {
    setDashYukleniyor(true)
    try {
      const res = await adminApi.get('/admin/muhasebe-dashboard')
      setDashboard(res.data?.data ?? [])
    } catch { } finally { setDashYukleniyor(false) }
  }

  async function faturaYukle() {
    setFaturaYukleniyor(true)
    try {
      const params = new URLSearchParams()
      if (filtre.sirketId) params.set('sirketId', String(filtre.sirketId))
      if (filtre.tip !== 'tumu') params.set('tip', filtre.tip)
      if (filtre.durum !== 'tumu') params.set('durum', filtre.durum)
      if (filtre.baslangic) params.set('baslangic', filtre.baslangic)
      if (filtre.bitis) params.set('bitis', filtre.bitis)
      params.set('limit', '100')
      const res = await adminApi.get(`/admin/muhasebe-faturalar?${params}`)
      setFaturalar(res.data?.data ?? [])
    } catch { } finally { setFaturaYukleniyor(false) }
  }

  async function cariYukle() {
    setCariYukleniyor(true)
    try {
      const params = new URLSearchParams()
      if (cariSirket) params.set('sirketId', String(cariSirket))
      if (cariArama) params.set('q', cariArama)
      const res = await adminApi.get(`/admin/muhasebe-cari?${params}`)
      setCariler(res.data?.data ?? [])
    } catch { } finally { setCariYukleniyor(false) }
  }

  async function tkYukle() {
    setTkYukleniyor(true); setTkHata('')
    try {
      const params = new URLSearchParams()
      if (tkFiltre.sirketId) params.set('sirketId', String(tkFiltre.sirketId))
      if (tkFiltre.baslangic) params.set('baslangic', tkFiltre.baslangic)
      if (tkFiltre.bitis) params.set('bitis', tkFiltre.bitis)
      const res = await adminApi.get(`/admin/muhasebe-tahsilat-kontrol?${params}`)
      setTk(res.data?.data?.satirlar ?? [])
      setTkIslem({})
    } catch (e: any) {
      setTkHata(e?.response?.data?.error ?? 'Liste okunamadı')
    } finally { setTkYukleniyor(false) }
  }

  const tkBaglanabilir = (r: TkSatir) => r.durum === 'BAGLI_DEGIL' && !!r.faturaId && (r.faturaKalan ?? 0) > 0.01

  async function tkBagla(r: TkSatir): Promise<boolean> {
    setTkIslem(p => ({ ...p, [r.paymentId]: '⏳ Bağlanıyor…' }))
    try {
      const res = await adminApi.post('/admin/muhasebe-tahsilat-bagla', { paymentId: r.paymentId })
      setTkIslem(p => ({ ...p, [r.paymentId]: `✓ ${res.data?.mesaj ?? 'Bağlandı'}` }))
      return true
    } catch (e: any) {
      setTkIslem(p => ({ ...p, [r.paymentId]: `⚠️ ${e?.response?.data?.error ?? 'Bağlanamadı'}` }))
      return false
    }
  }

  async function tkTopluBagla() {
    const liste = tk.filter(tkBaglanabilir).filter(r => !tkIslem[r.paymentId]?.startsWith('✓'))
    if (!liste.length) return
    if (!window.confirm(`${liste.length} tahsilat kendi faturasına bağlanacak. Devam?`)) return
    let ok = 0
    for (let i = 0; i < liste.length; i++) {
      setTkToplu(`${i + 1} / ${liste.length} bağlanıyor…`)
      if (await tkBagla(liste[i])) ok++
    }
    setTkToplu(`Bitti: ${ok} bağlandı, ${liste.length - ok} bağlanamadı. Listeyi yenilemek için "Listele".`)
  }

  const ODEME_BADGE = (durum: string) => {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      paid: { label: '✓ Ödendi', bg: '#dcfce7', color: '#166534' },
      not_paid: { label: '⏳ Ödenmedi', bg: '#fef3c7', color: '#92400e' },
      partial: { label: '◑ Kısmi', bg: '#eff6ff', color: '#1d4ed8' },
      in_payment: { label: '↗ İşlemde', bg: '#f3e8ff', color: '#7c3aed' },
    }
    const s = map[durum] ?? { label: durum, bg: '#f3f4f6', color: '#374151' }
    return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: s.bg, color: s.color }}>{s.label}</span>
  }

  const TIP_BADGE = (tip: string) => {
    const satis = ['out_invoice', 'out_refund'].includes(tip)
    return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: satis ? '#dcfce7' : '#fee2e2', color: satis ? '#166534' : '#991b1b' }}>
      {tip === 'out_invoice' ? '📤 Satış' : tip === 'in_invoice' ? '📥 Alış' : tip === 'out_refund' ? '↩ Satış İade' : '↩ Alış İade'}
    </span>
  }

  const toplamAlacak = dashboard.reduce((a, s) => a + (s.toplamAlacak ?? 0), 0)
  const toplamBorc = dashboard.reduce((a, s) => a + (s.toplamBorc ?? 0), 0)
  const toplamSatis = dashboard.reduce((a, s) => a + (s.buAySatis ?? 0), 0)
  const toplamAlis = dashboard.reduce((a, s) => a + (s.buAyAlis ?? 0), 0)

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#1a1a2e', marginBottom: 20 }}>📒 Muhasebe</div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
        {([['dashboard', '📊 Dashboard'], ['faturalar', '🧾 Faturalar'], ['cari', '👥 Cari Hesaplar'], ['tahsilat', '🔗 Tahsilat Kontrol']] as const).map(([s, label]) => (
          <button key={s} type="button" onClick={() => setSekme(s)}
            style={{ padding: '10px 20px', fontSize: 13, fontWeight: sekme === s ? 900 : 600, color: sekme === s ? '#1a1a2e' : '#9ca3af', background: 'none', border: 'none', borderBottom: sekme === s ? '2px solid #1a1a2e' : '2px solid transparent', marginBottom: -2, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* DASHBOARD */}
      {sekme === 'dashboard' && (
        <div>
          {dashYukleniyor ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Yükleniyor...</div> : (
            <>
              {/* Toplam özet */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
                {[
                  { label: 'Toplam Alacak', value: toplamAlacak, color: '#059669', bg: '#f0fdf4', border: '#86efac' },
                  { label: 'Toplam Borç', value: toplamBorc, color: '#ef4444', bg: '#fff1f2', border: '#fca5a5' },
                  { label: 'Bu Ay Satış', value: toplamSatis, color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
                  { label: 'Bu Ay Alış', value: toplamAlis, color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
                ].map(k => (
                  <div key={k.label} style={{ backgroundColor: k.bg, border: `1px solid ${k.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{k.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: k.color }}>₺{k.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                  </div>
                ))}
              </div>

              {/* Şirket bazlı tablo */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Şirket</th>
                      <th style={{ ...th, textAlign: 'right' }}>Alacak</th>
                      <th style={{ ...th, textAlign: 'right' }}>Borç</th>
                      <th style={{ ...th, textAlign: 'right' }}>Bu Ay Satış</th>
                      <th style={{ ...th, textAlign: 'right' }}>Bu Ay Alış</th>
                      <th style={{ ...th, textAlign: 'right' }}>Vadesi Geçmiş</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.map(s => (
                      <tr key={s.sirketId} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ ...td, fontWeight: 700 }}>{s.sirketAdi}</td>
                        {s.hata ? (
                          <td colSpan={5} style={{ ...td, color: '#ef4444' }}>⚠️ {s.hata}</td>
                        ) : (
                          <>
                            <td style={{ ...td, textAlign: 'right', color: '#059669', fontWeight: 700 }}>₺{(s.toplamAlacak ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            <td style={{ ...td, textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>₺{(s.toplamBorc ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            <td style={{ ...td, textAlign: 'right' }}>₺{(s.buAySatis ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            <td style={{ ...td, textAlign: 'right' }}>₺{(s.buAyAlis ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              {s.vadesiGecmisSayisi > 0 ? (
                                <span style={{ color: '#ef4444', fontWeight: 700 }}>
                                  {s.vadesiGecmisSayisi} fatura · ₺{(s.vadesiGecmisToplam ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                </span>
                              ) : <span style={{ color: '#9ca3af' }}>—</span>}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* FATURALAR */}
      {sekme === 'faturalar' && (
        <div>
          {/* Filtreler */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filtre.sirketId} onChange={e => setFiltre(p => ({ ...p, sirketId: Number(e.target.value) }))} style={{ ...inp }}>
              {SIRKETLER.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
            </select>
            <select value={filtre.tip} onChange={e => setFiltre(p => ({ ...p, tip: e.target.value }))} style={inp}>
              <option value="tumu">Tüm Tipler</option>
              <option value="satis">Satış Faturaları</option>
              <option value="alis">Alış Faturaları</option>
            </select>
            <select value={filtre.durum} onChange={e => setFiltre(p => ({ ...p, durum: e.target.value }))} style={inp}>
              <option value="tumu">Tüm Durumlar</option>
              <option value="odenmemis">Ödenmemiş</option>
              <option value="odenmis">Ödenmiş</option>
            </select>
            <input type="date" value={filtre.baslangic} onChange={e => setFiltre(p => ({ ...p, baslangic: e.target.value }))} style={inp} />
            <input type="date" value={filtre.bitis} onChange={e => setFiltre(p => ({ ...p, bitis: e.target.value }))} style={inp} />
            <button type="button" onClick={faturaYukle} style={btnPrimary}>🔍 Filtrele</button>
          </div>

          {faturaYukleniyor ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Yükleniyor...</div> : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', backgroundColor: '#f9fafb', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                {faturalar.length} fatura listelendi
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={th}>Fatura No</th>
                      <th style={th}>Tip</th>
                      <th style={th}>Cari</th>
                      <th style={th}>Şirket</th>
                      <th style={th}>Tarih</th>
                      <th style={th}>Vade</th>
                      <th style={{ ...th, textAlign: 'right' }}>Toplam</th>
                      <th style={{ ...th, textAlign: 'right' }}>Kalan</th>
                      <th style={th}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faturalar.map(f => (
                      <tr key={f.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ ...td, fontWeight: 700, color: '#1a1a2e' }}>{f.name}</td>
                        <td style={td}>{TIP_BADGE(f.tip)}</td>
                        <td style={{ ...td, color: '#374151' }}>{f.cariAdi || '—'}</td>
                        <td style={{ ...td, fontSize: 11, color: '#9ca3af' }}>{f.sirketAdi}</td>
                        <td style={{ ...td, color: '#6b7280' }}>{f.tarih || '—'}</td>
                        <td style={{ ...td, color: f.vadeTarihi < new Date().toISOString().slice(0, 10) && f.odemeDurum !== 'paid' ? '#ef4444' : '#6b7280', fontWeight: f.vadeTarihi < new Date().toISOString().slice(0, 10) && f.odemeDurum !== 'paid' ? 700 : 400 }}>
                          {f.vadeTarihi || '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>₺{f.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: f.kalan > 0 ? '#ef4444' : '#059669' }}>
                          {f.kalan > 0 ? `₺${f.kalan.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '✓'}
                        </td>
                        <td style={td}>{ODEME_BADGE(f.odemeDurum)}</td>
                      </tr>
                    ))}
                    {faturalar.length === 0 && (
                      <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 30 }}>Fatura bulunamadı</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CARİ HESAPLAR */}
      {sekme === 'cari' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <select value={cariSirket} onChange={e => setCariSirket(Number(e.target.value))} style={inp}>
              {SIRKETLER.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
            </select>
            <input value={cariArama} onChange={e => setCariArama(e.target.value)} placeholder="Cari ara..." style={{ ...inp, width: 200 }} />
            <button type="button" onClick={cariYukle} style={btnPrimary}>🔍 Ara</button>
          </div>

          {cariYukleniyor ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Yükleniyor...</div> : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Cari Adı</th>
                    <th style={th}>Vergi No</th>
                    <th style={{ ...th, textAlign: 'right' }}>Alacak</th>
                    <th style={{ ...th, textAlign: 'right' }}>Borç</th>
                    <th style={{ ...th, textAlign: 'right' }}>Net Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {cariler.map(c => (
                    <tr key={c.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ ...td, fontWeight: 700 }}>{c.ad}</td>
                      <td style={{ ...td, color: '#9ca3af' }}>{c.vat || '—'}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                        {c.alacak > 0 ? `₺${c.alacak.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>
                        {c.borc > 0 ? `₺${c.borc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 900, color: c.net >= 0 ? '#059669' : '#ef4444' }}>
                        ₺{c.net.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {cariler.length === 0 && (
                    <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 30 }}>Cari bulunamadı — Ara butonuna basın</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* TAHSİLAT KONTROL */}
      {sekme === 'tahsilat' && (() => {
        const ozet = (Object.keys(TK_DURUM) as TkDurum[]).map(d => {
          const r = tk.filter(x => x.durum === d)
          return { d, adet: r.length, tutar: r.reduce((a, x) => a + (d === 'KURUS' || d === 'KALAN' ? x.kalan : x.tutar), 0) }
        })
        const gorunen = tkDurum === 'TUMU' ? tk : tk.filter(x => x.durum === tkDurum)
        const baglanabilir = tk.filter(tkBaglanabilir).filter(r => !tkIslem[r.paymentId]?.startsWith('✓')).length
        return (
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              POS'tan Odoo'ya giden tahsilatlardan faturasıyla tam kapanmamış olanlar. Tarih boş bırakılırsa tüm zamanlar.
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={tkFiltre.sirketId} onChange={e => setTkFiltre(p => ({ ...p, sirketId: Number(e.target.value) }))} style={inp}>
                {SIRKETLER.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
              </select>
              <input type="date" value={tkFiltre.baslangic} onChange={e => setTkFiltre(p => ({ ...p, baslangic: e.target.value }))} style={inp} />
              <input type="date" value={tkFiltre.bitis} onChange={e => setTkFiltre(p => ({ ...p, bitis: e.target.value }))} style={inp} />
              <button type="button" onClick={tkYukle} style={btnPrimary} disabled={tkYukleniyor}>🔍 Listele</button>
              {baglanabilir > 0 && (
                <button type="button" onClick={tkTopluBagla} style={{ ...btn, backgroundColor: '#059669', color: 'white' }} disabled={!!tkToplu && tkToplu.includes('bağlanıyor')}>
                  🔗 Bağlanabilenlerin hepsini bağla ({baglanabilir})
                </button>
              )}
              {tkToplu && <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{tkToplu}</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
              {ozet.map(o => (
                <button key={o.d} type="button" onClick={() => setTkDurum(tkDurum === o.d ? 'TUMU' : o.d)} title={TK_DURUM[o.d].aciklama}
                  style={{ textAlign: 'left', backgroundColor: TK_DURUM[o.d].bg, border: tkDurum === o.d ? `2px solid ${TK_DURUM[o.d].color}` : '2px solid transparent', borderRadius: 12, padding: 12, cursor: 'pointer' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TK_DURUM[o.d].color }}>{TK_DURUM[o.d].ad}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#1a1a2e' }}>{o.adet}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{tl(o.tutar)}</div>
                </button>
              ))}
            </div>
            {tkDurum !== 'TUMU' && (
              <div style={{ fontSize: 12, color: TK_DURUM[tkDurum].color, marginBottom: 10 }}>
                {TK_DURUM[tkDurum].aciklama} · <button type="button" onClick={() => setTkDurum('TUMU')} style={{ ...btnSmall, padding: '2px 8px' }}>Tümünü göster</button>
              </div>
            )}

            {tkHata && <div style={{ fontSize: 13, color: '#ef4444', marginBottom: 10 }}>⚠️ {tkHata}</div>}
            {tkYukleniyor ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Odoo'dan okunuyor… (birkaç saniye sürebilir)</div> : (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', backgroundColor: '#f9fafb', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                  {gorunen.length} tahsilat
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                    <thead>
                      <tr>
                        <th style={th}>Tarih</th>
                        <th style={th}>Tahsilat</th>
                        <th style={th}>Müşteri / Satış</th>
                        <th style={th}>Şirket</th>
                        <th style={{ ...th, textAlign: 'right' }}>Tutar</th>
                        <th style={{ ...th, textAlign: 'right' }}>Açıkta</th>
                        <th style={th}>Fatura</th>
                        <th style={th}>Durum</th>
                        <th style={th}>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gorunen.map(r => (
                        <tr key={r.paymentId}>
                          <td style={{ ...td, color: '#6b7280', whiteSpace: 'nowrap' }}>{r.tarih}</td>
                          <td style={td}>
                            <div style={{ fontWeight: 700 }}>{r.belge}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{r.yevmiye}</div>
                          </td>
                          <td style={td}>
                            <div style={{ fontWeight: 700 }}>{r.musteri ?? '—'}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>
                              {r.satisId ? <a href={`/sales/${r.satisId}`} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8' }}>{r.satisNo}</a> : 'POS satışı bulunamadı'}
                              {r.sube ? ` · ${r.sube}` : ''}
                            </div>
                          </td>
                          <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{r.sirketAdi}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{tl(r.tutar)}</td>
                          <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{tl(r.kalan)}</td>
                          <td style={td}>
                            {r.faturaNo ? (
                              <>
                                <div style={{ fontWeight: 700 }}>{r.faturaNo}</div>
                                <div style={{ fontSize: 11, color: r.faturaSirketi !== r.sirketAdi ? '#ef4444' : '#9ca3af' }}>
                                  {r.faturaSirketi} · kalan {tl(r.faturaKalan ?? 0)}
                                </div>
                              </>
                            ) : <span style={{ color: '#9ca3af' }}>—</span>}
                          </td>
                          <td style={td}>
                            <span title={TK_DURUM[r.durum].aciklama} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: TK_DURUM[r.durum].bg, color: TK_DURUM[r.durum].color, whiteSpace: 'nowrap' }}>
                              {TK_DURUM[r.durum].ad}
                            </span>
                          </td>
                          <td style={{ ...td, minWidth: 180 }}>
                            {tkIslem[r.paymentId] ? (
                              <span style={{ fontSize: 11, fontWeight: 700, color: tkIslem[r.paymentId].startsWith('✓') ? '#059669' : tkIslem[r.paymentId].startsWith('⚠️') ? '#ef4444' : '#6b7280' }}>{tkIslem[r.paymentId]}</span>
                            ) : tkBaglanabilir(r) ? (
                              <button type="button" onClick={() => void tkBagla(r)} style={btnSmall}>🔗 Faturaya bağla</button>
                            ) : <span style={{ fontSize: 11, color: '#9ca3af' }}>{r.durum === 'BAGLI_DEGIL' ? 'Fatura zaten kapalı' : '—'}</span>}
                          </td>
                        </tr>
                      ))}
                      {gorunen.length === 0 && (
                        <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 30 }}>{tk.length ? 'Bu durumda tahsilat yok' : 'Açıkta tahsilat yok 🎉'}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
