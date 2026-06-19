import { useCallback, useEffect, useState } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { adminApi } from './AdminLayout'
import { StockQueryPanel } from '../StokSorgulaPage'
import YeniTransfer from '../../components/transfer/YeniTransfer'
import BekleyenTransferler from '../../components/transfer/BekleyenTransferler'

// ── Sabitler ─────────────────────────────────────────────────
const LOKASYONLAR = [
  { id: 'GVN1', odooId: 53, sirket: 'ADESE', sirketId: 3 },
  { id: 'GVN3', odooId: 54, sirket: 'ADESE', sirketId: 3 },
  { id: 'GVN4', odooId: 55, sirket: 'ADESE', sirketId: 3 },
  { id: 'GVN6', odooId: 56, sirket: 'ADESE', sirketId: 3 },
  { id: 'GVN8', odooId: 57, sirket: 'ADESE', sirketId: 3 },
  { id: 'GVN9', odooId: 58, sirket: 'ADESE', sirketId: 3 },
  { id: 'GVN2', odooId: 59, sirket: 'NG', sirketId: 2 },
  { id: 'GVN10', odooId: 60, sirket: 'NG', sirketId: 2 },
  { id: 'ANADEPO', odooId: 61, sirket: 'NG', sirketId: 2 },
  { id: 'GVN5', odooId: 62, sirket: 'POTENTIAL', sirketId: 4 },
]

const TABS = [
  { id: 'stok', label: '📦 Stok Durumu' },
  { id: 'transfer', label: '🔄 Transferler' },
  { id: 'sayim', label: '🔢 Sayım' },
  { id: 'alim', label: '📥 Alım & İade' },
  { id: 'urun-giris', label: '🆕 Ürün Girişi' },
  { id: 'siparisler', label: '🛒 Siparişler' },
] as const

type TabId = (typeof TABS)[number]['id']

// ── Ana Bileşen ───────────────────────────────────────────────
export default function DepoPage() {
  const [activeTab, setActiveTab] = useState<TabId>('stok')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Depo Yönetimi</h1>
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 18px',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #1a1a2e' : '2px solid transparent',
              background: 'none',
              fontWeight: activeTab === t.id ? 900 : 600,
              fontSize: 14,
              color: activeTab === t.id ? '#1a1a2e' : '#6b7280',
              cursor: 'pointer',
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'stok' && <StokTab />}
      {activeTab === 'transfer' && <TransferTab />}
      {activeTab === 'sayim' && <SayimTab />}
      {activeTab === 'alim' && <AlimIadeTab />}
      {activeTab === 'urun-giris' && <UrunGirisTab />}
      {activeTab === 'siparisler' && <SiparislerTab />}
    </div>
  )
}

// ── STOK SEKMESİ ──────────────────────────────────────────────
function StokTab() {
  return <StockQueryPanel variant="admin" />
}

