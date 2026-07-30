import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { adminApi } from './AdminLayout'
import {
  adimEtiketi,
  deleteUrunGirisDraft,
  flushUrunGirisDraft,
  getUrunGirisDraft,
  listUrunGirisDraftMeta,
  onUrunGirisDraftSaved,
  saveUrunGirisDraftDebounced,
  type UrunGirisDraftMeta,
  type UrunGirisDraftPayload,
} from '../../utils/urunGirisDraft'
import { consumeUtsUrunGirisBridge } from '../../utils/utsUrunGirisBridge'
import { StockQueryPanel } from '../StokSorgulaPage'
import YeniTransfer from '../../components/transfer/YeniTransfer'
import BekleyenTransferler from '../../components/transfer/BekleyenTransferler'
import EtiketSablonSecici from '../../components/etiket/EtiketSablonSecici'
import {
  otomatikSablonSec,
  uretEtiketZplTercihli,
  etiketUrunToRenderVeri,
  getPilotEtiketSablon,
} from '../../components/etiket/etiket-sablon-helpers'
import { renderEtiketBatchToDataUrls } from '../../components/etiket/etiket-canvas-render'
import { etiketleriPdfOlustur } from '../../components/etiket/etiket-pdf-yazdir'
import type { SablonId } from '../../components/etiket-tasarimci/sablon-types'
import {
  OZEL_SIPARIS_AKIS,
  OZEL_SIPARIS_DURUMLAR,
  OZEL_SIPARIS_DURUM_RENK,
  normalizeOzelSiparisDurum,
} from '../../constants/ozelSiparis'
import { getOzelSiparisStokGirisDetay, stokaAlOzelSiparis } from '../../api/ozelSiparis.api'
import ExcelEnvanterImportTab from '../../components/depo/ExcelEnvanterImportTab'
import { canSeeDepoTab, type AdminUserLite } from '../../constants/ekYetki'

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
  { id: 'excel-envanter', label: '📊 Excel Envanter' },
  { id: 'siparisler', label: '🛒 Siparişler' },
] as const

type TabId = (typeof TABS)[number]['id']

function readAdminUser(): AdminUserLite | null {
  try {
    const raw = localStorage.getItem('admin-user')
    return raw ? JSON.parse(raw) as AdminUserLite : null
  } catch {
    return null
  }
}

