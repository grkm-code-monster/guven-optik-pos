import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getIkmalSatilanlar,
  getIkmalTaslaklar,
  getSonSevk,
  ikmalGonder,
  ikmalTaslakIptal,
  ikmalTaslakOlustur,
  ikmalToplama,
  type IkmalKalem,
  type IkmalSatir,
  type IkmalTaslak,
} from '../../api/ikmal.api'

/**
 * 13.11.2026 — Mağaza İkmali: mağazanın sattığı çerçeve/güneş gözlüklerinin yerine Ana Depo'dan birebir sevk.
 * Satılanlar → öneri (depodan gönder / alternatif renk-ölçü / tükendi) → taslak → toplama listesi → transfer.
 */

const MAGAZALAR = ['GVN1', 'GVN2', 'GVN3', 'GVN4', 'GVN5', 'GVN6', 'GVN7', 'GVN8', 'GVN9', 'GVN10', 'GVNP', 'GUVENP2', 'ETICARET']
const BUGUN = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
const GUN_ONCE = (n: number) => {
  const d = new Date(`${BUGUN()}T12:00:00+03:00`)
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}
const trTarih = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—')
const trSaat = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }) : '—')
const nit = (s: { model: string; renk: string; olcu: string }) => [s.model, s.renk, s.olcu].filter(Boolean).join(' / ')
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

