import { SABLONLAR } from '../etiket-tasarimci/sablon-registry'
import { ORNEK_SABLON_VERI } from '../etiket-tasarimci/sablon-types'
import type { SablonId } from '../etiket-tasarimci/sablon-types'

type Props = {
  urunKategori: string
  utsKodlu: boolean
  secilenId: string
  onSecim: (sablonId: string) => void
}

export default function EtiketSablonSecici({ secilenId, onSecim }: Props) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Şablon Seç</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {SABLONLAR.map((s) => {
          const secili = s.id === secilenId
          const Mini = s.Preview
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: 6,
                  backgroundColor: '#f9fafb',
                  borderRadius: 6,
                  padding: 4,
                  overflow: 'hidden',
                }}
              >
                <Mini
                  data={ORNEK_SABLON_VERI}
                  ayar={s.defaultAyar}
                  width={s.previewW * 0.38}
                  height={s.previewH * 0.38}
                />
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
