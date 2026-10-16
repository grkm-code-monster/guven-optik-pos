import { useCallback, useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

// Yönetim paneli — TÜM şubelerin satışlarını görüp müdahale (KDV/reçete/durum
// düzeltme) edebilme sayfası (16.10.2026). Daha önce ADMIN sadece kendi
// şubesinin satışlarını görebiliyordu (backend GET /sales her zaman
// req.user.branchId kullanıyordu) — "admin rolünde girdiğimde diğer şubelere
// ulaşamıyorum" şikayeti. Backend tarafında ADMIN/REGIONAL_MANAGER için bu
// kısıtlama kaldırıldı (bkz. sale.controller.ts CROSS_BRANCH_SALE_ROLES);
// burada şube ve personel filtreleriyle birlikte listeleniyor.

type Branch = { id: string; name: string; code: string }
type PersonelUser = { id: string; name: string; branchId: string | null; role: string }

type SatisRow = {
  id: string
  referansNo?: string | null
  status: string
  createdAt: string
  totalAmount: number
  itemsCount: number
  itemDurum?: string | null
  customer?: { name: string; phone: string } | null
  branch?: { id: string; name: string; code: string } | null
  user?: { id: string; name: string } | null
}

type SaleItemDetail = {
  id: string
  name: string
  qty: number
  unitPrice: string | number
  discount: string | number
  taxRate: string | number | null
  taxAmount: string | number
  lineTotal: string | number
  status: string
  prescription?: Record<string, any> | null
}

type SaleDetail = {
  id: string
  status: string
  grossTotal: string | number
  discountTotal: string | number
  netTotal: string | number
  taxTotal: string | number
  customer?: { name: string; phone: string } | null
  items: SaleItemDetail[]
}

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  PAID: { label: 'Ödendi', bg: '#dcfce7', color: '#166534' },
  DRAFT: { label: 'Taslak', bg: '#fef9c3', color: '#854d0e' },
  VOID: { label: 'İptal', bg: '#fee2e2', color: '#991b1b' },
}
const ITEM_DURUM_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: 'Rezerve', bg: '#f3f4f6', color: '#374151' },
  ORDERED: { label: 'Sipariş Bekliyor', bg: '#fef9c3', color: '#854d0e' },
  IN_LAB: { label: 'Laboratuvarda', bg: '#dbeafe', color: '#1e40af' },
  READY: { label: 'Hazır', bg: '#e0f2fe', color: '#075985' },
  DELIVERED: { label: 'Teslim Edildi', bg: '#dcfce7', color: '#166534' },
}

function money(v: string | number | null | undefined) {
  if (v == null) return '—'
  return `${Number(v).toLocaleString('tr-TR')} ₺`
}

const RECETE_ALANLAR = ['r_sph', 'r_cyl', 'r_aks', 'r_add', 'l_sph', 'l_cyl', 'l_aks', 'l_add'] as const

