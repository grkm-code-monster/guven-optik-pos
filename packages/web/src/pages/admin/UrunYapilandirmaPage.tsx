import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from './AdminLayout'

const RED = '#A32D2D'
const GREEN = '#3B6D11'
const BLUE = '#2563eb'
const AMBER = '#d97706'

const inp: React.CSSProperties = {
  padding: '7px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  backgroundColor: 'white',
  width: '100%',
  boxSizing: 'border-box',
}
const btn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 700,
}
const btnPrimary: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }
const btnSmall: React.CSSProperties = { ...btn, padding: '5px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#374151' }

const SIRKETLER = [
  { id: 1, ad: 'Güven Optik 1959' },
  { id: 2, ad: 'NG' },
  { id: 3, ad: 'ADESE' },
  { id: 4, ad: 'POTENTIAL' },
]

const SABLON_EXCEL_HEDEF_ALANLARI = [
  'kategori',
  'urunSablonAdi',
  'model',
  'renk',
  'olcu',
  'barkod',
  'icReferans',
  'kdvOrani',
  'satisFiyati',
  'maliyet',
  'sirket',
  'izleme',
] as const

type SablonExcelHedefAlan = (typeof SABLON_EXCEL_HEDEF_ALANLARI)[number]
type SablonExcelKolonMap = Record<SablonExcelHedefAlan, number | 'yoksay'>

const SABLON_EXCEL_HEDEF_ETIKETLER: Record<SablonExcelHedefAlan, string> = {
  kategori: 'Kategori *',
  urunSablonAdi: 'Ürün Şablon Adı *',
  model: 'Model',
  renk: 'Renk',
  olcu: 'Ölçü',
  barkod: 'Barkod',
  icReferans: 'İç Referans',
  kdvOrani: 'KDV Oranı',
  satisFiyati: 'Satış Fiyatı',
  maliyet: 'Maliyet',
  sirket: 'Şirket',
  izleme: 'İzleme',
}

const VARSAYILAN_SABLON_EXCEL_KOLON_MAP: SablonExcelKolonMap = {
  kategori: 0,
  urunSablonAdi: 1,
  model: 2,
  renk: 3,
  olcu: 4,
  barkod: 5,
  icReferans: 6,
  kdvOrani: 7,
  satisFiyati: 8,
  maliyet: 9,
  sirket: 10,
  izleme: 11,
}

const ADIMLAR = ['Kategori', 'Ürün şablonu', 'Nitelik & değer', 'Varyantlar']

type OdooKategori = { id: number; name: string; parent_id: false | [number, string]; complete_name: string }
type OdooNitelik = { id: number; name: string; value_ids: number[]; display_type: string }
type OdooNitelikDeger = { id: number; name: string; attribute_id: [number, string] }

type OdooSablonListItem = {
  id: number
  name: string
  categ_id: false | [number, string]
  default_code: false | string
  list_price: number
  standard_price: number
  type: string
  product_variant_count: number
  attribute_line_ids: number[]
  sale_ok: boolean
  purchase_ok: boolean
  active: boolean
}

type VaryantRow = {
  odooId: number
  name: string
  model: string
  renk: string
  olcu: string
  icReferans: string
  barkod: string
  satisFiyati: string
  maliyet: string
  durum: 'bekliyor' | 'synced'
}

function parseVaryantAttrs(name: string, degerler: OdooNitelikDeger[]) {
  const model = degerler.find((d) => d.attribute_id[1] === 'MODEL')?.name ?? ''
  const renk = degerler.find((d) => d.attribute_id[1] === 'RENK')?.name ?? ''
  const olcu = degerler.find((d) => d.attribute_id[1] === 'ÖLÇÜ')?.name ?? ''
  if (model || renk || olcu) return { model, renk, olcu }
  const parts = name.match(/\(([^)]+)\)/)?.[1]?.split(',').map((s) => s.trim()) ?? []
  return { model: parts[0] ?? '', renk: parts[1] ?? '', olcu: parts[2] ?? '' }
}

