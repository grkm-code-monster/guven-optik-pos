import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  etiketMerkeziAra,
  etiketMerkeziOkut,
  getEtiketBasimGecmisi,
  getEtiketMerkeziLokasyonlar,
  type EtiketAraSonuc,
  type EtiketGrup,
  type EtiketMerkeziFiltre,
  type EtiketSatir,
  type Kombinasyon,
} from '../../api/etiketMerkezi.api'
import EtiketBasModal, { type EtiketModalUrun } from '../../components/etiket/EtiketBasModal'
import EtiketSablonDuzenleyici from './EtiketSablonDuzenleyici'

/**
 * 13.11.2026 — Etiket Merkezi.
 * Sekme 1 "Etiket Bas": okutarak ya da filtreyle çerçeve/güneş gözlüğü (lot) bulup baskı listesine ekleme,
 *   tek seferde basma; her basım geçmişe yazılır ("son etiket" bilgisi).
 * Sekme 2 "Şablonlar": etiket şablon düzenleyici (eski "Etiket Şablonları (Yeni)" sayfası).
 */

const BUGUN = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
const GUN_ONCE = (n: number) => {
  const d = new Date(`${BUGUN()}T12:00:00+03:00`)
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}
const trTarih = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const s = iso.length === 10 ? `${iso}T12:00:00+03:00` : iso
  return new Date(s).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })
}
const tl = (n: number | null | undefined) =>
  n == null ? '—' : `${Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`

const BOS_FILTRE: EtiketMerkeziFiltre = {
  lokasyonlar: [],
  tur: '',
  girisBas: '',
  girisBit: '',
  q: '',
  marka: '',
  model: '',
  renk: '',
  olcu: '',
  gruplar: [],
  fiyatMin: '',
  fiyatMax: '',
  uts: '',
  barkod: '',
  parti: '',
  kaynak: '',
  etiket: '',
  etiketBas: '',
  etiketBit: '',
}

const GRUPLAR: EtiketGrup[] = ['ALT', 'ORTA', 'ORTA ÜST', 'ÜST']
const LISTE_ANAHTAR = 'etiketMerkeziBaskiListesi'
const KONUM_ANAHTAR = 'etiketMerkeziKonum'

function depoOku<T>(anahtar: string, varsayilan: T): T {
  try {
    const raw = localStorage.getItem(anahtar)
    return raw ? (JSON.parse(raw) as T) : varsayilan
  } catch {
    return varsayilan
  }
}
function depoYaz(anahtar: string, deger: unknown) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger))
  } catch {
    // tarayıcı depolaması kapalıysa sadece bu oturumda tutulur
  }
}

function bip(basarili: boolean) {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = basarili ? 1200 : 300
    g.gain.value = 0.08
    o.connect(g)
    g.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + (basarili ? 0.08 : 0.35))
    o.onended = () => void ctx.close()
  } catch {
    // ses yoksa sessiz devam
  }
}

function nitelik(s: EtiketSatir) {
  return [s.model, s.renk, s.olcu].filter(Boolean).join(' / ')
}

function fiyatDegismis(s: EtiketSatir) {
  return !!s.sonBasim && s.sonBasim.fiyat != null && Math.abs(s.sonBasim.fiyat - s.fiyat) >= 0.01
}

function SonEtiket({ s }: { s: EtiketSatir }) {
  if (!s.sonBasim) return <span style={{ color: '#b45309', fontWeight: 700 }}>⚠️ basılmamış</span>
  const degisti = fiyatDegismis(s)
  return (
    <span style={{ color: degisti ? '#b91c1c' : '#047857', fontWeight: 600 }}>
      {degisti ? '⚠️' : '✓'} {trTarih(s.sonBasim.basildi)} · {tl(s.sonBasim.fiyat)}
      {degisti ? ` → şimdi ${tl(s.fiyat)}` : ''}
    </span>
  )
}

// ───────────────────────── stiller ─────────────────────────
const kutu: React.CSSProperties = { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }
const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', width: '100%' }
const etk: React.CSSProperties = { fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 4, display: 'block' }
const btn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }
const btnAna: React.CSSProperties = { ...btn, border: 'none', backgroundColor: '#1a1a2e', color: 'white' }
const btnYesil: React.CSSProperties = { ...btn, border: 'none', backgroundColor: '#059669', color: 'white' }
const grupBaslik: React.CSSProperties = { fontSize: 12, fontWeight: 900, color: '#374151', margin: '0 0 8px', letterSpacing: 0.3 }

