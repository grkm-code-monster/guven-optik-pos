import { useEffect, useMemo, useState } from 'react'
import type { SablonId } from '../etiket-tasarimci/sablon-types'
import { renderEtiketBatchToDataUrls, type EtiketSablonRender } from './etiket-canvas-render'
import { yazdirEtiketGorselleri } from './etiket-gorsel-yazdir'
import { etiketleriPdfOlustur } from './etiket-pdf-yazdir'
import EtiketSablonSecici from './EtiketSablonSecici'
import {
  etiketUrunToRenderVeri,
  getPilotEtiketSablon,
  otomatikSablonSec,
  uretEtiketZplTercihli,
  type EtiketUrunVeri,
} from './etiket-sablon-helpers'

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
  lotNo?: string | null
  kategoriId?: number | null
  adet?: number
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

function modalUrunToEtiketVeri(s: EtiketModalUrun): EtiketUrunVeri {
  return {
    urunAdi: s.urunAdi,
    seriNo: s.seriNo || '-',
    fiyat: s.fiyat,
    barkod: s.barkod,
    icReferans: s.barkod ?? undefined,
    renkVaryant: s.renkVaryant,
    utsKodu: s.utsKodu,
    lotNo: s.lotNo,
    categAdi: s.categAdi,
  }
}

