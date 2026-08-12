import { useEffect, useState, type CSSProperties } from 'react'
import { searchTransferProducts, type TransferUrun } from '../../api/transfer.api'
import { addItem, deleteItem, getSaleById, hesaplaPersonelFiyati, updateItem } from '../../api/sales.api'
import { apiClient } from '../../api/client'
import { useAuthStore } from '../../store/auth.store'
import BarkodKameraInput from '../BarkodKameraInput'
import { getAktifLokasyon } from '../../utils/aktifLokasyon'
import { isGs1DataMatrix, parseGs1DataMatrix } from '../../utils/parseGs1DataMatrix'
import {
  BAKIM_KATEGORI_ID,
  DIREKT_KATEGORI_ID,
  getKategoriTreeRoot,
  hasKategoriTree,
  isKategoriLeaf,
  MULTI_KATEGORI_IDS,
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
  { type: 'FRAME', title: 'Optik Gözlük', icon: '🕶' },
  { type: 'SUN', title: 'Güneş Gözlüğü', icon: '☀️' },
  { type: 'CONTACT', title: 'Lens', icon: '🔍' },
  { type: 'SOLUTION', title: 'Solüsyon', icon: '💧' },
  { type: 'ACCESSORY', title: 'Aksesuar', icon: '✨' },
  { type: 'MAINTENANCE', title: 'Bakım', icon: '🔧' },
]

const lensTypeCard = { type: 'LENS' as const, title: 'Cam', icon: '👁' }

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

const STOK_CAM_KATEGORI_IDS = [35, 36, 37, 39, 40, 41]
const KONTAKT_LENS_KATEGORI_IDS = [46, 47, 48, 49, 50]

function parseStokCamSph(urunAdi: string): number | null {
  const m = urunAdi.match(/(-?\d{4})\s+(-?0?\d{3,4})/)
  if (!m) return null
  return parseInt(m[1], 10) / 100
}

function parseStokCamCyl(urunAdi: string): number | null {
  const m = urunAdi.match(/(-?\d{4})\s+(-?0?\d{3,4})/)
  if (!m) return null
  return parseInt(m[2], 10) / 100
}

function transpozHesapla(sph: number, cyl: number, aks: number): { sph: number; cyl: number; aks: number } {
  const yeniSph = Math.round((sph + cyl) * 100) / 100
  const yeniCyl = Math.round(-cyl * 100) / 100
  const yeniAks = aks > 90 ? aks - 90 : aks + 90
  return { sph: yeniSph, cyl: yeniCyl, aks: yeniAks }
}

type OneriTarafKey = 'uzak_r' | 'uzak_l' | 'yakin_r' | 'yakin_l'

function receteTarafDolu(rx: any, numaraTipi: 'uzak' | 'yakin', taraf: 'r' | 'l'): boolean {
  const prefix = numaraTipi === 'uzak' ? 'far' : 'near'
  const sph = rx?.[`${prefix}_${taraf}_sph`]
  const cyl = rx?.[`${prefix}_${taraf}_cyl`]
  return (sph != null && sph !== '') || (cyl != null && cyl !== '')
}

function receteUzakVar(rx: any): boolean {
  return receteTarafDolu(rx, 'uzak', 'r') || receteTarafDolu(rx, 'uzak', 'l')
}

function receteYakinVar(rx: any): boolean {
  return receteTarafDolu(rx, 'yakin', 'r') || receteTarafDolu(rx, 'yakin', 'l')
}

function parseOneriTaraf(key: OneriTarafKey): { numaraTipi: 'uzak' | 'yakin'; taraf: 'r' | 'l' } {
  const [numaraTipi, taraf] = key.split('_') as ['uzak' | 'yakin', 'r' | 'l']
  return { numaraTipi, taraf }
}

function receteOneriFiltrele(
  urunler: any[],
  rx: any,
  taraf: 'r' | 'l',
  numaraTipi: 'uzak' | 'yakin',
): { tam: any[]; transpoze: any[] } {
  const prefix = numaraTipi === 'uzak' ? 'far' : 'near'
  const sph = parseFloat(String(rx?.[`${prefix}_${taraf}_sph`] ?? '0'))
  const cyl = parseFloat(String(rx?.[`${prefix}_${taraf}_cyl`] ?? '0'))
  const aks = parseInt(String(rx?.[`${prefix}_${taraf}_aks`] ?? '0'))
  if (isNaN(sph) && isNaN(cyl)) return { tam: [], transpoze: [] }
  const tr = transpozHesapla(sph, cyl, aks)
  const tam: any[] = []
  const transpoze: any[] = []
  for (const u of urunler) {
    const uSph = parseStokCamSph(u.ad)
    const uCyl = parseStokCamCyl(u.ad)
    if (uSph === null || uCyl === null) continue
    if (uSph === sph && uCyl === Math.abs(cyl)) tam.push(u)
    else if (uSph === tr.sph && uCyl === Math.abs(tr.cyl)) transpoze.push(u)
  }
  return { tam, transpoze }
}

function rxLensNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = parseFloat(String(v).replace(',', '.').replace(/^\+/, ''))
  return Number.isFinite(n) ? n : null
}

function lensNumVariants(n: number): string[] {
  const abs = Math.abs(n)
  const out = new Set<string>()
  out.add(String(n))
  out.add(`${n < 0 ? '-' : ''}${abs.toFixed(2)}`)
  out.add(`${n < 0 ? '-' : ''}${abs.toFixed(1)}`)
  if (n > 0) out.add(`+${abs.toFixed(2)}`)
  const enc = Math.round(abs * 100)
  out.add(`${n < 0 ? '-' : ''}${String(enc).padStart(4, '0')}`)
  return [...out]
}

function textContainsLensNum(text: string, n: number | null): boolean {
  if (n == null) return true
  const hay = text.toLowerCase()
  return lensNumVariants(n).some((v) => {
    const s = v.toLowerCase()
    return hay.includes(s) || hay.includes(s.replace(/^\+/, ''))
  })
}

function kontaktLensReceteVar(rx: any): boolean {
  const rSph = rx?.lens_r_sph
  const lSph = rx?.lens_l_sph
  return (rSph != null && rSph !== '') || (lSph != null && lSph !== '')
}

function lensRxDisplay(v: unknown): string {
  if (v == null || v === '') return '—'
  return String(v)
}

function lensRxOzet(rx: any, taraf: 'r' | 'l'): string {
  return [
    lensRxDisplay(rx?.[`lens_${taraf}_sph`]),
    lensRxDisplay(rx?.[`lens_${taraf}_cyl`]),
    lensRxDisplay(rx?.[`lens_${taraf}_bc`]),
    lensRxDisplay(rx?.[`lens_${taraf}_dia`]),
  ].join('/')
}

function lensReceteOneriFiltrele(urunler: any[], rx: any, taraf: 'r' | 'l'): any[] {
  const sph = rxLensNum(rx?.[`lens_${taraf}_sph`])
  const cyl = rxLensNum(rx?.[`lens_${taraf}_cyl`])
  const bc = rxLensNum(rx?.[`lens_${taraf}_bc`])
  const dia = rxLensNum(rx?.[`lens_${taraf}_dia`])
  if (sph == null && cyl == null) return []

  const tam: any[] = []
  for (const u of urunler) {
    const text = [u.ad, u.varyant].filter(Boolean).join(' ')
    if (!textContainsLensNum(text, sph)) continue
    if (cyl != null && cyl !== 0 && !textContainsLensNum(text, Math.abs(cyl))) continue
    if (bc != null && !textContainsLensNum(text, bc)) continue
    if (dia != null && !textContainsLensNum(text, dia)) continue
    tam.push(u)
  }
  return tam
}

function buildSearchUrl(
  q: string,
  yontem: string,
  lokasyon: string,
  kategoriId?: number | null,
  kategoriIds?: number[] | null,
) {
  const params = new URLSearchParams({
    q,
    yontem,
    lokasyon,
    katalog: 'true',
  })
  if (kategoriId != null) params.set('kategoriId', String(kategoriId))
  if (kategoriIds?.length) params.set('kategoriIds', kategoriIds.join(','))
  return `/api/transfer/urun-ara?${params.toString()}`
}

async function handleScannedBarcode(kod: string, lokasyon: string) {
  if (isGs1DataMatrix(kod)) {
    const parsed = parseGs1DataMatrix(kod)
    if (parsed) {
      console.log('[GS1] parsed', parsed)
      const gtinCandidates = [parsed.gtin13, parsed.gtin14].filter(
        (v, i, arr) => arr.indexOf(v) === i,
      )
      for (const gtin of gtinCandidates) {
        const rows = await searchTransferProducts({
          q: gtin,
          yontem: 'barkod',
          lokasyon,
          katalog: true,
        })
        if (rows.length) {
          console.log('[GS1] barkod eşleşmesi', gtin, rows.length)
          return { q: gtin, yontem: 'barkod' as const, results: rows }
        }
      }
      if (parsed.serial) {
        const lotRows = await searchTransferProducts({
          q: parsed.serial,
          yontem: 'lot',
          lokasyon,
          katalog: true,
        })
        if (lotRows.length) {
          console.log('[GS1] lot/seri eşleşmesi', parsed.serial, lotRows.length)
          return { q: parsed.serial, yontem: 'lot' as const, results: lotRows }
        }
        console.log('[GS1] eşleşme yok; aranan gtin', parsed.gtin13, 'seri', parsed.serial)
      }
      return { q: parsed.gtin13, yontem: 'barkod' as const }
    }
  }

  let yontem: string = 'barkod'
  try {
    const { data } = await import('axios').then((m) =>
      m.default.get(
        `/api/transfer/urun-ara-akilli?q=${encodeURIComponent(kod)}&lokasyon=${encodeURIComponent(lokasyon)}`,
      ),
    )
    if (data?.yontem) {
      yontem = data.yontem === 'ad' ? 'barkod' : data.yontem
    }
  } catch {}
  return { q: kod, yontem }
}

