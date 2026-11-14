import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../../pages/admin/AdminLayout'

/**
 * 14.11.2026 — Ürün girişinde UTS kaydı bulunamayan ürünler.
 * Program 08:00–21:00 arası yarım saatte bir UTS'ye bakar; kayıt düşünce kendisi kabul eder.
 * Barkodla eşleşmeyenler (ör. cam) burada elle eşleştirilir; UTS'si olmayan ürün "UTS gerekmiyor" ile kapatılır.
 */

type Bekleyen = {
  id: string
  girisNo: string | null
  belgeNo: string | null
  cariAdi: string | null
  lotNo: string
  urunAdi: string
  barkod: string | null
  hedefSube: string | null
  deneme: number
  sonDeneme: string | null
  mesaj: string | null
  createdAt: string
}
type Kayit = { uno: string; lno?: string; sno?: string; urunTanimi?: string; kaynak: 'BEKLEYEN' | 'KABUL'; subeKodu: string }

const btn: React.CSSProperties = { padding: '4px 9px', borderRadius: 6, border: '1px solid #d1d5db', backgroundColor: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const hataMetni = (e: unknown, v: string) => {
  const x = e as { response?: { data?: { error?: string } }; message?: string }
  return x?.response?.data?.error ?? x?.message ?? v
}

export default function UtsBekleyenPaneli() {
  const [liste, setListe] = useState<Bekleyen[]>([])
  const [acik, setAcik] = useState(false)
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [mesgul, setMesgul] = useState(false)
  const [eslestir, setEslestir] = useState<{ row: Bekleyen; kayitlar: Kayit[] | null } | null>(null)

  const yukle = useCallback(async () => {
    try {
      const r = await adminApi.get('/admin/urun-giris-uts/bekleyenler')
      setListe(r.data?.data ?? [])
    } catch {
      setListe([])
    }
  }, [])
  useEffect(() => {
    void yukle()
  }, [yukle])

  async function kontrol() {
    setMesgul(true)
    setMesaj(null)
    try {
      const r = await adminApi.post('/admin/urun-giris-uts/bekleyenler/kontrol', {}, { timeout: 300000 })
      setMesaj(`${r.data?.bakilan ?? 0} ürüne bakıldı, ${r.data?.tamamlanan ?? 0} tanesinin UTS kaydı bulunup kabul edildi.`)
      await yukle()
    } catch (e) {
      setMesaj(hataMetni(e, 'Kontrol edilemedi'))
    } finally {
      setMesgul(false)
    }
  }

  async function eslestirAc(row: Bekleyen) {
    setEslestir({ row, kayitlar: null })
    try {
      const r = await adminApi.get('/admin/urun-giris-uts/belge', { params: { belgeNo: row.belgeNo ?? '' } })
      setEslestir({ row, kayitlar: r.data?.kayitlar ?? [] })
    } catch (e) {
      setMesaj(hataMetni(e, 'UTS okunamadı'))
      setEslestir(null)
    }
  }

  async function uygula(row: Bekleyen, kayit: Kayit) {
    setMesgul(true)
    try {
      const r = await adminApi.post(`/admin/urun-giris-uts/bekleyenler/${row.id}/uygula`, { kayit })
      setMesaj(r.data?.ok ? `✓ ${row.urunAdi}: ${r.data?.mesaj ?? 'tamamlandı'}` : `⚠ ${r.data?.mesaj ?? 'Uygulanamadı'}`)
      setEslestir(null)
      await yukle()
    } catch (e) {
      setMesaj(hataMetni(e, 'Uygulanamadı'))
    } finally {
      setMesgul(false)
    }
  }

  async function gerekmiyor(row: Bekleyen) {
    if (!window.confirm(`${row.urunAdi} (${row.lotNo}) için UTS kaydı beklenmesin mi?`)) return
    await adminApi.post(`/admin/urun-giris-uts/bekleyenler/${row.id}/iptal`, { neden: 'UTS gerekmiyor' })
    await yukle()
  }

  if (!liste.length && !mesaj) return null

  return (
    <div style={{ marginTop: 20, border: '1px solid #fde68a', borderRadius: 12, backgroundColor: '#fffbeb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer' }} onClick={() => setAcik((x) => !x)}>
        <b style={{ fontSize: 13, color: '#92400e' }}>⏳ UTS'si bekleyen ürünler ({liste.length})</b>
        <span style={{ fontSize: 11, color: '#6b7280' }}>Program yarım saatte bir UTS'ye bakar, kayıt düşünce kendisi kabul eder.</span>
        <button type="button" style={{ ...btn, marginLeft: 'auto' }} disabled={mesgul} onClick={(e) => { e.stopPropagation(); void kontrol() }}>
          {mesgul ? 'Bakılıyor…' : '↻ Şimdi kontrol et'}
        </button>
        <span style={{ fontSize: 12 }}>{acik ? '▾' : '▸'}</span>
      </div>
      {mesaj ? <div style={{ padding: '0 14px 8px', fontSize: 12, color: '#374151' }}>{mesaj}</div> : null}
      {acik ? (
        <div style={{ padding: '0 14px 12px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, backgroundColor: 'white' }}>
            <thead>
              <tr style={{ color: '#6b7280', textAlign: 'left' }}>
                <th style={{ padding: 5 }}>Tarih</th><th style={{ padding: 5 }}>Firma / belge</th><th style={{ padding: 5 }}>Ürün</th>
                <th style={{ padding: 5 }}>Lot</th><th style={{ padding: 5 }}>Gideceği yer</th><th style={{ padding: 5 }}>Son bakış</th><th style={{ padding: 5 }}></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #fef3c7' }}>
                  <td style={{ padding: 5, whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleDateString('tr-TR')}</td>
                  <td style={{ padding: 5 }}>{r.cariAdi ?? '—'}<div style={{ fontSize: 10, color: '#6b7280' }}>{r.belgeNo ?? '—'}</div></td>
                  <td style={{ padding: 5 }}>{r.urunAdi}<div style={{ fontSize: 10, color: '#6b7280' }}>{r.barkod ?? ''}</div></td>
                  <td style={{ padding: 5, fontFamily: 'monospace', fontSize: 11 }}>{r.lotNo}</td>
                  <td style={{ padding: 5 }}>{r.hedefSube ?? 'Depo'}</td>
                  <td style={{ padding: 5, fontSize: 11, color: '#6b7280' }}>
                    {r.sonDeneme ? new Date(r.sonDeneme).toLocaleString('tr-TR') : '—'}
                    {r.mesaj ? <div style={{ color: '#b45309' }}>{r.mesaj}</div> : null}
                  </td>
                  <td style={{ padding: 5, whiteSpace: 'nowrap' }}>
                    <button type="button" style={btn} disabled={!r.belgeNo} onClick={() => void eslestirAc(r)}>Eşleştir</button>{' '}
                    <button type="button" style={{ ...btn, color: '#991b1b' }} onClick={() => void gerekmiyor(r)}>UTS gerekmiyor</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {eslestir ? (
            <div style={{ marginTop: 10, padding: 10, border: '1px solid #c4b5fd', borderRadius: 8, backgroundColor: '#faf5ff' }}>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
                {eslestir.row.urunAdi} ({eslestir.row.lotNo}) — "{eslestir.row.belgeNo}" belgesindeki UTS kayıtları
                <button type="button" style={{ ...btn, marginLeft: 8 }} onClick={() => setEslestir(null)}>Kapat</button>
              </div>
              {eslestir.kayitlar === null ? <div style={{ fontSize: 12 }}>UTS okunuyor…</div> : null}
              {eslestir.kayitlar?.length === 0 ? <div style={{ fontSize: 12, color: '#6b7280' }}>Bu belge için UTS'de henüz kayıt yok.</div> : null}
              {eslestir.kayitlar?.map((k, i) => (
                <div key={`${k.uno}-${k.sno ?? ''}-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
                  <span style={{ fontFamily: 'monospace' }}>{k.uno}</span>
                  <span>{k.sno ? `seri ${k.sno}` : k.lno ? `lot ${k.lno}` : ''}</span>
                  <span style={{ color: '#6b7280' }}>{k.urunTanimi ?? ''}</span>
                  <b>{k.subeKodu}</b>
                  <button type="button" style={{ ...btn, marginLeft: 'auto' }} disabled={mesgul} onClick={() => void uygula(eslestir.row, k)}>Bu kayıt</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
