/**
 * 18.11.2026 — Satışlar → "Müşteri Satış Detayları"
 * Her satış kalemi: bizim ürün adımız + firma tarafı (firma, firmanın ürün adı, sipariş/fatura no,
 * geliş, lot/UTS) + reçete ve özel işlemler. Garanti / firma görüşmesinde "ne verdik, hangi
 * firmanın hangi ürünü" sorusu için. Kapsam Satışlar sayfasıyla aynı. Maliyet yok.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'
import { isOzelIslemItem, ozelIslemOzeti } from '../utils/ozelIslem'
import { isLensMeasurementSaleItem } from '../utils/saleMeasurements'
import type { SaleItem } from '../api/types'

type Satir = {
  id: string
  saleId: string
  satisNo: string
  tarih: string
  sube: string | null
  subeId: string
  personel: string | null
  musteri: string | null
  musteriTelefon: string | null
  urunAdi: string
  kategori: string | null
  odooCategoryId: number | null
  adet: number
  tutar: number
  kalemDurum: string
  recete: string | null
  lotNo: string | null
  linkedItemId: string | null
  linkType: string | null
  nitelik: string | null
  aciklama: string | null
  firma: string | null
  firmaUrunAdi: string | null
  firmaUrunKodu: string | null
  firmaUrunKaynak: 'SIPARIS' | 'FATURA_HAFIZASI' | null
  firmaSiparisNo: string | null
  siparisDurum: string | null
  faturaNo: string | null
  gelisTarihi: string | null
  girisBelgesi: string | null
  karekodlar: string[]
}

const KALEM_DURUM: Record<string, string> = {
  PENDING: 'Bekliyor',
  ORDERED: 'Sipariş verildi',
  IN_LAB: 'Atölyede',
  READY: 'Hazır',
  DELIVERED: 'Teslim edildi',
}

function gunStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${g}`
}

function tarihTR(v: string | null | undefined): string {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR')
}

function anaKategori(yol: string | null): string {
  if (!yol) return 'Diğer'
  const p = yol.split('/').map((x) => x.trim()).filter(Boolean)
  return (p[0] === 'All' ? p[1] : p[0]) ?? 'Diğer'
}

function siparisDurumTR(d: string | null): string {
  if (!d) return ''
  return d
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLocaleLowerCase('tr-TR'))
    .join(' ')
}

/** Satırı özel işlem yardımcılarının beklediği şekle çevir */
function kalemGibi(s: Satir): SaleItem {
  return {
    id: s.id,
    productId: '',
    odooProductName: s.urunAdi,
    odooCategoryId: s.odooCategoryId,
    qty: s.adet,
    unitPrice: '0',
    discount: '0',
    taxAmount: '0',
    lineTotal: String(s.tutar),
    status: s.kalemDurum,
    linkType: s.linkType,
    linkedItemId: s.linkedItemId,
    maintenanceNature: s.nitelik,
    maintenanceDescription: s.aciklama,
  }
}

