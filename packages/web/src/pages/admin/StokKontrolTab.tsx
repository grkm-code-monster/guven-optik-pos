import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getOdooKategoriler,
  getStokKontrol,
  olusturTransferTalebi,
  type StokKontrolUrun,
} from '../../api/stok.api'

const LOKASYONLAR = ['GVN1', 'GVN3', 'GVN4', 'GVN6', 'GVN8', 'GVN9', 'GVN2', 'GVN10', 'ANADEPO', 'GVN5']

const LOKASYON_ID_MAP: Record<string, number> = {
  GVN1: 53, GVN3: 54, GVN4: 55, GVN6: 56, GVN8: 57, GVN9: 58,
  GVN2: 59, GVN10: 60, ANADEPO: 61, GVN5: 62,
}

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
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, verticalAlign: 'top' }

function kullanilabilir(l: { miktar: number; reserved: number }) {
  return Math.max(0, l.miktar - l.reserved)
}

function primaryStockBranch(u: StokKontrolUrun): string | null {
  let best: { kod: string; qty: number } | null = null
  for (const l of u.lokasyonlar) {
    const k = kullanilabilir(l)
    if (k > 0 && (!best || k > best.qty)) best = { kod: l.kod, qty: k }
  }
  return best?.kod ?? null
}

function lokasyonOzet(urun: StokKontrolUrun): string {
  return LOKASYONLAR.map((kod) => {
    const row = urun.lokasyonlar.find((l) => l.kod === kod)
    const miktar = row?.miktar ?? 0
    return `${kod}: ${miktar} adet`
  }).join(', ')
}

function lokasyonBadgeStyle(miktar: number): React.CSSProperties {
  if (miktar > 0) {
    return {
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 700,
      backgroundColor: '#dcfce7',
      color: '#166534',
      marginRight: 6,
      marginBottom: 4,
    }
  }
  return {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    backgroundColor: '#f3f4f6',
    color: '#9ca3af',
    marginRight: 6,
    marginBottom: 4,
  }
}