export default function UrunYapilandirmaPage() {
  const navigate = useNavigate()
  const [adim, setAdim] = useState(1)
  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const [kategoriler, setKategoriler] = useState<OdooKategori[]>([])
  const [nitelikler, setNitelikler] = useState<OdooNitelik[]>([])
  const [nitelikDegerleri, setNitelikDegerleri] = useState<OdooNitelikDeger[]>([])

  const [yeniKategori, setYeniKategori] = useState({ ad: '', parentId: '', sirket: '' })
  const [yeniNitelik, setYeniNitelik] = useState({ ad: '', displayType: 'select', degerler: '' })
  const [yeniDeger, setYeniDeger] = useState<Record<number, string>>({})
  const [uygulamaYukleniyor, setUygulamaYukleniyor] = useState<Record<number, boolean>>({})
  const [uygulamaSonuc, setUygulamaSonuc] = useState<Record<number, { varSayisi: number; yeniSayisi: number }>>({})

  const [sablon, setSablon] = useState({
    ad: '',
    tur: 'product',
    kategoriId: '',
    satisFiyati: '',
    maliyet: '',
    vergi: '10',
    icReferans: '',
    barkod: '',
    sirket: '',
    faturaKurali: 'order',
    izleme: 'lot',
    teslimSuresi: 0,
    agirlik: 0,
    hacim: 0,
    satilabilir: true,
    satinAlinabilir: true,
    masrafOlabilir: false,
  })

  const [aktifNitelikler, setAktifNitelikler] = useState<number[]>([])
  const [seciliDegerler, setSeciliDegerler] = useState<Record<number, number[]>>({})

  const [varyantlar, setVaryantlar] = useState<VaryantRow[]>([])
  const [tmplId, setTmplId] = useState<number | null>(null)

  const [sablonModu, setSablonModu] = useState<'sec' | 'yeni' | 'excel' | 'toplu'>('sec')
  const [topluUrunMetin, setTopluUrunMetin] = useState('')
  const [topluYukleniyor, setTopluYukleniyor] = useState(false)
  const [topluSonuc, setTopluSonuc] = useState<any>(null)
  const [sablonListesi, setSablonListesi] = useState<OdooSablonListItem[]>([])
  const [sablonArama, setSablonArama] = useState('')
  const [sablonKategoriFiltre, setSablonKategoriFiltre] = useState('')
  const [seciliSablon, setSeciliSablon] = useState<OdooSablonListItem | null>(null)
  const [sablonYukleniyor, setSablonYukleniyor] = useState(false)

  const [importMod, setImportMod] = useState<'import' | 'liste'>('import')
  const [sutunSirasi, setSutunSirasi] = useState({
    model: 0, renk: 1, olcu: 2, barkod: 3, fiyat: 4,
  })
  const [importMetin, setImportMetin] = useState('')
  const [onizleme, setOnizleme] = useState<any>(null)
  const [importYukleniyor, setImportYukleniyor] = useState(false)
  const [importSonuc, setImportSonuc] = useState<any>(null)

  const [excelSutunlar, setExcelSutunlar] = useState<string[]>([])
  const [excelSatirlar, setExcelSatirlar] = useState<string[][]>([])
  const [excelOrnekSatirlar, setExcelOrnekSatirlar] = useState<string[][]>([])
  const [excelKolonMap, setExcelKolonMap] = useState<SablonExcelKolonMap>({ ...VARSAYILAN_SABLON_EXCEL_KOLON_MAP })
  const [excelDosyaAdi, setExcelDosyaAdi] = useState('')
  const [excelYukleniyor, setExcelYukleniyor] = useState(false)
  const [excelDogrulama, setExcelDogrulama] = useState<any>(null)
  const [excelAktarimSonuc, setExcelAktarimSonuc] = useState<any>(null)
  const [excelAdim, setExcelAdim] = useState<'yukle' | 'eslestir' | 'onizle' | 'sonuc'>('yukle')

  const yukle = useCallback(async () => {
    const [katRes, nitRes, nitValRes] = await Promise.all([
      adminApi.get('/admin/odoo-kategoriler'),
      adminApi.get('/admin/odoo-nitelikler'),
      adminApi.get('/admin/odoo-nitelik-degerleri'),
    ])
    setKategoriler(katRes.data?.data ?? [])
    setNitelikler(nitRes.data?.data ?? [])
    setNitelikDegerleri(nitValRes.data?.data ?? [])
  }, [])

  useEffect(() => {
    void yukle().catch(() => setMesaj({ tip: 'err', text: 'Odoo verileri yüklenemedi' }))
  }, [yukle])

  useEffect(() => {
    if (adim === 2) {
      setSablonYukleniyor(true)
      adminApi.get('/admin/odoo-sablon-listesi')
        .then((res) => setSablonListesi(res.data?.data ?? []))
        .catch(() => {})
        .finally(() => setSablonYukleniyor(false))
    }
  }, [adim])

  useEffect(() => {
    if (importMod === 'liste' && tmplId) {
      adminApi.get(`/admin/odoo-sablon/${tmplId}/varyantlar`)
        .then((res) => {
          const raw = res.data?.data ?? []
          const rows = raw.map((v: any) => ({
            odooId: v.id,
            name: `${v.model} ${v.renk} ${v.olcu}`.trim(),
            model: v.model,
            renk: v.renk,
            olcu: v.olcu,
            icReferans: v.default_code || '',
            barkod: v.barcode || '',
            satisFiyati: String(v.lst_price || 0),
            maliyet: String(v.standard_price || 0),
            durum: 'synced' as const,
          }))
          setVaryantlar(rows)
        })
        .catch(() => {})
    }
  }, [importMod, tmplId])

  const siraliKategoriler = useMemo(
    () => [...kategoriler].sort((a, b) => a.complete_name.localeCompare(b.complete_name, 'tr')),
    [kategoriler],
  )

  const filtreliSablonlar = useMemo(() => {
    return sablonListesi.filter((s) => {
      const adMatch = !sablonArama
        || s.name?.toLowerCase().includes(sablonArama.toLowerCase())
        || (typeof s.default_code === 'string' && s.default_code.toLowerCase().includes(sablonArama.toLowerCase()))
      const katMatch = !sablonKategoriFiltre
        || s.categ_id?.[0] === Number(sablonKategoriFiltre)
      return adMatch && katMatch
    })
  }, [sablonListesi, sablonArama, sablonKategoriFiltre])

  const sablonVaryantSayisi = useMemo(() => {
    const attrs = aktifNitelikler.filter((id) => (seciliDegerler[id]?.length ?? 0) > 0)
    if (attrs.length === 0) return 0
    return attrs.reduce((acc, attrId) => acc * (seciliDegerler[attrId]?.length ?? 0), 1)
  }, [aktifNitelikler, seciliDegerler])

  const varyantFormulu = useMemo(() => {
    const attrs = aktifNitelikler.filter((id) => (seciliDegerler[id]?.length ?? 0) > 0)
    if (attrs.length === 0) return ''
    const parts = attrs.map((id) => {
      const nitelik = nitelikler.find((n) => n.id === id)
      const count = seciliDegerler[id]?.length ?? 0
      return `${nitelik?.name ?? id}(${count})`
    })
    return `${parts.join(' × ')} = ${sablonVaryantSayisi} varyant`
  }, [aktifNitelikler, seciliDegerler, nitelikler, sablonVaryantSayisi])

  function mapVariantsToRows(raw: any[]) {
    return raw.map((v: any) => {
      const parsed = parseVaryantAttrs(v.name, nitelikDegerleri)
      return {
        odooId: v.id,
        name: v.name,
        model: parsed.model,
        renk: parsed.renk,
        olcu: parsed.olcu,
        icReferans: v.default_code || '',
        barkod: v.barcode || '',
        satisFiyati: String(v.lst_price ?? sablon.satisFiyati ?? 0),
        maliyet: String(v.standard_price ?? sablon.maliyet ?? 0),
        durum: 'bekliyor' as const,
      }
    })
  }

  function toggleSablonNitelik(attrId: number, checked: boolean) {
    if (checked) {
      setAktifNitelikler((prev) => (prev.includes(attrId) ? prev : [...prev, attrId]))
      setSeciliDegerler((prev) => ({ ...prev, [attrId]: prev[attrId] ?? [] }))
    } else {
      setAktifNitelikler((prev) => prev.filter((id) => id !== attrId))
      setSeciliDegerler((prev) => {
        const next = { ...prev }
        delete next[attrId]
        return next
      })
    }
  }

  async function uygula(attributeId: number) {
    const ham = yeniDeger[attributeId] || ''
    const liste = ham
      .split(/[\n,\t]+/)
      .map((d) => d.trim())
      .filter(Boolean)
      .filter((d, i, arr) => arr.indexOf(d) === i)

    if (liste.length === 0) return

    setUygulamaYukleniyor((prev) => ({ ...prev, [attributeId]: true }))
    try {
      const res = await adminApi.post(
        '/admin/odoo-nitelik-deger-eslesme',
        { attributeId, degerler: liste },
      )
      const { secilen, varSayisi, yeniSayisi } = res.data

      const yeniIdler = secilen.map((s: { id: number }) => s.id)
      setSeciliDegerler((prev) => ({
        ...prev,
        [attributeId]: [...new Set([...(prev[attributeId] ?? []), ...yeniIdler])],
      }))

      const nitRes = await adminApi.get('/admin/odoo-nitelik-degerleri')
      setNitelikDegerleri(nitRes.data?.data ?? [])

      setUygulamaSonuc((prev) => ({
        ...prev,
        [attributeId]: { varSayisi, yeniSayisi },
      }))
      setTimeout(() => {
        setUygulamaSonuc((prev) => {
          const next = { ...prev }
          delete next[attributeId]
          return next
        })
      }, 5000)

      setYeniDeger((prev) => ({ ...prev, [attributeId]: '' }))

      if (!aktifNitelikler.includes(attributeId)) {
        setAktifNitelikler((prev) => [...prev, attributeId])
      }
    } catch {
      alert('İşlem başarısız')
    } finally {
      setUygulamaYukleniyor((prev) => ({ ...prev, [attributeId]: false }))
    }
  }

  async function kategoriKaydet(forceCreate = false) {
    if (!yeniKategori.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Kategori adı zorunlu' })
      return
    }
    setLoading(true)
    setMesaj(null)
    try {
      await adminApi.post('/admin/odoo-kategori-ekle', {
        ad: yeniKategori.ad,
        parentId: yeniKategori.parentId || undefined,
        ...(forceCreate ? { forceCreate: true } : {}),
      })
      setMesaj({ tip: 'ok', text: 'Kategori Odoo\'ya kaydedildi' })
      setYeniKategori({ ad: '', parentId: '', sirket: '' })
      await yukle()
    } catch (e: any) {
      const data = e?.response?.data
      if (data?.code === 'category-exists' && !forceCreate) {
        const onay = window.confirm(
          `${data.error ?? 'Benzer bir kategori zaten var.'}\n\nYine de yeni kategori oluşturulsun mu?`,
        )
        if (onay) {
          setLoading(false)
          await kategoriKaydet(true)
          return
        }
        setMesaj({ tip: 'err', text: data.error ?? 'Benzer kategori zaten mevcut' })
      } else if (data?.code === 'category-ambiguous') {
        setMesaj({
          tip: 'err',
          text: data.error ?? 'Kategori adı birden fazla olası eşleşmeye sahip, tam adını netleştirin.',
        })
      } else {
        setMesaj({ tip: 'err', text: data?.error ?? 'Kayıt hatası' })
      }
    } finally {
      setLoading(false)
    }
  }

  async function nitelikKaydet() {
    if (!yeniNitelik.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Nitelik adı zorunlu' })
      return
    }
    setLoading(true)
    setMesaj(null)
    try {
      const degerler = yeniNitelik.degerler.split(',').map((s) => s.trim()).filter(Boolean)
      await adminApi.post('/admin/odoo-nitelik-ekle', {
        ad: yeniNitelik.ad,
        displayType: yeniNitelik.displayType,
        degerler,
      })
      setMesaj({ tip: 'ok', text: 'Nitelik Odoo\'ya kaydedildi' })
      setYeniNitelik({ ad: '', displayType: 'select', degerler: '' })
      await yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Kayıt hatası' })
    } finally {
      setLoading(false)
    }
  }

  async function excelSablonIndir() {
    const res = await adminApi.get('/admin/odoo-sablon-excel/ornek-indir', { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'urun-sablon-toplu-aktar-ornek.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function excelDosyaYukle(file: File) {
    setExcelYukleniyor(true)
    setExcelAktarimSonuc(null)
    setExcelDogrulama(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await adminApi.post('/admin/odoo-sablon-excel/yukle', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setExcelSutunlar(res.data?.sutunlar ?? [])
      setExcelSatirlar(res.data?.satirlar ?? [])
      setExcelOrnekSatirlar(res.data?.ornekSatirlar ?? [])
      setExcelKolonMap(res.data?.varsayilanMap ?? { ...VARSAYILAN_SABLON_EXCEL_KOLON_MAP })
      setExcelDosyaAdi(file.name)
      setExcelAdim('eslestir')
      setMesaj({ tip: 'ok', text: `${res.data?.satirlar?.length ?? 0} satır yüklendi` })
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Excel yüklenemedi' })
    } finally {
      setExcelYukleniyor(false)
    }
  }

  async function excelDogrula() {
    if (!excelSatirlar.length) return
    setExcelYukleniyor(true)
    try {
      const res = await adminApi.post('/admin/odoo-sablon-excel/dogrula', {
        satirlar: excelSatirlar,
        kolonMap: excelKolonMap,
      })
      setExcelDogrulama(res.data)
      setExcelAdim('onizle')
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Doğrulama başarısız' })
    } finally {
      setExcelYukleniyor(false)
    }
  }

  async function excelAktar() {
    if (!excelDogrulama?.aktarilabilir) return
    const onay = window.confirm(
      `${excelDogrulama.ozet.gecerliSatir} satır aktarılacak. Devam?`,
    )
    if (!onay) return
    setExcelYukleniyor(true)
    try {
      const res = await adminApi.post('/admin/odoo-sablon-excel/aktar', {
        satirlar: excelSatirlar,
        kolonMap: excelKolonMap,
      })
      setExcelAktarimSonuc(res.data)
      setExcelAdim('sonuc')
      setMesaj({
        tip: 'ok',
        text: `${res.data?.aktarildi ?? 0} aktarıldı, ${res.data?.atlandi ?? 0} atlandı, ${res.data?.hata ?? 0} hata`,
      })
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Aktarım başarısız' })
    } finally {
      setExcelYukleniyor(false)
    }
  }

  // nginx proxy_read_timeout 60sn — büyük listelerde tek istek zaman aşımına
  // (504) uğrayıp arka planda aslında başarıyla tamamlanmasına rağmen
  // tarayıcıda "başarısız" görünmesine sebep oluyordu (bkz. Excel Envanter
  // importundaki aynı sorun / IMPORT_PARCA_BOYUTU). Bu yüzden istek parçalara
  // bölünüp arka arkaya gönderiliyor.
  const TOPLU_AC_PARCA_BOYUTU = 120

  function parcalaraBol<T>(dizi: T[], boyut: number): T[][] {
    const parcalar: T[][] = []
    for (let i = 0; i < dizi.length; i += boyut) parcalar.push(dizi.slice(i, i + boyut))
    return parcalar
  }

  async function topluAc() {
    if (!sablon.kategoriId) {
      setMesaj({ tip: 'err', text: 'Önce Adım 1\'den bir kategori seçin' })
      return
    }
    const adlar = topluUrunMetin
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!adlar.length) {
      setMesaj({ tip: 'err', text: 'Ürün adı listesi boş' })
      return
    }
    const onay = window.confirm(
      `${adlar.length} ürün adı, seçili kategoride STOKSUZ ve BARKODSUZ şablon olarak açılacak (fiyat 0, sonra düzenlenebilir). Devam?`,
    )
    if (!onay) return

    const parcalar = parcalaraBol(adlar, TOPLU_AC_PARCA_BOYUTU)
    setTopluYukleniyor(true)
    setTopluSonuc(null)
    const toplam = { olusturulan: 0, atlanan: 0, hata: 0, detay: { olusturulan: [] as any[], atlanan: [] as string[], hatalar: [] as any[] } }
    try {
      for (let i = 0; i < parcalar.length; i++) {
        setMesaj({ tip: 'ok', text: `Açılıyor... (${i + 1}/${parcalar.length} parça, ${parcalar[i].length} ürün)` })
        const res = await adminApi.post('/admin/odoo-sablon-toplu-olustur', {
          kategoriId: sablon.kategoriId,
          urunAdlari: parcalar[i],
        })
        toplam.olusturulan += res.data?.olusturulan ?? 0
        toplam.atlanan += res.data?.atlanan ?? 0
        toplam.hata += res.data?.hata ?? 0
        toplam.detay.olusturulan.push(...(res.data?.detay?.olusturulan ?? []))
        toplam.detay.atlanan.push(...(res.data?.detay?.atlanan ?? []))
        toplam.detay.hatalar.push(...(res.data?.detay?.hatalar ?? []))
      }
      setTopluSonuc(toplam)
      setMesaj({
        tip: 'ok',
        text: `${toplam.olusturulan} ürün açıldı, ${toplam.atlanan} zaten vardı (atlandı), ${toplam.hata} hata`,
      })
      if (toplam.olusturulan > 0) setTopluUrunMetin('')
    } catch (e: any) {
      setTopluSonuc(toplam.olusturulan || toplam.atlanan || toplam.hata ? toplam : null)
      setMesaj({
        tip: 'err',
        text: `${e?.response?.data?.error ?? 'Toplu açma başarısız'} — o ana kadar ${toplam.olusturulan} ürün açılmıştı, kalanı tekrar deneyebilirsiniz (zaten açılanlar atlanır).`,
      })
    } finally {
      setTopluYukleniyor(false)
    }
  }

  function excelSifirla() {
    setExcelSutunlar([])
    setExcelSatirlar([])
    setExcelOrnekSatirlar([])
    setExcelKolonMap({ ...VARSAYILAN_SABLON_EXCEL_KOLON_MAP })
    setExcelDosyaAdi('')
    setExcelDogrulama(null)
    setExcelAktarimSonuc(null)
    setExcelAdim('yukle')
  }

  async function sablonKaydet() {
    if (!sablon.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Ürün adı zorunlu' })
      return
    }
    setLoading(true)
    setMesaj(null)
    try {
      const res = await adminApi.post('/admin/odoo-sablon-olustur', {
        ad: sablon.ad,
        tur: sablon.tur,
        kategoriId: sablon.kategoriId || undefined,
        satisFiyati: sablon.satisFiyati,
        maliyet: sablon.maliyet,
        vergi: sablon.vergi,
        icReferans: sablon.icReferans,
        barkod: sablon.barkod,
        sirketId: sablon.sirket || undefined,
        faturaKurali: sablon.faturaKurali,
        izleme: sablon.izleme,
        teslimSuresi: sablon.teslimSuresi,
        agirlik: sablon.agirlik,
        hacim: sablon.hacim,
        satilabilir: sablon.satilabilir,
        satinAlinabilir: sablon.satinAlinabilir,
        masrafOlabilir: sablon.masrafOlabilir,
      })
      setTmplId(res.data?.tmplId ?? null)
      setAktifNitelikler([])
      setSeciliDegerler({})
      setVaryantlar([])
      setMesaj({ tip: 'ok', text: 'Şablon kaydedildi — nitelik atayabilirsiniz' })
      setAdim(3)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? e?.response?.data?.message ?? 'Şablon kaydedilemedi' })
    } finally {
      setLoading(false)
    }
  }

  async function sablonSecVeDevam() {
    if (!seciliSablon) return
    setLoading(true)
    setMesaj(null)
    try {
      const res = await adminApi.get(`/admin/odoo-sablon/${seciliSablon.id}`)
      const t = res.data?.data
      if (!t) {
        setMesaj({ tip: 'err', text: 'Şablon bulunamadı' })
        return
      }
      setTmplId(t.id)
      setSablon({
        ad: t.name ?? '',
        tur: t.type ?? 'product',
        kategoriId: t.categ_id?.[0] ? String(t.categ_id[0]) : '',
        satisFiyati: String(t.list_price ?? ''),
        maliyet: String(t.standard_price ?? ''),
        vergi: '10',
        icReferans: t.default_code || '',
        barkod: t.barcode || '',
        sirket: t.company_id?.[0] ? String(t.company_id[0]) : '',
        faturaKurali: t.invoice_policy ?? 'order',
        izleme: t.tracking ?? 'lot',
        teslimSuresi: t.sale_delay ?? 0,
        agirlik: t.weight ?? 0,
        hacim: t.volume ?? 0,
        satilabilir: !!t.sale_ok,
        satinAlinabilir: !!t.purchase_ok,
        masrafOlabilir: !!t.can_be_expensed,
      })
      setAktifNitelikler([])
      setSeciliDegerler({})
      setVaryantlar([])
      setMesaj({ tip: 'ok', text: 'Şablon seçildi — nitelik atayabilirsiniz' })
      setAdim(3)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? e?.response?.data?.message ?? 'Şablon yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }

  async function varyantlariSync() {
    setLoading(true)
    setMesaj(null)
    try {
      await adminApi.patch('/admin/odoo-varyant-guncelle', {
        varyantlar: varyantlar.map((v) => ({
          odooId: v.odooId,
          icReferans: v.icReferans,
          barkod: v.barkod,
          satisFiyati: v.satisFiyati,
          maliyet: v.maliyet,
        })),
      })
      setVaryantlar((prev) => prev.map((v) => ({ ...v, durum: 'synced' })))
      setMesaj({ tip: 'ok', text: 'Varyantlar Odoo\'ya senkronize edildi' })
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Sync hatası' })
    } finally {
      setLoading(false)
    }
  }

  function parseImportMetin(metin: string): string[][] {
    return metin
      .split('\n')
      .map((satir) => {
        const temiz = satir.trim()
        if (!temiz) return []
        if (temiz.includes('\t')) {
          return temiz.split('\t').map((s) => s.trim())
        }
        if (temiz.includes(',')) {
          return temiz
            .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
            .map((s) => s.trim().replace(/^"|"$/g, ''))
        }
        return temiz.split(/\s{2,}|\s+/).map((s) => s.trim()).filter(Boolean)
      })
      .filter((s) => s.length > 0 && s.some((h) => h.length > 0))
  }

  function apiSutunSirasi() {
    return {
      model: sutunSirasi.model,
      renk: sutunSirasi.renk,
      olcu: sutunSirasi.olcu,
      ...(sutunSirasi.barkod >= 0 ? { barkod: sutunSirasi.barkod } : {}),
      ...(sutunSirasi.fiyat >= 0 ? { fiyat: sutunSirasi.fiyat } : {}),
    }
  }

  async function onizle() {
    const satirlar = parseImportMetin(importMetin)
    if (!satirlar.length || !tmplId) return
    setImportYukleniyor(true)
    try {
      const res = await adminApi.post('/admin/odoo-varyant-onizle', {
        tmplId,
        satirlar,
        sutunSirasi: apiSutunSirasi(),
      })
      setOnizleme(res.data)
      setImportSonuc(null)
    } catch {
      alert('Önizleme başarısız')
    } finally {
      setImportYukleniyor(false)
    }
  }

  async function varyantImportOlustur() {
    if (!onizleme || !tmplId) return
    const onay = window.confirm(
      `${onizleme.hazir + onizleme.yeniDeger} varyant oluşturulacak.\n`
      + `${onizleme.yeniDeger} yeni nitelik değeri eklenecek.\n`
      + `${onizleme.hata + onizleme.duplicate} satır atlanacak.\n\nDevam?`,
    )
    if (!onay) return
    const satirlar = parseImportMetin(importMetin)
    setImportYukleniyor(true)
    try {
      const res = await adminApi.post('/admin/odoo-varyant-import', {
        tmplId,
        satirlar,
        sutunSirasi: apiSutunSirasi(),
      })
      setImportSonuc(res.data)
      setOnizleme(null)
      setImportMetin('')
      const yeni = (res.data?.detay?.sonuclar ?? []).map((s: any) => ({
        odooId: s.varyantId,
        name: `${s.model} / ${s.renk} / ${s.olcu}`,
        model: s.model,
        renk: s.renk,
        olcu: s.olcu,
        icReferans: '',
        barkod: s.barkod || '',
        satisFiyati: String(s.fiyat ?? 0),
        maliyet: '0',
        durum: 'bekliyor' as const,
      }))
      if (yeni.length) setVaryantlar((prev) => [...prev, ...yeni])
    } catch {
      alert('Import başarısız')
    } finally {
      setImportYukleniyor(false)
    }
  }

  function importDurumBadge(durum: string) {
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      hazir: { bg: '#dcfce7', color: GREEN, label: '✓ Hazır' },
      yeni_deger: { bg: '#dbeafe', color: BLUE, label: '+ Yeni değer' },
      hata: { bg: '#fee2e2', color: RED, label: '✗ Hatalı' },
      duplicate: { bg: '#fef3c7', color: AMBER, label: '⚠ Duplicate' },
    }
    const s = styles[durum] ?? { bg: '#f3f4f6', color: '#6b7280', label: durum }
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
        backgroundColor: s.bg, color: s.color, whiteSpace: 'nowrap',
      }}>
        {s.label}
      </span>
    )
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900 }}>Ürün Yapılandırma</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>
        Odoo ürün kategorisi, nitelik, şablon ve varyant yönetimi
      </p>

      {mesaj ? (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 700,
          backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b',
        }}>
          {mesaj.tip === 'ok' ? '✓ ' : '✕ '}{mesaj.text}
        </div>
      ) : null}

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
        {ADIMLAR.map((label, i) => {
          const step = i + 1
          const done = adim > step
          const active = adim === step
          return (
            <button
              key={label}
              type="button"
              onClick={() => setAdim(step)}
              style={{
                flex: 1,
                padding: '12px 8px',
                border: 'none',
                borderRight: i < ADIMLAR.length - 1 ? '1px solid #e5e7eb' : 'none',
                backgroundColor: done ? '#f0fdf4' : active ? '#fef2f2' : '#f9fafb',
                color: done ? GREEN : active ? RED : '#6b7280',
                fontWeight: active ? 900 : done ? 700 : 500,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 10, opacity: 0.7 }}>{step}</div>
              {label}
            </button>
          )
        })}
      </div>

      {/* ADIM 1 — KATEGORİ */}
      {adim === 1 ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Odoo Kategori Ağacı</div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <div style={{ fontSize: 13 }}>
                {siraliKategoriler.filter((k) => k.id !== 1).map((k) => {
                  const depth = (k.complete_name.match(/\//g) || []).length
                  return (
                    <div
                      key={k.id}
                      style={{
                        padding: '6px 8px',
                        borderBottom: '1px solid #f3f4f6',
                        paddingLeft: depth * 16 + 8,
                        cursor: 'pointer',
                        backgroundColor: sablon.kategoriId === String(k.id) ? '#f0f9ff' : undefined,
                      }}
                      onClick={() => setSablon((s) => ({ ...s, kategoriId: String(k.id) }))}
                    >
                      <span style={{ color: '#9ca3af', fontSize: 11, marginRight: 6 }}>#{k.id}</span>
                      {k.complete_name}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#f9fafb' }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Yeni Kategori</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280' }}>Kategori Adı *</label>
                <input value={yeniKategori.ad} onChange={(e) => setYeniKategori((p) => ({ ...p, ad: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280' }}>Üst Kategori</label>
                <select value={yeniKategori.parentId} onChange={(e) => setYeniKategori((p) => ({ ...p, parentId: e.target.value }))} style={inp}>
                  <option value="">— Kök (All altı) —</option>
                  <option value="1">All (kök)</option>
                  {siraliKategoriler.filter((k) => k.id !== 1).map((k) => (
                    <option key={k.id} value={k.id}>{k.complete_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280' }}>Şirket (bilgi)</label>
                <select value={yeniKategori.sirket} onChange={(e) => setYeniKategori((p) => ({ ...p, sirket: e.target.value }))} style={inp}>
                  <option value="">—</option>
                  {SIRKETLER.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}
                </select>
              </div>
              <button type="button" onClick={() => void kategoriKaydet()} disabled={loading} style={btnPrimary}>
                {loading ? 'Kaydediliyor...' : 'Odoo\'ya kaydet'}
              </button>
            </div>
            <button type="button" onClick={() => setAdim(2)} style={{ ...btnSmall, marginTop: 16, width: '100%' }}>
              Sonraki: Ürün şablonu →
            </button>
          </div>
        </div>
      ) : null}

      {/* ADIM 2 — ÜRÜN ŞABLONU */}
      {adim === 2 ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, backgroundColor: 'white' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => setSablonModu('sec')}
              style={{
                flex: 1,
                padding: '10px 16px',
                border: sablonModu === 'sec' ? `2px solid ${RED}` : '1px solid #e5e7eb',
                borderRadius: 8,
                backgroundColor: sablonModu === 'sec' ? '#fef2f2' : '#f9fafb',
                color: sablonModu === 'sec' ? RED : '#6b7280',
                fontWeight: sablonModu === 'sec' ? 800 : 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Mevcut şablon seç
            </button>
            <button
              type="button"
              onClick={() => setSablonModu('yeni')}
              style={{
                flex: 1,
                padding: '10px 16px',
                border: sablonModu === 'yeni' ? `2px solid ${RED}` : '1px solid #e5e7eb',
                borderRadius: 8,
                backgroundColor: sablonModu === 'yeni' ? '#fef2f2' : '#f9fafb',
                color: sablonModu === 'yeni' ? RED : '#6b7280',
                fontWeight: sablonModu === 'yeni' ? 800 : 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Yeni şablon oluştur
            </button>
            <button
              type="button"
              onClick={() => { setSablonModu('excel'); excelSifirla() }}
              style={{
                flex: 1,
                padding: '10px 16px',
                border: sablonModu === 'excel' ? `2px solid ${BLUE}` : '1px solid #e5e7eb',
                borderRadius: 8,
                backgroundColor: sablonModu === 'excel' ? '#eff6ff' : '#f9fafb',
                color: sablonModu === 'excel' ? BLUE : '#6b7280',
                fontWeight: sablonModu === 'excel' ? 800 : 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Excel&apos;den Toplu Aktar
            </button>
            <button
              type="button"
              onClick={() => setSablonModu('toplu')}
              style={{
                flex: 1,
                padding: '10px 16px',
                border: sablonModu === 'toplu' ? `2px solid ${GREEN}` : '1px solid #e5e7eb',
                borderRadius: 8,
                backgroundColor: sablonModu === 'toplu' ? '#f0fdf4' : '#f9fafb',
                color: sablonModu === 'toplu' ? GREEN : '#6b7280',
                fontWeight: sablonModu === 'toplu' ? 800 : 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Toplu Aç (Stoksuz)
            </button>
          </div>

          {sablonModu === 'toplu' ? (
            <div>
              <div style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 10,
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                fontSize: 12,
                color: '#166534',
                lineHeight: 1.5,
              }}>
                Her satıra bir ürün adı yazın. Her satır, Adım 1&apos;de seçtiğiniz kategoride
                <strong> stoksuz, barkodsuz, varyantsız</strong> ayrı bir şablon olarak açılır
                (satış fiyatı 0 — sonra düzenlenebilir). Satış ekranlarında bu kategori
                seçildiğinde direkt listelenir. Aynı isim+kategoride zaten şablon varsa
                atlanır, tekrar çalıştırmak güvenlidir.
              </div>
              <div style={{ marginBottom: 12, fontSize: 12, color: '#374151' }}>
                Seçili kategori:{' '}
                <strong>
                  {sablon.kategoriId
                    ? (kategoriler.find((k) => String(k.id) === sablon.kategoriId)?.complete_name ?? `#${sablon.kategoriId}`)
                    : '— (Adım 1\'den seçin) —'}
                </strong>
              </div>
              <textarea
                value={topluUrunMetin}
                onChange={(e) => setTopluUrunMetin(e.target.value)}
                placeholder={'Stok Cam Beyaz Standart 1.50\nStok Cam Beyaz Standart 1.56\nStok Cam Fotokromik Prime 1.60\n...'}
                rows={10}
                style={{ ...inp, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <button type="button" onClick={() => setAdim(1)} style={btnSmall}>← Kategori seç</button>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  {topluUrunMetin.split('\n').map((s) => s.trim()).filter(Boolean).length} ürün adı
                </span>
                <button
                  type="button"
                  disabled={topluYukleniyor || !sablon.kategoriId}
                  onClick={() => void topluAc()}
                  style={{ ...btnPrimary, backgroundColor: GREEN }}
                >
                  {topluYukleniyor ? 'Açılıyor...' : 'Toplu aç →'}
                </button>
              </div>

              {topluSonuc ? (
                <div style={{
                  marginTop: 16,
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: '#dcfce7',
                  border: '1px solid #bbf7d0',
                }}>
                  <div style={{ fontWeight: 900, fontSize: 15, color: GREEN, marginBottom: 8 }}>
                    {topluSonuc.olusturulan} açıldı · {topluSonuc.atlanan} zaten vardı · {topluSonuc.hata} hata
                  </div>
                  {(topluSonuc.detay?.atlanan ?? []).length > 0 ? (
                    <div style={{ fontSize: 11, color: '#92400e', marginBottom: 6 }}>
                      Zaten vardı: {topluSonuc.detay.atlanan.join(', ')}
                    </div>
                  ) : null}
                  {(topluSonuc.detay?.hatalar ?? []).length > 0 ? (
                    <div style={{ fontSize: 11, color: RED }}>
                      {topluSonuc.detay.hatalar.map((h: any) => (
                        <div key={h.ad}>{h.ad}: {h.sebep}</div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {sablonModu === 'excel' ? (
            <div>
              <div style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 10,
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                fontSize: 12,
                color: '#92400e',
                lineHeight: 1.5,
              }}>
                Renk/ölçü varyantlı ürünler için <strong>Model</strong>, <strong>Renk</strong> ve <strong>Ölçü</strong> sütunlarının
                hepsini doldurun — aynı şablon adı altında tek ürün + varyantlar oluşur.
                Boş bırakırsanız her satır için ayrı, varyantsız bir şablon oluşturulur.
                Zaten varyantlı bir ürünün adını/barkodunu düz satırla aktarmaya çalışırsanız satır atlanır.
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" onClick={() => void excelSablonIndir()} style={{ ...btnPrimary, backgroundColor: BLUE }}>
                  Örnek şablonu indir
                </button>
                <label style={{ ...btnSmall, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  Excel yükle
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void excelDosyaYukle(f)
                      e.target.value = ''
                    }}
                  />
                </label>
                {excelDosyaAdi ? (
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    {excelDosyaAdi} · {excelSatirlar.length} satır
                  </span>
                ) : null}
                {excelDosyaAdi ? (
                  <button type="button" onClick={excelSifirla} style={btnSmall}>Sıfırla</button>
                ) : null}
              </div>

              {excelAdim !== 'yukle' && excelSutunlar.length > 0 ? (
                <div style={{ marginBottom: 20, border: '1px solid #bfdbfe', borderRadius: 12, overflow: 'hidden', backgroundColor: '#eff6ff' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #bfdbfe' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#1e40af' }}>Sütun Eşleştirme</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      Her hedef alan için Excel&apos;deki sütunu seçin (* zorunlu)
                    </div>
                  </div>
                  <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                    {SABLON_EXCEL_HEDEF_ALANLARI.map((alan) => (
                      <label key={alan} style={{ fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: '#374151' }}>{SABLON_EXCEL_HEDEF_ETIKETLER[alan]}</span>
                        <select
                          value={excelKolonMap[alan] === 'yoksay' ? 'yoksay' : String(excelKolonMap[alan])}
                          onChange={(e) => {
                            const v = e.target.value
                            setExcelKolonMap((prev) => ({
                              ...prev,
                              [alan]: v === 'yoksay' ? 'yoksay' : Number(v),
                            }))
                            setExcelDogrulama(null)
                          }}
                          style={{ ...inp, marginTop: 4, fontSize: 12 }}
                        >
                          <option value="yoksay">— Yoksay —</option>
                          {excelSutunlar.map((sutun, idx) => (
                            <option key={idx} value={idx}>
                              Sütun {idx + 1}: {sutun || '(boş başlık)'}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  {excelOrnekSatirlar.length > 0 ? (
                    <div style={{ overflowX: 'auto', padding: 12, borderTop: '1px solid #bfdbfe' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, backgroundColor: '#fff', borderRadius: 8 }}>
                        <thead>
                          <tr style={{ backgroundColor: '#dbeafe' }}>
                            {excelSutunlar.map((s, i) => (
                              <th key={i} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>{s || `#${i + 1}`}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {excelOrnekSatirlar.map((row, ri) => (
                            <tr key={ri} style={{ borderTop: '1px solid #f3f4f6' }}>
                              {excelSutunlar.map((_, ci) => (
                                <td key={ci} style={{ padding: '5px 8px' }}>{row[ci] || '—'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #bfdbfe' }}>
                    <button
                      type="button"
                      disabled={excelYukleniyor}
                      onClick={() => void excelDogrula()}
                      style={{ ...btnPrimary, backgroundColor: BLUE }}
                    >
                      {excelYukleniyor ? 'Doğrulanıyor...' : 'Doğrula ve önizle →'}
                    </button>
                  </div>
                </div>
              ) : null}

              {excelDogrulama ? (
                <div style={{ marginBottom: 20, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#fafafa' }}>
                  <div style={{ fontWeight: 800, marginBottom: 12 }}>Önizleme / Doğrulama</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, marginBottom: 12 }}>
                    <span>Toplam: <strong>{excelDogrulama.ozet?.toplamSatir ?? 0}</strong></span>
                    <span style={{ color: GREEN }}>Geçerli: <strong>{excelDogrulama.ozet?.gecerliSatir ?? 0}</strong></span>
                    <span style={{ color: AMBER }}>Zorunlu boş: <strong>{excelDogrulama.ozet?.atlanacakZorunluBos ?? 0}</strong></span>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Kategoriler</div>
                    {(excelDogrulama.kategoriler ?? []).map((k: any) => (
                      <div key={k.yol} style={{ fontSize: 12, color: k.bulundu ? GREEN : RED, marginBottom: 4 }}>
                        {k.bulundu ? '✓' : '✗'} {k.yol} ({k.satirlar?.length ?? 0} satır)
                      </div>
                    ))}
                  </div>

                  {(excelDogrulama.kdvOranlari ?? []).length > 0 ? (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>KDV oranları</div>
                      {excelDogrulama.kdvOranlari.map((k: any) => (
                        <div key={k.oran} style={{ fontSize: 12, color: k.bulundu ? GREEN : RED, marginBottom: 4 }}>
                          {k.bulundu ? '✓' : '✗'} %{k.oran} ({k.satirlar?.length ?? 0} satır)
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {(excelDogrulama.zorunluBosSatirlar ?? []).length > 0 ? (
                    <div style={{ marginBottom: 12, fontSize: 12, color: RED }}>
                      Zorunlu alanı boş satırlar (aktarılmayacak):{' '}
                      {excelDogrulama.zorunluBosSatirlar.map((z: any) => `#${z.satirNo}`).join(', ')}
                    </div>
                  ) : null}

                  {(excelDogrulama.gecersizKdvSatirlar ?? []).length > 0 ? (
                    <div style={{ marginBottom: 12, fontSize: 12, color: RED }}>
                      Geçersiz KDV değeri: satır {excelDogrulama.gecersizKdvSatirlar.join(', ')}
                    </div>
                  ) : null}

                  {(excelDogrulama.varyantKismiDoluSatirlar ?? []).length > 0 ? (
                    <div style={{ marginBottom: 12, fontSize: 12, color: RED }}>
                      Model/Renk/Ölçü kısmen dolu: satır {excelDogrulama.varyantKismiDoluSatirlar.join(', ')}
                    </div>
                  ) : null}

                  {(excelDogrulama.varyantGuvenlikAtlamalari ?? []).length > 0 ? (
                    <div style={{ marginBottom: 12, fontSize: 12, color: AMBER }}>
                      Varyantlı ürün — düz satır atlanacak:{' '}
                      {(excelDogrulama.varyantGuvenlikAtlamalari ?? []).map((v: any) => `#${v.satirNo}`).join(', ')}
                    </div>
                  ) : null}

                  {excelDogrulama.niteliklerHazir === false ? (
                    <div style={{ marginBottom: 12, fontSize: 12, color: RED }}>
                      Odoo&apos;da MODEL / RENK / ÖLÇÜ nitelikleri bulunamadı — varyantlı satırlar aktarılamaz.
                    </div>
                  ) : null}

                  {excelDogrulama.aktarilabilir ? (
                    <button
                      type="button"
                      disabled={excelYukleniyor}
                      onClick={() => void excelAktar()}
                      style={{ ...btnPrimary, backgroundColor: GREEN }}
                    >
                      {excelYukleniyor ? 'Aktarılıyor...' : `${excelDogrulama.ozet?.gecerliSatir ?? 0} satırı aktar →`}
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: RED, fontWeight: 700 }}>
                      Aktarım engellendi — kategori/KDV doğrulamasını düzeltin
                    </div>
                  )}
                </div>
              ) : null}

              {excelAktarimSonuc ? (
                <div style={{
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: '#dcfce7',
                  border: '1px solid #bbf7d0',
                  marginBottom: 16,
                }}>
                  <div style={{ fontWeight: 900, fontSize: 16, color: GREEN, marginBottom: 8 }}>
                    {excelAktarimSonuc.aktarildi} aktarıldı · {excelAktarimSonuc.atlandi} atlandı · {excelAktarimSonuc.hata} hata
                  </div>
                  {(excelAktarimSonuc.detay ?? []).filter((d: any) => !['created', 'variant-created', 'variant-updated'].includes(d.durum)).slice(0, 20).map((d: any) => (
                    <div key={`${d.satirNo}-${d.ad}`} style={{ fontSize: 11, color: '#374151', marginBottom: 2 }}>
                      Satır {d.satirNo}: {d.ad} — {d.durum}{d.sebep ? ` (${d.sebep})` : ''}
                    </div>
                  ))}
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setAdim(1)} style={btnSmall}>← Kategori</button>
              </div>
            </div>
          ) : null}

          {sablonModu === 'sec' ? (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Şablon adı veya referans ara..."
                  value={sablonArama}
                  onChange={(e) => setSablonArama(e.target.value)}
                  style={{ flex: 3, ...inp }}
                />
                <select
                  value={sablonKategoriFiltre}
                  onChange={(e) => setSablonKategoriFiltre(e.target.value)}
                  style={{ flex: 1, ...inp }}
                >
                  <option value="">Tüm kategoriler</option>
                  {kategoriler
                    .filter((k) => k.id !== 1)
                    .map((k) => (
                      <option key={k.id} value={String(k.id)}>
                        {k.complete_name.replace('All / ', '')}
                      </option>
                    ))}
                </select>
              </div>

              {sablonYukleniyor ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                  Şablonlar yükleniyor...
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Ad</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Kategori</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Varyant</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtreliSablonlar.map((s) => {
                        const secili = seciliSablon?.id === s.id
                        const aktif = (s.product_variant_count ?? 0) > 0
                        return (
                          <tr
                            key={s.id}
                            onClick={() => setSeciliSablon(s)}
                            style={{
                              borderBottom: '1px solid #f3f4f6',
                              cursor: 'pointer',
                              borderLeft: secili ? `3px solid ${RED}` : '3px solid transparent',
                              backgroundColor: secili ? '#fef2f2' : undefined,
                            }}
                          >
                            <td style={{ padding: '10px 12px' }}>
                              {s.name}
                              <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 6 }}>#{s.id}</span>
                            </td>
                            <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                              {Array.isArray(s.categ_id) ? s.categ_id[1] : '—'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>{s.product_variant_count ?? 0}</td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 20,
                                backgroundColor: aktif ? '#dcfce7' : '#fef3c7',
                                color: aktif ? GREEN : '#92400e',
                              }}>
                                {aktif ? 'Aktif' : 'Taslak'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {filtreliSablonlar.length === 0 ? (
                        <tr>
                          <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                            Şablon bulunamadı
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center' }}>
                <button type="button" onClick={() => setAdim(1)} style={btnSmall}>← Kategori</button>
                {seciliSablon ? (
                  <span style={{ fontSize: 13, color: '#6b7280', flex: 1 }}>
                    Seçili: <strong>{seciliSablon.name}</strong>
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: '#9ca3af', flex: 1 }}>Listeden bir şablon seçin</span>
                )}
                <button
                  type="button"
                  onClick={() => void sablonSecVeDevam()}
                  disabled={loading || !seciliSablon}
                  style={{ ...btnPrimary, backgroundColor: RED }}
                >
                  {loading ? 'Yükleniyor...' : 'Bu şablonla devam et →'}
                </button>
              </div>
            </div>
          ) : sablonModu === 'yeni' ? (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                {[
                  ['satilabilir', 'Satılabilir'],
                  ['satinAlinabilir', 'Satın alınabilir'],
                  ['masrafOlabilir', 'Masraf olabilir'],
                ].map(([key, label]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={sablon[key as keyof typeof sablon] as boolean}
                      onChange={(e) => setSablon((s) => ({ ...s, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Ürün Adı *</label>
                  <input value={sablon.ad} onChange={(e) => setSablon((s) => ({ ...s, ad: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Ürün Türü</label>
                  <select value={sablon.tur} onChange={(e) => setSablon((s) => ({ ...s, tur: e.target.value }))} style={inp}>
                    <option value="product">Stoklanabilir</option>
                    <option value="consu">Sarf</option>
                    <option value="service">Hizmet</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Kategori</label>
                  <select value={sablon.kategoriId} onChange={(e) => setSablon((s) => ({ ...s, kategoriId: e.target.value }))} style={inp}>
                    <option value="">— Seçin —</option>
                    {siraliKategoriler.map((k) => (
                      <option key={k.id} value={k.id}>{k.complete_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Şirket</label>
                  <select value={sablon.sirket} onChange={(e) => setSablon((s) => ({ ...s, sirket: e.target.value }))} style={inp}>
                    <option value="">—</option>
                    {SIRKETLER.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Satış Fiyatı (₺)</label>
                  <input type="number" value={sablon.satisFiyati} onChange={(e) => setSablon((s) => ({ ...s, satisFiyati: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Maliyet (₺)</label>
                  <input type="number" value={sablon.maliyet} onChange={(e) => setSablon((s) => ({ ...s, maliyet: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Vergi (%)</label>
                  <input type="number" value={sablon.vergi} onChange={(e) => setSablon((s) => ({ ...s, vergi: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>İç Referans</label>
                  <input value={sablon.icReferans} onChange={(e) => setSablon((s) => ({ ...s, icReferans: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Barkod</label>
                  <input value={sablon.barkod} onChange={(e) => setSablon((s) => ({ ...s, barkod: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>İzleme</label>
                  <select value={sablon.izleme} onChange={(e) => setSablon((s) => ({ ...s, izleme: e.target.value }))} style={inp}>
                    <option value="lot">Lot</option>
                    <option value="serial">Seri</option>
                    <option value="none">Yok</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Teslim Süresi (gün)</label>
                  <input type="number" value={sablon.teslimSuresi} onChange={(e) => setSablon((s) => ({ ...s, teslimSuresi: Number(e.target.value) }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Ağırlık (kg)</label>
                  <input type="number" value={sablon.agirlik} onChange={(e) => setSablon((s) => ({ ...s, agirlik: Number(e.target.value) }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Hacim (m³)</label>
                  <input type="number" value={sablon.hacim} onChange={(e) => setSablon((s) => ({ ...s, hacim: Number(e.target.value) }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280' }}>Faturalama Kuralı</label>
                  <select value={sablon.faturaKurali} onChange={(e) => setSablon((s) => ({ ...s, faturaKurali: e.target.value }))} style={inp}>
                    <option value="order">Sipariş miktarı</option>
                    <option value="delivery">Teslim edilen miktar</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setAdim(1)} style={btnSmall}>← Kategori</button>
                <button type="button" onClick={() => void sablonKaydet()} disabled={loading} style={{ ...btnPrimary, backgroundColor: RED }}>
                  {loading ? 'Kaydediliyor...' : 'Kaydet ve devam et'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ADIM 3 — NİTELİK & DEĞER (şablona özel) */}
      {adim === 3 ? (
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 16 }}>
            Nitelik & değerler — {sablon.ad || 'Şablon'}
            {tmplId ? <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginLeft: 8 }}>(Odoo #{tmplId})</span> : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
            {/* SOL — Ana kart */}
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 800 }}>Şablona nitelik & değer ata</div>
                {sablonVaryantSayisi > 0 ? (
                  <span style={{ fontSize: 13, fontWeight: 700, color: RED }}>
                    {sablonVaryantSayisi} varyant
                  </span>
                ) : null}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {nitelikler.map((nitelik) => {
                  const aktif = aktifNitelikler.includes(nitelik.id)
                  const seciliIds = seciliDegerler[nitelik.id] ?? []
                  const seciliAdlar = seciliIds
                    .map((id) => nitelikDegerleri.find((d) => d.id === id)?.name)
                    .filter(Boolean) as string[]
                  const sonuc = uygulamaSonuc[nitelik.id]

                  return (
                    <div
                      key={nitelik.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 10,
                        padding: 14,
                        backgroundColor: aktif ? '#fafafa' : 'white',
                      }}
                    >
                      {/* 1. Üst satır: checkbox + ad */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
                        <input
                          type="checkbox"
                          checked={aktif}
                          onChange={(e) => toggleSablonNitelik(nitelik.id, e.target.checked)}
                        />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{nitelik.name}</span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>{nitelik.display_type}</span>
                      </label>

                      {/* 2. Seçili değer badge'leri */}
                      {aktif ? (
                        seciliAdlar.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                            {seciliAdlar.map((ad) => (
                              <span
                                key={ad}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 10px',
                                  borderRadius: 20,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  backgroundColor: '#dcfce7',
                                  color: GREEN,
                                  border: '1px solid #bbf7d0',
                                }}
                              >
                                ✓ {ad}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
                            Henüz değer seçilmedi
                          </div>
                        )
                      ) : null}

                      {/* 3. Textarea + Uygula */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <textarea
                          placeholder={"Excel'den yapıştır (satır satır):\nMU1080\nMU1116\n\nveya virgülle: MU1080, MU1116"}
                          value={yeniDeger[nitelik.id] || ''}
                          onChange={(e) => setYeniDeger((prev) => ({
                            ...prev,
                            [nitelik.id]: e.target.value,
                          }))}
                          style={{
                            flex: 1,
                            fontSize: 11,
                            fontFamily: 'monospace',
                            height: 72,
                            resize: 'vertical',
                            border: '0.5px solid #e5e7eb',
                            borderRadius: 6,
                            padding: '6px 8px',
                            color: '#111',
                            background: 'white',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void uygula(nitelik.id)}
                          disabled={uygulamaYukleniyor[nitelik.id]}
                          style={{
                            fontSize: 12,
                            padding: '8px 16px',
                            background: RED,
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            cursor: uygulamaYukleniyor[nitelik.id] ? 'wait' : 'pointer',
                            whiteSpace: 'nowrap',
                            fontWeight: 700,
                          }}
                        >
                          {uygulamaYukleniyor[nitelik.id] ? 'Uygulanıyor...' : 'Uygula'}
                        </button>
                      </div>

                      {/* 4. Sonuç bandı */}
                      {sonuc ? (
                        <div style={{
                          marginTop: 10,
                          padding: '8px 12px',
                          borderRadius: 6,
                          backgroundColor: '#dcfce7',
                          fontSize: 12,
                          color: '#166534',
                          lineHeight: 1.5,
                        }}>
                          ✓ {sonuc.varSayisi} zaten vardı, seçildi
                          {sonuc.yeniSayisi > 0 ? (
                            <><br />+ {sonuc.yeniSayisi} yeni Odoo&apos;ya eklendi ve seçildi</>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {/* Alt bar */}
              <div style={{
                marginTop: 20,
                padding: '14px 16px',
                borderRadius: 8,
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  Nitelikleri seçin. Varyantlar bir sonraki adımda Excel import ile oluşturulacak.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setAdim(2)} style={btnSmall}>← Şablon</button>
                  <button
                    type="button"
                    onClick={() => setAdim(4)}
                    disabled={aktifNitelikler.length === 0}
                    style={{ ...btnPrimary, backgroundColor: RED }}
                  >
                    {loading ? 'Oluşturuluyor...' : 'Varyantları oluştur →'}
                  </button>
                </div>
              </div>
            </div>

            {/* SAĞ — Sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#f9fafb' }}>
                <div style={{ fontWeight: 800, marginBottom: 12 }}>Yeni global nitelik ekle</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280' }}>Nitelik Adı *</label>
                    <input value={yeniNitelik.ad} onChange={(e) => setYeniNitelik((p) => ({ ...p, ad: e.target.value }))} placeholder="ör: MODEL" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280' }}>Görünüm Tipi</label>
                    <select value={yeniNitelik.displayType} onChange={(e) => setYeniNitelik((p) => ({ ...p, displayType: e.target.value }))} style={inp}>
                      <option value="select">Select</option>
                      <option value="radio">Radio</option>
                      <option value="color">Color</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280' }}>Değerler (virgülle)</label>
                    <input value={yeniNitelik.degerler} onChange={(e) => setYeniNitelik((p) => ({ ...p, degerler: e.target.value }))} placeholder="2140, 3025, SF767" style={inp} />
                  </div>
                  <button type="button" onClick={() => void nitelikKaydet()} disabled={loading} style={btnPrimary}>
                    {loading ? 'Kaydediliyor...' : 'Odoo\'ya kaydet'}
                  </button>
                </div>
              </div>

              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: 'white' }}>
                <div style={{ fontWeight: 800, marginBottom: 12 }}>Nasıl çalışır?</div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      display: 'inline-block', padding: '1px 8px', borderRadius: 20,
                      backgroundColor: '#dcfce7', color: GREEN, fontWeight: 600, fontSize: 11,
                    }}>✓</span>
                    Yeşil = Odoo&apos;da vardı, seçildi
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      display: 'inline-block', padding: '1px 8px', borderRadius: 20,
                      backgroundColor: '#dbeafe', color: BLUE, fontWeight: 600, fontSize: 11,
                    }}>+</span>
                    Mavi = Yeni oluşturuldu ve seçildi
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                    Mükerrer değerler otomatik atlanır
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ADIM 4 — VARYANTLAR */}
      {adim === 4 ? (
        <div>
          {tmplId ? (
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
              Şablon Odoo ID: <strong>{tmplId}</strong> · {varyantlar.length} varyant
            </div>
          ) : null}

          {/* Sekme butonları */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setImportMod('import')}
              style={{
                padding: '10px 20px',
                border: importMod === 'import' ? `2px solid ${RED}` : '1px solid #e5e7eb',
                borderRadius: 8,
                backgroundColor: importMod === 'import' ? '#fef2f2' : '#f9fafb',
                color: importMod === 'import' ? RED : '#6b7280',
                fontWeight: importMod === 'import' ? 800 : 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Import ile oluştur
            </button>
            <button
              type="button"
              onClick={() => setImportMod('liste')}
              style={{
                padding: '10px 20px',
                border: importMod === 'liste' ? `2px solid ${RED}` : '1px solid #e5e7eb',
                borderRadius: 8,
                backgroundColor: importMod === 'liste' ? '#fef2f2' : '#f9fafb',
                color: importMod === 'liste' ? RED : '#6b7280',
                fontWeight: importMod === 'liste' ? 800 : 500,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Mevcut varyantlar
            </button>
            <button type="button" onClick={() => setAdim(3)} style={{ ...btnSmall, marginLeft: 'auto' }}>
              ← Nitelik & değer
            </button>
          </div>

          {importMod === 'import' ? (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, backgroundColor: 'white', marginBottom: 16 }}>
              {/* Sütun sırası */}
              <div style={{ fontWeight: 800, marginBottom: 12 }}>Sütun eşleştirme</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                {([
                  ['model', 'Model', false],
                  ['renk', 'Renk', false],
                  ['olcu', 'Ölçü', false],
                  ['barkod', 'Barkod', true],
                  ['fiyat', 'Fiyat', true],
                ] as const).map(([key, label, optional]) => (
                  <div key={key} style={{ minWidth: 120 }}>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
                    <select
                      value={sutunSirasi[key]}
                      onChange={(e) => setSutunSirasi((p) => ({
                        ...p,
                        [key]: Number(e.target.value),
                      }))}
                      style={{ ...inp, padding: '5px 8px', fontSize: 12 }}
                    >
                      {optional ? <option value={-1}>Bu sütun yok</option> : null}
                      {[0, 1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>Sütun {n + 1}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Yapıştır alanı */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
                <textarea
                  placeholder={'Excel\'den yapıştır (tab ile ayrılmış):\n2140\tSiyah\t52\t8690000000001\t1500\n3025\tKahve\t54\t8690000000002\t1800'}
                  value={importMetin}
                  onChange={(e) => setImportMetin(e.target.value)}
                  style={{
                    flex: 1,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    height: 120,
                    resize: 'vertical',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '8px 10px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => void onizle()}
                  disabled={importYukleniyor || !importMetin.trim() || !tmplId}
                  style={{ ...btnPrimary, backgroundColor: RED, whiteSpace: 'nowrap' }}
                >
                  {importYukleniyor ? 'Yükleniyor...' : 'Önizle →'}
                </button>
              </div>

              {/* Önizleme tablosu */}
              {onizleme ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap', fontSize: 12 }}>
                    <span style={{ color: GREEN, fontWeight: 700 }}>✓ {onizleme.hazir} hazır</span>
                    <span style={{ color: BLUE, fontWeight: 700 }}>+ {onizleme.yeniDeger} yeni değer</span>
                    <span style={{ color: RED, fontWeight: 700 }}>✗ {onizleme.hata} hatalı</span>
                    <span style={{ color: AMBER, fontWeight: 700 }}>⚠ {onizleme.duplicate} duplicate</span>
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb', position: 'sticky', top: 0 }}>
                          {['#', 'Model', 'Renk', 'Ölçü', 'Barkod', 'Fiyat', 'Durum'].map((h) => (
                            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(onizleme.satirlar ?? []).map((s: any) => (
                          <tr key={s.satir} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '5px 8px' }}>{s.satir}</td>
                            <td style={{ padding: '5px 8px' }}>{s.model || '—'}</td>
                            <td style={{ padding: '5px 8px' }}>{s.renk || '—'}</td>
                            <td style={{ padding: '5px 8px' }}>{s.olcu || '—'}</td>
                            <td style={{ padding: '5px 8px' }}>{s.barkod || '—'}</td>
                            <td style={{ padding: '5px 8px' }}>{s.fiyat || '—'}</td>
                            <td style={{ padding: '5px 8px' }}>{importDurumBadge(s.durum)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={() => void varyantImportOlustur()}
                    disabled={importYukleniyor || (onizleme.hazir + onizleme.yeniDeger) === 0}
                    style={{ ...btnPrimary, backgroundColor: GREEN, marginTop: 12 }}
                  >
                    {importYukleniyor
                      ? 'Oluşturuluyor...'
                      : `${onizleme.hazir + onizleme.yeniDeger} varyant oluştur →`}
                  </button>
                </div>
              ) : null}

              {/* Import sonucu */}
              {importSonuc ? (
                <div style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: '#dcfce7',
                  border: '1px solid #bbf7d0',
                }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: GREEN, marginBottom: 8 }}>
                    {importSonuc.olusturulan} varyant oluşturuldu
                  </div>
                  <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
                    {importSonuc.yeniNitelikDeger > 0 ? (
                      <div>+ {importSonuc.yeniNitelikDeger} yeni nitelik değeri eklendi</div>
                    ) : null}
                    {importSonuc.hatalar > 0 ? (
                      <div>{importSonuc.hatalar} satır atlandı (hata/duplicate)</div>
                    ) : null}
                    {importSonuc.otomatikTemizlenen > 0 ? (
                      <div>
                        {importSonuc.otomatikTemizlenen} gereksiz varyant otomatik temizlendi
                        {importSonuc.kalanVaryant != null ? ` (kalan: ${importSonuc.kalanVaryant})` : ''}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setImportMod('liste')}
                    style={{ ...btnSmall, marginTop: 10 }}
                  >
                    Mevcut varyantları gör →
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', backgroundColor: 'white', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f9fafb' }}>
                      {['Model', 'Renk', 'Ölçü', 'İç Ref', 'Barkod', 'Maliyet', 'Satış', 'Odoo ID', 'Durum'].map((h) => (
                        <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {varyantlar.map((v, i) => (
                      <tr key={v.odooId} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: 6 }}>{v.model || '—'}</td>
                        <td style={{ padding: 6 }}>{v.renk || '—'}</td>
                        <td style={{ padding: 6 }}>{v.olcu || '—'}</td>
                        <td style={{ padding: 6 }}>
                          <input
                            value={v.icReferans}
                            onChange={(e) => setVaryantlar((prev) => prev.map((x, j) => j === i ? { ...x, icReferans: e.target.value, durum: 'bekliyor' } : x))}
                            style={{ ...inp, padding: '4px 6px', width: 90 }}
                          />
                        </td>
                        <td style={{ padding: 6 }}>
                          <input
                            value={v.barkod}
                            onChange={(e) => setVaryantlar((prev) => prev.map((x, j) => j === i ? { ...x, barkod: e.target.value, durum: 'bekliyor' } : x))}
                            style={{ ...inp, padding: '4px 6px', width: 100 }}
                          />
                        </td>
                        <td style={{ padding: 6 }}>
                          <input
                            type="number"
                            value={v.maliyet}
                            onChange={(e) => setVaryantlar((prev) => prev.map((x, j) => j === i ? { ...x, maliyet: e.target.value, durum: 'bekliyor' } : x))}
                            style={{ ...inp, padding: '4px 6px', width: 70 }}
                          />
                        </td>
                        <td style={{ padding: 6 }}>
                          <input
                            type="number"
                            value={v.satisFiyati}
                            onChange={(e) => setVaryantlar((prev) => prev.map((x, j) => j === i ? { ...x, satisFiyati: e.target.value, durum: 'bekliyor' } : x))}
                            style={{ ...inp, padding: '4px 6px', width: 70 }}
                          />
                        </td>
                        <td style={{ padding: 6, fontWeight: 700 }}>{v.odooId}</td>
                        <td style={{ padding: 6 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            backgroundColor: v.durum === 'synced' ? '#dcfce7' : '#fef3c7',
                            color: v.durum === 'synced' ? GREEN : '#92400e',
                          }}>
                            {v.durum === 'synced' ? 'Sync' : 'Bekliyor'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {varyantlar.length === 0 ? (
                      <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Henüz varyant yok — import ile oluşturun veya nitelik atayın</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                <button type="button" onClick={() => void varyantlariSync()} disabled={loading || varyantlar.length === 0} style={btnPrimary}>
                  {loading ? 'Sync...' : 'Odoo\'ya sync et'}
                </button>
                <button type="button" disabled style={{ ...btnSmall, opacity: 0.5 }}>Barkod yazdır (yakında)</button>
              </div>
            </>
          )}

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, backgroundColor: '#f0fdf4' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Sonraki adım</div>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 12px' }}>
              Varyantlar hazır olduğunda depo ürün girişine geçerek stok kaydı oluşturabilirsiniz.
            </p>
            <button type="button" onClick={() => navigate('/admin/depo')} style={{ ...btnPrimary, backgroundColor: GREEN }}>
              Depo ürün girişine geç →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