export default function MusteriSatisDetaylariPage() {
  const navigate = useNavigate()
  const bugun = new Date()
  const [bas, setBas] = useState(gunStr(new Date(bugun.getTime() - 30 * 86400000)))
  const [bit, setBit] = useState(gunStr(bugun))
  const [q, setQ] = useState('')
  const [satirlar, setSatirlar] = useState<Satir[]>([])
  const [kesildi, setKesildi] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  // Ekranda süzülenler (sunucuya gitmez)
  const [sube, setSube] = useState('')
  const [kategori, setKategori] = useState('')
  const [firma, setFirma] = useState('')
  const [personel, setPersonel] = useState('')
  const [durum, setDurum] = useState('')
  const [urunAra, setUrunAra] = useState('')
  const [eksik, setEksik] = useState(false)

  useEffect(() => {
    let iptal = false
    const t = setTimeout(() => {
      setYukleniyor(true)
      setHata(null)
      apiClient
        .get('/sales/musteri-satis-detaylari', {
          params: {
            dateFrom: bas ? `${bas}T00:00:00` : undefined,
            dateTo: bit ? `${bit}T23:59:59` : undefined,
            q: q.trim() || undefined,
          },
        })
        .then((res) => {
          if (iptal) return
          setSatirlar((res.data?.satirlar ?? []) as Satir[])
          setKesildi(Boolean(res.data?.kesildi))
        })
        .catch((e: unknown) => {
          if (iptal) return
          const err = e as { response?: { data?: { message?: string; error?: string } } }
          setHata(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Liste alınamadı')
          setSatirlar([])
        })
        .finally(() => {
          if (!iptal) setYukleniyor(false)
        })
    }, 350)
    return () => {
      iptal = true
      clearTimeout(t)
    }
  }, [bas, bit, q])

  // Özel işlemler camın satırında gösterilir, ayrıca listelenmez
  const { anaSatirlar, islemlerByCam } = useMemo(() => {
    const ids = new Set(satirlar.map((s) => s.id))
    const islemler = new Map<string, Satir[]>()
    const ana: Satir[] = []
    for (const s of satirlar) {
      const k = kalemGibi(s)
      if (isOzelIslemItem(k) && s.linkedItemId && ids.has(s.linkedItemId)) {
        const l = islemler.get(s.linkedItemId) ?? []
        l.push(s)
        islemler.set(s.linkedItemId, l)
      } else ana.push(s)
    }
    return { anaSatirlar: ana, islemlerByCam: islemler }
  }, [satirlar])

  const secenekler = useMemo(() => {
    const u = (f: (s: Satir) => string | null) =>
      [...new Set(anaSatirlar.map(f).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, 'tr'))
    return {
      sube: u((s) => s.sube),
      kategori: u((s) => anaKategori(s.kategori)),
      firma: u((s) => s.firma),
      personel: u((s) => s.personel),
    }
  }, [anaSatirlar])

  const gorunen = useMemo(() => {
    const ua = urunAra.trim().toLocaleLowerCase('tr-TR')
    return anaSatirlar.filter((s) => {
      if (sube && s.sube !== sube) return false
      if (kategori && anaKategori(s.kategori) !== kategori) return false
      if (firma && s.firma !== firma) return false
      if (personel && s.personel !== personel) return false
      if (durum) {
        if (durum.startsWith('K:') && s.kalemDurum !== durum.slice(2)) return false
        if (durum === 'S:VAR' && !s.siparisDurum) return false
      }
      if (eksik && s.firmaUrunAdi) return false
      if (ua) {
        const hay = `${s.urunAdi} ${s.firmaUrunAdi ?? ''} ${s.firmaUrunKodu ?? ''} ${s.lotNo ?? ''} ${s.karekodlar.join(' ')}`.toLocaleLowerCase('tr-TR')
        if (!hay.includes(ua)) return false
      }
      return true
    })
  }, [anaSatirlar, sube, kategori, firma, personel, durum, eksik, urunAra])

  function islemMetni(s: Satir): string {
    return (islemlerByCam.get(s.id) ?? []).map((x) => ozelIslemOzeti(kalemGibi(x))).join(' | ')
  }

  function excelIndir() {
    const basliklar = [
      'Tarih', 'Satış No', 'Şube', 'Personel', 'Müşteri', 'Telefon', 'Ürün (bizim)', 'Kategori', 'Adet', 'Tutar',
      'Reçete', 'Not', 'Özel işlemler', 'Firma', 'Firma ürün adı', 'Firma ürün kodu', 'Firma sipariş no',
      'Fatura no', 'Geliş', 'Giriş belgesi', 'Lot / Seri', 'UTS karekod', 'Kalem durumu', 'Sipariş durumu',
    ]
    const hucre = (v: unknown) => {
      const t = String(v ?? '').replace(/\r?\n/g, ' ')
      return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const satir = (s: Satir) => [
      tarihTR(s.tarih), s.satisNo, s.sube, s.personel, s.musteri, s.musteriTelefon, s.urunAdi, s.kategori, s.adet,
      s.tutar.toFixed(2).replace('.', ','), s.recete, s.nitelik, islemMetni(s), s.firma, s.firmaUrunAdi, s.firmaUrunKodu,
      s.firmaSiparisNo, s.faturaNo, tarihTR(s.gelisTarihi), s.girisBelgesi, s.lotNo, s.karekodlar.join(' '),
      KALEM_DURUM[s.kalemDurum] ?? s.kalemDurum, siparisDurumTR(s.siparisDurum),
    ]
    const csv = '﻿' + [basliklar, ...gorunen.map(satir)].map((r) => r.map(hucre).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `musteri-satis-detaylari-${bas}-${bit}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={kart}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <Alan baslik="Başlangıç">
            <input type="date" value={bas} onChange={(e) => setBas(e.target.value)} style={girdi} />
          </Alan>
          <Alan baslik="Bitiş">
            <input type="date" value={bit} onChange={(e) => setBit(e.target.value)} style={girdi} />
          </Alan>
          <Alan baslik="Müşteri / telefon / satış no" genis>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara… (tüm şubelerde)" style={girdi} />
          </Alan>
          <Alan baslik="Ürün / firma ürünü / lot / UTS" genis>
            <input value={urunAra} onChange={(e) => setUrunAra(e.target.value)} placeholder="Örn. Varilux, 1.67, lot no" style={girdi} />
          </Alan>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginTop: 10 }}>
          {secenekler.sube.length > 1 ? (
            <Alan baslik="Şube">
              <Secim deger={sube} onChange={setSube} secenekler={secenekler.sube} />
            </Alan>
          ) : null}
          <Alan baslik="Kategori">
            <Secim deger={kategori} onChange={setKategori} secenekler={secenekler.kategori} />
          </Alan>
          <Alan baslik="Firma">
            <Secim deger={firma} onChange={setFirma} secenekler={secenekler.firma} />
          </Alan>
          <Alan baslik="Personel">
            <Secim deger={personel} onChange={setPersonel} secenekler={secenekler.personel} />
          </Alan>
          <Alan baslik="Durum">
            <select value={durum} onChange={(e) => setDurum(e.target.value)} style={girdi}>
              <option value="">Hepsi</option>
              {Object.entries(KALEM_DURUM).map(([k, v]) => (
                <option key={k} value={`K:${k}`}>
                  {v}
                </option>
              ))}
              <option value="S:VAR">Firmaya siparişi olanlar</option>
            </select>
          </Alan>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, paddingBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={eksik} onChange={(e) => setEksik(e.target.checked)} />
            Firma ürün adı eksik olanlar
          </label>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={excelIndir} disabled={!gorunen.length} style={dugme}>
            ⬇ Excel
          </button>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#6b7280' }}>
        {yukleniyor ? 'Yükleniyor…' : `${gorunen.length} kalem`}
        {kesildi ? ' · Çok kayıt var, ilk 3000 kalem getirildi — tarih aralığını daraltın.' : ''}
      </div>
      {hata ? <div style={{ color: '#b91c1c', fontWeight: 700 }}>{hata}</div> : null}

      <div style={{ ...kart, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1250 }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              {['Tarih / Satış', 'Müşteri', 'Ürün (bizim)', 'Reçete / Not', 'Firma', 'Firmanın ürünü', 'Sipariş / Fatura', 'Lot / UTS', 'Durum'].map((b) => (
                <th key={b} style={th}>
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gorunen.map((s) => {
              const islemler = islemlerByCam.get(s.id) ?? []
              return (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/sales/${s.saleId}`)}
                  style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer', verticalAlign: 'top' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fff5f5')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{tarihTR(s.tarih)}</div>
                    <div style={kucuk}>{s.satisNo}</div>
                    <div style={kucuk}>
                      {s.sube ?? ''}
                      {s.personel ? ` · ${s.personel}` : ''}
                    </div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{s.musteri}</div>
                    <div style={kucuk}>{s.musteriTelefon}</div>
                  </td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{s.urunAdi}</div>
                    <div style={kucuk}>
                      {anaKategori(s.kategori)}
                      {s.adet > 1 ? ` · ${s.adet} adet` : ''}
                    </div>
                  </td>
                  <td style={td}>
                    {s.recete ? <div>{s.recete}</div> : null}
                    {s.nitelik && !isLensMeasurementSaleItem(kalemGibi(s)) ? <div style={kucuk}>{s.nitelik}</div> : null}
                    {islemler.map((x) => (
                      <div key={x.id} style={{ color: '#6d28d9' }}>
                        🎨 {ozelIslemOzeti(kalemGibi(x))}
                      </div>
                    ))}
                  </td>
                  <td style={td}>{s.firma ?? <span style={bos}>—</span>}</td>
                  <td style={td}>
                    {s.firmaUrunAdi ? (
                      <>
                        <div style={{ fontWeight: 700 }}>{s.firmaUrunAdi}</div>
                        <div style={kucuk}>
                          {s.firmaUrunKodu ? `Kod ${s.firmaUrunKodu} · ` : ''}
                          {s.firmaUrunKaynak === 'SIPARIS' ? 'siparişten' : 'fatura eşleşmesinden'}
                        </div>
                      </>
                    ) : (
                      <span style={bos}>eksik</span>
                    )}
                  </td>
                  <td style={td}>
                    {s.firmaSiparisNo ? <div>Sipariş {s.firmaSiparisNo}</div> : null}
                    {s.faturaNo ? <div>Fatura {s.faturaNo}</div> : null}
                    {s.girisBelgesi ? <div>Giriş {s.girisBelgesi}</div> : null}
                    {s.gelisTarihi ? <div style={kucuk}>Geliş {tarihTR(s.gelisTarihi)}</div> : null}
                    {!s.firmaSiparisNo && !s.faturaNo && !s.girisBelgesi ? <span style={bos}>—</span> : null}
                  </td>
                  <td style={td}>
                    {s.lotNo ? <div style={{ fontFamily: 'monospace' }}>{s.lotNo}</div> : null}
                    {s.karekodlar.map((k) => (
                      <div key={k} style={{ ...kucuk, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {k}
                      </div>
                    ))}
                    {!s.lotNo && !s.karekodlar.length ? <span style={bos}>—</span> : null}
                  </td>
                  <td style={td}>
                    <div>{KALEM_DURUM[s.kalemDurum] ?? s.kalemDurum}</div>
                    {s.siparisDurum ? <div style={kucuk}>Sipariş: {siparisDurumTR(s.siparisDurum)}</div> : null}
                  </td>
                </tr>
              )
            })}
            {!yukleniyor && !gorunen.length ? (
              <tr>
                <td colSpan={9} style={{ ...td, textAlign: 'center', color: '#6b7280', padding: 24 }}>
                  Bu filtrelerle kayıt yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Alan({ baslik, genis, children }: { baslik: string; genis?: boolean; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: genis ? 220 : 140, flex: genis ? 1 : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{baslik}</span>
      {children}
    </label>
  )
}

function Secim({ deger, onChange, secenekler }: { deger: string; onChange: (v: string) => void; secenekler: string[] }) {
  return (
    <select value={deger} onChange={(e) => onChange(e.target.value)} style={girdi}>
      <option value="">Hepsi</option>
      {secenekler.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

const kart: CSSProperties = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }
const girdi: CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, width: '100%', boxSizing: 'border-box' }
const dugme: CSSProperties = { padding: '9px 14px', borderRadius: 8, border: '1px solid #111827', background: 'white', fontWeight: 800, cursor: 'pointer' }
const th: CSSProperties = { padding: '10px 10px', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }
const td: CSSProperties = { padding: '10px 10px' }
const kucuk: CSSProperties = { fontSize: 11, color: '#6b7280' }
const bos: CSSProperties = { color: '#d1d5db' }
