import { useEffect, useState, type CSSProperties } from 'react'
import { searchTransferProducts, type TransferUrun } from '../../api/transfer.api'
import { addItem, deleteItem, getSaleById, updateItem } from '../../api/sales.api'
import { getAktifLokasyon } from '../../utils/aktifLokasyon'
import {
  DIREKT_KATEGORI_ID,
  getKategoriTreeRoot,
  hasKategoriTree,
  isKategoriLeaf,
  type KategoriNode,
} from './saleKategoriTree'
import type { ItemType } from './saleKategoriTree.types'

const ARAMA_YONTEMLERI = [
  { id: 'barkod', label: 'Barkod' },
  { id: 'uts', label: 'UTS kodu' },
  { id: 'lot', label: 'Lot/Seri' },
  { id: 'ad', label: 'Ürün adı' },
] as const

const typeCards: Array<{ type: ItemType; title: string; icon: string }> = [
  { type: 'FRAME', title: 'Optik Çerçeve', icon: '🕶' },
  { type: 'SUN', title: 'Güneş Gözlüğü', icon: '☀️' },
  { type: 'LENS', title: 'Cam', icon: '👁' },
  { type: 'CONTACT', title: 'Lens', icon: '🔍' },
  { type: 'SOLUTION', title: 'Solüsyon', icon: '💧' },
  { type: 'ACCESSORY', title: 'Aksesuar', icon: '✨' },
]

type PickedProduct = {
  odooVariantId: string
  ad: string
  varyant: string
  fiyat?: number | null
  lotNo?: string | null
  name: string
  price: string
}

function money(v?: string | number | null) {
  if (v == null || v === '') return '-'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
}

function buildSearchUrl(q: string, yontem: string, lokasyon: string, kategoriId?: number | null) {
  const params = new URLSearchParams({
    q,
    yontem,
    lokasyon,
  })
  if (kategoriId != null) params.set('kategoriId', String(kategoriId))
  return `/api/transfer/urun-ara?${params.toString()}`
}

