import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../store/auth.store'
import { createTransfer, searchTransferProductLots, searchTransferProducts } from '../../api/transfer.api'
import BarkodKameraInput from '../BarkodKameraInput'
import { extractGs1SearchTerm, type Gs1SearchYontem } from '../../utils/parseGs1DataMatrix'
import { extractApiErrorMessage } from '../../utils/extractApiErrorMessage'
import { transferHataMesaji } from '../../utils/transferError'

const LOKASYONLAR = [
  { id: 'GVN1', label: 'GVN1 — Mağaza', sirket: 'ADESE' },
  { id: 'GVN3', label: 'GVN3 — Mağaza', sirket: 'ADESE' },
  { id: 'GVN4', label: 'GVN4 — Mağaza', sirket: 'ADESE' },
  { id: 'GVN6', label: 'GVN6 — Mağaza', sirket: 'ADESE' },
  { id: 'GVN8', label: 'GVN8 — Mağaza', sirket: 'ADESE' },
  { id: 'GVN9', label: 'GVN9 — Mağaza', sirket: 'ADESE' },
  { id: 'GVNP', label: 'GVNP — Mağaza', sirket: 'ADESE' },
  { id: 'ANADEPO', label: 'ANA DEPO', sirket: 'NG' },
  { id: 'GVN2', label: 'GVN2 — Mağaza', sirket: 'NG' },
  { id: 'GVN7', label: 'GVN7 — Mağaza', sirket: 'NG' },
  { id: 'GVN10', label: 'GVN10 — Mağaza', sirket: 'NG' },
  { id: 'ETICARET', label: 'E-TİCARET', sirket: 'NG' },
  { id: 'GVN5', label: 'GVN5 — Mağaza', sirket: 'POTANSİYEL' },
] as const

const SIRKETLER = ['ADESE', 'NG', 'POTANSİYEL'] as const

const ARAMA_YONTEMLERI = [
  { id: 'barkod', label: 'Barkod' },
  { id: 'uts', label: 'UTS kodu' },
  { id: 'lot', label: 'Lot/Seri' },
  { id: 'ref', label: 'İç referans' },
  { id: 'ad', label: 'Ürün adı' },
] as const

function bugunTarih() {
  return new Date().toISOString().slice(0, 10)
}

function transferTipiBelirle(cikisId: string, girisId: string) {
  const c = LOKASYONLAR.find((l) => l.id === cikisId)
  const g = LOKASYONLAR.find((l) => l.id === girisId)
  if (!c || !g) return null
  if (c.sirket === g.sirket) {
    return { tip: 'irsaliyeli' as const, kdv: false, label: 'Aynı şirket — KDV muaf', renk: 'success' as const }
  }
  return { tip: 'faturali' as const, kdv: true, label: 'Şirketler arası — KDV uygulanır (+%5 kar)', renk: 'warning' as const }
}

type UrunSatir = {
  id: number | string
  ad: string
  varyant: string
  lotId: number | null
  lotNo: string
  tracking: string
  utsKodu: string | null
  utsDurumu: string
  adet: number
  kaynakFatura: string | null
  iadeVarMi: boolean
}