export default function StokKontrolTab() {
  const [kategoriler, setKategoriler] = useState<Array<{ id: number; complete_name: string }>>([])
  const [arama, setArama] = useState('')
  const [kategoriId, setKategoriId] = useState('')
  const [fiyatMin, setFiyatMin] = useState('')
  const [fiyatMax, setFiyatMax] = useState('')
  const [stokDurumu, setStokDurumu] = useState<'tumu' | 'var' | 'sifir'>('tumu')
  const [sadeceStokta, setSadeceStokta] = useState(true)
  const [lokasyon, setLokasyon] = useState('')
  const [kdv, setKdv] = useState('')
  const [urunler, setUrunler] = useState<StokKontrolUrun[]>([])
  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)
  const [searched, setSearched] = useState(false)
  const [secili, setSecili] = useState<Set<number>>(new Set())
  const [transferAcik, setTransferAcik] = useState(false)
  const [hedefSube, setHedefSube] = useState('')
  const [transferYukleniyor, setTransferYukleniyor] = useState(false)

  const seciliUrunler = useMemo(
    () => urunler.filter((u) => secili.has(u.productId)),
    [urunler, secili],
  )

  useEffect(() => {
    getOdooKategoriler().then((k) => setKategoriler(k)).catch(() => {})
  }, [])

  const ara = useCallback(async () => {
    const hasFilter = arama.trim() || kategoriId || fiyatMin || fiyatMax
      || stokDurumu !== 'tumu' || lokasyon || kdv
    if (!hasFilter) {
      setMesaj({ tip: 'err', text: 'En az bir filtre seçin veya arama yapın.' })
      return
    }
    setLoading(true)
    setMesaj(null)
    setSearched(true)
    setSecili(new Set())
    try {
      const effectiveStokDurumu = sadeceStokta
        ? 'var'
        : (stokDurumu !== 'tumu' ? stokDurumu : undefined)
      const data = await getStokKontrol({
        q: arama.trim() || undefined,
        kategoriId: kategoriId ? Number(kategoriId) : undefined,
        fiyatMin: fiyatMin ? Number(fiyatMin) : undefined,
        fiyatMax: fiyatMax ? Number(fiyatMax) : undefined,
        stokDurumu: effectiveStokDurumu,
        lokasyon: lokasyon || undefined,
        kdv: kdv ? Number(kdv) : undefined,
      })
      setUrunler(data)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Stok kontrol verisi alınamadı' })
      setUrunler([])
    } finally {
      setLoading(false)
    }
  }, [arama, kategoriId, fiyatMin, fiyatMax, stokDurumu, sadeceStokta, lokasyon, kdv])

  function toggleSec(id: number) {
    setSecili((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTumu() {
    const transferEdilebilir = urunler.filter((u) => primaryStockBranch(u))
    if (secili.size === transferEdilebilir.length && transferEdilebilir.length > 0) {
      setSecili(new Set())
    } else {
      setSecili(new Set(transferEdilebilir.map((u) => u.productId)))
    }
  }

  function transferModalAc() {
    if (!seciliUrunler.length) return
    const stoksuz = seciliUrunler.filter((u) => !primaryStockBranch(u))
    if (stoksuz.length) {
      setMesaj({ tip: 'err', text: 'Stokta olmayan ürün seçili — transfer yapılamaz.' })
      return
    }
    setHedefSube('')
    setTransferAcik(true)
  }

  async function transferOlustur() {
    if (!hedefSube) {
      setMesaj({ tip: 'err', text: 'Hedef şube seçin.' })
      return
    }
    const hedefId = LOKASYON_ID_MAP[hedefSube]
    if (!hedefId) return

    const kalemler = []
    for (const u of seciliUrunler) {
      const kaynakKod = primaryStockBranch(u)
      if (!kaynakKod) continue
      const kaynakId = LOKASYON_ID_MAP[kaynakKod]
      if (!kaynakId || kaynakId === hedefId) {
        setMesaj({ tip: 'err', text: `"${u.urunAdi}" için geçersiz kaynak/hedef şube.` })
        return
      }
      kalemler.push({
        kaynak: kaynakId,
        hedef: hedefId,
        productId: u.productId,
        lotId: null,
        miktar: 1,
        urunAdi: u.urunAdi,
      })
    }

    if (!kalemler.length) return

    setTransferYukleniyor(true)
    try {
      const res = await olusturTransferTalebi(kalemler)
      if (!res?.success) throw new Error(res?.error ?? 'Transfer oluşturulamadı')
      const hatali = (res.transferler ?? []).filter((t: any) => t.tip === 'stok-hatasi')
      if (hatali.length) {
        setMesaj({ tip: 'err', text: hatali.map((h: any) => h.hata).join('; ') })
      } else {
        setMesaj({ tip: 'ok', text: 'Transfer talebi oluşturuldu.' })
        setSecili(new Set())
        setTransferAcik(false)
        void ara()
      }
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? e?.message ?? 'Transfer oluşturulamadı' })
    } finally {
      setTransferYukleniyor(false)
    }
  }

  const transferEdilebilirIds = urunler.filter((u) => primaryStockBranch(u)).map((u) => u.productId)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>Filtreler</div>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Arama</span>
          <input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void ara() }}
            placeholder="Ürün adı / iç ref"
            style={{ ...inp, marginTop: 4 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Kategori</span>
          <select value={kategoriId} onChange={(e) => setKategoriId(e.target.value)} style={{ ...inp, marginTop: 4 }}>
            <option value="">Tümü</option>
            {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.complete_name}</option>)}
          </select>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <label>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Min ₺</span>
            <input type="number" value={fiyatMin} onChange={(e) => setFiyatMin(e.target.value)} style={{ ...inp, marginTop: 4 }} />
          </label>
          <label>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Max ₺</span>
            <input type="number" value={fiyatMax} onChange={(e) => setFiyatMax(e.target.value)} style={{ ...inp, marginTop: 4 }} />
          </label>
        </div>

        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Stok durumu</span>
          <select
            value={stokDurumu}
            onChange={(e) => {
              const v = e.target.value as 'tumu' | 'var' | 'sifir'
              setStokDurumu(v)
              if (v === 'sifir') setSadeceStokta(false)
            }}
            style={{ ...inp, marginTop: 4 }}
          >
            <option value="tumu">Tümü</option>
            <option value="var">Stokta var</option>
            <option value="sifir">Stok sıfır</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={sadeceStokta}
            onChange={(e) => {
              setSadeceStokta(e.target.checked)
              if (e.target.checked && stokDurumu === 'sifir') setStokDurumu('tumu')
            }}
          />
          <span style={{ color: sadeceStokta ? '#1a1a2e' : '#374151', fontWeight: sadeceStokta ? 600 : 400 }}>
            Sadece stokta olanlar
          </span>
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Şube</span>
          <select value={lokasyon} onChange={(e) => setLokasyon(e.target.value)} style={{ ...inp, marginTop: 4 }}>
            <option value="">Tümü</option>
            {LOKASYONLAR.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>KDV</span>
          <select value={kdv} onChange={(e) => setKdv(e.target.value)} style={{ ...inp, marginTop: 4 }}>
            <option value="">Tümü</option>
            <option value="10">%10</option>
            <option value="20">%20</option>
          </select>
        </label>

        <button type="button" onClick={() => void ara()} disabled={loading} style={{ ...btnPrimary, width: '100%', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Aranıyor...' : 'Ara'}
        </button>
      </div>

      <div>
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

        {secili.size > 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
            padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{secili.size} ürün seçildi</span>
            <button type="button" onClick={transferModalAc} style={{ ...btn, backgroundColor: '#2563eb', color: 'white' }}>
              Transfer Talebi Oluştur
            </button>
            <button type="button" onClick={() => setSecili(new Set())} style={btn}>Seçimi Temizle</button>
          </div>
        ) : null}

        <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>
          ) : !searched ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Filtre seçip Ara&apos;ya basın.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ ...th, width: 36 }}>
                    <input
                      type="checkbox"
                      checked={transferEdilebilirIds.length > 0 && secili.size === transferEdilebilirIds.length}
                      onChange={toggleTumu}
                      disabled={!transferEdilebilirIds.length}
                    />
                  </th>
                  <th style={th}>Ürün Adı</th>
                  <th style={th}>Kategori</th>
                  <th style={th}>Satış ₺</th>
                  <th style={th}>KDV</th>
                  <th style={th}>Toplam</th>
                  <th style={th}>Şube / Lokasyon Stokları</th>
                </tr>
              </thead>
              <tbody>
                {urunler.map((u) => {
                  const kaynak = primaryStockBranch(u)
                  return (
                    <tr key={u.productId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={secili.has(u.productId)}
                          onChange={() => toggleSec(u.productId)}
                          disabled={!kaynak}
                          title={kaynak ? undefined : 'Stok yok — seçilemez'}
                        />
                      </td>
                      <td style={{ ...td, fontWeight: 700, maxWidth: 240 }}>{u.urunAdi}</td>
                      <td style={{ ...td, fontSize: 12, color: '#6b7280', maxWidth: 160 }}>{u.kategori || '—'}</td>
                      <td style={td}>{u.satisFiyati?.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) ?? '—'}</td>
                      <td style={td}>%{Math.round(u.kdvOrani ?? 0)}</td>
                      <td style={{ ...td, fontWeight: 800, whiteSpace: 'nowrap' }}>{u.toplamStok}</td>
                      <td style={td}>
                        <div style={{ marginBottom: 6 }}>
                          {LOKASYONLAR.map((kod) => {
                            const row = u.lokasyonlar.find((l) => l.kod === kod)
                            const miktar = row?.miktar ?? 0
                            return (
                              <span key={kod} style={lokasyonBadgeStyle(miktar)}>
                                {kod}: {miktar}
                              </span>
                            )
                          })}
                        </div>
                        {kaynak ? (
                          <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>
                            Kaynak: {kaynak} ({kullanilabilir(u.lokasyonlar.find((l) => l.kod === kaynak)!)} kullanılabilir)
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
                            Bu ürün hiçbir şubede stokta değil.
                          </div>
                        )}
                        {u.toplamStok > 0 ? (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }} title={lokasyonOzet(u)}>
                            {lokasyonOzet(u)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
                {!urunler.length ? (
                  <tr>
                    <td colSpan={7} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                      Eşleşen ürün bulunamadı.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {transferAcik ? (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Transfer Talebi</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              {seciliUrunler.length} ürün — kaynak şube otomatik (stokta olan şube)
            </div>

            <ul style={{ fontSize: 12, color: '#374151', marginBottom: 16, paddingLeft: 18, maxHeight: 120, overflow: 'auto' }}>
              {seciliUrunler.map((u) => (
                <li key={u.productId} style={{ marginBottom: 4 }}>
                  {u.urunAdi.slice(0, 50)} → <strong>{primaryStockBranch(u)}</strong>
                </li>
              ))}
            </ul>

            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Hedef şube</span>
              <select value={hedefSube} onChange={(e) => setHedefSube(e.target.value)} style={{ ...inp, marginTop: 4 }}>
                <option value="">— Seçin —</option>
                {LOKASYONLAR.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setTransferAcik(false)} disabled={transferYukleniyor} style={btn}>
                İptal
              </button>
              <button type="button" onClick={() => void transferOlustur()} disabled={transferYukleniyor || !hedefSube} style={{ ...btnPrimary, backgroundColor: '#2563eb' }}>
                {transferYukleniyor ? 'Oluşturuluyor...' : 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
