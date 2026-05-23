import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AxiosInstance } from 'axios'
import { apiClient } from '../api/client'
import { adminApi } from './admin/AdminLayout'

const PRIMARY = '#c0392b'

const CATEGORIES = [
  'Optik Cam',
  'Lens / Kontakt',
  'Çerçeve',
  'Güneş Gözlüğü',
  'Aksesuar',
  'Diğer',
] as const

type CategoryLabel = (typeof CATEGORIES)[number]

type OdooLocation = {
  id: number
  name: string
  complete_name?: string
}

type StockQuant = {
  id: number
  product_id: [number, string] | false
  location_id: [number, string] | false
  quantity: number
  reserved_quantity: number
  product_categ_id?: [number, string] | false
}

function m2oName(v: [number, string] | false | undefined): string {
  if (!v || !Array.isArray(v)) return '—'
  return v[1]
}

function AccordionSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: '1px solid #e5e7eb' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '10px 0',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 800,
          color: PRIMARY,
          textAlign: 'left',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ width: 14 }}>{open ? '∨' : '›'}</span>
        {title}
      </button>
      {open ? <div style={{ paddingBottom: 12 }}>{children}</div> : null}
    </div>
  )
}

export function StockQueryPanel({ variant = 'pos' }: { variant?: 'pos' | 'admin' }) {
  const isAdmin = variant === 'admin'
  const api: AxiosInstance = isAdmin ? adminApi : apiClient

  const [locations, setLocations] = useState<OdooLocation[]>([])
  const [locationId, setLocationId] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<CategoryLabel[]>([])
  const [onlyInStock, setOnlyInStock] = useState(true)
  const [includeReserved, setIncludeReserved] = useState(false)
  const [rows, setRows] = useState<StockQuant[]>([])
  const [loadingLoc, setLoadingLoc] = useState(true)
  const [loadingStock, setLoadingStock] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const [openSections, setOpenSections] = useState({
    arama: true,
    sube: true,
    kategori: true,
    diger: true,
  })

  useEffect(() => {
    setLoadingLoc(true)
    api
      .get('/admin/branches')
      .then((res) => {
        const data: OdooLocation[] = res.data?.data ?? []
        setLocations(data)
      })
      .catch((e: any) => {
        setError(e?.response?.data?.error ?? 'Lokasyonlar yüklenemedi')
      })
      .finally(() => setLoadingLoc(false))
  }, [api])

  const locationOptions = useMemo(() => {
    return [...locations].sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }, [locations])

  const displayRows = useMemo(() => {
    let list = rows
    const hasCategData = list.some((row) => Array.isArray(row.product_categ_id))
    if (selectedCategories.length > 0 && hasCategData) {
      list = list.filter((row) => {
        const categName = m2oName(row.product_categ_id)
        if (categName === '—') return false
        return selectedCategories.some((c) => categName.toLowerCase().includes(c.toLowerCase()))
      })
    }
    if (onlyInStock) {
      list = list.filter((row) => Number(row.quantity) > 0)
    }
    return list
  }, [rows, selectedCategories, onlyInStock])

  const fetchStock = useCallback(async () => {
    setLoadingStock(true)
    setError(null)
    setSearched(true)
    try {
      const params: Record<string, string> = {}
      if (locationId) params.locationId = locationId
      if (search.trim()) params.search = search.trim()
      if (selectedCategories.length > 0) params.categories = selectedCategories.join(',')
      if (!onlyInStock) params.inStockOnly = '0'
      const res = await api.get('/admin/stock', { params })
      if (!res.data?.success) {
        setError(res.data?.error ?? 'Stok yüklenemedi')
        setRows([])
        return
      }
      setRows(res.data.data ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Stok yüklenemedi')
      setRows([])
    } finally {
      setLoadingStock(false)
    }
  }, [api, locationId, search, selectedCategories, onlyInStock])

  function clearFilters() {
    setSearch('')
    setLocationId('')
    setSelectedCategories([])
    setOnlyInStock(true)
    setIncludeReserved(false)
    setRows([])
    setSearched(false)
    setError(null)
  }

  function toggleCategory(cat: CategoryLabel) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  const cardStyle: React.CSSProperties = isAdmin
    ? {
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
      }
    : {
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 13,
    boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, minHeight: 400 }}>
      {/* Sol filtre paneli */}
      <aside
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
          padding: '12px 16px 16px',
          backgroundColor: '#fafafa',
        }}
      >
        <AccordionSection
          title="ARAMA"
          open={openSections.arama}
          onToggle={() => setOpenSections((s) => ({ ...s, arama: !s.arama }))}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün adı ara..."
            style={inputStyle}
          />
        </AccordionSection>

        <AccordionSection
          title="ŞUBE / LOKASYON"
          open={openSections.sube}
          onToggle={() => setOpenSections((s) => ({ ...s, sube: !s.sube }))}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                cursor: 'pointer',
                color: !locationId ? PRIMARY : '#374151',
                fontWeight: !locationId ? 700 : 400,
              }}
            >
              <input
                type="radio"
                name="location"
                checked={!locationId}
                onChange={() => setLocationId('')}
                style={{ accentColor: PRIMARY }}
              />
              Tümü
            </label>
            {loadingLoc ? (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Yükleniyor...</span>
            ) : (
              locationOptions.map((loc) => (
                <label
                  key={loc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    cursor: 'pointer',
                    color: locationId === String(loc.id) ? PRIMARY : '#374151',
                    fontWeight: locationId === String(loc.id) ? 700 : 400,
                  }}
                >
                  <input
                    type="radio"
                    name="location"
                    checked={locationId === String(loc.id)}
                    onChange={() => setLocationId(String(loc.id))}
                    style={{ accentColor: PRIMARY }}
                  />
                  {loc.name}
                </label>
              ))
            )}
          </div>
        </AccordionSection>

        <AccordionSection
          title="KATEGORİ"
          open={openSections.kategori}
          onToggle={() => setOpenSections((s) => ({ ...s, kategori: !s.kategori }))}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CATEGORIES.map((cat) => (
              <label
                key={cat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  cursor: 'pointer',
                  color: selectedCategories.includes(cat) ? PRIMARY : '#374151',
                  fontWeight: selectedCategories.includes(cat) ? 600 : 400,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(cat)}
                  onChange={() => toggleCategory(cat)}
                  style={{ accentColor: PRIMARY }}
                />
                {cat}
              </label>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection
          title="DİĞER"
          open={openSections.diger}
          onToggle={() => setOpenSections((s) => ({ ...s, diger: !s.diger }))}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
                style={{ accentColor: PRIMARY }}
              />
              <span style={{ color: onlyInStock ? PRIMARY : '#374151' }}>Sadece stokta olanlar</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeReserved}
                onChange={(e) => setIncludeReserved(e.target.checked)}
                style={{ accentColor: PRIMARY }}
              />
              <span style={{ color: includeReserved ? PRIMARY : '#374151' }}>Rezerve dahil et</span>
            </label>
          </div>
        </AccordionSection>

        <button
          type="button"
          onClick={() => void fetchStock()}
          disabled={loadingStock}
          style={{
            width: '100%',
            marginTop: 12,
            padding: '12px',
            borderRadius: 10,
            border: 'none',
            backgroundColor: isAdmin ? '#1a1a2e' : PRIMARY,
            color: 'white',
            fontWeight: 800,
            fontSize: 14,
            cursor: loadingStock ? 'wait' : 'pointer',
            opacity: loadingStock ? 0.7 : 1,
          }}
        >
          {loadingStock ? 'Aranıyor...' : 'ARA'}
        </button>
        <button
          type="button"
          onClick={clearFilters}
          style={{
            width: '100%',
            marginTop: 8,
            padding: '8px',
            border: 'none',
            background: 'none',
            color: '#6b7280',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Filtreleri Temizle
        </button>
      </aside>

      {/* Sağ sonuç alanı */}
      <main style={{ flex: 1, padding: 16, minWidth: 0 }}>
        {searched && !loadingStock ? (
          <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
            {displayRows.length} sonuç bulundu
          </div>
        ) : null}

        {error ? <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p> : null}

        {loadingStock ? (
          <p style={{ color: '#6b7280' }}>Yükleniyor...</p>
        ) : searched && displayRows.length === 0 && !error ? (
          <p style={{ color: '#6b7280' }}>Stok kaydı bulunamadı.</p>
        ) : null}

        {!loadingStock && displayRows.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayRows.map((row) => {
              const qty = Number(row.quantity) || 0
              const reserved = Number(row.reserved_quantity) || 0
              const available = includeReserved ? qty : qty - reserved
              const stockColor = qty > 0 ? '#166534' : '#991b1b'
              const stockBg = qty > 0 ? '#dcfce7' : '#fee2e2'

              return (
                <div
                  key={row.id}
                  style={{
                    ...cardStyle,
                    marginBottom: 0,
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: isAdmin ? '#111' : PRIMARY }}>
                      {m2oName(row.product_id)}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{m2oName(row.location_id)}</div>
                    {includeReserved && reserved > 0 ? (
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Rezerve: {reserved}</div>
                    ) : null}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '6px 12px',
                        borderRadius: 999,
                        fontWeight: 800,
                        fontSize: 14,
                        backgroundColor: stockBg,
                        color: stockColor,
                      }}
                    >
                      {qty}
                    </span>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, fontWeight: 600 }}>
                      Kullanılabilir: {available}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {!searched && !loadingStock ? (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>Stok listesi için filtre seçip ARA&apos;ya basın.</p>
        ) : null}
      </main>
    </div>
  )
}

export default function StokSorgulaPage() {
  return (
    <div>
      <h1 style={{ margin: '0 0 20px', fontSize: 24, fontWeight: 900, color: PRIMARY }}>Stok Sorgula</h1>
      <StockQueryPanel variant="pos" />
    </div>
  )
}