export default function ItemsStep({
  saleId,
  items,
  onSaleUpdated,
  customerPrescription,
}: {
  saleId: string
  items: any[]
  onSaleUpdated: (sale: any) => void
  customerPrescription?: Record<string, unknown> | null
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [pickedType, setPickedType] = useState<(typeof typeCards)[number] | null>(null)
  const [pickedKategoriId, setPickedKategoriId] = useState<number | null>(null)
  const [pickedKategoriIds, setPickedKategoriIds] = useState<number[] | null>(null)
  const [pickedKategoriLabel, setPickedKategoriLabel] = useState<string | null>(null)
  const [catStack, setCatStack] = useState<KategoriNode[][]>([])
  const [catPath, setCatPath] = useState<string[]>([])

  const [q, setQ] = useState('')
  const [aramaYontemi, setAramaYontemi] = useState<string>('ad')
  const [kameraAcik, setKameraAcik] = useState(false)
  const [searchResults, setSearchResults] = useState<TransferUrun[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [pickedProduct, setPickedProduct] = useState<PickedProduct | null>(null)

  const [qty, setQty] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')

    const role = useAuthStore((s) => s.user?.role)
    const personelFiyatYetkisiVar =
      role === 'STORE_MANAGER' || role === 'REGIONAL_MANAGER' || role === 'ADMIN'
    const [personelFiyatUygulanacak, setPersonelFiyatUygulanacak] = useState(false)
    const [personelFiyatYukleniyor, setPersonelFiyatYukleniyor] = useState(false)
    const [personelFiyatBilgisi, setPersonelFiyatBilgisi] = useState<{ maliyet: number; kdvOrani: number } | null>(null)
    const [personelFiyatHata, setPersonelFiyatHata] = useState<string | null>(null)

  const [taxes, setTaxes] = useState<Array<{ id: number; name: string; amount: number }>>([])
  const [selectedTaxId, setSelectedTaxId] = useState<number | null>(null)
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount')
  const [discountInput, setDiscountInput] = useState('0')
  const [prescriptionType, setPrescriptionType] = useState<string>('')
  const [oneriTabu, setOneriTabu] = useState<'oneri' | 'tumü'>('oneri')
  const [oneriTaraf, setOneriTaraf] = useState<OneriTarafKey>('uzak_r')
  const [kontaktOneriTaraf, setKontaktOneriTaraf] = useState<'r' | 'l'>('r')

  const [error, setError] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<any | null>(null)
  const [pendingLinkedItemId, setPendingLinkedItemId] = useState<string | null>(null)
  const [frameAkis, setFrameAkis] = useState<'secim' | 'urunAra' | 'sadeceCerceve' | 'kendiCercevesi' | null>(null)
  const [pairPrompt, setPairPrompt] = useState<{
    candidateId: string
    candidateName: string
    payload: Record<string, unknown>
  } | null>(null)

  useEffect(() => {
    apiClient
      .get('/odoo/taxes')
      .then((res) => {
        const list = res.data?.data ?? []
        const filtered = (Array.isArray(list) ? list : []).filter(
          (t: any) => Number(t?.amount) > 0 && typeof t?.name === 'string' && !t.name.startsWith('WH'),
        )
        setTaxes(filtered)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!modalOpen || step !== 3) return
    const term = q.trim()
    if (term.length < 1 && pickedKategoriId !== BAKIM_KATEGORI_ID) {
      setSearchResults([])
      return
    }
    if (
      aramaYontemi !== 'barkod' &&
      aramaYontemi !== 'ad' &&
      pickedKategoriId == null &&
      !pickedKategoriIds?.length
    ) {
      return
    }

    const lokasyon = getAktifLokasyon()

    const t = setTimeout(() => {
      setProductsLoading(true)
      setError(null)
      searchTransferProducts({
        q: term,
        yontem: aramaYontemi,
        lokasyon,
        kategoriId: aramaYontemi === 'barkod' ? undefined : (pickedKategoriId ?? undefined),
        kategoriIds: aramaYontemi === 'barkod' ? undefined : (pickedKategoriIds ?? undefined),
        katalog: true,
      })
        .then((data) => {
          const rows = Array.isArray(data) ? data : []
          setSearchResults(rows)
        })
        .catch((e: any) => {
          setError(e?.response?.data?.message ?? e?.response?.data?.detail ?? 'Ürünler alınamadı')
          setSearchResults([])
        })
        .finally(() => setProductsLoading(false))
    }, 300)

    return () => clearTimeout(t)
  }, [modalOpen, step, q, aramaYontemi, pickedKategoriId, pickedKategoriIds])

  function resetModalState() {
    kameraKapat()
    setStep(1)
    setPickedType(null)
    setPickedKategoriId(null)
    setPickedKategoriIds(null)
    setPickedKategoriLabel(null)
    setCatStack([])
    setCatPath([])
    setQ('')
    setAramaYontemi('ad')
    setSearchResults([])
    setPickedProduct(null)
    setQty('1')
    setUnitPrice('')
    setPersonelFiyatUygulanacak(false)
    setPersonelFiyatBilgisi(null)
    setPersonelFiyatHata(null)
    setDiscountType('amount')
    setDiscountInput('0')
    setPrescriptionType('')
    setSelectedTaxId(null)
    setError(null)
    setEditingItem(null)
    setPendingLinkedItemId(null)
    setFrameAkis(null)
    setPairPrompt(null)
  }

  function open() {
    resetModalState()
    setModalOpen(true)
  }

  function close() {
    kameraKapat()
    setModalOpen(false)
  }

  function kameraKapat() {
    setKameraAcik(false)
  }

  function onTypePicked(t: (typeof typeCards)[number]) {
    setPickedType(t)
    setPickedKategoriLabel(null)
    setPickedKategoriId(null)
    setPickedKategoriIds(null)
    setCatStack([])
    setCatPath([])
    setQ('')
    setSearchResults([])

    const directId = DIREKT_KATEGORI_ID[t.type]
    if (directId != null) {
      if (t.type === 'FRAME' || t.type === 'SUN') {
        setPickedKategoriId(directId)
        setFrameAkis('secim')
        setStep(1.5 as any)
        return
      }
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
    // Çoklu kategori — grup adımı atlanır
    const multiIds = MULTI_KATEGORI_IDS[node.label]
    if (multiIds) {
      setPickedKategoriIds(multiIds)
      setPickedKategoriId(null)
      setStep(3)
      return
    }
    if (isKategoriLeaf(node)) {
      setPickedKategoriId(node.kategoriId)
      setPickedKategoriIds(null)
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
      setPickedKategoriIds(null)
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

  function itemDisplayName(it: any): string {
    return (
      it.odooProductName ||
      (it.product?.name !== '__ODOO_PLACEHOLDER__' ? it.product?.name : null) ||
      'Cam'
    )
  }

  function findUnpairedCustomerFrameCandidate(): { id: string; name: string } | null {
    const candidates = items.filter(
      (it) =>
        String(it.status).toUpperCase() !== 'VOID' &&
        it.linkType === 'CUSTOMER_FRAME' &&
        !it.pairedItemId,
    )
    if (!candidates.length) return null
    const last = candidates[candidates.length - 1]
    return { id: last.id, name: itemDisplayName(last) }
  }

  async function personelFiyatToggle(checked: boolean) {
    setPersonelFiyatUygulanacak(checked)
    setPersonelFiyatHata(null)
    if (!checked) {
      setPersonelFiyatBilgisi(null)
      return
    }
    if (!pickedProduct) return
    const variantId = String(pickedProduct.odooVariantId).replace(/^odoo_/, '')
    setPersonelFiyatYukleniyor(true)
    try {
      const sonuc = await hesaplaPersonelFiyati(variantId)
      setUnitPrice(String(sonuc.fiyat))
      setPersonelFiyatBilgisi({ maliyet: sonuc.maliyet, kdvOrani: sonuc.kdvOrani })
      const eslesenVergi = taxes.find((t) => Number(t.amount) === Number(sonuc.kdvOrani))
      if (eslesenVergi) setSelectedTaxId(eslesenVergi.id)
    } catch (e: any) {
      setPersonelFiyatHata(e?.response?.data?.message ?? 'Personel fiyatı hesaplanamadı')
      setPersonelFiyatUygulanacak(false)
    } finally {
      setPersonelFiyatYukleniyor(false)
    }
  }

  function buildSavePayload(): Record<string, unknown> | null {
    if (!pickedProduct) return null
    const variantId = String(pickedProduct.odooVariantId).replace(/^odoo_/, '')
    const discountAmount =
      discountType === 'percent'
        ? (Number(unitPrice) * Number(qty) * Number(discountInput)) / 100
        : Number(discountInput)
    const payload: Record<string, unknown> = {
      productId: `odoo_${variantId}`,
      odooProductId: variantId,
      odooProductName: pickedProduct.name,
      lotNo: pickedProduct.lotNo || null,
      qty: Math.max(1, Number(qty || 1)),
      unitPrice: toDecimalString(unitPrice || pickedProduct.price),
      discount: String(discountAmount),
      taxId: selectedTaxId,
      taxRate: selectedTaxId ? (taxes.find((t) => t.id === selectedTaxId)?.amount ?? null) : null,
    }
    if (pickedKategoriId != null) {
      payload.odooCategoryId = pickedKategoriId
    }
    if (pickedType?.type === 'LENS') {
      if (pendingLinkedItemId && pendingLinkedItemId !== 'KENDI_CERCEVE') {
        payload.linkType = 'FRAME_LENS'
        payload.linkedItemId = pendingLinkedItemId
      } else if (pendingLinkedItemId === 'KENDI_CERCEVE') {
        payload.linkType = 'CUSTOMER_FRAME'
        payload.linkedItemId = undefined
      } else {
        payload.linkType = editingItem?.linkType ?? 'CUSTOMER_FRAME'
        payload.linkedItemId = editingItem?.linkedItemId ?? undefined
      }
      if (prescriptionType) {
        const backendType = prescriptionType.startsWith('SINGLE_') ? 'SINGLE' : prescriptionType
        const rx = customerPrescription as any

        const toStr = (v: any) => {
          if (v == null || v === '') return undefined
          return String(v).replace(/^\+/, '')
        }

        payload.prescription = {
          prescriptionType: backendType,
          prescriptionSource: 'MANUAL',
          r_sph: toStr(rx?.far_r_sph ?? rx?.r_sph),
          r_cyl: toStr(rx?.far_r_cyl ?? rx?.r_cyl),
          r_aks: rx?.far_r_aks ?? rx?.r_aks ? parseInt(String(rx?.far_r_aks ?? rx?.r_aks)) : undefined,
          r_add: toStr(rx?.far_r_add ?? rx?.r_add),
          r_pd: toStr(rx?.far_r_pd ?? rx?.r_pd),
          l_sph: toStr(rx?.far_l_sph ?? rx?.l_sph),
          l_cyl: toStr(rx?.far_l_cyl ?? rx?.l_cyl),
          l_aks: rx?.far_l_aks ?? rx?.l_aks ? parseInt(String(rx?.far_l_aks ?? rx?.l_aks)) : undefined,
          l_add: toStr(rx?.far_l_add ?? rx?.l_add),
          l_pd: toStr(rx?.far_l_pd ?? rx?.l_pd),
        }
      }
    }
    return payload
  }

  async function commitSave(payload: Record<string, unknown>, pairWithItemId?: string) {
    if (pairWithItemId) {
      payload.pairWithItemId = pairWithItemId
    }
    if (editingItem?.id) {
      await updateItem(saleId, editingItem.id, payload as any)
    } else {
      await addItem(saleId, payload as any)
    }
    const updated = await getSaleById(saleId)
    onSaleUpdated(updated)
    setPendingLinkedItemId(null)
    setPairPrompt(null)
    close()
  }

  async function save() {
    if (!pickedProduct) return
    setError(null)
    try {
      const payload = buildSavePayload()
      if (!payload) return

      const isNewCustomerFrame =
        !editingItem?.id &&
        pickedType?.type === 'LENS' &&
        payload.linkType === 'CUSTOMER_FRAME'

      if (isNewCustomerFrame) {
        const candidate = findUnpairedCustomerFrameCandidate()
        if (candidate) {
          setPairPrompt({ candidateId: candidate.id, candidateName: candidate.name, payload })
          return
        }
      }

      await commitSave(payload)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Kalem eklenemedi')
    }
  }

  function openEdit(item: any) {
    setModalOpen(true)
    setEditingItem(item)
    setPrescriptionType(item?.prescription?.prescriptionType ?? '')
    setError(null)
    const matchedType = typeCards.find((t) => t.type === item?.product?.category) ?? typeCards[0]
    setPickedType(matchedType)
    const urunAdi =
      (item.odooProductName && !String(item.odooProductName).includes('PLACEHOLDER'))
        ? item.odooProductName
        : item.product?.name && !String(item.product.name).includes('PLACEHOLDER')
        ? item.product.name
        : 'Cam'
    setPickedProduct({
      odooVariantId: String(item?.odooProductId ?? item?.product?.odooId ?? item?.productId ?? '').replace(/^odoo_/, ''),
      ad: urunAdi,
      varyant: '',
      name: urunAdi,
      price: String(item?.unitPrice ?? item?.product?.price ?? '0'),
    })
    setQty(String(item?.qty ?? 1))
    setUnitPrice(String(item?.unitPrice ?? item?.product?.price ?? ''))
    setDiscountInput(String(item?.discount ?? '0'))
    setDiscountType('amount')
    const match = taxes.find((t) => Math.abs(t.amount - Number(item.product?.taxRate ?? 20)) < 0.1)
    if (match) setSelectedTaxId(match.id)
    setStep(4)
  }

  useEffect(() => {
    if (!modalOpen || step !== 4) return
    if (selectedTaxId != null) return
    if (!taxes.length) return
    const baseRate = Number(editingItem?.product?.taxRate ?? 20)
    const match = taxes.find((t) => Math.abs(t.amount - baseRate) < 0.1)
    if (match) setSelectedTaxId(match.id)
  }, [modalOpen, step, taxes, editingItem?.product?.taxRate, selectedTaxId])

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
        {items
          .filter((it) => String(it.status).toUpperCase() !== 'VOID')
          .map((it) => (
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
                {(it.odooCategoryId === 6 || it.odooCategoryId === 7) &&
                items.filter(
                  (other) => other.linkedItemId === it.id && String(other.status).toUpperCase() !== 'VOID',
                ).length < 2 ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetModalState()
                      setModalOpen(true)
                      setPickedType(lensTypeCard)
                      setCatStack([getKategoriTreeRoot('LENS')])
                      setCatPath([])
                      setStep(2)
                      setPendingLinkedItemId(it.id)
                    }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px solid #059669',
                      backgroundColor: 'white',
                      color: '#059669',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    + Cam Ekle
                  </button>
                ) : null}
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

            {step === (1.5 as any) && frameAkis === 'secim' ? (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                  {pickedType?.type === 'FRAME' ? 'Optik Gözlük' : 'Güneş Gözlüğü'} — nasıl devam edelim?
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setFrameAkis('kendiCercevesi')
                    setPickedType(lensTypeCard)
                    setCatStack([getKategoriTreeRoot('LENS')])
                    setCatPath([])
                    setStep(2)
                    setPendingLinkedItemId('KENDI_CERCEVE')
                  }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: 14,
                    textAlign: 'left',
                  }}
                >
                  👓 Kendi Çerçevesi → Cam Ekle
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFrameAkis('urunAra')
                    setStep(3)
                  }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: 14,
                    textAlign: 'left',
                  }}
                >
                  🔍 Ürün Ara → Çerçeve Seç
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFrameAkis('sadeceCerceve')
                    setStep(3)
                  }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: 14,
                    textAlign: 'left',
                  }}
                >
                  🕶 Sadece Çerçeve (Cam Yok)
                </button>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    padding: '10px',
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#6b7280',
                  }}
                >
                  ← Geri
                </button>
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
                  Ürün ara — {pickedType.title}
                  {pickedKategoriLabel ? ` · ${pickedKategoriLabel}` : ''}
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
                {pickedKategoriId != null && STOK_CAM_KATEGORI_IDS.includes(pickedKategoriId) && customerPrescription ? (() => {
                  const rx = customerPrescription as any
                  const uzakVar = receteUzakVar(rx)
                  const yakinVar = receteYakinVar(rx)
                  const tabDefs: Array<{ key: OneriTarafKey; label: string; sph: string; cyl: string }> = []
                  if (uzakVar && yakinVar) {
                    tabDefs.push(
                      { key: 'uzak_r', label: 'Uzak Sağ', sph: rx?.far_r_sph ?? '—', cyl: rx?.far_r_cyl ?? '—' },
                      { key: 'uzak_l', label: 'Uzak Sol', sph: rx?.far_l_sph ?? '—', cyl: rx?.far_l_cyl ?? '—' },
                      { key: 'yakin_r', label: 'Yakın Sağ', sph: rx?.near_r_sph ?? '—', cyl: rx?.near_r_cyl ?? '—' },
                      { key: 'yakin_l', label: 'Yakın Sol', sph: rx?.near_l_sph ?? '—', cyl: rx?.near_l_cyl ?? '—' },
                    )
                  } else if (uzakVar) {
                    tabDefs.push(
                      { key: 'uzak_r', label: 'Uzak Sağ', sph: rx?.far_r_sph ?? '—', cyl: rx?.far_r_cyl ?? '—' },
                      { key: 'uzak_l', label: 'Uzak Sol', sph: rx?.far_l_sph ?? '—', cyl: rx?.far_l_cyl ?? '—' },
                    )
                  } else if (yakinVar) {
                    tabDefs.push(
                      { key: 'yakin_r', label: 'Yakın Sağ', sph: rx?.near_r_sph ?? '—', cyl: rx?.near_r_cyl ?? '—' },
                      { key: 'yakin_l', label: 'Yakın Sol', sph: rx?.near_l_sph ?? '—', cyl: rx?.near_l_cyl ?? '—' },
                    )
                  } else {
                    tabDefs.push(
                      { key: 'uzak_r', label: 'Uzak Sağ', sph: rx?.far_r_sph ?? '—', cyl: rx?.far_r_cyl ?? '—' },
                      { key: 'uzak_l', label: 'Uzak Sol', sph: rx?.far_l_sph ?? '—', cyl: rx?.far_l_cyl ?? '—' },
                    )
                  }
                  const activeKey = tabDefs.some((t) => t.key === oneriTaraf) ? oneriTaraf : tabDefs[0].key
                  const { numaraTipi, taraf } = parseOneriTaraf(activeKey)
                  const { tam, transpoze } = receteOneriFiltrele(searchResults, rx, taraf, numaraTipi)
                  const onerilen = [
                    ...tam.map((u) => ({ ...u, _eslesme: 'tam' as const })),
                    ...transpoze.map((u) => ({ ...u, _eslesme: 'transpoze' as const })),
                  ]
                  return (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        ✦ Reçeteye göre öneri
                        {onerilen.length > 0 && <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>{onerilen.length} eşleşme</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                        {tabDefs.map((tab) => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setOneriTaraf(tab.key)}
                            style={{
                              fontSize: 12,
                              padding: '4px 10px',
                              borderRadius: 6,
                              border: '1px solid #bfdbfe',
                              background: activeKey === tab.key ? '#1d4ed8' : 'white',
                              color: activeKey === tab.key ? 'white' : '#1d4ed8',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            {tab.label} · {tab.sph} / {tab.cyl}
                          </button>
                        ))}
                      </div>
                      {onerilen.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#6b7280' }}>Reçeteye uygun stok bulunamadı — aşağıdan arama yapın.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {onerilen.map((u: any) => (
                            <div key={String(u.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: `1px solid ${u._eslesme === 'tam' ? '#1d4ed8' : '#93c5fd'}`, borderRadius: 8, padding: '8px 10px' }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{u.ad}</div>
                                <div style={{ fontSize: 11, color: u._eslesme === 'tam' ? '#1d4ed8' : '#6b7280', marginTop: 2 }}>
                                  {u._eslesme === 'tam' ? '✓ Tam eşleşme' : '↔ Transpoze eşleşme'}
                                </div>
                              </div>
                              <button type="button" onClick={() => pickSearchResult(u)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#1d4ed8', color: 'white', cursor: 'pointer', fontWeight: 700 }}>
                                Seç
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })() : null}

                {pickedKategoriId != null && KONTAKT_LENS_KATEGORI_IDS.includes(pickedKategoriId) && customerPrescription && kontaktLensReceteVar(customerPrescription) ? (() => {
                  const rx = customerPrescription as any
                  const activeTaraf = kontaktOneriTaraf
                  const onerilen = lensReceteOneriFiltrele(searchResults, rx, activeTaraf).map((u) => ({
                    ...u,
                    _eslesme: 'tam' as const,
                  }))
                  return (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        ✦ Reçeteye göre öneri
                        {onerilen.length > 0 && (
                          <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: 11, padding: '2px 8px', borderRadius: 999 }}>
                            {onerilen.length} eşleşme
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => setKontaktOneriTaraf('r')}
                          style={{
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid #bfdbfe',
                            background: activeTaraf === 'r' ? '#1d4ed8' : 'white',
                            color: activeTaraf === 'r' ? 'white' : '#1d4ed8',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Sağ göz · {lensRxOzet(rx, 'r')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setKontaktOneriTaraf('l')}
                          style={{
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 6,
                            border: '1px solid #bfdbfe',
                            background: activeTaraf === 'l' ? '#1d4ed8' : 'white',
                            color: activeTaraf === 'l' ? 'white' : '#1d4ed8',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Sol göz · {lensRxOzet(rx, 'l')}
                        </button>
                      </div>
                      {onerilen.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#6b7280' }}>Reçeteye uygun stok bulunamadı — aşağıdan arama yapın.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {onerilen.map((u: any) => (
                            <div
                              key={String(u.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'white',
                                border: '1px solid #1d4ed8',
                                borderRadius: 8,
                                padding: '8px 10px',
                              }}
                            >
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{u.ad}</div>
                                {u.varyant ? (
                                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{u.varyant}</div>
                                ) : null}
                                <div style={{ fontSize: 11, color: '#1d4ed8', marginTop: 2 }}>✓ Reçeteye uygun</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => pickSearchResult(u)}
                                style={{
                                  fontSize: 12,
                                  padding: '5px 12px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: '#1d4ed8',
                                  color: 'white',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                }}
                              >
                                Seç
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })() : null}

                {aramaYontemi === 'ad' && pickedKategoriId == null && !pickedKategoriIds?.length ? (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                    Kategori seçilmedi — tüm kategorilerde aranıyor.
                  </div>
                ) : null}

                <BarkodKameraInput
                  value={q}
                  onChange={setQ}
                  kameraEnabled={aramaYontemi === 'barkod'}
                  kameraOpen={kameraAcik}
                  onKameraOpenChange={setKameraAcik}
                  onScan={async (kod) => {
                    const lokasyon = getAktifLokasyon()
                    const scan = await handleScannedBarcode(kod, lokasyon)
                    setAramaYontemi(scan.yontem)
                    setQ(scan.q)
                    if (scan.results) setSearchResults(scan.results)
                  }}
                  placeholder={aramaYontemi === 'barkod' ? 'Barkod okutun veya yazın...' : 'En az 1 karakter ara...'}
                  inputStyle={{ ...inputStyle, marginBottom: 0 }}
                />
                <div style={{ marginTop: '10px', maxHeight: '320px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {productsLoading ? <div style={{ fontSize: '13px', color: '#6b7280' }}>Aranıyor...</div> : null}
                  {!productsLoading && q.trim().length >= 1 && searchResults.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 0' }}>
                      Sonuç bulunamadı.
                    </div>
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
                        <div
                          style={{
                            fontSize: '12px',
                            marginTop: '2px',
                            color: (u.stok ?? 0) === 0 ? '#dc2626' : '#4b5563',
                            fontWeight: (u.stok ?? 0) === 0 ? 600 : 400,
                          }}
                        >
                          Stok: {u.stok ?? 0} adet
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
                {pickedType?.type === 'LENS' ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>
                      Reçete Tipi
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[
                        { id: 'SINGLE', label: 'Daimi', sub: 'FAR' },
                        { id: 'SINGLE', label: 'Yakın', sub: 'NEAR' },
                        { id: 'PROGRESSIVE', label: 'Progresif', sub: '' },
                        { id: 'BIFOCAL', label: 'Bifokal', sub: '' },
                        { id: 'SUNGLASSES', label: 'Düzeltmesiz', sub: '' },
                      ].map((t) => (
                        <button
                          key={t.label}
                          type="button"
                          onClick={() => setPrescriptionType(t.id === 'SINGLE' ? `SINGLE_${t.sub}` : t.id)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 8,
                            border: `1px solid ${prescriptionType === (t.id === 'SINGLE' ? `SINGLE_${t.sub}` : t.id) ? '#C8102E' : '#e5e7eb'}`,
                            backgroundColor: prescriptionType === (t.id === 'SINGLE' ? `SINGLE_${t.sub}` : t.id) ? '#C8102E' : 'white',
                            color: prescriptionType === (t.id === 'SINGLE' ? `SINGLE_${t.sub}` : t.id) ? 'white' : '#374151',
                            fontWeight: 700,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <Field label="Adet" value={qty} onChange={setQty} />
                  <Field label="Birim Fiyat" value={unitPrice} onChange={setUnitPrice} />
                  <Field label="İndirim" value={discountInput} onChange={setDiscountInput} />
                </div>
                {personelFiyatYetkisiVar ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #fde68a',
                      background: '#fffbeb',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                      <input
                        type="checkbox"
                        checked={personelFiyatUygulanacak}
                        disabled={personelFiyatYukleniyor}
                        onChange={(e) => void personelFiyatToggle(e.target.checked)}
                      />
                      Personel Fiyatı Uygula
                    </label>
                    {personelFiyatYukleniyor ? (
                      <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>Hesaplanıyor…</div>
                    ) : null}
                    {personelFiyatBilgisi ? (
                      <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>
                        Maliyet: {money(personelFiyatBilgisi.maliyet)} · KDV: %{personelFiyatBilgisi.kdvOrani} · Fiyat maliyet üzerine %20 kârla hesaplandı
                      </div>
                    ) : null}
                    {personelFiyatHata ? (
                      <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{personelFiyatHata}</div>
                    ) : null}
                  </div>
                ) : null}
                {personelFiyatYetkisiVar ? (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #fde68a',
                      background: '#fffbeb',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                      <input
                        type="checkbox"
                        checked={personelFiyatUygulanacak}
                        disabled={personelFiyatYukleniyor}
                        onChange={(e) => void personelFiyatToggle(e.target.checked)}
                      />
                      Personel Fiyatı Uygula
                    </label>
                    {personelFiyatYukleniyor ? (
                      <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>Hesaplanıyor…</div>
                    ) : null}
                    {personelFiyatBilgisi ? (
                      <div style={{ fontSize: 12, color: '#92400e', marginTop: 4 }}>
                        Maliyet: {money(personelFiyatBilgisi.maliyet)} · KDV: %{personelFiyatBilgisi.kdvOrani} · Fiyat maliyet üzerine %20 kârla hesaplandı
                      </div>
                    ) : null}
                    {personelFiyatHata ? (
                      <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>{personelFiyatHata}</div>
                    ) : null}
                  </div>
                ) : null}
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                    <input
                      type="radio"
                      name="discountType"
                      checked={discountType === 'amount'}
                      onChange={() => setDiscountType('amount')}
                    />
                    ₺ Tutar
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
                    <input
                      type="radio"
                      name="discountType"
                      checked={discountType === 'percent'}
                      onChange={() => setDiscountType('percent')}
                    />
                    % Oran
                  </label>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#6b7280',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        marginBottom: '6px',
                      }}
                    >
                      KDV ORANI
                    </div>
                    <select
                      value={selectedTaxId ?? ''}
                      onChange={(e) => setSelectedTaxId(e.target.value ? Number(e.target.value) : null)}
                      style={inputStyle}
                    >
                      <option value="">Seçiniz</option>
                      {taxes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.amount}%)
                        </option>
                      ))}
                    </select>
                  </label>
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

      {pairPrompt ? (
        <div style={{ ...overlayStyle, zIndex: 60 }}>
          <div style={{ ...modalStyle, maxWidth: 440 }}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Cam eşleştirme</div>
            <div style={{ fontSize: 14, color: '#374151', marginBottom: 20, lineHeight: 1.5 }}>
              Bu cam, <strong>{pairPrompt.candidateName}</strong> ile aynı gözlüğe mi ait?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  void commitSave(pairPrompt.payload, pairPrompt.candidateId).catch((e: any) => {
                    setError(e?.response?.data?.message ?? 'Kalem eklenemedi')
                    setPairPrompt(null)
                  })
                }}
                style={{ ...primaryBtnStyle, width: '100%', textAlign: 'center' }}
              >
                Evet, eşle
              </button>
              <button
                type="button"
                onClick={() => {
                  void commitSave(pairPrompt.payload).catch((e: any) => {
                    setError(e?.response?.data?.message ?? 'Kalem eklenemedi')
                    setPairPrompt(null)
                  })
                }}
                style={{ ...ghostBtnStyle, width: '100%' }}
              >
                Hayır, ayrı gözlük / tek cam
              </button>
            </div>
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
