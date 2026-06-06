import { useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

const inp: React.CSSProperties = { padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: 'white', width: '100%', boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const btnPrimary: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }
const btnSmall: React.CSSProperties = { ...btn, padding: '5px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#374151' }
const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left' as const, fontWeight: 700, color: '#374151', fontSize: 12, backgroundColor: '#f9fafb' }
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12, borderTop: '1px solid #f3f4f6' }

const POZISYONLAR = ['MUDUR', 'SATIS', 'KASIYER', 'TEKNIK', 'DIGER']
const SIRKETLER = [{ id: 1, ad: 'GÜVEN OPTİK 1959' }, { id: 2, ad: 'NG' }, { id: 3, ad: 'ADESE' }, { id: 4, ad: 'POTENTIAL' }]
const SUBELER = ['GVN1','GVN2','GVN3','GVN4','GVN5','GVN6','GVN8','GVN9','GVN10','ANADEPO']

type Personel = {
  id: string; ad: string; soyad: string; telefon: string | null
  email: string | null; pozisyon: string; subeAdi: string | null
  sirketAdi: string | null; maas: number; aktif: boolean
}

type PrimKural = {
  id: string; ad: string; tip: string; kapsam: string; donem: string
  hedefTutar: number | null; primOrani: number | null; primSabit: number | null
  subeAdi: string | null; pozisyonlar: string | null
}

type PrimSonuc = {
  personelAd: string; pozisyon: string; subeAdi: string | null
  toplamPrim: number
  detaylar: Array<{ kuralAdi: string; kuralTip: string; hedef: number; gerceklesen: number; primTutari: number }>
}

