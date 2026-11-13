import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getPosFiyatBildirimleri,
  getPosUrunLotlari,
  posFiyatBildirimEtiketBasildi,
  posFiyatBildirimEtiketBasildiToplu,
  type FiyatBildirimi,
} from '../../api/stok.api'
import EtiketBasModal, { type EtiketModalUrun } from '../etiket/EtiketBasModal'

const PRIMARY = '#c0392b'
const KATEGORISIZ = '__KATEGORISIZ__'

function kategoriEtiketi(kategoriAdi: string | null | undefined): string {
  const ad = kategoriAdi?.trim()
  return ad || 'Diğer/Kategorisiz'
}

function kategoriDegeri(kategoriAdi: string | null | undefined): string {
  const ad = kategoriAdi?.trim()
  return ad || KATEGORISIZ
}

/**
 * 13.11.2026 — Fiyatı değişen ürünün o şubedeki her lotu için bir etiket satırı.
 * Önceden burada sadece ekrana Zebra kodu yazılıyor, Yazdır yoktu ve butona basınca "basıldı"
 * işaretleniyordu. Artık diğer ekranlardaki gibi gerçek şablon + Argox/Zebra seçimi + Yazdır kullanılıyor;
 * "basıldı" işareti ancak Yazdır / Ham kod indir / Kopyala'dan sonra konuyor.
 */
async function bildirimEtiketUrunleri(b: FiyatBildirimi): Promise<EtiketModalUrun[]> {
  const lotlar = await getPosUrunLotlari(b.urunId, b.subeKodu)
  if (!lotlar.length) {
    return [{
      key: `${b.id}-0`,
      urunAdi: b.urunAdi,
      seriNo: '-',
      fiyat: Number(b.yeniFiyat),
      barkod: null,
      secili: true,
      categAdi: b.kategoriAdi ?? '',
      lokasyon: b.subeKodu,
      adet: 1,
    }]
  }
  return lotlar.map((l, i) => ({
    key: `${b.id}-${i}`,
    urunAdi: b.urunAdi,
    seriNo: l.seriNo || '-',
    fiyat: l.fiyat ?? Number(b.yeniFiyat),
    barkod: l.barkod,
    secili: true,
    categAdi: b.kategoriAdi ?? '',
    renkVaryant: l.nitelik || undefined,
    utsKodu: l.utsKodu ?? null,
    utsKodlu: Boolean(l.utsKodu),
    lotNo: l.seriNo || null,
    lotId: l.lotId,
    varyantId: l.varyantId ?? null,
    lokasyon: b.subeKodu,
    adet: l.lotId ? 1 : Math.max(1, Math.round(l.adet || 1)),
  }))
}

