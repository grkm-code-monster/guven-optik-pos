import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getSaMarkaAnaliz,
  getSaMarkalar,
  getSiparisler,
  getTedarikciler,
  saMarkaKartKaydet,
  saOkut,
  siparisDurum,
  siparisOlustur,
  type SaDurum,
  type SaMarka,
  type SaMarkaAnaliz,
  type SaModel,
  type SatinAlmaSiparis,
} from '../../api/ikmal.api'

/**
 * 14.11.2026 — Satın Alma (firma ziyareti), çerçeve + güneş.
 * Marka seç → modeller: stok, son 12 ay satış (eski Odoo + yeni sistem), 2023-24 satış (Siber), durum.
 * Numune okut → model bulunur. Sepete ekle → firmaya sipariş (SatinAlmaSiparis, kaynak ZIYARET).
 * Hiçbir stok/ürün kaydı değişmez; sipariş sadece bu programda tutulur.
 */

const TESLIM = ['ANADEPO', 'GVN1', 'GVN2', 'GVN3', 'GVN4', 'GVN5', 'GVN6', 'GVN7', 'GVN8', 'GVN9', 'GVN10', 'GVNP', 'GUVENP2', 'ETICARET']
const kutu: React.CSSProperties = { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }
const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }
const btnAna: React.CSSProperties = { ...btn, border: 'none', backgroundColor: '#1a1a2e', color: 'white' }
const btnYesil: React.CSSProperties = { ...btn, border: 'none', backgroundColor: '#059669', color: 'white' }
const th: React.CSSProperties = { padding: '7px 6px', textAlign: 'left', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px', fontSize: 12, borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }
const sag: React.CSSProperties = { textAlign: 'right' }

const DURUM: Record<SaDurum, { ikon: string; ad: string; renk: string; aciklama: string }> = {
  COK_SATAN: { ikon: '🔥', ad: 'Çok satan', renk: '#b45309', aciklama: 'Son 12 ayda 3+ sattı ve satışı stoğundan fazla' },
  TUKENDI: { ikon: '⛔', ad: 'Bitti, satıyordu', renk: '#dc2626', aciklama: 'Stok yok ama son 12 ayda sattı — tekrar alım adayı' },
  YENI: { ikon: '🆕', ad: 'Yeni geldi', renk: '#2563eb', aciklama: 'Son 60 günde girdi, henüz satışı yok' },
  DURGUN: { ikon: '🧊', ad: 'Satmıyor', renk: '#0891b2', aciklama: 'Stokta var, son 12 ayda hiç satmadı' },
  NORMAL: { ikon: '·', ad: 'Normal', renk: '#6b7280', aciklama: '' },
  ESKI: { ikon: '📜', ad: 'Eskiden sattı', renk: '#7c3aed', aciklama: 'Sadece 2023-24\'te satmış, şimdi stokta yok' },
}
const TUR_AD = { OPTIK: 'Optik', GUNES: 'Güneş' } as const

type SepetKalem = { key: string; varyantId: number; marka: string; urunAdi: string; nitelik: string; adet: number; not: string }
const SEPET_ANAHTAR = 'satinAlmaSepet.v1'

const hataMesaji = (e: unknown, v: string) => {
  const x = e as { response?: { data?: { error?: string } }; message?: string }
  return x?.response?.data?.error ?? x?.message ?? v
}
const tl = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺')
const tarih = (s: string | null) => (s ? s.split('-').reverse().join('.') : '—')
const sade = (s: string) =>
  s.toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/[^A-Z0-9]/g, '')