export default function SatisYonetimPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [personeller, setPersoneller] = useState<PersonelUser[]>([])

  const [filtreSube, setFiltreSube] = useState('')
  const [filtrePersonel, setFiltrePersonel] = useState('')
  const [statusFilter, setStatusFilter] = useState('PAID')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [aramaMetin, setAramaMetin] = useState('')

  const [satislar, setSatislar] = useState<SatisRow[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detay, setDetay] = useState<SaleDetail | null>(null)
  const [detayLoading, setDetayLoading] = useState(false)
  const [detayHata, setDetayHata] = useState<string | null>(null)
  const [basari, setBasari] = useState<string | null>(null)

  const [kdvItemId, setKdvItemId] = useState<string | null>(null)
  const [kdvRate, setKdvRate] = useState('')
  const [kdvSebep, setKdvSebep] = useState('')
  const [kdvSaving, setKdvSaving] = useState(false)

  const [receteItemId, setReceteItemId] = useState<string | null>(null)
  const [receteValues, setReceteValues] = useState<Record<string, string>>({})
  const [receteSebep, setReceteSebep] = useState('')
  const [receteSaving, setReceteSaving] = useState(false)

  const [durumSaving, setDurumSaving] = useState(false)

  useEffect(() => {
    // NOT (16.10.2026): '/admin/branches' Odoo stock.location listesini
    // {success,data:[{id,name,complete_name}]} şeklinde döner (başka bir
    // amaç için var) — asıl DB şube kaydı (id/name/code) '/admin/branch-list'
    // içinde ve o da {success,data:[...]} sarmalıyla gelir. İlk denemede
    // yanlış endpoint + yanlış unwrap kullanılmıştı, bu da "satislar.map
    // is not a function" ile sayfanın anında çökmesine (bembeyaz ekran)
    // sebep oluyordu.
    adminApi.get('/admin/branch-list', { params: { tumu: 1 } })
      .then((r) => setBranches(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setBranches([]))
    adminApi.get('/admin/users')
      .then((r) => setPersoneller(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPersoneller([]))
  }, [])

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      const params: Record<string, string> = {}
      if (filtreSube) params.branchId = filtreSube
      if (filtrePersonel) params.satisUserId = filtrePersonel
      if (statusFilter) params.status = statusFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      if (aramaMetin.trim()) params.q = aramaMetin.trim()
      const res = await adminApi.get('/sales', { params })
      setSatislar(Array.isArray(res.data) ? res.data : [])
    } catch (e: any) {
      setHata(e?.response?.data?.message ?? 'Satışlar yüklenemedi.')
      setSatislar([])
    } finally {
      setYukleniyor(false)
    }
  }, [filtreSube, filtrePersonel, statusFilter, dateFrom, dateTo, aramaMetin])

  useEffect(() => {
    const handle = setTimeout(() => void yukle(), aramaMetin ? 300 : 0)
    return () => clearTimeout(handle)
  }, [yukle, aramaMetin])

  async function openDetay(id: string) {
    setSelectedId(id)
    setDetay(null)
    setDetayHata(null)
    setBasari(null)
    setKdvItemId(null)
    setReceteItemId(null)
    setDetayLoading(true)
    try {
      const res = await adminApi.get(`/sales/${id}`)
      setDetay(res.data)
    } catch (e: any) {
      setDetayHata(e?.response?.data?.message ?? 'Satış detayı alınamadı.')
    } finally {
      setDetayLoading(false)
    }
  }

  async function reloadDetay() {
    if (!selectedId) return
    try {
      const res = await adminApi.get(`/sales/${selectedId}`)
      setDetay(res.data)
    } catch {
      /* no-op — liste zaten görünür durumda */
    }
    void yukle()
  }

  async function submitKdv(itemId: string) {
    if (!selectedId) return
    const oran = parseFloat(kdvRate.replace(',', '.'))
    if (isNaN(oran) || oran < 0 || oran > 100) {
      setDetayHata('Geçerli bir KDV oranı girin (0-100).')
      return
    }
    if (kdvSebep.trim().length < 5) {
      setDetayHata('Düzeltme sebebini en az 5 karakter yazın.')
      return
    }
    setKdvSaving(true)
    setDetayHata(null)
    try {
      await adminApi.patch(`/sales/${selectedId}/kalemler/${itemId}/kdv-duzelt`, {
        taxRate: oran,
        sebep: kdvSebep.trim(),
      })
      setKdvItemId(null)
      setKdvRate('')
      setKdvSebep('')
      setBasari('KDV düzeltildi — yerel kayıt güncellendi (Odoo faturasına dokunulmadı).')
      await reloadDetay()
    } catch (e: any) {
      setDetayHata(e?.response?.data?.message ?? 'KDV düzeltilemedi.')
    } finally {
      setKdvSaving(false)
    }
  }

  function openRecete(it: SaleItemDetail) {
    const p = it.prescription ?? {}
    const vals: Record<string, string> = {}
    for (const alan of RECETE_ALANLAR) {
      vals[alan] = p[alan] != null ? String(p[alan]) : ''
    }
    setReceteValues(vals)
    setReceteItemId(it.id)
    setReceteSebep('')
  }

  async function submitRecete() {
    if (!selectedId || !receteItemId) return
    if (receteSebep.trim().length < 5) {
      setDetayHata('Düzeltme sebebini en az 5 karakter yazın.')
      return
    }
    const degisiklikler: Record<string, number | null> = {}
    for (const alan of RECETE_ALANLAR) {
      const ham = (receteValues[alan] ?? '').trim()
      if (ham === '') {
        degisiklikler[alan] = null
        continue
      }
      const sayi = parseFloat(ham.replace(',', '.'))
      if (isNaN(sayi)) {
        setDetayHata(`${alan} için geçersiz sayı.`)
        return
      }
      degisiklikler[alan] = alan.endsWith('_aks') ? Math.round(sayi) : sayi
    }
    setReceteSaving(true)
    setDetayHata(null)
    try {
      await adminApi.patch(`/sales/${selectedId}/kalemler/${receteItemId}/recete-duzelt`, {
        sebep: receteSebep.trim(),
        degisiklikler,
      })
      setReceteItemId(null)
      setReceteSebep('')
      setBasari('Reçete düzeltildi.')
      await reloadDetay()
    } catch (e: any) {
      setDetayHata(e?.response?.data?.message ?? 'Reçete düzeltilemedi.')
    } finally {
      setReceteSaving(false)
    }
  }

  async function durumDegistir(status: string) {
    if (!selectedId || !detay) return
    setDurumSaving(true)
    setDetayHata(null)
    try {
      await Promise.all(
        detay.items.map((it) => adminApi.patch(`/sales/${selectedId}/items/${it.id}/status`, { status })),
      )
      setBasari('Durum güncellendi.')
      await reloadDetay()
    } catch (e: any) {
      setDetayHata(e?.response?.data?.message ?? 'Durum güncellenemedi.')
    } finally {
      setDurumSaving(false)
    }
  }

  return (
    <div style={{ padding: 24, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <h1 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 900, color: '#1a1a2e' }}>
          Satış Yönetimi — Tüm Şubeler
        </h1>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Tüm mağazaların satışlarını şube/personel bazında filtreleyip görüntüle, hatalı KDV/reçete
          kayıtlarını buradan düzelt.
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={aramaMetin}
            onChange={(e) => setAramaMetin(e.target.value)}
            placeholder="Müşteri adı, telefon, referans no veya ID ara..."
            style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
          />
          <select
            value={filtreSube}
            onChange={(e) => setFiltreSube(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
          >
            <option value="">Tüm şubeler</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select
            value={filtrePersonel}
            onChange={(e) => setFiltrePersonel(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
          >
            <option value="">Tüm personel</option>
            {personeller
              .filter((p) => !filtreSube || p.branchId === filtreSube)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
          >
            <option value="">Tüm durumlar</option>
            <option value="PAID">Ödendi</option>
            <option value="DRAFT">Taslak</option>
            <option value="VOID">İptal</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
        </div>

        {hata && <div style={{ color: '#991b1b', background: '#fee2e2', padding: '10px 14px', borderRadius: 8, marginBottom: 12 }}>{hata}</div>}

        {yukleniyor ? (
          <div style={{ color: '#9ca3af', fontSize: 14, padding: 24, textAlign: 'center' }}>Yükleniyor...</div>
        ) : satislar.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 14, padding: 24, textAlign: 'center', background: '#f9fafb', borderRadius: 12 }}>Satış bulunamadı</div>
        ) : (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Referans</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Şube</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Personel</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Tarih</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Müşteri</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Tutar</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280' }}>Durum</th>
                  <th style={{ padding: '10px 14px' }}></th>
                </tr>
              </thead>
              <tbody>
                {satislar.map((s) => {
                  const st = (s.status === 'PAID' && s.itemDurum && ITEM_DURUM_LABEL[s.itemDurum])
                    ? ITEM_DURUM_LABEL[s.itemDurum]
                    : STATUS_LABEL[s.status] ?? { label: s.status, bg: '#f3f4f6', color: '#374151' }
                  return (
                    <tr
                      key={s.id}
                      onClick={() => void openDetay(s.id)}
                      style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: selectedId === s.id ? '#fff5f5' : 'white' }}
                    >
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{s.referansNo ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{s.branch?.name ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{s.user?.name ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{new Date(s.createdAt).toLocaleDateString('tr-TR')}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontWeight: 700 }}>{s.customer?.name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.customer?.phone ?? ''}</div>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700 }}>{money(s.totalAmount)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: st.bg, color: st.color, fontSize: 11, padding: '3px 9px', borderRadius: 999, fontWeight: 700 }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: 12, color: '#C8102E', fontWeight: 700 }}>Müdahale →</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId ? (
        <div style={{ width: 420, flexShrink: 0, position: 'sticky', top: 24, background: 'white', border: '1px solid #e5e7eb', borderRadius: 16, padding: 18, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>Müdahale Paneli</div>
            <button type="button" onClick={() => setSelectedId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>✕</button>
          </div>

          {basari && <div style={{ color: '#166534', background: '#dcfce7', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12, fontWeight: 600 }}>{basari}</div>}
          {detayHata && <div style={{ color: '#991b1b', background: '#fee2e2', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 12, fontWeight: 600 }}>{detayHata}</div>}

          {detayLoading ? (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: 16, textAlign: 'center' }}>Yükleniyor...</div>
          ) : !detay ? null : (
            <>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                {detay.customer?.name} · {detay.customer?.phone}
              </div>

              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>Durum Değiştir</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                {[
                  { label: 'Sipariş', status: 'ORDERED' },
                  { label: 'Laboratuvarda', status: 'IN_LAB' },
                  { label: 'Hazır', status: 'READY' },
                  { label: 'Teslim Edildi', status: 'DELIVERED' },
                ].map((b) => (
                  <button
                    key={b.status}
                    type="button"
                    disabled={durumSaving}
                    onClick={() => void durumDegistir(b.status)}
                    style={{ fontSize: 11, padding: '5px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: durumSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>Kalemler / KDV Düzeltme</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {detay.items.map((it) => (
                  <div key={it.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 2 }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
                      KDV %{it.taxRate != null ? Number(it.taxRate) : '—'} · {money(it.taxAmount)} · Toplam {money(it.lineTotal)}
                    </div>
                    {kdvItemId !== it.id ? (
                      <button
                        type="button"
                        onClick={() => { setKdvItemId(it.id); setKdvRate(it.taxRate != null ? String(Number(it.taxRate)) : ''); setKdvSebep('') }}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 700 }}
                      >
                        KDV Düzelt
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        <input value={kdvRate} onChange={(e) => setKdvRate(e.target.value)} placeholder="Doğru KDV oranı (%)" style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
                        <input value={kdvSebep} onChange={(e) => setKdvSebep(e.target.value)} placeholder="Düzeltme sebebi" style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" onClick={() => setKdvItemId(null)} style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 999, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>Vazgeç</button>
                          <button type="button" disabled={kdvSaving} onClick={() => void submitKdv(it.id)} style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 999, border: 'none', background: '#C8102E', color: 'white', fontWeight: 700, cursor: kdvSaving ? 'not-allowed' : 'pointer' }}>
                            {kdvSaving ? '...' : 'Kaydet'}
                          </button>
                        </div>
                      </div>
                    )}

                    {it.prescription ? (
                      receteItemId !== it.id ? (
                        <button
                          type="button"
                          onClick={() => openRecete(it)}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 700, marginTop: 6 }}
                        >
                          Reçete Düzelt
                        </button>
                      ) : (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                            {RECETE_ALANLAR.map((alan) => (
                              <div key={alan}>
                                <label style={{ fontSize: 9, color: '#6b7280', fontWeight: 700 }}>{alan.toUpperCase().replace('_', ' ')}</label>
                                <input
                                  value={receteValues[alan] ?? ''}
                                  onChange={(e) => setReceteValues((prev) => ({ ...prev, [alan]: e.target.value }))}
                                  style={{ width: '100%', padding: '4px 6px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, marginTop: 2 }}
                                />
                              </div>
                            ))}
                          </div>
                          <input value={receteSebep} onChange={(e) => setReceteSebep(e.target.value)} placeholder="Düzeltme sebebi" style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={() => setReceteItemId(null)} style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 999, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer' }}>Vazgeç</button>
                            <button type="button" disabled={receteSaving} onClick={() => void submitRecete()} style={{ flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 999, border: 'none', background: '#C8102E', color: 'white', fontWeight: 700, cursor: receteSaving ? 'not-allowed' : 'pointer' }}>
                              {receteSaving ? '...' : 'Kaydet'}
                            </button>
                          </div>
                        </div>
                      )
                    ) : null}
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#6b7280' }}>Ara toplam</span><span>{money(detay.grossTotal)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#6b7280' }}>KDV</span><span>{money(detay.taxTotal)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}><span>Genel toplam</span><span>{money(detay.netTotal)}</span></div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
