import { useCallback, useEffect, useState } from 'react'
import {
  bildirimOkundu,
  fiyatBildirimEtiketBasildi,
  getFiyatBildirimleri,
  getUrunLotlari,
  tumBildirimleriOkundu,
  type FiyatBildirimi,
} from '../../api/stok.api'
import { generateZpl } from '../../api/etiket.api'

type Props = {
  acik: boolean
  onKapat: () => void
  onSayacGuncelle: () => void
}

export default function FiyatBildirimPanel({ acik, onKapat, onSayacGuncelle }: Props) {
  const [bildirimler, setBildirimler] = useState<FiyatBildirimi[]>([])
  const [loading, setLoading] = useState(false)
  const [etiketZpl, setEtiketZpl] = useState('')
  const [etiketYukleniyor, setEtiketYukleniyor] = useState<string | null>(null)

  const yukle = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getFiyatBildirimleri(false)
      setBildirimler(data)
    } catch {
      setBildirimler([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (acik) void yukle()
  }, [acik, yukle])

  if (!acik) return null

  async function okunduIsaretle(id: string) {
    await bildirimOkundu(id)
    onSayacGuncelle()
    void yukle()
  }

  async function tumunuOkundu() {
    await tumBildirimleriOkundu()
    onSayacGuncelle()
    void yukle()
  }

  async function etiketBas(b: FiyatBildirimi) {
    setEtiketYukleniyor(b.id)
    setEtiketZpl('')
    try {
      const lotlar = await getUrunLotlari(b.urunId, b.subeKodu)
      const items = (lotlar.length ? lotlar : [{
        seriNo: '-',
        fiyat: Number(b.yeniFiyat),
        barkod: null,
      }]).map((l) => ({
        urunAdi: b.urunAdi,
        seriNo: l.seriNo || '-',
        fiyat: l.fiyat ?? Number(b.yeniFiyat),
        barkod: l.barkod,
      }))
      const res = await generateZpl(items, 'admin')
      setEtiketZpl(res.zpl)
      await fiyatBildirimEtiketBasildi(b.id)
      onSayacGuncelle()
      void yukle()
    } finally {
      setEtiketYukleniyor(null)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 3000,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div style={{
        width: '100%', maxWidth: 420, height: '100%', backgroundColor: 'white',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Fiyat Değişiklikleri</div>
          <button type="button" onClick={onKapat} style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <button
            type="button"
            onClick={() => void tumunuOkundu()}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Tümünü okundu işaretle
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {loading ? <div style={{ color: '#6b7280', fontSize: 13 }}>Yükleniyor...</div> : null}
          {!loading && bildirimler.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 32 }}>Bekleyen bildirim yok</div>
          ) : null}

          {bildirimler.map((b) => (
            <div key={b.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{b.urunAdi}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                {b.subeKodu} · {b.fiyatTipi === 'ALIS' ? 'Alış' : 'Satış'} fiyatı
              </div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>
                  {Number(b.eskiFiyat).toLocaleString('tr-TR')} ₺
                </span>
                {' → '}
                <span style={{ fontWeight: 800, color: '#059669' }}>
                  {Number(b.yeniFiyat).toLocaleString('tr-TR')} ₺
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  disabled={etiketYukleniyor === b.id}
                  onClick={() => void etiketBas(b)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', backgroundColor: '#059669', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  {etiketYukleniyor === b.id ? '...' : 'Etiket Bas'}
                </button>
                <button
                  type="button"
                  onClick={() => void okunduIsaretle(b.id)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  Okundu
                </button>
              </div>
            </div>
          ))}
        </div>

        {etiketZpl ? (
          <div style={{ padding: 16, borderTop: '1px solid #e5e7eb' }}>
            <textarea readOnly value={etiketZpl} rows={5} style={{ width: '100%', fontFamily: 'monospace', fontSize: 11, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', boxSizing: 'border-box' }} />
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(etiketZpl)}
              style={{ marginTop: 8, padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#1a1a2e', color: 'white', fontWeight: 700, cursor: 'pointer', width: '100%' }}
            >
              ZPL Kopyala
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
