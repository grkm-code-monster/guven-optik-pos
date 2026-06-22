import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  generateZplFromSablon,
  getEtiketSablonlari,
  guncelleEtiketSablon,
  kaydetEtiketSablon,
} from '../../api/etiket.api'
import {
  BASLANGIC_SABLONLARI,
  BOYUTLAR,
  elementLabel,
  KATEGORILER,
  mmToDots,
  ORNEK_VERI,
  PALETTE,
  previewText,
  SABLON_UTSLI,
  type CanvasElement,
  type ElementType,
  type EtiketSablon,
} from './constants'
import { generateZplFromElements } from './zpl'

const inp: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
}
const btn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
}
const btnDark: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }

function newId() {
  return `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function ensureKulakcik(elemanlar: CanvasElement[], yukseklikDots: number): CanvasElement[] {
  const rest = elemanlar.filter((e) => e.type !== 'kulakcik')
  return [{
    id: 'kulakcik',
    type: 'kulakcik',
    x: 0,
    y: 0,
    width: 80,
    height: yukseklikDots,
    locked: true,
  }, ...rest]
}

function cloneSablon(s: EtiketSablon): EtiketSablon {
  return {
    ...s,
    elemanlar: s.elemanlar.map((e) => ({ ...e })),
  }
}

export default function EtiketTasarimciPage() {
  const [genislikMm, setGenislikMm] = useState(100)
  const [yukseklikMm, setYukseklikMm] = useState(50)
  const [ozelBoyut, setOzelBoyut] = useState(false)
  const [elemanlar, setElemanlar] = useState<CanvasElement[]>(() =>
    ensureKulakcik(cloneSablon(SABLON_UTSLI).elemanlar, mmToDots(50)),
  )
  const [seciliId, setSeciliId] = useState<string | null>(null)
  const [sablonAdi, setSablonAdi] = useState(SABLON_UTSLI.ad)
  const [kategori, setKategori] = useState(SABLON_UTSLI.kategori)
  const [sablonId, setSablonId] = useState<string | null>(null)
  const [kayitliSablonlar, setKayitliSablonlar] = useState<Array<{ id: string; ad: string }>>([])
  const [mesaj, setMesaj] = useState<string | null>(null)
  const [testSonuc, setTestSonuc] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null)

  const genislikDots = mmToDots(genislikMm)
  const yukseklikDots = mmToDots(yukseklikMm)
  const displayW = 640
  const displayH = Math.round(displayW * (yukseklikMm / genislikMm))
  const scale = displayW / genislikDots

  const secili = elemanlar.find((e) => e.id === seciliId) ?? null

  const zplOnizleme = useMemo(
    () => generateZplFromElements(elemanlar, ORNEK_VERI),
    [elemanlar],
  )

  const yukleSablonlar = useCallback(async () => {
    try {
      const list = await getEtiketSablonlari()
      setKayitliSablonlar(list.map((s) => ({ id: s.id, ad: s.ad })))
    } catch {
      setKayitliSablonlar([])
    }
  }, [])

  useEffect(() => {
    void yukleSablonlar()
  }, [yukleSablonlar])

  useEffect(() => {
    setElemanlar((prev) => ensureKulakcik(prev, yukseklikDots))
  }, [yukseklikDots])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Delete' && seciliId && seciliId !== 'kulakcik') {
        setElemanlar((prev) => prev.filter((el) => el.id !== seciliId))
        setSeciliId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [seciliId])

  function dotsToPx(dot: number) {
    return dot * scale
  }

  function pxToDots(px: number) {
    return Math.max(0, Math.round(px / scale))
  }

  function svgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: pxToDots(clientX - rect.left),
      y: pxToDots(clientY - rect.top),
    }
  }

  function sablonUygula(s: EtiketSablon, id?: string | null) {
    setSablonAdi(s.ad)
    setKategori(s.kategori)
    setGenislikMm(s.etiketGenislik)
    setYukseklikMm(s.etiketYukseklik)
    setOzelBoyut(!BOYUTLAR.some((b) => b.w === s.etiketGenislik && b.h === s.etiketYukseklik))
    setElemanlar(ensureKulakcik(cloneSablon(s).elemanlar, mmToDots(s.etiketYukseklik)))
    setSablonId(id ?? null)
    setSeciliId(null)
  }

  function elementEkle(type: ElementType, x = 100, y = 40) {
    if (type === 'kulakcik') return
    const def = PALETTE.find((p) => p.type === type)
    const el: CanvasElement = {
      id: newId(),
      type,
      x,
      y,
      ...def?.defaults,
    }
    setElemanlar((prev) => [...prev, el])
    setSeciliId(el.id)
  }

  function onCanvasDrop(e: React.DragEvent) {
    e.preventDefault()
    const type = e.dataTransfer.getData('element-type') as ElementType
    if (!type || type === 'kulakcik') return
    const pt = svgPoint(e.clientX, e.clientY)
    elementEkle(type, Math.max(81, pt.x), pt.y)
  }

  function onElementMouseDown(e: React.MouseEvent, el: CanvasElement) {
    if (el.locked) return
    e.stopPropagation()
    setSeciliId(el.id)
    const pt = svgPoint(e.clientX, e.clientY)
    dragRef.current = { id: el.id, ox: pt.x - el.x, oy: pt.y - el.y }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return
      const pt = svgPoint(e.clientX, e.clientY)
      const { id, ox, oy } = dragRef.current
      setElemanlar((prev) => prev.map((el) => {
        if (el.id !== id || el.locked) return el
        return {
          ...el,
          x: Math.max(81, pt.x - ox),
          y: Math.max(0, Math.min(yukseklikDots - 10, pt.y - oy)),
        }
      }))
    }
    function onUp() {
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [yukseklikDots, genislikDots, scale])

  function guncelleSecili(patch: Partial<CanvasElement>) {
    if (!seciliId) return
    setElemanlar((prev) => prev.map((el) => (el.id === seciliId ? { ...el, ...patch } : el)))
  }

  async function sablonKaydet() {
    setKaydediliyor(true)
    setMesaj(null)
    try {
      const payload = {
        ad: sablonAdi,
        kategori,
        elemanlar,
        etiketGenislik: genislikMm,
        etiketYukseklik: yukseklikMm,
      }
      if (sablonId) {
        await guncelleEtiketSablon(sablonId, payload)
        setMesaj('Şablon güncellendi.')
      } else {
        const kayit = await kaydetEtiketSablon(payload)
        setSablonId(kayit.id)
        setMesaj('Şablon kaydedildi.')
      }
      void yukleSablonlar()
    } catch (e: any) {
      setMesaj(e?.response?.data?.error ?? 'Kayıt başarısız')
    } finally {
      setKaydediliyor(false)
    }
  }

  async function sablonYukle(id: string) {
    if (id.startsWith('builtin-')) {
      const idx = Number(id.replace('builtin-', ''))
      const s = BASLANGIC_SABLONLARI[idx]
      if (s) sablonUygula(s)
      return
    }
    try {
      const list = await getEtiketSablonlari()
      const kayit = list.find((s) => s.id === id)
      if (!kayit) return
      sablonUygula({
        ad: kayit.ad,
        kategori: kayit.kategori,
        elemanlar: kayit.elemanlar as CanvasElement[],
        etiketGenislik: kayit.etiketGenislik,
        etiketYukseklik: kayit.etiketYukseklik,
      }, kayit.id)
    } catch {
      setMesaj('Şablon yüklenemedi')
    }
  }

  async function testBaskisi() {
    setTestSonuc(null)
    try {
      const res = await generateZplFromSablon({
        elemanlar,
        etiketGenislik: genislikMm,
        etiketYukseklik: yukseklikMm,
        veri: ORNEK_VERI,
      })
      setTestSonuc(res.zpl)
      setMesaj(`Test baskısı OK — ${res.count} etiket`)
    } catch (e: any) {
      setMesaj(e?.response?.data?.error ?? 'Test baskısı başarısız')
    }
  }

  function renderElement(el: CanvasElement) {
    const selected = el.id === seciliId
    const px = dotsToPx(el.x)
    const py = dotsToPx(el.y)
    const pw = el.width ? dotsToPx(el.width) : undefined
    const ph = el.height ? dotsToPx(el.height) : undefined

    if (el.type === 'kulakcik') {
      return (
        <g key={el.id}>
          <rect x={0} y={0} width={dotsToPx(80)} height={displayH} fill="#e5e7eb" stroke="#9ca3af" />
          <text x={dotsToPx(40)} y={displayH / 2} textAnchor="middle" fontSize={10} fill="#6b7280" transform={`rotate(-90 ${dotsToPx(40)} ${displayH / 2})`}>
            KULAKÇIK
          </text>
        </g>
      )
    }

    if (el.type === 'barcode128') {
      return (
        <g
          key={el.id}
          onMouseDown={(e) => onElementMouseDown(e, el)}
          style={{ cursor: el.locked ? 'default' : 'move' }}
        >
          <rect
            x={px} y={py} width={pw ?? 120} height={ph ?? 40}
            fill="#f9fafb" stroke={selected ? '#2563eb' : '#374151'} strokeWidth={selected ? 2 : 1}
          />
          <text x={px + 4} y={py + (ph ?? 40) / 2} fontSize={11} fill="#374151">CODE128</text>
        </g>
      )
    }

    if (el.type === 'gs1datamatrix') {
      const size = pw ?? dotsToPx(115)
      return (
        <g key={el.id} onMouseDown={(e) => onElementMouseDown(e, el)} style={{ cursor: 'move' }}>
          <rect x={px} y={py} width={size} height={size} fill="#111" stroke={selected ? '#2563eb' : '#000'} strokeWidth={selected ? 2 : 1} />
          <text x={px + size / 2} y={py + size / 2 + 4} textAnchor="middle" fontSize={10} fill="white">GS1</text>
        </g>
      )
    }

    const text = previewText(el, ORNEK_VERI)
    const fontSize = Math.max(8, (el.fontSize ?? 12) * scale * 0.55)
    return (
      <g key={el.id} onMouseDown={(e) => onElementMouseDown(e, el)} style={{ cursor: 'move' }}>
        <text
          x={px} y={py + fontSize}
          fontSize={fontSize}
          fontWeight={el.type === 'fiyat' ? 800 : 500}
          fill="#111"
          stroke={selected ? '#2563eb' : 'transparent'}
          strokeWidth={0.5}
        >
          {text}
        </text>
        {selected ? (
          <rect x={px - 2} y={py} width={Math.max(60, text.length * fontSize * 0.5)} height={fontSize + 6} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="4 2" />
        ) : null}
      </g>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Etiket Tasarımcısı</h1>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {genislikMm}×{yukseklikMm} mm · {genislikDots}×{yukseklikDots} dot (8 dot/mm)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={sablonAdi} onChange={(e) => setSablonAdi(e.target.value)} placeholder="Şablon adı" style={{ ...inp, width: 180 }} />
          <select value={kategori} onChange={(e) => setKategori(e.target.value)} style={{ ...inp, width: 140 }}>
            {KATEGORILER.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <button type="button" disabled={kaydediliyor} onClick={() => void sablonKaydet()} style={btnDark}>
            {kaydediliyor ? '...' : 'Şablonu Kaydet'}
          </button>
          <select
            defaultValue=""
            onChange={(e) => { if (e.target.value) void sablonYukle(e.target.value); e.target.value = '' }}
            style={{ ...inp, width: 180 }}
          >
            <option value="">Şablon Yükle...</option>
            {BASLANGIC_SABLONLARI.map((s, i) => (
              <option key={`builtin-${i}`} value={`builtin-${i}`}>{s.ad} (hazır)</option>
            ))}
            {kayitliSablonlar.map((s) => (
              <option key={s.id} value={s.id}>{s.ad}</option>
            ))}
          </select>
        </div>
      </div>

      {mesaj ? (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, backgroundColor: '#eff6ff', fontSize: 13, fontWeight: 600 }}>{mesaj}</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 220px', gap: 16, alignItems: 'start' }}>
        {/* Sol palet */}
        <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Boyut</div>
          <select
            value={ozelBoyut ? 'ozel' : `${genislikMm}x${yukseklikMm}`}
            onChange={(e) => {
              if (e.target.value === 'ozel') { setOzelBoyut(true); return }
              setOzelBoyut(false)
              const [w, h] = e.target.value.split('x').map(Number)
              setGenislikMm(w)
              setYukseklikMm(h)
            }}
            style={{ ...inp, marginBottom: 8 }}
          >
            {BOYUTLAR.map((b) => (
              <option key={b.label} value={`${b.w}x${b.h}`}>{b.label}</option>
            ))}
            <option value="ozel">Özel boyut</option>
          </select>
          {ozelBoyut ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              <input type="number" min={20} value={genislikMm} onChange={(e) => setGenislikMm(Number(e.target.value) || 100)} placeholder="mm G" style={inp} />
              <input type="number" min={15} value={yukseklikMm} onChange={(e) => setYukseklikMm(Number(e.target.value) || 50)} placeholder="mm Y" style={inp} />
            </div>
          ) : null}

          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8, marginTop: 8 }}>Elementler</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {PALETTE.map((p) => (
              <div
                key={p.type}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('element-type', p.type)}
                onClick={() => elementEkle(p.type)}
                style={{
                  padding: '8px 10px', borderRadius: 8, border: '1px dashed #d1d5db',
                  fontSize: 12, fontWeight: 600, cursor: 'grab', backgroundColor: '#fafafa',
                }}
              >
                {p.label}
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div>
          <div
            style={{
              backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16,
              display: 'flex', justifyContent: 'center', border: '1px solid #e5e7eb',
            }}
          >
            <svg
              ref={svgRef}
              width={displayW}
              height={displayH}
              style={{ backgroundColor: 'white', border: '1px solid #d1d5db', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
              onMouseDown={() => setSeciliId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onCanvasDrop}
            >
              <rect x={0} y={0} width={displayW} height={displayH} fill="white" />
              {elemanlar.map(renderElement)}
            </svg>
          </div>

          <div style={{ marginTop: 16, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>ZPL Önizleme</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => void navigator.clipboard.writeText(zplOnizleme)} style={btn}>ZPL Kopyala</button>
                <button type="button" onClick={() => void testBaskisi()} style={{ ...btnDark, backgroundColor: '#059669' }}>Test Baskısı</button>
              </div>
            </div>
            <textarea
              readOnly
              value={testSonuc ?? zplOnizleme}
              rows={10}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
              Örnek veri: {ORNEK_VERI.urunAdi}, {ORNEK_VERI.icReferans}, {ORNEK_VERI.fiyat} TL
            </div>
          </div>
        </div>

        {/* Sağ özellikler */}
        <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Özellikler</div>
          {!secili || secili.locked ? (
            <div style={{ fontSize: 12, color: '#9ca3af' }}>
              {secili?.locked ? 'Kulakçık alanı kilitli.' : 'Bir element seçin veya paletten ekleyin.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{elementLabel(secili.type)}</div>
              <label>
                <span style={{ fontSize: 11, color: '#6b7280' }}>X (dot)</span>
                <input type="number" value={secili.x} onChange={(e) => guncelleSecili({ x: Number(e.target.value) })} style={{ ...inp, marginTop: 4 }} />
              </label>
              <label>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Y (dot)</span>
                <input type="number" value={secili.y} onChange={(e) => guncelleSecili({ y: Number(e.target.value) })} style={{ ...inp, marginTop: 4 }} />
              </label>
              {(secili.type === 'barcode128' || secili.type === 'gs1datamatrix') ? (
                <>
                  <label>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Genişlik (dot)</span>
                    <input type="number" value={secili.width ?? ''} onChange={(e) => guncelleSecili({ width: Number(e.target.value) })} style={{ ...inp, marginTop: 4 }} />
                  </label>
                  <label>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Yükseklik (dot)</span>
                    <input type="number" value={secili.height ?? ''} onChange={(e) => guncelleSecili({ height: Number(e.target.value) })} style={{ ...inp, marginTop: 4 }} />
                  </label>
                </>
              ) : (
                <label>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>Font boyutu</span>
                  <input type="number" value={secili.fontSize ?? 12} onChange={(e) => guncelleSecili({ fontSize: Number(e.target.value) })} style={{ ...inp, marginTop: 4 }} />
                </label>
              )}
              {secili.type === 'serbestMetin' ? (
                <label>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>Metin</span>
                  <input type="text" value={secili.text ?? ''} onChange={(e) => guncelleSecili({ text: e.target.value })} style={{ ...inp, marginTop: 4 }} />
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setElemanlar((prev) => prev.filter((e) => e.id !== seciliId))
                  setSeciliId(null)
                }}
                style={{ ...btn, backgroundColor: '#fee2e2', color: '#991b1b', marginTop: 4 }}
              >
                Sil
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