export default function EtiketBasModal({ acik, urunler, source = 'admin', onKapat }: Props) {
  const [secimler, setSecimler] = useState<EtiketModalUrun[]>([])
  const [sablonId, setSablonId] = useState<SablonId>('gunes-aksesuar')
  const [zpl, setZpl] = useState('')
  const [sablonRender, setSablonRender] = useState<EtiketSablonRender | null>(null)
  const [uretilenItems, setUretilenItems] = useState<EtiketUrunVeri[]>([])
  const [loading, setLoading] = useState(false)
  const [yazdiriliyor, setYazdiriliyor] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kopyalandi, setKopyalandi] = useState(false)

  const ilkSecili = useMemo(
    () => secimler.find((u) => u.secili) ?? secimler[0],
    [secimler],
  )

  useEffect(() => {
    if (acik) {
      const list = urunler.map((u) => ({ ...u, adet: u.adet && u.adet > 0 ? Math.round(u.adet) : 1 }))
      setSecimler(list)
      setSablonId(varsayilanSablon(list))
      setZpl('')
      setSablonRender(null)
      setUretilenItems([])
      setError(null)
      setKopyalandi(false)
    }
  }, [acik, urunler])

  if (!acik) return null

  const seciliSayisi = secimler.filter((s) => s.secili).length
  const toplamEtiketAdedi = secimler
    .filter((s) => s.secili)
    .reduce((sum, s) => sum + Math.max(1, Math.round(s.adet ?? 1)), 0)

  async function etiketBas() {
    setLoading(true)
    setError(null)
    try {
      const payload = secimler.filter((s) => s.secili)
      if (!payload.length) {
        setError('En az 1 ürün seçin')
        return
      }
      const items = payload.flatMap((s) => {
        const veri = modalUrunToEtiketVeri(s)
        const adet = Math.max(1, Math.round(s.adet ?? 1))
        return Array.from({ length: adet }, () => ({ ...veri }))
      })
      const [zplKod, sablon] = await Promise.all([
        uretEtiketZplTercihli(sablonId, items, ilkSecili?.categAdi, source),
        getPilotEtiketSablon(sablonId, ilkSecili?.categAdi),
      ])
      setZpl(zplKod)
      setSablonRender(sablon)
      setUretilenItems(items)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setError(err?.response?.data?.error ?? err?.message ?? 'Etiket üretilemedi')
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

  async function yazdir() {
    if (sablonRender && uretilenItems.length) {
      setYazdiriliyor(true)
      try {
        const veriler = uretilenItems.map(etiketUrunToRenderVeri)
        const sayfalar = renderEtiketBatchToDataUrls(sablonRender, veriler)
        if (sablonId === 'depo-kutu') {
          // Depo Etiketi normal (A4) yazıcı içindir: tek etiket/sayfa yerine
          // A4'e kesim çizgili grid halinde dizilmiş bir PDF indirilir.
          await etiketleriPdfOlustur(sayfalar)
        } else {
          // Zebra/Argox termal şablonlar: her etiket kendi fiziksel
          // boyutunda tek "sayfa" — etiket yazıcısı sürücüsüne gider.
          yazdirEtiketGorselleri(sayfalar)
        }
      } catch (e: unknown) {
        const err = e as { message?: string }
        setError(err?.message ?? 'Görsel yazdırma başarısız')
      } finally {
        setYazdiriliyor(false)
      }
      return
    }

    // Eski yol: pilot disi sablonlar icin ham PPLA/ZPL metni (yedek)
    if (!zpl) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<pre style="font-family:monospace;font-size:11px;white-space:pre-wrap;padding:16px">${zpl.replace(/</g, '&lt;')}</pre>`)
    w.document.close()
    w.print()
  }

  const gorselYazdirma = Boolean(sablonRender)

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
          Ürünleri seçin, şablon belirleyin ve etiket üretin. Her ürün için basılacak adedi ayrı ayrı girebilirsiniz. Yazdır, etiketi görsel olarak Argox sürücüsüne gönderir.
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          {secimler.map((u) => (
            <div
              key={u.key}
              onClick={() => setSecimler((prev) => prev.map((p) => p.key === u.key ? { ...p, secili: !p.secili } : p))}
              style={{
                display: 'grid', gridTemplateColumns: '28px 1fr auto 84px', gap: 10, alignItems: 'center',
                padding: '10px 12px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={u.secili} readOnly style={{ pointerEvents: 'none' }} />
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
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ display: 'flex', alignItems: 'center', gap: 4, justifySelf: 'end' }}
              >
                <input
                  type="number"
                  min={1}
                  value={u.adet ?? 1}
                  onChange={(e) => {
                    const v = Math.max(1, Math.round(Number(e.target.value) || 1))
                    setSecimler((prev) => prev.map((p) => p.key === u.key ? { ...p, adet: v } : p))
                  }}
                  style={{ width: 48, padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, textAlign: 'center' }}
                />
                <span style={{ fontSize: 10, color: '#9ca3af' }}>adet</span>
              </div>
            </div>
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
              {sablonId === 'depo-kutu'
                ? 'Yazdır butonu, etiketleri A4 sayfaya kesim çizgili grid halinde dizilmiş bir PDF olarak indirir — normal yazıcıdan (lazer/mürekkep püskürtmeli) bastırıp makasla kesin.'
                : gorselYazdirma
                ? 'PPLA ham komutu (yedek/kopya). Yazdır butonu etiketi PNG görseli olarak gönderir — macOS yazıcı ayarlarında özel kağıt boyutu ve Label Sensor: Gap seçili olmalı.'
                : 'Ham komut metni (eski şablon). Görsel yazdırma bu şablon için henüz yok.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => void kopyala()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontWeight: 700, cursor: 'pointer' }}>
                {kopyalandi ? '✓ Kopyalandı' : 'Ham Kodu Kopyala'}
              </button>
              <button
                type="button"
                disabled={yazdiriliyor}
                onClick={() => void yazdir()}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', fontWeight: 700, cursor: 'pointer', opacity: yazdiriliyor ? 0.6 : 1 }}
              >
                {yazdiriliyor ? 'Hazırlanıyor...' : sablonId === 'depo-kutu' ? 'PDF İndir' : 'Yazdır'}
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
              onClick={() => void etiketBas()}
              style={{
                padding: '10px 18px', borderRadius: 8, border: 'none', fontWeight: 800, cursor: 'pointer',
                backgroundColor: '#059669', color: 'white', opacity: loading || seciliSayisi === 0 ? 0.6 : 1,
              }}
            >
              {loading ? 'Üretiliyor...' : `Etiket Bas (${toplamEtiketAdedi})`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
