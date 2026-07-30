import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../api/client'
import {
  eticaretSiparisiKargoyaVer,
  getEticaretSiparisler,
  type EticaretSiparis,
} from '../api/eticaret.api'
import { downloadKargoCiktisiPdf } from '../utils/kargoCiktisiPdf'

const PRIMARY = '#8B0000'
const ACCENT = '#c0392b'

type DurumFilter = 'AKTIF' | 'TUMU' | string

const DURUM_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  YENI: { label: 'Yeni', bg: '#dbeafe', color: '#1e40af' },
  SUBE_SECILDI: { label: 'Şube Seçiliyor', bg: '#fef9c3', color: '#854d0e' },
  HAZIRLANIYOR: { label: 'Hazırlanıyor', bg: '#ffedd5', color: '#9a3412' },
  KARGOYA_VERILDI: { label: 'Kargoya Verildi', bg: '#dcfce7', color: '#166534' },
  STOK_YOK: { label: 'Stok Yok', bg: '#fee2e2', color: '#991b1b' },
  HATA: { label: 'Hata', bg: '#fee2e2', color: '#991b1b' },
}

const FILTER_PILLS: Array<{ id: DurumFilter; label: string }> = [
  { id: 'AKTIF', label: 'Aktif (Hazırlanacak)' },
  { id: 'KARGOYA_VERILDI', label: 'Kargoya Verildi' },
  { id: 'TUMU', label: 'Tümü' },
]

function durumBadge(durum: string) {
  const d = DURUM_BADGE[durum] ?? { label: durum, bg: '#f3f4f6', color: '#374151' }
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        backgroundColor: d.bg,
        color: d.color,
      }}
    >
      {d.label}
    </span>
  )
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR')
  } catch {
    return iso
  }
}

function itemLabel(item: { odooProductName?: string | null; product?: { name?: string | null } | null }) {
  return item.odooProductName || item.product?.name || 'Ürün'
}

