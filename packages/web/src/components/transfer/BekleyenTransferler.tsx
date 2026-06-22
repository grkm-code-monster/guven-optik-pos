import { useEffect, useMemo, useState } from 'react'
import {
  getBekleyenTransferler,
  getGonderilenTransferler,
  kabulTransfer,
  sorunTransfer,
} from '../../api/transfer.api'
import { useAuthStore } from '../../store/auth.store'
import EtiketBasModal, { type EtiketModalUrun } from '../etiket/EtiketBasModal'

const AKTIF_LOKASYON_KEY = 'aktifLokasyon'

const LOKASYONLAR = ['GVN1', 'GVN3', 'GVN4', 'GVN6', 'GVN8', 'GVN9', 'GVN2', 'GVN10', 'ANADEPO', 'GVN5']

const MOCK_BEKLEYEN = [
  {
    transferId: 'TRF-2026-0089',
    refNo: 'TRF-2026-0089',
    tarih: '2026-05-15',
    gonderen: 'GVN1',
    alici: 'GVN2',
    personel: 'Ahmet Yılmaz',
    urunler: [
      { ad: 'Ray-Ban RB2140', varyant: 'Siyah', lotNo: 'LOT-001', seriNo: 'LOT-001', fiyat: 2500, etiketSecili: true, beklenenAdet: 1 },
      { ad: 'Acuvue Oasys', varyant: '-2.00', lotNo: 'SN-884422', seriNo: 'SN-884422', fiyat: 800, etiketSecili: true, beklenenAdet: 1 },
    ],
  },
]

type Props = {
  source?: 'pos' | 'admin'
  lokasyon?: string
  showGonderilen?: boolean
  useMockFallback?: boolean
}

