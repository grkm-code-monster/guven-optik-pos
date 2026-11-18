/**
 * 18.11.2026 — Kalem Ekle → "🕶️ Hazır Güneş Camı" penceresi.
 * Personel Hammadde / Özellik / Renk / Baz / Kaplama düğmelerinden seçer; sistem barkoddan
 * (086800002 + kombinasyon) doğru VP. HAZIR GÜNEŞ CAMI kartını bulur, fiyatını getirir.
 * Sağ ve sol ayrı satır olarak eklenir (stok/lot adımı her cam için ayrı çalışsın diye);
 * "Sol, Sağ ile aynı" işaretliyse tek seçimle iki satır eklenir.
 * Olmayan kombinasyonların düğmeleri pasiftir.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { apiClient } from '../../api/client'
import { addItem, getSaleById, updateItem } from '../../api/sales.api'
import type { Sale, SaleItem } from '../../api/types'
import {
  ALAN_SIRASI,
  DIGER_RENK_KODU,
  GUNES_CAMLARI_KATEGORI_ID,
  barkodCoz,
  barkodOlustur,
  bosSecim,
  secenekMumkunMu,
  secimTamMi,
  type GunesSecim,
} from '../../utils/hazirGunesCami'
import { nitelikCoz, nitelikOlustur } from '../../utils/ozelIslem'

type Kart = { variantId: number; name: string; barcode: string; price: number }

type Taraf = { secim: GunesSecim; not: string; fiyat: string; indirim: string }

function bosTaraf(): Taraf {
  return { secim: bosSecim(), not: '', fiyat: '', indirim: '0' }
}

function sayi(v: string): number {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export default function HazirGunesCamiModal(props: {
  saleId: string
  /** Düzenlenen tek satır (bir cam) — verilirse sadece o satır güncellenir */
  duzenlenen?: SaleItem | null
  onClose: () => void
  onSaved: (sale: Sale) => void
}) {
  const { saleId, duzenlenen, onClose, onSaved } = props
  const [kartlar, setKartlar] = useState<Kart[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const ilkTaraf = useMemo(() => (duzenlenen ? nitelikCoz(duzenlenen.maintenanceNature) : null), [duzenlenen])
  const [sag, setSagAcik] = useState(() => (ilkTaraf ? ilkTaraf.sag : true))
  const [sol, setSolAcik] = useState(() => (ilkTaraf ? ilkTaraf.sol && !ilkTaraf.sag : true))
  const [ayni, setAyni] = useState(true)
  const [sagT, setSagT] = useState<Taraf>(() =>
    duzenlenen
      ? {
          secim: bosSecim(),
          not: (ilkTaraf?.sagDeger?.Detay ?? '') as string,
          fiyat: String(duzenlenen.unitPrice ?? ''),
          indirim: String(duzenlenen.discount ?? '0'),
        }
      : bosTaraf(),
  )
  const [solT, setSolT] = useState<Taraf>(bosTaraf())

  useEffect(() => {
    let iptal = false
    apiClient
      .get('/sales/hazir-gunes-camlari')
      .then((res) => {
        if (iptal) return
        const liste = (res.data?.urunler ?? []) as Kart[]
        setKartlar(liste)
        if (duzenlenen?.odooProductId) {
          const k = liste.find((x) => String(x.variantId) === String(duzenlenen.odooProductId))
          const c = barkodCoz(k?.barcode)
          if (c) setSagT((t) => ({ ...t, secim: c }))
        }
      })
      .catch(() => {
        if (!iptal) setHata('Güneş camı listesi alınamadı. İnterneti kontrol edip tekrar deneyin.')
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false)
      })
    return () => {
      iptal = true
    }
  }, [duzenlenen])

  const barkodlar = useMemo(() => new Set(kartlar.map((k) => k.barcode)), [kartlar])
  const kartByBarkod = useMemo(() => new Map(kartlar.map((k) => [k.barcode, k])), [kartlar])

  // Düzenlemede tek satır: sadece bir taraf seçilebilir
  function tarafDegistir(t: 'sag' | 'sol') {
    if (duzenlenen) {
      setSagAcik(t === 'sag')
      setSolAcik(t === 'sol')
      return
    }
    if (t === 'sag') {
      if (sag && !sol) return
      setSagAcik(!sag)
    } else {
      if (sol && !sag) return
      setSolAcik(!sol)
    }
  }

  // Düzenlemede seçim her zaman sagT'de tutulur (tek satır)
  const ciftKutu = !duzenlenen && sag && sol && !ayni
  const tekBaslik = duzenlenen ? (sag ? 'SAĞ' : 'SOL') : sag && sol ? 'SAĞ + SOL' : sag ? 'SAĞ' : 'SOL'

  function kartBul(t: Taraf): Kart | null {
    if (!secimTamMi(t.secim)) return null
    return kartByBarkod.get(barkodOlustur(t.secim)) ?? null
  }

  function secimYaz(hangi: 'sag' | 'sol', yeni: GunesSecim) {
    const set = hangi === 'sag' ? setSagT : setSolT
    set((t) => {
      const eskiKart = kartBul(t)
      const yeniKart = secimTamMi(yeni) ? (kartByBarkod.get(barkodOlustur(yeni)) ?? null) : null
      // Kart değiştiyse fiyatı kartın fiyatına çek (elle girilmiş fiyat, aynı kartta korunur)
      const fiyat = yeniKart && yeniKart.variantId !== eskiKart?.variantId ? String(yeniKart.price) : t.fiyat
      return { ...t, secim: yeni, fiyat }
    })
  }

  async function kaydet() {
    setHata(null)
    // Satırlar: [taraf adı, taraf verisi]
    const satirlar: Array<{ taraf: 'Sağ' | 'Sol'; t: Taraf }> = []
    if (duzenlenen) satirlar.push({ taraf: sag ? 'Sağ' : 'Sol', t: sagT })
    else {
      if (sag) satirlar.push({ taraf: 'Sağ', t: sagT })
      if (sol) satirlar.push({ taraf: 'Sol', t: ayni && sag ? sagT : solT })
    }
    const hazir: Array<{ taraf: 'Sağ' | 'Sol'; t: Taraf; kart: Kart; f: number; ind: number }> = []
    for (const s of satirlar) {
      const ad = ciftKutu ? `${s.taraf.toLocaleUpperCase('tr-TR')} cam: ` : ''
      if (!secimTamMi(s.t.secim)) {
        setHata(`${ad}Hammadde, Özellik, Renk, Baz ve Kaplama seçilmeli.`)
        return
      }
      const kart = kartBul(s.t)
      if (!kart) {
        setHata(`${ad}Bu kombinasyonda kart yok.`)
        return
      }
      if (s.t.secim.renk === DIGER_RENK_KODU && !s.t.not.trim()) {
        setHata(`${ad}"Diğer" renk seçildi — renk adını Not alanına yazın.`)
        return
      }
      const f = sayi(s.t.fiyat)
      const ind = sayi(s.t.indirim || '0')
      if (!Number.isFinite(f) || f < 0) {
        setHata(`${ad}Fiyat geçersiz.`)
        return
      }
      if (!Number.isFinite(ind) || ind < 0 || ind > f) {
        setHata(`${ad}İndirim geçersiz.`)
        return
      }
      hazir.push({ ...s, kart, f, ind })
    }
    setKaydediliyor(true)
    let eklenen = 0
    try {
      for (const h of hazir) {
        const payload = {
          productId: `odoo_${h.kart.variantId}`,
          odooProductId: String(h.kart.variantId),
          odooProductName: h.kart.name,
          odooCategoryId: GUNES_CAMLARI_KATEGORI_ID,
          qty: 1,
          unitPrice: h.f.toFixed(2),
          discount: h.ind.toFixed(2),
          maintenanceNature: nitelikOlustur({
            sag: h.taraf === 'Sağ',
            sol: h.taraf === 'Sol',
            ayni: true,
            sagDeger: h.t.not.trim() ? { Detay: h.t.not.trim() } : {},
            solDeger: h.t.not.trim() ? { Detay: h.t.not.trim() } : {},
          }),
          maintenanceDescription: null,
        }
        if (duzenlenen) await updateItem(saleId, duzenlenen.id, payload)
        else await addItem(saleId, payload)
        eklenen++
      }
      onSaved(await getSaleById(saleId))
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; error?: string } } }
      const m = err?.response?.data?.message ?? err?.response?.data?.error ?? 'Kaydedilemedi.'
      if (eklenen > 0) {
        // İlk cam eklendi, ikincisi eklenemedi — tekrar denemede ilki ikinci kez eklenmesin
        onSaved(await getSaleById(saleId))
        window.alert(`${eklenen} cam eklendi ama diğeri eklenemedi (${m}). Eksik camı tekrar ekleyin.`)
        onClose()
      } else setHata(m)
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={kutu} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>🕶️ Hazır Güneş Camı {duzenlenen ? '— Düzenle' : ''}</div>
          <button type="button" onClick={onClose} style={kapatBtn} aria-label="Kapat">
            ✕
          </button>
        </div>

        {yukleniyor ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor…</div>
        ) : kartlar.length === 0 ? (
          <div style={{ fontSize: 13, color: '#b91c1c' }}>Güneş camı kartı bulunamadı.</div>
        ) : (
          <>
            <Baslik>Hangi cam</Baslik>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={() => tarafDegistir('sag')} style={chip(sag, false)}>
                {sag ? '✓ ' : ''}Sağ
              </button>
              <button type="button" onClick={() => tarafDegistir('sol')} style={chip(sol, false)}>
                {sol ? '✓ ' : ''}Sol
              </button>
              {!duzenlenen && sag && sol ? (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    marginLeft: 6,
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" checked={ayni} onChange={(e) => setAyni(e.target.checked)} />
                  Sol, Sağ ile aynı
                </label>
              ) : null}
            </div>

            {duzenlenen || sag ? (
              <SecimKutusu
                baslik={ciftKutu ? 'SAĞ' : tekBaslik}
                t={sagT}
                barkodlar={barkodlar}
                kart={kartBul(sagT)}
                onSecim={(s) => secimYaz('sag', s)}
                onT={(p) => setSagT((t) => ({ ...t, ...p }))}
              />
            ) : null}
            {!duzenlenen && sol && (!sag || !ayni) ? (
              <SecimKutusu
                baslik="SOL"
                t={solT}
                barkodlar={barkodlar}
                kart={kartBul(solT)}
                onSecim={(s) => secimYaz('sol', s)}
                onT={(p) => setSolT((t) => ({ ...t, ...p }))}
              />
            ) : null}
            {!duzenlenen && sag && sol && ayni ? (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                Sağ ve sol için ayrı iki satır eklenir (fiyat cam başınadır).
              </div>
            ) : null}
          </>
        )}

        {hata ? <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>{hata}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={ikincilBtn}>
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => void kaydet()}
            disabled={kaydediliyor || yukleniyor || kartlar.length === 0}
            style={birincilBtn(kaydediliyor || yukleniyor || kartlar.length === 0)}
          >
            {kaydediliyor ? 'Kaydediliyor…' : duzenlenen ? 'Güncelle' : 'Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SecimKutusu(props: {
  baslik: string
  t: Taraf
  barkodlar: Set<string>
  kart: Kart | null
  onSecim: (s: GunesSecim) => void
  onT: (p: Partial<Taraf>) => void
}) {
  const { baslik, t, barkodlar, kart, onSecim, onT } = props
  const tam = secimTamMi(t.secim)
  return (
    <div
      style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 10, padding: '4px 12px 12px', background: '#fafafa' }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, color: '#111', marginTop: 8 }}>{baslik}</div>
      {ALAN_SIRASI.map(({ alan, baslik: b, secenekler }) => (
        <div key={alan}>
          <Baslik>{b}</Baslik>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {secenekler.map((o) => {
              const secili = t.secim[alan] === o.kod
              const mumkun = secili || secenekMumkunMu(barkodlar, t.secim, alan, o.kod)
              return (
                <button
                  key={o.kod}
                  type="button"
                  disabled={!mumkun}
                  title={mumkun ? '' : 'Bu seçimlerle böyle bir cam yok'}
                  onClick={() => onSecim({ ...t.secim, [alan]: secili ? '' : o.kod })}
                  style={chip(secili, !mumkun)}
                >
                  {o.ad}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <Baslik>Not {t.secim.renk === DIGER_RENK_KODU ? '(renk adı zorunlu)' : '(isteğe bağlı)'}</Baslik>
      <input
        value={t.not}
        onChange={(e) => onT({ not: e.target.value })}
        placeholder={t.secim.renk === DIGER_RENK_KODU ? 'Renk adı (örn. Mavi)' : 'Örn. ayna rengi, özel istek'}
        style={input}
      />
      <div
        style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: kart ? '#ecfdf5' : '#f3f4f6', fontSize: 12 }}
      >
        {kart ? (
          <>
            <div style={{ fontWeight: 800 }}>{kart.name}</div>
            <div style={{ color: '#6b7280' }}>
              Barkod {kart.barcode} · Liste fiyatı {kart.price.toLocaleString('tr-TR')} ₺
            </div>
          </>
        ) : tam ? (
          <span style={{ color: '#b91c1c', fontWeight: 700 }}>Bu kombinasyonda kart yok.</span>
        ) : (
          <span style={{ color: '#6b7280' }}>Seçimleri tamamlayın.</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
        <label>
          <Baslik>Fiyat (₺, cam başı)</Baslik>
          <input value={t.fiyat} onChange={(e) => onT({ fiyat: e.target.value })} inputMode="decimal" style={input} />
        </label>
        <label>
          <Baslik>İndirim (₺)</Baslik>
          <input value={t.indirim} onChange={(e) => onT({ indirim: e.target.value })} inputMode="decimal" style={input} />
        </label>
      </div>
    </div>
  )
}

function Baslik({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        margin: '12px 0 6px',
      }}
    >
      {children}
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  padding: 12,
}

const kutu: CSSProperties = {
  background: 'white',
  borderRadius: 14,
  padding: 18,
  width: '100%',
  maxWidth: 560,
  maxHeight: '92vh',
  overflowY: 'auto',
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
}

const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 14,
}

function chip(aktif: boolean, pasif: boolean): CSSProperties {
  return {
    padding: '7px 12px',
    borderRadius: 999,
    border: `1px solid ${aktif ? '#111827' : '#d1d5db'}`,
    background: aktif ? '#111827' : pasif ? '#f3f4f6' : 'white',
    color: aktif ? 'white' : pasif ? '#c0c4cc' : '#111',
    fontSize: 13,
    fontWeight: 700,
    cursor: pasif ? 'not-allowed' : 'pointer',
    textDecoration: pasif ? 'line-through' : 'none',
  }
}

const kapatBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 18,
  cursor: 'pointer',
  color: '#6b7280',
}

const ikincilBtn: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #d1d5db',
  background: 'white',
  fontWeight: 700,
  cursor: 'pointer',
}

function birincilBtn(pasif: boolean): CSSProperties {
  return {
    padding: '10px 18px',
    borderRadius: 10,
    border: 'none',
    background: pasif ? '#9ca3af' : '#111827',
    color: 'white',
    fontWeight: 800,
    cursor: pasif ? 'not-allowed' : 'pointer',
  }
}
