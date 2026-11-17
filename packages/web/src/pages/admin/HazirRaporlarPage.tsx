import { useEffect, useMemo, useState } from 'react'
import {
  hataMesaji,
  katalogGetir,
  musteriAra,
  raporCalistir,
  raporExcel,
  secenekleriGetir,
  type FiltreAnahtar,
  type Katalog,
  type Kolon,
  type RaporFiltre,
  type RaporGrup,
  type RaporSonucu,
  type RaporTanimi,
  type Satir,
  type Secenekler,
} from '../../api/hazir-raporlar.api'

const ANA = '#C8102E'
const MAVI = '#1D4ED8'
const GRUP_SIRA: RaporGrup[] = ['SATIS', 'STOK', 'KAREKOD', 'ALIS', 'KASA', 'CARI', 'LISTE']
const FAVORI_ANAHTAR = 'hazir-rapor-favoriler'

function favorileriOku(): string[] {
  try {
    const raw = localStorage.getItem(FAVORI_ANAHTAR)
    const v = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function favorileriYaz(v: string[]) {
  try {
    localStorage.setItem(FAVORI_ANAHTAR, JSON.stringify(v))
  } catch {
    /* tarayıcı izin vermiyor */
  }
}

// ───────── tarih yardımcıları (Türkiye günü) ─────────
function gunStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}
function gunEkle(g: string, n: number): string {
  const d = new Date(`${g}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
type TarihKisayol = 'bugun' | 'dun' | 'buHafta' | 'buAy' | 'gecenAy' | 'son30' | 'buYil' | 'tumu'
const KISAYOLLAR: { key: TarihKisayol; label: string }[] = [
  { key: 'bugun', label: 'Bugün' },
  { key: 'dun', label: 'Dün' },
  { key: 'buHafta', label: 'Bu hafta' },
  { key: 'buAy', label: 'Bu ay' },
  { key: 'gecenAy', label: 'Geçen ay' },
  { key: 'son30', label: 'Son 30 gün' },
  { key: 'buYil', label: 'Bu yıl' },
]
function kisayolAralik(k: TarihKisayol): { bas: string; bit: string } {
  const bugun = gunStr(new Date())
  switch (k) {
    case 'bugun':
      return { bas: bugun, bit: bugun }
    case 'dun': {
      const d = gunEkle(bugun, -1)
      return { bas: d, bit: d }
    }
    case 'buHafta': {
      const gun = (new Date(`${bugun}T12:00:00Z`).getUTCDay() + 6) % 7
      return { bas: gunEkle(bugun, -gun), bit: bugun }
    }
    case 'gecenAy': {
      const ilk = `${bugun.slice(0, 8)}01`
      const son = gunEkle(ilk, -1)
      return { bas: `${son.slice(0, 8)}01`, bit: son }
    }
    case 'son30':
      return { bas: gunEkle(bugun, -29), bit: bugun }
    case 'buYil':
      return { bas: `${bugun.slice(0, 4)}-01-01`, bit: bugun }
    case 'tumu':
      return { bas: '', bit: '' }
    default:
      return { bas: `${bugun.slice(0, 8)}01`, bit: bugun }
  }
}

// ───────── biçimlendirme ─────────
const paraFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const sayiFmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 })
function bicim(v: unknown, tip: Kolon['tip']): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v !== 'number') return String(v)
  if (tip === 'para') return `₺ ${paraFmt.format(v)}`
  if (tip === 'yuzde') return `%${sayiFmt.format(v)}`
  return sayiFmt.format(v)
}
const SAG = new Set(['para', 'sayi', 'yuzde'])

const kutu: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }
const etiket: React.CSSProperties = { display: 'grid', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }
const alan: React.CSSProperties = { height: 38, padding: '0 10px', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 13, background: '#fff' }
const dugme: React.CSSProperties = { height: 38, padding: '0 14px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }
function cip(secili: boolean): React.CSSProperties {
  return {
    height: 32,
    padding: '0 12px',
    borderRadius: 16,
    border: `1px solid ${secili ? MAVI : '#CBD5E1'}`,
    background: secili ? MAVI : '#fff',
    color: secili ? '#fff' : '#334155',
    fontSize: 12,
    cursor: 'pointer',
  }
}

type FiltreDurum = RaporFiltre & { kisayol?: TarihKisayol | ''; musteriAdi?: string }

function varsayilanFiltre(r: RaporTanimi): FiltreDurum {
  const t = r.varsayilanTarih ?? 'buAy'
  const k: TarihKisayol = t === 'yok' ? 'tumu' : t
  const a = r.filtreler.includes('tarih') ? kisayolAralik(k) : { bas: '', bit: '' }
  return {
    ...a,
    kisayol: r.filtreler.includes('tarih') ? k : '',
    gruplama: r.varsayilanGruplama,
    durum: r.durumlar?.[0]?.key,
    karsilastir: false,
  }
}

export default function HazirRaporlarPage() {
  const [katalog, setKatalog] = useState<Katalog | null>(null)
  const [sec, setSec] = useState<Secenekler | null>(null)
  const [seciliId, setSeciliId] = useState<string>('satis-ozeti')
  const [filtre, setFiltre] = useState<FiltreDurum>({})
  const [sonuc, setSonuc] = useState<RaporSonucu | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [excelYukleniyor, setExcelYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [arama, setArama] = useState('')
  const [favoriler, setFavoriler] = useState<string[]>(() => favorileriOku())
  const [siralama, setSiralama] = useState<{ key: string; artan: boolean } | null>(null)
  const [musteriQ, setMusteriQ] = useState('')
  const [musteriSonuc, setMusteriSonuc] = useState<{ id: string; name: string; phone: string }[]>([])

  useEffect(() => {
    katalogGetir()
      .then((k) => {
        setKatalog(k)
        const ilk = k.raporlar.find((r) => r.id === 'satis-ozeti') ?? k.raporlar[0]
        if (ilk) {
          setSeciliId(ilk.id)
          setFiltre(varsayilanFiltre(ilk))
        }
      })
      .catch(async (e) => setHata(await hataMesaji(e)))
    secenekleriGetir()
      .then(setSec)
      .catch(() => setSec({ subeler: [], lokasyonlar: [], personeller: [], odemeTipleri: [], kategoriler: [], camGruplari: [] }))
  }, [])

  const rapor = useMemo(() => katalog?.raporlar.find((r) => r.id === seciliId) ?? null, [katalog, seciliId])

  function raporSec(id: string, ekFiltre?: Partial<FiltreDurum>) {
    const r = katalog?.raporlar.find((x) => x.id === id)
    if (!r) return
    setSeciliId(id)
    setFiltre({ ...varsayilanFiltre(r), ...(ekFiltre ?? {}) })
    setSonuc(null)
    setHata(null)
    setSiralama(null)
    setMusteriQ('')
    setMusteriSonuc([])
  }

  useEffect(() => {
    if (musteriQ.trim().length < 2) return
    const t = setTimeout(() => {
      musteriAra(musteriQ.trim())
        .then(setMusteriSonuc)
        .catch(() => setMusteriSonuc([]))
    }, 300)
    return () => clearTimeout(t)
  }, [musteriQ])

  function gonderilecek(f: FiltreDurum): RaporFiltre {
    const rest: FiltreDurum = { ...f }
    delete rest.kisayol
    delete rest.musteriAdi
    return rest
  }

  async function calistir(f: FiltreDurum = filtre, id: string = seciliId) {
    setYukleniyor(true)
    setHata(null)
    try {
      const s = await raporCalistir(id, gonderilecek(f))
      setSonuc(s)
      setSiralama(null)
    } catch (e) {
      setSonuc(null)
      setHata(await hataMesaji(e))
    } finally {
      setYukleniyor(false)
    }
  }

  async function excelAl() {
    if (!rapor) return
    setExcelYukleniyor(true)
    try {
      await raporExcel(rapor.id, rapor.ad, gonderilecek(filtre))
    } catch (e) {
      setHata(await hataMesaji(e))
    } finally {
      setExcelYukleniyor(false)
    }
  }

  function favoriDegistir() {
    const yeni = favoriler.includes(seciliId) ? favoriler.filter((x) => x !== seciliId) : [...favoriler, seciliId]
    setFavoriler(yeni)
    favorileriYaz(yeni)
  }

  function ekstreAc(musteriId: string, ad: string) {
    const f: Partial<FiltreDurum> = { musteriId, musteriAdi: ad }
    raporSec('musteri-ekstresi', f)
    const r = katalog?.raporlar.find((x) => x.id === 'musteri-ekstresi')
    if (r) void calistir({ ...varsayilanFiltre(r), ...f }, 'musteri-ekstresi')
  }

  const gorunurKolonlar = useMemo(() => (sonuc?.kolonlar ?? []).filter((k) => !k.key.startsWith('_')), [sonuc])

  const siraliSatirlar = useMemo(() => {
    const s = [...(sonuc?.satirlar ?? [])]
    if (!siralama) return s
    const { key, artan } = siralama
    s.sort((a, b) => {
      const x = a[key]
      const y = b[key]
      if (typeof x === 'number' && typeof y === 'number') return artan ? x - y : y - x
      return artan ? String(x ?? '').localeCompare(String(y ?? ''), 'tr') : String(y ?? '').localeCompare(String(x ?? ''), 'tr')
    })
    return s
  }, [sonuc, siralama])

  const toplamlar = useMemo(() => {
    const t: Record<string, number> = {}
    for (const k of gorunurKolonlar) {
      if (!k.toplam) continue
      t[k.key] = (sonuc?.satirlar ?? []).reduce((a, s) => a + (typeof s[k.key] === 'number' ? (s[k.key] as number) : 0), 0)
    }
    return t
  }, [gorunurKolonlar, sonuc])

  const gruplar = useMemo(() => {
    if (!katalog) return []
    const q = arama.trim().toLocaleLowerCase('tr-TR')
    const uyan = (r: RaporTanimi) =>
      !q || r.ad.toLocaleLowerCase('tr-TR').includes(q) || r.aciklama.toLocaleLowerCase('tr-TR').includes(q) || r.siber.toLocaleLowerCase('tr-TR').includes(q)
    const out: { ad: string; raporlar: RaporTanimi[] }[] = []
    const fav = katalog.raporlar.filter((r) => favoriler.includes(r.id) && uyan(r))
    if (fav.length) out.push({ ad: 'Sık kullanılanlar', raporlar: fav })
    for (const g of GRUP_SIRA) {
      const rs = katalog.raporlar.filter((r) => r.grup === g && uyan(r))
      if (rs.length) out.push({ ad: katalog.gruplar[g], raporlar: rs })
    }
    return out
  }, [katalog, arama, favoriler])

  const var_ = (k: FiltreAnahtar) => Boolean(rapor?.filtreler.includes(k))
  const set = (p: Partial<FiltreDurum>) => setFiltre((f) => ({ ...f, ...p }))
  const coklu = (liste: string[] | undefined, deger: string) =>
    liste?.includes(deger) ? liste.filter((x) => x !== deger) : [...(liste ?? []), deger]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Hazır Raporlar</h1>
        <span style={{ fontSize: 13, color: '#64748B' }}>Raporu seç, filtreleri ayarla, “Uygula”ya bas. Excel’e alabilir, yazdırabilirsin.</span>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <aside className="no-print" aria-label="Rapor listesi" style={{ ...kutu, flex: '1 1 250px', maxWidth: 290, padding: 12 }}>
          <label style={etiket}>
            Rapor ara
            <input type="search" value={arama} onChange={(e) => setArama(e.target.value)} placeholder="ör. açık hesap, cam" style={alan} />
          </label>
          {gruplar.map((g) => (
            <div key={g.ad} style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', color: '#64748B', textTransform: 'uppercase', padding: '4px 6px' }}>{g.ad}</div>
              {g.raporlar.map((r) => (
                <button
                  key={`${g.ad}-${r.id}`}
                  type="button"
                  onClick={() => raporSec(r.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: 6,
                    background: r.id === seciliId ? '#EFF6FF' : 'transparent',
                    color: r.id === seciliId ? MAVI : '#334155',
                    fontWeight: r.id === seciliId ? 700 : 400,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {r.ad}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main style={{ flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!rapor ? (
            <section style={{ ...kutu, padding: 20 }}>{hata ?? 'Raporlar yükleniyor…'}</section>
          ) : (
            <>
              <section style={{ ...kutu, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ maxWidth: 760 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>{katalog?.gruplar[rapor.grup]}</div>
                  <h2 style={{ margin: '2px 0 6px', fontSize: 20 }}>{rapor.ad}</h2>
                  <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{rapor.aciklama}</p>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B' }}>Siber karşılığı: {rapor.siber}</p>
                </div>
                <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <button type="button" onClick={favoriDegistir} style={dugme} aria-pressed={favoriler.includes(seciliId)}>
                    {favoriler.includes(seciliId) ? '★ Favoride' : '☆ Favori'}
                  </button>
                  <button type="button" onClick={() => void excelAl()} disabled={excelYukleniyor} style={dugme}>
                    {excelYukleniyor ? 'Hazırlanıyor…' : 'Excel'}
                  </button>
                  <button type="button" onClick={() => window.print()} disabled={!sonuc} style={dugme}>
                    Yazdır
                  </button>
                </div>
              </section>

              <section className="no-print" aria-label="Filtreler" style={{ ...kutu, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {var_('tarih') && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginRight: 4 }}>Tarih</span>
                    {(rapor.varsayilanTarih === 'yok' ? [{ key: 'tumu' as const, label: 'Tümü' }, ...KISAYOLLAR] : KISAYOLLAR).map((k) => (
                      <button key={k.key} type="button" style={cip(filtre.kisayol === k.key)} onClick={() => set({ ...kisayolAralik(k.key), kisayol: k.key })}>
                        {k.label}
                      </button>
                    ))}
                    <input type="date" aria-label="Başlangıç" value={filtre.bas ?? ''} onChange={(e) => set({ bas: e.target.value, kisayol: '' })} style={alan} />
                    <span style={{ color: '#64748B' }}>–</span>
                    <input type="date" aria-label="Bitiş" value={filtre.bit ?? ''} onChange={(e) => set({ bit: e.target.value, kisayol: '' })} style={alan} />
                  </div>
                )}

                {var_('sube') && sec && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginRight: 4 }}>Şube</span>
                    <button type="button" style={cip(!filtre.subeIds?.length)} onClick={() => set({ subeIds: [] })}>
                      Tümü
                    </button>
                    {sec.subeler.map((s) => (
                      <button key={s.id} type="button" title={s.ad} style={cip(Boolean(filtre.subeIds?.includes(s.id)))} onClick={() => set({ subeIds: coklu(filtre.subeIds, s.id) })}>
                        {s.kod}
                      </button>
                    ))}
                  </div>
                )}

                {var_('lokasyon') && sec && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginRight: 4 }}>Lokasyon</span>
                    <button type="button" style={cip(!filtre.lokasyonlar?.length)} onClick={() => set({ lokasyonlar: [] })}>
                      Tümü
                    </button>
                    {sec.lokasyonlar.map((l) => (
                      <button key={l} type="button" style={cip(Boolean(filtre.lokasyonlar?.includes(l)))} onClick={() => set({ lokasyonlar: coklu(filtre.lokasyonlar, l) })}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                  {rapor.gruplamalar && (
                    <label style={etiket}>
                      Gruplama
                      <select value={filtre.gruplama ?? ''} onChange={(e) => set({ gruplama: e.target.value })} style={alan}>
                        {rapor.gruplamalar.map((g) => (
                          <option key={g.key} value={g.key}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {var_('camGrubu') && (
                    <label style={etiket}>
                      Cam grubu
                      <select value={filtre.camGrubu ?? ''} onChange={(e) => set({ camGrubu: e.target.value })} style={alan}>
                        <option value="">Seçin…</option>
                        {(sec?.camGruplari ?? []).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {var_('kategori') && (
                    <label style={etiket}>
                      Kategori
                      <select value={filtre.kategori ?? ''} onChange={(e) => set({ kategori: e.target.value || undefined })} style={alan}>
                        <option value="">Tümü</option>
                        {(sec?.kategoriler ?? []).map((k) => (
                          <option key={k.key} value={k.key}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {var_('marka') && (
                    <label style={etiket}>
                      Marka
                      <input value={filtre.marka ?? ''} onChange={(e) => set({ marka: e.target.value || undefined })} placeholder="ör. RAY-BAN" style={alan} />
                    </label>
                  )}
                  {var_('ara') && (
                    <label style={etiket}>
                      {rapor.id === 'eski-satislar' || rapor.id === 'musteri-listesi' || rapor.id === 'acik-hesap-kalan' ? 'Ara (müşteri, telefon…)' : 'Ara (ürün, barkod, karekod)'}
                      <input value={filtre.ara ?? ''} onChange={(e) => set({ ara: e.target.value || undefined })} onKeyDown={(e) => e.key === 'Enter' && void calistir()} style={alan} />
                    </label>
                  )}
                  {var_('personel') && (
                    <label style={etiket}>
                      Personel
                      <select value={filtre.personelId ?? ''} onChange={(e) => set({ personelId: e.target.value || undefined })} style={alan}>
                        <option value="">Tümü</option>
                        {(sec?.personeller ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.ad} {p.sube ? `(${p.sube})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {var_('odemeTipi') && (
                    <label style={etiket}>
                      Ödeme tipi
                      <select value={filtre.odemeTipi ?? ''} onChange={(e) => set({ odemeTipi: e.target.value || undefined })} style={alan}>
                        <option value="">Tümü</option>
                        {(sec?.odemeTipleri ?? []).map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {var_('durum') && rapor.durumlar && (
                    <label style={etiket}>
                      Durum
                      <select value={filtre.durum ?? ''} onChange={(e) => set({ durum: e.target.value })} style={alan}>
                        {rapor.durumlar.map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {var_('enAz') && (
                    <label style={etiket}>
                      {rapor.id === 'acik-hesap-kalan' ? 'En az kalan (₺)' : 'En az harcama (₺)'}
                      <input type="number" min={0} value={filtre.enAz ?? ''} onChange={(e) => set({ enAz: e.target.value ? Number(e.target.value) : undefined })} style={alan} />
                    </label>
                  )}
                  {var_('musteri') && (
                    <div style={{ ...etiket, position: 'relative' }}>
                      <label htmlFor="rapor-musteri">Müşteri</label>
                      {filtre.musteriId ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ ...alan, display: 'flex', alignItems: 'center', flex: 1, fontWeight: 600, color: '#0F172A' }}>{filtre.musteriAdi ?? 'Seçili müşteri'}</span>
                          <button type="button" style={dugme} onClick={() => set({ musteriId: undefined, musteriAdi: undefined })}>
                            Değiştir
                          </button>
                        </div>
                      ) : (
                        <input
                          id="rapor-musteri"
                          value={musteriQ}
                          onChange={(e) => {
                            setMusteriQ(e.target.value)
                            if (e.target.value.trim().length < 2) setMusteriSonuc([])
                          }} placeholder="Ad, telefon veya TC" style={alan} />
                      )}
                      {!filtre.musteriId && musteriSonuc.length > 0 && (
                        <div style={{ position: 'absolute', top: 62, left: 0, right: 0, zIndex: 5, ...kutu, maxHeight: 260, overflowY: 'auto', boxShadow: '0 8px 24px rgba(15,23,42,.12)' }}>
                          {musteriSonuc.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                set({ musteriId: m.id, musteriAdi: `${m.name} · ${m.phone}` })
                                setMusteriQ('')
                                setMusteriSonuc([])
                              }}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderBottom: '1px solid #F1F5F9', background: '#fff', fontSize: 13, cursor: 'pointer' }}
                            >
                              {m.name} <span style={{ color: '#64748B' }}>· {m.phone}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: '#334155' }}>
                    {var_('karsilastir') && (
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={Boolean(filtre.karsilastir)} onChange={(e) => set({ karsilastir: e.target.checked })} /> Önceki dönemle karşılaştır
                      </label>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" style={dugme} onClick={() => raporSec(seciliId)}>
                      Temizle
                    </button>
                    <button
                      type="button"
                      onClick={() => void calistir()}
                      disabled={yukleniyor}
                      style={{ ...dugme, height: 42, padding: '0 22px', border: 'none', background: ANA, color: '#fff', fontWeight: 700, fontSize: 14 }}
                    >
                      {yukleniyor ? 'Hazırlanıyor…' : 'Uygula'}
                    </button>
                  </div>
                </div>
              </section>

              {hata && (
                <section role="alert" style={{ ...kutu, padding: '12px 16px', background: '#FEF2F2', borderColor: '#FECACA', color: '#991B1B', fontSize: 14 }}>
                  {hata}
                </section>
              )}

              {sonuc && (
                <>
                  {!!sonuc.ozet?.length && (
                    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                      {sonuc.ozet.map((o) => (
                        <div key={o.ad} style={{ ...kutu, padding: '12px 14px', background: o.maliyet ? '#FFFBEB' : '#fff' }}>
                          <div style={{ fontSize: 12, color: '#64748B', fontWeight: 700 }}>{o.ad}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{bicim(o.deger, o.tip)}</div>
                          {o.alt && <div style={{ fontSize: 12, color: '#475569' }}>{o.alt}</div>}
                        </div>
                      ))}
                    </section>
                  )}

                  <section style={{ ...kutu, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
                      <strong>{sonuc.satirlar.length.toLocaleString('tr-TR')} satır</strong>
                      {sonuc.kesildi && <span style={{ color: '#92400E' }}>Liste kısaltıldı — tamamı için Excel’i kullanın.</span>}
                    </div>
                    <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                          <tr>
                            {gorunurKolonlar.map((k) => (
                              <th
                                key={k.key}
                                scope="col"
                                style={{
                                  textAlign: SAG.has(k.tip) ? 'right' : 'left',
                                  padding: '8px 10px',
                                  background: k.maliyet ? '#FEF3C7' : '#F8FAFC',
                                  color: '#475569',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  borderBottom: '1px solid #E2E8F0',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => setSiralama((s) => (s?.key === k.key ? { key: k.key, artan: !s.artan } : { key: k.key, artan: !SAG.has(k.tip) }))}
                                  style={{ border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', cursor: 'pointer', padding: 0 }}
                                >
                                  {k.label}
                                  {siralama?.key === k.key ? (siralama.artan ? ' ▲' : ' ▼') : ''}
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {siraliSatirlar.map((s: Satir, i) => {
                            const musteriId = typeof s._musteriId === 'string' ? s._musteriId : null
                            return (
                              <tr key={i} style={{ background: i % 2 ? '#FCFCFD' : '#fff' }}>
                                {gorunurKolonlar.map((k, j) => {
                                  const v = s[k.key]
                                  const ilk = j === 0
                                  const gunSay = k.key === 'gun' && typeof v === 'number' && rapor.id === 'acik-hesap-kalan' ? v : 0
                                  return (
                                    <td
                                      key={k.key}
                                      style={{
                                        padding: '7px 10px',
                                        borderBottom: '1px solid #F1F5F9',
                                        textAlign: SAG.has(k.tip) ? 'right' : 'left',
                                        whiteSpace: k.key === 'urun' || k.key === 'aciklama' ? 'normal' : 'nowrap',
                                        background: k.maliyet ? '#FFFBEB' : undefined,
                                        color: gunSay > 90 ? '#9A3412' : gunSay > 30 ? '#B45309' : undefined,
                                        fontWeight: gunSay > 30 ? 700 : undefined,
                                      }}
                                    >
                                      {ilk && musteriId ? (
                                        <button
                                          type="button"
                                          onClick={() => ekstreAc(musteriId, String(s.musteri ?? s.grup ?? ''))}
                                          title="Müşteri ekstresini aç"
                                          style={{ border: 'none', background: 'transparent', color: MAVI, textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}
                                        >
                                          {bicim(v, k.tip)}
                                        </button>
                                      ) : (
                                        bicim(v, k.tip)
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                          {Object.keys(toplamlar).length > 0 && sonuc.satirlar.length > 0 && (
                            <tr style={{ background: '#F1F5F9', fontWeight: 800 }}>
                              {gorunurKolonlar.map((k, j) => (
                                <td key={k.key} style={{ padding: '8px 10px', textAlign: SAG.has(k.tip) ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                                  {j === 0 ? 'Toplam' : k.toplam ? bicim(toplamlar[k.key], k.tip) : ''}
                                </td>
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {sonuc.satirlar.length === 0 && <p style={{ margin: 0, padding: 16, fontSize: 14, color: '#475569' }}>Bu filtrelerle kayıt bulunamadı.</p>}
                  </section>

                  {!!sonuc.notlar?.length && (
                    <section style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                      {sonuc.notlar.map((n) => (
                        <div key={n}>• {n}</div>
                      ))}
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
      <style>{'@media print { .no-print, nav, aside { display: none !important; } }'}</style>
    </div>
  )
}