function Hap({ secili, onClick, children }: { secili: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: secili ? '1px solid #2563eb' : '1px solid #d1d5db',
        backgroundColor: secili ? '#eff6ff' : 'white', color: secili ? '#1d4ed8' : '#374151',
      }}
    >
      {children}
    </button>
  )
}

/** Bağlı açılır liste: yazılabilir + o anki diğer seçimlere göre daralan öneriler (adetli). */
function BagliListe({
  id, etiket, deger, secenekler, onChange, yerTutucu,
}: {
  id: string
  etiket: string
  deger: string
  secenekler: { deger: string; adet: number }[]
  onChange: (v: string) => void
  yerTutucu?: string
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={etk}>{etiket}{secenekler.length ? ` (${secenekler.length})` : ''}</span>
      <input
        list={id}
        value={deger}
        placeholder={yerTutucu ?? (secenekler.length ? 'Seçin ya da yazın' : 'Önce Ara')}
        onChange={(e) => onChange(e.target.value)}
        style={inp}
      />
      <datalist id={id}>
        {secenekler.map((o) => (
          <option key={o.deger} value={o.deger}>{`${o.deger} (${o.adet})`}</option>
        ))}
      </datalist>
    </label>
  )
}

function topla(komb: Kombinasyon[], alan: keyof Omit<Kombinasyon, 'adet'>) {
  const m = new Map<string, number>()
  for (const k of komb) {
    const v = k[alan]
    if (!v) continue
    m.set(v, (m.get(v) ?? 0) + k.adet)
  }
  return [...m.entries()]
    .map(([deger, adet]) => ({ deger, adet }))
    .sort((a, b) => a.deger.localeCompare(b.deger, 'tr', { numeric: true }))
}
const ayni = (a: string, b: string) => a.toLocaleUpperCase('tr-TR') === b.toLocaleUpperCase('tr-TR')

type OkutKaydi = { id: number; ok: boolean; mesaj: string }
type Siralama = 'giris' | 'marka' | 'fiyat' | 'etiket'

export default function EtiketMerkeziPage() {
  const [params, setParams] = useSearchParams()
  const sekme = params.get('sekme') === 'sablonlar' ? 'sablonlar' : 'bas'

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>🏷️ Etiket Merkezi</h1>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Optik çerçeve ve güneş gözlüğü etiketleri — okutarak ya da filtreyle bulun, tek seferde basın.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {([['bas', '🖨️ Etiket Bas'], ['sablonlar', '🧩 Şablonlar']] as const).map(([id, ad]) => (
          <button
            key={id}
            type="button"
            onClick={() => setParams(id === 'bas' ? {} : { sekme: id })}
            style={{
              padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14,
              fontWeight: 800, color: sekme === id ? '#1d4ed8' : '#6b7280',
              borderBottom: sekme === id ? '3px solid #2563eb' : '3px solid transparent', marginBottom: -1,
            }}
          >
            {ad}
          </button>
        ))}
      </div>
      {sekme === 'bas' ? <EtiketBasSekmesi /> : <EtiketSablonDuzenleyici />}
    </div>
  )
}