export default function EticaretPage() {
  const [siparisler, setSiparisler] = useState<EticaretSiparis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<DurumFilter>('AKTIF')
  const [kargoModal, setKargoModal] = useState<EticaretSiparis | null>(null)
  const [kargoTakipNo, setKargoTakipNo] = useState('')
  const [saving, setSaving] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = filter === 'TUMU' || filter === 'AKTIF' ? undefined : { durum: filter }
      const data = await getEticaretSiparisler(params)
      setSiparisler(data)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Siparişler yüklenemedi')
      setSiparisler([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const visible = siparisler.filter((s) => {
    if (filter === 'AKTIF') return s.durum === 'HAZIRLANIYOR' || s.durum === 'SUBE_SECILDI'
    return true
  })

  function kargoCiktisiYazdir(s: EticaretSiparis) {
    const items = (s.sale?.items ?? []).map((it) => ({ ad: itemLabel(it), adet: it.qty }))
    void downloadKargoCiktisiPdf({
      partnerSiparisNo: s.partnerSiparisNo,
      referansNo: s.sale?.referansNo,
      musteriAdSoyad: s.musteriAdSoyad,
      musteriTelefon: s.musteriTelefon,
      musteriAdres: s.musteriAdres,
      musteriIl: s.musteriIl,
      musteriIlce: s.musteriIlce,
      items,
    })
  }

  async function eFaturaGoster(s: EticaretSiparis) {
    if (!s.sale?.id) return
    try {
      const res = await apiClient.get(`/sales/${s.sale.id}/fatura-pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.message ?? 'Fatura henüz hazır değil.' })
    }
  }

  function kargoyaVerAc(s: EticaretSiparis) {
    setKargoModal(s)
    setKargoTakipNo('')
    setMesaj(null)
  }

  async function kargoyaVerOnayla() {
    if (!kargoModal) return
    setSaving(true)
    setMesaj(null)
    try {
      await eticaretSiparisiKargoyaVer(kargoModal.id, kargoTakipNo.trim() || undefined)
      setMesaj({ tip: 'ok', text: 'Sipariş kargoya verildi olarak işaretlendi.' })
      setKargoModal(null)
      setKargoTakipNo('')
      await load()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.message ?? 'Durum güncellenemedi.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${PRIMARY} 0%, #5c0000 100%)`,
          padding: '28px 24px',
          borderRadius: '0 0 24px 24px',
          margin: '-16px -16px 24px',
          color: '#fff',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>E-Ticaret</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>
          Şubenize düşen e-ticaret siparişlerini kargoya hazırlayın
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTER_PILLS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFilter(p.id)}
            style={{
              padding: '10px 16px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: filter === p.id ? 800 : 600,
              border: filter === p.id ? `2px solid ${ACCENT}` : '1px solid #e5e7eb',
              backgroundColor: filter === p.id ? '#fff5f5' : 'white',
              color: filter === p.id ? ACCENT : '#374151',
              cursor: 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            padding: '10px 16px',
            borderRadius: 999,
            border: 'none',
            backgroundColor: ACCENT,
            color: 'white',
            fontWeight: 800,
            fontSize: 13,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          Yenile
        </button>
      </div>

      {mesaj ? (
        <p style={{ color: mesaj.tip === 'ok' ? '#166534' : '#ef4444', fontSize: 13, marginBottom: 12 }}>{mesaj.text}</p>
      ) : null}
      {error ? <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p> : null}
      {loading ? <p style={{ color: '#6b7280' }}>Yükleniyor...</p> : null}
      {!loading && visible.length === 0 ? <p style={{ color: '#6b7280' }}>Gösterilecek sipariş yok.</p> : null}

      {!loading && visible.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
          {visible.map((s) => (
            <div
              key={s.id}
              style={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderLeft: `4px solid ${DURUM_BADGE[s.durum]?.color ?? '#9ca3af'}`,
                borderRadius: 12,
                padding: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 15, color: ACCENT }}>{s.musteriAdSoyad}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.musteriTelefon || '—'}</div>
                </div>
                {durumBadge(s.durum)}
              </div>

              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
                Sipariş No: {s.partnerSiparisNo} · {fmtDate(s.createdAt)}
              </div>

              <div style={{ marginTop: 10, fontSize: 13, color: '#374151' }}>
                {(s.sale?.items ?? []).map((it) => (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span>{itemLabel(it)}</span>
                    <span style={{ fontWeight: 700 }}>× {it.qty}</span>
                  </div>
                ))}
              </div>

              {s.hataNotu ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b', backgroundColor: '#fef2f2', padding: '6px 8px', borderRadius: 6 }}>
                  {s.hataNotu}
                </div>
              ) : null}

              {s.kargoTakipNo ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#166534' }}>
                  Kargo Takip No: <strong>{s.kargoTakipNo}</strong>
                </div>
              ) : null}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={() => kargoCiktisiYazdir(s)}
                  disabled={!s.sale}
                  style={{
                    flex: '1 1 auto',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fafafa',
                    color: '#374151',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: s.sale ? 'pointer' : 'not-allowed',
                    opacity: s.sale ? 1 : 0.5,
                  }}
                >
                  📦 Kargo Çıktısı
                </button>
                <button
                  type="button"
                  onClick={() => void eFaturaGoster(s)}
                  disabled={!s.sale || s.sale.eFaturaDurum !== 'GONDERILDI'}
                  style={{
                    flex: '1 1 auto',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fafafa',
                    color: '#374151',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: s.sale?.eFaturaDurum === 'GONDERILDI' ? 'pointer' : 'not-allowed',
                    opacity: s.sale?.eFaturaDurum === 'GONDERILDI' ? 1 : 0.5,
                  }}
                  title={s.sale?.eFaturaDurum !== 'GONDERILDI' ? 'e-Fatura henüz hazır değil' : ''}
                >
                  🧾 E-Fatura
                </button>
                {s.durum === 'HAZIRLANIYOR' ? (
                  <button
                    type="button"
                    onClick={() => kargoyaVerAc(s)}
                    style={{
                      flex: '1 1 100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: '#059669',
                      color: 'white',
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Kargoya Verildi
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {kargoModal ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100,
          }}
        >
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 900 }}>Kargoya Ver</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              <strong>{kargoModal.musteriAdSoyad}</strong> — kargo takip numarası (isteğe bağlı)
            </p>
            <input
              value={kargoTakipNo}
              onChange={(e) => setKargoTakipNo(e.target.value)}
              placeholder="Kargo takip no"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setKargoModal(null)}
                disabled={saving}
                style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', fontWeight: 700, cursor: 'pointer' }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void kargoyaVerOnayla()}
                disabled={saving}
                style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', backgroundColor: '#059669', color: 'white', fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}
              >
                {saving ? 'Kaydediliyor...' : 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
