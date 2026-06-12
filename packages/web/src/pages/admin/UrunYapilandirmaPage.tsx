import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from './AdminLayout'

const RED = '#A32D2D'
const GREEN = '#3B6D11'

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
const btnSmall: React.CSSProperties = { ...btn, padding: '5px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#374151' }

const SIRKETLER = [
  { id: 1, ad: 'Güven Optik 1959' },
  { id: 2, ad: 'NG' },
  { id: 3, ad: 'ADESE' },
  { id: 4, ad: 'POTENTIAL' },
]

const ADIMLAR = ['Kategori', 'Ürün şablonu', 'Nitelik & değer', 'Varyantlar']

type OdooKategori = { id: number; name: string; parent_id: false | [number, string]; complete_name: string }
type OdooNitelik = { id: number; name: string; value_ids: number[]; display_type: string }
type OdooNitelikDeger = { id: number; name: string; attribute_id: [number, string] }

type VaryantRow = {
  odooId: number
  name: string
  model: string
  renk: string
  olcu: string
  icReferans: string
  barkod: string
  satisFiyati: string
  maliyet: string
  durum: 'bekliyor' | 'synced'
}

function parseVaryantAttrs(name: string, degerler: OdooNitelikDeger[]) {
  const model = degerler.find((d) => d.attribute_id[1] === 'MODEL')?.name ?? ''
  const renk = degerler.find((d) => d.attribute_id[1] === 'RENK')?.name ?? ''
  const olcu = degerler.find((d) => d.attribute_id[1] === 'ÖLÇÜ')?.name ?? ''
  if (model || renk || olcu) return { model, renk, olcu }
  const parts = name.match(/\(([^)]+)\)/)?.[1]?.split(',').map((s) => s.trim()) ?? []
  return { model: parts[0] ?? '', renk: parts[1] ?? '', olcu: parts[2] ?? '' }
}