function EtiketBasSekmesi() {
  const [konumlar, setKonumlar] = useState<{ kod: string; adet: number }[]>([])
  const [konum, setKonum] = useState<string>(() => depoOku(KONUM_ANAHTAR, 'GVN2'))
  const [mod, setMod] = useState<'okut' | 'filtre'>('filtre')
  const [form, setForm] = useState<EtiketMerkeziFiltre>(BOS_FILTRE)
  const [uygulanan, setUygulanan] = useState<EtiketMerkeziFiltre | null>(null)
  const [sonuc, setSonuc] = useState<EtiketAraSonuc | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [secili, setSecili] = useState<Set<string>>(new Set())
  const [kapali, setKapali] = useState<Set<string>>(new Set())
  const [gosterilen, setGosterilen] = useState(150)
  const [siralama, setSiralama] = useState<Siralama>('giris')
  const [detayAcik, setDetayAcik] = useState(true)
  const [liste, setListe] = useState<EtiketSatir[]>(() => depoOku<EtiketSatir[]>(LISTE_ANAHTAR, []))
  const [okutKod, setOkutKod] = useState('')
  const [okutuluyor, setOkutuluyor] = useState(false)
  const [okutLog, setOkutLog] = useState<OkutKaydi[]>([])
  const [okutSayac, setOkutSayac] = useState(0)
  const [modalUrunleri, setModalUrunleri] = useState<EtiketModalUrun[]>([])
  const [bilgi, setBilgi] = useState<string | null>(null)
  const okutRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getEtiketMerkeziLokasyonlar().then(setKonumlar).catch(() => setKonumlar([]))
  }, [])
  useEffect(() => depoYaz(LISTE_ANAHTAR, liste), [liste])
  useEffect(() => depoYaz(KONUM_ANAHTAR, konum), [konum])
  useEffect(() => {
    if (mod === 'okut') setTimeout(() => okutRef.current?.focus(), 50)
  }, [mod])

  const listeAnahtarlari = useMemo(() => new Set(liste.map((s) => s.key)), [liste])

  // ── arama ──
  const ara = useCallback(async (f: EtiketMerkeziFiltre, ek?: { sonParti?: boolean }) => {
    setYukleniyor(true)
    setHata(null)
    try {
      const istek = { ...f, lokasyonlar: konum ? [konum] : [] }
      const r = await etiketMerkeziAra({ ...istek, ...(ek ?? {}) } as EtiketMerkeziFiltre)
      const yeniForm = r.uygulananParti ? { ...f, parti: r.uygulananParti } : f
      setForm(yeniForm)
      setUygulanan(yeniForm)
      setSonuc(r)
      setSecili(new Set())
      setKapali(new Set())
      setGosterilen(150)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setHata(err?.response?.data?.error ?? err?.message ?? 'Arama yapılamadı')
    } finally {
      setYukleniyor(false)
    }
  }, [konum])

  function araFormdan(e?: React.FormEvent) {
    e?.preventDefault()
    void ara(form)
  }

  function hazir(tip: 'bugun' | 'yedi' | 'fiyat' | 'hic' | 'parti' | 'utssuz') {
    const temel: EtiketMerkeziFiltre = { ...BOS_FILTRE, tur: form.tur }
    if (tip === 'bugun') void ara({ ...temel, girisBas: BUGUN(), girisBit: BUGUN() })
    if (tip === 'yedi') void ara({ ...temel, girisBas: GUN_ONCE(6), girisBit: BUGUN() })
    if (tip === 'fiyat') void ara({ ...temel, etiket: 'fiyat' })
    if (tip === 'hic') void ara({ ...temel, etiket: 'hic' })
    if (tip === 'utssuz') void ara({ ...temel, uts: 'yok' })
    if (tip === 'parti') void ara(temel, { sonParti: true })
  }

  const filtreDegisti = uygulanan != null && JSON.stringify(uygulanan) !== JSON.stringify(form)
  const set = <K extends keyof EtiketMerkeziFiltre>(k: K, v: EtiketMerkeziFiltre[K]) => setForm((p) => ({ ...p, [k]: v }))

  // ── bağlı listeler ──
  const komb = sonuc?.kombinasyonlar ?? []
  const markaSec = topla(komb, 'marka')
  const k1 = form.marka ? komb.filter((k) => ayni(k.marka, form.marka)) : komb
  const modelSec = topla(k1, 'model')
  const k2 = form.model ? k1.filter((k) => ayni(k.model, form.model)) : k1
  const renkSec = topla(k2, 'renk')
  const k3 = form.renk ? k2.filter((k) => ayni(k.renk, form.renk)) : k2
  const olcuSec = topla(k3, 'olcu')

  // ── sonuçlar (varyant + konum gruplu) ──
  const gruplar = useMemo(() => {
    const satirlar = [...(sonuc?.satirlar ?? [])]
    const m = new Map<string, EtiketSatir[]>()
    for (const s of satirlar) {
      const k = `${s.varyantId}|${s.lokasyon}`
      const l = m.get(k) ?? []
      l.push(s)
      m.set(k, l)
    }
    const liste = [...m.entries()].map(([k, satir]) => ({ k, satir, ilk: satir[0] }))
    const enYeniGiris = (g: { satir: EtiketSatir[] }) => g.satir.reduce((a, s) => ((s.girisTarihi ?? '') > a ? s.girisTarihi ?? '' : a), '')
    const enEskiEtiket = (g: { satir: EtiketSatir[] }) => g.satir.reduce((a, s) => {
      const t = s.sonBasim?.basildi ?? ''
      return t < a ? t : a
    }, '9999')
    liste.sort((a, b) => {
      if (siralama === 'giris') return enYeniGiris(b).localeCompare(enYeniGiris(a)) || a.ilk.marka.localeCompare(b.ilk.marka, 'tr')
      if (siralama === 'fiyat') return b.ilk.fiyat - a.ilk.fiyat
      if (siralama === 'etiket') return enEskiEtiket(a).localeCompare(enEskiEtiket(b))
      return a.ilk.marka.localeCompare(b.ilk.marka, 'tr') || a.ilk.model.localeCompare(b.ilk.model, 'tr', { numeric: true })
        || a.ilk.renk.localeCompare(b.ilk.renk, 'tr', { numeric: true })
    })
    return liste
  }, [sonuc, siralama])

  const tumSatirlar = sonuc?.satirlar ?? []
  const secilebilir = tumSatirlar.filter((s) => !listeAnahtarlari.has(s.key))
  const tumuSecili = secilebilir.length > 0 && secilebilir.every((s) => secili.has(s.key))

  function toggle(keys: string[], durum?: boolean) {
    setSecili((prev) => {
      const n = new Set(prev)
      const hepsi = keys.every((k) => n.has(k))
      const ekle = durum ?? !hepsi
      for (const k of keys) {
        if (ekle) n.add(k)
        else n.delete(k)
      }
      return n
    })
  }

  function listeyeEkle(satirlar: EtiketSatir[]) {
    setListe((prev) => {
      const var_ = new Set(prev.map((s) => s.key))
      return [...prev, ...satirlar.filter((s) => !var_.has(s.key))]
    })
  }

  function seciliEkle() {
    const eklenecek = tumSatirlar.filter((s) => secili.has(s.key) && !listeAnahtarlari.has(s.key))
    listeyeEkle(eklenecek)
    setSecili(new Set())
    setBilgi(`${eklenecek.length} ürün baskı listesine eklendi`)
    setTimeout(() => setBilgi(null), 3000)
  }

  // ── okutma ──
  async function okut(e?: React.FormEvent) {
    e?.preventDefault()
    const kod = okutKod.trim()
    if (!kod || okutuluyor) return
    setOkutKod('')
    setOkutuluyor(true)
    const id = Date.now()
    try {
      const r = await etiketMerkeziOkut(
        kod,
        konum,
        liste.map((s) => s.lotId).filter((x): x is number => !!x),
        liste.map((s) => s.quantId),
      )
      if (r.ok) {
        listeyeEkle([r.satir])
        setOkutSayac((n) => n + 1)
        bip(true)
        setOkutLog((p) => [{ id, ok: true, mesaj: `✅ ${r.satir.sablonAdi} ${nitelik(r.satir)} — ${r.satir.lotAdi ?? ''} eklendi` }, ...p].slice(0, 8))
      } else {
        bip(false)
        const nerede = r.digerKonumlar?.length ? ` (stokta olduğu yer: ${r.digerKonumlar.map((d) => `${d.lokasyon} ${d.adet}`).join(', ')})` : ''
        setOkutLog((p) => [{ id, ok: false, mesaj: `⛔ ${r.mesaj}${nerede} — okutulan: ${kod.slice(0, 40)}` }, ...p].slice(0, 8))
      }
    } catch (err: unknown) {
      bip(false)
      const e2 = err as { response?: { data?: { error?: string } }; message?: string }
      setOkutLog((p) => [{ id, ok: false, mesaj: `⛔ ${e2?.response?.data?.error ?? e2?.message ?? 'Okutma hatası'}` }, ...p].slice(0, 8))
    } finally {
      setOkutuluyor(false)
      setTimeout(() => okutRef.current?.focus(), 30)
    }
  }

  // ── baskı ──
  // Pencere açılırken listenin o anki hali alınır (basım sonrası liste tazelenince pencere sıfırlanmasın)
  const listedenModalUrunleri = (): EtiketModalUrun[] => liste.map((s) => ({
    key: s.key,
    urunAdi: s.sablonAdi,
    seriNo: s.lotAdi ?? '-',
    fiyat: s.fiyat,
    barkod: s.barkod,
    secili: true,
    categAdi: s.kategori,
    renkVaryant: nitelik(s),
    utsKodu: s.utsKodu,
    utsKodlu: !!s.utsKodu,
    lotNo: s.lotAdi,
    adet: s.lotId ? 1 : s.adet,
    lotId: s.lotId,
    varyantId: s.varyantId,
    lokasyon: s.lokasyon,
  }))

  async function basildiktanSonra() {
    // Son basım bilgisini listede ve sonuçlarda tazele
    try {
      const lotIds = liste.map((s) => s.lotId).filter((x): x is number => !!x)
      const varIds = liste.filter((s) => !s.lotId).map((s) => s.varyantId)
      const g = await getEtiketBasimGecmisi(lotIds, varIds)
      const yenile = (s: EtiketSatir): EtiketSatir => {
        const b = s.lotId ? g.lot[String(s.lotId)] : g.varyant[String(s.varyantId)]
        return b ? { ...s, sonBasim: b } : s
      }
      setListe((p) => p.map(yenile))
      setSonuc((p) => (p ? { ...p, satirlar: p.satirlar.map(yenile) } : p))
      setBilgi('Basım geçmişine yazıldı ✓')
      setTimeout(() => setBilgi(null), 4000)
    } catch {
      // geçmiş tazelenemezse sorun değil
    }
  }

  const listeFiyatDegisen = liste.filter(fiyatDegismis).length

  return (
    <div>
      {/* Üst çubuk */}
      <div style={{ ...kutu, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
        <label style={{ minWidth: 220 }}>
          <span style={etk}>Konum (mağaza / depo)</span>
          <select value={konum} onChange={(e) => setKonum(e.target.value)} style={inp}>
            <option value="">Tüm konumlar</option>
            {konumlar.map((k) => (
              <option key={k.kod} value={k.kod}>{k.kod} — {k.adet} çerçeve/güneş</option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <Hap secili={mod === 'okut'} onClick={() => setMod('okut')}>📷 Okutarak</Hap>
          <Hap secili={mod === 'filtre'} onClick={() => setMod('filtre')}>🔎 Filtreyle</Hap>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: '#6b7280' }}>Yazıcı ve şablon, "Etiket Bas" penceresinde seçilir.</div>
      </div>

      {mod === 'okut' ? (
        <div style={{ ...kutu, marginBottom: 12 }}>
          <form onSubmit={okut} style={{ display: 'flex', gap: 8 }}>
            <input
              ref={okutRef}
              value={okutKod}
              onChange={(e) => setOkutKod(e.target.value)}
              placeholder={konum ? 'UTS karekodu, ürün barkodu ya da lot no okutun…' : 'Okutmak için önce bir konum seçin'}
              disabled={!konum}
              autoComplete="off"
              style={{ ...inp, fontSize: 18, padding: '14px 16px', fontFamily: 'monospace' }}
            />
            <button type="submit" disabled={!konum || okutuluyor} style={{ ...btnAna, minWidth: 90 }}>
              {okutuluyor ? '…' : 'Ekle ⏎'}
            </button>
          </form>
          <div style={{ display: 'flex', justifyContent: 'space-between', margin: '10px 0 6px', fontSize: 12, color: '#6b7280' }}>
            <span>Okutulan her ürün aşağıdaki baskı listesine eklenir. Barkod okutulursa o konumdaki, listede olmayan sıradaki adet eklenir.</span>
            <span style={{ fontWeight: 800, color: '#111827' }}>{okutSayac} okutma</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {okutLog.map((l) => (
              <div
                key={l.id}
                style={{
                  fontSize: 13, padding: '6px 10px', borderRadius: 8,
                  backgroundColor: l.ok ? '#ecfdf5' : '#fef2f2', color: l.ok ? '#065f46' : '#991b1b',
                }}
              >
                {l.mesaj}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={araFormdan} style={{ ...kutu, marginBottom: 12 }}>
          {/* Katman 1: akıllı arama */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={form.q}
              onChange={(e) => set('q', e.target.value)}
              placeholder="Marka, model, renk, ölçü, barkod, lot no, UTS… (kelime kelime — hepsi geçmeli)"
              style={{ ...inp, fontSize: 15, padding: '11px 14px' }}
            />
            <button type="submit" disabled={yukleniyor} style={{ ...btnAna, minWidth: 110, fontSize: 14 }}>
              {yukleniyor ? 'Aranıyor…' : '🔍 ARA'}
            </button>
          </div>

          {/* Katman 2: hazır düğmeler */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <Hap secili={false} onClick={() => hazir('bugun')}>📥 Bugün girenler</Hap>
            <Hap secili={false} onClick={() => hazir('yedi')}>📥 Son 7 gün</Hap>
            <Hap secili={false} onClick={() => hazir('fiyat')}>💰 Fiyatı değişti, etiketi eski</Hap>
            <Hap secili={false} onClick={() => hazir('hic')}>🏷️ Hiç etiketi basılmamış</Hap>
            <Hap secili={false} onClick={() => hazir('parti')}>📦 Son aktarım partisi</Hap>
            <Hap secili={false} onClick={() => hazir('utssuz')}>⚠️ UTS'siz</Hap>
          </div>

          {/* Katman 3: detaylı filtreler */}
          <button type="button" onClick={() => setDetayAcik((v) => !v)} style={{ ...btn, padding: '4px 10px', fontSize: 12, marginBottom: detayAcik ? 12 : 0 }}>
            {detayAcik ? '▾ Detaylı filtreleri gizle' : '▸ Detaylı filtreler'}
          </button>
          {detayAcik ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              <div style={{ ...kutu, padding: 12 }}>
                <p style={grupBaslik}>👓 NE</p>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  <Hap secili={form.tur === ''} onClick={() => set('tur', '')}>Hepsi</Hap>
                  <Hap secili={form.tur === 'CERCEVE'} onClick={() => set('tur', 'CERCEVE')}>Optik Çerçeve</Hap>
                  <Hap secili={form.tur === 'GUNES'} onClick={() => set('tur', 'GUNES')}>Güneş Gözlüğü</Hap>
                </div>
                <span style={etk}>Fiyat grubu</span>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  {GRUPLAR.map((g) => (
                    <Hap
                      key={g}
                      secili={form.gruplar.includes(g)}
                      onClick={() => set('gruplar', form.gruplar.includes(g) ? form.gruplar.filter((x) => x !== g) : [...form.gruplar, g])}
                    >
                      {g}
                    </Hap>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <BagliListe id="em-marka" etiket="Marka" deger={form.marka} secenekler={markaSec}
                    onChange={(v) => setForm((p) => ({ ...p, marka: v, model: '', renk: '', olcu: '' }))} />
                  <BagliListe id="em-model" etiket="Model" deger={form.model} secenekler={modelSec}
                    onChange={(v) => setForm((p) => ({ ...p, model: v, renk: '', olcu: '' }))} />
                  <BagliListe id="em-renk" etiket="Renk" deger={form.renk} secenekler={renkSec}
                    onChange={(v) => setForm((p) => ({ ...p, renk: v, olcu: '' }))} />
                  <BagliListe id="em-olcu" etiket="Ölçü" deger={form.olcu} secenekler={olcuSec}
                    onChange={(v) => set('olcu', v)} />
                </div>
              </div>

              <div style={{ ...kutu, padding: 12 }}>
                <p style={grupBaslik}>💰 FİYAT</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  <label><span style={etk}>En az (₺)</span>
                    <input value={form.fiyatMin} onChange={(e) => set('fiyatMin', e.target.value)} inputMode="decimal" style={inp} /></label>
                  <label><span style={etk}>En çok (₺)</span>
                    <input value={form.fiyatMax} onChange={(e) => set('fiyatMax', e.target.value)} inputMode="decimal" style={inp} /></label>
                </div>
                <p style={grupBaslik}>🔖 KİMLİK</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label><span style={etk}>UTS</span>
                    <select value={form.uts} onChange={(e) => set('uts', e.target.value as EtiketMerkeziFiltre['uts'])} style={inp}>
                      <option value="">Hepsi</option><option value="var">UTS'li</option><option value="yok">UTS'siz</option>
                    </select></label>
                  <label><span style={etk}>Barkod</span>
                    <select value={form.barkod} onChange={(e) => set('barkod', e.target.value as EtiketMerkeziFiltre['barkod'])} style={inp}>
                      <option value="">Hepsi</option><option value="var">Barkodlu</option><option value="yok">Barkodsuz</option>
                    </select></label>
                </div>
              </div>

              <div style={{ ...kutu, padding: 12 }}>
                <p style={grupBaslik}>📥 GELİŞ</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <label><span style={etk}>Giriş tarihi (başlangıç)</span>
                    <input type="date" value={form.girisBas} onChange={(e) => set('girisBas', e.target.value)} style={inp} /></label>
                  <label><span style={etk}>Giriş tarihi (bitiş)</span>
                    <input type="date" value={form.girisBit} onChange={(e) => set('girisBit', e.target.value)} style={inp} /></label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label><span style={etk}>Kaynak</span>
                    <select value={form.kaynak} onChange={(e) => set('kaynak', e.target.value as EtiketMerkeziFiltre['kaynak'])} style={inp}>
                      <option value="">Hepsi</option>
                      <option value="ENVANTER">Envanter / sayım girişi</option>
                      <option value="TRANSFER">Transferle geldi</option>
                      <option value="ALIM">Alım (tedarikçi)</option>
                      <option value="IADE">Müşteri iadesi</option>
                    </select></label>
                  <label><span style={etk}>Aktarım partisi</span>
                    <select value={form.parti} onChange={(e) => set('parti', e.target.value)} style={inp}>
                      <option value="">{sonuc ? 'Hepsi' : 'Önce Ara'}</option>
                      {(sonuc?.partiler ?? []).map((p) => (
                        <option key={p.parti} value={p.parti}>{p.etiket} — {p.adet} ürün</option>
                      ))}
                    </select></label>
                </div>
              </div>

              <div style={{ ...kutu, padding: 12 }}>
                <p style={grupBaslik}>🏷️ ETİKET DURUMU</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <Hap secili={form.etiket === ''} onClick={() => set('etiket', '')}>Hepsi</Hap>
                  <Hap secili={form.etiket === 'hic'} onClick={() => set('etiket', 'hic')}>Hiç basılmamış</Hap>
                  <Hap secili={form.etiket === 'fiyat'} onClick={() => set('etiket', 'fiyat')}>Fiyatı değişmiş</Hap>
                  <Hap secili={form.etiket === 'once'} onClick={() => set('etiket', 'once')}>Şu tarihten beri basılmamış</Hap>
                  <Hap secili={form.etiket === 'aralik'} onClick={() => set('etiket', 'aralik')}>Son basım tarih aralığı</Hap>
                </div>
                {form.etiket === 'once' || form.etiket === 'aralik' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label><span style={etk}>{form.etiket === 'once' ? 'Bu tarihten beri basılmamış' : 'Başlangıç'}</span>
                      <input type="date" value={form.etiketBas} onChange={(e) => set('etiketBas', e.target.value)} style={inp} /></label>
                    {form.etiket === 'aralik' ? (
                      <label><span style={etk}>Bitiş</span>
                        <input type="date" value={form.etiketBit} onChange={(e) => set('etiketBit', e.target.value)} style={inp} /></label>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 }}>
            {filtreDegisti ? <span style={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>Filtre değişti — uygulamak için Ara'ya basın</span> : null}
            <button type="button" onClick={() => setForm({ ...BOS_FILTRE })} style={btn}>Temizle</button>
            <button type="submit" disabled={yukleniyor} style={btnAna}>{yukleniyor ? 'Aranıyor…' : '🔍 ARA'}</button>
          </div>
        </form>
      )}

      {hata ? <div style={{ ...kutu, borderColor: '#fecaca', color: '#991b1b', marginBottom: 12 }}>{hata}</div> : null}
      {bilgi ? <div style={{ ...kutu, borderColor: '#a7f3d0', color: '#065f46', marginBottom: 12, fontWeight: 700 }}>{bilgi}</div> : null}

      {/* Sonuçlar */}
      {mod === 'filtre' && sonuc ? (
        <div style={{ ...kutu, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>
              {sonuc.toplam} ürün bulundu ({gruplar.length} varyant)
              {sonuc.kesildi ? <span style={{ color: '#b45309', fontSize: 12 }}> — ilk {sonuc.satirlar.length} gösteriliyor, filtreyi daraltın</span> : null}
            </div>
            <div style={{ flex: 1 }} />
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              Sırala:
              <select value={siralama} onChange={(e) => setSiralama(e.target.value as Siralama)} style={{ ...inp, width: 'auto', padding: '4px 8px' }}>
                <option value="giris">Giriş tarihi (yeni → eski)</option>
                <option value="marka">Marka / model</option>
                <option value="fiyat">Fiyat (yüksek → düşük)</option>
                <option value="etiket">Son etiket (eski → yeni)</option>
              </select>
            </label>
            <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={tumuSecili} onChange={() => toggle(secilebilir.map((s) => s.key), !tumuSecili)} />
              Tümünü seç
            </label>
            <button type="button" disabled={!secili.size} onClick={seciliEkle} style={{ ...btnYesil, opacity: secili.size ? 1 : 0.5 }}>
              ➕ Seçilenleri baskı listesine ekle ({secili.size})
            </button>
          </div>

          {!gruplar.length ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Bu filtreyle ürün bulunamadı.</div>
          ) : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
              {gruplar.slice(0, gosterilen).map((g) => {
                const keys = g.satir.filter((s) => !listeAnahtarlari.has(s.key)).map((s) => s.key)
                const grupSecili = keys.length > 0 && keys.every((k) => secili.has(k))
                const acik = !kapali.has(g.k)
                return (
                  <div key={g.k} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '24px 24px 1fr auto auto', gap: 8, alignItems: 'center', padding: '8px 12px', backgroundColor: '#f9fafb' }}>
                      <input type="checkbox" checked={grupSecili} disabled={!keys.length} onChange={() => toggle(keys)} />
                      <button
                        type="button"
                        onClick={() => setKapali((p) => { const n = new Set(p); if (n.has(g.k)) n.delete(g.k); else n.add(g.k); return n })}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12 }}
                      >
                        {acik ? '▾' : '▸'}
                      </button>
                      <div style={{ fontSize: 13 }}>
                        <b>{g.ilk.sablonAdi}</b>
                        <span style={{ color: '#374151' }}> · {nitelik(g.ilk) || '—'}</span>
                        <span style={{ color: '#6b7280' }}> · {g.ilk.lokasyon} · {g.satir.reduce((a, s) => a + s.adet, 0)} adet</span>
                        {g.ilk.barkod ? <span style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: 11 }}> · {g.ilk.barkod}</span> : null}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{g.ilk.grup}</div>
                      <div style={{ fontWeight: 800, color: '#059669', fontSize: 13 }}>{tl(g.ilk.fiyat)}</div>
                    </div>
                    {acik ? g.satir.map((s) => {
                      const listede = listeAnahtarlari.has(s.key)
                      return (
                        <label
                          key={s.key}
                          style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, alignItems: 'center', padding: '6px 12px 6px 44px', fontSize: 12, cursor: listede ? 'default' : 'pointer', opacity: listede ? 0.55 : 1 }}
                        >
                          <input type="checkbox" checked={listede || secili.has(s.key)} disabled={listede} onChange={() => toggle([s.key])} />
                          <div>
                            <span style={{ fontFamily: 'monospace' }}>{s.lotAdi ?? '(lotsuz)'}</span>
                            <span style={{ color: s.utsKodu ? '#047857' : '#b45309' }}> · UTS {s.utsKodu ? '✓' : '—'}</span>
                            <span style={{ color: '#6b7280' }}> · giriş {trTarih(s.girisTarihi)}</span>
                            {!s.lotId && s.adet > 1 ? <span style={{ color: '#6b7280' }}> · {s.adet} adet</span> : null}
                            {listede ? <span style={{ color: '#2563eb', fontWeight: 700 }}> · listede</span> : null}
                          </div>
                          <div><SonEtiket s={s} /></div>
                        </label>
                      )
                    }) : null}
                  </div>
                )
              })}
            </div>
          )}
          {gruplar.length > gosterilen ? (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <button type="button" onClick={() => setGosterilen((n) => n + 150)} style={btn}>
                Daha fazla göster ({gruplar.length - gosterilen} varyant daha)
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Baskı listesi */}
      <div style={{ ...kutu, borderColor: liste.length ? '#93c5fd' : '#e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: liste.length ? 10 : 0, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>🧾 Baskı listesi ({liste.length})</div>
          {listeFiyatDegisen ? <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>{listeFiyatDegisen} üründe etiketteki fiyat eski</span> : null}
          <div style={{ flex: 1 }} />
          {liste.length ? <button type="button" onClick={() => setListe([])} style={btn}>Temizle</button> : null}
          <button
            type="button"
            disabled={!liste.length}
            onClick={() => setModalUrunleri(listedenModalUrunleri())}
            style={{ ...btnYesil, fontSize: 14, padding: '10px 18px', opacity: liste.length ? 1 : 0.5 }}
          >
            🖨️ {liste.reduce((a, s) => a + (s.lotId ? 1 : s.adet), 0)} ETİKET BAS
          </button>
        </div>
        {!liste.length ? (
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
            Liste boş. Okutarak ya da filtre sonuçlarından seçip ekleyin. Liste bu bilgisayarda hatırlanır.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280' }}>
                  <th style={{ padding: 6 }}>Ürün</th>
                  <th style={{ padding: 6 }}>Model / Renk / Ölçü</th>
                  <th style={{ padding: 6 }}>Seri / Lot</th>
                  <th style={{ padding: 6 }}>UTS</th>
                  <th style={{ padding: 6 }}>Konum</th>
                  <th style={{ padding: 6, textAlign: 'right' }}>Fiyat</th>
                  <th style={{ padding: 6 }}>Son etiket</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {liste.map((s) => (
                  <tr key={s.key} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 6, fontWeight: 700 }}>{s.sablonAdi}</td>
                    <td style={{ padding: 6 }}>{nitelik(s) || '—'}</td>
                    <td style={{ padding: 6, fontFamily: 'monospace' }}>{s.lotAdi ?? `(lotsuz · ${s.adet} adet)`}</td>
                    <td style={{ padding: 6 }}>{s.utsKodu ? '✓' : '—'}</td>
                    <td style={{ padding: 6 }}>{s.lokasyon}</td>
                    <td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>{tl(s.fiyat)}</td>
                    <td style={{ padding: 6 }}><SonEtiket s={s} /></td>
                    <td style={{ padding: 6, textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setListe((p) => p.filter((x) => x.key !== s.key))}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}
                        title="Listeden çıkar"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EtiketBasModal
        acik={modalUrunleri.length > 0}
        urunler={modalUrunleri}
        source="admin"
        kaynak="ETIKET_MERKEZI"
        onBasildi={() => void basildiktanSonra()}
        onKapat={() => setModalUrunleri([])}
      />
    </div>
  )
}