export default function FiyatDegisenUrunlerTab() {
  const [bildirimler, setBildirimler] = useState<FiyatBildirimi[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 13.11.2026 — Etiket Bas penceresi (gerçek şablon + yazıcı seçimi + Yazdır)
  const [modalUrunler, setModalUrunler] = useState<EtiketModalUrun[]>([])
  const [modalBildirimIds, setModalBildirimIds] = useState<string[]>([])
  const [etiketYukleniyor, setEtiketYukleniyor] = useState<string | null>(null)
  const [topluYukleniyor, setTopluYukleniyor] = useState(false)
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set())
  const [kategoriFiltre, setKategoriFiltre] = useState<string>('Tümü')

  const yukle = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getPosFiyatBildirimleri(false)
      setBildirimler(data)
      setSeciliIds(new Set())
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Liste yüklenemedi')
      setBildirimler([])
      setSeciliIds(new Set())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void yukle()
  }, [yukle])

  const kategoriSecenekleri = useMemo(() => {
    const set = new Set<string>()
    for (const b of bildirimler) {
      set.add(kategoriDegeri(b.kategoriAdi))
    }
    const sorted = [...set].sort((a, b) => {
      if (a === KATEGORISIZ) return 1
      if (b === KATEGORISIZ) return -1
      return a.localeCompare(b, 'tr')
    })
    return ['Tümü', ...sorted]
  }, [bildirimler])

  const filtrelenmis = useMemo(() => {
    if (kategoriFiltre === 'Tümü') return bildirimler
    return bildirimler.filter((b) => kategoriDegeri(b.kategoriAdi) === kategoriFiltre)
  }, [bildirimler, kategoriFiltre])

  const seciliFiltreli = useMemo(
    () => filtrelenmis.filter((b) => seciliIds.has(b.id)),
    [filtrelenmis, seciliIds],
  )

  const tumuSecili = filtrelenmis.length > 0 && filtrelenmis.every((b) => seciliIds.has(b.id))

  function toggleSecim(id: string) {
    setSeciliIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTumunuSec() {
    if (tumuSecili) {
      setSeciliIds((prev) => {
        const next = new Set(prev)
        for (const b of filtrelenmis) next.delete(b.id)
        return next
      })
      return
    }
    setSeciliIds((prev) => {
      const next = new Set(prev)
      for (const b of filtrelenmis) next.add(b.id)
      return next
    })
  }

  async function etiketBas(b: FiyatBildirimi) {
    setEtiketYukleniyor(b.id)
    setError(null)
    try {
      setModalUrunler(await bildirimEtiketUrunleri(b))
      setModalBildirimIds([b.id])
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Etiket hazırlanamadı')
    } finally {
      setEtiketYukleniyor(null)
    }
  }

  async function secilenlereEtiketBas() {
    if (!seciliFiltreli.length) return
    setTopluYukleniyor(true)
    setError(null)
    try {
      const hepsi: EtiketModalUrun[] = []
      for (const b of seciliFiltreli) hepsi.push(...(await bildirimEtiketUrunleri(b)))
      setModalUrunler(hepsi)
      setModalBildirimIds(seciliFiltreli.map((b) => b.id))
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Etiketler hazırlanamadı')
    } finally {
      setTopluYukleniyor(false)
    }
  }

  /** Yazdır / Ham kod indir / Kopyala yapıldıktan sonra: bildirim(ler) "etiket basıldı" olur. */
  async function basildiIsaretle() {
    const ids = modalBildirimIds
    if (!ids.length) return
    try {
      if (ids.length === 1) await posFiyatBildirimEtiketBasildi(ids[0])
      else await posFiyatBildirimEtiketBasildiToplu(ids)
      setModalBildirimIds([])
      setSeciliIds(new Set())
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? '"Etiket basıldı" işaretlenemedi')
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280', flex: 1, minWidth: 220 }}>
          Etiket basılması gereken fiyat değişiklikleri (kendi şubeniz).
        </p>
        <button
          type="button"
          onClick={() => void yukle()}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: PRIMARY,
            color: 'white',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {loading ? 'Yükleniyor...' : 'Yenile'}
        </button>
      </div>

      {!loading && bildirimler.length > 0 ? (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
            Kategori:
            <select
              value={kategoriFiltre}
              onChange={(e) => {
                setKategoriFiltre(e.target.value)
                setSeciliIds(new Set())
              }}
              style={{
                marginLeft: 8,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                fontSize: 13,
                backgroundColor: 'white',
              }}
            >
              {kategoriSecenekleri.map((k) => (
                <option key={k} value={k}>
                  {k === 'Tümü' ? 'Tümü' : kategoriEtiketi(k === KATEGORISIZ ? null : k)}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={tumuSecili}
              onChange={toggleTumunuSec}
              disabled={!filtrelenmis.length || topluYukleniyor}
            />
            Tümünü Seç
          </label>

          <span style={{ fontSize: 13, color: '#6b7280' }}>
            {seciliFiltreli.length} seçili
          </span>

          <button
            type="button"
            onClick={() => void secilenlereEtiketBas()}
            disabled={!seciliFiltreli.length || topluYukleniyor || !!etiketYukleniyor}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: seciliFiltreli.length && !topluYukleniyor ? '#059669' : '#9ca3af',
              color: 'white',
              fontWeight: 700,
              fontSize: 13,
              cursor: seciliFiltreli.length && !topluYukleniyor ? 'pointer' : 'not-allowed',
            }}
          >
            {topluYukleniyor ? '⏳ Basılıyor...' : '🖨 Seçilenlere Etiket Bas'}
          </button>
        </div>
      ) : null}

      {error ? (
        <p style={{ color: '#991b1b', fontSize: 13, marginBottom: 12 }}>{error}</p>
      ) : null}

      {loading ? (
        <p style={{ color: '#6b7280', fontSize: 13 }}>Yükleniyor...</p>
      ) : null}

      {!loading && bildirimler.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 32 }}>
          Etiket basılması gereken fiyat değişikliği yok.
        </p>
      ) : null}

      {!loading && bildirimler.length > 0 && filtrelenmis.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 32 }}>
          Seçilen kategoride kayıt yok.
        </p>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtrelenmis.map((b) => (
          <div
            key={b.id}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 14,
              backgroundColor: seciliIds.has(b.id) ? '#f0fdf4' : 'white',
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={seciliIds.has(b.id)}
                onChange={() => toggleSecim(b.id)}
                disabled={topluYukleniyor || etiketYukleniyor === b.id}
                style={{ marginTop: 4, flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{b.urunAdi}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                  {b.subeKodu} · {kategoriEtiketi(b.kategoriAdi)} · {b.fiyatTipi === 'ALIS' ? 'Alış' : 'Satış'} ·{' '}
                  {new Date(b.createdAt).toLocaleString('tr-TR')}
                </div>
                <div style={{ fontSize: 14, marginBottom: 10 }}>
                  <span style={{ textDecoration: 'line-through', color: '#9ca3af' }}>
                    {Number(b.eskiFiyat).toLocaleString('tr-TR')} ₺
                  </span>
                  {' → '}
                  <span style={{ fontWeight: 800, color: '#059669' }}>
                    {Number(b.yeniFiyat).toLocaleString('tr-TR')} ₺
                  </span>
                </div>
                <button
                  type="button"
                  disabled={etiketYukleniyor === b.id || topluYukleniyor}
                  onClick={() => void etiketBas(b)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: '#059669',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: etiketYukleniyor === b.id || topluYukleniyor ? 'wait' : 'pointer',
                  }}
                >
                  {etiketYukleniyor === b.id ? '⏳...' : 'Etiket Bas'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <EtiketBasModal
        acik={modalUrunler.length > 0}
        urunler={modalUrunler}
        source="pos"
        kaynak="POS_FIYAT"
        onBasildi={() => void basildiIsaretle()}
        onKapat={() => {
          setModalUrunler([])
          void yukle()
        }}
      />
    </div>
  )
}