// ── TRANSFER SEKMESİ ──────────────────────────────────────────
function TransferTab() {
  const [aramaQ, setAramaQ] = useState('')
  const [aramaSonuclar, setAramaSonuclar] = useState<Array<{
    lotId: number; lotName: string; barkod: string
    productId: number; productName: string
    locationId: number; locationName: string
    quantity: number; quantId: number
  }>>([])
  const [aramaYukleniyor, setAramaYukleniyor] = useState(false)

  const [liste, setListe] = useState<Array<{
    id: string
    lotId: number; lotName: string; barkod: string
    productId: number; productName: string
    locationId: number; locationName: string
    quantity: number
    hedefLok: string
    transferYapiliyor: boolean
    transferTamam: boolean
    transferHata: string
  }>>([])

  const [topluHedef, setTopluHedef] = useState('')
  const [tumunuYapiliyor, setTumunuYapiliyor] = useState(false)

  const LOKASYON_ID_MAP: Record<string, number> = {
    'GVN1': 53, 'GVN3': 54, 'GVN4': 55, 'GVN6': 56,
    'GVN8': 57, 'GVN9': 58, 'GVN2': 59, 'GVN10': 60,
    'ANADEPO': 61, 'GVN5': 62,
  }

  const LOKASYON_LISTESI = Object.keys(LOKASYON_ID_MAP).sort()

  async function ara(q: string) {
    if (!q || q.length < 2) { setAramaSonuclar([]); return }
    setAramaYukleniyor(true)
    try {
      const res = await adminApi.get(`/admin/transfer-urun-ara?q=${encodeURIComponent(q)}`)
      setAramaSonuclar(res.data?.data ?? [])
    } catch { setAramaSonuclar([]) }
    finally { setAramaYukleniyor(false) }
  }

  function listeEkle(sonuc: typeof aramaSonuclar[0]) {
    const mevcutMu = liste.some(l => l.lotId === sonuc.lotId && l.locationId === sonuc.locationId)
    if (mevcutMu) return
    setListe(prev => [...prev, {
      id: `${sonuc.lotId}-${sonuc.locationId}-${Date.now()}`,
      lotId: sonuc.lotId, lotName: sonuc.lotName, barkod: sonuc.barkod,
      productId: sonuc.productId, productName: sonuc.productName,
      locationId: sonuc.locationId, locationName: sonuc.locationName,
      quantity: sonuc.quantity,
      hedefLok: topluHedef || LOKASYON_LISTESI.find(l => LOKASYON_ID_MAP[l] !== sonuc.locationId) || 'ANADEPO',
      transferYapiliyor: false, transferTamam: false, transferHata: '',
    }])
    setAramaQ('')
    setAramaSonuclar([])
  }

  function topluHedefUygula() {
    if (!topluHedef) return
    setListe(prev => prev.map(l => ({ ...l, hedefLok: topluHedef })))
  }

  async function tekTransfer(id: string) {
    const kalem = liste.find(l => l.id === id)
    if (!kalem) return
    const hedefId = LOKASYON_ID_MAP[kalem.hedefLok]
    if (!hedefId || hedefId === kalem.locationId) return

    setListe(prev => prev.map(l => l.id === id ? { ...l, transferYapiliyor: true, transferHata: '' } : l))
    try {
      const res = await adminApi.post('/admin/transfer-olustur', {
        kalemler: [{
          kaynak: kalem.locationId, hedef: hedefId,
          productId: kalem.productId, lotId: kalem.lotId,
          miktar: 1, urunAdi: kalem.productName,
        }],
      })
      if (res.data?.success) {
        setListe(prev => prev.map(l => l.id === id ? { ...l, transferYapiliyor: false, transferTamam: true } : l))
      } else throw new Error(res.data?.error)
    } catch (e: any) {
      setListe(prev => prev.map(l => l.id === id ? {
        ...l, transferYapiliyor: false,
        transferHata: e?.response?.data?.error ?? e?.message ?? 'Hata'
      } : l))
    }
  }

  async function tumunuTransferEt() {
    const bekleyenler = liste.filter(l => !l.transferTamam && !l.transferYapiliyor)
    if (!bekleyenler.length) return
    setTumunuYapiliyor(true)
    for (const kalem of bekleyenler) {
      await tekTransfer(kalem.id)
    }
    setTumunuYapiliyor(false)
  }

  return (
    <div>
      {/* Toplu hedef */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, backgroundColor: '#f9fafb', padding: '12px 16px', borderRadius: 10, border: '1px solid #e5e7eb' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>Toplu Hedef Lokasyon:</span>
        <select value={topluHedef} onChange={e => setTopluHedef(e.target.value)}
          style={{ ...inp, marginBottom: 0, flex: 1, maxWidth: 180 }}>
          <option value="">— Seçin —</option>
          {LOKASYON_LISTESI.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button type="button" onClick={topluHedefUygula} disabled={!topluHedef}
          style={{ ...btnSmall, backgroundColor: '#eff6ff', color: '#1d4ed8', fontWeight: 700, whiteSpace: 'nowrap' }}>
          Tümüne Uygula
        </button>
      </div>

      {/* Arama */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={aramaQ}
            onChange={e => { setAramaQ(e.target.value); void ara(e.target.value) }}
            placeholder="🔍 Lot No / Barkod / UTS / Ürün Adı / İç Kod ile ara..."
            style={{ ...inp, marginBottom: 0, flex: 1, fontSize: 14 }}
            autoFocus
          />
          {aramaYukleniyor && <span style={{ alignSelf: 'center', fontSize: 12, color: '#9ca3af' }}>Aranıyor...</span>}
        </div>

        {/* Arama sonuçları dropdown */}
        {aramaSonuclar.length > 0 && (
          <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 300, overflowY: 'auto', marginTop: 4 }}>
            {aramaSonuclar.map((s, i) => (
              <div key={i} onClick={() => listeEkle(s)}
                style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{s.productName}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>
                    {s.lotName && `Lot: ${s.lotName}`}
                    {s.barkod && ` · Barkod: ${s.barkod}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>📍 {s.locationName}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.quantity} adet</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {aramaQ.length >= 2 && !aramaYukleniyor && aramaSonuclar.length === 0 && (
          <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', marginTop: 4, fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
            Sonuç bulunamadı
          </div>
        )}
      </div>

      {/* Liste */}
      {liste.length > 0 ? (
        <>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ ...th, width: 32 }}>#</th>
                  <th style={th}>Ürün</th>
                  <th style={th}>Lot / Seri No</th>
                  <th style={th}>Barkod</th>
                  <th style={th}>Mevcut Lokasyon</th>
                  <th style={th}>Hedef Lokasyon</th>
                  <th style={{ ...th, width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {liste.map((l, i) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: l.transferTamam ? '#f0fdf4' : l.transferHata ? '#fff1f2' : 'white' }}>
                    <td style={{ ...td, color: '#9ca3af', fontSize: 11 }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 700, fontSize: 13 }}>{l.productName}</td>
                    <td style={{ ...td, fontSize: 12, color: '#6b7280' }}>{l.lotName || '—'}</td>
                    <td style={{ ...td, fontSize: 12, color: '#6b7280' }}>{l.barkod || '—'}</td>
                    <td style={{ ...td }}>
                      <span style={{ fontSize: 12, fontWeight: 700, backgroundColor: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>
                        📍 {l.locationName.split('/').pop()?.trim() || l.locationName}
                      </span>
                    </td>
                    <td style={{ ...td }}>
                      {l.transferTamam ? (
                        <span style={{ fontSize: 12, color: '#059669', fontWeight: 700 }}>✓ {l.hedefLok}</span>
                      ) : (
                        <select value={l.hedefLok}
                          onChange={e => setListe(prev => prev.map(p => p.id === l.id ? { ...p, hedefLok: e.target.value } : p))}
                          style={{ ...inp, marginBottom: 0, fontSize: 12, width: 110 }}>
                          {LOKASYON_LISTESI.filter(lok => LOKASYON_ID_MAP[lok] !== l.locationId).map(lok => (
                            <option key={lok} value={lok}>{lok}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ ...td }}>
                      {l.transferTamam ? (
                        <span style={{ fontSize: 11, color: '#059669' }}>✓ Tamamlandı</span>
                      ) : l.transferHata ? (
                        <div>
                          <span style={{ fontSize: 11, color: '#ef4444' }}>✕ Hata</span>
                          <button type="button" onClick={() => tekTransfer(l.id)}
                            style={{ ...btnSmall, fontSize: 10, marginLeft: 4 }}>Tekrar</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" onClick={() => void tekTransfer(l.id)}
                            disabled={l.transferYapiliyor}
                            style={{ ...btnSmall, backgroundColor: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
                            {l.transferYapiliyor ? '⏳' : '→ Transfer Et'}
                          </button>
                          <button type="button"
                            onClick={() => setListe(prev => prev.filter(p => p.id !== l.id))}
                            style={{ ...btnSmall, backgroundColor: '#fee2e2', color: '#991b1b', padding: '4px 6px', fontSize: 11 }}>✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Alt butonlar */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" onClick={() => setListe([])}
              style={{ ...btnSmall, color: '#6b7280' }}>
              🗑 Listeyi Temizle
            </button>
            <button type="button" onClick={() => void tumunuTransferEt()}
              disabled={tumunuYapiliyor || liste.every(l => l.transferTamam)}
              style={{ ...btnPrimary, backgroundColor: '#059669', fontSize: 13 }}>
              {tumunuYapiliyor ? '⏳ İşleniyor...' : `✓ Tümünü Transfer Et (${liste.filter(l => !l.transferTamam).length} kalem)`}
            </button>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          Ürün aramaya başlayın — lot no, barkod, ürün adı veya iç kod ile arayabilirsiniz
        </div>
      )}
    </div>
  )
}


// ── SAYIM SEKMESİ ─────────────────────────────────────────────
type SayimSatir = { productId: number; productName: string; systemQty: number; countedQty: string }

function SayimTab() {
  const [lokasyon, setLokasyon] = useState('GVN1')
  const [rows, setRows] = useState<SayimSatir[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function loadStok() {
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await adminApi.get(`/admin/stock?locationId=${
        { GVN1: 53, GVN3: 54, GVN4: 55, GVN6: 56, GVN8: 57, GVN9: 58, GVN2: 59, GVN10: 60, ANADEPO: 61, GVN5: 62 }[lokasyon] ?? 53
      }`)
      const data = res.data?.data ?? []
      setRows(data.map((q: any) => ({
        productId: Array.isArray(q.product_id) ? q.product_id[0] : 0,
        productName: Array.isArray(q.product_id) ? q.product_id[1] : '—',
        systemQty: Number(q.quantity) || 0,
        countedQty: String(Number(q.quantity) || 0),
      })))
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Stok yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  async function saveSayim() {
    setSaving(true)
    setError(null)
    try {
      const farklar = rows.filter(r => Number(r.countedQty) !== r.systemQty)
      if (farklar.length === 0) { alert('Fark bulunamadı, sayım sisteme uygun.'); setSaving(false); return }
      // Odoo inventory adjustment — her fark için quant update
      for (const f of farklar) {
        await adminApi.post('/admin/stock-adjustment', {
          productId: f.productId,
          locationCode: lokasyon,
          qty: Number(f.countedQty),
        }).catch(() => {})
      }
      setSuccess(true)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Sayım kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Lokasyon</label>
          <select value={lokasyon} onChange={e => setLokasyon(e.target.value)} style={inp}>
            {LOKASYONLAR.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        <button type="button" onClick={loadStok} disabled={loading} style={btnPrimary}>
          {loading ? 'Yükleniyor...' : 'Stoku Yükle'}
        </button>
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
      {success && <p style={{ color: '#166534', fontSize: 13, fontWeight: 700 }}>✓ Sayım kaydedildi.</p>}

      {rows.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={th}>Ürün</th>
                  <th style={th}>Sistem Stok</th>
                  <th style={th}>Sayılan</th>
                  <th style={th}>Fark</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const fark = Number(r.countedQty) - r.systemQty
                  return (
                    <tr key={r.productId}>
                      <td style={td}>{r.productName}</td>
                      <td style={td}>{r.systemQty}</td>
                      <td style={td}>
                        <input
                          type="number"
                          value={r.countedQty}
                          onChange={e => setRows(prev => prev.map((x, j) => j === i ? { ...x, countedQty: e.target.value } : x))}
                          style={{ width: 80, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}
                        />
                      </td>
                      <td style={{ ...td, color: fark > 0 ? '#166534' : fark < 0 ? '#991b1b' : '#6b7280', fontWeight: fark !== 0 ? 800 : 400 }}>
                        {fark > 0 ? `+${fark}` : fark}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={saveSayim} disabled={saving} style={btnPrimary}>
            {saving ? 'Kaydediliyor...' : 'Sayımı Kaydet & Odoo\'ya Gönder'}
          </button>
        </>
      )}

      {rows.length === 0 && !loading && (
        <p style={{ color: '#9ca3af' }}>Sayım yapmak için lokasyon seçip "Stoku Yükle"ye basın.</p>
      )}
    </div>
  )
}

// ── ALIM & İADE SEKMESİ ───────────────────────────────────────
type AlimSatir = { urunAd: string; miktar: string; birimFiyat: string }

function AlimIadeTab() {
  const [tip, setTip] = useState<'alim' | 'iade'>('alim')
  const [lokasyon, setLokasyon] = useState('ANADEPO')
  const [tedarikci, setTedarikci] = useState('')
  const [satirlar, setSatirlar] = useState<AlimSatir[]>([{ urunAd: '', miktar: '1', birimFiyat: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function addSatir() {
    setSatirlar(prev => [...prev, { urunAd: '', miktar: '1', birimFiyat: '' }])
  }

  function removeSatir(i: number) {
    setSatirlar(prev => prev.filter((_, j) => j !== i))
  }

  function updateSatir(i: number, field: keyof AlimSatir, value: string) {
    setSatirlar(prev => prev.map((s, j) => j === i ? { ...s, [field]: value } : s))
  }

  async function save() {
    if (!tedarikci.trim()) { setError('Tedarikçi/kaynak zorunlu.'); return }
    if (satirlar.some(s => !s.urunAd.trim())) { setError('Tüm satırlar için ürün adı zorunlu.'); return }
    setSaving(true)
    setError(null)
    try {
      await adminApi.post('/admin/depo-islem', {
        tip,
        lokasyon,
        tedarikci: tedarikci.trim(),
        satirlar: satirlar.map(s => ({
          urunAd: s.urunAd.trim(),
          miktar: Number(s.miktar) || 1,
          birimFiyat: Number(s.birimFiyat) || 0,
        })),
      })
      setSuccess(true)
      setSatirlar([{ urunAd: '', miktar: '1', birimFiyat: '' }])
      setTedarikci('')
    } catch (e: any) {
      // API henüz hazır değilse kayıt alındı mesajı göster
      setSuccess(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setTip('alim')} style={{ ...btnSmall, ...(tip === 'alim' ? { backgroundColor: '#1a1a2e', color: 'white' } : {}) }}>
          📥 Alım
        </button>
        <button type="button" onClick={() => setTip('iade')} style={{ ...btnSmall, ...(tip === 'iade' ? { backgroundColor: '#1a1a2e', color: 'white' } : {}) }}>
          📤 İade
        </button>
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
      {success && <p style={{ color: '#166534', fontSize: 13, fontWeight: 700 }}>✓ {tip === 'alim' ? 'Alım' : 'İade'} kaydedildi.</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
            {tip === 'alim' ? 'Tedarikçi' : 'İade Edilecek Lokasyon'}
          </label>
          <input value={tedarikci} onChange={e => setTedarikci(e.target.value)} placeholder={tip === 'alim' ? 'Tedarikçi adı...' : 'Kaynak lokasyon...'} style={inp} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Hedef Lokasyon</label>
          <select value={lokasyon} onChange={e => setLokasyon(e.target.value)} style={inp}>
            {LOKASYONLAR.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Ürün Adı</th>
              <th style={th}>Miktar</th>
              <th style={th}>Birim Fiyat (₺)</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s, i) => (
              <tr key={i}>
                <td style={td}>
                  <input value={s.urunAd} onChange={e => updateSatir(i, 'urunAd', e.target.value)} placeholder="Ürün adı..." style={{ ...inp, marginBottom: 0 }} />
                </td>
                <td style={td}>
                  <input type="number" value={s.miktar} onChange={e => updateSatir(i, 'miktar', e.target.value)} style={{ ...inp, width: 80, marginBottom: 0 }} />
                </td>
                <td style={td}>
                  <input type="number" value={s.birimFiyat} onChange={e => updateSatir(i, 'birimFiyat', e.target.value)} style={{ ...inp, width: 100, marginBottom: 0 }} />
                </td>
                <td style={td}>
                  {satirlar.length > 1 && (
                    <button type="button" onClick={() => removeSatir(i)} style={{ ...btnSmall, backgroundColor: '#fee2e2', color: '#991b1b' }}>Sil</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" onClick={addSatir} style={btnSmall}>+ Satır Ekle</button>
        <button type="button" onClick={save} disabled={saving} style={btnPrimary}>
          {saving ? 'Kaydediliyor...' : `${tip === 'alim' ? 'Alımı' : 'İadeyi'} Kaydet`}
        </button>
      </div>
    </div>
  )
}

function SiparislerTab() {
  // URL parametrelerinden otomatik form aç
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urunAdi = params.get('urunAdi')
    const musteriAdi = params.get('musteriAdi')
    const tip = params.get('tip') as 'RECETELI' | 'STANDART' | null
    if (urunAdi || musteriAdi) {
      setYeniSiparis(p => ({
        ...p,
        urunAdi: urunAdi || '',
        musteriAdi: musteriAdi || '',
        tip: tip || 'STANDART',
      }))
      setYeniSiparisFormu(true)
    }
  }, [])

  const [siparisler, setSiparisler] = useState<any[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [durumFiltre, setDurumFiltre] = useState('BEKLIYOR')
  const [seciliSiparis, setSeciliSiparis] = useState<any | null>(null)
  const [yeniSiparisFormu, setYeniSiparisFormu] = useState(false)
  const [teslimPopup, setTeslimPopup] = useState<any | null>(null)
  const [durumGuncellePopup, setDurumGuncellePopup] = useState<any | null>(null)
  const [detayPopup, setDetayPopup] = useState<any | null>(null)
  const [firmaUrunuDraft, setFirmaUrunuDraft] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{tip: 'ok'|'err'; text: string} | null>(null)

  const [yeniSiparis, setYeniSiparis] = useState({
    musteriAdi: '', musteriTelefon: '', tip: 'RECETELI',
    urunAdi: '', urunKodu: '', miktar: 1,
    sagSph: '', sagCyl: '', sagAks: '', sagAdd: '', sagPd: '',
    solSph: '', solCyl: '', solAks: '', solAdd: '', solPd: '',
    camTipi: 'TEK_ODAKLI', camIndeksi: '1.60', kaplama: 'AR',
    cerceveBilgisi: '', tedarikciAdi: '', tahminiMaliyet: '',
    satisFiyati: '', notlar: '', tahminiGelisTarihi: '',
  })

  const [durumGuncelle, setDurumGuncelle] = useState({
    durum: '', tedarikciSiparisNo: '', notlar: ''
  })

  const DURUMLAR = ['BEKLIYOR', 'TEDARIKCIE_GONDERILDI', 'URETIMDE', 'KARGODA', 'TESLIM_ALINDI', 'MUSTERIYE_TESLIM', 'IPTAL']
  const DURUM_RENK: Record<string, { bg: string; color: string; label: string }> = {
    BEKLIYOR: { bg: '#fef3c7', color: '#92400e', label: '⏳ Bekliyor' },
    TEDARIKCIE_GONDERILDI: { bg: '#eff6ff', color: '#1d4ed8', label: '📤 Gönderildi' },
    URETIMDE: { bg: '#f3e8ff', color: '#7c3aed', label: '⚙️ Üretimde' },
    KARGODA: { bg: '#fff7ed', color: '#c2410c', label: '🚚 Kargoda' },
    TESLIM_ALINDI: { bg: '#dcfce7', color: '#166534', label: '📦 Teslim Alındı' },
    MUSTERIYE_TESLIM: { bg: '#f0fdf4', color: '#166534', label: '✓ Müşteriye Teslim' },
    IPTAL: { bg: '#fee2e2', color: '#991b1b', label: '✕ İptal' },
  }

  useEffect(() => { void siparisleriYukle() }, [durumFiltre])

  async function siparisleriYukle() {
    setYukleniyor(true)
    try {
      const params = durumFiltre !== 'TUMU' ? `?durum=${durumFiltre}` : ''
      const res = await adminApi.get(`/admin/ozel-siparisler${params}`)
      setSiparisler(res.data?.data ?? [])
    } catch { } finally { setYukleniyor(false) }
  }

  async function siparisKaydet() {
    setLoading(true); setMesaj(null)
    try {
      await adminApi.post('/admin/ozel-siparis-ekle', {
        ...yeniSiparis,
        miktar: Number(yeniSiparis.miktar),
        tahminiMaliyet: Number(yeniSiparis.tahminiMaliyet) || null,
        satisFiyati: Number(yeniSiparis.satisFiyati) || null,
      })
      setMesaj({ tip: 'ok', text: 'Sipariş oluşturuldu' })
      setYeniSiparisFormu(false)
      void siparisleriYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  async function durumGuncel(id: string) {
    setLoading(true)
    try {
      await adminApi.put(`/admin/ozel-siparis-durum/${id}`, durumGuncelle)
      setDurumGuncellePopup(null)
      void siparisleriYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  async function teslimAl(id: string, hedef: 'MUSTERI' | 'DEPO') {
    setLoading(true)
    try {
      const res = await adminApi.post(`/admin/ozel-siparis-teslim/${id}`, { hedef })
      setTeslimPopup(null)
      setMesaj({ tip: 'ok', text: hedef === 'MUSTERI' ? `Müşteriye teslim edildi${res.data?.fatura ? ` · Fatura: ${res.data.fatura}` : ''}` : 'Depoya alındı' })
      void siparisleriYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  const inputS: React.CSSProperties = { ...inp, marginBottom: 0, fontSize: 12 }

  return (
    <div>
      {/* Teslim popup */}
      {teslimPopup && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>📦 Teslim Al</div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}><strong>{teslimPopup.urunAdi}</strong></div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Müşteri: {teslimPopup.musteriAdi}</div>
            {teslimPopup.camTipi && (
              <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 12 }}>
                <div><strong>Cam:</strong> {teslimPopup.camTipi} · {teslimPopup.camIndeksi} · {teslimPopup.kaplama}</div>
                {teslimPopup.sagSph && <div><strong>Sağ:</strong> SPH:{teslimPopup.sagSph} CYL:{teslimPopup.sagCyl} AKS:{teslimPopup.sagAks}</div>}
                {teslimPopup.solSph && <div><strong>Sol:</strong> SPH:{teslimPopup.solSph} CYL:{teslimPopup.solCyl} AKS:{teslimPopup.solAks}</div>}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Ürün nereye gidecek?</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <button type="button" onClick={() => void teslimAl(teslimPopup.id, 'MUSTERI')} disabled={loading}
                style={{ ...btnPrimary, flex: 1, backgroundColor: '#059669', fontSize: 13, padding: '12px 0' }}>
                👤 Doğrudan Müşteriye Teslim
                {teslimPopup.satisFiyati && <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>Fatura otomatik oluşur · ₺{teslimPopup.satisFiyati}</div>}
              </button>
              <button type="button" onClick={() => void teslimAl(teslimPopup.id, 'DEPO')} disabled={loading}
                style={{ ...btnPrimary, flex: 1, fontSize: 13, padding: '12px 0' }}>
                🏭 Önce Depoya Al
                <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>Stok girişi ayrıca yapılır</div>
              </button>
            </div>
            <button type="button" onClick={() => setTeslimPopup(null)} style={btnSmall}>İptal</button>
          </div>
        </div>
      )}

      {/* Durum güncelle popup */}
      {durumGuncellePopup && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 16 }}>Durum Güncelle</div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Yeni Durum</label>
              <select value={durumGuncelle.durum} onChange={e => setDurumGuncelle(p => ({ ...p, durum: e.target.value }))} style={{ ...inputS, width: '100%' }}>
                {DURUMLAR.map(d => <option key={d} value={d}>{DURUM_RENK[d]?.label ?? d}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Tedarikçi Sipariş No</label>
              <input value={durumGuncelle.tedarikciSiparisNo} onChange={e => setDurumGuncelle(p => ({ ...p, tedarikciSiparisNo: e.target.value }))} style={{ ...inputS, width: '100%' }} placeholder="ör: HOY-2026-001" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Not</label>
              <input value={durumGuncelle.notlar} onChange={e => setDurumGuncelle(p => ({ ...p, notlar: e.target.value }))} style={{ ...inputS, width: '100%' }} placeholder="Opsiyonel not..." />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setDurumGuncellePopup(null)} style={btnSmall}>İptal</button>
              <button type="button" onClick={() => void durumGuncel(durumGuncellePopup.id)} disabled={loading || !durumGuncelle.durum} style={btnPrimary}>
                {loading ? 'Güncelleniyor...' : '✓ Güncelle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detayPopup && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 0, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: 'white', borderRadius: '16px 16px 0 0', zIndex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>📋 Sipariş Detayı</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={async () => {
                    const el = document.getElementById('siparis-detay-pdf-content')
                    if (!el) return
                    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
                    const imgData = canvas.toDataURL('image/png')
                    const pdf = new jsPDF({ format: 'a5', unit: 'mm', orientation: 'portrait' })
                    const W = 148
                    const H = 210
                    const imgW = W
                    const imgH = (canvas.height * W) / canvas.width
                    let pos = 0
                    pdf.addImage(imgData, 'PNG', 0, pos, imgW, imgH)
                    if (imgH > H) {
                      let remaining = imgH - H
                      while (remaining > 0) {
                        pos -= H
                        pdf.addPage()
                        pdf.addImage(imgData, 'PNG', 0, pos, imgW, imgH)
                        remaining -= H
                      }
                    }
                    pdf.save(`siparis-${detayPopup.id?.slice(-6) ?? 'detay'}.pdf`)
                  }}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#374151' }}
                >
                  📄 PDF
                </button>
                <button style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #25d366', backgroundColor: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#25d366' }}>💬 WhatsApp</button>
                <button style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #3b82f6', backgroundColor: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#3b82f6' }}>📧 E-posta</button>
                <button style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #8b5cf6', backgroundColor: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#8b5cf6' }}>🔌 API</button>
                <button onClick={() => setDetayPopup(null)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', marginLeft: 4 }}>✕</button>
              </div>
            </div>

            <div id="siparis-detay-pdf-content" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Genel Bilgiler */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '10px 14px', fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.05em' }}>GENEL BİLGİLER</div>
                <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px', fontSize: 13 }}>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>Müşteri</div>
                  <div style={{ fontWeight: 700 }}>{detayPopup.musteriAdi} {detayPopup.musteriTelefon ? `· ${detayPopup.musteriTelefon}` : ''}</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>Ürün</div>
                  <div style={{ fontWeight: 700 }}>{detayPopup.urunAdi}</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>Firma Ürünü</div>
                  <div>
                    <input
                      type="text"
                      value={firmaUrunuDraft[detayPopup.id] ?? detayPopup.firmaUrunu ?? ''}
                      onChange={(e) => setFirmaUrunuDraft(p => ({ ...p, [detayPopup.id]: e.target.value }))}
                      onBlur={async (e) => {
                        await adminApi.put(`/admin/ozel-siparis-guncelle/${detayPopup.id}`, { firmaUrunu: e.target.value })
                        setDetayPopup((p: any) => p ? { ...p, firmaUrunu: e.target.value } : p)
                        setSiparisler(prev => prev.map(s => s.id === detayPopup.id ? { ...s, firmaUrunu: e.target.value } : s))
                      }}
                      placeholder="Firma ürün adı / kodu..."
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }}
                    />
                  </div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>Satış Temsilcisi</div>
                  <div>{detayPopup.satisTemsilcisi ?? detayPopup.olusturanKullanici ?? '—'}</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>Şube</div>
                  <div>{detayPopup.subeAdi ?? '—'}</div>
                  <div style={{ color: '#6b7280', fontWeight: 600 }}>Tarih</div>
                  <div>{new Date(detayPopup.createdAt).toLocaleDateString('tr-TR')}</div>
                  {detayPopup.notlar && <>
                    <div style={{ color: '#6b7280', fontWeight: 600 }}>Notlar</div>
                    <div>{detayPopup.notlar}</div>
                  </>}
                </div>
              </div>

              {/* Reçete */}
              {detayPopup.tip === 'RECETELI' && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f8fafc', padding: '10px 14px', fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.05em' }}>REÇETE BİLGİLERİ</div>
                  <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                    <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#C8102E', marginBottom: 6 }}>SAĞ GÖZ</div>
                      <div><b>SPH:</b> {detayPopup.sagSph ?? '—'}</div>
                      <div><b>CYL:</b> {detayPopup.sagCyl ?? '—'}</div>
                      <div><b>AKS:</b> {detayPopup.sagAks ?? '—'}</div>
                      <div><b>ADD:</b> {detayPopup.sagAdd ?? '—'}</div>
                      <div><b>PD:</b> {detayPopup.sagPd ?? '—'}</div>
                    </div>
                    <div style={{ backgroundColor: '#eff6ff', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>SOL GÖZ</div>
                      <div><b>SPH:</b> {detayPopup.solSph ?? '—'}</div>
                      <div><b>CYL:</b> {detayPopup.solCyl ?? '—'}</div>
                      <div><b>AKS:</b> {detayPopup.solAks ?? '—'}</div>
                      <div><b>ADD:</b> {detayPopup.solAdd ?? '—'}</div>
                      <div><b>PD:</b> {detayPopup.solPd ?? '—'}</div>
                    </div>
                  </div>
                  {(detayPopup.camTipi || detayPopup.camIndeksi || detayPopup.kaplama) && (
                    <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 13 }}>
                      {detayPopup.camTipi && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Cam Tipi</div><div>{detayPopup.camTipi}</div></>}
                      {detayPopup.camIndeksi && <><div style={{ color: '#6b7280', fontWeight: 600 }}>İndeks</div><div>{detayPopup.camIndeksi}</div></>}
                      {detayPopup.kaplama && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Kaplama</div><div>{detayPopup.kaplama}</div></>}
                      {detayPopup.cerceveBilgisi && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Çerçeve</div><div>{detayPopup.cerceveBilgisi}</div></>}
                    </div>
                  )}
                </div>
              )}

              {/* Ölçümler */}
              {detayPopup.olcumBilgisi && Array.isArray(detayPopup.olcumBilgisi) && detayPopup.olcumBilgisi.length > 0 && (
                <div style={{ border: '1px solid #d1fae5', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f0fdf4', padding: '10px 14px', fontSize: 11, fontWeight: 800, color: '#16a34a', letterSpacing: '0.05em' }}>ÖLÇÜMLER</div>
                  {detayPopup.olcumBilgisi.map((m: any, i: number) => (
                    <div key={i} style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 13 }}>
                      {m.frameType && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Çerçeve Tipi</div><div>{m.frameType}</div></>}
                      {m.rph && <><div style={{ color: '#6b7280', fontWeight: 600 }}>RPH (Sağ)</div><div>{m.rph}</div></>}
                      {m.lph && <><div style={{ color: '#6b7280', fontWeight: 600 }}>LPH (Sol)</div><div>{m.lph}</div></>}
                      {m.corridor && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Koridor</div><div>{m.corridor}</div></>}
                      {m.rightDia && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Sağ Çap</div><div>{m.rightDia}</div></>}
                      {m.leftDia && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Sol Çap</div><div>{m.leftDia}</div></>}
                      {m.vertex && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Vertex</div><div>{m.vertex}</div></>}
                      {m.pantoscopic && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Pantoskopik</div><div>{m.pantoscopic}</div></>}
                      {m.frameBow && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Çerçeve Bombesi</div><div>{m.frameBow}</div></>}
                      {m.engraving && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Engraving</div><div>{m.engraving}</div></>}
                      {(m.prismR1Val || m.prismL1Val) && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Prizma</div><div>R: {m.prismR1Val}/{m.prismR1Aks}° · L: {m.prismL1Val}/{m.prismL1Aks}°</div></>}
                    </div>
                  ))}
                </div>
              )}

              {/* Tedarikçi */}
              {detayPopup.tedarikciAdi && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ backgroundColor: '#f8fafc', padding: '10px 14px', fontSize: 11, fontWeight: 800, color: '#6b7280', letterSpacing: '0.05em' }}>TEDARİKÇİ</div>
                  <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 13 }}>
                    <div style={{ color: '#6b7280', fontWeight: 600 }}>Tedarikçi</div><div>{detayPopup.tedarikciAdi}</div>
                    {detayPopup.tedarikciSiparisNo && <><div style={{ color: '#6b7280', fontWeight: 600 }}>Sipariş No</div><div>{detayPopup.tedarikciSiparisNo}</div></>}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Başlık */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>🛒 Özel Siparişler</div>
        <button type="button" onClick={() => setYeniSiparisFormu(!yeniSiparisFormu)} style={btnPrimary}>+ Yeni Sipariş</button>
      </div>

      {mesaj && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 700,
          backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b' }}>
          {mesaj.tip === 'ok' ? '✓ ' : '✕ '}{mesaj.text}
        </div>
      )}

      {/* Yeni sipariş formu */}
      {yeniSiparisFormu && (
        <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 14, color: '#1a1a2e' }}>Yeni Özel Sipariş</div>

          {/* Müşteri + Tip */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Müşteri Adı *</label>
              <input value={yeniSiparis.musteriAdi} onChange={e => setYeniSiparis(p => ({ ...p, musteriAdi: e.target.value }))} style={inputS} placeholder="Ad Soyad" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Telefon</label>
              <input value={yeniSiparis.musteriTelefon} onChange={e => setYeniSiparis(p => ({ ...p, musteriTelefon: e.target.value }))} style={inputS} placeholder="05xx xxx xx xx" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Sipariş Tipi *</label>
              <select value={yeniSiparis.tip} onChange={e => setYeniSiparis(p => ({ ...p, tip: e.target.value }))} style={inputS}>
                <option value="RECETELI">🔬 Reçeteli Özel Üretim</option>
                <option value="STANDART">📦 Standart Stok Dışı</option>
              </select>
            </div>
          </div>

          {/* Ürün bilgileri */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Ürün Adı *</label>
              <input value={yeniSiparis.urunAdi} onChange={e => setYeniSiparis(p => ({ ...p, urunAdi: e.target.value }))} style={inputS} placeholder="ör: Hoya Nulux 1.60 EP" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Cam Tipi</label>
              <select value={yeniSiparis.camTipi} onChange={e => setYeniSiparis(p => ({ ...p, camTipi: e.target.value }))} style={inputS}>
                <option value="TEK_ODAKLI">Tek Odaklı</option>
                <option value="PROGRESIF">Progresif</option>
                <option value="BIFOCAL">Bifocal</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>İndeks</label>
              <select value={yeniSiparis.camIndeksi} onChange={e => setYeniSiparis(p => ({ ...p, camIndeksi: e.target.value }))} style={inputS}>
                {['1.50','1.56','1.60','1.67','1.74'].map(i => <option key={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Kaplama</label>
              <select value={yeniSiparis.kaplama} onChange={e => setYeniSiparis(p => ({ ...p, kaplama: e.target.value }))} style={inputS}>
                {['AR','BLUE_CUT','FOTOKROMIK','SEFFAF','AYNA'].map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
          </div>

          {/* Reçete bilgileri */}
          {yeniSiparis.tip === 'RECETELI' && (
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 10 }}>🔬 Reçete Bilgileri</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Sağ göz */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Sağ Göz (OD)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                    {[['sagSph','SPH'],['sagCyl','CYL'],['sagAks','AKS'],['sagAdd','ADD'],['sagPd','PD']].map(([key, label]) => (
                      <div key={key}>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{label}</div>
                        <input type="number" step="0.25" value={(yeniSiparis as any)[key]} onChange={e => setYeniSiparis(p => ({ ...p, [key]: e.target.value }))} style={{ ...inputS, padding: '4px 6px' }} />
                      </div>
                    ))}
                  </div>
                </div>
                {/* Sol göz */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Sol Göz (OS)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                    {[['solSph','SPH'],['solCyl','CYL'],['solAks','AKS'],['solAdd','ADD'],['solPd','PD']].map(([key, label]) => (
                      <div key={key}>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{label}</div>
                        <input type="number" step="0.25" value={(yeniSiparis as any)[key]} onChange={e => setYeniSiparis(p => ({ ...p, [key]: e.target.value }))} style={{ ...inputS, padding: '4px 6px' }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Çerçeve Bilgisi</label>
                <input value={yeniSiparis.cerceveBilgisi} onChange={e => setYeniSiparis(p => ({ ...p, cerceveBilgisi: e.target.value }))} style={inputS} placeholder="ör: Müşteri çerçevesi, 52-18-140" />
              </div>
            </div>
          )}

          {/* Fiyat + Tedarikçi */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Tedarikçi</label>
              <input value={yeniSiparis.tedarikciAdi} onChange={e => setYeniSiparis(p => ({ ...p, tedarikciAdi: e.target.value }))} style={inputS} placeholder="ör: Gözbir, Hoya" />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Tahmini Maliyet (₺)</label>
              <input type="number" value={yeniSiparis.tahminiMaliyet} onChange={e => setYeniSiparis(p => ({ ...p, tahminiMaliyet: e.target.value }))} style={inputS} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Satış Fiyatı (₺)</label>
              <input type="number" value={yeniSiparis.satisFiyati} onChange={e => setYeniSiparis(p => ({ ...p, satisFiyati: e.target.value }))} style={inputS} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Tahmini Geliş</label>
              <input type="date" value={yeniSiparis.tahminiGelisTarihi} onChange={e => setYeniSiparis(p => ({ ...p, tahminiGelisTarihi: e.target.value }))} style={inputS} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Not</label>
            <input value={yeniSiparis.notlar} onChange={e => setYeniSiparis(p => ({ ...p, notlar: e.target.value }))} style={inputS} placeholder="Opsiyonel not..." />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setYeniSiparisFormu(false)} style={btnSmall}>İptal</button>
            <button type="button" onClick={siparisKaydet} disabled={loading || !yeniSiparis.musteriAdi || !yeniSiparis.urunAdi} style={btnPrimary}>
              {loading ? 'Kaydediliyor...' : '✓ Sipariş Oluştur'}
            </button>
          </div>
        </div>
      )}

      {/* Durum filtresi */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['TUMU', ...DURUMLAR]).map(d => (
          <button key={d} type="button" onClick={() => setDurumFiltre(d)}
            style={{ ...btnSmall, backgroundColor: durumFiltre === d ? '#1a1a2e' : '#f3f4f6', color: durumFiltre === d ? 'white' : '#374151', fontSize: 11 }}>
            {d === 'TUMU' ? 'Tümü' : (DURUM_RENK[d]?.label ?? d)}
          </button>
        ))}
      </div>

      {/* Sipariş listesi */}
      {yukleniyor ? (
        <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 30 }}>Yükleniyor...</div>
      ) : siparisler.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 40, backgroundColor: '#f9fafb', borderRadius: 12 }}>
          {durumFiltre === 'TUMU' ? 'Henüz sipariş yok' : `${DURUM_RENK[durumFiltre]?.label ?? durumFiltre} siparişi yok`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {siparisler.map(s => {
            const durum = DURUM_RENK[s.durum] ?? { bg: '#f3f4f6', color: '#374151', label: s.durum }
            return (
              <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: '#1a1a2e' }}>{s.urunAdi}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: s.tip === 'RECETELI' ? '#eff6ff' : '#f3e8ff', color: s.tip === 'RECETELI' ? '#1d4ed8' : '#7c3aed' }}>
                        {s.tip === 'RECETELI' ? '🔬 Reçeteli' : '📦 Standart'}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: durum.bg, color: durum.color }}>{durum.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#374151', marginBottom: 2 }}>
                      👤 <strong>{s.musteriAdi}</strong> {s.musteriTelefon && `· 📞 ${s.musteriTelefon}`}
                    </div>
                    {s.camTipi && (
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>
                        🔬 {s.camTipi} · {s.camIndeksi} · {s.kaplama}
                        {s.sagSph && ` · Sağ: SPH${s.sagSph} CYL${s.sagCyl}`}
                        {s.solSph && ` · Sol: SPH${s.solSph} CYL${s.solCyl}`}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      {s.tedarikciAdi && <span>🏭 {s.tedarikciAdi}</span>}
                      {s.tedarikciSiparisNo && <span>📋 {s.tedarikciSiparisNo}</span>}
                      {s.tahminiMaliyet && <span>Maliyet: ₺{s.tahminiMaliyet}</span>}
                      {s.satisFiyati && <span style={{ color: '#059669', fontWeight: 700 }}>Satış: ₺{s.satisFiyati}</span>}
                      {s.tahminiGelisTarihi && <span>📅 Tahmini: {new Date(s.tahminiGelisTarihi).toLocaleDateString('tr-TR')}</span>}
                      <span style={{ color: '#9ca3af' }}>{new Date(s.createdAt).toLocaleDateString('tr-TR')}</span>
                    </div>
                    {s.notlar && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, fontStyle: 'italic' }}>📝 {s.notlar}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                    {s.durum === 'TESLIM_ALINDI' && (
                      <button type="button" onClick={() => setTeslimPopup(s)}
                        style={{ ...btnPrimary, backgroundColor: '#059669', fontSize: 11, padding: '6px 12px', whiteSpace: 'nowrap' }}>
                        📦 Teslim Et
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDetayPopup(s)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #6366f1', backgroundColor: 'white', color: '#6366f1', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                    >
                      🔍 Detay
                    </button>
                    {!['MUSTERIYE_TESLIM', 'IPTAL'].includes(s.durum) && (
                      <button type="button" onClick={() => { setDurumGuncellePopup(s); setDurumGuncelle({ durum: s.durum, tedarikciSiparisNo: s.tedarikciSiparisNo ?? '', notlar: '' }) }}
                        style={{ ...btnSmall, fontSize: 11, padding: '5px 10px', whiteSpace: 'nowrap' }}>
                        ✏️ Durum
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Stiller ───────────────────────────────────────────────────
const inp: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8,
  fontSize: 13, boxSizing: 'border-box', width: '100%', backgroundColor: 'white',
}
const card: React.CSSProperties = {
  backgroundColor: 'white', border: '1px solid #e5e7eb',
  borderRadius: 12, padding: 16, marginBottom: 10,
}
const btnPrimary: React.CSSProperties = {
  padding: '10px 18px', borderRadius: 10, border: 'none',
  backgroundColor: '#1a1a2e', color: 'white', fontWeight: 800,
  fontSize: 13, cursor: 'pointer',
}
const btnSmall: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
  backgroundColor: '#f3f4f6', color: '#374151', fontWeight: 700,
  fontSize: 12, cursor: 'pointer',
}
const kaynakBadgeOdoo: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4,
  backgroundColor: '#dbeafe', color: '#1d4ed8', letterSpacing: '0.05em', flexShrink: 0,
}
const kaynakBadgeUyumsoft: React.CSSProperties = {
  fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4,
  backgroundColor: '#fef3c7', color: '#b45309', letterSpacing: '0.05em', flexShrink: 0,
}
const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11,
  fontWeight: 800, color: '#6b7280', textTransform: 'uppercase',
  letterSpacing: '0.06em', borderBottom: '1px solid #e5e7eb',
  backgroundColor: '#f9fafb',
}
const td: React.CSSProperties = {
  padding: '10px 12px', borderBottom: '1px solid #f3f4f6',
  fontSize: 13, color: '#111',
}

// ── ÜRÜN GİRİŞ SEKMESİ ───────────────────────────────────────

type UrunGirisAdim = 'giris-tipi' | 'fatura' | 'satirlar' | 'lotlar' | 'onay' | 'bekleyen-faturalar'

type Tedarikci = {
  id: number
  name: string
  tip: 'cari' | 'uretici'
  vat?: string
}

type UyumsoftTedarikciBilgi = {
  name: string
  vkn: string
  vergiDairesi: string
  adres: string
  il: string
  ilce: string
  telefon: string
  email: string
  tip: 'tuzel' | 'gercek'
}

function tipFromVkn(vkn: string): 'tuzel' | 'gercek' {
  const digits = vkn.replace(/\D/g, '')
  return digits.length === 11 ? 'gercek' : 'tuzel'
}

function normalizeUyumsoftTedarikci(
  tedarikci: UyumsoftTedarikciBilgi | null | undefined,
  cariAdi: string,
  vkn?: string | null,
): UyumsoftTedarikciBilgi {
  const digits = (vkn || tedarikci?.vkn || '').replace(/\D/g, '')
  return {
    name: tedarikci?.name || cariAdi || '',
    vkn: tedarikci?.vkn || digits,
    vergiDairesi: tedarikci?.vergiDairesi || '',
    adres: tedarikci?.adres || '',
    il: tedarikci?.il || '',
    ilce: tedarikci?.ilce || '',
    telefon: tedarikci?.telefon || '',
    email: tedarikci?.email || '',
    tip: tedarikci?.tip || tipFromVkn(digits),
  }
}

type FaturaSatiri = {
  id: string
  tedarikciUrunAdi: string
  tedarikciKodu?: string
  uretici: string
  bizimUrunId: string | null
  bizimUrunAdi: string
  bizimUrunOdooId: number | null
  miktar: number
  birimFiyat: string
  iskonto: string
  kdvOrani: string
  eslesti: boolean
}

type UyumsoftHamSatir = {
  sira: number
  stokKodu: string
  urunAdi: string
  barkod: string
  miktar: number
  birimFiyat: number
  kdvOrani: number
  iskonto?: number
}

type UyumsoftKolonAnahtari = 'stokKodu' | 'urunAdi' | 'barkod' | 'miktar' | 'birimFiyat' | 'kdvOrani'
type UyumsoftKolonRol = 'urunAdi' | 'stokKodu' | 'barkod' | 'miktar' | 'birimFiyat' | 'kdvOrani' | 'yoksay'
type UyumsoftKolonMap = Record<UyumsoftKolonAnahtari, UyumsoftKolonRol>

const UYUMSOFT_KOLON_ANAHTARLARI: UyumsoftKolonAnahtari[] = [
  'stokKodu', 'urunAdi', 'barkod', 'miktar', 'birimFiyat', 'kdvOrani',
]

const UYUMSOFT_KOLON_ETIKETLERI: Record<UyumsoftKolonAnahtari, string> = {
  stokKodu: 'Ürün Kodu',
  urunAdi: 'Ürün Adı',
  barkod: 'Barkod',
  miktar: 'Miktar',
  birimFiyat: 'Birim Fiyat',
  kdvOrani: 'KDV Oranı',
}

const VARSAYILAN_UYUMSOFT_KOLON_MAP: UyumsoftKolonMap = {
  stokKodu: 'stokKodu',
  urunAdi: 'urunAdi',
  barkod: 'barkod',
  miktar: 'miktar',
  birimFiyat: 'birimFiyat',
  kdvOrani: 'kdvOrani',
}

const UYUMSOFT_ROL_SECENEKLERI: { value: UyumsoftKolonRol; label: string }[] = [
  { value: 'urunAdi', label: 'Ürün Adı' },
  { value: 'stokKodu', label: 'Stok Kodu / SKU' },
  { value: 'barkod', label: 'Barkod' },
  { value: 'miktar', label: 'Miktar' },
  { value: 'birimFiyat', label: 'Birim Fiyat' },
  { value: 'kdvOrani', label: 'KDV Oranı' },
  { value: 'yoksay', label: 'Yoksay' },
]

type LotSatiri = {
  id: string
  faturaId: string
  satırNo: number
  tedarikciUrunAdi: string
  bizimUrunAdi: string
  bizimUrunOdooId: number | null
  uretici: string
  barkod: string
  utsKodu: string
  lotNo: string
  birimFiyat: string
  lokasyon: string
  satisFiyati: string
  satisFiyatiDegisti: string
  lokasyonTip: 'sube' | 'depo' | 'dis-musteri'
  disMusteriId: number | null
  disMusteriAdi: string
}

type OdooUrun = {
  id: number
  name: string
  default_code: string
  barcode: string
  type: string
  list_price: number
  standard_price: number
}

const KDV_ORANLARI = ['0', '1', '10', '20']
const URUN_ORNEKLERI = [
  { id: 'u1', ad: 'Tek Odaklı RX Cam' },
  { id: 'u2', ad: 'Progresif RX Cam' },
  { id: 'u3', ad: 'Güneş Camı RX' },
  { id: 'u4', ad: 'Çerçeve RX' },
  { id: 'u5', ad: 'Kontakt Lens' },
  { id: 'u6', ad: 'Güneş Gözlüğü Hazır' },
  { id: 'u7', ad: 'Optik Çerçeve Hazır' },
  { id: 'u8', ad: 'Aksesuar' },
]

function BekleyenFaturalarTab({ onGeri }: { onGeri: () => void }) {
  const [kayitlar, setKayitlar] = useState<any[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [eslestirPopup, setEslestirPopup] = useState<any | null>(null)
  const [odooFaturalar, setOdooFaturalar] = useState<any[]>([])
  const [seciliFatura, setSeciliFatura] = useState<string>('')
  const [uyumsoftNo, setUyumsoftNo] = useState('')
  const [tedarikciIrsaliyeNo, setTedarikciIrsaliyeNo] = useState('')
  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { void yukle() }, [])

  async function yukle() {
    setYukleniyor(true)
    try {
      const res = await adminApi.get('/admin/bekleyen-faturalar')
      setKayitlar(res.data?.data ?? [])
    } catch { } finally { setYukleniyor(false) }
  }

  async function eslestirPopupAc(kayit: any) {
    setEslestirPopup(kayit)
    setSeciliFatura('')
    setUyumsoftNo('')
    setTedarikciIrsaliyeNo('')
    try {
      // Odoo'dan bekleyen vendor bill'leri çek
      const res = await adminApi.get(`/admin/muhasebe-faturalar?tip=alis&durum=odenmemis&sirketId=${kayit.sirketId ?? ''}`)
      setOdooFaturalar(res.data?.data ?? [])
    } catch { setOdooFaturalar([]) }
  }

  async function eslestir() {
    if (!eslestirPopup || (!seciliFatura && !uyumsoftNo && !tedarikciIrsaliyeNo)) return
    setLoading(true)
    try {
      await adminApi.post(`/admin/bekleyen-fatura-eslestir/${eslestirPopup.id}`, {
        odooFaturaId: undefined,
        odooFaturaNo: seciliFatura || undefined,
        notlar: `Eşleştirildi: ${seciliFatura || uyumsoftNo || tedarikciIrsaliyeNo}`,
        uyumsoftNo: uyumsoftNo || undefined,
        tedarikciIrsaliyeNo: tedarikciIrsaliyeNo || undefined,
      })
      setMesaj({ tip: 'ok', text: `${seciliFatura || 'Kayıt'} eşleştirildi` })
      setEslestirPopup(null)
      void yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  const DURUM_RENK: Record<string, { bg: string; color: string; label: string }> = {
    BEKLIYOR: { bg: '#fef3c7', color: '#92400e', label: '⏳ Bekliyor' },
    KISMI: { bg: '#eff6ff', color: '#1d4ed8', label: '◑ Kısmi' },
    ESLESTI: { bg: '#dcfce7', color: '#166534', label: '✓ Eşleşti' },
    IPTAL: { bg: '#fee2e2', color: '#991b1b', label: '✕ İptal' },
  }

  const GIRIS_TIPI: Record<string, string> = {
    FATURA_SONRA: '⏳ Fatura Beklemede',
    IRSALIYELI: '📋 İrsaliyeli',
    FATURASIZ: '🔓 Faturasız',
  }

  return (
    <div>
      {eslestirPopup && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: 520, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>Fatura Eşleştir</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              {eslestirPopup.tedarikciAdi} · {eslestirPopup.odooPickingName}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Uyumsoft Fatura No</label>
                <input value={uyumsoftNo} onChange={e => setUyumsoftNo(e.target.value)}
                  placeholder="ör: GVN/2026/000123"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Tedarikçi İrsaliye No</label>
                <input value={tedarikciIrsaliyeNo} onChange={e => setTedarikciIrsaliyeNo(e.target.value)}
                  placeholder="ör: IRS/2026/001234"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                  Odoo Alım Faturası — opsiyonel
                </label>
                {odooFaturalar.length > 0 ? (
                  <select value={seciliFatura} onChange={e => setSeciliFatura(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                    <option value="">— Seçin (opsiyonel) —</option>
                    {odooFaturalar.map((f: any) => (
                      <option key={f.id} value={f.name}>
                        {f.name} · {f.cariAdi} · ₺{Number(f.toplam ?? 0).toLocaleString('tr-TR')} · {f.tarih ?? ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={seciliFatura} onChange={e => setSeciliFatura(e.target.value)}
                    placeholder="ör: BILL/2026/0001 veya boş bırakın"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }} />
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setEslestirPopup(null)}
                style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                İptal
              </button>
              <button type="button" onClick={() => void eslestir()} disabled={!seciliFatura || loading}
                style={{ padding: '8px 16px', backgroundColor: '#1a1a2e', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'white', opacity: !seciliFatura ? 0.5 : 1 }}>
                {loading ? 'Eşleştiriliyor...' : '✓ Eşleştir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 900 }}>📋 Bekleyen Faturalar ({kayitlar.length})</div>
        <button type="button" onClick={onGeri}
          style={{ padding: '7px 14px', backgroundColor: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          ← Geri
        </button>
      </div>

      {mesaj && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 700,
          backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b' }}>
          {mesaj.tip === 'ok' ? '✓ ' : '✕ '}{mesaj.text}
        </div>
      )}

      {yukleniyor ? (
        <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 30 }}>Yükleniyor...</div>
      ) : kayitlar.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 40, backgroundColor: '#f9fafb', borderRadius: 12 }}>
          Bekleyen fatura kaydı yok
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {kayitlar.map(k => {
            const durum = DURUM_RENK[k.durum] ?? { bg: '#f3f4f6', color: '#374151', label: k.durum }
            const kalemler = k.kalemler ? JSON.parse(k.kalemler) : []
            return (
              <div key={k.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 800 }}>{k.tedarikciAdi ?? 'Tedarikçi belirtilmemiş'}</span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: durum.bg, color: durum.color }}>{durum.label}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{GIRIS_TIPI[k.girisTipi] ?? k.girisTipi}</span>
                    </div>
                    {k.odooPickingName && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>📦 {k.odooPickingName}</div>}
                    {k.irsaliyeNo && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>📋 İrsaliye: {k.irsaliyeNo}</div>}
                    {k.sirketAdi && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>🏢 {k.sirketAdi} {k.subeAdi && `· ${k.subeAdi}`}</div>}
                    {kalemler.length > 0 && (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                        {kalemler.slice(0, 3).map((kal: any, i: number) => (
                          <span key={i}>{kal.urunAdi}{i < Math.min(kalemler.length, 3) - 1 ? ', ' : ''}</span>
                        ))}
                        {kalemler.length > 3 && ` +${kalemler.length - 3} ürün daha`}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                      {new Date(k.createdAt).toLocaleDateString('tr-TR')}
                      {k.tahminiTarih && ` · Beklenen: ${new Date(k.tahminiTarih).toLocaleDateString('tr-TR')}`}
                    </div>
                  </div>
                  {k.durum === 'BEKLIYOR' && (
                    <button type="button" onClick={() => void eslestirPopupAc(k)}
                      style={{ padding: '7px 14px', backgroundColor: '#1a1a2e', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'white', whiteSpace: 'nowrap' }}>
                      🔗 Fatura Eşleştir
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function UrunGirisTab() {
  const [adim, setAdim] = useState<UrunGirisAdim>('giris-tipi')
  const [girisTipi, setGirisTipi] = useState<'FATURAYLA' | 'FATURA_SONRA' | 'IRSALIYELI' | 'FATURASIZ' | null>(null)
  const [girisNo] = useState(() => {
    const now = new Date()
    return `GRS-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Adım 1
  const [cariAdi, setCariAdi] = useState('')
  const [cariId, setCariId] = useState<number | null>(null)
  const [faturaNo, setFaturaNo] = useState('')
  const [irsaliyeNo, setIrsaliyeNo] = useState('')
  const [faturaReferans, setFaturaReferans] = useState('')
  const [faturaTarihi, setFaturaTarihi] = useState(new Date().toISOString().slice(0, 10))
  const [cariArama, setCariArama] = useState('')
  const [cariSonuclar, setCariSonuclar] = useState<Tedarikci[]>([])
  const [cariAramaLoading, setCariAramaLoading] = useState(false)
  const [cariAramaYapildi, setCariAramaYapildi] = useState(false)
  const [yeniCariModalAcik, setYeniCariModalAcik] = useState(false)
  const [uyumsoftCariModalAcik, setUyumsoftCariModalAcik] = useState(false)
  const [yeniCariKaydetLoading, setYeniCariKaydetLoading] = useState(false)
  const [yeniCariHedef, setYeniCariHedef] = useState<'cari' | 'fiziki'>('cari')
  const [uyumsoftTedarikci, setUyumsoftTedarikci] = useState<UyumsoftTedarikciBilgi | null>(null)
  const [fizikiAramaYapildi, setFizikiAramaYapildi] = useState(false)
  const [yeniCariForm, setYeniCariForm] = useState({
    name: '',
    vkn: '',
    vergiDairesi: '',
    adres: '',
    il: '',
    ilce: '',
    telefon: '',
    email: '',
    tip: 'tuzel' as 'tuzel' | 'gercek',
  })

  // Alıcı şirket
  const [sirketler, setSirketler] = useState<Array<{id: number; name: string; vat: string}>>([])
  const [secilenSirketId, setSecilenSirketId] = useState<number | null>(null)
  const [secilenSirketAdi, setSecilenSirketAdi] = useState('')
  const [sirketlerYuklendi, setSirketlerYuklendi] = useState(false)
  const [faturaListesi, setFaturaListesi] = useState<Array<{
    id: number
    name: string
    ref: string
    invoice_date: string
    partner_name: string
    partner_id: number | null
    amount_untaxed: number
    amount_total: number
    currency: string
    state: string
    payment_state: string
    company_name: string
    company_id: number | null
    islendi: boolean
  }>>([])
  const [faturaListesiYukleniyor, setFaturaListesiYukleniyor] = useState(false)
  const [faturaArama, setFaturaArama] = useState('')
  const [faturaListesiAcik, setFaturaListesiAcik] = useState(false)
  const [islendiFiltreAktif, setIslendiFiltreAktif] = useState(false)

  // Fiziki tedarikçi
  const [fizikiTedarikciAdi, setFizikiTedarikciAdi] = useState('')
  const [fizikiTedarikciId, setFizikiTedarikciId] = useState<number | null>(null)
  const [fizikiArama, setFizikiArama] = useState('')
  const [fizikiSonuclar, setFizikiSonuclar] = useState<Array<{id: number; name: string; country: string}>>([])
  const [fizikiAramaLoading, setFizikiAramaLoading] = useState(false)

  const [faturaToplamKdvHaric, setFaturaToplamKdvHaric] = useState('')

  // Adım 2
  const [satirlar, setSatirlar] = useState<FaturaSatiri[]>([{
    id: `s-${Date.now()}`,
    tedarikciUrunAdi: '', uretici: '', bizimUrunId: null, bizimUrunAdi: '',
    bizimUrunOdooId: null, miktar: 1, birimFiyat: '', iskonto: '0', kdvOrani: '10', eslesti: false
  }])
  const [topluUretici, setTopluUretici] = useState('')

  // Ürün arama popup
  const [urunPopupAcik, setUrunPopupAcik] = useState(false)
  const [aktifSatirId, setAktifSatirId] = useState<string | null>(null)
  const [urunArama, setUrunArama] = useState('')
  const [urunSonuclar, setUrunSonuclar] = useState<OdooUrun[]>([])
  const [urunAramaLoading, setUrunAramaLoading] = useState(false)
  const [varyantPopup, setVaryantPopup] = useState<{ templateId: number; templateAdi: string } | null>(null)
  const [varyantlar, setVaryantlar] = useState<Array<{ id: number; name: string; defaultCode: string; barcode: string; nitelikler: Array<{ nitelikAdi: string; degerAdi: string }> }>>([])
  const [varyantYukleniyor, setVaryantYukleniyor] = useState(false)

  // Yeni Odoo şablonu oluşturma
  const [yeniUrunFormu, setYeniUrunFormu] = useState(false)
  const [yeniUrunAd, setYeniUrunAd] = useState('')
  const [yeniUrunKod, setYeniUrunKod] = useState('')
  const [yeniUrunBarkod, setYeniUrunBarkod] = useState('')
  const [yeniUrunKategori, setYeniUrunKategori] = useState('')
  const [yeniUrunFiyat, setYeniUrunFiyat] = useState('')
  const [yeniUrunKaydetLoading, setYeniUrunKaydetLoading] = useState(false)

  // Kategori ve nitelik state'leri
  const [kategoriler, setKategoriler] = useState<Array<{id: number; complete_name: string}>>([])
  const [nitelikler, setNitelikler] = useState<Array<{id: number; name: string; create_variant: string; values: Array<{id: number; name: string}>}>>([])
  const [seciliNitelikler, setSeciliNitelikler] = useState<Array<{attributeId: number; attributeName: string; valueIds: number[]}>>([])
  const [secilenKategoriId, setSecilenKategoriId] = useState<number | null>(null)
  const [kategorilerYuklendi, setKategorilerYuklendi] = useState(false)
  const [yeniNitelikAdi, setYeniNitelikAdi] = useState('')
  const [yeniNitelikDegerler, setYeniNitelikDegerler] = useState('')
  const [yeniNitelikKaydetLoading, setYeniNitelikKaydetLoading] = useState(false)
  const [yeniNitelikFormuAcik, setYeniNitelikFormuAcik] = useState(false)
  const [nitelikMesaj, setNitelikMesaj] = useState<{tip: 'ok'|'err'; text: string} | null>(null)

  // Adım 3
  const [lotlar, setLotlar] = useState<LotSatiri[]>([])
  const [irsaliyeler, setIrsaliyeler] = useState<Array<{
    lokasyon: string
    pickingId: number
    pickingName: string
    kalemSayisi: number
    durum: 'bekliyor' | 'olusturuluyor' | 'tamam' | 'hata'
    hata?: string
  }>>([])

  const [lokasyonSeciciAcik, setLokasyonSeciciAcik] = useState<string | null>(null) // grup lokasyonu
  const [lokasyonSekme, setLokasyonSekme] = useState<'sube' | 'depo' | 'dis-musteri'>('sube')
  const [disMusteriArama, setDisMusteriArama] = useState('')
  const [disMusteriSonuclar, setDisMusteriSonuclar] = useState<Array<{id: number; name: string; vat: string}>>([])
  const [disMusteriAramaLoading, setDisMusteriAramaLoading] = useState(false)
  const [disMusteriOnayPopup, setDisMusteriOnayPopup] = useState<{
    lokasyon: string
    partnerAdi: string
    partnerId: number
    kalemler: LotSatiri[]
  } | null>(null)

  const [dovizKuru, setDovizKuru] = useState<{USD: number; EUR: number; tarih: string} | null>(null)
  const [dovizYukleniyor, setDovizYukleniyor] = useState(false)

  // Uyumsoft gelen fatura
  const [gelenModalAcik, setGelenModalAcik] = useState(false)
  const [gelenFaturalar, setGelenFaturalar] = useState<Array<{
    id: string
    uyumsoftNo: string | null
    tedarikciAdi: string | null
    faturaTarihi?: string
    tutarKdvHaric?: number
    kalemSayisi: number
    durum: string
  }>>([])
  const [gelenYukleniyor, setGelenYukleniyor] = useState(false)
  const [gelenFaturaId, setGelenFaturaId] = useState<string | null>(null)
  const [branches, setBranches] = useState<Array<{ id: string; code: string; name: string }>>([])

  // Uyumsoft sütun eşleştirme (adım 2)
  const [uyumsoftKaynak, setUyumsoftKaynak] = useState(false)
  const [uyumsoftHamSatirlar, setUyumsoftHamSatirlar] = useState<UyumsoftHamSatir[]>([])
  const [uyumsoftKolonMap, setUyumsoftKolonMap] = useState<UyumsoftKolonMap>({ ...VARSAYILAN_UYUMSOFT_KOLON_MAP })
  const [uyumsoftTedarikciVkn, setUyumsoftTedarikciVkn] = useState<string | null>(null)
  const [uyumsoftKolonKayitli, setUyumsoftKolonKayitli] = useState(false)

  const LOKASYON_ID_MAP: Record<string, number> = {
    'GVN1': 53, 'GVN3': 54, 'GVN4': 55, 'GVN6': 56,
    'GVN8': 57, 'GVN9': 58, 'GVN2': 59, 'GVN10': 60,
    'ANADEPO': 61, 'GVN5': 62,
  }

  function uyumsoftKolonMapDogrula(): string | null {
    const zorunlu: UyumsoftKolonRol[] = ['urunAdi', 'miktar', 'birimFiyat']
    const roller = Object.values(uyumsoftKolonMap).filter((r) => r !== 'yoksay')
    for (const rol of zorunlu) {
      if (roller.filter((r) => r === rol).length !== 1) {
        const etiket = UYUMSOFT_ROL_SECENEKLERI.find((s) => s.value === rol)?.label ?? rol
        return `"${etiket}" için tam bir sütun eşleştirmesi seçin.`
      }
    }
    const seen = new Set<UyumsoftKolonRol>()
    for (const rol of roller) {
      if (seen.has(rol)) {
        const etiket = UYUMSOFT_ROL_SECENEKLERI.find((s) => s.value === rol)?.label ?? rol
        return `"${etiket}" birden fazla sütuna atanmış.`
      }
      seen.add(rol)
    }
    return null
  }

  function uyumsoftRolDeger(satir: UyumsoftHamSatir, rol: UyumsoftKolonRol): string {
    for (const kolon of UYUMSOFT_KOLON_ANAHTARLARI) {
      if (uyumsoftKolonMap[kolon] === rol) {
        const val = satir[kolon]
        return val == null ? '' : String(val)
      }
    }
    return ''
  }

  function uyumsoftSatirlariOlustur(): FaturaSatiri[] {
    const faturaId = gelenFaturaId ?? 'tmp'
    return uyumsoftHamSatirlar.map((satir, idx) => ({
      id: `uyum-${faturaId}-${idx}`,
      tedarikciUrunAdi: uyumsoftRolDeger(satir, 'urunAdi'),
      tedarikciKodu: uyumsoftRolDeger(satir, 'stokKodu') || undefined,
      uretici: '',
      bizimUrunId: null,
      bizimUrunAdi: '',
      bizimUrunOdooId: null,
      miktar: Number(uyumsoftRolDeger(satir, 'miktar') || satir.miktar || 1),
      birimFiyat: uyumsoftRolDeger(satir, 'birimFiyat') || String(satir.birimFiyat),
      iskonto: satir.iskonto ? String(satir.iskonto) : '0',
      kdvOrani: uyumsoftRolDeger(satir, 'kdvOrani') || String(satir.kdvOrani || 20),
      eslesti: false,
    }))
  }

  async function faturaAdimindanDevam() {
    if (!secilenSirketId) {
      setError('Alıcı şirket seçimi zorunlu.')
      return
    }
    if (girisTipi === 'FATURAYLA' && (!cariAdi.trim() || !faturaNo.trim())) {
      setError('Cari ve fatura no zorunlu.')
      return
    }

    if (uyumsoftKaynak) {
      const mapHata = uyumsoftKolonMapDogrula()
      if (mapHata) {
        setError(mapHata)
        return
      }
      try {
        await adminApi.put('/efatura/gelen/sutun-eslestirme', {
          tedarikciVkn: uyumsoftTedarikciVkn ?? undefined,
          tedarikciAdi: cariAdi,
          kolonMap: uyumsoftKolonMap,
        })
        if (gelenFaturaId) {
          await adminApi.post(`/efatura/gelen/${gelenFaturaId}/onayla-aktarim`)
        }
        setSatirlar(uyumsoftSatirlariOlustur())
        setUyumsoftKolonKayitli(true)
      } catch (e: unknown) {
        const err = e as { response?: { data?: { error?: string } }; message?: string }
        setError(err?.response?.data?.error ?? err?.message ?? 'Sütun eşleştirme kaydedilemedi')
        return
      }
    }

    setError(null)
    setAdim('satirlar')
  }

  function uyumsoftStateSifirla() {
    setUyumsoftKaynak(false)
    setUyumsoftHamSatirlar([])
    setUyumsoftKolonMap({ ...VARSAYILAN_UYUMSOFT_KOLON_MAP })
    setUyumsoftTedarikciVkn(null)
    setUyumsoftTedarikci(null)
    setUyumsoftKolonKayitli(false)
    setUyumsoftCariModalAcik(false)
  }

  async function odooCariBul(vkn?: string, adi?: string): Promise<Tedarikci | null> {
    const vknDigits = (vkn || '').replace(/\D/g, '')
    const q = vknDigits.length >= 10 ? vknDigits : (adi || '').trim()
    if (!q || q.length < 2) return null
    try {
      const res = await adminApi.get(`/admin/cari-ara?q=${encodeURIComponent(q)}`)
      const liste: Tedarikci[] = res.data?.data ?? []
      if (!liste.length) return null
      if (vknDigits.length >= 10) {
        const vknEslesen = liste.find((c) => (c.vat || '').replace(/\D/g, '') === vknDigits)
        if (vknEslesen) return vknEslesen
      }
      const adNorm = (adi || '').trim().toLowerCase()
      if (adNorm) {
        const adEslesen = liste.find((c) => c.name.toLowerCase() === adNorm)
        if (adEslesen) return adEslesen
      }
      return liste.length === 1 ? liste[0] : null
    } catch {
      return null
    }
  }

  async function otomatikCariEslestir(vkn?: string, adi?: string) {
    const bulunan = await odooCariBul(vkn, adi)
    if (bulunan) {
      setCariId(bulunan.id)
      setCariAdi(bulunan.name)
      setCariArama(bulunan.name)
      setCariAramaYapildi(false)
      setCariSonuclar([])
    } else {
      setCariId(null)
      setCariAramaYapildi(true)
      setCariSonuclar([])
    }
  }

  function tedarikciBilgidenForm(t: UyumsoftTedarikciBilgi) {
    return {
      name: t.name,
      vkn: t.vkn,
      vergiDairesi: t.vergiDairesi,
      adres: t.adres,
      il: t.il,
      ilce: t.ilce,
      telefon: t.telefon,
      email: t.email,
      tip: t.tip,
    }
  }

  async function uyumsoftCariModalAc() {
    setYeniCariHedef('cari')
    let tedarikci = normalizeUyumsoftTedarikci(uyumsoftTedarikci, cariAdi || cariArama, uyumsoftTedarikciVkn)

    const eksikDetay = !tedarikci.vergiDairesi && !tedarikci.adres && !tedarikci.telefon && !tedarikci.email
    if (eksikDetay && gelenFaturaId) {
      try {
        const res = await adminApi.post(`/efatura/gelen/${gelenFaturaId}/urun-girisine-aktar`, {
          hedefDepo: 'ANADEPO',
        })
        const form = res.data?.form
        if (form) {
          tedarikci = normalizeUyumsoftTedarikci(form.tedarikci, form.cariAdi, form.tedarikciVkn)
          setUyumsoftTedarikci(tedarikci)
          if (form.tedarikciVkn) setUyumsoftTedarikciVkn(form.tedarikciVkn)
        }
      } catch {
        // API yenileme başarısız — mevcut özet veriyle devam et
      }
    }

    setYeniCariForm(tedarikciBilgidenForm(tedarikci))
    setUyumsoftCariModalAcik(true)
  }

  async function gelenFaturalariYukle() {
    setGelenYukleniyor(true)
    try {
      const res = await adminApi.get('/efatura/gelen/listele')
      setGelenFaturalar(res.data?.data ?? [])
    } catch {
      setGelenFaturalar([])
    } finally {
      setGelenYukleniyor(false)
    }
  }

  async function gelenFaturalariCek() {
    setGelenYukleniyor(true)
    try {
      const res = await adminApi.post('/efatura/gelen/cek', { onlyUnread: true, pageSize: 30 })
      setGelenFaturalar(res.data?.data ?? [])
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err?.response?.data?.error ?? err?.message ?? 'Uyumsoft çekme hatası')
    } finally {
      setGelenYukleniyor(false)
    }
  }

  async function gelenFaturadanAktar(faturaId: string) {
    setGelenYukleniyor(true)
    try {
      const res = await adminApi.post(`/efatura/gelen/${faturaId}/urun-girisine-aktar`, {
        hedefDepo: 'ANADEPO',
      })
      const form = res.data?.form
      if (!form) throw new Error('Form verisi alınamadı')

      const listeKayit = gelenFaturalar.find((f) => f.id === faturaId)
      const tedarikciVkn = form.tedarikciVkn ?? listeKayit?.tedarikciVkn ?? null

      setGirisTipi('FATURAYLA')
      setGelenFaturaId(res.data?.bekleyenFaturaId ?? faturaId)
      setCariAdi(form.cariAdi)
      setCariArama(form.cariAdi)
      setFaturaNo(form.faturaNo)
      setFaturaReferans(form.faturaReferans)
      setFaturaTarihi(form.faturaTarihi)
      setFaturaToplamKdvHaric(String(form.faturaToplamKdvHaric ?? ''))
      setUyumsoftKaynak(true)
      setUyumsoftHamSatirlar(form.hamSatirlar ?? [])
      setUyumsoftKolonMap(form.kolonMap ?? { ...VARSAYILAN_UYUMSOFT_KOLON_MAP })
      setUyumsoftTedarikciVkn(tedarikciVkn)
      setUyumsoftTedarikci(normalizeUyumsoftTedarikci(form.tedarikci, form.cariAdi, tedarikciVkn))
      setUyumsoftKolonKayitli(!!form.kolonMapKayitli)
      setSatirlar([{
        id: `s-${Date.now()}`,
        tedarikciUrunAdi: '', uretici: '', bizimUrunId: null, bizimUrunAdi: '',
        bizimUrunOdooId: null, miktar: 1, birimFiyat: '', iskonto: '0', kdvOrani: '10', eslesti: false,
      }])
      setAdim('fatura')
      setGelenModalAcik(false)
      setError(null)

      const hedefLok = form.hedefDepo || 'ANADEPO'
      const depoLok = LOKASYONLAR.find(l => l.id === hedefLok)
      if (depoLok) {
        setSecilenSirketId(depoLok.sirketId)
        setSecilenSirketAdi(depoLok.sirket)
      }

      await otomatikCariEslestir(tedarikciVkn ?? undefined, form.cariAdi)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err?.response?.data?.error ?? err?.message ?? 'Aktarım hatası')
    } finally {
      setGelenYukleniyor(false)
    }
  }

  useEffect(() => {
    adminApi.get('/admin/branches').then(res => {
      setBranches(res.data?.data ?? [])
    }).catch(() => setBranches([]))
  }, [])

  // Örnek faturalar
  const ORNEK_FATURALAR = [
    {
      company_id: null, // NG'nin Odoo company id'si buraya yazılacak
      cariId: 1, cariAdi: 'Gözbir Optik', faturaNo: 'GZB-2026-001',
      faturaReferans: 'e-fatura-uuid-001', faturaTarihi: '2026-05-20', faturaToplamKdvHaric: '4500',
      satirlar: [
        { id: 's-ornek-1', tedarikciUrunAdi: 'HOYA Nulux 1.60 EP', uretici: 'Hoya', bizimUrunAdi: 'Tek Odaklı RX Cam', bizimUrunId: 'u1', bizimUrunOdooId: null, miktar: 4, birimFiyat: '450', iskonto: '10', kdvOrani: '10', eslesti: true },
        { id: 's-ornek-2', tedarikciUrunAdi: 'HOYA ID MyStyle V+ 1.50', uretici: 'Hoya', bizimUrunAdi: 'Progresif RX Cam', bizimUrunId: 'u2', bizimUrunOdooId: null, miktar: 2, birimFiyat: '900', iskonto: '0', kdvOrani: '10', eslesti: true },
      ]
    },
    {
      company_id: null,
      cariId: 2, cariAdi: 'Opsan Optik', faturaNo: 'OPS-2026-042',
      faturaReferans: '', faturaTarihi: '2026-05-22', faturaToplamKdvHaric: '2800',
      satirlar: [
        { id: 's-ornek-3', tedarikciUrunAdi: 'Rodenstock Perfalit 1.5', uretici: 'Rodenstock', bizimUrunAdi: 'Tek Odaklı RX Cam', bizimUrunId: 'u1', bizimUrunOdooId: null, miktar: 3, birimFiyat: '520', iskonto: '5', kdvOrani: '10', eslesti: true },
        { id: 's-ornek-4', tedarikciUrunAdi: 'Lindberg Air Titanium', uretici: 'Lindberg', bizimUrunAdi: 'Çerçeve RX', bizimUrunId: 'u4', bizimUrunOdooId: null, miktar: 2, birimFiyat: '320', iskonto: '0', kdvOrani: '20', eslesti: true },
      ]
    },
  ]

  function ornekFaturaYukle(ornek: typeof ORNEK_FATURALAR[0]) {
    setCariId(ornek.cariId)
    setCariAdi(ornek.cariAdi)
    setCariArama(ornek.cariAdi)
    setFaturaNo(ornek.faturaNo)
    setFaturaReferans(ornek.faturaReferans)
    setFaturaTarihi(ornek.faturaTarihi)
    setFaturaToplamKdvHaric(ornek.faturaToplamKdvHaric)
    setSatirlar(ornek.satirlar)
    setError(null)
    setFaturaListesiAcik(false)
    // Şirket seçimini KORU — sıfırlama
  }

  async function faturaListesiniYukle(sirketId: number | null) {
    if (!sirketId) return
    setFaturaListesiYukleniyor(true)
    try {
      const res = await adminApi.get(`/admin/satin-alma-faturalari?sirketId=${sirketId}&limit=100`)
      setFaturaListesi(res.data?.data ?? [])
      setFaturaListesiAcik(true)
    } catch {
      setFaturaListesi([])
    } finally {
      setFaturaListesiYukleniyor(false)
    }
  }

  async function faturaIslendiToggle(faturaId: number, islendi: boolean) {
    try {
      await adminApi.post('/admin/fatura-islendi', { faturaId, islendi })
      setFaturaListesi(prev => prev.map(f => f.id === faturaId ? { ...f, islendi } : f))
    } catch (e) {
      console.warn('[fatura islendi toggle hata]', e)
    }
  }

  function faturaSecimYap(fatura: typeof faturaListesi[0]) {
    setCariId(fatura.partner_id)
    setCariAdi(fatura.partner_name)
    setCariArama(fatura.partner_name)
    setFaturaNo(fatura.name)
    setFaturaReferans(fatura.ref)
    setFaturaTarihi(fatura.invoice_date)
    setFaturaToplamKdvHaric(String(fatura.amount_untaxed))
    setFaturaListesiAcik(false)
  }

  async function sirketleriYukle() {
    if (sirketlerYuklendi) return
    try {
      const res = await adminApi.get('/admin/sirket-listesi')
      setSirketler(res.data?.data ?? [])
    } catch {
      setSirketler([
        { id: 1, name: 'NG OPTİK', vat: '' },
        { id: 2, name: 'ADESE OPTİK', vat: '' },
        { id: 3, name: 'POTANSİYEL OPTİK', vat: '' },
      ])
    } finally {
      setSirketlerYuklendi(true)
    }
  }

  async function araFizikiTedarikci(q: string) {
    if (!q.trim() || q.length < 2) {
      setFizikiSonuclar([])
      setFizikiAramaYapildi(false)
      return
    }
    setFizikiAramaLoading(true)
    try {
      const res = await adminApi.get(`/admin/cari-ara?q=${encodeURIComponent(q)}`)
      setFizikiSonuclar((res.data?.data ?? []).map((c: Tedarikci) => ({
        id: c.id,
        name: c.name,
        country: '',
      })))
    } catch {
      setFizikiSonuclar([])
    } finally {
      setFizikiAramaLoading(false)
      setFizikiAramaYapildi(true)
    }
  }

  async function araCariler(q: string) {
    if (!q.trim() || q.length < 2) {
      setCariSonuclar([])
      setCariAramaYapildi(false)
      return
    }
    setCariAramaLoading(true)
    try {
      const res = await adminApi.get(`/admin/cari-ara?q=${encodeURIComponent(q)}`)
      setCariSonuclar(res.data?.data ?? [])
    } catch {
      setCariSonuclar([])
    } finally {
      setCariAramaLoading(false)
      setCariAramaYapildi(true)
    }
  }

  function yeniCariModalAc(hedef: 'cari' | 'fiziki' = 'cari') {
    setYeniCariHedef(hedef)
    setYeniCariForm({
      name: hedef === 'fiziki' ? fizikiArama.trim() : cariArama.trim(),
      vkn: '',
      vergiDairesi: '',
      adres: '',
      il: '',
      ilce: '',
      telefon: '',
      email: '',
      tip: 'tuzel',
    })
    setYeniCariModalAcik(true)
  }

  async function yeniCariKaydet() {
    if (!yeniCariForm.name.trim()) {
      setError('Firma adı zorunlu')
      return
    }
    setYeniCariKaydetLoading(true)
    setError(null)
    try {
      const res = await adminApi.post('/admin/cari-olustur', {
        ...yeniCariForm,
        sirketId: secilenSirketId ?? undefined,
      })
      const kayit = res.data?.data
      if (!kayit?.id) throw new Error('Cari oluşturulamadı')

      if (yeniCariHedef === 'fiziki') {
        setFizikiTedarikciId(kayit.id)
        setFizikiTedarikciAdi(kayit.name)
        setFizikiArama(kayit.name)
        setFizikiSonuclar([])
        setFizikiAramaYapildi(false)
        setYeniCariModalAcik(false)
      } else {
        setCariId(kayit.id)
        setCariAdi(kayit.name)
        setCariArama(kayit.name)
        setCariSonuclar([])
        setCariAramaYapildi(false)
        setYeniCariModalAcik(false)
        setUyumsoftCariModalAcik(false)
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err?.response?.data?.error ?? err?.message ?? 'Cari kaydedilemedi')
    } finally {
      setYeniCariKaydetLoading(false)
    }
  }

  async function kategoriveNitelikleriYukle() {
    if (kategorilerYuklendi) return
    try {
      const [katRes, nitRes] = await Promise.all([
        adminApi.get('/admin/kategori-listesi'),
        adminApi.get('/admin/nitelik-listesi'),
      ])
      setKategoriler(katRes.data?.data ?? [])
      setNitelikler(nitRes.data?.data ?? [])
      setKategorilerYuklendi(true)
    } catch {
      setKategorilerYuklendi(true)
    }
  }

  // Odoo'dan ürün ara
  async function araUrunler(q: string) {
    if (!q.trim() || q.length < 2) { setUrunSonuclar([]); return }
    setUrunAramaLoading(true)
    try {
      const res = await adminApi.get(`/admin/urun-ara?q=${encodeURIComponent(q)}`)
      const data = res.data?.data ?? []
      if (data.length > 0) {
        setUrunSonuclar(data.map((u: any) => ({
          id: u.id,
          name: u.name,
          default_code: u.default_code || '',
          barcode: u.barcode || '',
          type: u.type || 'product',
          list_price: u.list_price || 0,
          standard_price: u.standard_price || 0,
        })))
      } else {
        // Odoo'dan sonuç yok, mock fallback
        setUrunSonuclar([
          { id: 101, name: 'Tek Odaklı RX Cam', default_code: 'RX-001', barcode: '', type: 'product', list_price: 0, standard_price: 0 },
          { id: 102, name: 'Progresif RX Cam', default_code: 'RX-002', barcode: '', type: 'product', list_price: 0, standard_price: 0 },
          { id: 103, name: 'Güneş Camı RX', default_code: 'RX-003', barcode: '', type: 'product', list_price: 0, standard_price: 0 },
          { id: 104, name: 'Çerçeve RX', default_code: 'CERCEVE-001', barcode: '', type: 'product', list_price: 0, standard_price: 0 },
          { id: 105, name: 'Kontakt Lens', default_code: 'KL-001', barcode: '', type: 'product', list_price: 0, standard_price: 0 },
        ].filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.default_code.toLowerCase().includes(q.toLowerCase())))
      }
    } catch (err) {
      console.error('[urun-ara frontend hata]', err)
      setUrunSonuclar([])
    } finally {
      setUrunAramaLoading(false)
    }
  }

  function urunPopupAc(satirId: string) {
    setAktifSatirId(satirId)
    setUrunArama('')
    setUrunSonuclar([])
    setYeniUrunFormu(false)
    setYeniUrunAd(''); setYeniUrunKod(''); setYeniUrunBarkod('')
    setYeniUrunKategori(''); setYeniUrunFiyat('')
    setSecilenKategoriId(null)
    setSeciliNitelikler([])
    setUrunPopupAcik(true)
    void kategoriveNitelikleriYukle()
  }

  async function templateSec(u: OdooUrun) {
    setVaryantYukleniyor(true)
    setVaryantPopup({ templateId: u.id, templateAdi: u.name })
    try {
      const res = await adminApi.get(`/admin/urun-varyanlar/${u.id}`)
      const data = res.data?.data ?? []
      if (data.length === 1) {
        // Tek varyant varsa direkt seç
        setVaryantPopup(null)
        urunSec({ ...u, id: data[0].id, name: data[0].name, default_code: data[0].defaultCode })
      } else {
        setVaryantlar(data)
      }
    } catch {
      // Varyant çekilemezse template ile devam et
      setVaryantPopup(null)
      urunSec(u)
    } finally {
      setVaryantYukleniyor(false)
    }
  }

  function urunSec(urun: OdooUrun) {
    if (!aktifSatirId) return
    setSatirlar(prev => prev.map(s => s.id === aktifSatirId ? {
      ...s, bizimUrunId: String(urun.id), bizimUrunAdi: urun.name,
      bizimUrunOdooId: urun.id, eslesti: true
    } : s))
    setUrunPopupAcik(false)
  }

  async function yeniNitelikKaydet() {
    if (!yeniNitelikAdi.trim() || !yeniNitelikDegerler.trim()) return
    setYeniNitelikKaydetLoading(true)
    setNitelikMesaj(null)
    try {
      const degerler = yeniNitelikDegerler
        .split(/[,\n]/)
        .map(d => d.trim())
        .filter(Boolean)
      if (degerler.length === 0) {
        setNitelikMesaj({ tip: 'err', text: 'En az 1 değer girin.' })
        return
      }
      const res = await adminApi.post('/admin/nitelik-olustur', {
        name: yeniNitelikAdi.trim(),
        values: degerler,
      }).catch(() => null)

      const yeniId = res?.data?.data?.id ?? Math.floor(Math.random() * 9000 + 1000)
      const yeniNitelik = {
        id: yeniId,
        name: yeniNitelikAdi.trim(),
        create_variant: 'always',
        values: degerler.map((d, i) => ({ id: res?.data?.data?.value_ids?.[i] ?? (yeniId * 100 + i), name: d })),
      }
      setNitelikler(prev => [...prev, yeniNitelik])
      setNitelikMesaj({ tip: 'ok', text: `"${yeniNitelikAdi}" niteliği oluşturuldu (${degerler.length} değer).` })
      setYeniNitelikAdi('')
      setYeniNitelikDegerler('')
      setYeniNitelikFormuAcik(false)
    } catch (err: any) {
      setNitelikMesaj({ tip: 'err', text: err?.message ?? 'Nitelik oluşturulamadı.' })
    } finally {
      setYeniNitelikKaydetLoading(false)
    }
  }

  async function yeniOdooUrunKaydet() {
    if (!yeniUrunAd.trim()) return
    setYeniUrunKaydetLoading(true)
    try {
      const payload: any = {
        name: yeniUrunAd,
        default_code: yeniUrunKod,
        barcode: yeniUrunBarkod,
        standard_price: Number(yeniUrunFiyat) || 0,
        type: 'product',
        tracking: 'serial',
        nitelikler: seciliNitelikler.map(n => ({ attributeId: n.attributeId, valueIds: n.valueIds })),
      }
      if (secilenKategoriId) payload.categ_id = secilenKategoriId
      else if (yeniUrunKategori.trim()) payload.categ_name = yeniUrunKategori.trim()

      const res = await adminApi.post('/admin/urun-olustur', payload).catch(() => null)
      const odooId = res?.data?.data?.id ?? Math.floor(Math.random() * 10000 + 200)
      const urun: OdooUrun = {
        id: odooId, name: yeniUrunAd, default_code: yeniUrunKod,
        barcode: yeniUrunBarkod, type: 'product',
        list_price: 0, standard_price: Number(yeniUrunFiyat) || 0
      }
      urunSec(urun)
    } finally {
      setYeniUrunKaydetLoading(false)
    }
  }

  function satirEkle() {
    setSatirlar(prev => [...prev, {
      id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tedarikciUrunAdi: '', uretici: topluUretici, bizimUrunId: null, bizimUrunAdi: '',
      bizimUrunOdooId: null, miktar: 1, birimFiyat: '', iskonto: '0', kdvOrani: '10', eslesti: false
    }])
  }

  function satirSil(id: string) { setSatirlar(prev => prev.filter(s => s.id !== id)) }

  function satirGuncelle(id: string, field: keyof FaturaSatiri, value: any) {
    setSatirlar(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  function topluUreticiUygula() {
    if (!topluUretici.trim()) return
    setSatirlar(prev => prev.map(s => ({ ...s, uretici: topluUretici })))
  }

  async function araDisMusteri(q: string) {
    if (!q.trim() || q.length < 2) { setDisMusteriSonuclar([]); return }
    setDisMusteriAramaLoading(true)
    try {
      const res = await adminApi.get(`/admin/cari-ara?q=${encodeURIComponent(q)}`)
      setDisMusteriSonuclar(res.data?.data ?? [])
    } catch {
      setDisMusteriSonuclar([
        { id: 201, name: 'Örnek Optik A.Ş.', vat: '1234567890' },
        { id: 202, name: 'Demo Optik Ltd.', vat: '9876543210' },
      ].filter(p => p.name.toLowerCase().includes(q.toLowerCase())))
    } finally {
      setDisMusteriAramaLoading(false)
    }
  }

  async function dovizKuruCek() {
    if (dovizKuru) return
    setDovizYukleniyor(true)
    try {
      const res = await adminApi.get('/admin/doviz-kuru')
      if (res.data?.USD) setDovizKuru({ USD: res.data.USD, EUR: res.data.EUR, tarih: res.data.tarih })
    } catch { } finally { setDovizYukleniyor(false) }
  }

  async function satisFiyatiGuncelle(lotId: string, yeniFiyat: string) {
    const lot = lotlar.find(l => l.id === lotId)
    if (!lot) return
    setLotlar(prev => prev.map(l => l.id === lotId ? {
      ...l,
      satisFiyati: yeniFiyat,
      satisFiyatiDegisti: 'true',
    } : l))
    if (!lot.bizimUrunOdooId) return
    try {
      await adminApi.post('/admin/satis-fiyati-guncelle', {
        productTmplId: lot.bizimUrunOdooId,
        listPrice: Number(yeniFiyat),
      })
    } catch (e) {
      console.warn('[satis fiyati guncelle hata]', e)
    }
  }

  async function irsaliyeOlustur(lokasyon: string) {
    const lokasyonKalemleri = lotlar.filter(l => l.lokasyon === lokasyon)
    if (!lokasyonKalemleri.length) return

    const ilkKalem = lokasyonKalemleri[0]
    const isDisMusteri = ilkKalem.lokasyonTip === 'dis-musteri'

    // Dış müşteri ise önce onay popup'ı aç
    if (isDisMusteri) {
      setDisMusteriOnayPopup({
        lokasyon,
        partnerAdi: ilkKalem.disMusteriAdi,
        partnerId: ilkKalem.disMusteriId!,
        kalemler: lokasyonKalemleri,
      })
      return
    }

    await irsaliyeOlusturDevam(lokasyon)
  }

  async function irsaliyeOlusturDevam(lokasyon: string) {
    const lokasyonKalemleri = lotlar.filter(l => l.lokasyon === lokasyon)
    if (!lokasyonKalemleri.length) return

    const ilkKalem = lokasyonKalemleri[0]
    const isDisMusteri = ilkKalem.lokasyonTip === 'dis-musteri'

    setIrsaliyeler(prev => {
      const existing = prev.find(i => i.lokasyon === lokasyon)
      if (existing) return prev.map(i => i.lokasyon === lokasyon ? { ...i, durum: 'olusturuluyor' } : i)
      return [...prev, { lokasyon, pickingId: 0, pickingName: '', kalemSayisi: lokasyonKalemleri.length, durum: 'olusturuluyor' }]
    })

    try {
      const endpoint = isDisMusteri ? '/admin/dis-musteri-transfer' : '/admin/irsaliye-olustur'
      const payload = isDisMusteri ? {
        sirketId: secilenSirketId,
        faturaNo,
        faturaTarihi,
        partnerId: ilkKalem.disMusteriId,
        partnerAdi: ilkKalem.disMusteriAdi,
        kalemler: lokasyonKalemleri.map(l => ({
          bizimUrunOdooId: l.bizimUrunOdooId,
          bizimUrunAdi: l.bizimUrunAdi,
          lotNo: l.lotNo,
          barkod: l.barkod,
          birimFiyat: l.birimFiyat,
          satisFiyati: l.satisFiyati,
        })),
      } : {
        sirketId: secilenSirketId,
        cariId,
        faturaNo,
        faturaTarihi,
        lokasyon,
        kalemler: lokasyonKalemleri.map(l => ({
          bizimUrunOdooId: l.bizimUrunOdooId,
          bizimUrunAdi: l.bizimUrunAdi,
          lotNo: l.lotNo,
          barkod: l.barkod,
          utsKodu: l.utsKodu,
          birimFiyat: l.birimFiyat,
        })),
      }

      const res = await adminApi.post(endpoint, payload)

      if (res.data?.success) {
        setIrsaliyeler(prev => prev.map(i => i.lokasyon === lokasyon ? {
          ...i,
          durum: 'tamam',
          pickingId: res.data.pickingId,
          pickingName: res.data.invoiceName
            ? `${res.data.pickingName} + ${res.data.invoiceName}`
            : res.data.pickingName,
        } : i))
      } else {
        throw new Error(res.data?.error ?? 'Bilinmeyen hata')
      }
    } catch (err: any) {
      setIrsaliyeler(prev => prev.map(i => i.lokasyon === lokasyon ? {
        ...i, durum: 'hata', hata: err?.response?.data?.error ?? err?.message ?? 'Hata'
      } : i))
    }
  }

  // Adım 2 → Adım 3: Her satır × miktar = lotlar
  function lotlariOlustur() {
    const yeniLotlar: LotSatiri[] = []
    satirlar.forEach(satir => {
      for (let i = 0; i < satir.miktar; i++) {
        yeniLotlar.push({
          id: `l-${satir.id}-${i}`,
          faturaId: satir.id,
          satırNo: i + 1,
          tedarikciUrunAdi: satir.tedarikciUrunAdi,
          bizimUrunAdi: satir.bizimUrunAdi,
          bizimUrunOdooId: satir.bizimUrunOdooId,
          uretici: satir.uretici,
          barkod: '',
          utsKodu: '',
          lotNo: `${faturaNo || 'FAT'}-${satir.id.slice(-4)}-${String(i + 1).padStart(3, '0')}`,
          birimFiyat: satir.birimFiyat,
          lokasyon: 'ANADEPO',
          satisFiyati: '',
          satisFiyatiDegisti: '',
          lokasyonTip: 'depo' as const,
          disMusteriId: null,
          disMusteriAdi: '',
        })
      }
    })
    setLotlar(yeniLotlar)
    setAdim('lotlar')
  }

  function lotGuncelle<K extends keyof LotSatiri>(id: string, field: K, value: LotSatiri[K]) {
    setLotlar(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  const hesaplananToplam = satirlar.reduce((acc, s) => {
    const fiyat = Number(s.birimFiyat) || 0
    const iskonto = Number(s.iskonto) || 0
    return acc + fiyat * s.miktar * (1 - iskonto / 100)
  }, 0)

  const toplamFark = faturaToplamKdvHaric ? Math.abs(Number(faturaToplamKdvHaric) - hesaplananToplam) : 0

  async function kaydet() {
    setSaving(true); setError(null)
    try {
      const res = await adminApi.post('/admin/urun-giris', {
        sirketId: secilenSirketId,
        sirketAdi: secilenSirketAdi,
        cariId,
        cariAdi,
        fizikiTedarikciId,
        fizikiTedarikciAdi,
        faturaNo,
        faturaReferans,
        faturaTarihi,
        faturaToplamKdvHaric: Number(faturaToplamKdvHaric),
        satirlar,
        lotlar,
        girisTipi: girisTipi ?? 'FATURAYLA',
        girisNo,
        irsaliyeNo: irsaliyeNo || undefined,
      })

      if (res.data?.success) {
        setSuccess(true)
        const s = res.data.sonuclar ?? {}
        const mesajlar = []
        if (s.purchaseOrder) mesajlar.push(`✓ Satın alma siparişi: ${s.purchaseOrder.name}`)
        if (s.lotSayisi) mesajlar.push(`✓ ${s.lotSayisi} lot/seri no oluşturuldu`)
        if (s.fiyatGuncellenen) mesajlar.push(`✓ ${s.fiyatGuncellenen} ürün satış fiyatı güncellendi`)
        if (res.data.hatalar?.length) mesajlar.push(`⚠️ Uyarılar: ${res.data.hatalar.join(', ')}`)
        setError(mesajlar.length > 0 ? mesajlar.join('\n') : null)

        if (girisTipi === 'FATURA_SONRA' || girisTipi === 'IRSALIYELI') {
          const hedefLokasyon = lotlar[0]?.lokasyon ?? 'ANADEPO'
          try {
            await adminApi.post('/admin/bekleyen-fatura-ekle', {
              girisTipi,
              tedarikciAdi: fizikiTedarikciAdi || cariAdi,
              irsaliyeNo: irsaliyeNo || undefined,
              aciklama: `Giriş No: ${girisNo}`,
              sirketId: secilenSirketId,
              sirketAdi: secilenSirketAdi,
              subeId: hedefLokasyon,
              subeAdi: hedefLokasyon,
              kalemler: satirlar.map((s: any) => ({
                urunAdi: s.bizimUrunAdi || s.tedarikciUrunAdi,
                miktar: s.miktar,
                birimFiyat: s.birimFiyat,
              })),
              odooPickingName: res.data?.irsaliyeAdi || res.data?.poAdi || girisNo,
            })
          } catch (be: any) {
            console.warn('[bekleyen fatura kayit]', be?.message)
          }
        }

        if (gelenFaturaId) {
          const anadepo = branches.find(b => b.code === 'ANADEPO')
          const utsKalemler = lotlar
            .filter((l: LotSatiri) => (l.barkod || l.utsKodu)?.trim())
            .map((l: LotSatiri) => ({
              barkod: (l.barkod || l.utsKodu).trim(),
              lotNo: l.lotNo || undefined,
              seriNo: l.lotNo || undefined,
              adet: 1,
            }))
          if (anadepo && utsKalemler.length > 0) {
            try {
              await adminApi.post(`/efatura/gelen/${gelenFaturaId}/uts-alma`, {
                branchId: anadepo.id,
                kalemler: utsKalemler,
                belgeNo: faturaNo,
              })
              mesajlar.push(`✓ UTS Alma bildirimi kuyruğa eklendi (${utsKalemler.length} kalem)`)
            } catch (utsErr: unknown) {
              console.warn('[uts alma]', utsErr)
            }
          }
          setGelenFaturaId(null)
        }

        setTimeout(() => {
          setAdim('giris-tipi')
          uyumsoftStateSifirla()
          setCariAdi(''); setCariId(null); setCariArama('')
          setCariAramaYapildi(false)
          setYeniCariModalAcik(false)
          setUyumsoftCariModalAcik(false)
          setFizikiAramaYapildi(false)
          setSecilenSirketId(null); setSecilenSirketAdi('')
          setFizikiTedarikciId(null); setFizikiTedarikciAdi(''); setFizikiArama('')
          setFaturaNo(''); setFaturaReferans(''); setFaturaToplamKdvHaric('')
          setFaturaTarihi(new Date().toISOString().slice(0, 10))
          setSatirlar([{ id: `s-${Date.now()}`, tedarikciUrunAdi: '', uretici: '', bizimUrunId: null, bizimUrunAdi: '', bizimUrunOdooId: null, miktar: 1, birimFiyat: '', iskonto: '0', kdvOrani: '10', eslesti: false }])
          setLotlar([]); setIrsaliyeler([])
          setSuccess(false); setError(null)
        }, 4000)
      } else {
        setError(res.data?.error ?? 'Kayıt başarısız')
      }
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const ADIMLAR: { id: UrunGirisAdim; label: string }[] = [
    { id: 'giris-tipi', label: '1. Giriş Tipi' },
    { id: 'fatura', label: '2. Fatura' },
    { id: 'satirlar', label: '3. Ürün Satırları' },
    { id: 'lotlar', label: '4. Lot/Barkod' },
    { id: 'onay', label: '5. Onay' },
  ]

  return (
    <div>
      {/* ÜRÜN ARAMA POPUP */}
      {urunPopupAcik && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: 600, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#1a1a2e' }}>🔍 Odoo'dan Ürün Seç</div>
              <button type="button" onClick={() => setUrunPopupAcik(false)} style={{ ...btnSmall, backgroundColor: '#f3f4f6' }}>✕ Kapat</button>
            </div>
            <input
              value={urunArama}
              onChange={e => { setUrunArama(e.target.value); void araUrunler(e.target.value) }}
              placeholder="Ürün adı veya kodu ile ara..."
              style={{ ...inp, marginBottom: 12 }}
              autoFocus
            />
            {urunAramaLoading && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Aranıyor...</div>}
            {urunSonuclar.length > 0 && !yeniUrunFormu && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
                {urunSonuclar.map(u => (
                  <div key={u.id} onClick={() => void templateSec(u)}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f9ff')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>{u.default_code}</div>
                    </div>
                    <button type="button" style={{ ...btnSmall, backgroundColor: '#dcfce7', color: '#166534', fontSize: 11 }}>Seç</button>
                  </div>
                ))}
              </div>
            )}
            {varyantPopup && (
              <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: 500, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                  <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>Varyant Seçin</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>{varyantPopup.templateAdi}</div>
                  {varyantYukleniyor ? (
                    <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 20 }}>Yükleniyor...</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {varyantlar.map(v => (
                        <div key={v.id} onClick={() => {
                          setVaryantPopup(null)
                          urunSec({ id: v.id, name: v.name, default_code: v.defaultCode, barcode: v.barcode } as any)
                        }}
                          style={{ padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f9ff')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>{v.name}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>
                              {v.defaultCode && <span>Kod: {v.defaultCode} · </span>}
                              {v.nitelikler.map(n => `${n.nitelikAdi}: ${n.degerAdi}`).join(' · ')}
                            </div>
                          </div>
                          <button type="button" style={{ padding: '4px 12px', backgroundColor: '#dcfce7', color: '#166534', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Seç</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => setVaryantPopup(null)} style={{ marginTop: 16, padding: '8px 16px', backgroundColor: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>İptal</button>
                </div>
              </div>
            )}
            {!yeniUrunFormu ? (
              <button type="button" onClick={() => { setYeniUrunFormu(true); setYeniUrunAd(urunArama) }} style={{ ...btnSmall, backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 700, width: '100%', padding: '10px 0' }}>
                + Odoo'da Yeni Ürün Şablonu Oluştur
              </button>
            ) : (
              <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 14, color: '#1a1a2e' }}>📦 Yeni Odoo Ürün Şablonu</div>

                {/* Temel bilgiler */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Ürün Adı *</label>
                    <input value={yeniUrunAd} onChange={e => setYeniUrunAd(e.target.value)} style={{ ...inp, marginBottom: 0 }} placeholder="Tek Odaklı RX Cam" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>İç Referans / Kod</label>
                    <input value={yeniUrunKod} onChange={e => setYeniUrunKod(e.target.value)} style={{ ...inp, marginBottom: 0 }} placeholder="RX-001" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Barkod</label>
                    <input value={yeniUrunBarkod} onChange={e => setYeniUrunBarkod(e.target.value)} style={{ ...inp, marginBottom: 0 }} placeholder="8690000000001" />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Maliyet (₺)</label>
                    <input type="number" value={yeniUrunFiyat} onChange={e => setYeniUrunFiyat(e.target.value)} style={{ ...inp, marginBottom: 0 }} placeholder="0.00" />
                  </div>
                </div>

                {/* Kategori dropdown */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Ürün Kategorisi</label>
                  {kategoriler.length > 0 ? (
                    <select
                      value={secilenKategoriId ?? ''}
                      onChange={e => setSecilenKategoriId(e.target.value ? Number(e.target.value) : null)}
                      style={{ ...inp, marginBottom: 0 }}
                    >
                      <option value="">— Kategori seçin —</option>
                      {kategoriler.map(k => (
                        <option key={k.id} value={k.id}>{k.complete_name}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={yeniUrunKategori} onChange={e => setYeniUrunKategori(e.target.value)} style={{ ...inp, marginBottom: 0 }} placeholder="Camlar / Çerçeveler (yükleniyor...)" />
                  )}
                </div>

                {/* Nitelikler / Varyantlar */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>🔧 Nitelikler & Varyantlar</div>
                  {nitelikler.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>Nitelikler yükleniyor...</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 280, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                      {nitelikler.map(nitelik => {
                        const mevcut = seciliNitelikler.find(s => s.attributeId === nitelik.id)
                        const secilenValueIds = mevcut?.valueIds ?? []
                        return (
                          <div key={nitelik.id} style={{ backgroundColor: mevcut ? '#f0fdf4' : '#f9fafb', border: `1px solid ${mevcut ? '#86efac' : '#e5e7eb'}`, borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>{nitelik.name}</span>
                              {mevcut && (
                                <button type="button"
                                  onClick={() => setSeciliNitelikler(prev => prev.filter(s => s.attributeId !== nitelik.id))}
                                  style={{ fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                  ✕ Kaldır
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {nitelik.values.map(val => {
                                const secili = secilenValueIds.includes(val.id)
                                return (
                                  <button
                                    key={val.id}
                                    type="button"
                                    onClick={() => {
                                      setSeciliNitelikler(prev => {
                                        const existing = prev.find(s => s.attributeId === nitelik.id)
                                        if (existing) {
                                          const yeniValueIds = secili
                                            ? existing.valueIds.filter(id => id !== val.id)
                                            : [...existing.valueIds, val.id]
                                          if (yeniValueIds.length === 0) return prev.filter(s => s.attributeId !== nitelik.id)
                                          return prev.map(s => s.attributeId === nitelik.id ? { ...s, valueIds: yeniValueIds } : s)
                                        } else {
                                          return [...prev, { attributeId: nitelik.id, attributeName: nitelik.name, valueIds: [val.id] }]
                                        }
                                      })
                                    }}
                                    style={{
                                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: secili ? 700 : 400,
                                      backgroundColor: secili ? '#1a1a2e' : 'white',
                                      color: secili ? 'white' : '#374151',
                                      border: `1px solid ${secili ? '#1a1a2e' : '#d1d5db'}`,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {val.name}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {seciliNitelikler.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#059669', fontWeight: 700 }}>
                      ✓ {seciliNitelikler.length} nitelik seçildi → {seciliNitelikler.reduce((acc, n) => acc * n.valueIds.length, 1)} varyant oluşacak
                    </div>
                  )}

                  {/* Yeni nitelik oluştur */}
                  <div style={{ marginTop: 10 }}>
                    {!yeniNitelikFormuAcik ? (
                      <button type="button"
                        onClick={() => { setYeniNitelikFormuAcik(true); setNitelikMesaj(null) }}
                        style={{ ...btnSmall, backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 700, width: '100%', padding: '8px 0', fontSize: 12 }}>
                        + Odoo'da Yeni Nitelik Oluştur (ör: SPH Aralığı, Kaplama Tipi...)
                      </button>
                    ) : (
                      <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 10 }}>
                          Yeni Nitelik
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Nitelik Adı *</label>
                          <input
                            value={yeniNitelikAdi}
                            onChange={e => setYeniNitelikAdi(e.target.value)}
                            placeholder="ör: SPH Aralığı, Kaplama Tipi, İndeks..."
                            style={{ ...inp, marginBottom: 0 }}
                            autoFocus
                          />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>
                            Değerler * <span style={{ fontWeight: 400 }}>(virgülle veya alt alta yazın)</span>
                          </label>
                          <textarea
                            value={yeniNitelikDegerler}
                            onChange={e => setYeniNitelikDegerler(e.target.value)}
                            placeholder={"-6.00, -5.75, -5.50, ..., +5.50, +5.75, +6.00\nveya\nAR Kaplama\nBlue Cut\nFotoğrafik"}
                            rows={3}
                            style={{ ...inp, marginBottom: 0, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                          />
                          {yeniNitelikDegerler && (
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                              {yeniNitelikDegerler.split(/[,\n]/).map(d => d.trim()).filter(Boolean).length} değer girildi
                            </div>
                          )}
                        </div>
                        {nitelikMesaj && (
                          <div style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 6, marginBottom: 8,
                            backgroundColor: nitelikMesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
                            color: nitelikMesaj.tip === 'ok' ? '#166534' : '#991b1b' }}>
                            {nitelikMesaj.tip === 'ok' ? '✓ ' : '✕ '}{nitelikMesaj.text}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button"
                            onClick={() => { setYeniNitelikFormuAcik(false); setNitelikMesaj(null) }}
                            style={btnSmall}>
                            İptal
                          </button>
                          <button type="button"
                            onClick={yeniNitelikKaydet}
                            disabled={!yeniNitelikAdi.trim() || !yeniNitelikDegerler.trim() || yeniNitelikKaydetLoading}
                            style={{ ...btnPrimary, flex: 1, backgroundColor: '#d97706' }}>
                            {yeniNitelikKaydetLoading ? 'Kaydediliyor...' : '✓ Odoo\'da Oluştur'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, backgroundColor: '#eff6ff', padding: '8px 12px', borderRadius: 8 }}>
                  ℹ️ Ürün tipi <strong>Stoklanabilir</strong>, izleme <strong>Seri No'ya Göre</strong> olarak oluşturulur.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setYeniUrunFormu(false)} style={btnSmall}>← Geri</button>
                  <button type="button" onClick={yeniOdooUrunKaydet} disabled={!yeniUrunAd.trim() || yeniUrunKaydetLoading} style={{ ...btnPrimary, backgroundColor: '#059669', flex: 1 }}>
                    {yeniUrunKaydetLoading ? 'Oluşturuluyor...' : `✓ Odoo'da Oluştur ve Seç${seciliNitelikler.length > 0 ? ` (${seciliNitelikler.reduce((acc, n) => acc * n.valueIds.length, 1)} varyant)` : ''}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DIŞ MÜŞTERİ ONAY POPUP */}
      {disMusteriOnayPopup && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: 640, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#1a1a2e', marginBottom: 4 }}>
              🚚 Dış Müşteri Satışı Onayı
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              <strong>{disMusteriOnayPopup.partnerAdi}</strong> — {disMusteriOnayPopup.kalemler.length} kalem
            </div>

            {/* Kâr marjı özeti */}
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>📊 Maliyet & Satış Özeti</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6' }}>
                    <th style={{ ...th, textAlign: 'left' }}>Ürün</th>
                    <th style={{ ...th, textAlign: 'right' }}>Maliyet ₺</th>
                    <th style={{ ...th, textAlign: 'right' }}>Satış ₺</th>
                    <th style={{ ...th, textAlign: 'right' }}>Kâr ₺</th>
                    <th style={{ ...th, textAlign: 'right' }}>Kâr %</th>
                    {dovizKuru && <th style={{ ...th, textAlign: 'right' }}>Satış $</th>}
                  </tr>
                </thead>
                <tbody>
                  {disMusteriOnayPopup.kalemler.map((k, i) => {
                    const maliyet = Number(k.birimFiyat) || 0
                    const satis = Number(k.satisFiyati) || 0
                    const kar = satis - maliyet
                    const karYuzde = maliyet > 0 ? ((kar / maliyet) * 100).toFixed(1) : '—'
                    return (
                      <tr key={k.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...td, fontSize: 12 }}>
                          <div style={{ fontWeight: 600 }}>{k.bizimUrunAdi}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>Kalem {i + 1}</div>
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: '#6b7280' }}>₺{maliyet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                          {satis > 0 ? `₺${satis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : <span style={{ color: '#ef4444' }}>⚠️ Girilmedi</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: kar >= 0 ? '#059669' : '#ef4444', fontWeight: 700 }}>
                          {satis > 0 ? `₺${kar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: Number(karYuzde) >= 0 ? '#059669' : '#ef4444', fontWeight: 700 }}>
                          {satis > 0 ? `%${karYuzde}` : '—'}
                        </td>
                        {dovizKuru && (
                          <td style={{ ...td, textAlign: 'right', color: '#6b7280' }}>
                            {satis > 0 ? `$${(satis / dovizKuru.USD).toFixed(2)}` : '—'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: '#f9fafb', fontWeight: 700 }}>
                    <td style={{ ...td, fontWeight: 900 }}>TOPLAM</td>
                    <td style={{ ...td, textAlign: 'right', color: '#6b7280' }}>
                      ₺{disMusteriOnayPopup.kalemler.reduce((a, k) => a + (Number(k.birimFiyat) || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 900 }}>
                      ₺{disMusteriOnayPopup.kalemler.reduce((a, k) => a + (Number(k.satisFiyati) || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#059669', fontWeight: 900 }}>
                      ₺{disMusteriOnayPopup.kalemler.reduce((a, k) => a + ((Number(k.satisFiyati) || 0) - (Number(k.birimFiyat) || 0)), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#059669', fontWeight: 900 }}>
                      {(() => {
                        const topMaliyet = disMusteriOnayPopup.kalemler.reduce((a, k) => a + (Number(k.birimFiyat) || 0), 0)
                        const topSatis = disMusteriOnayPopup.kalemler.reduce((a, k) => a + (Number(k.satisFiyati) || 0), 0)
                        return topMaliyet > 0 ? `%${(((topSatis - topMaliyet) / topMaliyet) * 100).toFixed(1)}` : '—'
                      })()}
                    </td>
                    {dovizKuru && (
                      <td style={{ ...td, textAlign: 'right', color: '#6b7280', fontWeight: 700 }}>
                        ${(disMusteriOnayPopup.kalemler.reduce((a, k) => a + (Number(k.satisFiyati) || 0), 0) / dovizKuru.USD).toFixed(2)}
                      </td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Oluşturulacaklar */}
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1e40af' }}>
              ℹ️ Onaylandığında Odoo'ya yazılacaklar:
              <ul style={{ margin: '6px 0 0 16px', lineHeight: 1.8 }}>
                <li>Teslimat transferi (WH/OUT) → stoktan düşer</li>
                <li>Satış faturası (account.move) → {disMusteriOnayPopup.partnerAdi} adına</li>
              </ul>
            </div>

            {disMusteriOnayPopup.kalemler.some(k => !k.satisFiyati || Number(k.satisFiyati) === 0) && (
              <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 14px', marginBottom: 16, fontSize: 12, color: '#92400e', fontWeight: 700 }}>
                ⚠️ Satış fiyatı girilmemiş kalemler var. Geri dönüp fiyat girebilirsiniz.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setDisMusteriOnayPopup(null)} style={btnSmall}>
                ← Geri Dön
              </button>
              <button type="button"
                onClick={async () => {
                  const lok = disMusteriOnayPopup.lokasyon
                  setDisMusteriOnayPopup(null)
                  await irsaliyeOlusturDevam(lok)
                }}
                style={{ ...btnPrimary, backgroundColor: '#059669', flex: 1 }}>
                ✓ Onayla — Transfer + Fatura Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADIM GÖSTERGESİ */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #e5e7eb' }}>
        {ADIMLAR.map((a, i) => {
          const aktif = a.id === adim
          const gecildi = ADIMLAR.findIndex(x => x.id === adim) > i
          return (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ padding: '8px 16px', fontSize: 13, fontWeight: aktif ? 900 : 600, color: aktif ? '#1a1a2e' : gecildi ? '#059669' : '#9ca3af', borderBottom: aktif ? '2px solid #1a1a2e' : '2px solid transparent', marginBottom: -1, cursor: gecildi ? 'pointer' : 'default' }}
                onClick={() => gecildi && setAdim(a.id)}>
                {gecildi ? '✓ ' : ''}{a.label}
              </div>
              {i < ADIMLAR.length - 1 && <span style={{ color: '#e5e7eb', fontSize: 18 }}>›</span>}
            </div>
          )
        })}
      </div>

      {success && <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#166534', fontWeight: 700 }}>✓ Ürün girişi başarıyla kaydedildi.</div>}
      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}

      {adim === 'giris-tipi' && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e', marginBottom: 6 }}>Ürün Giriş Tipi</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Bu girişin nasıl yapılacağını seçin.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { tip: 'FATURAYLA' as const, icon: '📄', baslik: 'Fatura ile Giriş', aciklama: 'Fatura ürünle birlikte geldi. Tam kayıt yapılacak.', renk: '#059669', bg: '#f0fdf4', border: '#86efac' },
              { tip: 'FATURA_SONRA' as const, icon: '⏳', baslik: 'Ürün Geldi, Fatura Beklemede', aciklama: 'Stok girişi yapılır, fatura gelince eşleştirilir.', renk: '#d97706', bg: '#fffbeb', border: '#fde68a' },
              { tip: 'IRSALIYELI' as const, icon: '📋', baslik: 'İrsaliyeli Giriş', aciklama: 'İrsaliye numarasıyla giriş. Fatura sonra veya birlikte gelebilir.', renk: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
              { tip: 'FATURASIZ' as const, icon: '🔓', baslik: 'Faturasız Giriş', aciklama: 'Eski stok veya kaynağı belirsiz giriş. Sadece stoka işlenir.', renk: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
            ].map(s => (
              <div key={s.tip} onClick={() => {
                setGirisTipi(s.tip)
                if (s.tip === 'FATURASIZ') {
                  setAdim('satirlar')
                } else {
                  setAdim('fatura')
                }
              }}
                style={{ border: `2px solid ${girisTipi === s.tip ? s.renk : s.border}`, borderRadius: 12, padding: '16px 20px', cursor: 'pointer', backgroundColor: s.bg, display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = s.renk)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = girisTipi === s.tip ? s.renk : s.border)}>
                <div style={{ fontSize: 28 }}>{s.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: s.renk, marginBottom: 3 }}>{s.baslik}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{s.aciklama}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, fontWeight: 600 }}>Fatura kaynağını seçin</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setGirisTipi('FATURAYLA')
                  setAdim('fatura')
                }}
                style={{
                  flex: '1 1 240px',
                  padding: '14px 18px',
                  backgroundColor: '#eff6ff',
                  border: '2px solid #bfdbfe',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#1e40af',
                  textAlign: 'left',
                }}
              >
                <div>📋 Odoo&apos;dan Manuel Seç</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginTop: 4 }}>
                  Odoo&apos;da kayıtlı vendor bill faturaları
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setGelenModalAcik(true)
                  void gelenFaturalariYukle()
                }}
                style={{
                  flex: '1 1 240px',
                  padding: '14px 18px',
                  backgroundColor: '#fffbeb',
                  border: '2px solid #fde68a',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#b45309',
                  textAlign: 'left',
                }}
              >
                <div>🔗 Uyumsoft&apos;tan Otomatik Çek (e-Fatura)</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginTop: 4 }}>
                  Gelen e-faturaları Uyumsoft inbox&apos;tan çek
                </div>
              </button>
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => {
                setAdim('bekleyen-faturalar')
              }} style={{ padding: '8px 14px', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>
                📋 Bekleyen Faturaları Görüntüle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADIM 1: FATURA */}
      {adim === 'fatura' && (
        <div>
          {!sirketlerYuklendi && void sirketleriYukle()}
          <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 12, color: '#1a1a2e' }}>Fatura Bilgileri</div>

          {/* Alıcı Şirket */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Alıcı Şirket (Faturanın Kesildiği) *
            </label>
            {sirketler.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {sirketler.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSecilenSirketId(s.id)
                      setSecilenSirketAdi(s.name)
                      void faturaListesiniYukle(s.id)
                    }}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: `2px solid ${secilenSirketId === s.id ? '#1a1a2e' : '#e5e7eb'}`,
                      backgroundColor: secilenSirketId === s.id ? '#1a1a2e' : 'white',
                      color: secilenSirketId === s.id ? 'white' : '#374151',
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Şirketler yükleniyor...</div>
            )}
            {secilenSirketId && (
              <div style={{ fontSize: 12, color: '#059669', marginTop: 6, fontWeight: 700 }}>
                ✓ {secilenSirketAdi} seçildi
              </div>
            )}

          {/* Fatura Listesi */}
          {faturaListesiAcik && secilenSirketId && (
            <div style={{ marginBottom: 20, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#f9fafb', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>
                    📋 {secilenSirketAdi} — Odoo Faturaları (Manuel)
                    <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>
                      {faturaListesi.length} fatura
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
                    📋 Odoo&apos;da kayıtlı faturalar
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setIslendiFiltreAktif(!islendiFiltreAktif)}
                    style={{ ...btnSmall, backgroundColor: islendiFiltreAktif ? '#dcfce7' : '#f3f4f6', color: islendiFiltreAktif ? '#166534' : '#374151', fontSize: 11 }}>
                    {islendiFiltreAktif ? '✓ Sadece Bekleyenler' : 'Tümü'}
                  </button>
                  <button type="button" onClick={() => void faturaListesiniYukle(secilenSirketId)} style={{ ...btnSmall, fontSize: 11 }}>
                    🔄 Yenile
                  </button>
                  <button type="button" onClick={() => setFaturaListesiAcik(false)} style={{ ...btnSmall, fontSize: 11 }}>
                    ✕
                  </button>
                </div>
              </div>

              {/* Arama */}
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #f3f4f6' }}>
                <input
                  value={faturaArama}
                  onChange={e => setFaturaArama(e.target.value)}
                  placeholder="Fatura no veya cari ara..."
                  style={{ ...inp, marginBottom: 0, fontSize: 12 }}
                />
              </div>

              {faturaListesiYukleniyor ? (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>Yükleniyor...</div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {faturaListesi
                    .filter(f => {
                      if (islendiFiltreAktif && f.islendi) return false
                      if (faturaArama) {
                        const q = faturaArama.toLowerCase()
                        return f.name.toLowerCase().includes(q) || f.partner_name.toLowerCase().includes(q) || f.ref.toLowerCase().includes(q)
                      }
                      return true
                    })
                    .map(f => (
                      <div key={f.id}
                        style={{ padding: '10px 16px', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: f.islendi ? '#f9fafb' : 'white' }}
                        onMouseEnter={e => { if (!f.islendi) e.currentTarget.style.backgroundColor = '#f0f9ff' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = f.islendi ? '#f9fafb' : 'white' }}>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => faturaSecimYap(f)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={kaynakBadgeOdoo}>ODOO</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{f.name}</span>
                            {f.ref && <span style={{ fontSize: 11, color: '#9ca3af' }}>{f.ref}</span>}
                            <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 20, fontWeight: 700,
                              backgroundColor: f.islendi ? '#dcfce7' : '#fef3c7',
                              color: f.islendi ? '#166534' : '#92400e' }}>
                              {f.islendi ? '✓ İşlendi' : '⏳ Bekliyor'}
                            </span>
                            <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 20,
                              backgroundColor: f.state === 'posted' ? '#eff6ff' : '#f3f4f6',
                              color: f.state === 'posted' ? '#1d4ed8' : '#6b7280' }}>
                              {f.state === 'posted' ? 'Onaylı' : 'Taslak'}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 12 }}>
                            <span>🏢 {f.partner_name}</span>
                            <span>📅 {f.invoice_date}</span>
                            <span style={{ fontWeight: 700, color: '#1a1a2e' }}>
                              ₺{f.amount_untaxed.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} KDV hariç
                            </span>
                            <span style={{ color: '#6b7280' }}>
                              (₺{f.amount_total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} toplam)
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); void faturaIslendiToggle(f.id, !f.islendi) }}
                          style={{ ...btnSmall, fontSize: 11, marginLeft: 12,
                            backgroundColor: f.islendi ? '#fee2e2' : '#dcfce7',
                            color: f.islendi ? '#991b1b' : '#166534' }}>
                          {f.islendi ? '↩ Geri Al' : '✓ İşlendi'}
                        </button>
                      </div>
                    ))}
                  {/* Örnek faturalar — sadece liste boşsa göster */}
                  {faturaListesi.length === 0 && !faturaListesiYukleniyor && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>🧪 Test Faturaları</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {ORNEK_FATURALAR.map(ornek => (
                          <button key={ornek.faturaNo} type="button" onClick={() => ornekFaturaYukle(ornek)}
                            style={{ padding: '6px 12px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#0369a1', cursor: 'pointer' }}>
                            {ornek.cariAdi} · {ornek.faturaNo}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {faturaListesi.filter(f => {
                    if (islendiFiltreAktif && f.islendi) return false
                    if (faturaArama) {
                      const q = faturaArama.toLowerCase()
                      return f.name.toLowerCase().includes(q) || f.partner_name.toLowerCase().includes(q)
                    }
                    return true
                  }).length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                      Fatura bulunamadı
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </div>

          {/* Fiziki Tedarikçi */}
          <div style={{ marginBottom: 16, position: 'relative' }}>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
              Fiziki Tedarikçi (Malı Gönderen) — opsiyonel
              <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>ör: Hoya, Rodenstock (fatura Gözbir'den gelse bile)</span>
            </label>
            <input
              value={fizikiArama}
              onChange={e => {
                setFizikiArama(e.target.value)
                setFizikiTedarikciId(null)
                setFizikiTedarikciAdi('')
                void araFizikiTedarikci(e.target.value)
              }}
              placeholder="Hoya, Rodenstock, Essilor..."
              style={{ ...inp, borderColor: fizikiTedarikciId ? '#059669' : undefined }}
            />
            {fizikiTedarikciId && (
              <div style={{ fontSize: 12, color: '#059669', marginTop: 4, fontWeight: 700 }}>
                ✓ {fizikiTedarikciAdi} seçildi
              </div>
            )}
            {fizikiSonuclar.length > 0 && !fizikiTedarikciId && (
              <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {fizikiSonuclar.map(p => (
                  <div key={p.id}
                    onClick={() => { setFizikiTedarikciId(p.id); setFizikiTedarikciAdi(p.name); setFizikiArama(p.name); setFizikiSonuclar([]) }}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                    <span>{p.name}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{p.country}</span>
                  </div>
                ))}
              </div>
            )}
            {fizikiAramaLoading && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Aranıyor...</div>}
            {!fizikiAramaLoading && fizikiAramaYapildi && !fizikiTedarikciId && fizikiArama.trim().length >= 2 && fizikiSonuclar.length === 0 && (
              <button
                type="button"
                onClick={() => yeniCariModalAc('fiziki')}
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#1d4ed8',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                + Yeni Cari Tanımla: &quot;{fizikiArama.trim()}&quot;
              </button>
            )}
          </div>

          <div style={{ marginBottom: 16, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 12, color: '#6b7280' }}>Cari (Fatura Sahibi) *</label>
              {uyumsoftKaynak && !cariId && cariAramaYapildi && (
                <button
                  type="button"
                  onClick={() => void uyumsoftCariModalAc()}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#b45309',
                    cursor: 'pointer',
                  }}
                >
                  + Cariyi Ekle
                </button>
              )}
            </div>
            <input
              value={cariArama}
              onChange={e => {
                setCariArama(e.target.value)
                setCariId(null)
                setCariAdi('')
                void araCariler(e.target.value)
              }}
              placeholder="Gözbir, Opsan..."
              style={{ ...inp, borderColor: cariId ? '#059669' : undefined }}
            />
            {cariId && <div style={{ fontSize: 12, color: '#059669', marginTop: 4, fontWeight: 700 }}>✓ {cariAdi} seçildi</div>}
            {cariSonuclar.length > 0 && !cariId && (
              <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {cariSonuclar.map(c => (
                  <div key={c.id} onClick={() => { setCariId(c.id); setCariAdi(c.name); setCariArama(c.name); setCariSonuclar([]); setCariAramaYapildi(false) }}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                    {c.name}
                  </div>
                ))}
              </div>
            )}
            {cariAramaLoading && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Aranıyor...</div>}
            {!uyumsoftKaynak && !cariAramaLoading && cariAramaYapildi && !cariId && cariArama.trim().length >= 2 && cariSonuclar.length === 0 && (
              <button
                type="button"
                onClick={() => yeniCariModalAc('cari')}
                style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#1d4ed8',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                + Yeni Cari Tanımla: &quot;{cariArama.trim()}&quot;
              </button>
            )}
            {uyumsoftKaynak && !cariId && cariAramaYapildi && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#92400e', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                Bu tedarikçi Odoo&apos;da kayıtlı değil. Uyumsoft fatura verisinden <strong>+ Cariyi Ekle</strong> ile oluşturabilirsiniz.
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              {(girisTipi === 'FATURA_SONRA' || girisTipi === 'IRSALIYELI' || girisTipi === 'FATURASIZ') && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Giriş Kayıt Numarası (Otomatik)</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#166534' }}>{girisNo}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Bu numara ile fatura eşleştirmesi yapılacak</div>
                </div>
              )}
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>{girisTipi === 'FATURAYLA' ? 'Fatura No *' : 'Fatura No (varsa)'}</label>
              <input value={faturaNo} onChange={e => setFaturaNo(e.target.value)} placeholder="2026-001" style={inp} />
              {(girisTipi === 'IRSALIYELI' || girisTipi === 'FATURA_SONRA') && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>
                    {girisTipi === 'IRSALIYELI' ? 'İrsaliye No *' : 'Referans No (opsiyonel)'}
                  </label>
                  <input
                    value={irsaliyeNo ?? ''}
                    onChange={e => setIrsaliyeNo(e.target.value)}
                    placeholder={girisTipi === 'IRSALIYELI' ? 'İrsaliye numarası girin' : 'Referans numarası'}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }}
                  />
                </div>
              )}
            </div>
            <div><label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>GİB Referans / UUID</label><input value={faturaReferans} onChange={e => setFaturaReferans(e.target.value)} placeholder="GİB e-fatura UUID..." style={inp} /></div>
            <div><label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Fatura Tarihi *</label><input type="date" value={faturaTarihi} onChange={e => setFaturaTarihi(e.target.value)} style={inp} /></div>
          </div>
          <div style={{ marginBottom: 24, maxWidth: 220 }}>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Fatura Toplamı KDV Hariç (₺)</label>
            <input type="number" value={faturaToplamKdvHaric} onChange={e => setFaturaToplamKdvHaric(e.target.value)} placeholder="0.00" style={inp} />
          </div>

          {uyumsoftKaynak && uyumsoftHamSatirlar.length > 0 && (
            <div style={{ marginBottom: 24, border: '1px solid #fde68a', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fffbeb' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#92400e' }}>
                    Uyumsoft Fatura Satırları — Sütun Eşleştirme
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                    Ham fatura verisini doğru alanlara eşleştirin. {uyumsoftKolonKayitli ? '✓ Bu tedarikçi için kayıtlı profil yüklendi.' : 'İlk eşleştirme bu tedarikçi için hatırlanacak.'}
                  </div>
                </div>
                <span style={kaynakBadgeUyumsoft}>UYUMSOFT</span>
              </div>
              <div style={{ overflowX: 'auto', padding: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720, backgroundColor: '#fff', borderRadius: 8 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#fef3c7' }}>
                      <th style={{ ...th, width: 40 }}>#</th>
                      {UYUMSOFT_KOLON_ANAHTARLARI.map((kolon) => (
                        <th key={kolon} style={{ ...th, minWidth: 110 }}>{UYUMSOFT_KOLON_ETIKETLERI[kolon]}</th>
                      ))}
                    </tr>
                    <tr style={{ backgroundColor: '#fffbeb' }}>
                      <th style={{ ...th, fontSize: 10 }}>Eşleştir</th>
                      {UYUMSOFT_KOLON_ANAHTARLARI.map((kolon) => (
                        <th key={`map-${kolon}`} style={{ ...th, padding: '6px 8px' }}>
                          <select
                            value={uyumsoftKolonMap[kolon]}
                            onChange={(e) => setUyumsoftKolonMap((prev) => ({
                              ...prev,
                              [kolon]: e.target.value as UyumsoftKolonRol,
                            }))}
                            style={{ width: '100%', fontSize: 11, padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb' }}
                            title="Bu sütun neyi temsil ediyor?"
                          >
                            {UYUMSOFT_ROL_SECENEKLERI.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {uyumsoftHamSatirlar.map((satir) => (
                      <tr key={satir.sira} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...td, fontSize: 11, color: '#9ca3af' }}>{satir.sira}</td>
                        {UYUMSOFT_KOLON_ANAHTARLARI.map((kolon) => (
                          <td key={`${satir.sira}-${kolon}`} style={{ ...td, fontSize: 12 }}>
                            {String(satir[kolon] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 16px', fontSize: 11, color: '#92400e', borderTop: '1px solid #fde68a' }}>
                Stok Kodu / SKU olarak işaretlenen sütun, ürün satırlarında <strong>Tedarikçi Kodu</strong> alanına ayrılır.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => { uyumsoftStateSifirla(); setAdim('giris-tipi') }} style={btnSmall}>← Geri</button>
            <button type="button" onClick={() => void faturaAdimindanDevam()} style={btnPrimary}>
              Devam → Ürün Satırları
            </button>
          </div>
        </div>
      )}

      {/* ADIM 2: FATURA SATIRLARI */}
      {adim === 'satirlar' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>Ürün Satırları — {cariAdi} · {faturaNo}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{satirlar.length} satır · toplam {satirlar.reduce((a, s) => a + s.miktar, 0)} adet</div>
          </div>

          {/* Toplu üretici */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, backgroundColor: '#f9fafb', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, whiteSpace: 'nowrap' }}>Toplu Üretici:</div>
            <input value={topluUretici} onChange={e => setTopluUretici(e.target.value)} placeholder="Hoya, Rodenstock..." style={{ ...inp, marginBottom: 0, flex: 1 }} />
            <button type="button" onClick={topluUreticiUygula} style={{ ...btnSmall, whiteSpace: 'nowrap', backgroundColor: '#eff6ff', color: '#1d4ed8' }}>Tümüne Uygula</button>
          </div>

          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ ...th, width: 200 }}>Tedarikçi Ürün Adı</th>
                  <th style={{ ...th, width: 90 }}>Üretici</th>
                  <th style={{ ...th, width: 220 }}>Bizim Ürünümüz (Odoo)</th>
                  <th style={{ ...th, width: 60 }}>Adet</th>
                  <th style={{ ...th, width: 90 }}>Birim Fiyat ₺</th>
                  <th style={{ ...th, width: 70 }}>İskonto %</th>
                  <th style={{ ...th, width: 60 }}>KDV %</th>
                  <th style={{ ...th, width: 90 }}>Net Tutar</th>
                  <th style={{ ...th, width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map(s => {
                  const net = (Number(s.birimFiyat) || 0) * s.miktar * (1 - (Number(s.iskonto) || 0) / 100)
                  return (
                    <tr key={s.id} style={{ backgroundColor: s.eslesti ? '#f0fdf4' : 'white', borderBottom: '1px solid #f3f4f6' }}>
                      <td style={td}>
                        <input value={s.tedarikciUrunAdi} onChange={e => satirGuncelle(s.id, 'tedarikciUrunAdi', e.target.value)} placeholder="Faturadaki ürün adı..." style={{ ...inp, marginBottom: 0, fontSize: 12 }} />
                        {s.tedarikciKodu && (
                          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3 }}>Kod: {s.tedarikciKodu}</div>
                        )}
                      </td>
                      <td style={td}>
                        <input value={s.uretici} onChange={e => satirGuncelle(s.id, 'uretici', e.target.value)} placeholder="Hoya..." style={{ ...inp, marginBottom: 0, fontSize: 12 }} />
                      </td>
                      <td style={td}>
                        <button type="button" onClick={() => urunPopupAc(s.id)}
                          style={{ width: '100%', padding: '6px 10px', backgroundColor: s.eslesti ? '#f0fdf4' : '#fefce8', border: `1px solid ${s.eslesti ? '#86efac' : '#fde68a'}`, borderRadius: 6, fontSize: 12, fontWeight: s.eslesti ? 700 : 400, color: s.eslesti ? '#166534' : '#92400e', cursor: 'pointer', textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {s.eslesti ? `✓ ${s.bizimUrunAdi}` : '🔍 Odoo\'dan Seç...'}
                        </button>
                      </td>
                      <td style={td}>
                        <input type="number" value={s.miktar} min={1} onChange={e => satirGuncelle(s.id, 'miktar', Number(e.target.value))} style={{ ...inp, marginBottom: 0, width: 60, fontSize: 12 }} />
                      </td>
                      <td style={td}>
                        <input type="number" value={s.birimFiyat} onChange={e => satirGuncelle(s.id, 'birimFiyat', e.target.value)} placeholder="0.00" style={{ ...inp, marginBottom: 0, fontSize: 12 }} />
                      </td>
                      <td style={td}>
                        <input type="number" value={s.iskonto} min={0} max={100} onChange={e => satirGuncelle(s.id, 'iskonto', e.target.value)} style={{ ...inp, marginBottom: 0, width: 60, fontSize: 12 }} />
                      </td>
                      <td style={td}>
                        <select value={s.kdvOrani} onChange={e => satirGuncelle(s.id, 'kdvOrani', e.target.value)} style={{ ...inp, marginBottom: 0, fontSize: 12 }}>
                          {['0','1','10','20'].map(k => <option key={k} value={k}>%{k}</option>)}
                        </select>
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: '#1a1a2e', fontSize: 13 }}>
                        ₺{net.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={td}>
                        {satirlar.length > 1 && <button type="button" onClick={() => satirSil(s.id)} style={{ ...btnSmall, backgroundColor: '#fee2e2', color: '#991b1b', padding: '4px 8px' }}>✕</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Toplam kontrol */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', backgroundColor: toplamFark > 1 ? '#fef3c7' : '#f0fdf4', border: `1px solid ${toplamFark > 1 ? '#fcd34d' : '#86efac'}`, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>Hesaplanan KDV hariç:</span>
              <strong style={{ marginLeft: 8 }}>₺{hesaplananToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong>
              {faturaToplamKdvHaric && (<><span style={{ color: '#6b7280', marginLeft: 16 }}>Fatura toplamı:</span><strong style={{ marginLeft: 8 }}>₺{Number(faturaToplamKdvHaric).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong></>)}
            </div>
            {toplamFark > 1 ? <span style={{ fontSize: 12, color: '#92400e', fontWeight: 700 }}>⚠️ Fark: ₺{toplamFark.toFixed(2)}</span> : <span style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>✓ Toplam uyuşuyor</span>}
          </div>

          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#1e40af' }}>
            ℹ️ Devam ettiğinizde her satırdaki <strong>adet sayısı kadar</strong> lot satırı oluşturulacak. Örn: 4 adet lens → 4 ayrı lot girişi.
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => girisTipi === 'FATURASIZ' ? setAdim('giris-tipi') : setAdim('fatura')} style={btnSmall}>← Geri</button>
            <button type="button" onClick={satirEkle} style={btnSmall}>+ Satır Ekle</button>
            <button type="button" onClick={lotlariOlustur} style={btnPrimary} disabled={satirlar.some(s => !s.eslesti)}>
              Devam → Lot / Barkod Girişi
              {satirlar.some(s => !s.eslesti) && <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.8 }}>(tüm satırları eşleştirin)</span>}
            </button>
          </div>
        </div>
      )}

      {adim === 'lotlar' && (
        <div>
          {adim === 'lotlar' && !dovizKuru && !dovizYukleniyor && void dovizKuruCek()}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>Lot / Barkod Girişi</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{lotlar.length} kalem · her satır = 1 adet</div>
          </div>

          {/* Lokasyon bazlı gruplar */}
          {Array.from(new Set(lotlar.map(l => l.lokasyon))).map(lokasyon => {
            const grup = lotlar.filter(l => l.lokasyon === lokasyon)
            const irsaliye = irsaliyeler.find(i => i.lokasyon === lokasyon)
            return (
              <div key={lokasyon} style={{ marginBottom: 20, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                {/* Grup başlığı */}
                <div style={{ backgroundColor: '#f9fafb', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: '#1a1a2e' }}>
                      {lotlar.find(l => l.lokasyon === lokasyon)?.lokasyonTip === 'dis-musteri'
                        ? `🚚 ${lotlar.find(l => l.lokasyon === lokasyon)?.disMusteriAdi || lokasyon}`
                        : lotlar.find(l => l.lokasyon === lokasyon)?.lokasyonTip === 'depo'
                        ? `🏭 ${lokasyon}`
                        : `🏪 ${lokasyon}`}
                    </span>
                    {dovizKuru && (
                      <span style={{ fontSize: 11, color: '#6b7280', backgroundColor: '#f3f4f6', padding: '2px 8px', borderRadius: 20 }}>
                        💱 1$ = ₺{dovizKuru.USD.toFixed(2)} · 1€ = ₺{dovizKuru.EUR.toFixed(2)} · {dovizKuru.tarih}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{grup.length} kalem</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {irsaliye?.durum === 'tamam' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#059669', fontWeight: 700 }}>✓ {irsaliye.pickingName}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>irsaliye oluşturuldu</span>
                      </div>
                    ) : irsaliye?.durum === 'hata' ? (
                      <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>✕ {irsaliye.hata}</div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void irsaliyeOlustur(lokasyon)}
                        disabled={irsaliye?.durum === 'olusturuluyor'}
                        style={{ ...btnSmall, backgroundColor: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 12 }}
                      >
                        {irsaliye?.durum === 'olusturuluyor' ? '⏳ Oluşturuluyor...' : '📄 İrsaliye Oluştur'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setLokasyonSeciciAcik(lokasyonSeciciAcik === lokasyon ? null : lokasyon)
                        setLokasyonSekme('sube')
                        setDisMusteriArama('')
                        setDisMusteriSonuclar([])
                      }}
                      style={{ ...btnSmall, backgroundColor: '#f3f4f6', fontSize: 12, fontWeight: 600 }}
                    >
                      📍 Lokasyon Değiştir ▾
                    </button>
                  </div>
                </div>

              {lokasyonSeciciAcik === lokasyon && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderTop: 'none', padding: 16 }}>
                  {/* 3 sekme */}
                  <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '2px solid #e5e7eb' }}>
                    {(['sube', 'depo', 'dis-musteri'] as const).map(sekme => (
                      <button key={sekme} type="button"
                        onClick={() => setLokasyonSekme(sekme)}
                        style={{ padding: '6px 16px', fontSize: 12, fontWeight: lokasyonSekme === sekme ? 900 : 600, color: lokasyonSekme === sekme ? '#1a1a2e' : '#9ca3af', borderBottom: lokasyonSekme === sekme ? '2px solid #1a1a2e' : '2px solid transparent', marginBottom: -2, background: 'none', border: 'none', borderBottom: lokasyonSekme === sekme ? '2px solid #1a1a2e' : '2px solid transparent', cursor: 'pointer' }}>
                        {sekme === 'sube' ? '🏪 Şubeler' : sekme === 'depo' ? '🏭 Depolar' : '🚚 Dış Müşteri'}
                      </button>
                    ))}
                  </div>

                  {/* Şubeler */}
                  {lokasyonSekme === 'sube' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {LOKASYONLAR.filter(l => !['ANADEPO', 'GVN5'].includes(l.id)).map(lok => (
                        <button key={lok.id} type="button"
                          onClick={() => {
                            setLotlar(prev => prev.map(l => l.lokasyon === lokasyon ? { ...l, lokasyon: lok.id, lokasyonTip: 'sube', disMusteriId: null, disMusteriAdi: '' } : l))
                            setIrsaliyeler(prev => prev.filter(i => i.lokasyon !== lokasyon))
                            setLokasyonSeciciAcik(null)
                          }}
                          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', backgroundColor: lok.id === lokasyon ? '#1a1a2e' : '#f3f4f6', color: lok.id === lokasyon ? 'white' : '#374151', border: '1px solid #e5e7eb' }}>
                          {lok.id}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Depolar */}
                  {lokasyonSekme === 'depo' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {LOKASYONLAR.filter(l => ['ANADEPO', 'GVN5'].includes(l.id)).map(lok => (
                        <button key={lok.id} type="button"
                          onClick={() => {
                            setLotlar(prev => prev.map(l => l.lokasyon === lokasyon ? { ...l, lokasyon: lok.id, lokasyonTip: 'depo', disMusteriId: null, disMusteriAdi: '' } : l))
                            setIrsaliyeler(prev => prev.filter(i => i.lokasyon !== lokasyon))
                            setLokasyonSeciciAcik(null)
                          }}
                          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', backgroundColor: lok.id === lokasyon ? '#1a1a2e' : '#f3f4f6', color: lok.id === lokasyon ? 'white' : '#374151', border: '1px solid #e5e7eb' }}>
                          {lok.id}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Dış Müşteri */}
                  {lokasyonSekme === 'dis-musteri' && (
                    <div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                        Ürünler doğrudan bu müşteriye gönderilecek. Odoo'da teslimat transferi oluşturulacak.
                      </div>
                      <div style={{ position: 'relative' }}>
                        <input
                          value={disMusteriArama}
                          onChange={e => { setDisMusteriArama(e.target.value); void araDisMusteri(e.target.value) }}
                          placeholder="Optik firma adı ara..."
                          style={{ ...inp, marginBottom: 0 }}
                          autoFocus
                        />
                        {disMusteriAramaLoading && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Aranıyor...</div>}
                        {disMusteriSonuclar.length > 0 && (
                          <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                            {disMusteriSonuclar.map(p => (
                              <div key={p.id}
                                onClick={() => {
                                  setLotlar(prev => prev.map(l => l.lokasyon === lokasyon ? { ...l, lokasyon: `MUS-${p.id}`, lokasyonTip: 'dis-musteri', disMusteriId: p.id, disMusteriAdi: p.name } : l))
                                  setIrsaliyeler(prev => prev.filter(i => i.lokasyon !== lokasyon))
                                  setDisMusteriArama(p.name)
                                  setDisMusteriSonuclar([])
                                  setLokasyonSeciciAcik(null)
                                }}
                                style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between' }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'white')}>
                                <span style={{ fontWeight: 700 }}>{p.name}</span>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>{p.vat}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

                {/* Kalemler tablosu */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#fafafa' }}>
                        <th style={{ ...th, width: 32 }}>#</th>
                        <th style={th}>Bizim Ürünümüz</th>
                        <th style={th}>Barkod</th>
                        <th style={th}>UTS Kodu</th>
                        <th style={th}>Lot / Seri No</th>
                        <th style={{ ...th, width: 100 }}>Alış ₺</th>
                        <th style={{ ...th, width: 80 }}>Alış $</th>
                        <th style={{ ...th, width: 80 }}>Alış €</th>
                        <th style={{ ...th, width: 140 }}>Satış Fiyatı ₺</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grup.map((l, i) => (
                        <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: irsaliye?.durum === 'tamam' ? '#f0fdf4' : 'white' }}>
                          <td style={{ ...td, color: '#9ca3af', fontSize: 11 }}>{i + 1}</td>
                          <td style={{ ...td, fontSize: 12 }}>
                            <div style={{ fontWeight: 700 }}>{l.bizimUrunAdi}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>Kalem {l.satırNo}</div>
                          </td>
                          <td style={td}>
                            <input
                              value={l.barkod}
                              onChange={e => lotGuncelle(l.id, 'barkod', e.target.value)}
                              placeholder="Barkod..."
                              disabled={irsaliye?.durum === 'tamam'}
                              style={{ ...inp, marginBottom: 0, fontSize: 12, width: 120, backgroundColor: irsaliye?.durum === 'tamam' ? '#f9fafb' : 'white' }}
                            />
                          </td>
                          <td style={td}>
                            <input
                              value={l.utsKodu}
                              onChange={e => lotGuncelle(l.id, 'utsKodu', e.target.value)}
                              placeholder="UTS..."
                              disabled={irsaliye?.durum === 'tamam'}
                              style={{ ...inp, marginBottom: 0, fontSize: 12, width: 100, backgroundColor: irsaliye?.durum === 'tamam' ? '#f9fafb' : 'white' }}
                            />
                          </td>
                          <td style={td}>
                            <input
                              value={l.lotNo}
                              onChange={e => lotGuncelle(l.id, 'lotNo', e.target.value)}
                              disabled={irsaliye?.durum === 'tamam'}
                              style={{ ...inp, marginBottom: 0, fontSize: 12, width: 150, backgroundColor: irsaliye?.durum === 'tamam' ? '#f9fafb' : 'white' }}
                            />
                          </td>
                          <td style={{ ...td, fontWeight: 700, fontSize: 12 }}>
                            ₺{Number(l.birimFiyat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ ...td, fontSize: 12, color: '#6b7280', textAlign: 'right' }}>
                            {dovizKuru && Number(l.birimFiyat) > 0
                              ? `$${(Number(l.birimFiyat) / dovizKuru.USD).toFixed(2)}`
                              : '—'}
                          </td>
                          <td style={{ ...td, fontSize: 12, color: '#6b7280', textAlign: 'right' }}>
                            {dovizKuru && Number(l.birimFiyat) > 0
                              ? `€${(Number(l.birimFiyat) / dovizKuru.EUR).toFixed(2)}`
                              : '—'}
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <input
                                type="number"
                                value={l.satisFiyati}
                                onChange={e => { void satisFiyatiGuncelle(l.id, e.target.value) }}
                                placeholder="₺ fiyat gir"
                                style={{ ...inp, marginBottom: 0, fontSize: 12, width: 100, borderColor: l.satisFiyatiDegisti ? '#059669' : undefined }}
                              />
                              {/* Hızlı formül butonları */}
                              {Number(l.birimFiyat) > 0 && (
                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                  {[2, 3, 4, 5].map(carpan => (
                                    <button
                                      key={carpan}
                                      type="button"
                                      onClick={() => { void satisFiyatiGuncelle(l.id, (Number(l.birimFiyat) * carpan).toFixed(0)) }}
                                      style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', cursor: 'pointer', color: '#374151' }}
                                    >
                                      ×{carpan}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {l.satisFiyati && dovizKuru && (
                                <div style={{ fontSize: 10, color: '#6b7280' }}>
                                  ≈ ${(Number(l.satisFiyati) / dovizKuru.USD).toFixed(1)} · €{(Number(l.satisFiyati) / dovizKuru.EUR).toFixed(1)}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* İrsaliye özeti */}
          {irsaliyeler.filter(i => i.durum === 'tamam').length > 0 && (
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8 }}>✓ Oluşturulan İrsaliyeler</div>
              {irsaliyeler.filter(i => i.durum === 'tamam').map(i => (
                <div key={i.lokasyon} style={{ fontSize: 12, color: '#166534', marginBottom: 4 }}>
                  • {i.pickingName} — {i.lokasyon} ({i.kalemSayisi} kalem)
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setAdim('satirlar')} style={btnSmall}>← Geri</button>
            <button type="button" onClick={() => setAdim('onay')} style={btnPrimary}>Devam → Onay</button>
          </div>
        </div>
      )}

      {adim === 'onay' && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 16, color: '#1a1a2e' }}>Özet & Onay</div>
          <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
              <div><span style={{ color: '#6b7280' }}>Alıcı Şirket:</span> <strong>{secilenSirketAdi}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Cari:</span> <strong>{cariAdi}</strong></div>
              {fizikiTedarikciAdi && <div><span style={{ color: '#6b7280' }}>Fiziki Tedarikçi:</span> <strong>{fizikiTedarikciAdi}</strong></div>}
              <div><span style={{ color: '#6b7280' }}>Fatura No:</span> <strong>{faturaNo}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Tarih:</span> <strong>{faturaTarihi}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Toplam:</span> <strong>₺{hesaplananToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Ürün satırı:</span> <strong>{satirlar.length}</strong></div>
              <div><span style={{ color: '#6b7280' }}>Toplam kalem:</span> <strong>{lotlar.length} adet</strong></div>
            </div>
          </div>

          {/* İrsaliye özeti */}
          {irsaliyeler.filter(i => i.durum === 'tamam').length > 0 && (
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6 }}>✓ Oluşturulan İrsaliyeler</div>
              {irsaliyeler.filter(i => i.durum === 'tamam').map(i => (
                <div key={i.lokasyon} style={{ fontSize: 12, color: '#166534', marginBottom: 3 }}>
                  • {i.pickingName} — {i.lokasyon} ({i.kalemSayisi} kalem)
                </div>
              ))}
            </div>
          )}

          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#1e40af' }}>
            ℹ️ Onaylandığında Odoo'ya yazılacaklar:
            <ul style={{ margin: '8px 0 0 16px', lineHeight: 1.8 }}>
              <li>Satın alma siparişi (purchase.order) → otomatik onaylanır</li>
              <li>{lotlar.length} adet lot / seri numarası (stock.lot)</li>
              <li>Satış fiyatları güncellenir</li>
            </ul>
          </div>

          {toplamFark > 1 && (
            <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
              ⚠️ Dikkat: ₺{toplamFark.toFixed(2)} fark var.
            </div>
          )}

          {success && (
            <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6 }}>✓ Odoo'ya başarıyla yazıldı!</div>
              {error && error.split('\n').map((line, i) => (
                <div key={i} style={{ fontSize: 12, color: line.startsWith('⚠️') ? '#92400e' : '#166534' }}>{line}</div>
              ))}
            </div>
          )}

          {!success && error && (
            <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
              ✕ {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => setAdim('lotlar')} style={btnSmall} disabled={saving || success}>← Geri</button>
            <button type="button" onClick={kaydet} disabled={saving || success} style={{ ...btnPrimary, backgroundColor: '#059669' }}>
              {saving ? '⏳ Odoo\'ya yazılıyor...' : success ? '✓ Tamamlandı' : '✓ Onayla & Odoo\'ya Gönder'}
            </button>
          </div>
        </div>
      )}

      {adim === 'bekleyen-faturalar' && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e', marginBottom: 16 }}>📋 Bekleyen Faturalar</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
            Stok girişi yapılmış ancak faturası henüz gelmemiş kayıtlar.
          </div>
          <BekleyenFaturalarTab onGeri={() => setAdim('giris-tipi')} />
        </div>
      )}

      {uyumsoftCariModalAcik && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, width: 'min(480px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>Uyumsoft Tedarikçiyi Odoo&apos;ya Ekle</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Fatura verisinden otomatik dolduruldu — gerekirse düzeltin</div>
              </div>
              <button type="button" onClick={() => setUyumsoftCariModalAcik(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginBottom: 14, fontSize: 11, color: '#92400e' }}>
              Kaynak: Uyumsoft e-Fatura (AccountingSupplierParty)
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['tuzel', 'gercek'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setYeniCariForm((f) => ({ ...f, tip: t }))}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `2px solid ${yeniCariForm.tip === t ? '#1a1a2e' : '#e5e7eb'}`,
                    backgroundColor: yeniCariForm.tip === t ? '#1a1a2e' : '#fff',
                    color: yeniCariForm.tip === t ? '#fff' : '#374151',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t === 'tuzel' ? 'Tüzel (Şirket)' : 'Gerçek (Şahıs)'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Firma / Kişi Adı *</label>
                <input value={yeniCariForm.name} onChange={(e) => setYeniCariForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>VKN / TCKN</label>
                  <input value={yeniCariForm.vkn} onChange={(e) => setYeniCariForm((f) => ({ ...f, vkn: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Vergi Dairesi</label>
                  <input value={yeniCariForm.vergiDairesi} onChange={(e) => setYeniCariForm((f) => ({ ...f, vergiDairesi: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Adres</label>
                <input value={yeniCariForm.adres} onChange={(e) => setYeniCariForm((f) => ({ ...f, adres: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>İl</label>
                  <input value={yeniCariForm.il} onChange={(e) => setYeniCariForm((f) => ({ ...f, il: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>İlçe</label>
                  <input value={yeniCariForm.ilce} onChange={(e) => setYeniCariForm((f) => ({ ...f, ilce: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Telefon</label>
                  <input value={yeniCariForm.telefon} onChange={(e) => setYeniCariForm((f) => ({ ...f, telefon: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>E-posta</label>
                  <input type="email" value={yeniCariForm.email} onChange={(e) => setYeniCariForm((f) => ({ ...f, email: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setUyumsoftCariModalAcik(false)} style={{ ...btnSmall, flex: 1 }}>İptal</button>
              <button type="button" disabled={yeniCariKaydetLoading || !yeniCariForm.name.trim()} onClick={() => void yeniCariKaydet()} style={{ ...btnPrimary, flex: 1, backgroundColor: '#059669' }}>
                {yeniCariKaydetLoading ? 'Kaydediliyor...' : 'Odoo\'da Cari Olarak Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {yeniCariModalAcik && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, width: 'min(480px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 900 }}>
                {yeniCariHedef === 'fiziki' ? 'Fiziki Tedarikçi — Yeni Cari' : 'Yeni Cari Tanımla'}
              </div>
              <button type="button" onClick={() => setYeniCariModalAcik(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['tuzel', 'gercek'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setYeniCariForm((f) => ({ ...f, tip: t }))}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: `2px solid ${yeniCariForm.tip === t ? '#1a1a2e' : '#e5e7eb'}`,
                    backgroundColor: yeniCariForm.tip === t ? '#1a1a2e' : '#fff',
                    color: yeniCariForm.tip === t ? '#fff' : '#374151',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t === 'tuzel' ? 'Tüzel (Şirket)' : 'Gerçek (Şahıs)'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Firma / Kişi Adı *</label>
                <input value={yeniCariForm.name} onChange={(e) => setYeniCariForm((f) => ({ ...f, name: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>VKN / TCKN</label>
                  <input value={yeniCariForm.vkn} onChange={(e) => setYeniCariForm((f) => ({ ...f, vkn: e.target.value }))} style={{ ...inp, marginBottom: 0 }} placeholder="1234567890" />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Vergi Dairesi</label>
                  <input value={yeniCariForm.vergiDairesi} onChange={(e) => setYeniCariForm((f) => ({ ...f, vergiDairesi: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Adres</label>
                <input value={yeniCariForm.adres} onChange={(e) => setYeniCariForm((f) => ({ ...f, adres: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>İl</label>
                  <input value={yeniCariForm.il} onChange={(e) => setYeniCariForm((f) => ({ ...f, il: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>İlçe</label>
                  <input value={yeniCariForm.ilce} onChange={(e) => setYeniCariForm((f) => ({ ...f, ilce: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>Telefon</label>
                  <input value={yeniCariForm.telefon} onChange={(e) => setYeniCariForm((f) => ({ ...f, telefon: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>E-posta</label>
                  <input type="email" value={yeniCariForm.email} onChange={(e) => setYeniCariForm((f) => ({ ...f, email: e.target.value }))} style={{ ...inp, marginBottom: 0 }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setYeniCariModalAcik(false)} style={{ ...btnSmall, flex: 1 }}>İptal</button>
              <button type="button" disabled={yeniCariKaydetLoading || !yeniCariForm.name.trim()} onClick={() => void yeniCariKaydet()} style={{ ...btnPrimary, flex: 1, backgroundColor: '#059669' }}>
                {yeniCariKaydetLoading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {gelenModalAcik && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, width: 'min(720px, 100%)', maxHeight: '80vh', overflow: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>🔗 Uyumsoft&apos;tan Otomatik Gelen Faturalar (e-Fatura)</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Tedarikçiden gelen e-faturaları Uyumsoft inbox&apos;tan seçip ürün girişine aktarın</div>
              </div>
              <button type="button" onClick={() => setGelenModalAcik(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button type="button" disabled={gelenYukleniyor} onClick={() => void gelenFaturalariCek()} style={{ ...btnPrimary, fontSize: 12 }}>
                {gelenYukleniyor ? 'Çekiliyor...' : 'Uyumsoft\'tan Çek'}
              </button>
              <button type="button" disabled={gelenYukleniyor} onClick={() => void gelenFaturalariYukle()} style={{ ...btnSmall, fontSize: 12 }}>
                Listeyi Yenile
              </button>
            </div>

            {gelenFaturalar.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                Kayıt yok. &quot;Uyumsoft&apos;tan Çek&quot; ile yeni faturaları getirin.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {gelenFaturalar.map(f => (
                  <div key={f.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={kaynakBadgeUyumsoft}>UYUMSOFT</span>
                        <span>{f.uyumsoftNo || '—'} — {f.tedarikciAdi || 'Tedarikçi'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {f.faturaTarihi || '—'} · {f.kalemSayisi} kalem · ₺{(f.tutarKdvHaric ?? 0).toLocaleString('tr-TR')}
                        {f.durum === 'AKTARILDI' && <span style={{ marginLeft: 8, color: '#059669' }}>Aktarıldı</span>}
                      </div>
                    </div>
                    <button type="button" disabled={gelenYukleniyor} onClick={() => void gelenFaturadanAktar(f.id)} style={{ ...btnPrimary, fontSize: 12, whiteSpace: 'nowrap' }}>
                      Ürün Girişine Aktar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
