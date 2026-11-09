import type { EtiketDil } from '../../api/etiket.api'
import { yaziciDiliKaydet } from './yazici-dili'

export default function YaziciDiliSecici({ dil, onDegis }: { dil: EtiketDil; onDegis: (d: EtiketDil) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 700 }}>Yazıcı:</span>
      {([['ppla', 'Argox (PPLA)'], ['zpl', 'Zebra (ZPL) — ör. ZD220']] as const).map(([k, ad]) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            yaziciDiliKaydet(k)
            onDegis(k)
          }}
          style={{
            padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12,
            border: dil === k ? '2px solid #059669' : '1px solid #e5e7eb',
            backgroundColor: dil === k ? '#ecfdf5' : 'white', color: dil === k ? '#065f46' : '#374151',
          }}
        >
          {ad}
        </button>
      ))}
    </div>
  )
}