function sepetOku(): SepetKalem[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEPET_ANAHTAR) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export default function SatinAlmaTab() {
  const [markalar, setMarkalar] = useState<SaMarka[]>([])
  const [markaYukleniyor, setMarkaYukleniyor] = useState(false)
  const [markaAra, setMarkaAra] = useState('')
  const [firmaFiltre, setFirmaFiltre] = useState('')
  const [secili, setSecili] = useState<string>('')
  const [analiz, setAnaliz] = useState<SaMarkaAnaliz | null>(null)
  const [analizYukleniyor, setAnalizYukleniyor] = useState(false)
  const [tur, setTur] = useState<'' | 'OPTIK' | 'GUNES'>('')
  const [durumF, setDurumF] = useState<Set<SaDurum>>(new Set())
  const [eskiGoster, setEskiGoster] = useState(false)
  const [modelAra, setModelAra] = useState('')
  const [acik, setAcik] = useState<Set<string>>(new Set())
  const [vurgu, setVurgu] = useState<string | null>(null)
  const [okutKod, setOkutKod] = useState('')
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'hata'; text: string } | null>(null)
  const [firmalar, setFirmalar] = useState<{ id: number; ad: string }[]>([])
  const [kart, setKart] = useState({ tedarikciAdi: '', temsilci: '', telefon: '', ziyaretDonemi: '', aciklama: '' })
  const [kartAcik, setKartAcik] = useState(false)
  const [sepet, setSepet] = useState<SepetKalem[]>(sepetOku)
  const [teslim, setTeslim] = useState('ANADEPO')
  const [sepetFirma, setSepetFirma] = useState('')
  const [sepetNot, setSepetNot] = useState('')
  const [siparisler, setSiparisler] = useState<SatinAlmaSiparis[]>([])
  const [mesgul, setMesgul] = useState(false)
  const [yeni, setYeni] = useState({ model: '', renk: '', adet: '1', not: '' })
  const okutRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(SEPET_ANAHTAR, JSON.stringify(sepet))
    } catch {
      /* depolama kapalı olabilir */
    }
  }, [sepet])

  const markaYukle = useCallback(async (yenile = false) => {
    setMarkaYukleniyor(true)
    try {
      setMarkalar((await getSaMarkalar(yenile)).data)
    } catch (e) {
      setMesaj({ tip: 'hata', text: hataMesaji(e, 'Markalar okunamadı') })
    } finally {
      setMarkaYukleniyor(false)
    }
  }, [])
  const siparisYukle = useCallback(async () => {
    try {
      setSiparisler((await getSiparisler()).filter((s) => s.kaynak === 'ZIYARET'))
    } catch {
      setSiparisler([])
    }
  }, [])
  useEffect(() => {
    void markaYukle()
    void siparisYukle()
    getTedarikciler().then(setFirmalar).catch(() => setFirmalar([]))
  }, [markaYukle, siparisYukle])

  const markaAc = useCallback(async (marka: string, vurguAnahtar?: string) => {
    setSecili(marka)
    setAnalizYukleniyor(true)
    setMesaj(null)
    try {
      const a = await getSaMarkaAnaliz(marka)
      setAnaliz(a)
      setKart({
        tedarikciAdi: a.kart?.tedarikciAdi ?? '',
        temsilci: a.kart?.temsilci ?? '',
        telefon: a.kart?.telefon ?? '',
        ziyaretDonemi: a.kart?.ziyaretDonemi ?? '',
        aciklama: a.kart?.aciklama ?? '',
      })
      if (a.kart?.tedarikciAdi) setSepetFirma((f) => f || a.kart!.tedarikciAdi!)
      if (vurguAnahtar) {
        setVurgu(vurguAnahtar)
        setAcik(new Set([vurguAnahtar]))
        const m = a.modeller.find((x) => x.anahtar === vurguAnahtar)
        if (m?.durum === 'ESKI') setEskiGoster(true)
        setTimeout(() => document.getElementById(`sa-${vurguAnahtar}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150)
      } else {
        setVurgu(null)
        setAcik(new Set())
      }
    } catch (e) {
      setAnaliz(null)
      setMesaj({ tip: 'hata', text: hataMesaji(e, 'Marka okunamadı') })
    } finally {
      setAnalizYukleniyor(false)
    }
  }, [])

  async function okut() {
    const kod = okutKod.trim()
    if (!kod) return
    try {
      const r = await saOkut(kod)
      if (r) {
        setModelAra('')
        if (analiz && analiz.markaKey === r.markaKey) {
          setVurgu(r.anahtar)
          setAcik((s) => new Set([...s, r.anahtar]))
          const m = analiz.modeller.find((x) => x.anahtar === r.anahtar)
          if (m && tur && m.tur !== tur) setTur('')
          setTimeout(() => document.getElementById(`sa-${r.anahtar}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 100)
        } else {
          setTur('')
          await markaAc(r.marka, r.anahtar)
        }
        setMesaj({ tip: 'ok', text: `Okundu: ${r.marka} — model satırı işaretlendi.` })
      } else {
        // Barkod sistemde yok → seçili markada model araması
        setModelAra(kod)
        setMesaj({ tip: 'ok', text: `"${kod}" sistemde barkod olarak yok; model listesinde arandı. Bulunamazsa aşağıdan "yeni model" olarak sepete ekleyebilirsiniz.` })
        setYeni((y) => ({ ...y, model: kod }))
      }
    } catch (e) {
      setMesaj({ tip: 'hata', text: hataMesaji(e, 'Okunamadı') })
    } finally {
      setOkutKod('')
      okutRef.current?.focus()
    }
  }

  async function kartKaydet() {
    if (!analiz) return
    const f = firmalar.find((x) => x.ad === kart.tedarikciAdi.trim())
    try {
      await saMarkaKartKaydet({ marka: analiz.marka, tedarikciId: f?.id ?? null, ...kart })
      setMesaj({ tip: 'ok', text: `${analiz.marka} kartı kaydedildi.` })
      await markaYukle()
      setKartAcik(false)
    } catch (e) {
      setMesaj({ tip: 'hata', text: hataMesaji(e, 'Kaydedilemedi') })
    }
  }

  // ── Marka listesi ──
  const firmaSecenekleri = useMemo(() => {
    const s = new Set<string>()
    for (const m of markalar) if (m.tedarikciAdi) s.add(m.tedarikciAdi)
    return [...s].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [markalar])
  const gorunenMarkalar = useMemo(() => {
    const q = sade(markaAra)
    return markalar.filter((m) => (!q || sade(m.marka).includes(q)) && (!firmaFiltre || m.tedarikciAdi === firmaFiltre))
  }, [markalar, markaAra, firmaFiltre])

  // ── Model listesi ──
  const sayac = useMemo(() => {
    const c: Partial<Record<SaDurum, number>> = {}
    for (const m of analiz?.modeller ?? []) if (!tur || m.tur === tur) c[m.durum] = (c[m.durum] ?? 0) + 1
    return c
  }, [analiz, tur])
  const modeller = useMemo(() => {
    const q = sade(modelAra)
    return (analiz?.modeller ?? []).filter((m) => {
      if (tur && m.tur !== tur) return false
      if (!eskiGoster && m.durum === 'ESKI' && m.anahtar !== vurgu) return false
      if (durumF.size && !durumF.has(m.durum)) return false
      if (q) {
        const metin = sade([m.model, ...m.digerYazimlar, ...m.varyantlar.map((v) => `${v.renk} ${v.barkod ?? ''}`)].join(' '))
        if (!metin.includes(q)) return false
      }
      return true
    })
  }, [analiz, tur, eskiGoster, durumF, modelAra, vurgu])

  function sepeteEkle(k: Omit<SepetKalem, 'key'>) {
    setSepet((s) => {
      const key = k.varyantId ? `v${k.varyantId}` : `y${sade(k.marka + k.urunAdi + k.nitelik)}`
      const i = s.findIndex((x) => x.key === key)
      if (i >= 0) return s.map((x, j) => (j === i ? { ...x, adet: x.adet + k.adet } : x))
      return [...s, { ...k, key }]
    })
  }
  function modelSepete(m: SaModel, renk: string, adet: number, varyantId = 0, olcu = '') {
    if (!analiz || adet <= 0) return
    sepeteEkle({
      varyantId,
      marka: analiz.marka,
      urunAdi: `${analiz.marka} ${TUR_AD[m.tur].toLocaleUpperCase('tr-TR')} ${m.model}`,
      nitelik: [renk, olcu].filter(Boolean).join(' / '),
      adet,
      not: varyantId ? '' : 'sistemde yok',
    })
  }

  async function siparisKaydet() {
    if (!sepet.length) return
    const f = firmalar.find((x) => x.ad === sepetFirma.trim())
    if (!sepetFirma.trim() && !window.confirm('Firma seçilmedi. Firmasız kaydedilsin mi?')) return
    setMesgul(true)
    try {
      const sp = await siparisOlustur({
        lokasyon: teslim,
        tedarikciId: f?.id ?? null,
        tedarikciAdi: sepetFirma.trim() || null,
        kaynak: 'ZIYARET',
        aciklama: sepetNot.trim() || 'Firma ziyareti',
        kalemler: sepet.map((k) => ({ varyantId: k.varyantId, urunAdi: k.urunAdi, nitelik: k.nitelik, adet: k.adet, not: k.not })),
      })
      setMesaj({ tip: 'ok', text: `Sipariş #${sp.no} kaydedildi (${sepet.length} kalem, ${sepet.reduce((a, k) => a + k.adet, 0)} adet). Aşağıdan sipariş formunu yazdırabilirsiniz.` })
      setSepet([])
      setSepetNot('')
      await siparisYukle()
    } catch (e) {
      setMesaj({ tip: 'hata', text: hataMesaji(e, 'Sipariş kaydedilemedi') })
    } finally {
      setMesgul(false)
    }
  }

  function siparisFormu(sp: SatinAlmaSiparis) {
    const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
    const toplam = sp.kalemler.reduce((a, k) => a + k.adet, 0)
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Sipariş #${sp.no}</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:18px}h1{font-size:16px;margin:0 0 4px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eee}</style></head><body>
<h1>SİPARİŞ FORMU #${sp.no}</h1><div>Firma: <b>${esc(sp.tedarikciAdi ?? '—')}</b> · Teslim yeri: <b>${esc(sp.lokasyon)}</b> · ${new Date(sp.createdAt).toLocaleDateString('tr-TR')} · ${sp.kalemler.length} kalem · ${toplam} adet</div>
${sp.aciklama ? `<div>Not: ${esc(sp.aciklama)}</div>` : ''}
<table><thead><tr><th>#</th><th>Ürün</th><th>Renk / ölçü</th><th>Adet</th><th>Not</th></tr></thead><tbody>${sp.kalemler.map((k, i) => `<tr><td>${i + 1}</td><td>${esc(k.urunAdi)}</td><td>${esc(k.nitelik ?? '')}</td><td><b>${k.adet}</b></td><td>${esc(k.not ?? '')}</td></tr>`).join('')}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
  }
  async function durumDegis(sp: SatinAlmaSiparis, durum: SatinAlmaSiparis['durum'], soru: string) {
    if (!window.confirm(soru)) return
    await siparisDurum(sp.id, durum)
    await siparisYukle()
  }

  const sepetAdet = sepet.reduce((a, k) => a + k.adet, 0)

  return (
    <div>
      <datalist id="sa-firmalar">
        {firmalar.map((f) => <option key={f.id} value={f.ad} />)}
      </datalist>

      {/* Okutma */}
      <div style={{ ...kutu, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>📷 Numune okut</b>
        <input
          ref={okutRef}
          style={{ ...inp, width: 340 }}
          placeholder="Karekod / barkod okutun ya da model yazıp Enter"
          value={okutKod}
          onChange={(e) => setOkutKod(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void okut() }}
        />
        <span style={{ fontSize: 11, color: '#6b7280' }}>Okunan ürünün markası açılır ve modeli işaretlenir.</span>
        <div style={{ marginLeft: 'auto', fontSize: 12 }}>
          🛒 Sepet: <b>{sepet.length}</b> kalem · <b>{sepetAdet}</b> adet{' '}
          <a href="#sa-sepet" style={{ fontSize: 12 }}>sepete git ↓</a>
        </div>
      </div>

      {mesaj ? (
        <div style={{ ...kutu, padding: 10, backgroundColor: mesaj.tip === 'ok' ? '#ecfdf5' : '#fef2f2', color: mesaj.tip === 'ok' ? '#065f46' : '#991b1b', fontSize: 12 }}>{mesaj.text}</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '330px 1fr', gap: 12, alignItems: 'start' }}>
        {/* Marka listesi */}
        <div style={{ ...kutu, padding: 10 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="Marka ara" value={markaAra} onChange={(e) => setMarkaAra(e.target.value)} />
            <button style={btn} title="Stok ve satışları yeniden oku" onClick={() => void markaYukle(true)} disabled={markaYukleniyor}>↻</button>
          </div>
          <select style={{ ...inp, width: '100%', marginBottom: 6 }} value={firmaFiltre} onChange={(e) => setFirmaFiltre(e.target.value)}>
            <option value="">Tüm firmalar</option>
            {firmaSecenekleri.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {markaYukleniyor && !markalar.length ? <div style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>Stok ve satışlar okunuyor (ilk açılış 20-60 sn sürebilir)…</div> : null}
          <div style={{ maxHeight: 640, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th style={th}>Marka</th><th style={{ ...th, ...sag }} title="Şu anki stok (tüm konumlar)">Stok</th><th style={{ ...th, ...sag }} title="Son 12 ay satış">12 ay</th><th style={{ ...th, ...sag }} title="2023-24 satış (Siber)">23-24</th></tr>
              </thead>
              <tbody>
                {gorunenMarkalar.map((m) => (
                  <tr key={m.markaKey} onClick={() => void markaAc(m.marka)} style={{ cursor: 'pointer', backgroundColor: analiz?.markaKey === m.markaKey ? '#eef2ff' : undefined }}>
                    <td style={td}>
                      <div style={{ fontWeight: 700 }}>{m.marka}</div>
                      <div style={{ fontSize: 10, color: m.tedarikciAdi ? '#059669' : '#9ca3af' }}>{m.tedarikciAdi ?? (m.faturaFirma ? `fatura: ${m.faturaFirma}` : 'firma yok')}</div>
                    </td>
                    <td style={{ ...td, ...sag }}>{m.stok || ''}</td>
                    <td style={{ ...td, ...sag, fontWeight: 700 }}>{m.satis12 || ''}</td>
                    <td style={{ ...td, ...sag, color: '#7c3aed' }}>{m.siber || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Marka analizi */}
        <div>
          {!secili ? (
            <div style={{ ...kutu, color: '#6b7280', fontSize: 13 }}>
              Soldan bir marka seçin ya da numune okutun. Firma ziyaretinde: firmanın markasını açın, 🔥 / ⛔ satırlara bakın (tekrar alım), 🧊 satırları not edin (almayın), yeni modelleri "yeni model" ile sepete ekleyin.
            </div>
          ) : analizYukleniyor ? (
            <div style={{ ...kutu, fontSize: 13 }}>{secili} okunuyor…</div>
          ) : analiz ? (
            <>
              <div style={kutu}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18, fontWeight: 900 }}>{analiz.marka}</span>
                  <span style={{ fontSize: 12, color: '#374151' }}>
                    Fiziki tedarikçi: <b>{analiz.kart?.tedarikciAdi ?? '—'}</b>
                    {analiz.kart?.faturaFirma ? <> · fatura kesen: {analiz.kart.faturaFirma}</> : null}
                    {analiz.kart?.temsilci ? <> · temsilci: {analiz.kart.temsilci}</> : null}
                    {analiz.kart?.telefon ? <> · ☎ {analiz.kart.telefon}</> : null}
                    {analiz.kart?.ziyaretDonemi ? <> · ziyaret: {analiz.kart.ziyaretDonemi}</> : null}
                  </span>
                  <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => setKartAcik((x) => !x)}>✎ Firma bilgisi</button>
                </div>
                {kartAcik ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    <input list="sa-firmalar" style={{ ...inp, width: 240 }} placeholder="Fiziki tedarikçi (cari)" value={kart.tedarikciAdi} onChange={(e) => setKart({ ...kart, tedarikciAdi: e.target.value })} />
                    <input style={{ ...inp, width: 150 }} placeholder="Temsilci" value={kart.temsilci} onChange={(e) => setKart({ ...kart, temsilci: e.target.value })} />
                    <input style={{ ...inp, width: 120 }} placeholder="Telefon" value={kart.telefon} onChange={(e) => setKart({ ...kart, telefon: e.target.value })} />
                    <input style={{ ...inp, width: 150 }} placeholder="Ziyaret dönemi (ör. Mart/Eylül)" value={kart.ziyaretDonemi} onChange={(e) => setKart({ ...kart, ziyaretDonemi: e.target.value })} />
                    <input style={{ ...inp, width: 220 }} placeholder="Not" value={kart.aciklama} onChange={(e) => setKart({ ...kart, aciklama: e.target.value })} />
                    <button style={btnYesil} onClick={() => void kartKaydet()}>Kaydet</button>
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
                  12 ay: {tarih(analiz.donem.b12)} – {tarih(analiz.donem.bugun)} (eski Odoo + yeni sistem) · 23-24: Siber satışları · Stok: şu an tüm konumlar
                </div>
              </div>

              <div style={{ ...kutu, padding: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <select style={inp} value={tur} onChange={(e) => setTur(e.target.value as typeof tur)}>
                  <option value="">Optik + Güneş</option>
                  <option value="OPTIK">Optik</option>
                  <option value="GUNES">Güneş</option>
                </select>
                {(Object.keys(DURUM) as SaDurum[]).filter((d) => d !== 'ESKI' || eskiGoster).map((d) => (
                  <button
                    key={d}
                    title={DURUM[d].aciklama}
                    onClick={() => setDurumF((s) => { const n = new Set(s); if (n.has(d)) n.delete(d); else n.add(d); return n })}
                    style={{ ...btn, padding: '5px 9px', borderColor: durumF.has(d) ? DURUM[d].renk : '#d1d5db', backgroundColor: durumF.has(d) ? '#f9fafb' : 'white', color: DURUM[d].renk }}
                  >
                    {DURUM[d].ikon} {DURUM[d].ad} ({sayac[d] ?? 0})
                  </button>
                ))}
                <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={eskiGoster} onChange={(e) => setEskiGoster(e.target.checked)} /> 📜 2023-24 modelleri ({sayac.ESKI ?? 0})
                </label>
                <input style={{ ...inp, width: 180, marginLeft: 'auto' }} placeholder="Model / renk süz" value={modelAra} onChange={(e) => setModelAra(e.target.value)} />
              </div>

              <div style={{ ...kutu, padding: 0, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}></th>
                      <th style={th}>Model</th>
                      <th style={th}>Tür</th>
                      <th style={{ ...th, ...sag }}>Stok</th>
                      <th style={{ ...th, ...sag }} title="Ana Depo / mağazalar">Depo / Mğz</th>
                      <th style={{ ...th, ...sag }}>12 ay</th>
                      <th style={{ ...th, ...sag }}>3 ay</th>
                      <th style={{ ...th, ...sag }}>23-24</th>
                      <th style={th}>Son satış</th>
                      <th style={{ ...th, ...sag }}>Fiyat</th>
                      <th style={{ ...th, ...sag }} title="Odoo'daki maliyet">Maliyet</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {modeller.map((m) => (
                      <ModelSatiri
                        key={m.anahtar}
                        m={m}
                        acik={acik.has(m.anahtar)}
                        vurgulu={vurgu === m.anahtar}
                        onToggle={() => setAcik((s) => { const n = new Set(s); if (n.has(m.anahtar)) n.delete(m.anahtar); else n.add(m.anahtar); return n })}
                        onEkle={(renk, adet, vid, olcu) => modelSepete(m, renk, adet, vid, olcu)}
                      />
                    ))}
                    {!modeller.length ? (
                      <tr><td style={{ ...td, color: '#6b7280' }} colSpan={12}>Bu süzgeçle model yok.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div style={{ ...kutu, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <b style={{ fontSize: 12 }}>➕ Yeni model / sistemde olmayan renk:</b>
                <input style={{ ...inp, width: 150 }} placeholder="Model kodu" value={yeni.model} onChange={(e) => setYeni({ ...yeni, model: e.target.value })} />
                <input style={{ ...inp, width: 110 }} placeholder="Renk" value={yeni.renk} onChange={(e) => setYeni({ ...yeni, renk: e.target.value })} />
                <select style={inp} value={tur || 'OPTIK'} onChange={(e) => setTur(e.target.value as typeof tur)}>
                  <option value="OPTIK">Optik</option>
                  <option value="GUNES">Güneş</option>
                </select>
                <input style={{ ...inp, width: 60 }} type="number" min={1} value={yeni.adet} onChange={(e) => setYeni({ ...yeni, adet: e.target.value })} />
                <input style={{ ...inp, width: 200 }} placeholder="Not (fiyat, ölçü…)" value={yeni.not} onChange={(e) => setYeni({ ...yeni, not: e.target.value })} />
                <button
                  style={btnAna}
                  disabled={!yeni.model.trim()}
                  onClick={() => {
                    const t = tur || 'OPTIK'
                    sepeteEkle({
                      varyantId: 0,
                      marka: analiz.marka,
                      urunAdi: `${analiz.marka} ${TUR_AD[t].toLocaleUpperCase('tr-TR')} ${yeni.model.trim().toLocaleUpperCase('tr-TR')}`,
                      nitelik: yeni.renk.trim().toLocaleUpperCase('tr-TR'),
                      adet: Math.max(1, Number(yeni.adet) || 1),
                      not: ['YENİ', yeni.not.trim()].filter(Boolean).join(' · '),
                    })
                    setYeni({ model: '', renk: '', adet: '1', not: '' })
                  }}
                >
                  Sepete ekle
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Sepet */}
      <div id="sa-sepet" style={kutu}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <b style={{ fontSize: 14 }}>🛒 Sipariş sepeti</b>
          <span style={{ fontSize: 12, color: '#6b7280' }}>{sepet.length} kalem · {sepetAdet} adet (sepet bu tarayıcıda saklanır, sayfa kapansa da kaybolmaz)</span>
          {sepet.length ? <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => { if (window.confirm('Sepet boşaltılsın mı?')) setSepet([]) }}>Sepeti boşalt</button> : null}
        </div>
        {sepet.length ? (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Ürün</th><th style={th}>Renk / ölçü</th><th style={th}>Adet</th><th style={th}>Not</th><th style={th}></th></tr></thead>
              <tbody>
                {sepet.map((k) => (
                  <tr key={k.key}>
                    <td style={td}>{k.urunAdi}{!k.varyantId ? <span style={{ marginLeft: 6, fontSize: 10, color: '#b45309', fontWeight: 700 }}>sistemde yok</span> : null}</td>
                    <td style={td}>{k.nitelik}</td>
                    <td style={td}>
                      <input style={{ ...inp, width: 60 }} type="number" min={1} value={k.adet} onChange={(e) => setSepet((s) => s.map((x) => (x.key === k.key ? { ...x, adet: Math.max(1, Number(e.target.value) || 1) } : x)))} />
                    </td>
                    <td style={td}>
                      <input style={{ ...inp, width: 200 }} value={k.not} onChange={(e) => setSepet((s) => s.map((x) => (x.key === k.key ? { ...x, not: e.target.value } : x)))} />
                    </td>
                    <td style={td}><button style={{ ...btn, padding: '3px 8px' }} onClick={() => setSepet((s) => s.filter((x) => x.key !== k.key))}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
              <input list="sa-firmalar" style={{ ...inp, width: 260 }} placeholder="Firma (fiziki tedarikçi)" value={sepetFirma} onChange={(e) => setSepetFirma(e.target.value)} />
              <label style={{ fontSize: 12 }}>Teslim yeri</label>
              <select style={inp} value={teslim} onChange={(e) => setTeslim(e.target.value)}>
                {TESLIM.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <input style={{ ...inp, width: 260 }} placeholder="Sipariş notu" value={sepetNot} onChange={(e) => setSepetNot(e.target.value)} />
              <button style={btnYesil} disabled={mesgul} onClick={() => void siparisKaydet()}>💾 Siparişi kaydet</button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#6b7280' }}>Sepet boş. Model satırını açıp renge adet yazın ya da "yeni model" ekleyin.</div>
        )}
      </div>

      {/* Ziyaret siparişleri */}
      <div style={kutu}>
        <b style={{ fontSize: 14 }}>📋 Ziyaret siparişleri</b>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
          <thead><tr><th style={th}>No</th><th style={th}>Tarih</th><th style={th}>Firma</th><th style={th}>Teslim</th><th style={{ ...th, ...sag }}>Kalem</th><th style={{ ...th, ...sag }}>Adet</th><th style={th}>Durum</th><th style={th}></th></tr></thead>
          <tbody>
            {siparisler.map((sp) => (
              <tr key={sp.id}>
                <td style={td}>#{sp.no}</td>
                <td style={td}>{new Date(sp.createdAt).toLocaleDateString('tr-TR')}</td>
                <td style={td}>{sp.tedarikciAdi ?? '—'}</td>
                <td style={td}>{sp.lokasyon}</td>
                <td style={{ ...td, ...sag }}>{sp.kalemler.length}</td>
                <td style={{ ...td, ...sag }}>{sp.kalemler.reduce((a, k) => a + k.adet, 0)}</td>
                <td style={td}>{({ TASLAK: 'Taslak', VERILDI: 'Firmaya iletildi', TAMAMLANDI: 'Geldi', IPTAL: 'İptal' } as const)[sp.durum]}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  <button style={{ ...btn, padding: '3px 8px' }} onClick={() => siparisFormu(sp)}>🖨 Form</button>{' '}
                  {sp.durum === 'TASLAK' ? <button style={{ ...btn, padding: '3px 8px' }} onClick={() => void durumDegis(sp, 'VERILDI', `#${sp.no} firmaya iletildi olarak işaretlensin mi?`)}>İletildi</button> : null}{' '}
                  {sp.durum === 'VERILDI' ? <button style={{ ...btn, padding: '3px 8px' }} onClick={() => void durumDegis(sp, 'TAMAMLANDI', `#${sp.no} geldi olarak işaretlensin mi?`)}>Geldi</button> : null}{' '}
                  {sp.durum === 'TASLAK' || sp.durum === 'VERILDI' ? <button style={{ ...btn, padding: '3px 8px', color: '#dc2626' }} onClick={() => void durumDegis(sp, 'IPTAL', `#${sp.no} iptal edilsin mi?`)}>İptal</button> : null}
                </td>
              </tr>
            ))}
            {!siparisler.length ? <tr><td style={{ ...td, color: '#6b7280' }} colSpan={8}>Henüz ziyaret siparişi yok.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ModelSatiri({ m, acik, vurgulu, onToggle, onEkle }: {
  m: SaModel
  acik: boolean
  vurgulu: boolean
  onToggle: () => void
  onEkle: (renk: string, adet: number, varyantId?: number, olcu?: string) => void
}) {
  const [adet, setAdet] = useState<Record<string, string>>({})
  const d = DURUM[m.durum]
  const lok = Object.entries(m.satisLokasyon).sort((a, b) => b[1] - a[1])
  const sistemdeOlmayanRenkler = m.renkler.filter((r) => !r.sistemde)
  return (
    <>
      <tr id={`sa-${m.anahtar}`} onClick={onToggle} style={{ cursor: 'pointer', backgroundColor: vurgulu ? '#fef9c3' : acik ? '#f9fafb' : undefined }}>
        <td style={{ ...td, color: d.renk, whiteSpace: 'nowrap' }} title={d.aciklama}>{d.ikon} <span style={{ fontSize: 11 }}>{d.ad}</span></td>
        <td style={td}>
          <b>{m.model}</b>
          {!m.sistemde ? <span style={{ marginLeft: 6, fontSize: 10, color: '#7c3aed' }}>sistemde yok</span> : null}
          {m.digerYazimlar.length ? <div style={{ fontSize: 10, color: '#9ca3af' }}>{m.digerYazimlar.join(', ')}</div> : null}
          <div style={{ fontSize: 10, color: '#6b7280' }}>{m.renkler.length} renk</div>
        </td>
        <td style={td}>{TUR_AD[m.tur]}</td>
        <td style={{ ...td, ...sag, fontWeight: 700 }}>{m.stok || '—'}</td>
        <td style={{ ...td, ...sag, color: '#6b7280' }}>{m.stok ? `${m.depo} / ${m.magaza}` : ''}</td>
        <td style={{ ...td, ...sag, fontWeight: 800 }}>{m.satis12 || ''}</td>
        <td style={{ ...td, ...sag }}>{m.satis3 || ''}</td>
        <td style={{ ...td, ...sag, color: '#7c3aed' }}>{m.siber || ''}</td>
        <td style={{ ...td, whiteSpace: 'nowrap' }}>{tarih(m.sonSatis)}</td>
        <td style={{ ...td, ...sag, whiteSpace: 'nowrap' }}>{m.fiyat ? tl(m.fiyat) : ''}</td>
        <td style={{ ...td, ...sag, whiteSpace: 'nowrap', color: '#6b7280' }}>{m.maliyet ? tl(m.maliyet) : ''}</td>
        <td style={td}>{acik ? '▾' : '▸'}</td>
      </tr>
      {acik ? (
        <tr>
          <td style={{ ...td, backgroundColor: '#f9fafb' }} colSpan={12} onClick={(e) => e.stopPropagation()}>
            {lok.length ? (
              <div style={{ fontSize: 11, color: '#374151', marginBottom: 6 }}>
                12 ayda satan mağazalar: {lok.map(([l, a]) => `${l} ${a}`).join(' · ')}
                {m.ilkGiris ? <> · ilk giriş {tarih(m.ilkGiris)}</> : null}
              </div>
            ) : m.ilkGiris ? <div style={{ fontSize: 11, color: '#374151', marginBottom: 6 }}>İlk giriş {tarih(m.ilkGiris)}</div> : null}
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Renk</th><th style={th}>Ölçü</th><th style={th}>Barkod</th>
                  <th style={{ ...th, ...sag }}>Stok</th><th style={th}>Nerede</th><th style={{ ...th, ...sag }}>12 ay</th><th style={{ ...th, ...sag }}>23-24 (renk)</th>
                  <th style={th}>Sipariş adet</th>
                </tr>
              </thead>
              <tbody>
                {m.varyantlar.map((v) => {
                  const r = m.renkler.find((x) => sade(x.renk) === sade(v.renk))
                  const k = `v${v.id}`
                  return (
                    <tr key={v.id}>
                      <td style={td}>{v.renk || '—'}{!v.aktif ? <span style={{ fontSize: 10, color: '#9ca3af' }}> (pasif)</span> : null}</td>
                      <td style={td}>{v.olcu}</td>
                      <td style={{ ...td, fontSize: 10, color: '#6b7280' }}>{v.barkod ?? ''}</td>
                      <td style={{ ...td, ...sag, fontWeight: 700 }}>{v.stok || '—'}</td>
                      <td style={{ ...td, fontSize: 11 }}>{Object.entries(v.lokasyonlar).map(([l, a]) => `${l} ${a}`).join(' · ')}</td>
                      <td style={{ ...td, ...sag }}>{r?.satis12 || ''}</td>
                      <td style={{ ...td, ...sag, color: '#7c3aed' }}>{r?.siber || ''}</td>
                      <td style={td}>
                        <input style={{ ...inp, width: 56 }} type="number" min={0} value={adet[k] ?? ''} onChange={(e) => setAdet({ ...adet, [k]: e.target.value })} />{' '}
                        <button style={{ ...btn, padding: '4px 8px' }} disabled={!(Number(adet[k]) > 0)} onClick={() => { onEkle(v.renk, Number(adet[k]), v.id, v.olcu); setAdet({ ...adet, [k]: '' }) }}>+ Sepet</button>
                      </td>
                    </tr>
                  )
                })}
                {sistemdeOlmayanRenkler.map((r) => {
                  const k = `r${r.renk}`
                  return (
                    <tr key={k} style={{ color: '#6b7280' }}>
                      <td style={td}>{r.renk} <span style={{ fontSize: 10, color: '#7c3aed' }}>(sistemde yok)</span></td>
                      <td style={td}></td><td style={td}></td>
                      <td style={{ ...td, ...sag }}>—</td><td style={td}></td>
                      <td style={{ ...td, ...sag }}>{r.satis12 || ''}</td>
                      <td style={{ ...td, ...sag, color: '#7c3aed' }}>{r.siber || ''}</td>
                      <td style={td}>
                        <input style={{ ...inp, width: 56 }} type="number" min={0} value={adet[k] ?? ''} onChange={(e) => setAdet({ ...adet, [k]: e.target.value })} />{' '}
                        <button style={{ ...btn, padding: '4px 8px' }} disabled={!(Number(adet[k]) > 0)} onClick={() => { onEkle(r.renk === '-' ? '' : r.renk, Number(adet[k])); setAdet({ ...adet, [k]: '' }) }}>+ Sepet</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  )
}
