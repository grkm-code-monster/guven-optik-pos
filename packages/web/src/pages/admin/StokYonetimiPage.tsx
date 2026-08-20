import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  disaAktarStokUrunleri,
  disaAktarStokVaryantlari,
  getOdooKategoriler,
  getSablonVaryantlari,
  getStokUrunleri,
  getUrunLotlari,
  getVaryantLotBilgisi,
  guncelleOdooVaryant,
  guncelleStokFiyat,
  topluStokFiyatGuncelle,
  topluStokUrunArsivdenCikar,
  topluStokUrunArsivle,
  topluVaryantArsivdenCikar as apiVaryantArsivdenCikar,
  topluVaryantArsivle as apiVaryantArsivle,
  type SablonVaryant,
  type StokDisaAktarFormat,
  type StokUrun,
} from '../../api/stok.api'
import EtiketBasModal, { type EtiketModalUrun } from '../../components/etiket/EtiketBasModal'
import EtiketSablonSecici from '../../components/etiket/EtiketSablonSecici'
import { otomatikSablonSec, uretEtiketZplTercihli } from '../../components/etiket/etiket-sablon-helpers'
import type { SablonId } from '../../components/etiket-tasarimci/sablon-types'
import StokKontrolTab from './StokKontrolTab'

const TABS = [
  { id: 'yonetim', label: '🏷️ Stok Yönetimi' },
  { id: 'arsiv', label: '🗄️ Arşivlenmiş Ürünler' },
  { id: 'kontrol', label: '📊 Stok Kontrol' },
] as const

type TabId = (typeof TABS)[number]['id']

