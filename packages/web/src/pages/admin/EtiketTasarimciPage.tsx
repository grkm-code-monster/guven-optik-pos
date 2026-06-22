import { useMemo, useState } from 'react'
import { SABLONLAR, sablonBul } from '../../components/etiket-tasarimci/sablon-registry'
import type { SablonAyar, SablonId, SablonVeri } from '../../components/etiket-tasarimci/sablon-types'
import { ORNEK_SABLON_VERI } from '../../components/etiket-tasarimci/sablon-types'
import { uretSablonZpl } from '../../components/etiket-tasarimci/sablon-zpl'

const inp: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
}
const btn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
}
const btnDark: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }

export default function EtiketTasarimciPage() {
  const [seciliId, setSeciliId] = useState<SablonId>('optik-cerceve-uts')
  const [ayarlar, setAyarlar] = useState<Record<SablonId, SablonAyar>>(() =>
    Object.fromEntries(SABLONLAR.map((s) => [s.id, { ...s.defaultAyar }])) as Record<SablonId, SablonAyar>,
  )
  const [veri, setVeri] = useState<SablonVeri>({ ...ORNEK_SABLON_VERI })
  const [zpl, setZpl] = useState<string | null>(null)
  const [mesaj, setMesaj] = useState<string | null>(null)

  const sablon = sablonBul(seciliId)!
  const ayar = ayarlar[seciliId]
  const Preview = sablon.Preview

  const canliZpl = useMemo(
    () => uretSablonZpl(seciliId, veri, ayar),
    [seciliId, veri, ayar],
  )

  function sablonSec(id: SablonId) {
    setSeciliId(id)
    setZpl(null)
    setMesaj(null)
  }

  function guncelleAyar(key: keyof SablonAyar, value: SablonAyar[keyof SablonAyar]) {
    setAyarlar((prev) => ({
      ...prev,
      [seciliId]: { ...prev[seciliId], [key]: value },
    }))
    setZpl(null)
  }

  function zplUret() {
    const kod = uretSablonZpl(seciliId, veri, ayar)
    setZpl(kod)
    setMesaj('ZPL üretildi.')
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Etiket Tasarımcısı</h1>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Hazır şablon seçin, özelleştirin ve ZPL üretin.
        </div>
      </div>

      {mesaj ? (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, backgroundColor: '#eff6ff', fontSize: 13, fontWeight: 600 }}>
          {mesaj}
        </div>
      ) : null}

      {/* Şablon kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {SABLONLAR.map((s) => {
          const secili = s.id === seciliId
          const Mini = s.Preview
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => sablonSec(s.id)}
              style={{
                textAlign: 'left',
                padding: 14,
                borderRadius: 12,
                border: secili ? '2px solid #2563eb' : '1px solid #e5e7eb',
                backgroundColor: secili ? '#eff6ff' : 'white',
                cursor: 'pointer',
                boxShadow: secili ? '0 4px 12px rgba(37,99,235,0.15)' : '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, backgroundColor: '#f9fafb', borderRadius: 8, padding: 8 }}>
                <Mini
                  data={veri}
                  ayar={ayarlar[s.id]}
                  width={s.previewW * 0.45}
                  height={s.previewH * 0.45}
                />
              </div>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{s.ad}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{s.aciklama}</div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                {s.etiketGenislik}×{s.etiketYukseklik} mm
              </div>
            </button>
          )
        })}
      </div>

      {/* Seçili şablon detay */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>
            Canlı Önizleme — {sablon.ad}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
              padding: 24,
              backgroundColor: '#f3f4f6',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
            }}
          >
            <Preview
              data={veri}
              ayar={ayar}
              width={460}
              height={sablon.id === 'depo-kutu' ? 345 : 230}
            />
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
            Gerçek oran: {sablon.etiketGenislik}×{sablon.etiketYukseklik} mm
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button type="button" onClick={zplUret} style={{ ...btnDark, backgroundColor: '#059669' }}>
                ZPL Üret
              </button>
              {(zpl ?? canliZpl) ? (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(zpl ?? canliZpl)}
                  style={btnDark}
                >
                  ZPL Kopyala
                </button>
              ) : null}
            </div>
            <textarea
              readOnly
              value={zpl ?? canliZpl}
              rows={12}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 11,
                padding: 12,
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                boxSizing: 'border-box',
                backgroundColor: '#fafafa',
              }}
            />
          </div>
        </div>

        <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>Özelleştirme</div>

          <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#374151' }}>Örnek Veri</div>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Ürün Adı</span>
                <input
                  type="text"
                  value={veri.urunAdi ?? ''}
                  onChange={(e) => setVeri((v) => ({ ...v, urunAdi: e.target.value }))}
                  style={{ ...inp, marginTop: 4 }}
                />
              </label>
              <label>
                <span style={{ fontSize: 11, color: '#6b7280' }}>İç Referans</span>
                <input
                  type="text"
                  value={veri.icReferans ?? ''}
                  onChange={(e) => setVeri((v) => ({ ...v, icReferans: e.target.value }))}
                  style={{ ...inp, marginTop: 4 }}
                />
              </label>
              <label>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Fiyat</span>
                <input
                  type="number"
                  value={Number(veri.fiyat ?? 0)}
                  onChange={(e) => setVeri((v) => ({ ...v, fiyat: Number(e.target.value) }))}
                  style={{ ...inp, marginTop: 4 }}
                />
              </label>
              {(seciliId === 'kampanya-fiyat') ? (
                <>
                  <label>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Eski Fiyat</span>
                    <input
                      type="number"
                      value={Number(veri.eskiFiyat ?? 0)}
                      onChange={(e) => setVeri((v) => ({ ...v, eskiFiyat: Number(e.target.value) }))}
                      style={{ ...inp, marginTop: 4 }}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Yeni Fiyat</span>
                    <input
                      type="number"
                      value={Number(veri.yeniFiyat ?? 0)}
                      onChange={(e) => setVeri((v) => ({ ...v, yeniFiyat: Number(e.target.value) }))}
                      style={{ ...inp, marginTop: 4 }}
                    />
                  </label>
                </>
              ) : null}
              {(seciliId === 'depo-kutu') ? (
                <>
                  <label>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Miktar</span>
                    <input
                      type="number"
                      value={veri.miktar ?? 0}
                      onChange={(e) => setVeri((v) => ({ ...v, miktar: Number(e.target.value) }))}
                      style={{ ...inp, marginTop: 4 }}
                    />
                  </label>
                  <label>
                    <span style={{ fontSize: 11, color: '#6b7280' }}>Lokasyon</span>
                    <input
                      type="text"
                      value={veri.lokasyon ?? ''}
                      onChange={(e) => setVeri((v) => ({ ...v, lokasyon: e.target.value }))}
                      style={{ ...inp, marginTop: 4 }}
                    />
                  </label>
                </>
              ) : null}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {sablon.ozellestirmeAlanlari.map((alan) => (
              <label key={alan.key}>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{alan.label}</span>
                {alan.type === 'boolean' ? (
                  <div style={{ marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(ayar[alan.key])}
                      onChange={(e) => guncelleAyar(alan.key, e.target.checked)}
                    />
                  </div>
                ) : alan.type === 'color' ? (
                  <input
                    type="color"
                    value={String(ayar[alan.key])}
                    onChange={(e) => guncelleAyar(alan.key, e.target.value)}
                    style={{ ...inp, marginTop: 4, padding: 2, height: 36 }}
                  />
                ) : (
                  <input
                    type="number"
                    min={alan.min}
                    max={alan.max}
                    value={Number(ayar[alan.key])}
                    onChange={(e) => guncelleAyar(alan.key, Number(e.target.value))}
                    style={{ ...inp, marginTop: 4 }}
                  />
                )}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
