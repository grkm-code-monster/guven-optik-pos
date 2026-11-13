import { useCallback, useEffect, useState } from 'react'
import {
  getKurallar,
  getMinMax,
  ikmalTaslakOlustur,
  kuralKaydet,
  kuralKopyala,
  kuralSil,
  seriOnizle,
  type MinMaxSatir,
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
  const [satirlar, setSatirlar] = useState<MinMaxSatir[] | null>(null)
  const [ozet, setOzet] = useState<{ kuralId: string; seri: string; uyan: number; eksik: number }[]>([])
  const [adet, setAdet] = useState<Record<number, number>>({})
  const [secili, setSecili] = useState<Set<number>>(new Set())
  const [kopyaHedef, setKopyaHedef] = useState<Set<string>>(new Set())
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'hata'; text: string } | null>(null)
  const [mesgul, setMesgul] = useState(false)

  const yukle = useCallback(async () => {
    try {
      setKurallar(await getKurallar(lokasyon))
    } catch {
      setKurallar([])
    }
  }, [lokasyon])
  useEffect(() => {
    void yukle()
    setSatirlar(null)
    setKopyaHedef(new Set())
  }, [yukle])

  async function onizle() {
    if (form.seri.trim().length < 3) return
    try {
      const r = await seriOnizle(form.seri)
      setOnizleme(r.sablon ? `${r.sablon} ürün/derece bulundu — ör. ${r.ornek.join(' · ')}` : 'Bu adla başlayan ürün bulunamadı (adı Stok Yönetimi\'ndeki gibi yazın)')
    } catch (e) {
      setOnizleme(hataMesaji(e, 'Önizlenemedi'))
    }
  }

  async function ekle(e: React.FormEvent) {
    e.preventDefault()
    setMesaj(null)
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
      setAdet(Object.fromEntries(r.satirlar.map((s) => [s.varyantId, s.onerilen])))
      setSecili(new Set(r.satirlar.filter((s) => s.onerilen > 0).map((s) => s.varyantId)))
    } catch (err) {
      setMesaj({ tip: 'hata', text: hataMesaji(err, 'Hesaplanamadı') })
    } finally {
      setMesgul(false)
    }
  }

  async function taslak() {
    const kalemler = (satirlar ?? [])
      .filter((s) => secili.has(s.varyantId) && (adet[s.varyantId] ?? 0) > 0)
      .map((s) => ({ varyantId: s.varyantId, urunAdi: s.ad, nitelik: '', adet: adet[s.varyantId], sebep: 'MINMAX' as const }))
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

  function siparisYazdir() {
    const yok = (satirlar ?? []).filter((s) => !s.depoAdet)
    if (!yok.length) return
    const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
    const gruplar = new Map<string, MinMaxSatir[]>()
    for (const s of yok) gruplar.set(s.seri, [...(gruplar.get(s.seri) ?? []), s])
    const govde = [...gruplar.entries()].map(([seri, l]) => `<h2>${esc(seri)} — ${l.reduce((a, x) => a + x.eksik, 0)} adet</h2>
<table><thead><tr><th>Ürün / derece</th><th>SPH</th><th>CYL</th><th>Mağazada</th><th>Sipariş adedi</th></tr></thead><tbody>${l.map((x) => `<tr><td>${esc(x.ad)}</td><td>${x.sph == null ? '' : x.sph.toFixed(2)}</td><td>${x.cyl == null ? '' : x.cyl.toFixed(2)}</td><td>${x.magazaAdet}</td><td><b>${x.eksik}</b></td></tr>`).join('')}</tbody></table>`).join('')
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Sipariş listesi ${esc(lokasyon)}</title><style>body{font-family:Arial,sans-serif;font-size:12px;margin:18px}h1{font-size:16px}h2{font-size:14px;margin:16px 0 6px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left}th{background:#eee}</style></head><body>
<h1>Sipariş listesi — ${esc(lokasyon)} (Ana Depo'da olmayanlar)</h1><div>${new Date().toLocaleString('tr-TR')} · ${yok.length} kalem · ${yok.reduce((a, x) => a + x.eksik, 0)} adet</div>${govde}<script>window.onload=()=>window.print()</script></body></html>`)
    w.document.close()
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
          Seri = ürün adının başı, Stok Yönetimi'ndeki gibi yazın (ör. <b>Plus 1.56</b>, <b>Plus 1.57 Kırılmaz</b>, <b>ULTRA KONTAKT LENS</b>, <b>BIOTRUE 300ML</b>).
          Derece aralığı boş bırakılırsa serinin tüm dereceleri kurala girer. Dereceyi <b>-4.00</b> ya da ürün adındaki gibi <b>-0400</b> yazabilirsiniz; CYL eksi yazılır (0 … -2.00).
        </div>
        <form onSubmit={ekle} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6 }}>
          <label style={{ fontSize: 11 }}>Seri / ürün<br />
            <input value={form.seri} onChange={(e) => setForm({ ...form, seri: e.target.value })} onBlur={() => void onizle()} style={{ ...inp, width: 220 }} required />
          </label>
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
                      <th style={th}><input type="checkbox" checked={satirlar.every((s) => secili.has(s.varyantId) || !s.depoAdet)} onChange={(e) => setSecili(e.target.checked ? new Set(satirlar.filter((s) => s.depoAdet > 0).map((s) => s.varyantId)) : new Set())} /></th>
                      <th style={th}>Ürün / derece</th><th style={th}>Min / Max</th><th style={th}>Mağazada</th><th style={th}>Taslakta</th>
                      <th style={th}>Ana Depo</th><th style={th}>Satış (30 gün)</th><th style={th}>Eksik</th><th style={th}>Gönderilecek</th>
                    </tr>
                  </thead>
                  <tbody>
                    {satirlar.map((s) => (
                      <tr key={s.varyantId} style={{ backgroundColor: !s.depoAdet ? '#fef2f2' : secili.has(s.varyantId) ? '#f0fdf4' : undefined }}>
                        <td style={td}><input type="checkbox" disabled={!s.depoAdet} checked={secili.has(s.varyantId)} onChange={() => setSecili((p) => { const n = new Set(p); if (n.has(s.varyantId)) n.delete(s.varyantId); else n.add(s.varyantId); return n })} /></td>
                        <td style={{ ...td, fontWeight: 700 }}>{s.ad}</td>
                        <td style={td}>{s.min} / {s.max}</td>
                        <td style={td}>{s.magazaAdet}</td>
                        <td style={td}>{s.taslakta || ''}</td>
                        <td style={{ ...td, fontWeight: 800, color: s.depoAdet ? '#047857' : '#b91c1c' }} title={s.depoAdet ? '' : "Ana Depo'da bu dereceden hiç yok — depodan gönderilemez, tedarikçiden sipariş edilmeli"}>{s.depoAdet || "Depoda yok — sipariş edilmeli"}</td>
                        <td style={td}>{s.satis30 || ''}</td>
                        <td style={td}>{s.eksik}</td>
                        <td style={td}>
                          {s.depoAdet ? (
                            <input type="number" min={0} max={s.depoAdet} value={adet[s.varyantId] ?? 0}
                              onChange={(e) => setAdet((p) => ({ ...p, [s.varyantId]: Math.max(0, Math.min(s.depoAdet, Math.round(Number(e.target.value) || 0))) }))}
                              style={{ ...inp, width: 56 }} />
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <button type="button" disabled={!satirlar.some((s) => !s.depoAdet)} onClick={siparisYazdir} style={btn}>🛒 Depoda olmayanları yazdır (sipariş listesi)</button>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 13 }}>Seçili: <b>{secili.size}</b> kalem · <b>{seciliAdet}</b> adet</span>
                <button type="button" disabled={mesgul || !seciliAdet} onClick={() => void taslak()} style={{ ...btnYesil, opacity: seciliAdet ? 1 : 0.5 }}>📦 İkmal taslağı oluştur</button>
              </div>
            </>
          )
        ) : (
          <div style={{ fontSize: 12, color: '#6b7280' }}>Kuralları girdikten sonra "Eksikleri hesapla"ya basın.</div>
        )}
      </div>
    </div>
  )
}