const LOKASYONLAR = ['GVN1', 'GVN3', 'GVN4', 'GVN6', 'GVN8', 'GVN9', 'GVNP', 'GVN2', 'GVN7', 'GVN10', 'ANADEPO', 'ETICARET', 'GVN5']

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
const btnExport: React.CSSProperties = {
  ...btn,
  backgroundColor: '#6366f1',
  color: 'white',
  padding: '8px 12px',
  minWidth: 120,
}
const btnPrimary: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }
const th: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 800,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, verticalAlign: 'middle' }
const subTh: React.CSSProperties = {
  padding: '6px 12px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 800,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const subTd: React.CSSProperties = { padding: '6px 12px', fontSize: 12, verticalAlign: 'middle' }

function fmtFiyat(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function varyantEtiketi(v: SablonVaryant): string {
  const parts = [v.model, v.renk, v.olcu].filter((s) => s?.trim())
  if (parts.length) return parts.join(' / ')
  const attrs = v.attrs ?? {}
  const fromAttrs = [attrs.MODEL, attrs.RENK, attrs['ÖLÇÜ']].filter(Boolean)
  if (fromAttrs.length) return fromAttrs.join(' / ')
  return '—'
}

function varyantKey(tmplId: number, variantId: number) {
  return `${tmplId}-${variantId}`
}

type SecilenVaryantKayit = {
  key: string
  tmplId: number
  urunAdi: string
  kategori: string
  kategoriId: number | null
  odooId: number
  nitelikEtiketi: string
  barkod: string
  satisFiyati: number
  maliyet: number
  stok: number
}

export default function StokYonetimiPage() {
  const [activeTab, setActiveTab] = useState<TabId>('yonetim')
  const [kategoriler, setKategoriler] = useState<Array<{ id: number; complete_name: string }>>([])
  const [urunler, setUrunler] = useState<StokUrun[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const [arama, setArama] = useState('')
  const [kategoriId, setKategoriId] = useState('')
  const [fiyatMin, setFiyatMin] = useState('')
  const [fiyatMax, setFiyatMax] = useState('')
  const [stokDurumu, setStokDurumu] = useState<'tumu' | 'var' | 'sifir'>('tumu')
  const [urunDurumu, setUrunDurumu] = useState<'aktif' | 'arsiv' | 'hepsi'>('aktif')
  const [lokasyon, setLokasyon] = useState('')
  const [kdv, setKdv] = useState('')

  const [secili, setSecili] = useState<Set<number>>(new Set())
  const [duzenlenen, setDuzenlenen] = useState<{ id: number; alan: 'satis' | 'alis'; deger: string } | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState<number | null>(null)

  const [topluAcik, setTopluAcik] = useState(false)
  const [topluTip, setTopluTip] = useState<'yuzde' | 'sabit' | 'yeni'>('yuzde')
  const [topluDeger, setTopluDeger] = useState('10')
  const [topluHedef, setTopluHedef] = useState<'satis' | 'alis' | 'her_ikisi'>('satis')
  const [topluYukleniyor, setTopluYukleniyor] = useState(false)
  const [arsivYukleniyor, setArsivYukleniyor] = useState(false)
  const [disaAktarYukleniyor, setDisaAktarYukleniyor] = useState<'urun' | 'varyant' | null>(null)

  const [etiketAcik, setEtiketAcik] = useState(false)
  const [etiketUrun, setEtiketUrun] = useState<StokUrun | null>(null)
  const [etiketLokasyon, setEtiketLokasyon] = useState('GVN1')
  const [etiketAdet, setEtiketAdet] = useState(1)
  const [etiketZpl, setEtiketZpl] = useState('')
  const [etiketYukleniyor, setEtiketYukleniyor] = useState(false)
  const [etiketSablonId, setEtiketSablonId] = useState<SablonId>('gunes-aksesuar')

  const [expandedTmplIds, setExpandedTmplIds] = useState<Set<number>>(new Set())
  const [varyantCache, setVaryantCache] = useState<Map<number, SablonVaryant[]>>(new Map())
  const [varyantYukleniyor, setVaryantYukleniyor] = useState<Set<number>>(new Set())

  const [secilenVaryantlar, setSecilenVaryantlar] = useState<Map<string, SecilenVaryantKayit>>(new Map())
  const [duzenlenenVaryant, setDuzenlenenVaryant] = useState<{ key: string; alan: 'satis' | 'maliyet'; deger: string } | null>(null)
  const [varyantKaydediliyor, setVaryantKaydediliyor] = useState<string | null>(null)

  const [varyantEtiketAcik, setVaryantEtiketAcik] = useState(false)
  const [varyantEtiketUrunleri, setVaryantEtiketUrunleri] = useState<EtiketModalUrun[]>([])
  const [varyantEtiketLotYukleniyor, setVaryantEtiketLotYukleniyor] = useState(false)

  const seciliUrunler = useMemo(
    () => urunler.filter((u) => secili.has(u.id)),
    [urunler, secili],
  )

  const isYonetimView = activeTab === 'yonetim' || activeTab === 'arsiv'
  const arsivModu = activeTab === 'arsiv' || urunDurumu === 'arsiv'
  const effectiveUrunDurumu = activeTab === 'arsiv' ? 'arsiv' : urunDurumu

  function handleTabChange(tabId: TabId) {
    setActiveTab(tabId)
    setPage(1)
    setSecili(new Set())
    setSecilenVaryantlar(new Map())
    if (tabId === 'arsiv') {
      setUrunDurumu('arsiv')
    } else if (tabId === 'yonetim') {
      setUrunDurumu('aktif')
    }
  }

  // Her yukle() çağrısına artan bir sıra no verilir; yalnızca EN SON tetiklenen istek
  // sonucu ekrana yazılır. Bunsuz, hızlı yazarken (ör. "ULTRA") önceki karakterler için
  // atılmış istekler geç dönüp son sonucu ezebiliyordu (filtre "anlık çalışıp sıfırlanıyor").
  const yukleReqRef = useRef(0)

  const yukle = useCallback(async () => {
    const reqId = ++yukleReqRef.current
    setLoading(true)
    setMesaj(null)
    try {
      const res = await getStokUrunleri({
        q: arama || undefined,
        kategoriId: kategoriId ? Number(kategoriId) : undefined,
        fiyatMin: fiyatMin ? Number(fiyatMin) : undefined,
        fiyatMax: fiyatMax ? Number(fiyatMax) : undefined,
        stokDurumu: stokDurumu !== 'tumu' ? stokDurumu : undefined,
        lokasyon: lokasyon || undefined,
        kdv: kdv ? Number(kdv) : undefined,
        durum: effectiveUrunDurumu !== 'aktif' ? effectiveUrunDurumu : undefined,
        page,
        limit: 50,
      })
      if (reqId !== yukleReqRef.current) return // eskimiş (stale) yanıt — yok say
      setUrunler(res.data)
      setTotal(res.total)
    } catch (e: any) {
      if (reqId !== yukleReqRef.current) return
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Ürünler yüklenemedi' })
    } finally {
      if (reqId === yukleReqRef.current) setLoading(false)
    }
  }, [arama, kategoriId, fiyatMin, fiyatMax, stokDurumu, effectiveUrunDurumu, lokasyon, kdv, page])

  useEffect(() => {
    getOdooKategoriler().then((k) => setKategoriler(k)).catch(() => {})
  }, [])

  useEffect(() => {
    void yukle()
  }, [yukle])

  // Şube filtresi değişince açık olan varyant satırlarındaki stok sayılarını
  // yeni lokasyona göre tazele (yukarıdaki select onChange varyantCache'i
  // temizliyor, burada açık kalan satırlar için yeniden fetch tetikleniyor).
  useEffect(() => {
    for (const tmplId of expandedTmplIds) {
      if (!varyantCache.has(tmplId)) void yukleVaryantlar(tmplId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lokasyon])

  function toggleSec(id: number) {
    setSecili((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTumu() {
    if (secili.size === urunler.length) setSecili(new Set())
    else setSecili(new Set(urunler.map((u) => u.id)))
  }

  async function yukleVaryantlar(tmplId: number) {
    setVaryantYukleniyor((prev) => new Set(prev).add(tmplId))
    try {
      const data = await getSablonVaryantlari(tmplId, lokasyon || undefined)
      setVaryantCache((prev) => new Map(prev).set(tmplId, data))
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Varyantlar yüklenemedi' })
      setExpandedTmplIds((prev) => {
        const next = new Set(prev)
        next.delete(tmplId)
        return next
      })
    } finally {
      setVaryantYukleniyor((prev) => {
        const next = new Set(prev)
        next.delete(tmplId)
        return next
      })
    }
  }

  function toggleExpand(tmplId: number) {
    const willExpand = !expandedTmplIds.has(tmplId)
    setExpandedTmplIds((prev) => {
      const next = new Set(prev)
      if (next.has(tmplId)) next.delete(tmplId)
      else next.add(tmplId)
      return next
    })
    if (willExpand && !varyantCache.has(tmplId)) {
      void yukleVaryantlar(tmplId)
    }
  }

  function toggleVaryantSec(u: StokUrun, v: SablonVaryant) {
    const key = varyantKey(u.id, v.id)
    setSecilenVaryantlar((prev) => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, {
          key,
          tmplId: u.id,
          urunAdi: u.urunAdi,
          kategori: u.kategori,
          kategoriId: u.kategoriId,
          odooId: v.id,
          nitelikEtiketi: varyantEtiketi(v),
          barkod: v.barcode || '',
          satisFiyati: v.lst_price,
          maliyet: v.standard_price,
          stok: v.stok,
        })
      }
      return next
    })
  }

  function varyantCacheGuncelle(tmplId: number, variantId: number, patch: Partial<SablonVaryant>) {
    setVaryantCache((prev) => {
      const list = prev.get(tmplId)
      if (!list) return prev
      const next = new Map(prev)
      next.set(tmplId, list.map((v) => (v.id === variantId ? { ...v, ...patch } : v)))
      return next
    })
    const key = varyantKey(tmplId, variantId)
    setSecilenVaryantlar((prev) => {
      const kayit = prev.get(key)
      if (!kayit) return prev
      const next = new Map(prev)
      next.set(key, {
        ...kayit,
        ...(patch.lst_price != null ? { satisFiyati: patch.lst_price } : {}),
        ...(patch.standard_price != null ? { maliyet: patch.standard_price } : {}),
        ...(patch.barcode != null ? { barkod: patch.barcode } : {}),
      })
      return next
    })
  }

  async function varyantFiyatKaydet(tmplId: number, v: SablonVaryant) {
    if (!duzenlenenVaryant) return
    const key = varyantKey(tmplId, v.id)
    if (duzenlenenVaryant.key !== key) return
    const val = Number(duzenlenenVaryant.deger)
    if (!Number.isFinite(val) || val < 0) {
      setMesaj({ tip: 'err', text: 'Geçersiz fiyat' })
      return
    }
    const satisFiyati = duzenlenenVaryant.alan === 'satis' ? val : v.lst_price
    const maliyet = duzenlenenVaryant.alan === 'maliyet' ? val : v.standard_price
    setVaryantKaydediliyor(key)
    try {
      await guncelleOdooVaryant({
        odooId: v.id,
        icReferans: v.default_code,
        barkod: v.barcode,
        satisFiyati,
        maliyet,
      })
      varyantCacheGuncelle(tmplId, v.id, {
        lst_price: satisFiyati,
        standard_price: maliyet,
      })
      setDuzenlenenVaryant(null)
      setMesaj({ tip: 'ok', text: 'Varyant fiyatı güncellendi.' })
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Varyant fiyatı güncellenemedi' })
    } finally {
      setVaryantKaydediliyor(null)
    }
  }

  async function varyantEtiketListesiOlustur(
    tmpl: StokUrun,
    kaynaklar: Array<{ key: string; odooId: number; urunAdi?: string; nitelikEtiketi: string; barkod: string; satisFiyati: number; kategoriId: number | null; stok?: number }>,
  ): Promise<EtiketModalUrun[]> {
    const lotMap = new Map<string, Awaited<ReturnType<typeof getVaryantLotBilgisi>>>();
    await Promise.all(
      kaynaklar.map(async (k) => {
        try {
          lotMap.set(k.key, await getVaryantLotBilgisi(k.odooId));
        } catch {
          lotMap.set(k.key, {
            productId: k.odooId,
            kategoriId: k.kategoriId,
            utsKodu: null,
            lotNo: null,
            lotId: null,
          });
        }
      }),
    );

    return kaynaklar.map((k) => {
      const bilgi = lotMap.get(k.key);
      return {
        key: k.key,
        urunAdi: k.urunAdi ?? tmpl.urunAdi,
        seriNo: bilgi?.lotNo || '-',
        fiyat: k.satisFiyati,
        barkod: k.barkod || null,
        secili: true,
        categAdi: tmpl.kategori,
        renkVaryant: k.nitelikEtiketi,
        utsKodu: bilgi?.utsKodu ?? null,
        utsKodlu: Boolean(bilgi?.utsKodu),
        lotNo: bilgi?.lotNo ?? undefined,
        kategoriId: bilgi?.kategoriId ?? k.kategoriId ?? null,
        adet: k.stok && k.stok > 0 ? Math.round(k.stok) : 1,
      };
    });
  }

  async function acVaryantEtiketModal() {
    const secili = [...secilenVaryantlar.values()]
    if (!secili.length) return

    setVaryantEtiketLotYukleniyor(true)
    try {
      const tmpl = urunler.find((u) => u.id === secili[0].tmplId) ?? {
        id: secili[0].tmplId,
        urunAdi: secili[0].urunAdi,
        kategori: secili[0].kategori,
        kategoriId: secili[0].kategoriId,
        icReferans: '',
        satisFiyati: 0,
        alisFiyati: 0,
        kdvOrani: 0,
        toplamStok: 0,
        aktif: true,
        varyantSayisi: secili.length,
      }
      const liste = await varyantEtiketListesiOlustur(tmpl, secili.map((k) => ({
        key: k.key,
        odooId: k.odooId,
        urunAdi: k.urunAdi,
        nitelikEtiketi: k.nitelikEtiketi,
        barkod: k.barkod,
        satisFiyati: k.satisFiyati,
        kategoriId: k.kategoriId,
        stok: k.stok,
      })))
      setVaryantEtiketUrunleri(liste)
      setVaryantEtiketAcik(true)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? e?.message ?? 'Varyant etiket listesi oluşturulamadı' })
    } finally {
      setVaryantEtiketLotYukleniyor(false)
    }
  }

  async function fiyatKaydet(u: StokUrun) {
    if (!duzenlenen || duzenlenen.id !== u.id) return
    const val = Number(duzenlenen.deger)
    if (!Number.isFinite(val) || val < 0) {
      setMesaj({ tip: 'err', text: 'Geçersiz fiyat' })
      return
    }
    setKaydediliyor(u.id)
    try {
      await guncelleStokFiyat({
        urunId: u.id,
        ...(duzenlenen.alan === 'satis' ? { satisFiyati: val } : { alisFiyati: val }),
      })
      setDuzenlenen(null)
      setMesaj({ tip: 'ok', text: 'Fiyat güncellendi, şubelere bildirim gönderildi.' })
      void yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Fiyat güncellenemedi' })
    } finally {
      setKaydediliyor(null)
    }
  }

  async function topluGuncelle() {
    if (!seciliUrunler.length) return
    setTopluYukleniyor(true)
    try {
      const res = await topluStokFiyatGuncelle({
        urunIds: seciliUrunler.map((u) => u.id),
        tip: topluTip,
        deger: Number(topluDeger) || 0,
        hedef: topluHedef,
      })
      setTopluAcik(false)
      setSecili(new Set())
      setMesaj({ tip: 'ok', text: `${res.basarili}/${res.toplam} ürün güncellendi.` })
      void yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Toplu güncelleme başarısız' })
    } finally {
      setTopluYukleniyor(false)
    }
  }

  async function topluArsivle() {
    if (!seciliUrunler.length) return
    const onay = window.confirm(
      `${seciliUrunler.length} ürün arşivlenecek. Aktif listeden/katalogdan/satıştan kaybolacak ama silinmeyecek; istediğinizde geri çıkarabilirsiniz. Devam edilsin mi?`,
    )
    if (!onay) return
    setArsivYukleniyor(true)
    try {
      const res = await topluStokUrunArsivle(seciliUrunler.map((u) => u.id))
      setSecili(new Set())
      setMesaj({ tip: 'ok', text: `${res.basarili}/${res.toplam} ürün arşivlendi.` })
      void yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Arşivleme başarısız' })
    } finally {
      setArsivYukleniyor(false)
    }
  }

  async function topluArsivdenCikar() {
    if (!seciliUrunler.length) return
    setArsivYukleniyor(true)
    try {
      const res = await topluStokUrunArsivdenCikar(seciliUrunler.map((u) => u.id))
      setSecili(new Set())
      setMesaj({ tip: 'ok', text: `${res.basarili}/${res.toplam} ürün arşivden çıkarıldı.` })
      void yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Arşivden çıkarma başarısız' })
    } finally {
      setArsivYukleniyor(false)
    }
  }

  async function varyantListeleriniYenile(tmplIds: number[]) {
    for (const tmplId of tmplIds) {
      await yukleVaryantlar(tmplId)
    }
  }

  function blobIndir(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function disaAktarDosyaAdi(prefix: string, format: StokDisaAktarFormat) {
    const tarih = new Date().toISOString().slice(0, 10)
    const ext = format === 'xlsx' ? 'xlsx' : format
    return `${prefix}-${tarih}.${ext}`
  }

  async function disaAktarUrun(format: StokDisaAktarFormat) {
    if (!seciliUrunler.length) return
    setDisaAktarYukleniyor('urun')
    setMesaj(null)
    try {
      const res = await disaAktarStokUrunleri(seciliUrunler.map((u) => u.id), format)
      blobIndir(res.data, disaAktarDosyaAdi('stok-urunleri', format))
      setMesaj({ tip: 'ok', text: `${seciliUrunler.length} ürün ${format.toUpperCase()} olarak indirildi.` })
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Dışa aktarma başarısız' })
    } finally {
      setDisaAktarYukleniyor(null)
    }
  }

  async function disaAktarVaryant(format: StokDisaAktarFormat) {
    if (!secilenVaryantlar.size) return
    setDisaAktarYukleniyor('varyant')
    setMesaj(null)
    try {
      const variantIds = [...secilenVaryantlar.values()].map((v) => v.odooId)
      const res = await disaAktarStokVaryantlari(variantIds, format)
      blobIndir(res.data, disaAktarDosyaAdi('stok-varyantlari', format))
      setMesaj({ tip: 'ok', text: `${variantIds.length} varyant ${format.toUpperCase()} olarak indirildi.` })
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Dışa aktarma başarısız' })
    } finally {
      setDisaAktarYukleniyor(null)
    }
  }

  async function topluVaryantArsivle() {
    if (!secilenVaryantlar.size) return
    const onay = window.confirm(
      `${secilenVaryantlar.size} varyant arşivlenecek. Ürün/şablon ve diğer varyantlar etkilenmeyecek; istediğinizde geri çıkarabilirsiniz. Devam edilsin mi?`,
    )
    if (!onay) return
    setArsivYukleniyor(true)
    try {
      const kayitlar = [...secilenVaryantlar.values()]
      const variantIds = kayitlar.map((v) => v.odooId)
      const tmplIds = [...new Set(kayitlar.map((v) => v.tmplId))]
      const res = await apiVaryantArsivle(variantIds)
      setSecilenVaryantlar(new Map())
      setMesaj({ tip: 'ok', text: `${res.basarili}/${res.toplam} varyant arşivlendi.` })
      await varyantListeleriniYenile(tmplIds)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Varyant arşivleme başarısız' })
    } finally {
      setArsivYukleniyor(false)
    }
  }

  async function topluVaryantArsivdenCikar() {
    if (!secilenVaryantlar.size) return
    setArsivYukleniyor(true)
    try {
      const kayitlar = [...secilenVaryantlar.values()]
      const variantIds = kayitlar.map((v) => v.odooId)
      const tmplIds = [...new Set(kayitlar.map((v) => v.tmplId))]
      const res = await apiVaryantArsivdenCikar(variantIds)
      setSecilenVaryantlar(new Map())
      setMesaj({ tip: 'ok', text: `${res.basarili}/${res.toplam} varyant arşivden çıkarıldı.` })
      await varyantListeleriniYenile(tmplIds)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Varyant arşivden çıkarma başarısız' })
    } finally {
      setArsivYukleniyor(false)
    }
  }

  function onizlemeFiyat(eski: number) {
    const d = Number(topluDeger) || 0
    if (topluTip === 'yuzde') return Math.round(eski * (1 + d / 100) * 100) / 100
    if (topluTip === 'sabit') return Math.round((eski + d) * 100) / 100
    return d
  }

  async function etiketBas(u: StokUrun) {
    if ((u.varyantSayisi ?? 1) > 1) {
      setExpandedTmplIds((prev) => new Set(prev).add(u.id))
      setVaryantEtiketLotYukleniyor(true)
      setMesaj(null)
      try {
        const varyantlar = await getSablonVaryantlari(u.id)
        setVaryantCache((prev) => new Map(prev).set(u.id, varyantlar))
        const aktif = varyantlar.filter((v) => v.active !== false)
        if (!aktif.length) {
          setMesaj({ tip: 'err', text: 'Etiket basılacak aktif varyant bulunamadı.' })
          return
        }
        const liste = await varyantEtiketListesiOlustur(u, aktif.map((v) => ({
          key: varyantKey(u.id, v.id),
          odooId: v.id,
          nitelikEtiketi: varyantEtiketi(v),
          barkod: v.barcode || '',
          satisFiyati: v.lst_price,
          kategoriId: u.kategoriId,
          stok: v.stok,
        })))
        setVaryantEtiketUrunleri(liste)
        setVaryantEtiketAcik(true)
      } catch (e: any) {
        setMesaj({ tip: 'err', text: e?.response?.data?.error ?? e?.message ?? 'Varyant etiket listesi açılamadı' })
      } finally {
        setVaryantEtiketLotYukleniyor(false)
      }
      return
    }

    setEtiketUrun(u)
    setEtiketAcik(true)
    setEtiketZpl('')
    setEtiketAdet(1)
    setEtiketLokasyon(lokasyon || 'GVN1')
    setEtiketSablonId(otomatikSablonSec(u.kategori, false))
  }

  async function etiketUret() {
    if (!etiketUrun) return
    if ((etiketUrun.varyantSayisi ?? 1) > 1) {
      setMesaj({ tip: 'err', text: 'Çok varyantlı ürünlerde varyant seçerek etiket basın.' })
      return
    }
    setEtiketYukleniyor(true)
    try {
      let variantProductId: number | null = null
      let variantBarkod: string | null = null

      if (etiketUrun.varyantSayisi === 1) {
        const varyantlar = await getSablonVaryantlari(etiketUrun.id)
        const tek = varyantlar[0]
        if (tek) {
          variantProductId = tek.id
          variantBarkod = tek.barcode?.trim() || null
        }
      }

      let lotBilgi: Awaited<ReturnType<typeof getVaryantLotBilgisi>> | null = null
      if (variantProductId) {
        try {
          lotBilgi = await getVaryantLotBilgisi(variantProductId)
        } catch {
          lotBilgi = null
        }
      }

      const lotlar = await getUrunLotlari(etiketUrun.id, etiketLokasyon)
      const maxStok = Math.max(1, etiketUrun.toplamStok)
      const adet = Math.max(1, Math.min(etiketAdet, maxStok, lotlar.length || maxStok))
      let varsayilanBarkod = variantBarkod || etiketUrun.icReferans || null
      let tekVaryantFiyat = etiketUrun.satisFiyati

      if (!lotlar.length) {
        const varyantlar = await getSablonVaryantlari(etiketUrun.id)
        const aktif = varyantlar.filter((v) => v.active !== false)
        if (aktif.length > 1) {
          setMesaj({ tip: 'err', text: 'Lot kaydı yok — çok varyantlı üründe varyant seçerek etiket basın.' })
          return
        }
        if (aktif[0]) {
          tekVaryantFiyat = aktif[0].lst_price
          varsayilanBarkod = aktif[0].barcode?.trim() || varsayilanBarkod
        }
      }

      const kaynak = lotlar.length
        ? lotlar.slice(0, adet)
        : Array.from({ length: adet }, () => ({
          seriNo: lotBilgi?.lotNo || '-',
          fiyat: tekVaryantFiyat,
          barkod: varsayilanBarkod,
        }))

      const items = kaynak.map((l) => ({
        urunAdi: etiketUrun.urunAdi,
        seriNo: (l.seriNo && l.seriNo !== '-') ? l.seriNo : (lotBilgi?.lotNo || '-'),
        fiyat: l.fiyat ?? etiketUrun.satisFiyati,
        barkod: l.barkod ?? varsayilanBarkod,
        icReferans: etiketUrun.icReferans || undefined,
        categAdi: etiketUrun.kategori,
        lokasyon: etiketLokasyon,
        miktar: etiketUrun.toplamStok,
        lotNo: (l.seriNo && l.seriNo !== '-') ? l.seriNo : (lotBilgi?.lotNo ?? undefined),
        utsKodu: lotBilgi?.utsKodu ?? null,
      }))

      setEtiketZpl(await uretEtiketZplTercihli(etiketSablonId, items, etiketUrun.kategori))
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? e?.message ?? 'ZPL üretilemedi' })
    } finally {
      setEtiketYukleniyor(false)
    }
  }

  const toplamSayfa = Math.max(1, Math.ceil(total / 50))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Stok Yönetimi</h1>
        {isYonetimView ? (
          <button type="button" onClick={() => void yukle()} style={btnPrimary}>Yenile</button>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            style={{
              padding: '10px 18px',
              fontSize: 13,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === t.id ? '2px solid #1a1a2e' : '2px solid transparent',
              marginBottom: -2,
              fontWeight: activeTab === t.id ? 900 : 600,
              cursor: 'pointer',
              color: activeTab === t.id ? '#1a1a2e' : '#6b7280',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'kontrol' ? <StokKontrolTab /> : null}

      {isYonetimView ? (
        <>

      {mesaj ? (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          backgroundColor: mesaj.tip === 'ok' ? '#f0fdf4' : '#fff1f2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b',
          border: `1px solid ${mesaj.tip === 'ok' ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {mesaj.text}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Sol filtreler */}
        <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>Filtreler</div>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Arama</span>
            <input
              value={arama}
              onChange={(e) => { setArama(e.target.value); setPage(1) }}
              placeholder="Ürün adı / iç ref"
              style={{ ...inp, marginTop: 4 }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Kategori</span>
            <select value={kategoriId} onChange={(e) => { setKategoriId(e.target.value); setPage(1) }} style={{ ...inp, marginTop: 4 }}>
              <option value="">Tümü</option>
              {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.complete_name}</option>)}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <label>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Min ₺</span>
              <input type="number" value={fiyatMin} onChange={(e) => { setFiyatMin(e.target.value); setPage(1) }} style={{ ...inp, marginTop: 4 }} />
            </label>
            <label>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Max ₺</span>
              <input type="number" value={fiyatMax} onChange={(e) => { setFiyatMax(e.target.value); setPage(1) }} style={{ ...inp, marginTop: 4 }} />
            </label>
          </div>

          {activeTab !== 'arsiv' ? (
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Ürün durumu</span>
              <select value={urunDurumu} onChange={(e) => { setUrunDurumu(e.target.value as 'aktif' | 'arsiv' | 'hepsi'); setPage(1); setSecili(new Set()) }} style={{ ...inp, marginTop: 4 }}>
                <option value="aktif">Aktif Ürünler</option>
                <option value="arsiv">Arşiv</option>
                <option value="hepsi">Hepsi</option>
              </select>
            </label>
          ) : null}

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Stok durumu</span>
            <select value={stokDurumu} onChange={(e) => { setStokDurumu(e.target.value as any); setPage(1) }} style={{ ...inp, marginTop: 4 }}>
              <option value="tumu">Tümü</option>
              <option value="var">Stokta var</option>
              <option value="sifir">Stok sıfır</option>
            </select>
          </label>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>Şube</span>
            <select value={lokasyon} onChange={(e) => { setLokasyon(e.target.value); setPage(1); setVaryantCache(new Map()) }} style={{ ...inp, marginTop: 4 }}>
              <option value="">Tümü</option>
              {LOKASYONLAR.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>

          <label style={{ display: 'block' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>KDV</span>
            <select value={kdv} onChange={(e) => { setKdv(e.target.value); setPage(1) }} style={{ ...inp, marginTop: 4 }}>
              <option value="">Tümü</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
          </label>
        </div>

        {/* Tablo */}
        <div>
          {secili.size > 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
              padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{secili.size} ürün seçildi</span>
              {arsivModu ? (
                <button
                  type="button"
                  onClick={() => void topluArsivdenCikar()}
                  disabled={arsivYukleniyor}
                  style={{ ...btn, backgroundColor: '#059669', color: 'white', opacity: arsivYukleniyor ? 0.7 : 1 }}
                >
                  {arsivYukleniyor ? 'İşleniyor…' : 'Arşivden Çıkar'}
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => setTopluAcik(true)} style={{ ...btn, backgroundColor: '#2563eb', color: 'white' }}>
                    Toplu Fiyat Güncelle
                  </button>
                  <button
                    type="button"
                    onClick={() => void topluArsivle()}
                    disabled={arsivYukleniyor}
                    style={{ ...btn, backgroundColor: '#b45309', color: 'white', opacity: arsivYukleniyor ? 0.7 : 1 }}
                  >
                    {arsivYukleniyor ? 'Arşivleniyor…' : 'Seçili Ürünleri Arşivle'}
                  </button>
                </>
              )}
              <select
                value=""
                disabled={disaAktarYukleniyor === 'urun'}
                onChange={(e) => {
                  const fmt = e.target.value as StokDisaAktarFormat | ''
                  if (fmt) void disaAktarUrun(fmt)
                }}
                style={btnExport}
              >
                <option value="" hidden>{disaAktarYukleniyor === 'urun' ? 'İndiriliyor…' : 'Dışa Aktar'}</option>
                <option value="pdf">PDF</option>
                <option value="xlsx">Excel</option>
                <option value="csv">CSV</option>
              </select>
              <button type="button" onClick={() => setSecili(new Set())} style={btn}>Seçimi Temizle</button>
            </div>
          ) : null}

          {secilenVaryantlar.size > 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
              padding: '10px 14px', backgroundColor: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{secilenVaryantlar.size} varyant seçildi</span>
              <button
                type="button"
                onClick={() => void acVaryantEtiketModal()}
                disabled={varyantEtiketLotYukleniyor}
                style={{ ...btn, backgroundColor: '#059669', color: 'white', opacity: varyantEtiketLotYukleniyor ? 0.7 : 1 }}
              >
                {varyantEtiketLotYukleniyor ? 'Lot/UTS yükleniyor…' : 'Seçili Varyantlara Etiket Bas'}
              </button>
              <button
                type="button"
                onClick={() => void topluVaryantArsivle()}
                disabled={arsivYukleniyor}
                style={{ ...btn, backgroundColor: '#b45309', color: 'white', opacity: arsivYukleniyor ? 0.7 : 1 }}
              >
                {arsivYukleniyor ? 'Arşivleniyor…' : 'Seçili Varyantları Arşivle'}
              </button>
              <button
                type="button"
                onClick={() => void topluVaryantArsivdenCikar()}
                disabled={arsivYukleniyor}
                style={{ ...btn, backgroundColor: '#059669', color: 'white', opacity: arsivYukleniyor ? 0.7 : 1 }}
              >
                {arsivYukleniyor ? 'İşleniyor…' : 'Seçili Varyantları Arşivden Çıkar'}
              </button>
              <select
                value=""
                disabled={disaAktarYukleniyor === 'varyant'}
                onChange={(e) => {
                  const fmt = e.target.value as StokDisaAktarFormat | ''
                  if (fmt) void disaAktarVaryant(fmt)
                }}
                style={btnExport}
              >
                <option value="" hidden>{disaAktarYukleniyor === 'varyant' ? 'İndiriliyor…' : 'Dışa Aktar'}</option>
                <option value="pdf">PDF</option>
                <option value="xlsx">Excel</option>
                <option value="csv">CSV</option>
              </select>
              <button type="button" onClick={() => setSecilenVaryantlar(new Map())} style={btn}>Varyant Seçimini Temizle</button>
            </div>
          ) : null}

          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Yükleniyor...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ ...th, width: 28 }}></th>
                    <th style={{ ...th, width: 36 }}>
                      <input type="checkbox" checked={secili.size === urunler.length && urunler.length > 0} onChange={toggleTumu} />
                    </th>
                    <th style={th}>İç Ref</th>
                    <th style={th}>Ürün Adı</th>
                    <th style={th}>Kategori</th>
                    <th style={th}>Satış ₺</th>
                    <th style={th}>Alış ₺</th>
                    <th style={th}>KDV</th>
                    <th style={th}>Stok</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {urunler.map((u) => {
                    const cokluVaryant = (u.varyantSayisi ?? 1) > 1
                    const expanded = expandedTmplIds.has(u.id)
                    const varyantlar = varyantCache.get(u.id)
                    const varyantLoading = varyantYukleniyor.has(u.id)

                    return (
                      <Fragment key={u.id}>
                        <tr key={u.id} style={{ borderBottom: expanded ? 'none' : '1px solid #f3f4f6' }}>
                          <td style={{ ...td, width: 28, padding: '10px 4px' }}>
                            {cokluVaryant ? (
                              <button
                                type="button"
                                onClick={() => toggleExpand(u.id)}
                                aria-label={expanded ? 'Varyantları gizle' : 'Varyantları göster'}
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  cursor: 'pointer',
                                  padding: '2px 4px',
                                  fontSize: 11,
                                  color: '#6b7280',
                                  lineHeight: 1,
                                }}
                              >
                                {expanded ? '▼' : '▶'}
                              </button>
                            ) : null}
                          </td>
                          <td style={td}>
                            <input type="checkbox" checked={secili.has(u.id)} onChange={() => toggleSec(u.id)} />
                          </td>
                          <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{u.icReferans || '—'}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{u.urunAdi}</td>
                          <td style={{ ...td, fontSize: 12, color: '#6b7280' }}>{u.kategori}</td>
                          <td style={td}>
                            {duzenlenen?.id === u.id && duzenlenen.alan === 'satis' ? (
                              <input
                                autoFocus
                                type="number"
                                value={duzenlenen.deger}
                                onChange={(e) => setDuzenlenen({ ...duzenlenen, deger: e.target.value })}
                                onBlur={() => void fiyatKaydet(u)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void fiyatKaydet(u) }}
                                style={{ ...inp, width: 90, padding: '4px 8px' }}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDuzenlenen({ id: u.id, alan: 'satis', deger: String(u.satisFiyati) })}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, color: '#059669', padding: 0 }}
                              >
                                {kaydediliyor === u.id ? '...' : fmtFiyat(u.satisFiyati)}
                              </button>
                            )}
                          </td>
                          <td style={td}>
                            {duzenlenen?.id === u.id && duzenlenen.alan === 'alis' ? (
                              <input
                                autoFocus
                                type="number"
                                value={duzenlenen.deger}
                                onChange={(e) => setDuzenlenen({ ...duzenlenen, deger: e.target.value })}
                                onBlur={() => void fiyatKaydet(u)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void fiyatKaydet(u) }}
                                style={{ ...inp, width: 90, padding: '4px 8px' }}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDuzenlenen({ id: u.id, alan: 'alis', deger: String(u.alisFiyati) })}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, color: '#6b7280', padding: 0 }}
                              >
                                {fmtFiyat(u.alisFiyati)}
                              </button>
                            )}
                          </td>
                          <td style={{ ...td, fontSize: 12 }}>%{Math.round(u.kdvOrani)}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{u.toplamStok}</td>
                          <td style={td}>
                            <button type="button" onClick={() => void etiketBas(u)} style={{ ...btn, padding: '4px 10px', fontSize: 11, backgroundColor: '#f0fdf4', color: '#166534' }}>
                              Etiket
                            </button>
                          </td>
                        </tr>
                        {expanded && cokluVaryant ? (
                          <tr key={`${u.id}-varyantlar`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td colSpan={10} style={{ padding: 0, backgroundColor: '#f9fafb' }}>
                              {varyantLoading ? (
                                <div style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>Varyantlar yükleniyor...</div>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ ...subTh, width: 32, paddingLeft: 44 }}></th>
                                      <th style={subTh}>Nitelik Etiketi</th>
                                      <th style={subTh}>Barkod</th>
                                      <th style={subTh}>Satış ₺</th>
                                      <th style={subTh}>Maliyet ₺</th>
                                      <th style={subTh}>Stok</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(varyantlar ?? []).map((v) => {
                                      const vKey = varyantKey(u.id, v.id)
                                      const vSecili = secilenVaryantlar.has(vKey)
                                      const vDuzenleniyor = duzenlenenVaryant?.key === vKey
                                      const vKaydediliyor = varyantKaydediliyor === vKey
                                      const arsivli = v.active === false
                                      return (
                                        <tr key={v.id} style={arsivli ? { opacity: 0.55 } : undefined}>
                                          <td style={{ ...subTd, paddingLeft: 44 }}>
                                            <input
                                              type="checkbox"
                                              checked={vSecili}
                                              onChange={() => toggleVaryantSec(u, v)}
                                            />
                                          </td>
                                          <td style={{ ...subTd, fontWeight: 600, color: arsivli ? '#9ca3af' : '#374151' }}>
                                            {varyantEtiketi(v)}
                                            {arsivli ? (
                                              <span style={{
                                                marginLeft: 8,
                                                fontSize: 10,
                                                fontWeight: 800,
                                                padding: '2px 6px',
                                                borderRadius: 6,
                                                backgroundColor: '#f3f4f6',
                                                color: '#6b7280',
                                              }}>
                                                Arşivde
                                              </span>
                                            ) : null}
                                          </td>
                                          <td style={{ ...subTd, fontFamily: 'monospace', fontSize: 11, color: arsivli ? '#9ca3af' : '#6b7280' }}>
                                            {v.barcode || '—'}
                                          </td>
                                          <td style={subTd}>
                                            {vDuzenleniyor && duzenlenenVaryant?.alan === 'satis' ? (
                                              <input
                                                autoFocus
                                                type="number"
                                                value={duzenlenenVaryant.deger}
                                                onChange={(e) => setDuzenlenenVaryant({ ...duzenlenenVaryant, deger: e.target.value })}
                                                onBlur={() => void varyantFiyatKaydet(u.id, v)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') void varyantFiyatKaydet(u.id, v) }}
                                                style={{ ...inp, width: 90, padding: '4px 8px', fontSize: 12 }}
                                              />
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setDuzenlenenVaryant({ key: vKey, alan: 'satis', deger: String(v.lst_price) })}
                                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, color: '#059669', padding: 0, fontSize: 12 }}
                                              >
                                                {vKaydediliyor ? '...' : fmtFiyat(v.lst_price)}
                                              </button>
                                            )}
                                          </td>
                                          <td style={subTd}>
                                            {vDuzenleniyor && duzenlenenVaryant?.alan === 'maliyet' ? (
                                              <input
                                                autoFocus
                                                type="number"
                                                value={duzenlenenVaryant.deger}
                                                onChange={(e) => setDuzenlenenVaryant({ ...duzenlenenVaryant, deger: e.target.value })}
                                                onBlur={() => void varyantFiyatKaydet(u.id, v)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') void varyantFiyatKaydet(u.id, v) }}
                                                style={{ ...inp, width: 90, padding: '4px 8px', fontSize: 12 }}
                                              />
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => setDuzenlenenVaryant({ key: vKey, alan: 'maliyet', deger: String(v.standard_price) })}
                                                style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600, color: '#6b7280', padding: 0, fontSize: 12 }}
                                              >
                                                {fmtFiyat(v.standard_price)}
                                              </button>
                                            )}
                                          </td>
                                          <td style={{ ...subTd, fontWeight: 700, color: v.stok > 0 ? '#111' : '#dc2626' }}>
                                            {v.stok}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                    {!varyantlar?.length ? (
                                      <tr>
                                        <td colSpan={6} style={{ ...subTd, color: '#9ca3af', paddingLeft: 44 }}>Varyant bulunamadı</td>
                                      </tr>
                                    ) : null}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                  {!urunler.length ? (
                    <tr>
                      <td colSpan={10} style={{ ...td, textAlign: 'center', color: '#9ca3af', padding: 32 }}>
                        {activeTab === 'arsiv' ? 'Arşivde ürün yok' : 'Ürün bulunamadı'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{total} ürün · Sayfa {page}/{toplamSayfa}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={btn}>← Önceki</button>
              <button type="button" disabled={page >= toplamSayfa} onClick={() => setPage((p) => p + 1)} style={btn}>Sonraki →</button>
            </div>
          </div>
        </div>
      </div>

      {/* Toplu fiyat modal */}
      {topluAcik ? (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16 }}>Toplu Fiyat Güncelle ({secili.size} ürün)</div>

            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Güncelleme tipi</span>
                <select value={topluTip} onChange={(e) => setTopluTip(e.target.value as any)} style={{ ...inp, marginTop: 4 }}>
                  <option value="yuzde">Yüzde artış (%)</option>
                  <option value="sabit">Sabit TL artış</option>
                  <option value="yeni">Yeni fiyat gir</option>
                </select>
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Değer</span>
                <input type="number" value={topluDeger} onChange={(e) => setTopluDeger(e.target.value)} style={{ ...inp, marginTop: 4 }} />
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Hangi fiyat</span>
                <select value={topluHedef} onChange={(e) => setTopluHedef(e.target.value as any)} style={{ ...inp, marginTop: 4 }}>
                  <option value="satis">Satış fiyatı</option>
                  <option value="alis">Alış fiyatı</option>
                  <option value="her_ikisi">Her ikisi</option>
                </select>
              </label>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Önizleme (ilk 5)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={th}>Ürün</th>
                  <th style={th}>Eski</th>
                  <th style={th}>Yeni</th>
                </tr>
              </thead>
              <tbody>
                {seciliUrunler.slice(0, 5).map((u) => {
                  const eski = topluHedef === 'alis' ? u.alisFiyati : u.satisFiyati
                  return (
                    <tr key={u.id}>
                      <td style={td}>{u.urunAdi}</td>
                      <td style={td}>{fmtFiyat(eski)}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#059669' }}>{fmtFiyat(onizlemeFiyat(eski))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setTopluAcik(false)} style={btn}>İptal</button>
              <button type="button" disabled={topluYukleniyor} onClick={() => void topluGuncelle()} style={{ ...btnPrimary, backgroundColor: '#059669' }}>
                {topluYukleniyor ? 'Güncelleniyor...' : 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Etiket modal */}
      {etiketAcik && etiketUrun ? (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Etiket Bas</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>{etiketUrun.urunAdi}</div>

            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Şube</span>
                <select value={etiketLokasyon} onChange={(e) => setEtiketLokasyon(e.target.value)} style={{ ...inp, marginTop: 4 }}>
                  {LOKASYONLAR.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Adet (max stok: {etiketUrun.toplamStok})</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, etiketUrun.toplamStok)}
                  value={etiketAdet}
                  onChange={(e) => setEtiketAdet(Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, etiketUrun.toplamStok)))}
                  style={{ ...inp, marginTop: 4 }}
                />
              </label>
            </div>

            {!etiketZpl ? (
              <div style={{ marginBottom: 16 }}>
                <EtiketSablonSecici
                  urunKategori={etiketUrun.kategori}
                  utsKodlu={false}
                  secilenId={etiketSablonId}
                  onSecim={(id) => setEtiketSablonId(id as SablonId)}
                />
              </div>
            ) : null}

            {etiketZpl ? (
              <textarea readOnly value={etiketZpl} rows={8} style={{ ...inp, fontFamily: 'monospace', fontSize: 11, marginBottom: 12 }} />
            ) : null}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEtiketAcik(false)} style={btn}>Kapat</button>
              {!etiketZpl ? (
                <button type="button" disabled={etiketYukleniyor} onClick={() => void etiketUret()} style={{ ...btnPrimary, backgroundColor: '#059669' }}>
                  {etiketYukleniyor ? 'Üretiliyor...' : 'ZPL Üret'}
                </button>
              ) : (
                <button type="button" onClick={() => void navigator.clipboard.writeText(etiketZpl)} style={btnPrimary}>Kopyala</button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <EtiketBasModal
        acik={varyantEtiketAcik}
        urunler={varyantEtiketUrunleri}
        source="admin"
        onKapat={() => setVaryantEtiketAcik(false)}
      />
        </>
      ) : null}
    </div>
  )
}