export default function ItemsStep({
  saleId,
  items,
  onSaleUpdated,
}: {
  saleId: string
  items: any[]
  onSaleUpdated: (sale: any) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [pickedType, setPickedType] = useState<(typeof typeCards)[number] | null>(null)
  const [pickedKategoriId, setPickedKategoriId] = useState<number | null>(null)
  const [pickedKategoriLabel, setPickedKategoriLabel] = useState<string | null>(null)
  const [catStack, setCatStack] = useState<KategoriNode[][]>([])
  const [catPath, setCatPath] = useState<string[]>([])

  const [q, setQ] = useState('')
  const [aramaYontemi, setAramaYontemi] = useState<string>('ad')
  const [searchResults, setSearchResults] = useState<TransferUrun[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [pickedProduct, setPickedProduct] = useState<PickedProduct | null>(null)

  const [qty, setQty] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [discount, setDiscount] = useState('0')

  const [error, setError] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<any | null>(null)

  useEffect(() => {
    if (!modalOpen || step !== 3) return
    const term = q.trim()
    if (term.length < 1) {
      setSearchResults([])
      return
    }
    if (pickedKategoriId == null) return

    const lokasyon = getAktifLokasyon()
    const url = buildSearchUrl(term, aramaYontemi, lokasyon, pickedKategoriId)
    console.log('[search] fetching:', url)

    const t = setTimeout(() => {
      setProductsLoading(true)
      setError(null)
      searchTransferProducts({
        q: term,
        yontem: aramaYontemi,
        lokasyon,
        kategoriId: pickedKategoriId,
      })
        .then((data) => {
          console.log('[search] results:', data)
          const rows = Array.isArray(data) ? data : []
          setSearchResults(rows)
          console.log('[search] state updated:', rows.length)
        })
        .catch((e: any) => {
          console.error('[search] error:', e)
          setError(e?.response?.data?.message ?? e?.response?.data?.detail ?? 'Ürünler alınamadı')
          setSearchResults([])
          console.log('[search] state updated:', 0)
        })
        .finally(() => setProductsLoading(false))
    }, 300)

    return () => clearTimeout(t)
  }, [modalOpen, step, q, aramaYontemi, pickedKategoriId])

  function resetModalState() {
    setStep(1)
    setPickedType(null)
    setPickedKategoriId(null)
    setPickedKategoriLabel(null)
    setCatStack([])
    setCatPath([])
    setQ('')
    setAramaYontemi('ad')
    setSearchResults([])
    setPickedProduct(null)
    setQty('1')
    setUnitPrice('')
    setDiscount('0')
    setError(null)
    setEditingItem(null)
  }

  function open() {
    resetModalState()
    setModalOpen(true)
  }

  function close() {
    setModalOpen(false)
  }

  function onTypePicked(t: (typeof typeCards)[number]) {
    setPickedType(t)
    setPickedKategoriLabel(null)
    setPickedKategoriId(null)
    setCatStack([])
    setCatPath([])
    setQ('')
    setSearchResults([])

    const directId = DIREKT_KATEGORI_ID[t.type]
    if (directId != null) {
      setPickedKategoriId(directId)
      setStep(3)
      return
    }
    if (hasKategoriTree(t.type)) {
      setCatStack([getKategoriTreeRoot(t.type)])
      setStep(2)
      return
    }
    setStep(3)
  }

  function onCategoryNodePicked(node: KategoriNode) {
    if (isKategoriLeaf(node)) {
      const path = [...catPath, node.label]
      setPickedKategoriId(node.kategoriId)
      setPickedKategoriLabel(path.join(' · '))
      setQ('')
      setSearchResults([])
      setStep(3)
      return
    }
    setCatStack((prev) => [...prev, node.children])
    setCatPath((prev) => [...prev, node.label])
  }

  function categoryNavBack() {
    if (catStack.length <= 1) {
      setCatStack([])
      setCatPath([])
      setPickedKategoriId(null)
      setStep(1)
      return
    }
    setCatStack((prev) => prev.slice(0, -1))
    setCatPath((prev) => prev.slice(0, -1))
  }

  function searchNavBack() {
    if (pickedType && hasKategoriTree(pickedType.type) && catStack.length > 0) {
      setStep(2)
      return
    }
    setStep(1)
  }

  const currentCatOptions = catStack.length ? catStack[catStack.length - 1] : []

  function pickSearchResult(u: TransferUrun) {
    const product: PickedProduct = {
      odooVariantId: String(u.id),
      ad: u.ad,
      varyant: u.varyant ?? '',
      fiyat: u.fiyat,
      lotNo: u.lotNo,
      name: [u.ad, u.varyant].filter(Boolean).join(' / '),
      price: String(u.fiyat ?? '0'),
    }
    setPickedProduct(product)
    setUnitPrice(product.price)
    setStep(4)
  }

  function toDecimalString(v: string | number | null | undefined): string {
    const s = String(v ?? '').trim().replace(',', '.')
    if (!s) return '0'
    const n = Number(s)
    if (!Number.isFinite(n)) return '0'
    return /^-?\d+(\.\d+)?$/.test(s) ? s : String(n)
  }

  async function save() {
    if (!pickedProduct) return
    setError(null)
    try {
      const variantId = String(pickedProduct.odooVariantId).replace(/^odoo_/, '')
      const payload: Record<string, unknown> = {
        productId: `odoo_${variantId}`,
        odooProductId: variantId,
        odooProductName: pickedProduct.name,
        lotNo: pickedProduct.lotNo || null,
        qty: Math.max(1, Number(qty || 1)),
        unitPrice: toDecimalString(unitPrice || pickedProduct.price),
        discount: toDecimalString(discount || '0'),
      }
      if (pickedKategoriId != null) {
        payload.odooCategoryId = pickedKategoriId
      }
      if (pickedType?.type === 'LENS') {
        payload.linkType = editingItem?.linkType ?? 'CUSTOMER_FRAME'
        if (editingItem?.linkedItemId) payload.linkedItemId = editingItem.linkedItemId
      }

      console.log('[addItem] payload:', payload)

      if (editingItem?.id) {
        await updateItem(saleId, editingItem.id, payload as any)
      } else {
        await addItem(saleId, payload as any)
      }
      const updated = await getSaleById(saleId)
      onSaleUpdated(updated)
      close()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Kalem eklenemedi')
    }
  }

  function openEdit(item: any) {
    setModalOpen(true)
    setEditingItem(item)
    setError(null)
    const matchedType = typeCards.find((t) => t.type === item?.product?.category) ?? typeCards[0]
    setPickedType(matchedType)
    setPickedProduct({
      odooVariantId: String(item?.product?.odooId ?? item?.productId ?? ''),
      ad: item?.product?.name ?? '',
      varyant: '',
      name: item?.product?.name ?? '',
      price: String(item?.unitPrice ?? item?.product?.price ?? '0'),
    })
    setQty(String(item?.qty ?? 1))
    setUnitPrice(String(item?.unitPrice ?? item?.product?.price ?? ''))
    setDiscount(String(item?.discount ?? '0'))
    setStep(4)
  }

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontWeight: 800 }}>Kalemler</div>
        <button
          type="button"
          onClick={open}
          style={{
            backgroundColor: '#C8102E',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            padding: '10px 14px',
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          + Kalem Ekle
        </button>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.length === 0 ? <div style={{ fontSize: '13px', color: '#6b7280' }}>Henüz kalem yok.</div> : null}
        {items.map((it) => (
          <div
            key={it.id}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#111', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {(() => {
                  const urunAdi =
                    it.odooProductName ||
                    (it.product?.name !== '__ODOO_PLACEHOLDER__' ? it.product?.name : null) ||
                    'Odoo Ürünü'
                  return urunAdi
                })()}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={() => openEdit(it)} style={editBtnStyle}>
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = window.confirm('Bu kalemi silmek istediğinize emin misiniz?')
                    if (!ok) return
                    try {
                      await deleteItem(saleId, it.id)
                      const updated = await getSaleById(saleId)
                      onSaleUpdated(updated)
                    } catch (e: any) {
                      setError(e?.response?.data?.message ?? 'Kalem silinemedi')
                    }
                  }}
                  style={deleteBtnStyle}
                >
                  Sil
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, alignItems: 'end' }}>
              <div style={{ fontSize: 12, color: '#111' }}>
                <span style={{ fontWeight: 800 }}>Adet:</span> {it.qty}
              </div>
              <div style={{ fontSize: 12, color: '#111' }}>
                <span style={{ fontWeight: 800 }}>Liste:</span> {money(it.unitPrice)}
              </div>
              <div style={{ fontSize: 12, color: '#111' }}>
                <span style={{ fontWeight: 800 }}>İndirim:</span> {money(it.discount)}
              </div>
              <div style={{ fontSize: 12, color: '#111', textAlign: 'right' }}>
                <span style={{ fontWeight: 900, fontSize: 16 }}>Tutar: {money(it.lineTotal)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modalOpen ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <div style={{ fontWeight: 900 }}>{editingItem ? 'Kalem Düzenle' : 'Kalem Ekle'}</div>
              <button type="button" onClick={close} style={ghostBtnStyle}>
                Kapat
              </button>
            </div>

            {error ? <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px' }}>{error}</div> : null}

            {step === 1 ? (
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px', fontWeight: 700 }}>Adım 1 — Ürün tipi seç</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {typeCards.map((t) => (
                    <button key={t.type} type="button" onClick={() => onTypePicked(t)} style={typeCardStyle}>
                      <div style={{ fontSize: '18px', fontWeight: 900 }}>
                        {t.icon} {t.title}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {step === 2 && pickedType ? (
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px', fontWeight: 700 }}>
                  Adım 2 — Alt kategori ({pickedType.title})
                  {catPath.length ? ` · ${catPath.join(' › ')}` : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {currentCatOptions.map((node) => (
                    <button
                      key={node.label}
                      type="button"
                      onClick={() => onCategoryNodePicked(node)}
                      style={typeCardStyle}
                    >
                      <span style={{ fontWeight: 800 }}>{node.label}</span>
                      {!isKategoriLeaf(node) ? <span style={{ color: '#9ca3af' }}> ›</span> : null}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: '10px' }}>
                  <button type="button" onClick={categoryNavBack} style={ghostBtnStyle}>
                    Geri
                  </button>
                </div>
              </div>
            ) : null}

            {step === 3 && pickedType ? (
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px', fontWeight: 700 }}>
                  Adım 3 — Ürün ara ({pickedType.title}
                  {pickedKategoriLabel ? ` · ${pickedKategoriLabel}` : ''}) · {getAktifLokasyon()}
                  {pickedKategoriId != null ? ` · kategori #${pickedKategoriId}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {ARAMA_YONTEMLERI.map((y) => (
                    <button
                      key={y.id}
                      type="button"
                      onClick={() => setAramaYontemi(y.id)}
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
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="En az 1 karakter ara..."
                  style={inputStyle}
                />
                <div style={{ marginTop: '10px', maxHeight: '320px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {productsLoading ? <div style={{ fontSize: '13px', color: '#6b7280' }}>Aranıyor...</div> : null}
                  {!productsLoading && q.trim().length >= 1 && searchResults.length === 0 ? (
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>Sonuç bulunamadı.</div>
                  ) : null}
                  {searchResults.map((u) => (
                    <div key={String(u.id)} style={resultCardStyle}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: '14px' }}>{u.ad}</div>
                        {u.varyant ? (
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>Varyant: {u.varyant}</div>
                        ) : null}
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                          {u.fiyat != null ? <>Fiyat: {money(u.fiyat)}</> : null}
                          {u.lotNo ? <> · Lot: {u.lotNo}</> : null}
                        </div>
                      </div>
                      <button type="button" onClick={() => pickSearchResult(u)} style={primaryBtnStyle}>
                        Seç
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '10px' }}>
                  <button type="button" onClick={searchNavBack} style={ghostBtnStyle}>
                    Geri
                  </button>
                </div>
              </div>
            ) : null}

            {step === 4 && pickedProduct ? (
              <div style={{ marginTop: '14px' }}>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px', fontWeight: 700 }}>
                  Adım 4 — Miktar / Fiyat ({pickedProduct.name})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <Field label="Adet" value={qty} onChange={setQty} />
                  <Field label="Birim Fiyat" value={unitPrice} onChange={setUnitPrice} />
                  <Field label="İndirim (opsiyonel)" value={discount} onChange={setDiscount} />
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => (editingItem ? close() : setStep(3))} style={{ ...ghostBtnStyle, flex: 1 }}>
                    Geri
                  </button>
                  <button type="button" onClick={() => void save()} style={{ ...primaryBtnStyle, flex: 1, padding: '12px 14px' }}>
                    Kaydet
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
        {label}
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  )
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  zIndex: 50,
}

const modalStyle: CSSProperties = {
  width: '100%',
  maxWidth: '720px',
  backgroundColor: 'white',
  borderRadius: '14px',
  border: '1px solid #e5e7eb',
  boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
  padding: '16px',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: '10px',
  fontSize: '14px',
  outline: 'none',
}

const typeCardStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '14px',
  cursor: 'pointer',
  textAlign: 'left',
  backgroundColor: 'white',
}

const resultCardStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '12px',
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
}

const primaryBtnStyle: CSSProperties = {
  backgroundColor: '#C8102E',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '10px 12px',
  cursor: 'pointer',
  fontWeight: 800,
}

const ghostBtnStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  backgroundColor: '#f3f4f6',
  borderRadius: '10px',
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 700,
}

const editBtnStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  backgroundColor: 'white',
  fontWeight: 700,
}

const deleteBtnStyle: CSSProperties = {
  border: '1px solid #fca5a5',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  color: '#ef4444',
  backgroundColor: '#fef2f2',
  fontWeight: 800,
}