function readAdminUser(): { role?: string } | null {
  try {
    const raw = localStorage.getItem('admin-user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function BekleyenTransferler({
  source = 'pos',
  lokasyon: lokasyonProp,
  showGonderilen = true,
  useMockFallback = source === 'pos',
}: Props) {
  const posUser = useAuthStore((s) => s.user)
  const adminUser = source === 'admin' ? readAdminUser() : null
  const user = posUser ?? adminUser

  const [aktifLokasyon, setAktifLokasyon] = useState(
    () => lokasyonProp ?? localStorage.getItem(AKTIF_LOKASYON_KEY) ?? 'GVN1',
  )
  const [gorunum, setGorunum] = useState<'gelen' | 'giden'>('gelen')
  const [gelenTransferler, setGelenTransferler] = useState<any[]>([])
  const [gidenTransferler, setGidenTransferler] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [acikId, setAcikId] = useState<string | null>(null)
  const [sayimlar, setSayimlar] = useState<Record<string, number>>({})
  const [sorunNot, setSorunNot] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [etiketAcik, setEtiketAcik] = useState(false)
  const [etiketUrunler, setEtiketUrunler] = useState<EtiketModalUrun[]>([])

  const canAccept = user?.role === 'STORE_MANAGER' || user?.role === 'ADMIN'
  const transferler = gorunum === 'gelen' ? gelenTransferler : gidenTransferler

  useEffect(() => {
    if (lokasyonProp) setAktifLokasyon(lokasyonProp)
  }, [lokasyonProp])

  function yukle() {
    setLoading(true)
    Promise.all([
      getBekleyenTransferler(aktifLokasyon, source),
      showGonderilen ? getGonderilenTransferler(aktifLokasyon, source) : Promise.resolve([]),
    ])
      .then(([gelen, giden]) => {
        if (useMockFallback && (!Array.isArray(gelen) || gelen.length === 0)) {
          setGelenTransferler(MOCK_BEKLEYEN)
        } else {
          setGelenTransferler(Array.isArray(gelen) ? gelen : [])
        }
        setGidenTransferler(Array.isArray(giden) ? giden : [])
      })
      .catch(() => {
        if (useMockFallback) setGelenTransferler(MOCK_BEKLEYEN)
        else {
          setGelenTransferler([])
          setGidenTransferler([])
        }
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    yukle()
  }, [aktifLokasyon, source, showGonderilen])

  function detayAc(t: any) {
    const id = String(t.transferId)
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

  function buildEtiketUrunleri(t: any, kabulSatirlari: any[]): EtiketModalUrun[] {
    return kabulSatirlari
      .filter((u) => (u.sayilanAdet ?? 0) > 0)
      .map((u, i) => ({
        key: `${t.transferId}-${i}`,
        urunAdi: u.ad ?? 'Ürün',
        seriNo: u.seriNo ?? u.lotNo ?? '',
        fiyat: u.fiyat ?? 0,
        barkod: u.barkod ?? null,
        secili: u.etiketSecili !== false,
        categAdi: u.categAdi,
        renkVaryant: u.varyant ?? u.renkVaryant,
        utsKodu: u.utsKodu ?? null,
        utsKodlu: u.utsDurumu === 'ALINDI' || Boolean(u.utsKodu),
      }))
  }

  async function kabulEt(t: any) {
    setError(null)
    setSuccess(null)
    try {
      if (!user || (user.role !== 'STORE_MANAGER' && user.role !== 'ADMIN')) {
        setError('Bu işlem için yetkiniz yok. Kabul işlemi için yöneticinizle görüşün.')
        return
      }
      const list = (t.urunler ?? []).map((u: any, i: number) => ({
        ...u,
        sayilanAdet: sayimlar[`${t.transferId}-${i}`] ?? u.beklenenAdet,
        durum: satirDurum(u.beklenenAdet ?? 1, sayimlar[`${t.transferId}-${i}`] ?? u.beklenenAdet ?? 1),
      }))
      const data = await kabulTransfer({ transferId: String(t.transferId), sayimlar: list }, source)
      if (data?.success) {
        setSuccess('Transfer kabul edildi.')
        setAcikId(null)
        yukle()
        const etiketler = buildEtiketUrunleri(t, list)
        if (etiketler.length) {
          setEtiketUrunler(etiketler)
          setEtiketAcik(true)
        }
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
      const data = await sorunTransfer({ transferId: String(t.transferId), not: sorunNot }, source)
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

  const baslik = useMemo(() => {
    if (gorunum === 'gelen') return 'Gelen Transferler (Kabul Bekliyor)'
    return 'Giden Transferler (Yolda)'
  }, [gorunum])

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{baslik}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {source === 'admin' ? (
            <select
              value={aktifLokasyon}
              onChange={(e) => setAktifLokasyon(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            >
              {LOKASYONLAR.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          ) : (
            <div style={{ fontSize: 12, color: '#6b7280' }}>Lokasyon: {aktifLokasyon}</div>
          )}
          <button type="button" onClick={yukle} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, cursor: 'pointer' }}>
            Yenile
          </button>
        </div>
      </div>

      {showGonderilen ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setGorunum('gelen')}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
              backgroundColor: gorunum === 'gelen' ? '#1a1a2e' : '#f3f4f6',
              color: gorunum === 'gelen' ? 'white' : '#374151',
            }}
          >
            Gelen ({gelenTransferler.length})
          </button>
          <button
            type="button"
            onClick={() => setGorunum('giden')}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
              backgroundColor: gorunum === 'giden' ? '#1a1a2e' : '#f3f4f6',
              color: gorunum === 'giden' ? 'white' : '#374151',
            }}
          >
            Giden ({gidenTransferler.length})
          </button>
        </div>
      ) : null}

      {error ? <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div> : null}
      {success ? <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{success}</div> : null}

      {loading ? <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div> : null}

      {!loading && transferler.length === 0 ? (
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          {gorunum === 'gelen' ? 'Bekleyen gelen transfer yok.' : 'Bekleyen giden transfer yok.'}
        </div>
      ) : null}

      {transferler.map((t) => (
        <div key={t.transferId} style={{ marginBottom: 10 }}>
          <div className="transfer-kart">
            <div>
              <div className="transfer-kart-baslik">{t.refNo ?? t.transferId}</div>
              <div className="transfer-kart-meta">
                {t.tarih} · {t.gonderen} → {t.alici ?? aktifLokasyon} · {t.personel} · {(t.urunler ?? []).length} ürün
                {t.durum ? ` · ${t.durum}` : ''}
              </div>
            </div>
            <div>
              <button type="button" className="btn-detay" onClick={() => detayAc(t)}>
                Detay
              </button>
              {gorunum === 'gelen' && canAccept ? (
                <button type="button" className="btn-kabul" onClick={() => detayAc(t)}>
                  Kabul Et
                </button>
              ) : null}
            </div>
          </div>

          {acikId === String(t.transferId) ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginTop: 8 }}>
              {gorunum === 'gelen' && !canAccept ? (
                <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 12, fontWeight: 700 }}>
                  Kabul/Red işlemleri sadece mağaza müdürü veya admin tarafından yapılabilir. Lütfen yöneticinizle görüşün.
                </div>
              ) : null}
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
                      gridTemplateColumns: gorunum === 'gelen' ? '1fr 80px 80px 70px' : '1fr 80px',
                      gap: 8,
                      alignItems: 'center',
                      padding: '8px 0',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{u.ad}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {u.varyant} · Seri: {u.seriNo ?? u.lotNo ?? '—'}
                        {u.fiyat != null ? ` · ${Number(u.fiyat).toLocaleString('tr-TR')} ₺` : ''}
                      </div>
                      {u.utsDurumu ? <span className={u.utsDurumu === 'ALINDI' ? 'uts-ok' : 'uts-wait'}>{u.utsDurumu}</span> : null}
                    </div>
                    <div style={{ fontSize: 12 }}>Beklenen: {beklenen}</div>
                    {gorunum === 'gelen' ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          value={sayilan}
                          disabled={!canAccept}
                          onChange={(e) =>
                            setSayimlar((prev) => ({ ...prev, [key]: Math.max(0, Number(e.target.value) || 0) }))
                          }
                          style={{ padding: '6px', borderRadius: 6, border: '1px solid #e5e7eb', width: '100%' }}
                        />
                        <div style={{ fontSize: 12, fontWeight: 800 }}>{durum}</div>
                      </>
                    ) : null}
                  </div>
                )
              })}

              {gorunum === 'gelen' && canAccept ? (
                <>
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
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}

      <EtiketBasModal
        acik={etiketAcik}
        urunler={etiketUrunler}
        source={source}
        onKapat={() => setEtiketAcik(false)}
      />
    </div>
  )
}