export default function IKPage() {
  const [sekme, setSekme] = useState<'personeller' | 'prim-kurallar' | 'prim-hesap'>('personeller')

  const [personeller, setPersoneller] = useState<Personel[]>([])
  const [personelFormu, setPersonelFormu] = useState(false)
  const [yeniPersonel, setYeniPersonel] = useState({ ad: '', soyad: '', telefon: '', email: '', pozisyon: 'SATIS', subeId: 'GVN1', subeAdi: 'GVN1', sirketId: 3, sirketAdi: 'ADESE', maas: '' })

  const [primKurallar, setPrimKurallar] = useState<PrimKural[]>([])
  const [kuralFormu, setKuralFormu] = useState(false)
  const [yeniKural, setYeniKural] = useState({
    ad: '', tip: 'MAGAZA', kapsam: 'GENEL_SATIS', donem: 'AYLIK',
    hedefTutar: '', primOrani: '', primSabit: '',
    subeId: '', subeAdi: '', sirketId: 3,
    pozisyonlar: [{ pozisyon: 'MUDUR', oran: 0.4 }, { pozisyon: 'SATIS', oran: 0.3 }]
  })

  const [primDonem, setPrimDonem] = useState({
    baslangic: new Date().toISOString().slice(0, 7) + '-01',
    bitis: new Date().toISOString().slice(0, 10),
    subeId: '', sirketId: 0,
  })
  const [primSonuclar, setPrimSonuclar] = useState<PrimSonuc[]>([])
  const [primHesaplaniyor, setPrimHesaplaniyor] = useState(false)

  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { void personelYukle() }, [])
  useEffect(() => {
    if (sekme === 'prim-kurallar') void kuralYukle()
  }, [sekme])

  async function personelYukle() {
    try {
      const res = await adminApi.get('/admin/personeller')
      setPersoneller(res.data?.data ?? [])
    } catch { }
  }

  async function kuralYukle() {
    try {
      const res = await adminApi.get('/admin/prim-kurallar')
      setPrimKurallar(res.data?.data ?? [])
    } catch { }
  }

  async function personelKaydet() {
    setLoading(true); setMesaj(null)
    try {
      await adminApi.post('/admin/personel-ekle', { ...yeniPersonel, maas: Number(yeniPersonel.maas) })
      setMesaj({ tip: 'ok', text: 'Personel eklendi' })
      setPersonelFormu(false)
      void personelYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  async function kuralKaydet() {
    setLoading(true); setMesaj(null)
    try {
      await adminApi.post('/admin/prim-kural-ekle', {
        ...yeniKural,
        hedefTutar: Number(yeniKural.hedefTutar) || null,
        primOrani: Number(yeniKural.primOrani) || null,
        primSabit: Number(yeniKural.primSabit) || null,
        pozisyonlar: yeniKural.pozisyonlar,
      })
      setMesaj({ tip: 'ok', text: 'Prim kuralı eklendi' })
      setKuralFormu(false)
      void kuralYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  async function primHesapla() {
    setPrimHesaplaniyor(true); setMesaj(null)
    try {
      const res = await adminApi.post('/admin/prim-hesapla', {
        donemBaslangic: primDonem.baslangic,
        donemBitis: primDonem.bitis,
        subeId: primDonem.subeId || undefined,
        sirketId: primDonem.sirketId || undefined,
      })
      setPrimSonuclar(res.data?.sonuclar ?? [])
      if (res.data?.sonuclar?.length === 0) {
        setMesaj({ tip: 'err', text: 'Bu dönem için prim kazanımı bulunamadı' })
      }
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hesaplama hatası' })
    } finally { setPrimHesaplaniyor(false) }
  }

  const POZ_RENK: Record<string, string> = {
    MUDUR: '#7c3aed', SATIS: '#059669', KASIYER: '#2563eb', TEKNIK: '#d97706', DIGER: '#6b7280'
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#1a1a2e', marginBottom: 20 }}>👥 İK & Prim Yönetimi</div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
        {([['personeller', '👤 Personeller'], ['prim-kurallar', '📋 Prim Kuralları'], ['prim-hesap', '💰 Prim Hesapla']] as const).map(([s, label]) => (
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

      {/* PERSONELLER */}
      {sekme === 'personeller' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Personel Listesi ({personeller.length})</div>
            <button type="button" onClick={() => setPersonelFormu(!personelFormu)} style={btnPrimary}>+ Yeni Personel</button>
          </div>

          {personelFormu && (
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Yeni Personel</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Ad *</label><input value={yeniPersonel.ad} onChange={e => setYeniPersonel(p => ({ ...p, ad: e.target.value }))} style={inp} /></div>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Soyad *</label><input value={yeniPersonel.soyad} onChange={e => setYeniPersonel(p => ({ ...p, soyad: e.target.value }))} style={inp} /></div>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Telefon</label><input value={yeniPersonel.telefon} onChange={e => setYeniPersonel(p => ({ ...p, telefon: e.target.value }))} style={inp} /></div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Pozisyon *</label>
                  <select value={yeniPersonel.pozisyon} onChange={e => setYeniPersonel(p => ({ ...p, pozisyon: e.target.value }))} style={inp}>
                    {POZISYONLAR.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şube</label>
                  <select value={yeniPersonel.subeId} onChange={e => setYeniPersonel(p => ({ ...p, subeId: e.target.value, subeAdi: e.target.value }))} style={inp}>
                    {SUBELER.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şirket</label>
                  <select value={yeniPersonel.sirketId} onChange={e => {
                    const s = SIRKETLER.find(x => x.id === Number(e.target.value))
                    setYeniPersonel(p => ({ ...p, sirketId: Number(e.target.value), sirketAdi: s?.ad ?? '' }))
                  }} style={inp}>
                    {SIRKETLER.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
                  </select>
                </div>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Maaş (₺)</label><input type="number" value={yeniPersonel.maas} onChange={e => setYeniPersonel(p => ({ ...p, maas: e.target.value }))} style={inp} /></div>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>E-posta</label><input value={yeniPersonel.email} onChange={e => setYeniPersonel(p => ({ ...p, email: e.target.value }))} style={inp} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => setPersonelFormu(false)} style={btnSmall}>İptal</button>
                <button type="button" onClick={personelKaydet} disabled={loading || !yeniPersonel.ad || !yeniPersonel.soyad} style={btnPrimary}>{loading ? 'Kaydediliyor...' : '✓ Kaydet'}</button>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Ad Soyad</th>
                  <th style={th}>Pozisyon</th>
                  <th style={th}>Şube</th>
                  <th style={th}>Şirket</th>
                  <th style={{ ...th, textAlign: 'right' as const }}>Maaş</th>
                  <th style={th}>Telefon</th>
                </tr>
              </thead>
              <tbody>
                {personeller.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{p.ad} {p.soyad}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: `${POZ_RENK[p.pozisyon] ?? '#6b7280'}20`, color: POZ_RENK[p.pozisyon] ?? '#6b7280' }}>{p.pozisyon}</span>
                    </td>
                    <td style={{ ...td, color: '#374151' }}>{p.subeAdi ?? '—'}</td>
                    <td style={{ ...td, fontSize: 11, color: '#9ca3af' }}>{p.sirketAdi ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' as const, fontWeight: 700 }}>₺{p.maas.toLocaleString('tr-TR')}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{p.telefon ?? '—'}</td>
                  </tr>
                ))}
                {personeller.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center' as const, color: '#9ca3af', padding: 30 }}>Henüz personel eklenmemiş</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PRİM KURALLARI */}
      {sekme === 'prim-kurallar' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Prim Kuralları ({primKurallar.length})</div>
            <button type="button" onClick={() => setKuralFormu(!kuralFormu)} style={btnPrimary}>+ Yeni Kural</button>
          </div>

          {kuralFormu && (
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Yeni Prim Kuralı</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Kural Adı *</label>
                  <input value={yeniKural.ad} onChange={e => setYeniKural(p => ({ ...p, ad: e.target.value }))} placeholder="ör: GVN1 Aylık Satış Primi" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Tip *</label>
                  <select value={yeniKural.tip} onChange={e => setYeniKural(p => ({ ...p, tip: e.target.value }))} style={inp}>
                    <option value="BIREYSEL">Bireysel</option>
                    <option value="MAGAZA">Mağaza</option>
                    <option value="BOLGESEL">Bölgesel</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Kapsam *</label>
                  <select value={yeniKural.kapsam} onChange={e => setYeniKural(p => ({ ...p, kapsam: e.target.value }))} style={inp}>
                    <option value="GENEL_SATIS">Genel Satış</option>
                    <option value="URUN_KATEGORI">Ürün Kategorisi</option>
                    <option value="BELIRLI_URUN">Belirli Ürün</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Dönem *</label>
                  <select value={yeniKural.donem} onChange={e => setYeniKural(p => ({ ...p, donem: e.target.value }))} style={inp}>
                    <option value="AYLIK">Aylık</option>
                    <option value="HAFTALIK">Haftalık</option>
                    <option value="GUNLUK">Günlük</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Hedef Tutar (₺)</label>
                  <input type="number" value={yeniKural.hedefTutar} onChange={e => setYeniKural(p => ({ ...p, hedefTutar: e.target.value }))} placeholder="0" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Prim Oranı (%) — hedef aşımından</label>
                  <input type="number" value={yeniKural.primOrani} onChange={e => setYeniKural(p => ({ ...p, primOrani: e.target.value }))} placeholder="ör: 5" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Sabit Prim (₺) — hedefe ulaşınca</label>
                  <input type="number" value={yeniKural.primSabit} onChange={e => setYeniKural(p => ({ ...p, primSabit: e.target.value }))} placeholder="0" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şube (boş = tümü)</label>
                  <select value={yeniKural.subeId} onChange={e => setYeniKural(p => ({ ...p, subeId: e.target.value, subeAdi: e.target.value }))} style={inp}>
                    <option value="">— Tümü —</option>
                    {SUBELER.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Pozisyon oranları */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Pozisyon Dağılım Oranları</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {yeniKural.pozisyonlar.map((poz, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#f3f4f6', padding: '6px 10px', borderRadius: 8 }}>
                      <select value={poz.pozisyon} onChange={e => setYeniKural(p => ({ ...p, pozisyonlar: p.pozisyonlar.map((x, j) => j === i ? { ...x, pozisyon: e.target.value } : x) }))} style={{ ...inp, width: 'auto', padding: '4px 8px' }}>
                        {POZISYONLAR.map(p => <option key={p}>{p}</option>)}
                      </select>
                      <input type="number" value={poz.oran} step="0.1" min="0" max="1" onChange={e => setYeniKural(p => ({ ...p, pozisyonlar: p.pozisyonlar.map((x, j) => j === i ? { ...x, oran: Number(e.target.value) } : x) }))} style={{ ...inp, width: 70, padding: '4px 8px' }} />
                      <button type="button" onClick={() => setYeniKural(p => ({ ...p, pozisyonlar: p.pozisyonlar.filter((_, j) => j !== i) }))} style={{ ...btnSmall, padding: '4px 8px', color: '#ef4444' }}>✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setYeniKural(p => ({ ...p, pozisyonlar: [...p.pozisyonlar, { pozisyon: 'SATIS', oran: 0.2 }] }))} style={btnSmall}>+ Pozisyon Ekle</button>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                  Toplam oran: {yeniKural.pozisyonlar.reduce((a, p) => a + p.oran, 0).toFixed(2)} (1.00 olmalı)
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => setKuralFormu(false)} style={btnSmall}>İptal</button>
                <button type="button" onClick={kuralKaydet} disabled={loading || !yeniKural.ad} style={btnPrimary}>{loading ? 'Kaydediliyor...' : '✓ Kaydet'}</button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {primKurallar.map(k => (
              <div key={k.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', backgroundColor: '#f3e8ff', padding: '2px 8px', borderRadius: 20 }}>{k.tip}</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{k.donem}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{k.ad}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{k.kapsam} {k.subeAdi && `· ${k.subeAdi}`}</div>
                {k.hedefTutar && <div style={{ fontSize: 12 }}>Hedef: <strong>₺{k.hedefTutar.toLocaleString('tr-TR')}</strong></div>}
                {k.primOrani && <div style={{ fontSize: 12 }}>Oran: <strong>%{k.primOrani}</strong></div>}
                {k.primSabit && <div style={{ fontSize: 12 }}>Sabit: <strong>₺{k.primSabit.toLocaleString('tr-TR')}</strong></div>}
              </div>
            ))}
            {primKurallar.length === 0 && <div style={{ fontSize: 13, color: '#9ca3af' }}>Henüz prim kuralı eklenmemiş.</div>}
          </div>
        </div>
      )}

      {/* PRİM HESAPLA */}
      {sekme === 'prim-hesap' && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Prim Hesaplama</div>

          <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Dönem Başlangıç</label>
                <input type="date" value={primDonem.baslangic} onChange={e => setPrimDonem(p => ({ ...p, baslangic: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Dönem Bitiş</label>
                <input type="date" value={primDonem.bitis} onChange={e => setPrimDonem(p => ({ ...p, bitis: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şube (opsiyonel)</label>
                <select value={primDonem.subeId} onChange={e => setPrimDonem(p => ({ ...p, subeId: e.target.value }))} style={inp}>
                  <option value="">Tümü</option>
                  {SUBELER.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <button type="button" onClick={primHesapla} disabled={primHesaplaniyor} style={{ ...btnPrimary, backgroundColor: '#059669' }}>
                {primHesaplaniyor ? '⏳ Hesaplanıyor...' : '🔢 Primleri Hesapla'}
              </button>
            </div>
          </div>

          {primSonuclar.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Hesaplama Sonuçları — {primSonuclar.length} personel</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#059669' }}>
                  Toplam: ₺{primSonuclar.reduce((a, p) => a + p.toplamPrim, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Personel</th>
                      <th style={th}>Pozisyon</th>
                      <th style={th}>Şube</th>
                      <th style={th}>Kural</th>
                      <th style={{ ...th, textAlign: 'right' as const }}>Hedef</th>
                      <th style={{ ...th, textAlign: 'right' as const }}>Gerçekleşen</th>
                      <th style={{ ...th, textAlign: 'right' as const }}>Prim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {primSonuclar.map(p => (
                      p.detaylar.map((d, i) => (
                        <tr key={`${p.personelAd}-${i}`} style={{ borderTop: '1px solid #f3f4f6', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          {i === 0 && <td style={{ ...td, fontWeight: 700 }} rowSpan={p.detaylar.length}>{p.personelAd}</td>}
                          {i === 0 && <td style={td} rowSpan={p.detaylar.length}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: '#f3e8ff', color: '#7c3aed' }}>{p.pozisyon}</span>
                          </td>}
                          {i === 0 && <td style={td} rowSpan={p.detaylar.length}>{p.subeAdi ?? '—'}</td>}
                          <td style={td}>{d.kuralAdi}</td>
                          <td style={{ ...td, textAlign: 'right' as const }}>₺{d.hedef.toLocaleString('tr-TR')}</td>
                          <td style={{ ...td, textAlign: 'right' as const, color: d.gerceklesen >= d.hedef ? '#059669' : '#ef4444', fontWeight: 700 }}>₺{d.gerceklesen.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                          <td style={{ ...td, textAlign: 'right' as const, fontWeight: 900, color: '#059669' }}>₺{d.primTutari.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    ))}
                    <tr style={{ backgroundColor: '#f0fdf4', borderTop: '2px solid #86efac' }}>
                      <td colSpan={6} style={{ ...td, fontWeight: 900, textAlign: 'right' as const }}>TOPLAM PRİM:</td>
                      <td style={{ ...td, textAlign: 'right' as const, fontWeight: 900, fontSize: 14, color: '#059669' }}>
                        ₺{primSonuclar.reduce((a, p) => a + p.toplamPrim, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