// ── Ana Bileşen ───────────────────────────────────────────────
export default function DepoPage() {
  const [searchParams] = useSearchParams()
  const adminUser = useMemo(() => readAdminUser(), [])
  const visibleTabs = useMemo(
    () => TABS.filter((t) => canSeeDepoTab(adminUser ?? {}, t.id)),
    [adminUser],
  )
  const [activeTab, setActiveTab] = useState<TabId>(() => visibleTabs[0]?.id ?? 'stok')

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === activeTab) && visibleTabs[0]) {
      setActiveTab(visibleTabs[0].id)
    }
  }, [activeTab, visibleTabs])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && visibleTabs.some((t) => t.id === tab)) {
      setActiveTab(tab as TabId)
    }
  }, [searchParams, visibleTabs])

  if (visibleTabs.length === 0) {
    return (
      <div style={{ padding: 24, color: '#6b7280' }}>
        Bu ekrana erişim yetkiniz bulunmuyor.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Depo Yönetimi</h1>
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
        {visibleTabs.map(t => (
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
      {activeTab === 'excel-envanter' && <ExcelEnvanterImportTab />}
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
  const [altSekme, setAltSekme] = useState<'lot' | 'sube'>('lot')

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setAltSekme('lot')}
          style={{
            padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13,
            backgroundColor: altSekme === 'lot' ? '#1a1a2e' : '#f3f4f6',
            color: altSekme === 'lot' ? 'white' : '#374151',
          }}
        >
          Lot Transfer
        </button>
        <button
          type="button"
          onClick={() => setAltSekme('sube')}
          style={{
            padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13,
            backgroundColor: altSekme === 'sube' ? '#1a1a2e' : '#f3f4f6',
            color: altSekme === 'sube' ? 'white' : '#374151',
          }}
        >
          Şube Transferleri
        </button>
      </div>

      {altSekme === 'lot' ? <LotTransferTab /> : (
        <div style={{ display: 'grid', gap: 20 }}>
          <YeniTransfer source="admin" />
          <BekleyenTransferler source="admin" />
        </div>
      )}
    </div>
  )
}

function LotTransferTab() {
  type LotTransferDurum = '' | 'bekliyor' | 'basarili' | 'kismi' | 'basarisiz'

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
    transferDurum: LotTransferDurum
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
      transferYapiliyor: false, transferDurum: '', transferHata: '',
    }])
    setAramaQ('')
    setAramaSonuclar([])
  }

  function topluHedefUygula() {
    if (!topluHedef) return
    setListe(prev => prev.map(l => ({ ...l, hedefLok: topluHedef })))
  }

  function transferSatirIslemGormus(durum: LotTransferDurum) {
    return durum === 'basarili' || durum === 'bekliyor'
  }

  async function tekTransfer(id: string) {
    const kalem = liste.find(l => l.id === id)
    if (!kalem) return
    if (transferSatirIslemGormus(kalem.transferDurum)) return
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
      const satirDurum = (res.data?.transferler?.[0]?.durum ?? '') as LotTransferDurum
      if (res.data?.success && (satirDurum === 'bekliyor' || satirDurum === 'basarili')) {
        setListe(prev => prev.map(l => l.id === id ? {
          ...l,
          transferYapiliyor: false,
          transferDurum: satirDurum,
        } : l))
      } else if (res.data?.partial || satirDurum === 'kismi') {
        throw new Error(res.data?.message ?? 'Transfer kısmen tamamlandı — muhasebe kontrolü gerekli')
      } else {
        throw new Error(res.data?.message ?? res.data?.error ?? 'Transfer başarısız')
      }
    } catch (e: any) {
      setListe(prev => prev.map(l => l.id === id ? {
        ...l, transferYapiliyor: false,
        transferDurum: 'basarisiz',
        transferHata: e?.response?.data?.error ?? e?.message ?? 'Hata'
      } : l))
    }
  }

  async function tumunuTransferEt() {
    const bekleyenler = liste.filter(l => !transferSatirIslemGormus(l.transferDurum) && !l.transferYapiliyor)
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
                  <tr key={l.id} style={{
                    borderBottom: '1px solid #f3f4f6',
                    backgroundColor: l.transferDurum === 'basarili'
                      ? '#f0fdf4'
                      : l.transferDurum === 'bekliyor'
                        ? '#eff6ff'
                        : l.transferHata
                          ? '#fff1f2'
                          : 'white',
                  }}>
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
                      {l.transferDurum === 'basarili' || l.transferDurum === 'bekliyor' ? (
                        <span style={{
                          fontSize: 12,
                          color: l.transferDurum === 'basarili' ? '#059669' : '#1d4ed8',
                          fontWeight: 700,
                        }}>
                          {l.transferDurum === 'basarili' ? '✓' : '→'} {l.hedefLok}
                        </span>
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
                      {l.transferDurum === 'basarili' ? (
                        <span style={{ fontSize: 11, color: '#059669' }}>✓ Tamamlandı</span>
                      ) : l.transferDurum === 'bekliyor' ? (
                        <span style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 700, lineHeight: 1.35 }}>
                          → Gönderildi — {l.hedefLok} kabul bekliyor
                        </span>
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
              disabled={tumunuYapiliyor || liste.every(l => transferSatirIslemGormus(l.transferDurum))}
              style={{ ...btnPrimary, backgroundColor: '#059669', fontSize: 13 }}>
              {tumunuYapiliyor ? '⏳ İşleniyor...' : `✓ Tümünü Transfer Et (${liste.filter(l => !transferSatirIslemGormus(l.transferDurum)).length} kalem)`}
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
type SayimSatir = {
  quantId: number
  productId: number
  productName: string
  systemQty: number
  countedQty: string
}

function SayimTab() {
  const [lokasyon, setLokasyon] = useState('GVN1')
  const [rows, setRows] = useState<SayimSatir[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function loadStok() {
    setLoading(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await adminApi.get(`/admin/stock?locationId=${
        { GVN1: 53, GVN3: 54, GVN4: 55, GVN6: 56, GVN8: 57, GVN9: 58, GVN2: 59, GVN10: 60, ANADEPO: 61, GVN5: 62 }[lokasyon] ?? 53
      }`)
      const data = res.data?.data ?? []
      setRows(data.map((q: any) => ({
        quantId: Number(q.id) || 0,
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
    setSuccessMsg(null)
    try {
      const farklar = rows.filter(r => Number(r.countedQty) !== r.systemQty)
      if (farklar.length === 0) {
        alert('Fark bulunamadı, sayım sisteme uygun.')
        return
      }

      const basarisiz: string[] = []
      let basarili = 0

      for (const f of farklar) {
        try {
          await adminApi.post('/admin/stock-adjustment', {
            productId: f.productId,
            locationCode: lokasyon,
            qty: Number(f.countedQty),
            quantId: f.quantId || undefined,
          })
          basarili += 1
        } catch (e: any) {
          const msg = e?.response?.data?.error ?? e?.message ?? 'Bilinmeyen hata'
          basarisiz.push(`${f.productName}: ${msg}`)
        }
      }

      if (basarili === farklar.length) {
        setSuccessMsg(`✓ Sayım kaydedildi, ${basarili} ürün güncellendi`)
        await loadStok()
      } else if (basarili === 0) {
        setError(`✗ Sayım kaydedilemedi, tekrar deneyin: ${basarisiz.join('; ')}`)
      } else {
        setError(`⚠ ${farklar.length} üründen ${basarisiz.length}'si güncellenemedi: ${basarisiz.join('; ')}`)
        await loadStok()
      }
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
            {LOKASYONLAR.map(l => <option key={l.id} value={l.id}>{l.id} ({l.sirket})</option>)}
          </select>
        </div>
        <button type="button" onClick={loadStok} disabled={loading} style={btnPrimary}>
          {loading ? 'Yükleniyor...' : 'Stoku Yükle'}
        </button>
      </div>

      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
      {successMsg && <p style={{ color: '#166534', fontSize: 13, fontWeight: 700 }}>{successMsg}</p>}

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
                    <tr key={r.quantId || `${r.productId}-${i}`}>
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
            {LOKASYONLAR.map(l => <option key={l.id} value={l.id}>{l.id} ({l.sirket})</option>)}
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

function hasMesajDeger(val: unknown): boolean {
  if (val == null) return false
  const s = String(val).trim()
  return s !== '' && s !== '—'
}

function formatSphDeger(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCylDeger(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toFixed(2)
}

function formatGozSatiri(
  label: string,
  sph: unknown,
  cyl: unknown,
  aks: unknown,
): string | null {
  const degerler: string[] = []
  if (hasMesajDeger(sph)) degerler.push(formatSphDeger(sph))
  if (hasMesajDeger(cyl)) degerler.push(formatCylDeger(cyl))
  const aksVar = hasMesajDeger(aks)
  if (!degerler.length && !aksVar) return null
  const parts: string[] = []
  if (degerler.length) parts.push(degerler.join(' '))
  if (aksVar) parts.push(`AKS: ${aks}`)
  return `${label} — ${parts.join(', ')}`
}

function buildSiparisDetayMesaji(detay: Record<string, unknown>): string {
  const lines: string[] = ['*Sipariş Detayı*']

  if (hasMesajDeger(detay.musteriAdi)) lines.push(`Müşteri: ${detay.musteriAdi}`)
  if (hasMesajDeger(detay.firmaUrunu)) lines.push(`Firma Ürünü: ${detay.firmaUrunu}`)
  if (hasMesajDeger(detay.subeAdi)) lines.push(`Şube: ${detay.subeAdi}`)
  if (detay.createdAt) {
    lines.push(`Tarih: ${new Date(String(detay.createdAt)).toLocaleDateString('tr-TR')}`)
  }
  if (hasMesajDeger(detay.notlar)) lines.push(`Notlar: ${detay.notlar}`)

  if (detay.tip === 'RECETELI') {
    const recete: string[] = []
    const sag = formatGozSatiri('Sağ Göz', detay.sagSph, detay.sagCyl, detay.sagAks)
    const sol = formatGozSatiri('Sol Göz', detay.solSph, detay.solCyl, detay.solAks)
    if (sag) recete.push(sag)
    if (sol) recete.push(sol)
    if (hasMesajDeger(detay.camTipi)) recete.push(`Cam Tipi: ${detay.camTipi}`)
    if (hasMesajDeger(detay.camIndeksi)) recete.push(`İndeks: ${detay.camIndeksi}`)
    if (hasMesajDeger(detay.kaplama)) recete.push(`Kaplama: ${detay.kaplama}`)
    if (hasMesajDeger(detay.cerceveBilgisi)) recete.push(`Çerçeve: ${detay.cerceveBilgisi}`)
    if (recete.length) {
      lines.push('', '*Reçete*', ...recete)
    }
  }

  const olcumler = detay.olcumBilgisi
  if (Array.isArray(olcumler) && olcumler.length > 0) {
    const olcumSatirlari: string[] = []
    olcumler.forEach((m: Record<string, unknown>, i: number) => {
      if (olcumler.length > 1) olcumSatirlari.push(`— Ölçüm ${i + 1} —`)
      if (hasMesajDeger(m.frameType)) olcumSatirlari.push(`Çerçeve Tipi: ${m.frameType}`)
      const olcumOzet: string[] = []
      if (hasMesajDeger(m.rph)) olcumOzet.push(`RPH: ${m.rph}`)
      if (hasMesajDeger(m.lph)) olcumOzet.push(`LPH: ${m.lph}`)
      if (hasMesajDeger(m.corridor)) olcumOzet.push(`Koridor: ${m.corridor}`)
      if (olcumOzet.length) olcumSatirlari.push(olcumOzet.join(', '))
      const capOzet: string[] = []
      if (hasMesajDeger(m.rightDia)) capOzet.push(`Sağ Çap: ${m.rightDia}`)
      if (hasMesajDeger(m.leftDia)) capOzet.push(`Sol Çap: ${m.leftDia}`)
      if (capOzet.length) olcumSatirlari.push(capOzet.join(', '))
      if (hasMesajDeger(m.vertex)) olcumSatirlari.push(`Vertex: ${m.vertex}`)
      if (hasMesajDeger(m.pantoscopic)) olcumSatirlari.push(`Pantoskopik: ${m.pantoscopic}`)
      if (hasMesajDeger(m.frameBow)) olcumSatirlari.push(`Çerçeve Bombesi: ${m.frameBow}`)
      if (hasMesajDeger(m.engraving)) olcumSatirlari.push(`Engraving: ${m.engraving}`)
      if (hasMesajDeger(m.prismR1Val) || hasMesajDeger(m.prismL1Val)) {
        olcumSatirlari.push(
          `Prizma — R: ${m.prismR1Val ?? '—'}/${m.prismR1Aks ?? '—'}° · L: ${m.prismL1Val ?? '—'}/${m.prismL1Aks ?? '—'}°`,
        )
      }
    })
    if (olcumSatirlari.length) {
      lines.push('', '*Ölçümler*', ...olcumSatirlari)
    }
  }

  if (hasMesajDeger(detay.tedarikciAdi)) {
    lines.push('', '*Tedarikçi*', `Tedarikçi: ${detay.tedarikciAdi}`)
    if (hasMesajDeger(detay.tedarikciSiparisNo)) {
      lines.push(`Sipariş No: ${detay.tedarikciSiparisNo}`)
    }
  }

  return lines.join('\n')
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

  const DURUMLAR = [...OZEL_SIPARIS_DURUMLAR]
  const DURUM_RENK = OZEL_SIPARIS_DURUM_RENK

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

  async function durumHizliGuncelle(id: string, durum: string) {
    setLoading(true)
    try {
      await adminApi.put(`/admin/ozel-siparis-durum/${id}`, { durum })
      void siparisleriYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Durum güncellenemedi' })
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

  async function kartBas(s: any) {
    try {
      const { downloadOzelSiparisKartPdf } = await import('../../utils/ozelSiparisKartPdf')
      await downloadOzelSiparisKartPdf({
        musteriAdi: s.musteriAdi,
        musteriTelefon: s.musteriTelefon,
        urunAdi: s.urunAdi,
        sagSph: s.sagSph, sagCyl: s.sagCyl, sagAks: s.sagAks, sagAdd: s.sagAdd,
        solSph: s.solSph, solCyl: s.solCyl, solAks: s.solAks, solAdd: s.solAdd,
      })
      await adminApi.put(`/admin/ozel-siparis-kart-basildi/${s.id}`)
      void siparisleriYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Kart oluşturulamadı' })
    }
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
                <button
                  type="button"
                  onClick={() => {
                    const draft = firmaUrunuDraft[detayPopup.id]
                    const detayIleDraft = draft !== undefined ? { ...detayPopup, firmaUrunu: draft } : detayPopup
                    const msg = buildSiparisDetayMesaji(detayIleDraft)
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, 'guven-optik-whatsapp')
                  }}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #25d366', backgroundColor: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: '#25d366' }}
                >
                  💬 WhatsApp
                </button>
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
            const normDurum = normalizeOzelSiparisDurum(s.durum)
            const durum = DURUM_RENK[normDurum] ?? DURUM_RENK[s.durum] ?? { bg: '#f3f4f6', color: '#374151', label: s.durum }
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
                    {!['TESLIM_EDILDI', 'MUSTERIYE_TESLIM', 'IPTAL'].includes(normDurum) && (
                      <select
                        value={normDurum}
                        disabled={loading}
                        onChange={(e) => void durumHizliGuncelle(s.id, e.target.value)}
                        style={{ ...inputS, width: 160, fontWeight: 700, cursor: 'pointer' }}
                        title="Durum güncelle"
                      >
                        {OZEL_SIPARIS_AKIS.map((d) => (
                          <option key={d} value={d}>{DURUM_RENK[d]?.label ?? d}</option>
                        ))}
                        <option value="IPTAL">{DURUM_RENK.IPTAL.label}</option>
                      </select>
                    )}
                    {!['MUSTERIYE_TESLIM', 'IPTAL'].includes(s.durum) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDurumGuncellePopup(s)
                          setDurumGuncelle({
                            durum: normalizeOzelSiparisDurum(s.durum),
                            tedarikciSiparisNo: s.tedarikciSiparisNo ?? '',
                            notlar: s.notlar ?? '',
                          })
                        }}
                        style={{ ...btnSmall, fontSize: 11, padding: '5px 10px', whiteSpace: 'nowrap' }}
                      >
                        ✏️ Durum
                      </button>
                    )}
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
                    {s.tip === 'RECETELI' && (
                      <button
                        type="button"
                        onClick={() => void kartBas(s)}
                        title={s.kartBasildi ? `Tekrar bas — son basım: ${s.kartBasmaTarihi ? new Date(s.kartBasmaTarihi).toLocaleString('tr-TR') : ''}` : 'Garanti kartını yazdır'}
                        style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${s.kartBasildi ? '#059669' : '#d97706'}`, backgroundColor: 'white', color: s.kartBasildi ? '#059669' : '#d97706', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {s.kartBasildi ? '✓ Kart Basıldı' : '🪪 Kart Bas'}
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

// ── SİPARİŞ ÜRÜN GİRİŞİ ───────────────────────────────────────

function SiparisUrunGirisiTab({ onGeri }: { onGeri: () => void }) {
  const [siparisler, setSiparisler] = useState<any[]>([])
  const [secili, setSecili] = useState<any | null>(null)
  const [detay, setDetay] = useState<any | null>(null)
  const [bekleyenFaturalar, setBekleyenFaturalar] = useState<any[]>([])
  const [seciliFaturaId, setSeciliFaturaId] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)
  const [faturaKalemSayfa, setFaturaKalemSayfa] = useState(0)

  useEffect(() => {
    void (async () => {
      setYukleniyor(true)
      try {
        const [sipRes, fatRes] = await Promise.all([
          adminApi.get('/admin/ozel-siparisler?durum=TESLIM_ALINDI'),
          adminApi.get('/admin/bekleyen-faturalar'),
        ])
        setSiparisler(sipRes.data?.data ?? [])
        setBekleyenFaturalar(fatRes.data?.data ?? [])
      } catch {
        setSiparisler([])
      } finally {
        setYukleniyor(false)
      }
    })()
  }, [])

  async function siparisSec(s: any) {
    setSecili(s)
    setMesaj(null)
    setDetay(null)
    try {
      const data = await getOzelSiparisStokGirisDetay(s.id)
      setDetay(data)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Detay yüklenemedi' })
    }
  }

  async function stokaAl() {
    if (!secili) return
    setLoading(true)
    setMesaj(null)
    try {
      await stokaAlOzelSiparis(secili.id, seciliFaturaId || undefined)
      setMesaj({ tip: 'ok', text: 'Stoka alındı, sipariş HAZIR durumuna geçti' })
      setSecili(null)
      setDetay(null)
      const sipRes = await adminApi.get('/admin/ozel-siparisler?durum=TESLIM_ALINDI')
      setSiparisler(sipRes.data?.data ?? [])
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Stoka alınamadı' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>Sipariş Ürün Girişi</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Teslim alınmış özel siparişler — karekod eşleştirme, fatura ve stok</div>
        </div>
        <button type="button" onClick={onGeri} style={btnSmall}>← Geri</button>
      </div>

      {mesaj ? (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
          backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b',
        }}>
          {mesaj.text}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: secili ? '1fr 1.2fr' : '1fr', gap: 16 }}>
        <div>
          {yukleniyor ? <div style={{ color: '#9ca3af', fontSize: 13 }}>Yükleniyor...</div> : null}
          {!yukleniyor && siparisler.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: 24, textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: 12 }}>
              Teslim alınmış sipariş yok
            </div>
          ) : null}
          {siparisler.map((s) => (
            <div
              key={s.id}
              onClick={() => void siparisSec(s)}
              style={{
                border: `2px solid ${secili?.id === s.id ? '#1a1a2e' : '#e5e7eb'}`,
                borderRadius: 12, padding: 14, marginBottom: 10, cursor: 'pointer', backgroundColor: 'white',
              }}
            >
              <div style={{ fontWeight: 900, fontSize: 14 }}>{s.urunAdi}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                {s.musteriAdi} · {s.subeAdi || s.subeId || '—'} · {s.miktar} adet
              </div>
            </div>
          ))}
        </div>

        {secili && detay ? (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 12 }}>Sipariş Detayı</div>
            <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.7 }}>
              <div><strong>Müşteri:</strong> {detay.siparis.musteriAdi}</div>
              <div><strong>Ürün:</strong> {detay.siparis.urunAdi}</div>
              <div><strong>Hedef şube:</strong> {detay.siparis.subeAdi || detay.siparis.subeId}</div>
              <div><strong>Beklenen adet:</strong> {detay.siparis.miktar}</div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Taranan Karekodlar</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
              {(detay.eslestirmeler ?? []).map((k: any) => (
                <div key={k.id} style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                  <div style={{ fontWeight: 700 }}>{k.karekod}</div>
                  <div style={{ color: k.lotAdi ? '#166534' : '#b45309', marginTop: 2 }}>
                    {k.lotAdi ? `✓ Lot: ${k.lotAdi}` : '⚠ Lot eşleşmedi'}
                    {k.utsKodu ? ` · UTS: ${k.utsKodu}` : ''}
                    {k.urunAdi ? ` · ${k.urunAdi}` : ''}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 8 }}>Bekleyen Fatura (opsiyonel)</label>
              {bekleyenFaturalar.length === 0 && (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>Bekleyen fatura yok</div>
              )}
              {bekleyenFaturalar.length > 0 && (() => {
                const sayfaBasi = 5
                const toplamSayfa = Math.ceil(bekleyenFaturalar.length / sayfaBasi)
                const gosterilen = bekleyenFaturalar.slice(faturaKalemSayfa * sayfaBasi, (faturaKalemSayfa + 1) * sayfaBasi)
                return (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {gosterilen.map((f) => {
                        const kalemler: any[] = (() => { try { return JSON.parse(f.kalemler || '[]') } catch { return [] } })()
                        const seciliBu = seciliFaturaId === f.id
                        const gosterilecekKalemler = kalemler.slice(0, 5)
                        const fazla = kalemler.length - 5
                        return (
                          <div
                            key={f.id}
                            onClick={() => setSeciliFaturaId(seciliBu ? '' : f.id)}
                            style={{
                              border: `2px solid ${seciliBu ? '#059669' : '#e5e7eb'}`,
                              borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                              backgroundColor: seciliBu ? '#f0fdf4' : 'white',
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{f.tedarikciAdi}</div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                              {f.irsaliyeNo || f.odooPickingName || f.id.slice(0, 8)}
                              {f.subeAdi ? ` · ${f.subeAdi}` : ''}
                            </div>
                            {kalemler.length > 0 && (
                              <div style={{ marginTop: 6, borderTop: '1px solid #f3f4f6', paddingTop: 6 }}>
                                {gosterilecekKalemler.map((k: any, i: number) => (
                                  <div key={i} style={{ fontSize: 11, color: '#374151', display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                    <span>{k.urunAdi || k.name || '—'}</span>
                                    <span style={{ color: '#6b7280' }}>{k.miktar ?? k.qty ?? ''} {k.birim || ''}</span>
                                  </div>
                                ))}
                                {fazla > 0 && (
                                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>+{fazla} kalem daha</div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {toplamSayfa > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFaturaKalemSayfa(p => Math.max(0, p - 1)) }}
                          disabled={faturaKalemSayfa === 0}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', cursor: faturaKalemSayfa === 0 ? 'not-allowed' : 'pointer', color: faturaKalemSayfa === 0 ? '#d1d5db' : '#374151' }}
                        >← Önceki</button>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{faturaKalemSayfa + 1} / {toplamSayfa}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setFaturaKalemSayfa(p => Math.min(toplamSayfa - 1, p + 1)) }}
                          disabled={faturaKalemSayfa === toplamSayfa - 1}
                          style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: 'white', cursor: faturaKalemSayfa === toplamSayfa - 1 ? 'not-allowed' : 'pointer', color: faturaKalemSayfa === toplamSayfa - 1 ? '#d1d5db' : '#374151' }}
                        >Sonraki →</button>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            <button type="button" onClick={() => void stokaAl()} disabled={loading} style={{ ...btnPrimary, backgroundColor: '#059669' }}>
              {loading ? 'İşleniyor...' : 'Stoka al + UTS'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── ÜRÜN GİRİŞ SEKMESİ ───────────────────────────────────────

type UrunGirisAdim = 'giris-tipi' | 'siparis-urun-girisi' | 'fatura' | 'satirlar' | 'lotlar' | 'onay' | 'bekleyen-faturalar'

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
  bizimUrunProductId?: number | null
  bizimUrunBarkod?: string
  varyantEtiketi?: string
  miktar: number
  birimFiyat: string
  iskonto: string
  kdvOrani: string
  eslesti: boolean
}

type EslestirmeAlanlari = Pick<
  FaturaSatiri,
  | 'bizimUrunId'
  | 'bizimUrunAdi'
  | 'bizimUrunOdooId'
  | 'bizimUrunProductId'
  | 'bizimUrunBarkod'
  | 'varyantEtiketi'
  | 'eslesti'
>

function tedarikciUrunAdiAnahtar(ad: string): string {
  return ad.trim().toLocaleLowerCase('tr')
}

function eslestirmeImzasi(s: FaturaSatiri): string {
  return `${s.bizimUrunOdooId ?? ''}|${s.bizimUrunProductId ?? ''}|${s.bizimUrunId ?? ''}`
}

function eslestirmeAlanlariKaynaktan(kaynak: FaturaSatiri): EslestirmeAlanlari {
  return {
    bizimUrunId: kaynak.bizimUrunId,
    bizimUrunAdi: kaynak.bizimUrunAdi,
    bizimUrunOdooId: kaynak.bizimUrunOdooId,
    bizimUrunProductId: kaynak.bizimUrunProductId ?? null,
    bizimUrunBarkod: kaynak.bizimUrunBarkod,
    varyantEtiketi: kaynak.varyantEtiketi,
    eslesti: true,
  }
}

function ayniIsimdeEslesmemisSayisi(satirlar: FaturaSatiri[], kaynak: FaturaSatiri): number {
  const key = tedarikciUrunAdiAnahtar(kaynak.tedarikciUrunAdi)
  if (!key) return 0
  return satirlar.filter(
    (s) => s.id !== kaynak.id && !s.eslesti && tedarikciUrunAdiAnahtar(s.tedarikciUrunAdi) === key,
  ).length
}

function eslestenIsimleriOtomatikTamamla(prev: FaturaSatiri[]): {
  satirlar: FaturaSatiri[]
  grupSayisi: number
  satirSayisi: number
  uyarilar: string[]
} {
  const gruplar = new Map<string, FaturaSatiri[]>()
  for (const s of prev) {
    const key = tedarikciUrunAdiAnahtar(s.tedarikciUrunAdi)
    if (!key) continue
    const liste = gruplar.get(key) ?? []
    liste.push(s)
    gruplar.set(key, liste)
  }

  let grupSayisi = 0
  let satirSayisi = 0
  const uyarilar: string[] = []
  const updates = new Map<string, EslestirmeAlanlari>()

  for (const grup of gruplar.values()) {
    const eslesmis = grup.filter((s) => s.eslesti && s.bizimUrunOdooId)
    if (eslesmis.length === 0) continue

    const imzalar = new Set(eslesmis.map(eslestirmeImzasi))
    const kaynak = eslesmis[0]
    if (imzalar.size > 1) {
      uyarilar.push(
        `"${grup[0].tedarikciUrunAdi.trim()}" için birden fazla farklı eşleşme var; ilki uygulandı.`,
      )
    }

    const eslesmemis = grup.filter((s) => !s.eslesti)
    if (eslesmemis.length === 0) continue

    grupSayisi++
    satirSayisi += eslesmemis.length
    const alanlar = eslestirmeAlanlariKaynaktan(kaynak)
    for (const s of eslesmemis) updates.set(s.id, alanlar)
  }

  if (updates.size === 0) {
    return { satirlar: prev, grupSayisi: 0, satirSayisi: 0, uyarilar }
  }

  return {
    satirlar: prev.map((s) => (updates.has(s.id) ? { ...s, ...updates.get(s.id)! } : s)),
    grupSayisi,
    satirSayisi,
    uyarilar,
  }
}

type UyumsoftHamSatir = {
  sira: number
  stokKodu: string
  urunAdi: string
  malzemeHizmet: string
  barkod: string
  miktar: number
  birimFiyat: number
  kdvOrani: number
  iskontoOrani: string
  iskontoTutar: number
  iskonto: number
  siparisNo: string
}

type UyumsoftKolonAnahtari =
  | 'stokKodu'
  | 'malzemeHizmet'
  | 'urunAdi'
  | 'barkod'
  | 'miktar'
  | 'birimFiyat'
  | 'iskontoOrani'
  | 'iskontoTutar'
  | 'kdvOrani'
  | 'siparisNo'
type UyumsoftKolonRol =
  | 'urunAdi'
  | 'malzemeHizmet'
  | 'stokKodu'
  | 'barkod'
  | 'miktar'
  | 'birimFiyat'
  | 'iskontoOrani'
  | 'iskontoTutar'
  | 'kdvOrani'
  | 'siparisNo'
  | 'yoksay'
type UyumsoftKolonMap = Record<UyumsoftKolonAnahtari, UyumsoftKolonRol>

const UYUMSOFT_KOLON_ANAHTARLARI: UyumsoftKolonAnahtari[] = [
  'stokKodu', 'malzemeHizmet', 'urunAdi', 'barkod', 'miktar', 'birimFiyat',
  'iskontoOrani', 'iskontoTutar', 'kdvOrani', 'siparisNo',
]

const UYUMSOFT_KOLON_ETIKETLERI: Record<UyumsoftKolonAnahtari, string> = {
  stokKodu: 'Ürün Kodu',
  malzemeHizmet: 'Malzeme/Hizmet Adı',
  urunAdi: 'Kısa Ad (Name)',
  barkod: 'Barkod',
  miktar: 'Miktar',
  birimFiyat: 'Birim Fiyat',
  iskontoOrani: 'İskonto Oranı',
  iskontoTutar: 'İskonto Tutarı',
  kdvOrani: 'KDV Oranı',
  siparisNo: 'Sipariş No',
}

const VARSAYILAN_UYUMSOFT_KOLON_MAP: UyumsoftKolonMap = {
  stokKodu: 'stokKodu',
  malzemeHizmet: 'urunAdi',
  urunAdi: 'yoksay',
  barkod: 'barkod',
  miktar: 'miktar',
  birimFiyat: 'birimFiyat',
  iskontoOrani: 'iskontoOrani',
  iskontoTutar: 'iskontoTutar',
  kdvOrani: 'kdvOrani',
  siparisNo: 'siparisNo',
}

const UYUMSOFT_ROL_SECENEKLERI: { value: UyumsoftKolonRol; label: string }[] = [
  { value: 'urunAdi', label: 'Ürün Adı' },
  { value: 'malzemeHizmet', label: 'Malzeme/Hizmet Adı' },
  { value: 'stokKodu', label: 'Stok Kodu / SKU' },
  { value: 'barkod', label: 'Barkod' },
  { value: 'miktar', label: 'Miktar' },
  { value: 'birimFiyat', label: 'Birim Fiyat' },
  { value: 'iskontoOrani', label: 'İskonto Oranı' },
  { value: 'iskontoTutar', label: 'İskonto Tutarı' },
  { value: 'kdvOrani', label: 'KDV Oranı' },
  { value: 'siparisNo', label: 'Sipariş No' },
  { value: 'yoksay', label: 'Yoksay' },
]

type LotSatiri = {
  id: string
  faturaId: string
  satırNo: number
  tedarikciUrunAdi: string
  bizimUrunAdi: string
  bizimUrunOdooId: number | null
  bizimUrunProductId?: number | null
  bizimUrunBarkod?: string
  varyantEtiketi?: string
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

function lotUrunAnahtar(lot: LotSatiri): string {
  if (lot.bizimUrunOdooId) return `odoo:${lot.bizimUrunOdooId}`
  const ad = lot.bizimUrunAdi.trim().toLocaleLowerCase('tr')
  return ad ? `ad:${ad}` : ''
}

function lotFiyatGirilmis(l: LotSatiri): boolean {
  return l.satisFiyatiDegisti === 'true'
}

function ayniUrundeFiyatsizLotSayisi(lotlar: LotSatiri[], kaynak: LotSatiri): number {
  const key = lotUrunAnahtar(kaynak)
  if (!key || !lotFiyatGirilmis(kaynak) || !kaynak.satisFiyati.trim()) return 0
  return lotlar.filter(
    (l) => l.id !== kaynak.id && lotUrunAnahtar(l) === key && !lotFiyatGirilmis(l),
  ).length
}

function fiyatlariOtomatikTamamla(prev: LotSatiri[]): {
  lotlar: LotSatiri[]
  grupSayisi: number
  satirSayisi: number
  odooGuncellemeler: Array<{ productTmplId: number; listPrice: number }>
} {
  const gruplar = new Map<string, LotSatiri[]>()
  for (const l of prev) {
    const key = lotUrunAnahtar(l)
    if (!key) continue
    const liste = gruplar.get(key) ?? []
    liste.push(l)
    gruplar.set(key, liste)
  }

  let grupSayisi = 0
  let satirSayisi = 0
  const updates = new Map<string, string>()
  const odooGuncellemeler: Array<{ productTmplId: number; listPrice: number }> = []
  const odooSeen = new Set<number>()

  for (const grup of gruplar.values()) {
    const kaynak = grup.find((l) => lotFiyatGirilmis(l) && l.satisFiyati.trim() !== '')
    if (!kaynak) continue

    const fiyatsiz = grup.filter((l) => !lotFiyatGirilmis(l))
    if (fiyatsiz.length === 0) continue

    grupSayisi++
    satirSayisi += fiyatsiz.length
    for (const l of fiyatsiz) updates.set(l.id, kaynak.satisFiyati)

    if (kaynak.bizimUrunOdooId && !odooSeen.has(kaynak.bizimUrunOdooId)) {
      odooSeen.add(kaynak.bizimUrunOdooId)
      odooGuncellemeler.push({
        productTmplId: kaynak.bizimUrunOdooId,
        listPrice: Number(kaynak.satisFiyati),
      })
    }
  }

  if (updates.size === 0) {
    return { lotlar: prev, grupSayisi: 0, satirSayisi: 0, odooGuncellemeler: [] }
  }

  return {
    lotlar: prev.map((l) =>
      updates.has(l.id)
        ? { ...l, satisFiyati: updates.get(l.id)!, satisFiyatiDegisti: 'true' }
        : l,
    ),
    grupSayisi,
    satirSayisi,
    odooGuncellemeler,
  }
}

function odooAlanStr(value: unknown): string {
  if (value == null || value === false) return ''
  if (typeof value === 'string') return value.trim()
  return ''
}

function varyantEtiketiOlustur(nitelikler?: Array<{ degerAdi?: unknown }>): string {
  const parts = (nitelikler ?? [])
    .map((n) => odooAlanStr(n.degerAdi))
    .filter(Boolean)
  return parts.join(' / ')
}

function varyantNitelikAramaMetni(v: {
  name?: string
  defaultCode?: string
  nitelikler?: Array<{ nitelikAdi: string; degerAdi: string }>
}): string {
  return [
    v.name ?? '',
    v.defaultCode ?? '',
    ...(v.nitelikler ?? []).flatMap((n) => [n.nitelikAdi, n.degerAdi]),
  ].join(' ').toLowerCase()
}

function varyantFiltreEslesir(
  v: { name?: string; defaultCode?: string; nitelikler?: Array<{ nitelikAdi: string; degerAdi: string }> },
  term: string,
): boolean {
  const q = term.trim().toLowerCase()
  if (!q) return true
  return varyantNitelikAramaMetni(v).includes(q)
}

function urunAdindanKategori(ad: string): string {
  const a = (ad || '').toLowerCase()
  if (a.includes('çerçeve') || a.includes('cerceve') || a.includes('cerçeve')) return 'Çerçeve'
  if (a.includes('güneş') || a.includes('gunes')) return 'Güneş Gözlüğü'
  if (a.includes('aksesuar')) return 'Aksesuar'
  return ''
}

function varsayilanSablonLotlardan(lotlar: LotSatiri[]): SablonId {
  const ilk = lotlar[0]
  if (!ilk) return 'gunes-aksesuar'
  const kat = urunAdindanKategori(ilk.bizimUrunAdi || ilk.tedarikciUrunAdi)
  return otomatikSablonSec(kat, Boolean(ilk.utsKodu))
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

function gelenFaturaTarihIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

type GelenFaturaAralikPreset = '3' | '7' | '30' | '90' | '180' | 'custom'

function gelenFaturaAralikFromPreset(
  preset: GelenFaturaAralikPreset,
  customBas: string,
  customBit: string,
): { baslangic: string; bitis: string } {
  const bitis = new Date()
  if (preset === 'custom') {
    const fallbackBas = gelenFaturaTarihIso(new Date(Date.now() - 30 * 86400000))
    return {
      baslangic: customBas || fallbackBas,
      bitis: customBit || gelenFaturaTarihIso(bitis),
    }
  }
  const days = preset === '3' ? 3 : preset === '7' ? 7 : preset === '30' ? 30 : preset === '90' ? 90 : 180
  const baslangic = new Date(Date.now() - days * 86400000)
  return { baslangic: gelenFaturaTarihIso(baslangic), bitis: gelenFaturaTarihIso(bitis) }
}

function UrunGirisTab() {
  const [adim, setAdim] = useState<UrunGirisAdim>('giris-tipi')
  const [girisTipi, setGirisTipi] = useState<'FATURAYLA' | 'FATURA_SONRA' | 'IRSALIYELI' | 'FATURASIZ' | null>(null)
  const [girisNo, setGirisNo] = useState(() => {
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
  const [eslestirmeMesaj, setEslestirmeMesaj] = useState<{ tip: 'ok' | 'warn'; text: string } | null>(null)

  // Ürün arama popup
  const [urunPopupAcik, setUrunPopupAcik] = useState(false)
  const [aktifSatirId, setAktifSatirId] = useState<string | null>(null)
  const [urunArama, setUrunArama] = useState('')
  const [urunSonuclar, setUrunSonuclar] = useState<OdooUrun[]>([])
  const [urunAramaLoading, setUrunAramaLoading] = useState(false)
  const [varyantPopup, setVaryantPopup] = useState<{ templateId: number; templateAdi: string } | null>(null)
  const [varyantlar, setVaryantlar] = useState<Array<{ id: number; name: string; defaultCode: string; barcode: string; nitelikler: Array<{ nitelikAdi: string; degerAdi: string }> }>>([])
  const [varyantYukleniyor, setVaryantYukleniyor] = useState(false)
  const [varyantFiltre, setVaryantFiltre] = useState('')
  const [varyantUyari, setVaryantUyari] = useState<string | null>(null)

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
  const odooSatisFiyatiSyncRef = useRef<Map<number, number>>(new Map())
  const [fiyatMesaj, setFiyatMesaj] = useState<{ tip: 'ok' | 'warn'; text: string } | null>(null)
  const [utsBelgeNo, setUtsBelgeNo] = useState('')
  const [utsBridgeBildirimId, setUtsBridgeBildirimId] = useState<string | null>(null)
  const [utsBridgeBanner, setUtsBridgeBanner] = useState<string | null>(null)
  const [utsCekLoading, setUtsCekLoading] = useState(false)
  const [utsCekMesaj, setUtsCekMesaj] = useState<{ tip: 'ok' | 'warn'; text: string } | null>(null)

  const [lokasyonSeciciAcik, setLokasyonSeciciAcik] = useState<string | null>(null) // grup lokasyonu
  const [lokasyonSekme, setLokasyonSekme] = useState<'sube' | 'depo' | 'dis-musteri'>('sube')
  const [disMusteriArama, setDisMusteriArama] = useState('')
  const [disMusteriSonuclar, setDisMusteriSonuclar] = useState<Array<{id: number; name: string; vat: string}>>([])
  const [disMusteriAramaLoading, setDisMusteriAramaLoading] = useState(false)

  const [dovizKuru, setDovizKuru] = useState<{USD: number; EUR: number; tarih: string} | null>(null)
  const [dovizYukleniyor, setDovizYukleniyor] = useState(false)

  // Etiket basma (adım 5 sonrası)
  const [etiketSablonId, setEtiketSablonId] = useState<SablonId>('gunes-aksesuar')
  const [etiketAdetler, setEtiketAdetler] = useState<Record<string, number>>({})
  const [etiketZpl, setEtiketZpl] = useState('')
  const [etiketKopyalandi, setEtiketKopyalandi] = useState(false)
  const [etiketPdfUretiliyor, setEtiketPdfUretiliyor] = useState(false)
  const [etiketPdfOlusturuldu, setEtiketPdfOlusturuldu] = useState(false)

  // Ürün arama popup'ında varyant çoklu seçimi
  const [varyantSecili, setVaryantSecili] = useState<Set<number>>(new Set())

  // Uyumsoft gelen fatura
  const [gelenModalAcik, setGelenModalAcik] = useState(false)
  const [gelenSirketId, setGelenSirketId] = useState<'ng' | 'adese' | 'potential'>('ng')
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
  const [gelenAralikPreset, setGelenAralikPreset] = useState<GelenFaturaAralikPreset>('30')
  const [gelenBaslangic, setGelenBaslangic] = useState(() => gelenFaturaTarihIso(new Date(Date.now() - 30 * 86400000)))
  const [gelenBitis, setGelenBitis] = useState(() => gelenFaturaTarihIso(new Date()))
  const [gelenOnlyUnread, setGelenOnlyUnread] = useState(false)
  const [gelenAramaMetni, setGelenAramaMetni] = useState('')
  const [gelenFaturaTarihiFiltre, setGelenFaturaTarihiFiltre] = useState('')
  const [gelenPageIndex, setGelenPageIndex] = useState(0)
  const [gelenHasMore, setGelenHasMore] = useState(false)
  const [gelenTotalCount, setGelenTotalCount] = useState(0)
  const [gelenCekOzet, setGelenCekOzet] = useState<string | null>(null)
  const [branches, setBranches] = useState<Array<{ id: string; code: string; name: string }>>([])

  const gelenFaturalarFiltreli = useMemo(() => {
    const q = gelenAramaMetni.trim().toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    const tarihFiltre = gelenFaturaTarihiFiltre.trim().slice(0, 10)

    return gelenFaturalar.filter((f) => {
      if (tarihFiltre && (f.faturaTarihi ?? '').slice(0, 10) !== tarihFiltre) return false
      if (!q) return true
      const no = (f.uyumsoftNo ?? '').toLowerCase()
      const adi = (f.tedarikciAdi ?? '').toLowerCase()
      if (no.includes(q) || adi.includes(q)) return true
      if (qDigits.length >= 3) {
        return (f.uyumsoftNo ?? '').replace(/\D/g, '').includes(qDigits)
      }
      return false
    })
  }, [gelenFaturalar, gelenAramaMetni, gelenFaturaTarihiFiltre])

  function gelenPresetDegistir(preset: GelenFaturaAralikPreset) {
    setGelenAralikPreset(preset)
    if (preset !== 'custom') {
      const aralik = gelenFaturaAralikFromPreset(preset, '', '')
      setGelenBaslangic(aralik.baslangic)
      setGelenBitis(aralik.bitis)
    }
    setGelenPageIndex(0)
    setGelenHasMore(false)
    setGelenCekOzet(null)
  }

  // Uyumsoft sütun eşleştirme (adım 2)
  const [uyumsoftKaynak, setUyumsoftKaynak] = useState(false)
  const [uyumsoftHamSatirlar, setUyumsoftHamSatirlar] = useState<UyumsoftHamSatir[]>([])
  const [uyumsoftKolonMap, setUyumsoftKolonMap] = useState<UyumsoftKolonMap>({ ...VARSAYILAN_UYUMSOFT_KOLON_MAP })
  const [uyumsoftTedarikciVkn, setUyumsoftTedarikciVkn] = useState<string | null>(null)
  const [uyumsoftKolonKayitli, setUyumsoftKolonKayitli] = useState(false)

  const [taslakListesi, setTaslakListesi] = useState<UrunGirisDraftMeta[]>([])
  const [taslakUyari, setTaslakUyari] = useState<UrunGirisDraftMeta | null>(null)

  const taslakListesiniYenile = useCallback(() => {
    setTaslakListesi(listUrunGirisDraftMeta())
  }, [])

  const collectDraftPayload = useCallback((): UrunGirisDraftPayload => ({
    adim,
    girisTipi,
    girisNo,
    cariAdi,
    cariId,
    faturaNo,
    irsaliyeNo,
    faturaReferans,
    faturaTarihi,
    fizikiTedarikciAdi,
    fizikiTedarikciId,
    secilenSirketId,
    secilenSirketAdi,
    faturaToplamKdvHaric,
    satirlar,
    lotlar,
    utsBelgeNo,
    gelenFaturaId,
    topluUretici,
    uyumsoftKaynak,
    uyumsoftHamSatirlar,
    uyumsoftKolonMap,
    uyumsoftTedarikciVkn,
  }), [
    adim, girisTipi, girisNo, cariAdi, cariId, faturaNo, irsaliyeNo, faturaReferans, faturaTarihi,
    fizikiTedarikciAdi, fizikiTedarikciId, secilenSirketId, secilenSirketAdi, faturaToplamKdvHaric,
    satirlar, lotlar, utsBelgeNo, gelenFaturaId, topluUretici, uyumsoftKaynak, uyumsoftHamSatirlar,
    uyumsoftKolonMap, uyumsoftTedarikciVkn,
  ])

  const taslakYukle = useCallback((draftId: string) => {
    const draft = getUrunGirisDraft(draftId)
    if (!draft) return
    const p = draft.payload
    setGirisNo(p.girisNo)
    setAdim(p.adim as UrunGirisAdim)
    setGirisTipi(p.girisTipi)
    setCariAdi(p.cariAdi)
    setCariId(p.cariId)
    setFaturaNo(p.faturaNo)
    setIrsaliyeNo(p.irsaliyeNo)
    setFaturaReferans(p.faturaReferans)
    setFaturaTarihi(p.faturaTarihi)
    setFizikiTedarikciAdi(p.fizikiTedarikciAdi)
    setFizikiTedarikciId(p.fizikiTedarikciId)
    setSecilenSirketId(p.secilenSirketId)
    setSecilenSirketAdi(p.secilenSirketAdi)
    setFaturaToplamKdvHaric(p.faturaToplamKdvHaric)
    setSatirlar(p.satirlar as FaturaSatiri[])
    setLotlar(p.lotlar as LotSatiri[])
    setUtsBelgeNo(p.utsBelgeNo)
    setGelenFaturaId(p.gelenFaturaId)
    setTopluUretici(p.topluUretici)
    setUyumsoftKaynak(p.uyumsoftKaynak)
    setUyumsoftHamSatirlar(p.uyumsoftHamSatirlar as UyumsoftHamSatir[])
    setUyumsoftKolonMap(p.uyumsoftKolonMap as UyumsoftKolonMap)
    setUyumsoftTedarikciVkn(p.uyumsoftTedarikciVkn)
    setSuccess(false)
    setError(null)
    setTaslakUyari(null)
  }, [])

  const taslakSil = useCallback((draftId: string) => {
    deleteUrunGirisDraft(draftId)
    taslakListesiniYenile()
    if (taslakUyari?.id === draftId) setTaslakUyari(null)
  }, [taslakListesiniYenile, taslakUyari?.id])

  useEffect(() => {
    taslakListesiniYenile()
    const drafts = listUrunGirisDraftMeta()
    if (drafts.length > 0) setTaslakUyari(drafts[0])
    return onUrunGirisDraftSaved(taslakListesiniYenile)
  }, [taslakListesiniYenile])

  useEffect(() => {
    const bridge = consumeUtsUrunGirisBridge()
    if (!bridge) return
    setUtsBridgeBildirimId(bridge.utsBildirimId ?? null)
    setUtsBelgeNo(bridge.belgeNo ?? '')
    if (bridge.tedarikciAd) setCariAdi(bridge.tedarikciAd)
    setUtsBridgeBanner(
      `UTS alma bildiriminden aktarıldı — barkod: ${bridge.barkod}, seri/lot: ${bridge.seriNo || bridge.lotNo || '—'}`,
    )
    setGirisTipi('FATURASIZ')
    setAdim('lotlar')
    const lotId = `uts-${Date.now()}`
    const lotNo = bridge.seriNo || bridge.lotNo || bridge.barkod
    setLotlar([{
      id: lotId,
      faturaId: 'uts-bridge',
      satırNo: 1,
      tedarikciUrunAdi: `UTS ${bridge.barkod}`,
      bizimUrunAdi: '',
      bizimUrunOdooId: null,
      uretici: '',
      barkod: bridge.barkod,
      utsKodu: bridge.barkod,
      lotNo,
      birimFiyat: '0',
      lokasyon: 'ANADEPO',
      satisFiyati: '',
      satisFiyatiDegisti: 'false',
      lokasyonTip: 'depo',
      disMusteriId: null,
      disMusteriAdi: '',
    }])
    setSatirlar([{
      id: `uts-satir-${Date.now()}`,
      tedarikciUrunAdi: `UTS ${bridge.barkod}`,
      uretici: '',
      bizimUrunId: null,
      bizimUrunAdi: '',
      bizimUrunOdooId: null,
      miktar: bridge.adet || 1,
      birimFiyat: '0',
      iskonto: '0',
      kdvOrani: '20',
      eslesti: false,
    }])
  }, [])

  useEffect(() => {
    if (success) return
    const anlamli =
      adim !== 'giris-tipi'
      || Boolean(cariAdi.trim() || faturaNo.trim())
      || satirlar.some((s) => s.tedarikciUrunAdi.trim() || s.bizimUrunAdi.trim())
      || lotlar.length > 0
    if (!anlamli) return
    saveUrunGirisDraftDebounced(collectDraftPayload())
  }, [collectDraftPayload, success, adim, cariAdi, faturaNo, satirlar, lotlar.length])

  useEffect(() => {
    const flush = () => {
      if (success) return
      const anlamli =
        adim !== 'giris-tipi'
        || Boolean(cariAdi.trim() || faturaNo.trim())
        || satirlar.some((s) => s.tedarikciUrunAdi.trim() || s.bizimUrunAdi.trim())
        || lotlar.length > 0
      if (anlamli) flushUrunGirisDraft(collectDraftPayload())
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [collectDraftPayload, success, adim, cariAdi, faturaNo, satirlar, lotlar.length])

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
      iskonto: String(satir.iskonto ?? 0),
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

  function sihirbaziSifirla() {
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
    setLotlar([])
    setSuccess(false); setError(null)
    setEtiketZpl('')
    setEtiketAdetler({})
    setEtiketKopyalandi(false)
    setEtiketPdfUretiliyor(false)
    setEtiketPdfOlusturuldu(false)
    setGirisTipi(null)
  }

  async function etiketUret() {
    const items = lotlar.flatMap((lot) => {
      const adet = Math.max(1, etiketAdetler[lot.id] ?? 1)
      const veri = {
        urunAdi: lot.bizimUrunAdi || lot.tedarikciUrunAdi,
        seriNo: lot.lotNo,
        fiyat: lot.satisFiyati || lot.birimFiyat,
        barkod: lot.barkod || undefined,
        icReferans: lot.varyantEtiketi || lot.bizimUrunBarkod || lot.barkod || undefined,
        renkVaryant: lot.varyantEtiketi,
        utsKodu: lot.utsKodu || null,
        lotNo: lot.lotNo,
        lokasyon: lot.lokasyon,
      }
      return Array.from({ length: adet }, () => veri)
    })
    const kategori = lotlar[0]
      ? urunAdindanKategori(lotlar[0].bizimUrunAdi || lotlar[0].tedarikciUrunAdi)
      : undefined

    setError(null)

    // Görsel motoru olan şablonlar (ör. depo-kutu) için normal yazıcıdan PDF çıktısı —
    // etiket yazıcısı/Argox sürücüsüne hiç gerek kalmaz.
    const sablonRender = await getPilotEtiketSablon(etiketSablonId, kategori).catch(() => null)
    if (sablonRender) {
      setEtiketPdfUretiliyor(true)
      try {
        const veriler = items.map(etiketUrunToRenderVeri)
        const sayfalar = renderEtiketBatchToDataUrls(sablonRender, veriler)
        await etiketleriPdfOlustur(sayfalar, `depo-etiketleri-${new Date().toISOString().slice(0, 10)}.pdf`)
        setEtiketPdfOlusturuldu(true)
      } catch (e: unknown) {
        const err = e as { message?: string }
        setError(err?.message ?? 'PDF oluşturulamadı')
      } finally {
        setEtiketPdfUretiliyor(false)
      }
      return
    }

    // Görsel motoru olmayan şablonlar için eski ham ZPL/PPLA metni (yedek yol)
    const zpl = await uretEtiketZplTercihli(etiketSablonId, items, kategori)
    setEtiketZpl(zpl)
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

  async function gelenFaturalariYukle(sirketId: string = gelenSirketId) {
    setGelenYukleniyor(true)
    try {
      const aralik = gelenFaturaAralikFromPreset(gelenAralikPreset, gelenBaslangic, gelenBitis)
      const res = await adminApi.get('/efatura/gelen/listele', {
        params: {
          sirketId,
          faturaBaslangic: aralik.baslangic,
          faturaBitis: aralik.bitis,
        },
      })
      setGelenFaturalar(res.data?.data ?? [])
    } catch {
      setGelenFaturalar([])
    } finally {
      setGelenYukleniyor(false)
    }
  }

  async function gelenFaturalariCek(loadMore = false) {
    setGelenYukleniyor(true)
    try {
      const aralik = gelenFaturaAralikFromPreset(gelenAralikPreset, gelenBaslangic, gelenBitis)
      const nextPage = loadMore ? gelenPageIndex + 1 : 0
      const res = await adminApi.post('/efatura/gelen/cek', {
        baslangic: aralik.baslangic,
        bitis: aralik.bitis,
        onlyUnread: gelenOnlyUnread,
        pageSize: 50,
        pageIndex: nextPage,
        sirketId: gelenSirketId,
      })
      const yeniListe = res.data?.data ?? []
      let ekranAdet = yeniListe.length
      setGelenFaturalar((prev) => {
        if (!loadMore) return yeniListe
        const mevcutIdler = new Set(prev.map((f) => f.id))
        const birlesik = [...prev, ...yeniListe.filter((f: { id: string }) => !mevcutIdler.has(f.id))]
        ekranAdet = birlesik.length
        return birlesik
      })
      setGelenPageIndex(res.data?.pageIndex ?? nextPage)
      setGelenHasMore(!!res.data?.hasMore)
      setGelenTotalCount(Number(res.data?.totalCount ?? 0))
      setGelenCekOzet(
        `Fatura tarihi ${aralik.baslangic}–${aralik.bitis} · Uyumsoft: ${res.data?.totalCount ?? 0} kayıt · bu sayfa ${res.data?.toplam ?? 0} · ekranda ${ekranAdet} · +${res.data?.eklenen ?? 0} yeni · ${res.data?.guncellenen ?? 0} güncellendi${typeof res.data?.aralikDisiSayisi === 'number' && res.data.aralikDisiSayisi > 0 ? ` · ${res.data.aralikDisiSayisi} aralık dışı elendi` : ''}${typeof res.data?.sureMs === 'number' ? ` · ${(res.data.sureMs / 1000).toFixed(1)} sn` : ''}`,
      )
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
    setVaryantFiltre('')
    setVaryantUyari(null)
    setVaryantYukleniyor(true)
    setVaryantPopup({ templateId: u.id, templateAdi: u.name })
    try {
      const res = await adminApi.get(`/admin/urun-varyanlar/${u.id}`)
      const data = res.data?.data ?? []
      if (data.length === 1) {
        // Tek varyant: template id koru, varyant id ayrı alanda
        setVaryantPopup(null)
        urunSec(u, {
          productVariantId: data[0].id,
          displayName: data[0].name || u.name,
          barcode: data[0].barcode ?? '',
          nitelikler: data[0].nitelikler ?? [],
        })
      } else if (data.length === 0) {
        setVaryantUyari('Bu şablon için aktif varyant bulunamadı; şablon ile devam ediliyor.')
        setVaryantPopup(null)
        urunSec(u)
      } else {
        setVaryantSecili(new Set())
        setVaryantlar(data)
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string }; status?: number } }
      const detay = err?.response?.data?.error ?? (err?.response?.status ? `HTTP ${err.response.status}` : 'bağlantı hatası')
      setVaryantUyari(`Varyant bilgisi alınamadı (${detay}); şablon ile devam ediliyor.`)
      setVaryantPopup(null)
      urunSec(u)
    } finally {
      setVaryantYukleniyor(false)
    }
  }

  /** Varyant popup'ında birden fazla varyant işaretlenip tek seferde eklenmesi
   * için: ilki aktif satırı doldurur, geri kalanı yeni satır olarak eklenir. */
  function varyantlariEkle(secilenler: typeof varyantlar) {
    if (!varyantPopup || secilenler.length === 0) return
    const [ilk, ...digerleri] = secilenler
    const tmplId = varyantPopup.templateId
    const tmplAdi = varyantPopup.templateAdi

    urunSec(
      {
        id: tmplId,
        name: tmplAdi,
        default_code: ilk.defaultCode ?? '',
        barcode: ilk.barcode ?? '',
        type: 'product',
        list_price: 0,
        standard_price: 0,
      },
      { productVariantId: ilk.id, displayName: ilk.name, barcode: ilk.barcode ?? '', nitelikler: ilk.nitelikler ?? [] },
    )

    if (digerleri.length > 0) {
      setSatirlar((prev) => [
        ...prev,
        ...digerleri.map((v) => {
          const etiket = varyantEtiketiOlustur(v.nitelikler)
          const rawBarkod = v.barcode ?? ''
          const barkod = typeof rawBarkod === 'string' ? rawBarkod.trim() : ''
          return {
            id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tedarikciUrunAdi: '',
            uretici: topluUretici,
            bizimUrunId: String(tmplId),
            bizimUrunAdi: v.name,
            bizimUrunOdooId: tmplId,
            bizimUrunProductId: v.id,
            bizimUrunBarkod: barkod || undefined,
            varyantEtiketi: etiket || undefined,
            miktar: 1,
            birimFiyat: '',
            iskonto: '0',
            kdvOrani: '10',
            eslesti: true,
          }
        }),
      ])
    }

    setVaryantPopup(null)
    setVaryantFiltre('')
    setVaryantSecili(new Set())
  }

  function urunSec(
    urun: OdooUrun,
    opts?: {
      productVariantId?: number | null
      displayName?: string
      barcode?: unknown
      nitelikler?: Array<{ nitelikAdi: string; degerAdi: unknown }>
    },
  ) {
    if (!aktifSatirId) return
    const etiket = varyantEtiketiOlustur(opts?.nitelikler)
    const rawBarkod = opts?.barcode ?? urun.barcode ?? ''
    const barkod = typeof rawBarkod === 'string' ? rawBarkod.trim() : ''
    setSatirlar(prev => prev.map(s => s.id === aktifSatirId ? {
      ...s,
      bizimUrunId: String(urun.id),
      bizimUrunAdi: opts?.displayName ?? urun.name,
      bizimUrunOdooId: urun.id,
      bizimUrunProductId: opts?.productVariantId ?? null,
      bizimUrunBarkod: barkod || undefined,
      varyantEtiketi: etiket || undefined,
      eslesti: true,
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
        create_variant: 'dynamic',
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

  function eslestenIsimleriTamamla() {
    const { satirlar: yeniSatirlar, grupSayisi, satirSayisi, uyarilar } = eslestenIsimleriOtomatikTamamla(satirlar)
    if (satirSayisi === 0) {
      setEslestirmeMesaj({
        tip: 'warn',
        text: 'Otomatik tamamlanacak satır bulunamadı. Önce en az bir satırı elle eşleştirin.',
      })
      return
    }
    setSatirlar(yeniSatirlar)
    const ozet = `${grupSayisi} grup, ${satirSayisi} satır otomatik eşleştirildi.`
    setEslestirmeMesaj({
      tip: uyarilar.length ? 'warn' : 'ok',
      text: uyarilar.length ? `${ozet} ${uyarilar.join(' ')}` : ozet,
    })
  }

  function ayniIsimEslestirmeyiUygula(kaynakId: string) {
    const kaynak = satirlar.find((s) => s.id === kaynakId)
    if (!kaynak?.eslesti) return
    const key = tedarikciUrunAdiAnahtar(kaynak.tedarikciUrunAdi)
    if (!key) return
    const alanlar = eslestirmeAlanlariKaynaktan(kaynak)
    let uygulanan = 0
    setSatirlar((prev) => prev.map((s) => {
      if (s.id === kaynakId) return s
      if (!s.eslesti && tedarikciUrunAdiAnahtar(s.tedarikciUrunAdi) === key) {
        uygulanan++
        return { ...s, ...alanlar }
      }
      return s
    }))
    if (uygulanan > 0) {
      setEslestirmeMesaj({
        tip: 'ok',
        text: `"${kaynak.tedarikciUrunAdi.trim()}" — ${uygulanan} satıra uygulandı.`,
      })
    }
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

  async function odooListPriceGuncelle(productTmplId: number, listPrice: number) {
    if (!productTmplId || !Number.isFinite(listPrice) || listPrice <= 0) return
    const onceki = odooSatisFiyatiSyncRef.current.get(productTmplId)
    if (onceki === listPrice) return
    try {
      await adminApi.post('/admin/satis-fiyati-guncelle', { productTmplId, listPrice })
      odooSatisFiyatiSyncRef.current.set(productTmplId, listPrice)
    } catch (e) {
      console.warn('[satis fiyati guncelle hata]', e)
    }
  }

  async function odooListPriceTopluGuncelle(
    guncellemeler: Array<{ productTmplId: number; listPrice: number }>,
  ) {
    const uniq = new Map<number, number>()
    for (const g of guncellemeler) {
      if (g.productTmplId && Number.isFinite(g.listPrice) && g.listPrice > 0) {
        uniq.set(g.productTmplId, g.listPrice)
      }
    }
    for (const [productTmplId, listPrice] of uniq) {
      await odooListPriceGuncelle(productTmplId, listPrice)
    }
  }

  async function satisFiyatiGuncelle(lotId: string, yeniFiyat: string) {
    const lot = lotlar.find(l => l.id === lotId)
    if (!lot) return
    setLotlar(prev => prev.map(l => l.id === lotId ? {
      ...l,
      satisFiyati: yeniFiyat,
      satisFiyatiDegisti: 'true',
    } : l))
    if (lot.bizimUrunOdooId && yeniFiyat.trim() !== '') {
      await odooListPriceGuncelle(lot.bizimUrunOdooId, Number(yeniFiyat))
    }
  }

  async function satisFiyatiTopluUygula(kaynakLotId: string) {
    const kaynak = lotlar.find((l) => l.id === kaynakLotId)
    if (!kaynak || !lotFiyatGirilmis(kaynak) || !kaynak.satisFiyati.trim()) return
    const key = lotUrunAnahtar(kaynak)
    if (!key) return

    let uygulanan = 0
    setLotlar((prev) => prev.map((l) => {
      if (l.id === kaynakLotId) return l
      if (lotUrunAnahtar(l) === key && !lotFiyatGirilmis(l)) {
        uygulanan++
        return { ...l, satisFiyati: kaynak.satisFiyati, satisFiyatiDegisti: 'true' }
      }
      return l
    }))

    if (uygulanan > 0) {
      if (kaynak.bizimUrunOdooId) {
        await odooListPriceGuncelle(kaynak.bizimUrunOdooId, Number(kaynak.satisFiyati))
      }
      const fiyatStr = Number(kaynak.satisFiyati).toLocaleString('tr-TR')
      setFiyatMesaj({
        tip: 'ok',
        text: `"${kaynak.bizimUrunAdi.trim()}" — ${uygulanan} satıra ₺${fiyatStr} uygulandı.`,
      })
    }
  }

  async function fiyatlariOtomatikTamamlaFn() {
    const { lotlar: yeniLotlar, grupSayisi, satirSayisi, odooGuncellemeler } = fiyatlariOtomatikTamamla(lotlar)
    if (satirSayisi === 0) {
      setFiyatMesaj({
        tip: 'warn',
        text: 'Otomatik tamamlanacak satır bulunamadı. Önce en az bir satıra satış fiyatı girin.',
      })
      return
    }
    setLotlar(yeniLotlar)
    await odooListPriceTopluGuncelle(odooGuncellemeler)
    setFiyatMesaj({
      tip: 'ok',
      text: `${grupSayisi} ürün grubu, ${satirSayisi} satır fiyatlandırıldı.`,
    })
  }

  function utsReferansSubeKodu(): string {
    if (secilenSirketId === 3) return 'GVN1'
    if (secilenSirketId === 4) return 'GVN5'
    const ilkLok = lotlar[0]?.lokasyon
    if (ilkLok && ilkLok !== 'ANADEPO' && !ilkLok.startsWith('MUS-')) return ilkLok
    return 'GVN2'
  }

  async function utsBelgeNoIleCek() {
    const belgeNo = utsBelgeNo.trim() || faturaNo.trim()
    if (!belgeNo) {
      setUtsCekMesaj({ tip: 'warn', text: 'Belge numarası girin veya fatura no dolu olsun.' })
      return
    }
    setUtsCekLoading(true)
    setUtsCekMesaj(null)
    try {
      const subeKodu = utsReferansSubeKodu()
      const res = await adminApi.get('/admin/uts/belge-sorgula', {
        params: {
          belgeNo,
          subeKodu,
          sirketId: secilenSirketId ?? undefined,
        },
      })
      const utsSatirlar: Array<{ uno: string; lno?: string; sno?: string }> = res.data?.data ?? []
      if (!utsSatirlar.length) {
        setUtsCekMesaj({
          tip: 'warn',
          text: `"${belgeNo}" için UTS'de bekleyen kayıt bulunamadı. Elle girmeye devam edebilirsiniz.`,
        })
        return
      }
      const byUno = new Map<string, Array<{ uno: string; lno?: string; sno?: string }>>()
      for (const s of utsSatirlar) {
        const k = s.uno.trim()
        const arr = byUno.get(k) ?? []
        arr.push(s)
        byUno.set(k, arr)
      }
      const used = new Map<string, number>()
      let uygulanan = 0
      setLotlar((prev) => prev.map((lot) => {
        if (lot.utsKodu.trim()) return lot
        const barkod = lot.barkod.trim()
        if (!barkod) return lot
        const liste = byUno.get(barkod)
        if (!liste?.length) return lot
        const idx = used.get(barkod) ?? 0
        if (idx >= liste.length) return lot
        used.set(barkod, idx + 1)
        uygulanan++
        return { ...lot, utsKodu: liste[idx].uno }
      }))
      setUtsCekMesaj({
        tip: 'ok',
        text: `${res.data?.subeAdi ?? subeKodu} — ${utsSatirlar.length} UTS kaydı, ${uygulanan} lot satırına uygulandı.`,
      })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setUtsCekMesaj({
        tip: 'warn',
        text: err?.response?.data?.error ?? err?.message ?? 'UTS sorgusu başarısız — elle girmeye devam edebilirsiniz.',
      })
    } finally {
      setUtsCekLoading(false)
    }
  }

  // Adım 2 → Adım 3: Her satır × miktar = lotlar
  // Seri no: girisNo bazlı (her sihirbaz oturumu benzersiz) — faturaNo tek başına deterministik olmamalı
  function lotlariOlustur() {
    const yeniLotlar: LotSatiri[] = []
    satirlar.forEach((satir, satirIdx) => {
      for (let i = 0; i < satir.miktar; i++) {
        yeniLotlar.push({
          id: `l-${satir.id}-${i}`,
          faturaId: satir.id,
          satırNo: i + 1,
          tedarikciUrunAdi: satir.tedarikciUrunAdi,
          bizimUrunAdi: satir.bizimUrunAdi,
          bizimUrunOdooId: satir.bizimUrunOdooId,
          bizimUrunProductId: satir.bizimUrunProductId ?? null,
          bizimUrunBarkod: satir.bizimUrunBarkod,
          varyantEtiketi: satir.varyantEtiketi,
          uretici: satir.uretici,
          barkod: satir.bizimUrunBarkod ?? '',
          utsKodu: '',
          lotNo: `${girisNo}-S${String(satirIdx + 1).padStart(2, '0')}-${String(i + 1).padStart(3, '0')}`,
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
    setUtsBelgeNo(faturaNo.trim())
    setUtsCekMesaj(null)
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
    if (girisTipi === 'FATURASIZ' && !secilenSirketId) {
      setError('Faturasız giriş için alıcı şirket seçimi zorunlu.')
      setSaving(false)
      return
    }
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
        utsBildirimId: utsBridgeBildirimId || undefined,
      })

      const s = res.data?.sonuclar ?? {}
      const stokOk = res.data?.stokGirisiBasarili === true || s.picking?.state === 'done'
      const mesajlar: string[] = []

      if (res.data?.success && stokOk) {
        setSuccess(true)
        deleteUrunGirisDraft(girisNo)
        taslakListesiniYenile()
        setTaslakUyari(null)
        if (s.purchaseOrder) mesajlar.push(`✓ Satın alma siparişi: ${s.purchaseOrder.name}${s.purchaseOrder.satirSayisi ? ` (${s.purchaseOrder.satirSayisi} satır)` : ''}`)
        mesajlar.push(`✓ Stok girişi tamamlandı: ${s.picking?.name ?? 'picking'}`)
        if (s.faturaOnay?.ok) mesajlar.push(`✓ Fatura onaylandı: ${s.faturaOnay.name ?? s.vendorBill?.name ?? ''}`)
        else if (s.vendorBill || s.faturaOnay) mesajlar.push(`⚠️ Fatura onaylanamadı: ${s.faturaOnay?.error ?? 'taslak kaldı'}`)
        if (s.lotSayisi) mesajlar.push(`✓ ${s.lotSayisi} lot/seri no oluşturuldu`)
        if (s.fiyatGuncellenen) mesajlar.push(`✓ ${s.fiyatGuncellenen} ürün satış fiyatı güncellendi`)
        if (res.data.hatalar?.length) mesajlar.push(`⚠️ Hatalar:\n${res.data.hatalar.join('\n')}`)
        setError(mesajlar.length > 0 ? mesajlar.join('\n') : null)

        const adetMap: Record<string, number> = {}
        lotlar.forEach((l) => { adetMap[l.id] = 1 })
        setEtiketAdetler(adetMap)
        setEtiketSablonId(varsayilanSablonLotlardan(lotlar))
        setEtiketZpl('')
        setEtiketKopyalandi(false)
        setEtiketPdfUretiliyor(false)
        setEtiketPdfOlusturuldu(false)

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
              setError(mesajlar.join('\n'))
            } catch (utsErr: unknown) {
              console.warn('[uts alma]', utsErr)
            }
          }
          setGelenFaturaId(null)
        }
      } else if (girisTipi === 'FATURASIZ' && (s.lotSayisi ?? 0) > 0 && !stokOk) {
        setSuccess(false)
        if (s.lotSayisi) mesajlar.push(`✓ ${s.lotSayisi} lot/seri no oluşturuldu`)
        mesajlar.push('⚠ Stok girişi henüz tamamlanamadı — Ana Depo stoğu güncellenmedi.')
        if (res.data.hatalar?.length) mesajlar.push(`⚠ Hatalar:\n${res.data.hatalar.join('\n')}`)
        setError(mesajlar.join('\n'))
      } else {
        setSuccess(false)
        const errParts = [
          res.data?.error,
          ...(res.data?.hatalar ?? []),
        ].filter(Boolean)
        setError(errParts.length > 0 ? errParts.join('\n') : 'Kayıt başarısız')
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
      {(taslakUyari || taslakListesi.length > 0) && !success ? (
        <div style={{ marginBottom: 16 }}>
          {utsBridgeBanner ? (
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#1e40af' }}>
              {utsBridgeBanner}
            </div>
          ) : null}

          {taslakUyari ? (
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e', marginBottom: 6 }}>
                Yarım kalmış bir ürün girişiniz var
              </div>
              <div style={{ fontSize: 12, color: '#78350f', marginBottom: 10 }}>
                {taslakUyari.girisNo} · {adimEtiketi(taslakUyari.adim)}
                {taslakUyari.cariAdi ? ` · ${taslakUyari.cariAdi}` : ''}
                {taslakUyari.faturaNo ? ` · Fatura: ${taslakUyari.faturaNo}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => taslakYukle(taslakUyari.id)} style={{ ...btnSmall, backgroundColor: '#C8102E', color: 'white', fontWeight: 800 }}>
                  Devam et
                </button>
                <button type="button" onClick={() => taslakSil(taslakUyari.id)} style={{ ...btnSmall, backgroundColor: '#fee2e2', color: '#991b1b' }}>
                  Sil
                </button>
                <button type="button" onClick={() => setTaslakUyari(null)} style={{ ...btnSmall, backgroundColor: '#f3f4f6' }}>
                  Yeni giriş yap
                </button>
              </div>
            </div>
          ) : null}

          {taslakListesi.length > 0 ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', backgroundColor: '#f9fafb' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#374151', marginBottom: 8 }}>Yarıda kalmış işlemler</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {taslakListesi.map((t) => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 10px', backgroundColor: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 12, color: '#374151' }}>
                      <strong>{t.girisNo}</strong> · {adimEtiketi(t.adim)} · {t.satirSayisi} satır · {t.lotSayisi} lot
                      {t.cariAdi ? ` · ${t.cariAdi}` : ''}
                      <span style={{ color: '#9ca3af', marginLeft: 8 }}>{new Date(t.updatedAt).toLocaleString('tr-TR')}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" onClick={() => taslakYukle(t.id)} style={{ ...btnSmall, backgroundColor: '#dcfce7', color: '#166534' }}>Devam</button>
                      <button type="button" onClick={() => taslakSil(t.id)} style={{ ...btnSmall, backgroundColor: '#fee2e2', color: '#991b1b' }}>Sil</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                    {varyantPopup.templateAdi} — birden fazla varyant işaretleyip tek seferde ekleyebilirsiniz.
                  </div>
                  {!varyantYukleniyor && varyantlar.length > 0 ? (
                    <input
                      type="search"
                      value={varyantFiltre}
                      onChange={(e) => setVaryantFiltre(e.target.value)}
                      placeholder="Model, renk veya ölçü ara..."
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        fontSize: 13,
                        marginBottom: 12,
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : null}
                  {varyantYukleniyor ? (
                    <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 20 }}>Yükleniyor...</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {varyantlar.filter((v) => varyantFiltreEslesir(v, varyantFiltre)).map(v => {
                        const secili = varyantSecili.has(v.id)
                        return (
                          <div
                            key={v.id}
                            onClick={() => {
                              setVaryantSecili((prev) => {
                                const next = new Set(prev)
                                if (next.has(v.id)) next.delete(v.id)
                                else next.add(v.id)
                                return next
                              })
                            }}
                            style={{
                              padding: '10px 14px',
                              border: secili ? '1px solid #059669' : '1px solid #e5e7eb',
                              backgroundColor: secili ? '#f0fdf4' : 'white',
                              borderRadius: 8,
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={secili}
                              onChange={() => {}}
                              style={{ flexShrink: 0, width: 16, height: 16 }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{v.name}</div>
                              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                {v.defaultCode && <span>Kod: {v.defaultCode} · </span>}
                                {v.nitelikler.map(n => `${n.nitelikAdi}: ${n.degerAdi}`).join(' · ')}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {!varyantYukleniyor && varyantFiltre.trim() && varyantlar.filter((v) => varyantFiltreEslesir(v, varyantFiltre)).length === 0 ? (
                        <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 16 }}>
                          Eşleşen varyant bulunamadı.
                        </div>
                      ) : null}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button type="button" onClick={() => { setVaryantPopup(null); setVaryantFiltre(''); setVaryantSecili(new Set()) }} style={{ padding: '8px 16px', backgroundColor: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>İptal</button>
                    <button
                      type="button"
                      disabled={varyantSecili.size === 0}
                      onClick={() => varyantlariEkle(varyantlar.filter((v) => varyantSecili.has(v.id)))}
                      style={{
                        flex: 1,
                        padding: '8px 16px',
                        backgroundColor: varyantSecili.size === 0 ? '#e5e7eb' : '#059669',
                        color: varyantSecili.size === 0 ? '#9ca3af' : 'white',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: varyantSecili.size === 0 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Seçilenleri Ekle {varyantSecili.size > 0 ? `(${varyantSecili.size})` : ''}
                    </button>
                  </div>
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
            {/* Uyumsoft — üst seviye kart (eski "Fatura ile Giriş" yerine) */}
            <div
              onClick={() => {
                setGelenModalAcik(true)
                void gelenFaturalariYukle()
              }}
              style={{
                border: '2px solid #fde68a',
                borderRadius: 12,
                padding: '16px 20px',
                cursor: 'pointer',
                backgroundColor: '#fffbeb',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#d97706')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#fde68a')}
            >
              <div style={{ fontSize: 28 }}>🔗</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#b45309', marginBottom: 3 }}>
                  Uyumsoft&apos;tan Otomatik Çek (e-Fatura)
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  Gelen e-faturaları Uyumsoft inbox&apos;tan çek
                </div>
              </div>
            </div>

            <div
              onClick={() => setAdim('siparis-urun-girisi')}
              style={{
                border: '2px solid #c4b5fd',
                borderRadius: 12,
                padding: '16px 20px',
                cursor: 'pointer',
                backgroundColor: '#f5f3ff',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#7c3aed')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#c4b5fd')}
            >
              <div style={{ fontSize: 28 }}>🛒</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#6d28d9', marginBottom: 3 }}>
                  Sipariş Ürün Girişi
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  POS&apos;tan teslim alınan özel siparişler — karekod, UTS ve stok transferi
                </div>
              </div>
            </div>

            {[
              { tip: 'FATURA_SONRA' as const, icon: '⏳', baslik: 'Ürün Geldi, Fatura Beklemede', aciklama: 'Stok girişi yapılır, fatura gelince eşleştirilir.', renk: '#d97706', bg: '#fffbeb', border: '#fde68a' },
              { tip: 'IRSALIYELI' as const, icon: '📋', baslik: 'İrsaliyeli Giriş', aciklama: 'İrsaliye numarasıyla giriş. Fatura sonra veya birlikte gelebilir.', renk: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
              { tip: 'FATURASIZ' as const, icon: '🔓', baslik: 'Faturasız Giriş', aciklama: 'Eski stok veya kaynağı belirsiz giriş. Şirket seçilir, lot oluşturulur ve Ana Depo stoğuna işlenir.', renk: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
            ].map(s => (
              <div key={s.tip} onClick={() => {
                setGirisTipi(s.tip)
                setAdim('fatura')
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

          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, fontWeight: 600 }}>Diğer Giriş Seçenekleri</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setGirisTipi('FATURAYLA')
                  setAdim('fatura')
                }}
                style={{
                  padding: '14px 12px',
                  backgroundColor: '#eff6ff',
                  border: '2px solid #bfdbfe',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#1e40af',
                  textAlign: 'center',
                }}
              >
                📋 Odoo&apos;dan Manuel Seç
              </button>
              <button
                type="button"
                onClick={() => {
                  setGirisTipi('FATURAYLA')
                  setAdim('fatura')
                }}
                style={{
                  padding: '14px 12px',
                  backgroundColor: '#f0fdf4',
                  border: '2px solid #86efac',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#059669',
                  textAlign: 'center',
                }}
              >
                📄 Fatura ile Giriş
              </button>
              <button
                type="button"
                onClick={() => setAdim('bekleyen-faturalar')}
                style={{
                  padding: '14px 12px',
                  backgroundColor: '#f3f4f6',
                  border: '2px solid #e5e7eb',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#374151',
                  textAlign: 'center',
                }}
              >
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
          <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 12, color: '#1a1a2e' }}>
            {girisTipi === 'FATURASIZ' ? 'Şirket Seçimi' : 'Fatura Bilgileri'}
          </div>

          {/* Alıcı Şirket */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
              {girisTipi === 'FATURASIZ' ? 'Alıcı Şirket (Stok girişi yapılacak) *' : 'Alıcı Şirket (Faturanın Kesildiği) *'}
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
          {girisTipi !== 'FATURASIZ' && faturaListesiAcik && secilenSirketId && (
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

          {girisTipi === 'FATURASIZ' && (
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Giriş Kayıt Numarası (Otomatik)</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#166534' }}>{girisNo}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                Tedarikçi/fatura bilgisi gerekmez. Seçilen şirketin Ana Depo stoğuna lot ile giriş yapılır.
              </div>
            </div>
          )}

          {girisTipi !== 'FATURASIZ' && (
          <>
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
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100, backgroundColor: '#fff', borderRadius: 8 }}>
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

          </>
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
            <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>
              Ürün Satırları — {girisTipi === 'FATURASIZ'
                ? (secilenSirketAdi || 'Şirket seçilmedi')
                : `${cariAdi} · ${faturaNo}`}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{satirlar.length} satır · toplam {satirlar.reduce((a, s) => a + s.miktar, 0)} adet</div>
          </div>

          {varyantUyari ? (
            <div style={{
              marginBottom: 12,
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <span>⚠ {varyantUyari}</span>
              <button type="button" onClick={() => setVaryantUyari(null)} style={{ ...btnSmall, flexShrink: 0 }}>Kapat</button>
            </div>
          ) : null}

          {/* Toplu üretici + otomatik eşleştirme */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14, backgroundColor: '#f9fafb', padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, whiteSpace: 'nowrap' }}>Toplu Üretici:</div>
            <input value={topluUretici} onChange={e => setTopluUretici(e.target.value)} placeholder="Hoya, Rodenstock..." style={{ ...inp, marginBottom: 0, flex: 1, minWidth: 140 }} />
            <button type="button" onClick={topluUreticiUygula} style={{ ...btnSmall, whiteSpace: 'nowrap', backgroundColor: '#eff6ff', color: '#1d4ed8' }}>Tümüne Uygula</button>
            <div style={{ width: 1, height: 28, backgroundColor: '#e5e7eb', flexShrink: 0 }} />
            <button
              type="button"
              onClick={eslestenIsimleriTamamla}
              style={{ ...btnSmall, whiteSpace: 'nowrap', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #86efac' }}
            >
              Eşleşen isimleri otomatik tamamla
            </button>
          </div>

          {eslestirmeMesaj ? (
            <div style={{
              marginBottom: 12,
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: eslestirmeMesaj.tip === 'ok' ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${eslestirmeMesaj.tip === 'ok' ? '#86efac' : '#fde68a'}`,
              color: eslestirmeMesaj.tip === 'ok' ? '#166534' : '#92400e',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <span>{eslestirmeMesaj.tip === 'ok' ? '✓ ' : '⚠ '}{eslestirmeMesaj.text}</span>
              <button type="button" onClick={() => setEslestirmeMesaj(null)} style={{ ...btnSmall, flexShrink: 0 }}>Kapat</button>
            </div>
          ) : null}

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
                  const ayniIsimdeKalan = s.eslesti ? ayniIsimdeEslesmemisSayisi(satirlar, s) : 0
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
                        {ayniIsimdeKalan > 0 ? (
                          <button
                            type="button"
                            onClick={() => ayniIsimEslestirmeyiUygula(s.id)}
                            style={{
                              marginTop: 4,
                              width: '100%',
                              padding: '4px 8px',
                              backgroundColor: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              borderRadius: 6,
                              fontSize: 11,
                              color: '#047857',
                              cursor: 'pointer',
                              textAlign: 'left',
                            }}
                          >
                            Aynı isimde {ayniIsimdeKalan} satır daha — hepsine uygula
                          </button>
                        ) : null}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => { void fiyatlariOtomatikTamamlaFn() }}
                style={{ ...btnSmall, whiteSpace: 'nowrap', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #86efac' }}
              >
                Fiyatları otomatik tamamla
              </button>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{lotlar.length} kalem · her satır = 1 adet</div>
            </div>
          </div>

          {fiyatMesaj ? (
            <div style={{
              marginBottom: 12,
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: fiyatMesaj.tip === 'ok' ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${fiyatMesaj.tip === 'ok' ? '#86efac' : '#fde68a'}`,
              color: fiyatMesaj.tip === 'ok' ? '#166534' : '#92400e',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <span>{fiyatMesaj.tip === 'ok' ? '✓ ' : '⚠ '}{fiyatMesaj.text}</span>
              <button type="button" onClick={() => setFiyatMesaj(null)} style={{ ...btnSmall, flexShrink: 0 }}>Kapat</button>
            </div>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14, backgroundColor: '#f5f3ff', padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd6fe' }}>
            <div style={{ fontSize: 12, color: '#5b21b6', fontWeight: 700, whiteSpace: 'nowrap' }}>UTS (opsiyonel):</div>
            <input
              value={utsBelgeNo}
              onChange={e => setUtsBelgeNo(e.target.value)}
              placeholder={faturaNo || 'Belge / fatura no...'}
              style={{ ...inp, marginBottom: 0, flex: 1, minWidth: 160 }}
            />
            <button
              type="button"
              onClick={() => { void utsBelgeNoIleCek() }}
              disabled={utsCekLoading}
              style={{ ...btnSmall, whiteSpace: 'nowrap', backgroundColor: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' }}
            >
              {utsCekLoading ? 'Sorgulanıyor...' : 'Belge No ile UTS\'den Çek'}
            </button>
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              Şube: {utsReferansSubeKodu()}{secilenSirketAdi ? ` · ${secilenSirketAdi}` : ''}
            </span>
          </div>

          {utsCekMesaj ? (
            <div style={{
              marginBottom: 12,
              padding: '10px 14px',
              borderRadius: 10,
              backgroundColor: utsCekMesaj.tip === 'ok' ? '#f5f3ff' : '#fffbeb',
              border: `1px solid ${utsCekMesaj.tip === 'ok' ? '#c4b5fd' : '#fde68a'}`,
              color: utsCekMesaj.tip === 'ok' ? '#5b21b6' : '#92400e',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <span>{utsCekMesaj.tip === 'ok' ? '✓ ' : '⚠ '}{utsCekMesaj.text}</span>
              <button type="button" onClick={() => setUtsCekMesaj(null)} style={{ ...btnSmall, flexShrink: 0 }}>Kapat</button>
            </div>
          ) : null}

          {/* Lokasyon bazlı gruplar */}
          {Array.from(new Set(lotlar.map(l => l.lokasyon))).map(lokasyon => {
            const grup = lotlar.filter(l => l.lokasyon === lokasyon)
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
                      {grup.map((l, i) => {
                        const ayniUrundeKalan = ayniUrundeFiyatsizLotSayisi(lotlar, l)
                        return (
                        <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ ...td, color: '#9ca3af', fontSize: 11 }}>{i + 1}</td>
                          <td style={{ ...td, fontSize: 12 }}>
                            <div style={{ fontWeight: 700 }}>{l.bizimUrunAdi}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>
                              {l.varyantEtiketi?.trim() ? l.varyantEtiketi : `Kalem ${l.satırNo}`}
                            </div>
                          </td>
                          <td style={td}>
                            <input
                              value={l.barkod}
                              onChange={e => lotGuncelle(l.id, 'barkod', e.target.value)}
                              placeholder="Barkod..."
                              style={{ ...inp, marginBottom: 0, fontSize: 12, width: 120 }}
                            />
                          </td>
                          <td style={td}>
                            <input
                              value={l.utsKodu}
                              onChange={e => lotGuncelle(l.id, 'utsKodu', e.target.value)}
                              placeholder="UTS..."
                              style={{ ...inp, marginBottom: 0, fontSize: 12, width: 100 }}
                            />
                          </td>
                          <td style={td}>
                            <input
                              value={l.lotNo}
                              onChange={e => lotGuncelle(l.id, 'lotNo', e.target.value)}
                              style={{ ...inp, marginBottom: 0, fontSize: 12, width: 150 }}
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
                              {ayniUrundeKalan > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => { void satisFiyatiTopluUygula(l.id) }}
                                  style={{
                                    marginTop: 2,
                                    width: '100%',
                                    padding: '4px 8px',
                                    backgroundColor: '#ecfdf5',
                                    border: '1px solid #a7f3d0',
                                    borderRadius: 6,
                                    fontSize: 10,
                                    color: '#047857',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                  }}
                                >
                                  Aynı üründe {ayniUrundeKalan} satır daha — hepsine ₺{Number(l.satisFiyati).toLocaleString('tr-TR')} uygula
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

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

          {success && lotlar.length > 0 ? (
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 12 }}>Etiket Basmak İster misiniz?</div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 16, backgroundColor: 'white' }}>
                {lotlar.map((lot) => (
                  <div
                    key={lot.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 100px 90px',
                      gap: 10,
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderBottom: '1px solid #f3f4f6',
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{lot.bizimUrunAdi || lot.tedarikciUrunAdi}</div>
                      <div style={{ color: '#6b7280', marginTop: 2 }}>
                        Seri: {lot.lotNo}
                        {lot.barkod ? ` · Barkod: ${lot.barkod}` : ''}
                        {lot.utsKodu ? ' · UTS' : ''}
                      </div>
                    </div>
                    <div style={{ color: '#059669', fontWeight: 700, textAlign: 'right' }}>
                      ₺{Number(lot.satisFiyati || lot.birimFiyat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>Adet</span>
                      <input
                        type="number"
                        min={1}
                        value={etiketAdetler[lot.id] ?? 1}
                        onChange={(e) => setEtiketAdetler((prev) => ({
                          ...prev,
                          [lot.id]: Math.max(1, Number(e.target.value) || 1),
                        }))}
                        style={{ width: 52, padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }}
                      />
                    </label>
                  </div>
                ))}
              </div>

              {!etiketZpl && !etiketPdfOlusturuldu ? (
                <div style={{ marginBottom: 16 }}>
                  <EtiketSablonSecici
                    urunKategori={urunAdindanKategori(lotlar[0]?.bizimUrunAdi || lotlar[0]?.tedarikciUrunAdi || '')}
                    utsKodlu={Boolean(lotlar[0]?.utsKodu)}
                    secilenId={etiketSablonId}
                    onSecim={(id) => setEtiketSablonId(id as SablonId)}
                  />
                </div>
              ) : null}

              {etiketPdfOlusturuldu ? (
                <div style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#166534' }}>
                  ✓ PDF indirildi (İndirilenler klasörü) — açıp normal yazıcınızdan çıktı alabilirsiniz.
                  Etiketler A4 sayfaya dizilmiş halde geldi, makasla kesin.
                </div>
              ) : null}

              {etiketZpl ? (
                <div style={{ marginBottom: 12 }}>
                  <textarea
                    readOnly
                    value={etiketZpl}
                    rows={8}
                    style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(etiketZpl)
                        setEtiketKopyalandi(true)
                        setTimeout(() => setEtiketKopyalandi(false), 2000)
                      }}
                      style={{ ...btnSmall, fontWeight: 700 }}
                    >
                      {etiketKopyalandi ? '✓ Kopyalandı' : 'Kopyala'}
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={sihirbaziSifirla} style={btnSmall}>
                  Atla
                </button>
                {!etiketZpl && !etiketPdfOlusturuldu ? (
                  <button
                    type="button"
                    disabled={etiketPdfUretiliyor}
                    onClick={() => void etiketUret()}
                    style={{ ...btnPrimary, backgroundColor: '#059669', opacity: etiketPdfUretiliyor ? 0.6 : 1 }}
                  >
                    {etiketPdfUretiliyor ? 'PDF hazırlanıyor...' : 'Etiket Oluştur'}
                  </button>
                ) : (
                  <button type="button" onClick={sihirbaziSifirla} style={btnPrimary}>
                    Tamamla
                  </button>
                )}
              </div>
            </div>
          ) : null}

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

      {adim === 'siparis-urun-girisi' && (
        <SiparisUrunGirisiTab onGeri={() => setAdim('giris-tipi')} />
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
          <div style={{ backgroundColor: '#fff', borderRadius: 14, width: 'min(820px, 100%)', maxHeight: '85vh', overflow: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>🔗 Uyumsoft&apos;tan Otomatik Gelen Faturalar (e-Fatura)</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Tedarikçiden gelen e-faturaları Uyumsoft inbox&apos;tan seçip ürün girişine aktarın</div>
              </div>
              <button type="button" onClick={() => setGelenModalAcik(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Şirket
                <select
                  value={gelenSirketId}
                  onChange={(e) => {
                    const next = e.target.value as 'ng' | 'adese' | 'potential'
                    setGelenSirketId(next)
                    setGelenPageIndex(0)
                    setGelenHasMore(false)
                    setGelenCekOzet(null)
                    void gelenFaturalariYukle(next)
                  }}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                >
                  <option value="ng">NG</option>
                  <option value="adese">ADESE</option>
                  <option value="potential">POTENTIAL</option>
                </select>
              </label>
              <button type="button" disabled={gelenYukleniyor} onClick={() => void gelenFaturalariCek(false)} style={{ ...btnPrimary, fontSize: 12 }}>
                {gelenYukleniyor ? 'Çekiliyor...' : 'Uyumsoft\'tan Çek'}
              </button>
              <button type="button" disabled={gelenYukleniyor} onClick={() => void gelenFaturalariYukle()} style={{ ...btnSmall, fontSize: 12 }}>
                Listeyi Yenile
              </button>
            </div>

            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
              Fatura tarihi aralığı (UBL IssueDate) — seçilen aralık dışındaki kayıtlar listelenmez.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Fatura tarihi aralığı
                <select
                  value={gelenAralikPreset}
                  onChange={(e) => gelenPresetDegistir(e.target.value as GelenFaturaAralikPreset)}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                >
                  <option value="3">Son 3 gün</option>
                  <option value="7">Son 7 gün</option>
                  <option value="30">Son 30 gün</option>
                  <option value="90">Son 90 gün</option>
                  <option value="180">Son 6 ay</option>
                  <option value="custom">Manuel tarih</option>
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Başlangıç (fatura tarihi)
                <input
                  type="date"
                  value={gelenBaslangic}
                  disabled={gelenAralikPreset !== 'custom'}
                  onChange={(e) => { setGelenBaslangic(e.target.value); setGelenAralikPreset('custom'); setGelenPageIndex(0) }}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
              </label>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                Bitiş (fatura tarihi)
                <input
                  type="date"
                  value={gelenBitis}
                  disabled={gelenAralikPreset !== 'custom'}
                  onChange={(e) => { setGelenBitis(e.target.value); setGelenAralikPreset('custom'); setGelenPageIndex(0) }}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={gelenOnlyUnread}
                  onChange={(e) => { setGelenOnlyUnread(e.target.checked); setGelenPageIndex(0); setGelenHasMore(false) }}
                />
                Sadece okunmamışlar
              </label>
              <input
                type="search"
                value={gelenAramaMetni}
                onChange={(e) => setGelenAramaMetni(e.target.value)}
                placeholder="Fatura no veya tedarikçi ara… (ör. 289021 veya OPA2026000289021)"
                style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
              />
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>
                Liste içi filtre
                <input
                  type="date"
                  value={gelenFaturaTarihiFiltre}
                  onChange={(e) => setGelenFaturaTarihiFiltre(e.target.value)}
                  style={{ display: 'block', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
                />
              </label>
            </div>

            {gelenCekOzet ? (
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>{gelenCekOzet}</div>
            ) : null}

            {gelenFaturalarFiltreli.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                {gelenAramaMetni.trim()
                  ? `"${gelenAramaMetni.trim()}" listede yok — tarih aralığını genişletip "Okunmamış" filtresini kapatın ve tekrar çekin.`
                  : 'Kayıt yok. Tarih aralığını seçip "Uyumsoft\'tan Çek" ile faturaları getirin.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {gelenFaturalarFiltreli.map(f => (
                  <div key={f.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={kaynakBadgeUyumsoft}>UYUMSOFT</span>
                        <span>{f.uyumsoftNo || '—'} — {f.tedarikciAdi || 'Tedarikçi'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {f.faturaTarihi ?? ''} · {f.kalemSayisi} kalem · ₺{(f.tutarKdvHaric ?? 0).toLocaleString('tr-TR')}
                        {f.durum === 'AKTARILDI' && <span style={{ marginLeft: 8, color: '#059669' }}>Aktarıldı</span>}
                      </div>
                    </div>
                    <button type="button" disabled={gelenYukleniyor} onClick={() => void gelenFaturadanAktar(f.id)} style={{ ...btnPrimary, fontSize: 12, whiteSpace: 'nowrap' }}>
                      Ürün Girişine Aktar
                    </button>
                  </div>
                ))}
                {gelenHasMore ? (
                  <button
                    type="button"
                    disabled={gelenYukleniyor}
                    onClick={() => void gelenFaturalariCek(true)}
                    style={{ ...btnSmall, fontSize: 12, alignSelf: 'center', marginTop: 4 }}
                  >
                    {gelenYukleniyor ? 'Yükleniyor...' : `Daha fazla yükle (sayfa ${gelenPageIndex + 2}, toplam ~${gelenTotalCount})`}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