export default function UrunYapilandirmaPage() {
  const navigate = useNavigate()
  const [adim, setAdim] = useState(1)
  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const [kategoriler, setKategoriler] = useState<OdooKategori[]>([])
  const [nitelikler, setNitelikler] = useState<OdooNitelik[]>([])
  const [nitelikDegerleri, setNitelikDegerleri] = useState<OdooNitelikDeger[]>([])

  const [yeniKategori, setYeniKategori] = useState({ ad: '', parentId: '', sirket: '' })
  const [yeniNitelik, setYeniNitelik] = useState({ ad: '', displayType: 'select', degerler: '' })
  const [yeniDeger, setYeniDeger] = useState<Record<number, string>>({})
  const [degerEkleniyor, setDegerEkleniyor] = useState<Record<number, boolean>>({})

  const [sablon, setSablon] = useState({
    ad: '',
    tur: 'product',
    kategoriId: '',
    satisFiyati: '',
    maliyet: '',
    vergi: '10',
    icReferans: '',
    barkod: '',
    sirket: '',
    faturaKurali: 'order',
    izleme: 'lot',
    teslimSuresi: 0,
    agirlik: 0,
    hacim: 0,
    satilabilir: true,
    satinAlinabilir: true,
    masrafOlabilir: false,
  })

  const [aktifNitelikler, setAktifNitelikler] = useState<number[]>([])
  const [seciliDegerler, setSeciliDegerler] = useState<Record<number, number[]>>({})

  const [varyantlar, setVaryantlar] = useState<VaryantRow[]>([])
  const [tmplId, setTmplId] = useState<number | null>(null)

  const yukle = useCallback(async () => {
    const [katRes, nitRes, nitValRes] = await Promise.all([
      adminApi.get('/admin/odoo-kategoriler'),
      adminApi.get('/admin/odoo-nitelikler'),
      adminApi.get('/admin/odoo-nitelik-degerleri'),
    ])
    setKategoriler(katRes.data?.data ?? [])
    setNitelikler(nitRes.data?.data ?? [])
    setNitelikDegerleri(nitValRes.data?.data ?? [])
  }, [])

  useEffect(() => {
    void yukle().catch(() => setMesaj({ tip: 'err', text: 'Odoo verileri yüklenemedi' }))
  }, [yukle])

  const siraliKategoriler = useMemo(
    () => [...kategoriler].sort((a, b) => a.complete_name.localeCompare(b.complete_name, 'tr')),
    [kategoriler],
  )

  const sablonVaryantSayisi = useMemo(() => {
    const attrs = aktifNitelikler.filter((id) => (seciliDegerler[id]?.length ?? 0) > 0)
    if (attrs.length === 0) return 0
    return attrs.reduce((acc, attrId) => acc * (seciliDegerler[attrId]?.length ?? 0), 1)
  }, [aktifNitelikler, seciliDegerler])

  function mapVariantsToRows(raw: any[]) {
    return raw.map((v: any) => {
      const parsed = parseVaryantAttrs(v.name, nitelikDegerleri)
      return {
        odooId: v.id,
        name: v.name,
        model: parsed.model,
        renk: parsed.renk,
        olcu: parsed.olcu,
        icReferans: v.default_code || '',
        barkod: v.barcode || '',
        satisFiyati: String(v.lst_price ?? sablon.satisFiyati ?? 0),
        maliyet: String(v.standard_price ?? sablon.maliyet ?? 0),
        durum: 'bekliyor' as const,
      }
    })
  }

  function toggleSablonNitelik(attrId: number, checked: boolean) {
    if (checked) {
      setAktifNitelikler((prev) => (prev.includes(attrId) ? prev : [...prev, attrId]))
      setSeciliDegerler((prev) => ({ ...prev, [attrId]: prev[attrId] ?? [] }))
    } else {
      setAktifNitelikler((prev) => prev.filter((id) => id !== attrId))
      setSeciliDegerler((prev) => {
        const next = { ...prev }
        delete next[attrId]
        return next
      })
    }
  }

  function toggleSablonDeger(attrId: number, valueId: number, checked: boolean) {
    setSeciliDegerler((prev) => {
      const cur = prev[attrId] ?? []
      const nextVals = checked ? [...cur, valueId] : cur.filter((id) => id !== valueId)
      return { ...prev, [attrId]: nextVals }
    })
    if (checked) {
      setAktifNitelikler((prev) => (prev.includes(attrId) ? prev : [...prev, attrId]))
    }
  }

  async function kategoriKaydet() {
    if (!yeniKategori.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Kategori adı zorunlu' })
      return
    }
    setLoading(true)
    setMesaj(null)
    try {
      await adminApi.post('/admin/odoo-kategori-ekle', {
        ad: yeniKategori.ad,
        parentId: yeniKategori.parentId || undefined,
      })
      setMesaj({ tip: 'ok', text: 'Kategori Odoo\'ya kaydedildi' })
      setYeniKategori({ ad: '', parentId: '', sirket: '' })
      await yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Kayıt hatası' })
    } finally {
      setLoading(false)
    }
  }

  async function degerEkle(attributeId: number) {
    const ham = yeniDeger[attributeId] || ''
    const degerListesi = ham
      .split(/[\n,\t]+/)
      .map((d) => d.trim())
      .filter(Boolean)
      .filter((d, i, arr) => arr.indexOf(d) === i)

    if (degerListesi.length === 0) return

    if (degerListesi.length > 10) {
      const onay = window.confirm(
        `${degerListesi.length} değer eklenecek. Devam edilsin mi?`,
      )
      if (!onay) return
    }

    setDegerEkleniyor((prev) => ({ ...prev, [attributeId]: true }))
    try {
      const res = await adminApi.post('/admin/odoo-nitelik-deger-toplu-ekle', {
        attributeId,
        degerler: degerListesi,
      })
      const { eklenen, atlanan } = res.data
      alert(`${eklenen} değer eklendi${atlanan > 0 ? `, ${atlanan} zaten vardı (atlandı)` : ''}`)
      const nitRes = await adminApi.get('/admin/odoo-nitelik-degerleri')
      setNitelikDegerleri(nitRes.data?.data ?? [])
      setYeniDeger((prev) => ({ ...prev, [attributeId]: '' }))
    } catch {
      alert('Değer eklenemedi')
    } finally {
      setDegerEkleniyor((prev) => ({ ...prev, [attributeId]: false }))
    }
  }

  async function nitelikKaydet() {
    if (!yeniNitelik.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Nitelik adı zorunlu' })
      return
    }
    setLoading(true)
    setMesaj(null)
    try {
      const degerler = yeniNitelik.degerler.split(',').map((s) => s.trim()).filter(Boolean)
      await adminApi.post('/admin/odoo-nitelik-ekle', {
        ad: yeniNitelik.ad,
        displayType: yeniNitelik.displayType,
        degerler,
      })
      setMesaj({ tip: 'ok', text: 'Nitelik Odoo\'ya kaydedildi' })
      setYeniNitelik({ ad: '', displayType: 'select', degerler: '' })
      await yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Kayıt hatası' })
    } finally {
      setLoading(false)
    }
  }

  async function sablonKaydet() {
    if (!sablon.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Ürün adı zorunlu' })
      return
    }
    setLoading(true)
    setMesaj(null)
    try {
      const res = await adminApi.post('/admin/odoo-sablon-olustur', {
        ad: sablon.ad,
        tur: sablon.tur,
        kategoriId: sablon.kategoriId || undefined,
        satisFiyati: sablon.satisFiyati,
        maliyet: sablon.maliyet,
        vergi: sablon.vergi,
        icReferans: sablon.icReferans,
        barkod: sablon.barkod,
        sirketId: sablon.sirket || undefined,
        faturaKurali: sablon.faturaKurali,
        izleme: sablon.izleme,
        teslimSuresi: sablon.teslimSuresi,
        agirlik: sablon.agirlik,
        hacim: sablon.hacim,
        satilabilir: sablon.satilabilir,
        satinAlinabilir: sablon.satinAlinabilir,
        masrafOlabilir: sablon.masrafOlabilir,
      })
      setTmplId(res.data?.tmplId ?? null)
      setAktifNitelikler([])
      setSeciliDegerler({})
      setVaryantlar([])
      setMesaj({ tip: 'ok', text: 'Şablon kaydedildi — nitelik atayabilirsiniz' })
      setAdim(3)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? e?.response?.data?.message ?? 'Şablon kaydedilemedi' })
    } finally {
      setLoading(false)
    }
  }

  async function sablonNitelikAta() {
    if (!tmplId) {
      setMesaj({ tip: 'err', text: 'Önce şablon kaydedilmeli' })
      return
    }
    const nitelikPayload = aktifNitelikler
      .map((attrId) => ({
        attributeId: attrId,
        valueIds: seciliDegerler[attrId] ?? [],
      }))
      .filter((n) => n.valueIds.length > 0)
    if (nitelikPayload.length === 0) {
      setMesaj({ tip: 'err', text: 'En az bir nitelik ve değer seçin' })
      return
    }
    setLoading(true)
    setMesaj(null)
    try {
      const res = await adminApi.post('/admin/odoo-sablon-nitelik-ata', {
        tmplId,
        nitelikler: nitelikPayload,
      })
      const raw = res.data?.variants ?? []
      setVaryantlar(mapVariantsToRows(raw))
      setMesaj({ tip: 'ok', text: `${raw.length} varyant oluşturuldu` })
      setAdim(4)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? e?.response?.data?.message ?? 'Varyant oluşturulamadı' })
    } finally {
      setLoading(false)
    }
  }

  async function varyantlariSync() {
    setLoading(true)
    setMesaj(null)
    try {
      await adminApi.patch('/admin/odoo-varyant-guncelle', {
        varyantlar: varyantlar.map((v) => ({
          odooId: v.odooId,
          icReferans: v.icReferans,
          barkod: v.barkod,
          satisFiyati: v.satisFiyati,
          maliyet: v.maliyet,
        })),
      })
      setVaryantlar((prev) => prev.map((v) => ({ ...v, durum: 'synced' })))
      setMesaj({ tip: 'ok', text: 'Varyantlar Odoo\'ya senkronize edildi' })
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Sync hatası' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900 }}>Ürün Yapılandırma</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>
        Odoo ürün kategorisi, nitelik, şablon ve varyant yönetimi
      </p>

      {mesaj ? (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 700,
          backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b',
        }}>
          {mesaj.tip === 'ok' ? '✓ ' : '✕ '}{mesaj.text}
        </div>
      ) : null}

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        {ADIMLAR.map((label, i) => {
          const step = i + 1
          const done = adim > step
          const active = adim === step
          return (
            <button
              key={label}
              type="button"
              onClick={() => setAdim(step)}
              style={{
                flex: 1,
                padding: '12px 8px',
                border: 'none',
                borderRight: i < ADIMLAR.length - 1 ? '1px solid #e5e7eb' : 'none',
                backgroundColor: done ? '#f0fdf4' : active ? '#fef2f2' : '#f9fafb',
                color: done ? GREEN : active ? RED : '#6b7280',
                fontWeight: active ? 900 : done ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 10, opacity: 0.7 }}>{step}</div>
              {label}
            </button>
          )
        })}
      </div>

      {/* ADIM 1 — KATEGORİ */}
      {adim === 1 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Odoo Kategori Ağacı</div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <div style={{ fontSize: 13 }}>
                {siraliKategoriler.filter((k) => k.id !== 1).map((k) => {
                  const depth = (k.complete_name.match(/\//g) || []).length
                  return (
                    <div
                      key={k.id}
                      style={{
                        padding: '6px 8px',
                        borderBottom: '1px solid #f3f4f6',
                        paddingLeft: depth * 16 + 8,
                        cursor: 'pointer',
                        backgroundColor: sablon.kategoriId === String(k.id) ? '#f0f9ff' : undefined,
                      }}
                      onClick={() => setSablon((s) => ({ ...s, kategoriId: String(k.id) }))}
                    >
                      <span style={{ color: '#9ca3af', fontSize: 11, marginRight: 6 }}>#{k.id}</span>
                      {k.complete_name}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#f9fafb' }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Yeni Kategori</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280' }}>Kategori Adı *</label>
                <input value={yeniKategori.ad} onChange={(e) => setYeniKategori((p) => ({ ...p, ad: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280' }}>Üst Kategori</label>
                <select value={yeniKategori.parentId} onChange={(e) => setYeniKategori((p) => ({ ...p, parentId: e.target.value }))} style={inp}>
                  <option value="">— Kök (All altı) —</option>
                  <option value="1">All (kök)</option>
                  {siraliKategoriler.filter((k) => k.id !== 1).map((k) => (
                    <option key={k.id} value={k.id}>{k.complete_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280' }}>Şirket (bilgi)</label>
                <select value={yeniKategori.sirket} onChange={(e) => setYeniKategori((p) => ({ ...p, sirket: e.target.value }))} style={inp}>
                  <option value="">—</option>
                  {SIRKETLER.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => void kategoriKaydet()} disabled={loading} style={btnPrimary}>
                {loading ? 'Kaydediliyor...' : 'Odoo\'ya kaydet'}
              </button>
            </div>
            <button type="button" onClick={() => setAdim(2)} style={{ ...btnSmall, marginTop: 16, width: '100%' }}>
              Sonraki: Ürün şablonu →
            </button>
          </div>
        </div>
      ) : null}

      {/* ADIM 2 — ÜRÜN ŞABLONU */}
      {adim === 2 ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, backgroundColor: 'white' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              ['satilabilir', 'Satılabilir'],
              ['satinAlinabilir', 'Satın alınabilir'],
              ['masrafOlabilir', 'Masraf olabilir'],
            ].map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={sablon[key as keyof typeof sablon] as boolean}
                  onChange={(e) => setSablon((s) => ({ ...s, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Ürün Adı *</label>
              <input value={sablon.ad} onChange={(e) => setSablon((s) => ({ ...s, ad: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Ürün Türü</label>
              <select value={sablon.tur} onChange={(e) => setSablon((s) => ({ ...s, tur: e.target.value }))} style={inp}>
                <option value="product">Stoklanabilir</option>
                <option value="consu">Sarf</option>
                <option value="service">Hizmet</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Kategori</label>
              <select value={sablon.kategoriId} onChange={(e) => setSablon((s) => ({ ...s, kategoriId: e.target.value }))} style={inp}>
                <option value="">— Seçin —</option>
                {siraliKategoriler.map((k) => (
                  <option key={k.id} value={k.id}>{k.complete_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Şirket</label>
              <select value={sablon.sirket} onChange={(e) => setSablon((s) => ({ ...s, sirket: e.target.value }))} style={inp}>
                <option value="">—</option>
                {SIRKETLER.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Satış Fiyatı (₺)</label>
              <input type="number" value={sablon.satisFiyati} onChange={(e) => setSablon((s) => ({ ...s, satisFiyati: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Maliyet (₺)</label>
              <input type="number" value={sablon.maliyet} onChange={(e) => setSablon((s) => ({ ...s, maliyet: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Vergi (%)</label>
              <input type="number" value={sablon.vergi} onChange={(e) => setSablon((s) => ({ ...s, vergi: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>İç Referans</label>
              <input value={sablon.icReferans} onChange={(e) => setSablon((s) => ({ ...s, icReferans: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Barkod</label>
              <input value={sablon.barkod} onChange={(e) => setSablon((s) => ({ ...s, barkod: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>İzleme</label>
              <select value={sablon.izleme} onChange={(e) => setSablon((s) => ({ ...s, izleme: e.target.value }))} style={inp}>
                <option value="lot">Lot</option>
                <option value="serial">Seri</option>
                <option value="none">Yok</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Teslim Süresi (gün)</label>
              <input type="number" value={sablon.teslimSuresi} onChange={(e) => setSablon((s) => ({ ...s, teslimSuresi: Number(e.target.value) }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Ağırlık (kg)</label>
              <input type="number" value={sablon.agirlik} onChange={(e) => setSablon((s) => ({ ...s, agirlik: Number(e.target.value) }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Hacim (m³)</label>
              <input type="number" value={sablon.hacim} onChange={(e) => setSablon((s) => ({ ...s, hacim: Number(e.target.value) }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280' }}>Faturalama Kuralı</label>
              <select value={sablon.faturaKurali} onChange={(e) => setSablon((s) => ({ ...s, faturaKurali: e.target.value }))} style={inp}>
                <option value="order">Sipariş miktarı</option>
                <option value="delivery">Teslim edilen miktar</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={() => setAdim(1)} style={btnSmall}>← Kategori</button>
            <button type="button" onClick={() => void sablonKaydet()} disabled={loading} style={{ ...btnPrimary, backgroundColor: RED }}>
              {loading ? 'Kaydediliyor...' : 'Kaydet ve devam et'}
            </button>
          </div>
        </div>
      ) : null}

      {/* ADIM 3 — NİTELİK & DEĞER (şablona özel) */}
      {adim === 3 ? (
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 16 }}>
            Nitelik & değerler — {sablon.ad || 'Şablon'}
            {tmplId ? <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginLeft: 8 }}>(Odoo #{tmplId})</span> : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
              <div style={{ fontWeight: 800, marginBottom: 12 }}>Şablona nitelik ata</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid #e5e7eb', background: '#f9f9f9' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#6b7280', width: '140px' }}>Nitelik</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#6b7280', width: '120px' }}>Bu şablona ekle</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#6b7280' }}>Kullanılacak değerler</th>
                  </tr>
                </thead>
                <tbody>
                  {nitelikler.map((nitelik) => {
                    const degerler = nitelikDegerleri.filter((d) => d.attribute_id[0] === nitelik.id)
                    const aktif = aktifNitelikler.includes(nitelik.id)
                    const secili = seciliDegerler[nitelik.id] ?? []
                    return (
                      <tr key={nitelik.id} style={{ borderBottom: '0.5px solid #e5e7eb', verticalAlign: 'top' }}>
                        <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500 }}>
                          {nitelik.name}
                          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{nitelik.display_type}</div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={aktif}
                              onChange={(e) => toggleSablonNitelik(nitelik.id, e.target.checked)}
                            />
                            Ekle
                          </label>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {aktif ? (
                            degerler.length > 0 ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {degerler.map((d) => (
                                  <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={secili.includes(d.id)}
                                      onChange={(e) => toggleSablonDeger(nitelik.id, d.id, e.target.checked)}
                                    />
                                    {d.name}
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>Değer yok — sağdan ekleyin</span>
                            )
                          ) : (
                            <span style={{ fontSize: 11, color: '#d1d5db' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {sablonVaryantSayisi > 0 ? (
                <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: RED }}>
                  {sablonVaryantSayisi} varyant oluşacak
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#f9fafb' }}>
                <div style={{ fontWeight: 800, marginBottom: 12 }}>Yeni Nitelik (global)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280' }}>Nitelik Adı *</label>
                    <input value={yeniNitelik.ad} onChange={(e) => setYeniNitelik((p) => ({ ...p, ad: e.target.value }))} placeholder="ör: MODEL" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280' }}>Görünüm Tipi</label>
                    <select value={yeniNitelik.displayType} onChange={(e) => setYeniNitelik((p) => ({ ...p, displayType: e.target.value }))} style={inp}>
                      <option value="select">Select</option>
                      <option value="radio">Radio</option>
                      <option value="color">Color</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280' }}>Değerler (virgülle)</label>
                    <input value={yeniNitelik.degerler} onChange={(e) => setYeniNitelik((p) => ({ ...p, degerler: e.target.value }))} placeholder="2140, 3025, SF767" style={inp} />
                  </div>
                  <button type="button" onClick={() => void nitelikKaydet()} disabled={loading} style={btnPrimary}>
                    {loading ? 'Kaydediliyor...' : 'Odoo\'ya kaydet'}
                  </button>
                </div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
                <div style={{ fontWeight: 800, marginBottom: 12 }}>Mevcut niteliğe değer ekle</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid #e5e7eb', background: '#f9f9f9' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#6b7280', width: '100px' }}>Nitelik</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 12, color: '#6b7280' }}>Değer ekle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nitelikler.map((nitelik) => (
                      <tr key={nitelik.id} style={{ borderBottom: '0.5px solid #e5e7eb' }}>
                        <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 500 }}>{nitelik.name}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                            <textarea
                              placeholder={"Excel'den yapıştır (satır satır):\nMU1080\nMU1116\n\nveya virgülle: MU1080, MU1116"}
                              value={yeniDeger[nitelik.id] || ''}
                              onChange={(e) => setYeniDeger((prev) => ({
                                ...prev,
                                [nitelik.id]: e.target.value,
                              }))}
                              style={{
                                width: '100%',
                                fontSize: 11,
                                fontFamily: 'monospace',
                                height: 72,
                                resize: 'vertical',
                                border: '0.5px solid var(--color-border-secondary)',
                                borderRadius: 6,
                                padding: '6px 8px',
                                color: 'var(--color-text-primary)',
                                background: 'var(--color-background-primary)',
                              }}
                            />
                            <div>
                              <button
                                type="button"
                                onClick={() => void degerEkle(nitelik.id)}
                                disabled={degerEkleniyor[nitelik.id]}
                                style={{
                                  fontSize: 11,
                                  padding: '4px 12px',
                                  background: '#A32D2D',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: 6,
                                  cursor: degerEkleniyor[nitelik.id] ? 'wait' : 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {degerEkleniyor[nitelik.id] ? 'Ekleniyor...' : '+ Ekle'}
                              </button>
                              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 3 }}>
                                Satır satır veya virgülle ayırarak toplu ekle
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={() => setAdim(2)} style={btnSmall}>← Şablon</button>
            <button
              type="button"
              onClick={() => void sablonNitelikAta()}
              disabled={loading || sablonVaryantSayisi === 0}
              style={{ ...btnPrimary, backgroundColor: RED }}
            >
              {loading ? 'Oluşturuluyor...' : 'Varyantları oluştur'}
            </button>
          </div>
        </div>
      ) : null}

      {/* ADIM 4 — VARYANTLAR */}
      {adim === 4 ? (
        <div>
          {tmplId ? (
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              Şablon Odoo ID: <strong>{tmplId}</strong> · {varyantlar.length} varyant
            </div>
          ) : null}

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', backgroundColor: 'white', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {['Model', 'Renk', 'Ölçü', 'İç Ref', 'Barkod', 'Maliyet', 'Satış', 'Odoo ID', 'Durum'].map((h) => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {varyantlar.map((v, i) => (
                  <tr key={v.odooId} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 6 }}>{v.model || '—'}</td>
                    <td style={{ padding: 6 }}>{v.renk || '—'}</td>
                    <td style={{ padding: 6 }}>{v.olcu || '—'}</td>
                    <td style={{ padding: 6 }}>
                      <input
                        value={v.icReferans}
                        onChange={(e) => setVaryantlar((prev) => prev.map((x, j) => j === i ? { ...x, icReferans: e.target.value, durum: 'bekliyor' } : x))}
                        style={{ ...inp, padding: '4px 6px', width: 90 }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input
                        value={v.barkod}
                        onChange={(e) => setVaryantlar((prev) => prev.map((x, j) => j === i ? { ...x, barkod: e.target.value, durum: 'bekliyor' } : x))}
                        style={{ ...inp, padding: '4px 6px', width: 100 }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input
                        type="number"
                        value={v.maliyet}
                        onChange={(e) => setVaryantlar((prev) => prev.map((x, j) => j === i ? { ...x, maliyet: e.target.value, durum: 'bekliyor' } : x))}
                        style={{ ...inp, padding: '4px 6px', width: 70 }}
                      />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input
                        type="number"
                        value={v.satisFiyati}
                        onChange={(e) => setVaryantlar((prev) => prev.map((x, j) => j === i ? { ...x, satisFiyati: e.target.value, durum: 'bekliyor' } : x))}
                        style={{ ...inp, padding: '4px 6px', width: 70 }}
                      />
                    </td>
                    <td style={{ padding: 6, fontWeight: 700 }}>{v.odooId}</td>
                    <td style={{ padding: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        backgroundColor: v.durum === 'synced' ? '#dcfce7' : '#fef3c7',
                        color: v.durum === 'synced' ? GREEN : '#92400e',
                      }}>
                        {v.durum === 'synced' ? 'Sync' : 'Bekliyor'}
                      </span>
                    </td>
                  </tr>
                ))}
                {varyantlar.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Henüz varyant yok — önce nitelik atayıp varyant oluşturun</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <button type="button" onClick={() => void varyantlariSync()} disabled={loading || varyantlar.length === 0} style={btnPrimary}>
              {loading ? 'Sync...' : 'Odoo\'ya sync et'}
            </button>
            <button type="button" disabled style={{ ...btnSmall, opacity: 0.5 }}>Excel ile toplu giriş (yakında)</button>
            <button type="button" disabled style={{ ...btnSmall, opacity: 0.5 }}>Barkod yazdır (yakında)</button>
            <button type="button" onClick={() => setAdim(3)} style={btnSmall}>← Nitelik & değer</button>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, backgroundColor: '#f0fdf4' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Sonraki adım</div>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
              Varyantlar hazır olduğunda depo ürün girişine geçerek stok kaydı oluşturabilirsiniz.
            </p>
            <button type="button" onClick={() => navigate('/admin/depo')} style={{ ...btnPrimary, backgroundColor: GREEN }}>
              Depo ürün girişine geç →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
