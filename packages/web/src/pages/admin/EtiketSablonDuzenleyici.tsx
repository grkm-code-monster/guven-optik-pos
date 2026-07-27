import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getEtiketSablonlari,
  guncelleEtiketSablon,
  type EtiketSablonKayit,
} from '../../api/etiket.api'
import {
  formatFiyat,
  gs1ReferansSatirlari,
  modelVeRenk,
  nitelikKisa,
} from '../../components/etiket-tasarimci/sablon-utils'

const DOTS_PER_MM = 8
const PX_PER_MM = 4

type EditorElement = {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  fontSize?: number
  fontWeight?: 'normal' | 'bold'
  lineGap?: number
  mode?: 'uts' | 'lotseri' | 'oto'
  text?: string
}

const ORNEK_VERI = {
  urunAdi: 'ÖRNEK ÜRÜN ADI',
  icReferans: 'MODEL: GG1188S / RENK: C1 / ÖLÇÜ: 58',
  renkVaryant: 'MODEL: GG1188S / RENK: C1 / ÖLÇÜ: 58',
  fiyat: 999,
  barkod: '8693283900499',
  utsKodu: '08681234567890',
  seriNo: 'SN-123456',
  lotNo: 'LOT-2024-001',
  sktTarihi: '260624',
  sonGuncelleme: '22.06.2026',
}

function dotToPx(dot: number) {
  return (dot / DOTS_PER_MM) * PX_PER_MM
}

function previewMetin(el: EditorElement): string | null {
  const v = ORNEK_VERI
  const nitelikRaw = String(v.renkVaryant ?? '').trim() || String(v.icReferans ?? '')
  switch (el.type) {
    case 'kutu':
    case 'gs1Referans':
      return null
    case 'urunAdi':
      return v.urunAdi
    case 'icReferans':
      return v.icReferans
    case 'renkVaryant':
      return v.renkVaryant
    case 'fiyat':
      return formatFiyat(v.fiyat)
    case 'kdvDahildir':
      return 'KDV DAHİLDİR'
    case 'sonGuncelleme':
      return v.sonGuncelleme
    case 'seriNo':
      return `Seri: ${v.seriNo}`
    case 'serbestMetin':
      return el.text ?? 'Metin'
    case 'barkodMetin':
      return v.barkod
    case 'model':
      return modelVeRenk(nitelikRaw).model
    case 'renkKodu':
      return modelVeRenk(nitelikRaw).renk
    case 'nitelik':
      return nitelikKisa(nitelikRaw)
    case 'fiyatDegisimTarihi':
      return `FİYAT DEĞİŞİM TARİHİ: ${v.sonGuncelleme}`
    case 'barcode128':
      return 'CODE128'
    case 'gs1datamatrix':
      return 'GS1'
    default:
      return el.type
  }
}

