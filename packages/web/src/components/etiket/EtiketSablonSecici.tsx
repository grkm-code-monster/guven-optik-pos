import { useEffect, useState } from 'react'
import { SABLONLAR } from '../etiket-tasarimci/sablon-registry'
import { ORNEK_SABLON_VERI } from '../etiket-tasarimci/sablon-types'
import type { SablonId } from '../etiket-tasarimci/sablon-types'
import { renderEtiketToDataUrl } from './etiket-canvas-render'
import { getPilotEtiketSablon } from './etiket-sablon-helpers'

type Props = {
  urunKategori: string
  utsKodlu: boolean
  secilenId: string
  onSecim: (sablonId: string) => void
  source?: 'pos' | 'admin'
}

// 13.11.2026 — Önizlemeler artık GERÇEK (veritabanındaki) şablondan çiziliyor; basılan neyse görünen o.
const onizlemeOnbellek = new Map<string, string | null>()

function SablonOnizleme({ id, source }: { id: SablonId; source: 'pos' | 'admin' }) {
  const [src, setSrc] = useState<string | null | undefined>(onizlemeOnbellek.get(id))
  useEffect(() => {
    if (onizlemeOnbellek.has(id)) return
    let iptal = false
    getPilotEtiketSablon(id, undefined, source)
      .then((s) => {
        const url = s ? renderEtiketToDataUrl(s, ORNEK_SABLON_VERI) : null
        onizlemeOnbellek.set(id, url)
        if (!iptal) setSrc(url)
      })
      .catch(() => {
        if (!iptal) setSrc(null)
      })
    return () => {
      iptal = true
    }
  }, [id, source])
  if (src === undefined) return <div style={{ height: 40, fontSize: 10, color: '#9ca3af' }}>yükleniyor…</div>
  if (!src) return <div style={{ height: 40, fontSize: 10, color: '#9ca3af' }}>önizleme yok</div>
  return <img src={src} alt="" style={{ width: '100%', maxHeight: 70, objectFit: 'contain', imageRendering: 'pixelated' }} />
}

export default function EtiketSablonSecici({ secilenId, onSecim, source = 'admin' }: Props) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Şablon Seç</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {SABLONLAR.map((s) => {
          const secili = s.id === secilenId
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSecim(s.id)}
              style={{
                textAlign: 'left',
                padding: 8,
                borderRadius: 10,
                border: secili ? '2px solid #2563eb' : '1px solid #e5e7eb',
                backgroundColor: secili ? '#eff6ff' : 'white',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, backgroundColor: '#f9fafb', borderRadius: 6, padding: 4, overflow: 'hidden' }}>
                <SablonOnizleme id={s.id} source={source} />
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2 }}>{s.ad}</div>
              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{s.aciklama}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type { SablonId }