const kutu: React.CSSProperties = { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }
const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
const etk: React.CSSProperties = { fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 4, display: 'block' }
const btn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }
const btnAna: React.CSSProperties = { ...btn, border: 'none', backgroundColor: '#1a1a2e', color: 'white' }
const btnYesil: React.CSSProperties = { ...btn, border: 'none', backgroundColor: '#059669', color: 'white' }
const th: React.CSSProperties = { padding: '8px 6px', textAlign: 'left', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 6px', fontSize: 12, borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }

type Donem = 'sonsevk' | 'yedi' | 'ay' | 'ozel'
type Secim = IkmalKalem & { key: string }

function yazdir(baslik: string, govde: string) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(baslik)}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;margin:18px}h1{font-size:16px;margin:0 0 4px}
.alt{color:#555;margin-bottom:10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:5px 6px;text-align:left;vertical-align:top}
th{background:#eee}.kutu{width:14px;height:14px;border:1px solid #333;display:inline-block}</style></head><body>${govde}
<script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}

export default function MagazaIkmaliTab() {
  const [lokasyon, setLokasyon] = useState('GVN2')
  const [tur, setTur] = useState<'' | 'CERCEVE' | 'GUNES'>('')
  const [donem, setDonem] = useState<Donem>('sonsevk')
  const [bas, setBas] = useState(GUN_ONCE(6))
  const [bit, setBit] = useState(BUGUN())
  const [sonSevk, setSonSevk] = useState<string | null>(null)
  const [satirlar, setSatirlar] = useState<IkmalSatir[] | null>(null)
  const [kalemSayisi, setKalemSayisi] = useState(0)
  const [secim, setSecim] = useState<Map<string, Secim>>(new Map())
  const [altSecim, setAltSecim] = useState<Record<number, number>>({})
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [bilgi, setBilgi] = useState<string | null>(null)
  const [taslaklar, setTaslaklar] = useState<IkmalTaslak[]>([])
  const [islem, setIslem] = useState<string | null>(null)

  const taslakYukle = useCallback(async () => {
    try {
      setTaslaklar(await getIkmalTaslaklar(lokasyon))
    } catch {
      setTaslaklar([])
    }
  }, [lokasyon])

  useEffect(() => {
    void taslakYukle()
    getSonSevk(lokasyon).then(setSonSevk).catch(() => setSonSevk(null))
    setSatirlar(null)
    setSecim(new Map())
  }, [lokasyon, taslakYukle])

  useEffect(() => {
    if (donem === 'sonsevk') {
      setBas(sonSevk ? new Date(sonSevk).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }) : GUN_ONCE(6))
      setBit(BUGUN())
    } else if (donem === 'yedi') {
      setBas(GUN_ONCE(6))
      setBit(BUGUN())
    } else if (donem === 'ay') {
      setBas(`${BUGUN().slice(0, 8)}01`)
      setBit(BUGUN())
    }
  }, [donem, sonSevk])

  async function ara(e?: React.FormEvent) {
    e?.preventDefault()
    setYukleniyor(true)
    setHata(null)
    setBilgi(null)
    try {
      const r = await getIkmalSatilanlar({ lokasyon, bas, bit, tur })
      setSatirlar(r.satirlar)
      setKalemSayisi(r.satisKalemSayisi)
      const m = new Map<string, Secim>()
      for (const s of r.satirlar) {
        if (s.oneri === 'GONDER' && s.onerilenAdet > 0) {
          const key = `${s.varyantId}>${s.varyantId}`
          m.set(key, { key, varyantId: s.varyantId, urunAdi: s.sablonAdi, nitelik: nit(s), adet: s.onerilenAdet, sebep: 'SATIS', satilanVaryantId: s.varyantId })
        }
      }
      setSecim(m)
      setAltSecim({})
    } catch (err: unknown) {
      const x = err as { response?: { data?: { error?: string } }; message?: string }
      setHata(x?.response?.data?.error ?? x?.message ?? 'Liste alınamadı')
    } finally {
      setYukleniyor(false)
    }
  }

  function ayarla(key: string, deger: Secim | null) {
    setSecim((p) => {
      const n = new Map(p)
      if (deger) n.set(key, deger)
      else n.delete(key)
      return n
    })
  }

  const ozet = useMemo(() => {
    const s = satirlar ?? []
    return {
      gonder: s.filter((x) => x.oneri === 'GONDER').length,
      alternatif: s.filter((x) => x.oneri === 'ALTERNATIF').length,
      tukendi: s.filter((x) => x.oneri === 'TUKENDI').length,
      satis: s.reduce((a, x) => a + x.satisAdet, 0),
    }
  }, [satirlar])
  const seciliAdet = [...secim.values()].reduce((a, x) => a + x.adet, 0)

  async function taslakKaydet() {
    if (!secim.size) return
    setIslem('kaydet')
    setHata(null)
    try {
      const t = await ikmalTaslakOlustur({
        hedefLokasyon: lokasyon,
        kalemler: [...secim.values()].map(({ key: _k, ...k }) => k),
        donemBas: bas,
        donemBit: bit,
      })
      setBilgi(`İkmal taslağı #${t.no} oluşturuldu (${secim.size} ürün, ${seciliAdet} adet). Aşağıdaki listeden toplama listesini yazdırıp transferi başlatabilirsiniz.`)
      setSecim(new Map())
      await taslakYukle()
      await ara()
    } catch (err: unknown) {
      const x = err as { response?: { data?: { error?: string } }; message?: string }
      setHata(x?.response?.data?.error ?? x?.message ?? 'Taslak kaydedilemedi')
    } finally {
      setIslem(null)
    }
  }

  function listeYazdir(sadeceTukenen: boolean) {
    const s = (satirlar ?? []).filter((x) => !sadeceTukenen || x.oneri === 'TUKENDI')
    const baslik = sadeceTukenen ? `Tükenenler — ${lokasyon}` : `Satılanlar ve ikmal önerisi — ${lokasyon}`
    const satir = s.map((x) => `<tr><td>${esc(x.sablonAdi)}</td><td>${esc(nit(x))}</td><td>${esc(x.barkod ?? '')}</td><td>${x.satisAdet}</td>
<td>${x.magazaAdet}</td><td>${x.depoAdet}</td><td>${esc(x.digerKonumlar.map((d) => `${d.lokasyon}:${d.adet}`).join(' '))}</td>
<td>${x.oneri === 'GONDER' ? 'Depodan gönder' : x.oneri === 'ALTERNATIF' ? 'Alternatif: ' + esc(x.alternatifler.map((a) => `${a.renk}/${a.olcu} (${a.depoAdet})`).join(', ')) : 'TÜKENDİ — satın alma'}</td></tr>`).join('')
    yazdir(baslik, `<h1>${esc(baslik)}</h1><div class="alt">Dönem: ${trTarih(bas + 'T12:00:00+03:00')} – ${trTarih(bit + 'T12:00:00+03:00')} · ${s.length} ürün</div>
<table><thead><tr><th>Ürün</th><th>Model / Renk / Ölçü</th><th>Barkod</th><th>Satış</th><th>Mağazada</th><th>Ana Depo</th><th>Diğer</th><th>Öneri</th></tr></thead><tbody>${satir}</tbody></table>`)
  }

  async function toplamaYazdir(t: IkmalTaslak) {
    setIslem(t.id)
    try {
      const r = await ikmalToplama(t.id)
      const satir = r.satirlar.map((s) => `<tr><td><span class="kutu"></span></td><td>${esc(s.urunAdi)}</td><td>${esc(s.nitelik)}</td><td>${s.adet}</td>
<td>${s.lotlar.map((l) => esc(l.lotNo || '(lotsuz)') + (l.adet > 1 ? ` ×${l.adet}` : '')).join('<br>')}${s.eksik ? `<br><b style="color:#b91c1c">EKSİK ${s.eksik}</b>` : ''}</td></tr>`).join('')
      yazdir(`Toplama listesi #${t.no}`, `<h1>Toplama listesi — İkmal #${t.no}</h1>
<div class="alt">Ana Depo → ${esc(t.hedefLokasyon)} · ${trSaat(t.createdAt)} · ${r.satirlar.reduce((a, s) => a + s.adet, 0)} adet${t.olusturanAdi ? ' · ' + esc(t.olusturanAdi) : ''}</div>
<table><thead><tr><th></th><th>Ürün</th><th>Model / Renk / Ölçü</th><th>Adet</th><th>Alınacak seri / lot (en eski önce)</th></tr></thead><tbody>${satir}</tbody></table>`)
    } catch (err: unknown) {
      const x = err as { response?: { data?: { error?: string } }; message?: string }
      setHata(x?.response?.data?.error ?? x?.message ?? 'Toplama listesi alınamadı')
    } finally {
      setIslem(null)
    }
  }

  async function gonder(t: IkmalTaslak) {
    if (!window.confirm(`İkmal #${t.no}: Ana Depo → ${t.hedefLokasyon} transferi başlatılsın mı?\nÜrünler toplama listesindeki seri/lotlarla gönderilir.`)) return
    setIslem(t.id)
    setHata(null)
    const r = await ikmalGonder(t.id)
    if (r.success) setBilgi(`İkmal #${t.no} transferi başlatıldı${r.refNo ? ` (${r.refNo})` : ''}. Mağaza "Bekleyen Transferler"den kabul edecek.`)
    else setHata(r.message ?? 'Transfer başlatılamadı')
    setIslem(null)
    await taslakYukle()
    getSonSevk(lokasyon).then(setSonSevk).catch(() => undefined)
  }

  async function iptal(t: IkmalTaslak) {
    if (!window.confirm(`İkmal taslağı #${t.no} iptal edilsin mi?`)) return
    setIslem(t.id)
    try {
      await ikmalTaslakIptal(t.id)
      await taslakYukle()
    } finally {
      setIslem(null)
    }
  }

  return (
    <div>
      <form onSubmit={ara} style={{ ...kutu, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label>
          <span style={etk}>Mağaza</span>
          <select value={lokasyon} onChange={(e) => setLokasyon(e.target.value)} style={inp}>
            {MAGAZALAR.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          <span style={etk}>Tür</span>
          <select value={tur} onChange={(e) => setTur(e.target.value as typeof tur)} style={inp}>
            <option value="">Çerçeve + Güneş</option>
            <option value="CERCEVE">Optik Çerçeve</option>
            <option value="GUNES">Güneş Gözlüğü</option>
          </select>
        </label>
        <label>
          <span style={etk}>Dönem</span>
          <select value={donem} onChange={(e) => setDonem(e.target.value as Donem)} style={inp}>
            <option value="sonsevk">Son sevkten bu yana{sonSevk ? ` (${trTarih(sonSevk)})` : ' (sevk yok → son 7 gün)'}</option>
            <option value="yedi">Son 7 gün</option>
            <option value="ay">Bu ay</option>
            <option value="ozel">Tarih seç</option>
          </select>
        </label>
        <label>
          <span style={etk}>Başlangıç</span>
          <input type="date" value={bas} onChange={(e) => { setBas(e.target.value); setDonem('ozel') }} style={inp} />
        </label>
        <label>
          <span style={etk}>Bitiş</span>
          <input type="date" value={bit} onChange={(e) => { setBit(e.target.value); setDonem('ozel') }} style={inp} />
        </label>
        <button type="submit" disabled={yukleniyor} style={btnAna}>{yukleniyor ? 'Hazırlanıyor…' : '🔍 Satılanları getir'}</button>
      </form>

      {hata ? <div style={{ ...kutu, borderColor: '#fecaca', color: '#991b1b' }}>{hata}</div> : null}
      {bilgi ? <div style={{ ...kutu, borderColor: '#a7f3d0', color: '#065f46', fontWeight: 700 }}>{bilgi}</div> : null}

      {satirlar ? (
        <div style={kutu}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>
              {lokasyon}: {satirlar.length} farklı ürün satılmış ({ozet.satis} adet)
            </div>
            <span style={{ fontSize: 12, color: '#047857', fontWeight: 700 }}>✅ Depoda var: {ozet.gonder}</span>
            <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>🔁 Alternatif: {ozet.alternatif}</span>
            <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 700 }}>⛔ Tükendi: {ozet.tukendi}</span>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => listeYazdir(false)} style={btn}>🖨️ Listeyi yazdır</button>
            <button type="button" disabled={!ozet.tukendi} onClick={() => listeYazdir(true)} style={btn}>🛒 Tükenenleri yazdır</button>
          </div>
          {!satirlar.length ? (
            <div style={{ padding: 20, color: '#6b7280', textAlign: 'center' }}>
              Bu dönemde {lokasyon}'de satılan çerçeve/güneş gözlüğü yok{kalemSayisi ? ` (${kalemSayisi} satış kalemi var ama çerçeve/güneş değil)` : ''}.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th} />
                    <th style={th}>Satılan ürün</th>
                    <th style={th}>Satış</th>
                    <th style={th}>Son satış</th>
                    <th style={th}>Mağazada</th>
                    <th style={th}>Ana Depo</th>
                    <th style={th}>Diğer konumlar</th>
                    <th style={th}>Öneri</th>
                    <th style={th}>Gönderilecek</th>
                  </tr>
                </thead>
                <tbody>
                  {satirlar.map((s) => {
                    const key = `${s.varyantId}>${s.varyantId}`
                    const sec = secim.get(key)
                    const altlar = [...secim.values()].filter((x) => x.satilanVaryantId === s.varyantId && x.varyantId !== s.varyantId)
                    return (
                      <tr key={s.varyantId} style={{ backgroundColor: sec || altlar.length ? '#f0fdf4' : undefined }}>
                        <td style={td}>
                          {s.oneri === 'GONDER' ? (
                            <input
                              type="checkbox"
                              checked={!!sec}
                              onChange={() => ayarla(key, sec ? null : { key, varyantId: s.varyantId, urunAdi: s.sablonAdi, nitelik: nit(s), adet: Math.max(1, Math.min(s.satisAdet, s.depoAdet)), sebep: 'SATIS', satilanVaryantId: s.varyantId })}
                            />
                          ) : null}
                        </td>
                        <td style={td}>
                          <b>{s.sablonAdi}</b>
                          <div style={{ color: '#374151' }}>{nit(s) || '—'}{s.barkod ? <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}> · {s.barkod}</span> : null}</div>
                          {s.taslaktaAdet ? <div style={{ color: '#2563eb', fontSize: 11, fontWeight: 700 }}>Açık taslakta zaten {s.taslaktaAdet} adet var</div> : null}
                        </td>
                        <td style={{ ...td, fontWeight: 800 }}>{s.satisAdet}</td>
                        <td style={td}>{trTarih(s.sonSatis)}</td>
                        <td style={td}>{s.magazaAdet}</td>
                        <td style={{ ...td, fontWeight: 800, color: s.depoAdet ? '#047857' : '#b91c1c' }}>{s.depoAdet}</td>
                        <td style={{ ...td, fontSize: 11 }}>{s.digerKonumlar.map((d) => `${d.lokasyon}: ${d.adet}`).join(' · ') || '—'}</td>
                        <td style={td}>
                          {s.oneri === 'GONDER' ? <span style={{ color: '#047857', fontWeight: 700 }}>✅ Depodan gönder</span> : null}
                          {s.oneri === 'TUKENDI' ? (
                            <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                              ⛔ Tükendi → satın alma
                              {s.digerKonumlar.length ? <div style={{ color: '#6b7280', fontWeight: 400, fontSize: 11 }}>Başka mağazada duruyor</div> : null}
                            </span>
                          ) : null}
                          {s.oneri === 'ALTERNATIF' ? (
                            <div>
                              <div style={{ color: '#1d4ed8', fontWeight: 700, marginBottom: 4 }}>🔁 Aynı model, başka renk/ölçü</div>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <select
                                  value={altSecim[s.varyantId] ?? s.alternatifler[0]?.varyantId ?? ''}
                                  onChange={(e) => setAltSecim((p) => ({ ...p, [s.varyantId]: Number(e.target.value) }))}
                                  style={{ ...inp, padding: '4px 6px', fontSize: 12 }}
                                >
                                  {s.alternatifler.map((a) => (
                                    <option key={a.varyantId} value={a.varyantId}>{[a.renk, a.olcu].filter(Boolean).join(' / ') || `#${a.varyantId}`} (depoda {a.depoAdet})</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  style={{ ...btn, padding: '4px 8px', fontSize: 12 }}
                                  onClick={() => {
                                    const aid = altSecim[s.varyantId] ?? s.alternatifler[0]?.varyantId
                                    const a = s.alternatifler.find((x) => x.varyantId === aid)
                                    if (!a) return
                                    const k = `${s.varyantId}>${a.varyantId}`
                                    ayarla(k, { key: k, varyantId: a.varyantId, urunAdi: s.sablonAdi, nitelik: [s.model, a.renk, a.olcu].filter(Boolean).join(' / '), adet: 1, sebep: 'ALTERNATIF', satilanVaryantId: s.varyantId })
                                  }}
                                >
                                  Ekle
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </td>
                        <td style={td}>
                          {sec ? (
                            <input
                              type="number"
                              min={1}
                              max={s.depoAdet}
                              value={sec.adet}
                              onChange={(e) => ayarla(key, { ...sec, adet: Math.max(1, Math.min(s.depoAdet, Math.round(Number(e.target.value) || 1))) })}
                              style={{ ...inp, width: 60, padding: '4px 6px' }}
                            />
                          ) : null}
                          {altlar.map((a) => (
                            <div key={a.key} style={{ fontSize: 11, marginTop: 4 }}>
                              {a.nitelik} × {a.adet}{' '}
                              <button type="button" onClick={() => ayarla(a.key, null)} style={{ border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}>✕</button>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>Seçili: <b>{secim.size}</b> ürün · <b>{seciliAdet}</b> adet</span>
            <button type="button" disabled={!secim.size || islem === 'kaydet'} onClick={() => void taslakKaydet()} style={{ ...btnYesil, opacity: secim.size ? 1 : 0.5 }}>
              📦 İkmal taslağı oluştur
            </button>
          </div>
        </div>
      ) : null}

      <div style={kutu}>
        <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 10 }}>📋 {lokasyon} ikmal taslakları</div>
        {!taslaklar.length ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>Henüz taslak yok.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>No</th>
                <th style={th}>Oluşturma</th>
                <th style={th}>Dönem</th>
                <th style={th}>Ürün / adet</th>
                <th style={th}>Durum</th>
                <th style={th}>Oluşturan</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {taslaklar.map((t) => {
                const adet = (t.kalemler ?? []).reduce((a, k) => a + Number(k.adet ?? 0), 0)
                return (
                  <tr key={t.id}>
                    <td style={{ ...td, fontWeight: 800 }}>#{t.no}</td>
                    <td style={td}>{trSaat(t.createdAt)}</td>
                    <td style={td}>{t.donemBas ? `${trTarih(t.donemBas)} – ${trTarih(t.donemBit)}` : '—'}</td>
                    <td style={td}>{(t.kalemler ?? []).length} / {adet}</td>
                    <td style={td}>
                      {t.durum === 'TASLAK' ? <span style={{ color: '#b45309', fontWeight: 700 }}>Taslak</span> : null}
                      {t.durum === 'GONDERILDI' ? <span style={{ color: '#047857', fontWeight: 700 }}>Gönderildi {trSaat(t.gonderildi)}{t.transferRef ? ` · ${t.transferRef}` : ''}</span> : null}
                      {t.durum === 'IPTAL' ? <span style={{ color: '#6b7280' }}>İptal</span> : null}
                    </td>
                    <td style={td}>{t.olusturanAdi ?? '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button type="button" disabled={islem === t.id} onClick={() => void toplamaYazdir(t)} style={{ ...btn, padding: '5px 10px', fontSize: 12 }}>🖨️ Toplama listesi</button>{' '}
                      {t.durum === 'TASLAK' ? (
                        <>
                          <button type="button" disabled={islem === t.id} onClick={() => void gonder(t)} style={{ ...btnYesil, padding: '5px 10px', fontSize: 12 }}>🚚 Transferi başlat</button>{' '}
                          <button type="button" disabled={islem === t.id} onClick={() => void iptal(t)} style={{ ...btn, padding: '5px 10px', fontSize: 12 }}>İptal</button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
