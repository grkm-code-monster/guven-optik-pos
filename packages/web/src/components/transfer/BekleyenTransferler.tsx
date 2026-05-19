import { useEffect, useState } from 'react'
import { getBekleyenTransferler, kabulTransfer, sorunTransfer } from '../../api/transfer.api'

const AKTIF_LOKASYON_KEY = 'aktifLokasyon'

const MOCK_BEKLEYEN = [
  {
    transferId: 'TRF-2026-0089',
    refNo: 'TRF-2026-0089',
    tarih: '2026-05-15',
    gonderen: 'GVN1',
    personel: 'Ahmet Yılmaz',
    urunler: [
      { ad: 'Ray-Ban RB2140', varyant: 'Siyah', lotNo: 'LOT-001', utsDurumu: 'ALINDI', beklenenAdet: 2 },
      { ad: 'Acuvue Oasys', varyant: '-2.00', lotNo: 'SN-884422', utsDurumu: 'BEKLEMEDE', beklenenAdet: 1 },
    ],
  },
]

export default function BekleyenTransferler() {
  const [aktifLokasyon] = useState(() => localStorage.getItem(AKTIF_LOKASYON_KEY) || 'GVN1')
  const [transferler, setTransferler] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [acikId, setAcikId] = useState<string | null>(null)
  const [sayimlar, setSayimlar] = useState<Record<string, number>>({})
  const [sorunNot, setSorunNot] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function yukle() {
    setLoading(true)
    getBekleyenTransferler(aktifLokasyon)
      .then((rows) => setTransferler(Array.isArray(rows) && rows.length ? rows : MOCK_BEKLEYEN))
      .catch(() => setTransferler(MOCK_BEKLEYEN))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    yukle()
  }, [aktifLokasyon])

  function detayAc(t: any) {
    const id = t.transferId
    setAcikId(acikId === id ? null : id)
    const init: Record<string, number> = {}
    ;(t.urunler ?? []).forEach((u: any, i: number) => {
      init[`${id}-${i}`] = u.beklenenAdet ?? 1
    })
    setSayimlar(init)
    setSorunNot('')
    setError(null)
    setSuccess(null)
  }

  function satirDurum(beklenen: number, sayilan: number) {
    if (sayilan === beklenen) return 'Tamam'
    if (sayilan < beklenen) return 'Eksik'
    return 'Fazla'
  }

  async function kabulEt(t: any) {
    setError(null)
    setSuccess(null)
    try {
      const list = (t.urunler ?? []).map((u: any, i: number) => ({
        ...u,
        sayilanAdet: sayimlar[`${t.transferId}-${i}`] ?? u.beklenenAdet,
        durum: satirDurum(u.beklenenAdet ?? 1, sayimlar[`${t.transferId}-${i}`] ?? u.beklenenAdet ?? 1),
      }))
      const data = await kabulTransfer({ transferId: t.transferId, sayimlar: list })
      if (data?.success) {
        setSuccess('Transfer kabul edildi.')
        setAcikId(null)
        yukle()
      } else {
        setError(data?.message ?? 'Kabul başarısız')
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Kabul başarısız')
    }
  }

  async function sorunBildir(t: any) {
    setError(null)
    try {
      const data = await sorunTransfer({ transferId: t.transferId, not: sorunNot })
      if (data?.success) {
        setSuccess('Sorun kaydedildi.')
        setAcikId(null)
        yukle()
      } else {
        setError(data?.message ?? 'Sorun kaydedilemedi')
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Sorun kaydedilemedi')
    }
  }

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Bekleyen Transferler</div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>Lokasyon: {aktifLokasyon}</div>
      </div>

      {error ? <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div> : null}
      {success ? <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{success}</div> : null}

      {loading ? <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div> : null}

      {!loading && transferler.length === 0 ? (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Bekleyen transfer yok.</div>
      ) : null}

      {transferler.map((t) => (
        <div key={t.transferId} style={{ marginBottom: 10 }}>
          <div className="transfer-kart">
            <div>
              <div className="transfer-kart-baslik">{t.refNo ?? t.transferId}</div>
              <div className="transfer-kart-meta">
                {t.tarih} · {t.gonderen} → {aktifLokasyon} · {t.personel} · {(t.urunler ?? []).length} ürün
              </div>
            </div>
            <div>
              <button type="button" className="btn-detay" onClick={() => detayAc(t)}>
                Detay
              </button>
              <button type="button" className="btn-kabul" onClick={() => detayAc(t)}>
                Kabul Et
              </button>
            </div>
          </div>

          {acikId === t.transferId ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginTop: 8 }}>
              {(t.urunler ?? []).map((u: any, i: number) => {
                const key = `${t.transferId}-${i}`
                const beklenen = u.beklenenAdet ?? 1
                const sayilan = sayimlar[key] ?? beklenen
                const durum = satirDurum(beklenen, sayilan)
                return (
                  <div
                    key={key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 80px 70px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{u.ad}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {u.varyant} · Lot: {u.lotNo}
                      </div>
                      <span className={u.utsDurumu === 'ALINDI' ? 'uts-ok' : 'uts-wait'}>{u.utsDurumu}</span>
                    </div>
                    <div style={{ fontSize: 12 }}>Beklenen: {beklenen}</div>
                    <input
                      type="number"
                      min={0}
                      value={sayilan}
                      onChange={(e) =>
                        setSayimlar((prev) => ({ ...prev, [key]: Math.max(0, Number(e.target.value) || 0) }))
                      }
                      style={{ padding: '6px', borderRadius: 6, border: '1px solid #e5e7eb', width: '100%' }}
                    />
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{durum}</div>
                  </div>
                )
              })}

              <textarea
                value={sorunNot}
                onChange={(e) => setSorunNot(e.target.value)}
                placeholder="Sorun notu (opsiyonel)"
                rows={2}
                style={{ width: '100%', marginTop: 10, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" className="btn-kabul" onClick={() => void kabulEt(t)}>
                  Kabul Et
                </button>
                <button type="button" className="btn-detay" onClick={() => void sorunBildir(t)}>
                  Sorun Bildir
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