function SablonOnizleme({
  genislikMm,
  yukseklikMm,
  elemanlar,
}: {
  genislikMm: number
  yukseklikMm: number
  elemanlar: EditorElement[]
}) {
  const w = genislikMm * PX_PER_MM
  const h = yukseklikMm * PX_PER_MM

  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        border: '1px solid #374151',
        backgroundColor: 'white',
        fontFamily: 'Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      {elemanlar.map((el) => {
        const left = dotToPx(el.x)
        const top = dotToPx(el.y)
        const fontSize = Math.max(6, dotToPx(el.fontSize ?? 12))
        const metin = previewMetin(el)

        if (el.type === 'barcode128') {
          return (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                left,
                top,
                width: dotToPx(el.width ?? 100),
                height: dotToPx(el.height ?? 40),
                border: '1px solid #374151',
                backgroundColor: '#f9fafb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.max(6, fontSize * 0.7),
                color: '#374151',
              }}
            >
              CODE128
            </div>
          )
        }

        if (el.type === 'gs1datamatrix') {
          const size = dotToPx(el.width ?? 94)
          return (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                left,
                top,
                width: size,
                height: size,
                backgroundColor: '#888',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.max(7, fontSize * 0.8),
                fontWeight: 700,
              }}
            >
              GS1
            </div>
          )
        }

        if (el.type === 'kutu') {
          return (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                left,
                top,
                width: dotToPx(el.width ?? 50),
                height: dotToPx(el.height ?? 30),
                border: '1px solid #666',
                backgroundColor: 'transparent',
              }}
            />
          )
        }

        if (el.type === 'gs1Referans') {
          const satirlar = gs1ReferansSatirlari(
            {
              ...ORNEK_VERI,
              utsKodu: ORNEK_VERI.utsKodu,
            },
            el.mode ?? 'oto',
          )
          const gap = dotToPx(el.lineGap ?? (el.fontSize ?? 8) + 2)
          return (
            <div key={el.id}>
              {satirlar.map((satir, i) => (
                <div
                  key={`${el.id}-${i}`}
                  style={{
                    position: 'absolute',
                    left,
                    top: top + i * gap,
                    fontSize,
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                    color: '#333',
                  }}
                >
                  {satir}
                </div>
              ))}
            </div>
          )
        }

        if (!metin) return null

        return (
          <div
            key={el.id}
            style={{
              position: 'absolute',
              left,
              top,
              fontSize,
              fontWeight: el.fontWeight === 'bold' ? 700 : 400,
              whiteSpace: 'nowrap',
              color: el.type === 'fiyat' ? '#111' : '#333',
            }}
          >
            {metin}
          </div>
        )
      })}
    </div>
  )
}

const inp: React.CSSProperties = {
  padding: '4px 8px',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  fontSize: 12,
  width: 72,
  boxSizing: 'border-box',
}

