import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getOdooKategoriler,
  getStokUrunleri,
  getUrunLotlari,
  guncelleStokFiyat,
  topluStokFiyatGuncelle,
  type StokUrun,
} from '../../api/stok.api'
import EtiketSablonSecici from '../../components/etiket/EtiketSablonSecici'
import { otomatikSablonSec, uretCokluEtiketZpl } from '../../components/etiket/etiket-sablon-helpers'
import type { SablonId } from '../../components/etiket-tasarimci/sablon-types'
import StokKontrolTab from './StokKontrolTab'

const TABS = [
  { id: 'yonetim', label: '🏷️ Stok Yönetimi' },
  { id: 'kontrol', label: '📊 Stok Kontrol' },
] as const

type TabId = (typeof TABS)[number]['id']

const LOKASYONLAR = ['GVN1', 'GVN3', 'GVN4', 'GVN6', 'GVN8', 'GVN9', 'GVN2', 'GVN10', 'ANADEPO', 'GVN5']

const inp: React.CSSProperties = {
  padding: '7px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  backgroundColor: 'white',
  width: '100%',
  boxSizing: 'border-box',
}
const btn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
}
const btnPrimary: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }
const th: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 800,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, verticalAlign: 'middle' }

function fmtFiyat(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function StokYonetimiPage() {
  const [activeTab, setActiveTab] = useState<TabId>('yonetim')
  const [kategoriler, setKategoriler] = useState<Array<{ id: number; complete_name: string }>>([])
  const [urunler, setUrunler] = useState<StokUrun[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const [arama, setArama] = useState('')
  const [kategoriId, setKategoriId] = useState('')
  const [fiyatMin, setFiyatMin] = useState('')
  const [fiyatMax, setFiyatMax] = useState('')
  const [stokDurumu, setStokDurumu] = useState<'tumu' | 'var' | 'sifir'>('tumu')
  const [lokasyon, setLokasyon] = useState('')
  const [kdv, setKdv] = useState('')

  const [secili, setSecili] = useState<Set<number>>(new Set())
  const [duzenlenen, setDuzenlenen] = useState<{ id: number; alan: 'satis' | 'alis'; deger: string } | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState<number | null>(null)

  const [topluAcik, setTopluAcik] = useState(false)
  const [topluTip, setTopluTip] = useState<'yuzde' | 'sabit' | 'yeni'>('yuzde')
  const [topluDeger, setTopluDeger] = useState('10')
  const [topluHedef, setTopluHedef] = useState<'satis' | 'alis' | 'her_ikisi'>('satis')
  const [topluYukleniyor, setTopluYukleniyor] = useState(false)

  const [etiketAcik, setEtiketAcik] = useState(false)
  const [etiketUrun, setEtiketUrun] = useState<StokUrun | null>(null)
  const [etiketLokasyon, setEtiketLokasyon] = useState('GVN1')
  const [etiketAdet, setEtiketAdet] = useState(1)
  const [etiketZpl, setEtiketZpl] = useState('')
  const [etiketYukleniyor, setEtiketYukleniyor] = useState(false)
  const [etiketSablonId, setEtiketSablonId] = useState<SablonId>('gunes-aksesuar')

  const seciliUrunler = useMemo(
    () => urunler.filter((u) => secili.has(u.id)),
    [urunler, secili],
  )

  const yukle = useCallback(async () => {
    setLoading(true)
    setMesaj(null)
    try {
      const res = await getStokUrunleri({
        q: arama || undefined,
        kategoriId: kategoriId ? Number(kategoriId) : undefined,
        fiyatMin: fiyatMin ? Number(fiyatMin) : undefined,
        fiyatMax: fiyatMax ? Number(fiyatMax) : undefined,
        stokDurumu: stokDurumu !== 'tumu' ? stokDurumu : undefined,
        lokasyon: lokasyon || undefined,
        kdv: kdv ? Number(kdv) : undefined,
        page,
        limit: 50,
      })
      setUrunler(res.data)
      setTotal(res.total)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Ürünler yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }, [arama, kategoriId, fiyatMin, fiyatMax, stokDurumu, lokasyon, kdv, page])

  useEffect(() => {
    getOdooKategoriler().then((k) => setKategoriler(k)).catch(() => {})
  }, [])

  useEffect(() => {
    void yukle()
  }, [yukle])

  function toggleSec(id: number) {
    setSecili((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTumu() {
    if (secili.size === urunler.length) setSecili(new Set())
    else setSecili(new Set(urunler.map((u) => u.id)))
  }

  async function fiyatKaydet(u: StokUrun) {
    if (!duzenlenen || duzenlenen.id !== u.id) return
    const val = Number(duzenlenen.deger)
    if (!Number.isFinite(val) || val < 0) {
      setMesaj({ tip: 'err', text: 'Geçersiz fiyat' })
      return
    }
    setKaydediliyor(u.id)
    try {
      await guncelleStokFiyat({
        urunId: u.id,
        ...(duzenlenen.alan === 'satis' ? { satisFiyati: val } : { alisFiyati: val }),
      })
      setDuzenlenen(null)
      setMesaj({ tip: 'ok', text: 'Fiyat güncellendi, şubelere bildirim gönderildi.' })
      void yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Fiyat güncellenemedi' })
    } finally {
      setKaydediliyor(null)
    }
  }

  async function topluGuncelle() {
    if (!seciliUrunler.length) return
    setTopluYukleniyor(true)
    try {
      const res = await topluStokFiyatGuncelle({
        urunIds: seciliUrunler.map((u) => u.id),
        tip: topluTip,
        deger: Number(topluDeger) || 0,
        hedef: topluHedef,
      })
      setTopluAcik(false)
      setSecili(new Set())
      setMesaj({ tip: 'ok', text: `${res.basarili}/${res.toplam} ürün güncellendi.` })
      void yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Toplu güncelleme başarısız' })
    } finally {
      setTopluYukleniyor(false)
    }
  }

  function onizlemeFiyat(eski: number) {
    const d = Number(topluDeger) || 0
    if (topluTip === 'yuzde') return Math.round(eski * (1 + d / 100) * 100) / 100
    if (topluTip === 'sabit') return Math.round((eski + d) * 100) / 100
    return d
  }

  async function etiketBas(u: StokUrun) {
    setEtiketUrun(u)
    setEtiketAcik(true)
    setEtiketZpl('')
    setEtiketAdet(1)
    setEtiketLokasyon(lokasyon || 'GVN1')
    setEtiketSablonId(otomatikSablonSec(u.kategori, false))
  }

  async function etiketUret() {
    if (!etiketUrun) return
    setEtiketYukleniyor(true)
    try {
      const lotlar = await getUrunLotlari(etiketUrun.id, etiketLokasyon)
      const maxStok = Math.max(1, etiketUrun.toplamStok)
      const adet = Math.max(1, Math.min(etiketAdet, maxStok, lotlar.length || maxStok))
      const kaynak = lotlar.length
        ? lotlar.slice(0, adet)
        : Array.from({ length: adet }, () => ({
          seriNo: '-',
          fiyat: etiketUrun.satisFiyati,
          barkod: etiketUrun.icReferans || null,
        }))
      const items = kaynak.map((l) => ({
        urunAdi: etiketUrun.urunAdi,
        seriNo: l.seriNo || '-',
        fiyat: l.fiyat ?? etiketUrun.satisFiyati,
        barkod: l.barkod ?? etiketUrun.icReferans,
        icReferans: etiketUrun.icReferans,
        lokasyon: etiketLokasyon,
        miktar: etiketUrun.toplamStok,
        lotNo: l.seriNo || undefined,
      }))
      setEtiketZpl(uretCokluEtiketZpl(etiketSablonId, items))
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? e?.message ?? 'ZPL üretilemedi' })
    } finally {
      setEtiketYukleniyor(false)
    }
  }

  const toplamSayfa = Math.max(1, Math.ceil(total / 50))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Stok Yönetimi</h1>
        {activeTab === 'yonetim' ? (
          <button type="button" onClick={() => void yukle()} style={btnPrimary}>Yenile</button>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #1a1a2e' : '2px solid transparent',
              marginBottom: -2,
              fontWeight: activeTab === t.id ? 900 : 600,
              cursor: 'pointer',
              color: activeTab === t.id ? '#1a1a2e' : '#6b7280',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'kontrol' ? <StokKontrolTab /> : null}

      {activeTab === 'yonetim' ? (
        <>

      {mesaj ? (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          backgroundColor: mesaj.tip === 'ok' ? '#f0fdf4' : '#fff1f2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b',
          border: `1px solid ${mesaj.tip === 'ok' ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {mesaj.text}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Sol filtreler */}
        <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>Filtreler</div>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Arama</span>
            <input
              value={arama}
              onChange={(e) => { setArama(e.target.value); setPage(1) }}
              placeholder="Ürün adı / iç ref"
              style={{ ...inp, marginTop: 4 }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Kategori</span>
            <select value={kategoriId} onChange={(e) => { setKategoriId(e.target.value); setPage(1) }} style={{ ...inp, marginTop: 4 }}>
              <option value="">Tümü</option>
              {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.complete_name}</option>)}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <label>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Min ₺</span>
              <input type="number" value={fiyatMin} onChange={(e) => { setFiyatMin(e.target.value); setPage(1) }} style={{ ...inp, marginTop: 4 }} />
            </label>
            <label>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Max ₺</span>
              <input type="number" value={fiyatMax} onChange={(e) => { setFiyatMax(e.target.value); setPage(1) }} style={{ ...inp, marginTop: 4 }} />
            </label>
          </div>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Stok durumu</span>
            <select value={stokDurumu} onChange={(e) => { setStokDurumu(e.target.value as any); setPage(1) }} style={{ ...inp, marginTop: 4 }}>
              <option value="tumu">Tümü</option>
              <option value="var">Stokta var</option>
              <option value="sifir">Stok sıfır</option>
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Şube</span>
            <select value={lokasyon} onChange={(e) => { setLokasyon(e.target.value); setPage(1) }} style={{ ...inp, marginTop: 4 }}>
              <option value="">Tümü</option>
              {LOKASYONLAR.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>

          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>KDV</span>
            <select value={kdv} onChange={(e) => { setKdv(e.target.value); setPage(1) }} style={{ ...inp, marginTop: 4 }}>
              <option value="">Tümü</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
          </label>
        </div>

        {/* Tablo */}
        <div>
          {secili.size > 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
              padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{secili.size} ürün seçildi</span>
              <button type="button" onClick={() => setTopluAcik(true)} style={{ ...btn, backgroundColor: '#2563eb', color: 'white' }}>
                Toplu Fiyat Güncelle
              </button>
              <button type="button" onClick={() => setSecili(new Set())} style={btn}>Seçimi Temizle</button>
            </div>
          ) : null}

          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ ...th, width: 36 }}>
                      <input type="checkbox" checked={secili.size === urunler.length && urunler.length > 0} onChange={toggleTumu} />
                    </th>
                    <th style={th}>İç Ref</th>
                    <th style={th}>Ürün Adı</th>
                    <th style={th}>Kategori</th>
                    <th style={th}>Satış ₺</th>
                    <th style={th}>Alış ₺</th>
                    <th style={th}>KDV</th>
                    <th style={th}>Stok</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {urunler.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={td}>
                        <input type="checkbox" checked={secili.has(u.id)} onChange={() => toggleSec(u.id)} />
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{u.icReferans || '—'}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{u.urunAdi}</td>
                      <td style={{ ...td, fontSize: 12, color: '#6b7280' }}>{u.kategori}</td>
                      <td style={td}>
                        {duzenlenen?.id === u.id && duzenlenen.alan === 'satis' ? (
                          <input
                            autoFocus
                            type="number"
                            value={duzenlenen.deger}
                            onChange={(e) => setDuzenlenen({ ...duzenlenen, deger: e.target.value })}
                            onBlur={() => void fiyatKaydet(u)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void fiyatKaydet(u) }}
                            style={{ ...inp, width: 90, padding: '4px 8px' }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDuzenlenen({ id: u.id, alan: 'satis', deger: String(u.satisFiyati) })}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, color: '#059669', padding: 0 }}
                          >
                            {kaydediliyor === u.id ? '...' : fmtFiyat(u.satisFiyati)}
                          </button>
                        )}
                      </td>
                      <td style={td}>
                        {duzenlenen?.id === u.id && duzenlenen.alan === 'alis' ? (
                          <input
                            autoFocus
                            type="number"
                            value={duzenlenen.deger}
                            onChange={(e) => setDuzenlenen({ ...duzenlenen, deger: e.target.value })}
                            onBlur={() => void fiyatKaydet(u)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void fiyatKaydet(u) }}
                            style={{ ...inp, width: 90, padding: '4px 8px' }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDuzenlenen({ id: u.id, alan: 'alis', deger: String(u.alisFiyati) })}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, color: '#6b7280', padding: 0 }}
                          >
                            {fmtFiyat(u.alisFiyati)}
                          </button>
                        )}
                      </td>
                      <td style={{ ...td, fontSize: 12 }}>%{Math.round(u.kdvOrani)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{u.toplamStok}</td>
                      <td style={td}>
                        <button type="button" onClick={() => void etiketBas(u)} style={{ ...btn, padding: '4px 10px', fontSize: 11, backgroundColor: '#f0fdf4', color: '#166534' }}>
                          Etiket
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!urunler.length ? (
                    <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 32 }}>Ürün bulunamadı</td></tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{total} ürün · Sayfa {page}/{toplamSayfa}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={btn}>← Önceki</button>
              <button type="button" disabled={page >= toplamSayfa} onClick={() => setPage((p) => p + 1)} style={btn}>Sonraki →</button>
            </div>
          </div>
        </div>
      </div>

      {/* Toplu fiyat modal */}
      {topluAcik ? (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>Toplu Fiyat Güncelle ({secili.size} ürün)</div>

            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Güncelleme tipi</span>
                <select value={topluTip} onChange={(e) => setTopluTip(e.target.value as any)} style={{ ...inp, marginTop: 4 }}>
                  <option value="yuzde">Yüzde artış (%)</option>
                  <option value="sabit">Sabit TL artış</option>
                  <option value="yeni">Yeni fiyat gir</option>
                </select>
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Değer</span>
                <input type="number" value={topluDeger} onChange={(e) => setTopluDeger(e.target.value)} style={{ ...inp, marginTop: 4 }} />
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Hangi fiyat</span>
                <select value={topluHedef} onChange={(e) => setTopluHedef(e.target.value as any)} style={{ ...inp, marginTop: 4 }}>
                  <option value="satis">Satış fiyatı</option>
                  <option value="alis">Alış fiyatı</option>
                  <option value="her_ikisi">Her ikisi</option>
                </select>
              </label>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Önizleme (ilk 5)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={th}>Ürün</th>
                  <th style={th}>Eski</th>
                  <th style={th}>Yeni</th>
                </tr>
              </thead>
              <tbody>
                {seciliUrunler.slice(0, 5).map((u) => {
                  const eski = topluHedef === 'alis' ? u.alisFiyati : u.satisFiyati
                  return (
                    <tr key={u.id}>
                      <td style={td}>{u.urunAdi}</td>
                      <td style={td}>{fmtFiyat(eski)}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#059669' }}>{fmtFiyat(onizlemeFiyat(eski))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setTopluAcik(false)} style={btn}>İptal</button>
              <button type="button" disabled={topluYukleniyor} onClick={() => void topluGuncelle()} style={{ ...btnPrimary, backgroundColor: '#059669' }}>
                {topluYukleniyor ? 'Güncelleniyor...' : 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Etiket modal */}
      {etiketAcik && etiketUrun ? (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Etiket Bas</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>{etiketUrun.urunAdi}</div>

            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Şube</span>
                <select value={etiketLokasyon} onChange={(e) => setEtiketLokasyon(e.target.value)} style={{ ...inp, marginTop: 4 }}>
                  {LOKASYONLAR.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Adet (max stok: {etiketUrun.toplamStok})</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, etiketUrun.toplamStok)}
                  value={etiketAdet}
                  onChange={(e) => setEtiketAdet(Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, etiketUrun.toplamStok)))}
                  style={{ ...inp, marginTop: 4 }}
                />
              </label>
            </div>

            {!etiketZpl ? (
              <div style={{ marginBottom: 16 }}>
                <EtiketSablonSecici
                  urunKategori={etiketUrun.kategori}
                  utsKodlu={false}
                  secilenId={etiketSablonId}
                  onSecim={(id) => setEtiketSablonId(id as SablonId)}
                />
              </div>
            ) : null}

            {etiketZpl ? (
              <textarea readOnly value={etiketZpl} rows={8} style={{ ...inp, fontFamily: 'monospace', fontSize: 11, marginBottom: 12 }} />
            ) : null}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEtiketAcik(false)} style={btn}>Kapat</button>
              {!etiketZpl ? (
                <button type="button" disabled={etiketYukleniyor} onClick={() => void etiketUret()} style={{ ...btnPrimary, backgroundColor: '#059669' }}>
                  {etiketYukleniyor ? 'Üretiliyor...' : 'ZPL Üret'}
                </button>
              ) : (
                <button type="button" onClick={() => void navigator.clipboard.writeText(etiketZpl)} style={btnPrimary}>Kopyala</button>
              )}
            </div>
          </div>
        </div>
      ) : null}
        </>
      ) : null}
    </div>
  )
}