function readAdminUser(): { id?: string; role?: string } | null {
  try {
    const raw = localStorage.getItem('admin-user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function normalizeAramaMetni(raw: string, yontem: string): string {
  return extractGs1SearchTerm(raw, yontem as Gs1SearchYontem)
}

function transferSonucKey(u: { id: number | string; lotId?: number | null; lotNo?: string | null; varyant?: string }) {
  return `${u.id}|${u.lotId ?? ''}|${u.lotNo ?? ''}|${u.varyant ?? ''}`
}

type Props = {
  source?: 'pos' | 'admin'
  defaultLokasyon?: string
}

export default function YeniTransfer({ source = 'pos', defaultLokasyon }: Props) {
  const posUser = useAuthStore((s) => s.user)
  const adminUser = source === 'admin' ? readAdminUser() : null
  const user = posUser ?? adminUser

  const [cikisLok, setCikisLok] = useState(defaultLokasyon ?? '')
  const [girisLok, setGirisLok] = useState('')
  const [tarih, setTarih] = useState(bugunTarih())
  const [referans, setReferans] = useState('')
  const [urunler, setUrunler] = useState<UrunSatir[]>([])
  const [not, setNot] = useState('')
  const [aramaYontemi, setAramaYontemi] = useState('barkod')
  const [aramaMetni, setAramaMetni] = useState('')
  const [aramaOneri, setAramaOneri] = useState<any[] | null>(null)
  const [aramaLoading, setAramaLoading] = useState(false)
  const [lotSecimUrun, setLotSecimUrun] = useState<any | null>(null)
  const [lotSecimListe, setLotSecimListe] = useState<any[]>([])
  const [lotSecimLoading, setLotSecimLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const transferTipi = useMemo(() => transferTipiBelirle(cikisLok, girisLok), [cikisLok, girisLok])
  const kameraAktif = aramaYontemi !== 'ad'

  const aramaPlaceholder = !cikisLok
    ? 'Önce çıkış lokasyonu seçin'
    : aramaYontemi === 'ad'
      ? 'Ürün adı yazın...'
      : 'Barkod/karekod okutun veya yazın...'

  const ozet = useMemo(() => {
    const iade = urunler.filter((u) => u.iadeVarMi).length
    const utsBekleme = urunler.filter((u) => u.utsDurumu === 'BEKLEMEDE').length
    return { urun: urunler.length, iade, utsBekleme }
  }, [urunler])

  useEffect(() => {
    const minLen = aramaYontemi === 'ad' ? 1 : 3
    const rawQ = aramaMetni.trim()
    const q = normalizeAramaMetni(rawQ, aramaYontemi)
    if (!cikisLok || !q || q.length < minLen) {
      setAramaOneri(null)
      return
    }
    const t = setTimeout(() => {
      setAramaLoading(true)
      searchTransferProducts({ q, yontem: aramaYontemi, lokasyon: cikisLok }, source)
        .then((rows) => setAramaOneri(Array.isArray(rows) ? rows : []))
        .catch((e: unknown) => {
          setAramaOneri([])
          setError(extractApiErrorMessage(e, 'Ürün araması başarısız'))
        })
        .finally(() => setAramaLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [aramaMetni, aramaYontemi, cikisLok, source])

  function urunEkle(u: any) {
    const lotNo = String(u.lotNo ?? '').trim()
    const lotId = u.lotId != null ? Number(u.lotId) : null
    const tracking = String(u.tracking ?? 'none')
    if (tracking !== 'none' && !lotNo && !(lotId && Number.isFinite(lotId))) {
      setError('Bu ürün lot/seri takipli, transfer için lot seçilmeli.')
      return
    }
    setError(null)
    setUrunler((prev) => [
      ...prev,
      {
        id: u.id,
        ad: u.ad,
        varyant: u.varyant ?? '',
        lotId: lotId && Number.isFinite(lotId) ? lotId : null,
        lotNo,
        tracking,
        utsKodu: u.utsKodu ?? null,
        utsDurumu: u.utsDurumu ?? 'BEKLEMEDE',
        adet: 1,
        kaynakFatura: u.kaynakFatura ?? null,
        iadeVarMi: !!u.kaynakFatura,
      },
    ])
    setAramaMetni('')
    setAramaOneri(null)
    setLotSecimUrun(null)
    setLotSecimListe([])
  }

  async function urunSec(u: any) {
    const tracking = String(u.tracking ?? 'none')
    const lotNo = String(u.lotNo ?? '').trim()
    const lotId = u.lotId != null ? Number(u.lotId) : null
    if (tracking !== 'none' && !lotNo && !(lotId && Number.isFinite(lotId))) {
      if (!cikisLok) {
        setError('Önce çıkış lokasyonu seçin.')
        return
      }
      setLotSecimUrun(u)
      setLotSecimListe([])
      setLotSecimLoading(true)
      setError(null)
      try {
        const lots = await searchTransferProductLots(Number(u.id), cikisLok, source)
        const liste = Array.isArray(lots) ? lots : []
        setLotSecimListe(liste)
        if (liste.length === 0) {
          setError(`Bu üründe ${cikisLok} içinde stokta lot yok.`)
          setLotSecimUrun(null)
        }
      } catch (e: unknown) {
        setError(extractApiErrorMessage(e, 'Lot listesi alınamadı'))
        setLotSecimUrun(null)
      } finally {
        setLotSecimLoading(false)
      }
      return
    }
    urunEkle(u)
  }

  function lotSecimIptal() {
    setLotSecimUrun(null)
    setLotSecimListe([])
  }

  function urunSil(idx: number) {
    setUrunler((prev) => prev.filter((_, i) => i !== idx))
  }

  async function transferBaslat() {
    setError(null)
    setSuccess(null)
    if (!cikisLok || !girisLok) {
      setError('Çıkış ve giriş lokasyonu seçilmelidir.')
      return
    }
    if (cikisLok === girisLok) {
      setError('Çıkış ve giriş lokasyonu aynı olamaz.')
      return
    }
    if (urunler.length === 0) {
      setError('En az bir ürün ekleyin.')
      return
    }
    const lotsuz = urunler.find((u) => u.tracking !== 'none' && !u.lotNo?.trim() && !u.lotId)
    if (lotsuz) {
      setError(`Bu ürün lot/seri takipli, transfer için lot seçilmeli: ${lotsuz.ad}`)
      return
    }
    if (!user?.id) {
      setError('Oturum bulunamadı.')
      return
    }
    setSubmitting(true)
    try {
      const data = await createTransfer({
        cikisLokasyon: cikisLok,
        girisLokasyon: girisLok,
        tarih,
        referans,
        not,
        urunler,
        personel: String(user.id),
      }, source)
      if (data?.success) {
        const durum = data.durum as string | undefined
        const ref = data.transferRef ?? data.transferId ?? ''
        const picking = data.odooPickingId ? ` (Odoo #${data.odooPickingId})` : ''
        if (durum === 'basarili') {
          setSuccess(`Transfer tamamlandı${ref ? `: ${ref}` : ''}${picking}`)
        } else {
          setSuccess(data.message ?? `Transfer gönderildi${ref ? `: ${ref}` : ''}${picking} — hedef şube kabul bekliyor`)
        }
        setCikisLok('')
        setGirisLok('')
        setReferans('')
        setNot('')
        setUrunler([])
        setTarih(bugunTarih())
      } else {
        setError(transferHataMesaji(data, 'Transfer oluşturulamadı'))
      }
    } catch (e: unknown) {
      setError(extractApiErrorMessage(e, 'Transfer oluşturulamadı'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Yeni Transfer</div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            padding: '6px 12px',
            borderRadius: 999,
            backgroundColor: '#fdf2f4',
            color: '#C8102E',
            border: '1px solid #fce8ec',
          }}
        >
          {user?.name ?? 'Personel'}
        </div>
      </div>

      {transferTipi ? (
        <div className={transferTipi.renk === 'success' ? 'banner-success' : 'banner-warning'}>
          {transferTipi.label}
        </div>
      ) : null}

      {error ? <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div> : null}
      {success ? <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{success}</div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>
          Çıkış Lokasyonu
          <select
            value={cikisLok}
            onChange={(e) => setCikisLok(e.target.value)}
            style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
          >
            <option value="">Seçin</option>
            {SIRKETLER.map((s) => (
              <optgroup key={s} label={s}>
                {LOKASYONLAR.filter((l) => l.sirket === s).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>
          Giriş Lokasyonu
          <select
            value={girisLok}
            onChange={(e) => setGirisLok(e.target.value)}
            style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
          >
            <option value="">Seçin</option>
            {SIRKETLER.map((s) => (
              <optgroup key={s} label={s}>
                {LOKASYONLAR.filter((l) => l.sirket === s).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>
          Tarih
          <input
            type="date"
            value={tarih}
            onChange={(e) => setTarih(e.target.value)}
            style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>
          Referans
          <input
            value={referans}
            onChange={(e) => setReferans(e.target.value)}
            style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280' }}>
          Not
          <input
            value={not}
            onChange={(e) => setNot(e.target.value)}
            style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: 10, fontWeight: 800, fontSize: 14 }}>Ürün Ekle</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {ARAMA_YONTEMLERI.map((y) => (
          <button
            key={y.id}
            type="button"
            onClick={() => {
              setAramaYontemi(y.id)
              if (y.id === 'ad') setLotSecimUrun(null)
            }}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              backgroundColor: aramaYontemi === y.id ? '#C8102E' : 'white',
              color: aramaYontemi === y.id ? 'white' : '#111',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {y.label}
          </button>
        ))}
      </div>

      <BarkodKameraInput
        value={aramaMetni}
        onChange={setAramaMetni}
        onScan={(kod) => setAramaMetni(normalizeAramaMetni(kod, aramaYontemi))}
        kameraEnabled={kameraAktif}
        disabled={!cikisLok}
        placeholder={aramaPlaceholder}
        containerStyle={{ marginBottom: 8 }}
      />

      {aramaLoading ? <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>Aranıyor...</div> : null}

      {aramaOneri?.length ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 12, overflow: 'hidden' }}>
          {aramaOneri.map((u) => (
            <button
              key={transferSonucKey(u)}
              type="button"
              onClick={() => void urunSec(u)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                border: 'none',
                borderBottom: '1px solid #f3f4f6',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                {u.ad}
                {u.tracking && u.tracking !== 'none' ? (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#92400e', backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>
                    Lot takipli
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {u.varyant} · Lot: {u.lotNo ?? '-'} · Stok: {u.stok ?? '-'}
              </div>
              <div style={{ marginTop: 4 }}>
                <span className={u.utsDurumu === 'ALINDI' ? 'uts-ok' : 'uts-wait'}>
                  UTS: {u.utsKodu ?? 'BEKLEMEDE'}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {lotSecimUrun ? (
        <div style={{ border: '1px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: '#fffbeb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#92400e' }}>
              Lot seçin: {lotSecimUrun.ad}
            </div>
            <button type="button" onClick={lotSecimIptal} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#92400e' }}>×</button>
          </div>
          <div style={{ fontSize: 12, color: '#78350f', marginBottom: 8 }}>
            {cikisLok} lokasyonundaki mevcut lot/seri kayıtları
          </div>
          {lotSecimLoading ? (
            <div style={{ fontSize: 13, color: '#6b7280' }}>Lotlar yükleniyor...</div>
          ) : lotSecimListe.length === 0 ? (
            <div style={{ fontSize: 13, color: '#ef4444' }}>Bu üründe {cikisLok} içinde stokta lot yok.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lotSecimListe.map((lot) => (
                <button
                  key={`${lotSecimUrun.id}-${lot.lotId ?? lot.lotNo ?? 'lot'}`}
                  type="button"
                  onClick={() => urunEkle({ ...lotSecimUrun, ...lot, ad: lotSecimUrun.ad, varyant: lotSecimUrun.varyant || lot.varyant })}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #fde68a',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Lot: {lot.lotNo ?? '-'}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    Miktar: {lot.stok ?? '-'} · UTS: {lot.utsKodu ?? lot.utsDurumu ?? 'BEKLEMEDE'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div style={{ marginTop: 8 }}>
        {urunler.map((u, idx) => (
          <div
            key={`${u.id}-${idx}`}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 10,
              marginBottom: 8,
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 800 }}>{u.ad}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {u.varyant} · Lot: {u.lotNo}
              </div>
              <div style={{ marginTop: 4 }}>
                <span className={u.utsDurumu === 'ALINDI' ? 'uts-ok' : 'uts-wait'}>
                  {u.utsDurumu === 'ALINDI' ? 'UTS OK' : 'UTS Beklemede'}
                </span>
                {u.kaynakFatura ? (
                  <span style={{ marginLeft: 8, fontSize: 11, color: '#6b7280' }}>İade: {u.kaynakFatura}</span>
                ) : null}
              </div>
            </div>
            <input
              type="number"
              min={1}
              value={u.adet}
              onChange={(e) => {
                const adet = Math.max(1, Number(e.target.value) || 1)
                setUrunler((prev) => prev.map((row, i) => (i === idx ? { ...row, adet } : row)))
              }}
              style={{ width: 70, padding: '8px', borderRadius: 6, border: '1px solid #e5e7eb' }}
            />
            <button type="button" onClick={() => urunSil(idx)} style={{ border: '1px solid #fca5a5', color: '#ef4444', background: '#fef2f2', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>
              Sil
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          {ozet.urun} ürün · {ozet.iade} iade faturası kesilecek · {ozet.utsBekleme} UTS beklemede
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              padding: '4px 10px',
              borderRadius: 999,
              backgroundColor: transferTipi?.kdv ? '#fef3c7' : '#dcfce7',
              color: transferTipi?.kdv ? '#92400e' : '#166534',
            }}
          >
            {transferTipi?.kdv ? 'KDV uygulanır' : 'KDV muaf'}
          </span>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void transferBaslat()}
            className="btn-kabul"
            style={{ opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? 'Gönderiliyor...' : 'Transferi Başlat'}
          </button>
        </div>
      </div>
    </div>
  )
}
