import { useCallback, useEffect, useState } from 'react'
import {
  getKurallar,
  getMinMax,
  getSeriler,
  getSiparisler,
  getTedarikciler,
  siparisDurum,
  siparisOlustur,
  ikmalTaslakOlustur,
  kuralKaydet,
  kuralKopyala,
  kuralSil,
  type MinMaxSatir,
  type SatinAlmaSiparis,
  type StokSeviyeKurali,
} from '../../api/ikmal.api'

/**
 * 13.11.2026 — Min-max ikmali: stok cam, kontak lens, solüsyon.
 * Kural = mağaza + seri (ürün adının başı) + isteğe bağlı SPH/CYL aralığı + min + max.
 * Mağaza stoğu min'in altına düşen her derece/ürün için max'a tamamlayacak kadar Ana Depo'dan sevk önerilir.
 */

const MAGAZALAR = ['GVN1', 'GVN2', 'GVN3', 'GVN4', 'GVN5', 'GVN6', 'GVN7', 'GVN8', 'GVN9', 'GVN10', 'GVNP', 'GUVENP2', 'ETICARET']
const kutu: React.CSSProperties = { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 12 }
const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '7px 12px', borderRadius: 8, border: '1px solid #d1d5db', backgroundColor: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }
const btnAna: React.CSSProperties = { ...btn, border: 'none', backgroundColor: '#1a1a2e', color: 'white' }
const btnYesil: React.CSSProperties = { ...btn, border: 'none', backgroundColor: '#059669', color: 'white' }
const th: React.CSSProperties = { padding: '7px 6px', textAlign: 'left', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px', fontSize: 12, borderBottom: '1px solid #f3f4f6' }

const d2 = (v: unknown) => {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? (n > 0 ? '+' : '') + n.toFixed(2) : ''
}
const aralik = (a: unknown, b: unknown) => (a == null && b == null ? 'tümü' : `${d2(a) || '…'} / ${d2(b) || '…'}`)
const hataMesaji = (e: unknown, v: string) => {
  const x = e as { response?: { data?: { error?: string } }; message?: string }
  return x?.response?.data?.error ?? x?.message ?? v
}

type Form = { seri: string; sphMin: string; sphMax: string; cylMin: string; cylMax: string; min: string; max: string }
const BOS: Form = { seri: '', sphMin: '', sphMax: '', cylMin: '', cylMax: '', min: '1', max: '2' }

export default function MinMaxIkmal({ lokasyon, onTaslakOlustu }: { lokasyon: string; onTaslakOlustu: () => void }) {
  const [kurallar, setKurallar] = useState<StokSeviyeKurali[]>([])
  const [form, setForm] = useState<Form>(BOS)
  const [onizleme, setOnizleme] = useState<string | null>(null)
  const [seriler, setSeriler] = useState<{ seri: string; kategori: string; adet: number }[]>([])
  const [seriFiltre, setSeriFiltre] = useState('')
  const [seriAcik, setSeriAcik] = useState(false)
  const [satirlar, setSatirlar] = useState<MinMaxSatir[] | null>(null)
  const [ozet, setOzet] = useState<{ kuralId: string; seri: string; uyan: number; eksik: number }[]>([])
  const [adet, setAdet] = useState<Record<number, number>>({})
  const [secili, setSecili] = useState<Set<number>>(new Set())
  const [kopyaHedef, setKopyaHedef] = useState<Set<string>>(new Set())
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'hata'; text: string } | null>(null)
  const [mesgul, setMesgul] = useState(false)
  const [firmalar, setFirmalar] = useState<{ id: number; ad: string }[]>([])
  const [firma, setFirma] = useState('')
  const [siparisler, setSiparisler] = useState<SatinAlmaSiparis[]>([])

  const yukle = useCallback(async () => {
    try {
      setKurallar(await getKurallar(lokasyon))
    } catch {
      setKurallar([])
    }
  }, [lokasyon])
  const siparisYukle = useCallback(async () => {
    try {
      setSiparisler(await getSiparisler(lokasyon))
    } catch {
      setSiparisler([])
    }
  }, [lokasyon])
  useEffect(() => {
    void yukle()
    void siparisYukle()
    setSatirlar(null)
    setKopyaHedef(new Set())
  }, [yukle, siparisYukle])
  useEffect(() => {
    getTedarikciler().then(setFirmalar).catch(() => setFirmalar([]))
    getSeriler().then(setSeriler).catch(() => setSeriler([]))
  }, [])

  async function ekle(e: React.FormEvent) {
    e.preventDefault()
    setMesaj(null)
    if (!form.seri) {
      setMesaj({ tip: 'hata', text: 'Önce listeden bir seri / ürün seçin' })
      return
    }
    try {
      await kuralKaydet({
        lokasyon,
        seri: form.seri,
        sphMin: form.sphMin === '' ? null : form.sphMin,
        sphMax: form.sphMax === '' ? null : form.sphMax,
        cylMin: form.cylMin === '' ? null : form.cylMin,
        cylMax: form.cylMax === '' ? null : form.cylMax,
        min: Number(form.min),
        max: Number(form.max),
      })
      setForm(BOS)
      setOnizleme(null)
      await yukle()
    } catch (err) {
      setMesaj({ tip: 'hata', text: hataMesaji(err, 'Kural kaydedilemedi') })
    }
  }

  async function guncelle(k: StokSeviyeKurali, degis: Partial<StokSeviyeKurali>) {
    try {
      await kuralKaydet({ ...k, ...degis })
      await yukle()
    } catch (err) {
      setMesaj({ tip: 'hata', text: hataMesaji(err, 'Kural güncellenemedi') })
    }
  }

  async function sil(k: StokSeviyeKurali) {
    if (!window.confirm(`"${k.seri}" kuralı silinsin mi?`)) return
    await kuralSil(k.id)
    await yukle()
  }

  async function kopyala() {
    if (!kopyaHedef.size) return
    if (!window.confirm(`${lokasyon} mağazasının ${kurallar.length} kuralı ${[...kopyaHedef].join(', ')} mağazalarına kopyalansın mı? (Aynı seri+aralık varsa üzerine yazılır)`)) return
    const n = await kuralKopyala(lokasyon, [...kopyaHedef])
    setMesaj({ tip: 'ok', text: `${n} kural kopyalandı.` })
    setKopyaHedef(new Set())
  }

  async function hesapla() {
    setMesgul(true)
    setMesaj(null)
    try {
      const r = await getMinMax(lokasyon)
      setSatirlar(r.satirlar)
      setOzet(r.kuralOzet)
      // Cam/lens firmadan doğrudan mağazaya gelir: varsayılan adet = eksik (depoda varsa depodan gönderilebilecek kadarı)
      setAdet(Object.fromEntries(r.satirlar.map((s) => [s.varyantId, s.eksik])))
      setSecili(new Set(r.satirlar.map((s) => s.varyantId)))
    } catch (err) {
      setMesaj({ tip: 'hata', text: hataMesaji(err, 'Hesaplanamadı') })
    } finally {
      setMesgul(false)
    }
  }

  async function siparisTaslagi() {
    const kalemler = (satirlar ?? [])
      .filter((s) => secili.has(s.varyantId) && (adet[s.varyantId] ?? 0) > 0)
      .map((s) => ({ varyantId: s.varyantId, urunAdi: s.ad, nitelik: '', adet: adet[s.varyantId] }))
    if (!kalemler.length) return
    const f = firmalar.find((x) => x.ad.toLocaleUpperCase('tr-TR') === firma.trim().toLocaleUpperCase('tr-TR'))
    setMesgul(true)
    try {
      const sp = await siparisOlustur({ lokasyon, tedarikciId: f?.id ?? null, tedarikciAdi: f?.ad ?? (firma.trim() || null), kalemler, kaynak: 'MINMAX', aciklama: 'Min-max eksikleri' })
      setMesaj({ tip: 'ok', text: `Sipariş #${sp.no} oluşturuldu (${kalemler.length} kalem, ${kalemler.reduce((a, k) => a + k.adet, 0)} adet${sp.tedarikciAdi ? ' · ' + sp.tedarikciAdi : ''}). Aşağıdaki listeden sipariş formunu yazdırabilirsiniz.` })
      await siparisYukle()
      await hesapla()
    } catch (err) {
      setMesaj({ tip: 'hata', text: hataMesaji(err, 'Sipariş oluşturulamadı') })
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
<table><thead><tr><th>#</th><th>Ürün / derece</th><th>Adet</th></tr></thead><tbody>${sp.kalemler.map((k, i) => `<tr><td>${i + 1}</td><td>${esc(k.urunAdi)}${k.nitelik ? ' ' + esc(k.nitelik) : ''}</td><td><b>${k.adet}</b></td></tr>`).join('')}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
  }

  async function durumDegis(sp: SatinAlmaSiparis, durum: SatinAlmaSiparis['durum'], soru: string) {
    if (!window.confirm(soru)) return
    await siparisDurum(sp.id, durum)
    await siparisYukle()
  }

  async function taslak() {
    // Depodan ikmal: sadece Ana Depo'da stoğu olan satırlar, en fazla depodaki kadar
    const kalemler = (satirlar ?? [])
      .filter((s) => secili.has(s.varyantId) && s.depoAdet > 0 && (adet[s.varyantId] ?? 0) > 0)
      .map((s) => ({ varyantId: s.varyantId, urunAdi: s.ad, nitelik: '', adet: Math.min(adet[s.varyantId], s.depoAdet), sebep: 'MINMAX' as const }))
    if (!kalemler.length) return
    setMesgul(true)
    try {
      const t = await ikmalTaslakOlustur({ hedefLokasyon: lokasyon, kalemler, aciklama: 'Min-max ikmali' })
      setMesaj({ tip: 'ok', text: `İkmal taslağı #${t.no} oluşturuldu (${kalemler.length} kalem). Aşağıdaki taslak listesinden toplama listesini yazdırıp transferi başlatabilirsiniz.` })
      onTaslakOlustu()
      await hesapla()
    } catch (err) {
      setMesaj({ tip: 'hata', text: hataMesaji(err, 'Taslak oluşturulamadı') })
    } finally {
      setMesgul(false)
    }
  }

  const seciliAdet = (satirlar ?? []).filter((s) => secili.has(s.varyantId)).reduce((a, s) => a + (adet[s.varyantId] ?? 0), 0)

  return (
    <div>
      {mesaj ? (
        <div style={{ ...kutu, borderColor: mesaj.tip === 'ok' ? '#a7f3d0' : '#fecaca', color: mesaj.tip === 'ok' ? '#065f46' : '#991b1b', fontWeight: 700 }}>{mesaj.text}</div>
      ) : null}

      <div style={kutu}>
        <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 4 }}>📐 {lokasyon} min-max kuralları</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
          Seriyi listeden seçin (stok cam, kontak lens ve solüsyon serileri; kutuya yazdıkça liste daralır).
          Derece aralığı boş bırakılırsa serinin tüm dereceleri kurala girer. Dereceyi <b>-4.00</b> ya da ürün adındaki gibi <b>-0400</b> yazabilirsiniz; CYL eksi yazılır (0 … -2.00).
        </div>
        <form onSubmit={ekle} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={{ fontSize: 11, position: 'relative' }}>Seri / ürün (listeden seçin)<br />
            <input
              value={seriAcik ? seriFiltre : form.seri}
              onFocus={() => { setSeriAcik(true); setSeriFiltre('') }}
              onBlur={() => setTimeout(() => setSeriAcik(false), 200)}
              onChange={(e) => setSeriFiltre(e.target.value)}
              placeholder={form.seri || 'Aramak için yazın, listeden seçin'}
              style={{ ...inp, width: 280, borderColor: form.seri ? '#059669' : '#d1d5db', fontWeight: form.seri ? 700 : 400 }}
            />
            {seriAcik ? (
              <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, width: 420, maxHeight: 280, overflowY: 'auto', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                {seriler
                  .filter((x) => !seriFiltre.trim() || seriFiltre.toLocaleUpperCase('tr-TR').split(/\s+/).filter(Boolean).every((k) => `${x.seri} ${x.kategori}`.toLocaleUpperCase('tr-TR').includes(k)))
                  .slice(0, 200)
                  .map((x) => (
                    <div
                      key={x.seri}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setForm((f) => ({ ...f, seri: x.seri }))
                        setOnizleme(`${x.adet} ürün/derece · ${x.kategori}`)
                        setSeriAcik(false)
                      }}
                      style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}
                    >
                      <b>{x.seri}</b> <span style={{ color: '#6b7280' }}>· {x.adet} · {x.kategori}</span>
                    </div>
                  ))}
                {!seriler.length ? <div style={{ padding: 10, color: '#6b7280' }}>Liste yükleniyor…</div> : null}
              </div>
            ) : null}
          </div>
          <label style={{ fontSize: 11 }}>SPH en düşük<br /><input value={form.sphMin} onChange={(e) => setForm({ ...form, sphMin: e.target.value })} placeholder="-4.00" style={{ ...inp, width: 72 }} /></label>
          <label style={{ fontSize: 11 }}>SPH en yüksek<br /><input value={form.sphMax} onChange={(e) => setForm({ ...form, sphMax: e.target.value })} placeholder="+4.00" style={{ ...inp, width: 72 }} /></label>
          <label style={{ fontSize: 11 }}>CYL<br /><input value={form.cylMin} onChange={(e) => setForm({ ...form, cylMin: e.target.value })} placeholder="0" style={{ ...inp, width: 60 }} /></label>
          <label style={{ fontSize: 11 }}>CYL<br /><input value={form.cylMax} onChange={(e) => setForm({ ...form, cylMax: e.target.value })} placeholder="-2.00" style={{ ...inp, width: 60 }} /></label>
          <label style={{ fontSize: 11 }}>Min<br /><input type="number" min={0} value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} style={{ ...inp, width: 56 }} required /></label>
          <label style={{ fontSize: 11 }}>Max<br /><input type="number" min={1} value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} style={{ ...inp, width: 56 }} required /></label>
          <button type="submit" style={btnAna}>➕ Kural ekle</button>
        </form>
        {onizleme ? <div style={{ fontSize: 11, color: '#2563eb', marginBottom: 8 }}>{onizleme}</div> : null}

        {kurallar.length ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
            <thead>
              <tr><th style={th}>Seri / ürün</th><th style={th}>SPH</th><th style={th}>CYL</th><th style={th}>Min</th><th style={th}>Max</th><th style={th}>Kapsam</th><th style={th}>Aktif</th><th style={th} /></tr>
            </thead>
            <tbody>
              {kurallar.map((k) => {
                const o = ozet.find((x) => x.kuralId === k.id)
                return (
                  <tr key={k.id} style={{ opacity: k.aktif ? 1 : 0.5 }}>
                    <td style={{ ...td, fontWeight: 700 }}>{k.seri}</td>
                    <td style={td}>{aralik(k.sphMin, k.sphMax)}</td>
                    <td style={td}>{aralik(k.cylMax, k.cylMin)}</td>
                    <td style={td}><input type="number" min={0} defaultValue={k.min} onBlur={(e) => Number(e.target.value) !== k.min && void guncelle(k, { min: Number(e.target.value) })} style={{ ...inp, width: 52 }} /></td>
                    <td style={td}><input type="number" min={1} defaultValue={k.max} onBlur={(e) => Number(e.target.value) !== k.max && void guncelle(k, { max: Number(e.target.value) })} style={{ ...inp, width: 52 }} /></td>
                    <td style={{ ...td, fontSize: 11, color: '#6b7280' }}>{o ? `${o.uyan} ürün · ${o.eksik} eksik` : '—'}</td>
                    <td style={td}><input type="checkbox" checked={k.aktif} onChange={() => void guncelle(k, { aktif: !k.aktif })} /></td>
                    <td style={{ ...td, textAlign: 'right' }}><button type="button" onClick={() => void sil(k)} style={{ ...btn, padding: '3px 8px' }}>Sil</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, color: '#6b7280' }}>Bu mağaza için henüz kural yok.</div>
        )}

        {kurallar.length ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Bu kuralları kopyala:</span>
            {MAGAZALAR.filter((m) => m !== lokasyon).map((m) => (
              <label key={m} style={{ fontSize: 12 }}>
                <input type="checkbox" checked={kopyaHedef.has(m)} onChange={() => setKopyaHedef((p) => { const n = new Set(p); if (n.has(m)) n.delete(m); else n.add(m); return n })} /> {m}
              </label>
            ))}
            <button type="button" disabled={!kopyaHedef.size} onClick={() => void kopyala()} style={btn}>Kopyala</button>
          </div>
        ) : null}
      </div>

      <div style={kutu}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 15 }}>📦 Min'in altına düşenler</div>
          <div style={{ flex: 1 }} />
          <button type="button" disabled={mesgul || !kurallar.length} onClick={() => void hesapla()} style={btnAna}>{mesgul ? 'Hesaplanıyor…' : '🔍 Eksikleri hesapla'}</button>
        </div>
        {satirlar ? (
          !satirlar.length ? (
            <div style={{ fontSize: 13, color: '#047857', fontWeight: 700 }}>✓ Kurallara göre eksik yok.</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}><input type="checkbox" checked={satirlar.every((s) => secili.has(s.varyantId))} onChange={(e) => setSecili(e.target.checked ? new Set(satirlar.map((s) => s.varyantId)) : new Set())} /></th>
                      <th style={th}>Ürün / derece</th><th style={th}>Min / Max</th><th style={th}>Mağazada</th><th style={th}>Yolda (taslak + sipariş)</th>
                      <th style={th}>Ana Depo</th><th style={th}>Satış (30 gün)</th><th style={th}>Eksik</th><th style={th}>Adet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {satirlar.map((s) => (
                      <tr key={s.varyantId} style={{ backgroundColor: secili.has(s.varyantId) ? '#f0fdf4' : undefined }}>
                        <td style={td}><input type="checkbox" checked={secili.has(s.varyantId)} onChange={() => setSecili((p) => { const n = new Set(p); if (n.has(s.varyantId)) n.delete(s.varyantId); else n.add(s.varyantId); return n })} /></td>
                        <td style={{ ...td, fontWeight: 700 }}>{s.ad}</td>
                        <td style={td}>{s.min} / {s.max}</td>
                        <td style={td}>{s.magazaAdet}</td>
                        <td style={td}>{s.taslakta + s.sipariste || ''}</td>
                        <td style={{ ...td, color: s.depoAdet ? '#047857' : '#9ca3af' }}>{s.depoAdet || '—'}</td>
                        <td style={td}>{s.satis30 || ''}</td>
                        <td style={td}>{s.eksik}</td>
                        <td style={td}>
                          <input type="number" min={0} value={adet[s.varyantId] ?? 0}
                            onChange={(e) => setAdet((p) => ({ ...p, [s.varyantId]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))}
                            style={{ ...inp, width: 56 }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <span style={{ fontSize: 13 }}>Seçili: <b>{secili.size}</b> kalem · <b>{seciliAdet}</b> adet</span>
                <div style={{ flex: 1 }} />
                <label style={{ fontSize: 12 }}>Firma{' '}
                  <input list="mm-firmalar" value={firma} onChange={(e) => setFirma(e.target.value)} placeholder="ör. BETA OPTİK" style={{ ...inp, width: 230 }} />
                  <datalist id="mm-firmalar">{firmalar.map((f) => <option key={f.id} value={f.ad} />)}</datalist>
                </label>
                <button type="button" disabled={mesgul || !seciliAdet} onClick={() => void siparisTaslagi()} style={{ ...btnYesil, opacity: seciliAdet ? 1 : 0.5 }}>🛒 {lokasyon} adına sipariş oluştur</button>
                <button type="button" disabled={mesgul || !satirlar.some((s) => secili.has(s.varyantId) && s.depoAdet > 0)} onClick={() => void taslak()} style={btn} title="Sadece Ana Depo'da stoğu olan satırlar">📦 Depodan ikmal taslağı</button>
              </div>
            </>
          )
        ) : (
          <div style={{ fontSize: 12, color: '#6b7280' }}>Kuralları girdikten sonra "Eksikleri hesapla"ya basın.</div>
        )}
      </div>

      <div style={kutu}>
        <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 10 }}>🛒 {lokasyon} satın alma siparişleri</div>
        {!siparisler.length ? (
          <div style={{ fontSize: 12, color: '#6b7280' }}>Henüz sipariş yok.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr><th style={th}>No</th><th style={th}>Tarih</th><th style={th}>Firma</th><th style={th}>Kalem / adet</th><th style={th}>Durum</th><th style={th}>Oluşturan</th><th style={th} /></tr>
            </thead>
            <tbody>
              {siparisler.map((sp) => (
                <tr key={sp.id}>
                  <td style={{ ...td, fontWeight: 800 }}>#{sp.no}</td>
                  <td style={td}>{new Date(sp.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td style={td}>{sp.tedarikciAdi ?? '—'}</td>
                  <td style={td}>{sp.kalemler.length} / {sp.kalemler.reduce((a, k) => a + k.adet, 0)}</td>
                  <td style={td}>
                    {sp.durum === 'TASLAK' ? <span style={{ color: '#b45309', fontWeight: 700 }}>Taslak</span> : null}
                    {sp.durum === 'VERILDI' ? <span style={{ color: '#1d4ed8', fontWeight: 700 }}>Firmaya iletildi{sp.verildi ? ` · ${new Date(sp.verildi).toLocaleDateString('tr-TR')}` : ''}</span> : null}
                    {sp.durum === 'TAMAMLANDI' ? <span style={{ color: '#047857', fontWeight: 700 }}>Geldi</span> : null}
                    {sp.durum === 'IPTAL' ? <span style={{ color: '#6b7280' }}>İptal</span> : null}
                  </td>
                  <td style={td}>{sp.olusturanAdi ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" onClick={() => siparisFormu(sp)} style={{ ...btn, padding: '4px 8px' }}>🖨️ Sipariş formu</button>{' '}
                    {sp.durum === 'TASLAK' ? <button type="button" onClick={() => void durumDegis(sp, 'VERILDI', `Sipariş #${sp.no} firmaya iletildi olarak işaretlensin mi?`)} style={{ ...btn, padding: '4px 8px' }}>📨 Firmaya iletildi</button> : null}{' '}
                    {sp.durum === 'VERILDI' ? <button type="button" onClick={() => void durumDegis(sp, 'TAMAMLANDI', `Sipariş #${sp.no} geldi (faturalı giriş yapıldı) olarak kapatılsın mı?`)} style={{ ...btn, padding: '4px 8px' }}>✅ Geldi</button> : null}{' '}
                    {sp.durum === 'TASLAK' || sp.durum === 'VERILDI' ? <button type="button" onClick={() => void durumDegis(sp, 'IPTAL', `Sipariş #${sp.no} iptal edilsin mi?`)} style={{ ...btn, padding: '4px 8px' }}>İptal</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