export default function EtiketSablonDuzenleyici() {
  const [sablonlar, setSablonlar] = useState<EtiketSablonKayit[]>([])
  const [seciliId, setSeciliId] = useState<string>('')
  const [elemanlar, setElemanlar] = useState<EditorElement[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [kaydediyor, setKaydediyor] = useState(false)
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [hata, setHata] = useState<string | null>(null)

  const seciliSablon = useMemo(
    () => sablonlar.find((s) => s.id === seciliId) ?? null,
    [sablonlar, seciliId],
  )

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    setHata(null)
    try {
      const liste = await getEtiketSablonlari()
      setSablonlar(liste)
      if (!seciliId && liste.length > 0) {
        setSeciliId(liste[0].id)
        setElemanlar(JSON.parse(JSON.stringify(liste[0].elemanlar)) as EditorElement[])
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setHata(err?.response?.data?.error ?? err?.message ?? 'Şablonlar yüklenemedi')
    } finally {
      setYukleniyor(false)
    }
  }, [seciliId])

  useEffect(() => {
    void yukle()
  }, [yukle])

  function sablonSec(id: string) {
    const s = sablonlar.find((x) => x.id === id)
    if (!s) return
    setSeciliId(id)
    setElemanlar(JSON.parse(JSON.stringify(s.elemanlar)) as EditorElement[])
    setMesaj(null)
    setHata(null)
  }

  function elemanGuncelle(idx: number, patch: Partial<EditorElement>) {
    setElemanlar((prev) => prev.map((el, i) => (i === idx ? { ...el, ...patch } : el)))
    setMesaj(null)
  }

  async function kaydet() {
    if (!seciliSablon) return
    setKaydediyor(true)
    setHata(null)
    setMesaj(null)
    try {
      await guncelleEtiketSablon(seciliSablon.id, { elemanlar })
      setMesaj('Kaydedildi.')
      await yukle()
      const guncel = (await getEtiketSablonlari()).find((s) => s.id === seciliSablon.id)
      if (guncel) {
        setElemanlar(JSON.parse(JSON.stringify(guncel.elemanlar)) as EditorElement[])
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setHata(err?.response?.data?.error ?? err?.message ?? 'Kaydedilemedi')
    } finally {
      setKaydediyor(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Etiket Şablonları (Yeni)</h1>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          DB şablon elemanlarını düzenleyin — sürükle-bırak yok, yalnızca koordinat/font.
        </div>
      </div>

      {hata ? (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, backgroundColor: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
          {hata}
        </div>
      ) : null}
      {mesaj ? (
        <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, backgroundColor: '#ecfdf5', color: '#166534', fontSize: 13 }}>
          {mesaj}
        </div>
      ) : null}

      {yukleniyor ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>Yükleniyor...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Şablonlar</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {sablonlar.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => sablonSec(s.id)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: seciliId === s.id ? '2px solid #2563eb' : '1px solid #e5e7eb',
                    backgroundColor: seciliId === s.id ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{s.ad}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    {s.etiketGenislik}×{s.etiketYukseklik} mm · {s.kategori}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            {seciliSablon ? (
              <>
                <div
                  style={{
                    marginBottom: 16,
                    padding: 16,
                    backgroundColor: '#f3f4f6',
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'center',
                    overflow: 'auto',
                  }}
                >
                  <SablonOnizleme
                    genislikMm={seciliSablon.etiketGenislik}
                    yukseklikMm={seciliSablon.etiketYukseklik}
                    elemanlar={elemanlar}
                  />
                </div>

                <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{seciliSablon.ad} — Elemanlar</div>
                    <button
                      type="button"
                      disabled={kaydediyor}
                      onClick={() => void kaydet()}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 8,
                        border: 'none',
                        backgroundColor: '#059669',
                        color: 'white',
                        fontWeight: 700,
                        cursor: kaydediyor ? 'wait' : 'pointer',
                      }}
                    >
                      {kaydediyor ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {elemanlar.map((el, idx) => (
                      <div
                        key={el.id}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          borderRadius: 8,
                          backgroundColor: '#f9fafb',
                          border: '1px solid #f3f4f6',
                          fontSize: 12,
                        }}
                      >
                        <span style={{ fontWeight: 700, minWidth: 120 }}>{el.id}</span>
                        <span style={{ color: '#6b7280', minWidth: 100 }}>{el.type}</span>
                        {el.type === 'serbestMetin' ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            metin
                            <input
                              type="text"
                              value={el.text ?? ''}
                              onChange={(e) => elemanGuncelle(idx, { text: e.target.value })}
                              style={{ ...inp, width: 140 }}
                            />
                          </label>
                        ) : null}
                        {el.fontSize != null || ['urunAdi', 'fiyat', 'barkodMetin', 'model', 'renkKodu', 'nitelik', 'fiyatDegisimTarihi', 'kdvDahildir', 'sonGuncelleme', 'serbestMetin', 'gs1Referans'].includes(el.type) ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            font
                            <input
                              type="number"
                              value={el.fontSize ?? 12}
                              onChange={(e) => elemanGuncelle(idx, { fontSize: Number(e.target.value) || 12 })}
                              style={inp}
                            />
                          </label>
                        ) : null}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          x
                          <input
                            type="number"
                            value={el.x}
                            onChange={(e) => elemanGuncelle(idx, { x: Number(e.target.value) || 0 })}
                            style={inp}
                          />
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          y
                          <input
                            type="number"
                            value={el.y}
                            onChange={(e) => elemanGuncelle(idx, { y: Number(e.target.value) || 0 })}
                            style={inp}
                          />
                        </label>
                        {el.type === 'gs1Referans' ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            gap
                            <input
                              type="number"
                              value={el.lineGap ?? 16}
                              onChange={(e) => elemanGuncelle(idx, { lineGap: Number(e.target.value) || 16 })}
                              style={inp}
                            />
                          </label>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ color: '#6b7280' }}>Şablon seçin.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
