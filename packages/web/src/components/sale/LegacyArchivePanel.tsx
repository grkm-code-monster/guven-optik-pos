import { useEffect, useState } from 'react'
import {
  getLegacyCustomerDetail,
  promoteLegacyCustomer,
  searchLegacyCustomers,
  type LegacyCustomerDetail,
  type LegacyCustomerSearchHit,
} from '../../api/customers.api'

function formatDate(v: string | Date | null | undefined) {
  if (!v) return '-'
  return new Date(v).toLocaleDateString('tr-TR')
}

function formatMoney(v: unknown) {
  const n = Number(v)
  if (Number.isNaN(n)) return '-'
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
}

function rxSummary(rx: LegacyCustomerDetail['prescriptions'][number]) {
  const parts: string[] = []
  if (rx.r_sph != null || rx.r_cyl != null) parts.push(`R: ${rx.r_sph ?? '—'}/${rx.r_cyl ?? '—'}`)
  if (rx.l_sph != null || rx.l_cyl != null) parts.push(`L: ${rx.l_sph ?? '—'}/${rx.l_cyl ?? '—'}`)
  return parts.join(' · ') || 'Reçete'
}

type LegacyArchiveSearchProps = {
  query: string
  enabled: boolean
  onPromoted: (customer: any) => void
  onError?: (message: string) => void
}

