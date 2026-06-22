import { useEffect, useMemo, useState } from 'react'
import type { SablonId } from '../etiket-tasarimci/sablon-types'
import EtiketSablonSecici from './EtiketSablonSecici'
import { otomatikSablonSec, uretCokluEtiketZpl } from './etiket-sablon-helpers'

export type EtiketModalUrun = {
  key: string
  urunAdi: string
  seriNo: string
  fiyat: number | string
  barkod?: string | null
  secili: boolean
  categAdi?: string
  renkVaryant?: string
  utsKodu?: string | null
  utsKodlu?: boolean
}

type Props = {
  acik: boolean
  urunler: EtiketModalUrun[]
  source?: 'pos' | 'admin'
  onKapat: () => void
}

function varsayilanSablon(urunler: EtiketModalUrun[]): SablonId {
  const ilk = urunler.find((u) => u.secili) ?? urunler[0]
  if (!ilk) return 'gunes-aksesuar'
  const uts = ilk.utsKodlu ?? Boolean(ilk.utsKodu) ?? false
  return otomatikSablonSec(ilk.categAdi ?? '', uts)
}

export default function EtiketBasModal({ acik, urunler, onKapat }: Props) {
  const [secimler, setSecimler] = useState<EtiketModalUrun[]>([])
  const [sablonId, setSablonId] = useState<SablonId>('gunes-aksesuar')
  const [zpl, setZpl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kopyalandi, setKopyalandi] = useState(false)

  const ilkSecili = useMemo(
    () => secimler.find((u) => u.secili) ?? secimler[0],
    [secimler],
  )

  useEffect(() => {
    if (acik) {
      const list = urunler.map((u) => ({ ...u }))
      setSecimler(list)
      setSablonId(varsayilanSablon(list))
      setZpl('')
      setError(null)
      setKopyalandi(false)
    }
  }, [acik, urunler])

  if (!acik) return null

  const seciliSayisi = secimler.filter((s) => s.secili).length

  function etiketBas() {
    setLoading(true)
    setError(null)
    try {
      const payload = secimler.filter((s) => s.secili)
      if (!payload.length) {
        setError('En az 1 ürün seçin')
        return
      }
      const zplKod = uretCokluEtiketZpl(
        sablonId,
        payload.map((s) => ({
          urunAdi: s.urunAdi,
          seriNo: s.seriNo || '-',
          fiyat: s.fiyat,
          barkod: s.barkod,
          icReferans: s.barkod ?? undefined,
          renkVaryant: s.renkVaryant,
          utsKodu: s.utsKodu,
        })),
      )
      setZpl(zplKod)
    } catch (e: any) {
      setError(e?.message ?? 'ZPL üretilemedi')
    } finally {
      setLoading(false)
    }
  }

  async function kopyala() {
    if (!zpl) return
    await navigator.clipboard.writeText(zpl)
    setKopyalandi(true)
    setTimeout(() => setKopyalandi(false), 2000)
  }

  function yazdir() {
    if (!zpl) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<pre style="font-family:monospace;font-size:11px;white-space:pre-wrap;padding:16px">${zpl.replace(/</g, '&lt;')}</pre>`)
    w.document.close()
    w.print()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, width: '100%', maxWidth: 720,
        maxHeight: '90vh', overflow: 'auto', padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Etiket Basmak İster misiniz?</div>
          <button type="button" onClick={onKapat} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
          Ürünleri seçin, şablon belirleyin ve ZPL üretin.
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          {secimler.map((u) => (
            <label key={u.key} style={{
              display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center',
              padding: '10px 12px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={u.secili}
                onChange={(e) => setSecimler((prev) => prev.map((p) => p.key === u.key ? { ...p, secili: e.target.checked } : p))}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{u.urunAdi}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  Seri: {u.seriNo || '—'}
                  {u.categAdi ? ` · ${u.categAdi}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>
                {Number(u.fiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </div>
            </label>
          ))}
        </div>

        {!zpl ? (
          <div style={{ marginBottom: 16 }}>
            <EtiketSablonSecici
              urunKategori={ilkSecili?.categAdi ?? ''}
              utsKodlu={ilkSecili?.utsKodlu ?? Boolean(ilkSecili?.utsKodu) ?? false}
              secilenId={sablonId}
              onSecim={(id) => setSablonId(id as SablonId)}
            />
          </div>
        ) : null}

        {error ? <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div> : null}

        {zpl ? (
          <div style={{ marginBottom: 12 }}>
            <textarea
              readOnly
              value={zpl}
              rows={8}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
              ZPL içeriğini Argox yazıcı yazılımına yapıştırın.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => void kopyala()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontWeight: 700, cursor: 'pointer' }}>
                {kopyalandi ? '✓ Kopyalandı' : 'Kopyala'}
              </button>
              <button type="button" onClick={yazdir} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontWeight: 700, cursor: 'pointer' }}>
                Yazdır
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onKapat} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #e5e7eb', fontWeight: 700, cursor: 'pointer' }}>
            {zpl ? 'Kapat' : 'Atla'}
          </button>
          {!zpl ? (
            <button
              type="button"
              disabled={loading || seciliSayisi === 0}
              onClick={etiketBas}
              style={{
                padding: '10px 18px', borderRadius: 8, border: 'none', fontWeight: 800, cursor: 'pointer',
                backgroundColor: '#059669', color: 'white', opacity: loading || seciliSayisi === 0 ? 0.6 : 1,
              }}
            >
              {loading ? 'Üretiliyor...' : `Etiket Bas (${seciliSayisi})`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