export function LegacyArchiveSearchResults({
  query,
  enabled,
  onPromoted,
  onError,
}: LegacyArchiveSearchProps) {
  const [legacyResults, setLegacyResults] = useState<LegacyCustomerSearchHit[]>([])
  const [legacyLoading, setLegacyLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailById, setDetailById] = useState<Record<string, LegacyCustomerDetail>>({})
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const [promoteLoadingId, setPromoteLoadingId] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<{
    legacyId: string
    mevcutMusteri: { id: string; name: string; phone: string; identityNo?: string | null }
  } | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLegacyResults([])
      setExpandedId(null)
      setDuplicate(null)
      return
    }
    const t = setTimeout(() => {
      setLegacyLoading(true)
      searchLegacyCustomers(query.trim())
        .then(setLegacyResults)
        .catch((e: any) => onError?.(e?.response?.data?.message ?? 'Arşiv araması başarısız'))
        .finally(() => setLegacyLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [query, enabled, onError])

  async function loadDetail(id: string) {
    if (detailById[id]) return detailById[id]
    setDetailLoadingId(id)
    try {
      const detail = await getLegacyCustomerDetail(id)
      setDetailById((prev) => ({ ...prev, [id]: detail }))
      return detail
    } finally {
      setDetailLoadingId(null)
    }
  }

  async function toggleDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    await loadDetail(id)
  }

  async function handlePromote(legacyId: string, opts?: { force?: boolean; mevcutMusteriId?: string }) {
    setPromoteLoadingId(legacyId)
    setDuplicate(null)
    try {
      const res = await promoteLegacyCustomer(legacyId, opts)
      if (res.possibleDuplicate && res.mevcutMusteri) {
        setDuplicate({ legacyId, mevcutMusteri: res.mevcutMusteri })
        return
      }
      if (res.customer) {
        onPromoted(res.customer)
      }
    } catch (e: any) {
      onError?.(e?.response?.data?.message ?? 'Güncel kayda dönüştürme başarısız')
    } finally {
      setPromoteLoadingId(null)
    }
  }

  if (!enabled) return null

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 8 }}>
        📜 SİBER OPTİK ARŞİVİ
      </div>
      {legacyLoading ? (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Arşivde aranıyor...</div>
      ) : legacyResults.length === 0 ? (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Arşivde de sonuç bulunamadı.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {legacyResults.map((row) => {
            const expanded = expandedId === row.id
            const detail = detailById[row.id]
            return (
              <div
                key={row.id}
                style={{
                  border: '1px solid #fcd34d',
                  borderRadius: 10,
                  padding: '10px 12px',
                  backgroundColor: '#fffbeb',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: '#111' }}>{row.name}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: '#92400e',
                          background: '#fef3c7',
                          borderRadius: 999,
                          padding: '2px 8px',
                        }}
                      >
                        ARŞİV KAYDI
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{row.telefon || 'Telefon yok'}</div>
                    <div style={{ fontSize: 11, color: '#78716c', marginTop: 4 }}>
                      {row.kaynakSube ? `${row.kaynakSube} · ` : ''}
                      {row.saleCount} satış
                      {row.lastSaleAt ? ` · son: ${formatDate(row.lastSaleAt)}` : ''}
                      {row.prescriptionCount ? ` · ${row.prescriptionCount} reçete` : ''}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => void toggleDetail(row.id)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      background: 'white',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {expanded ? 'Detayı gizle' : 'Detayları gör'}
                  </button>
                  <button
                    type="button"
                    disabled={promoteLoadingId === row.id}
                    onClick={() => void handlePromote(row.id)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#C8102E',
                      color: 'white',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      opacity: promoteLoadingId === row.id ? 0.7 : 1,
                    }}
                  >
                    {promoteLoadingId === row.id ? 'Ekleniyor...' : 'Güncel müşteri olarak ekle'}
                  </button>
                </div>

                {expanded ? (
                  <div style={{ marginTop: 10, borderTop: '1px solid #fde68a', paddingTop: 10 }}>
                    {detailLoadingId === row.id ? (
                      <div style={{ fontSize: 12, color: '#6b7280' }}>Detay yükleniyor...</div>
                    ) : detail ? (
                      <LegacyArchiveDetailView detail={detail} compact />
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {duplicate ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            border: '1px solid #fca5a5',
            background: '#fef2f2',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, color: '#991b1b', marginBottom: 6 }}>
            Olası mükerrer kayıt
          </div>
          <div style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 10 }}>
            {duplicate.mevcutMusteri.name} ({duplicate.mevcutMusteri.phone}) zaten sistemde kayıtlı.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={promoteLoadingId === duplicate.legacyId}
              onClick={() =>
                void handlePromote(duplicate.legacyId, { mevcutMusteriId: duplicate.mevcutMusteri.id })
              }
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #991b1b',
                background: 'white',
                color: '#991b1b',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Mevcut kayda bağla
            </button>
            <button
              type="button"
              disabled={promoteLoadingId === duplicate.legacyId}
              onClick={() => void handlePromote(duplicate.legacyId, { force: true })}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: '#991b1b',
                color: 'white',
                fontWeight: 800,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Yine de yeni kayıt aç
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function LegacyArchiveDetailView({
  detail,
  compact = false,
}: {
  detail: LegacyCustomerDetail
  compact?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!compact ? (
        <div style={{ fontSize: 13, color: '#444' }}>
          <div><strong>Ad Soyad:</strong> {detail.name}</div>
          <div><strong>Telefon:</strong> {detail.telefon || '-'}</div>
          <div><strong>TC:</strong> {detail.tcKimlikNo || '-'}</div>
          <div><strong>Şube:</strong> {detail.kaynakSube || '-'}</div>
          <div><strong>Adres:</strong> {detail.adres || '-'}</div>
        </div>
      ) : null}

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>SATIŞ GEÇMİŞİ</div>
        {detail.sales.length === 0 ? (
          <div style={{ fontSize: 12, color: '#6b7280' }}>Satış kaydı yok</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {detail.sales.map((sale) => (
              <div key={sale.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: 'white' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#111' }}>
                  {formatDate(sale.tarih)} · {formatMoney(sale.toplamTutar)}
                  {sale.subeKodu ? ` · Şube ${sale.subeKodu}` : ''}
                </div>
                {sale.items.map((item) => (
                  <div key={item.id} style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    {item.urunAdi || 'Ürün'} · {item.miktar ?? '-'} ad · {formatMoney(item.fiyat)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>REÇETE GEÇMİŞİ</div>
        {detail.prescriptions.length === 0 ? (
          <div style={{ fontSize: 12, color: '#6b7280' }}>Reçete kaydı yok</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detail.prescriptions.map((rx) => (
              <div key={rx.id} style={{ fontSize: 12, color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, background: 'white' }}>
                <strong>{formatDate(rx.tarih)}</strong> · {rxSummary(rx)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function LegacyArchiveHistorySection({ legacyCustomerId }: { legacyCustomerId: string }) {
  const [detail, setDetail] = useState<LegacyCustomerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getLegacyCustomerDetail(legacyCustomerId)
      .then(setDetail)
      .catch((e: any) => setError(e?.response?.data?.message ?? 'Geçmiş kayıtlar yüklenemedi'))
      .finally(() => setLoading(false))
  }, [legacyCustomerId])

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e', marginBottom: 12 }}>📜 Geçmiş Kayıtlar</div>
      {loading ? <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div> : null}
      {error ? <div style={{ fontSize: 13, color: '#991b1b' }}>{error}</div> : null}
      {detail ? <LegacyArchiveDetailView detail={detail} /> : null}
    </div>
  )
}
