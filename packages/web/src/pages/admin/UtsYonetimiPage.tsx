import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from './AdminLayout'
import {
  formatGs1FromUtsFields,
  isGs1DataMatrix,
  isUtsSeriLotEksik,
  parseGs1DataMatrix,
  utsAlanUzunlukHatasi,
} from '../../utils/parseGs1DataMatrix'
import { setUtsUrunGirisBridge } from '../../utils/utsUrunGirisBridge'

type Sekme = 'subeler' | 'firmalar' | 'bildirim' | 'kuyruk' | 'bekleyen-alma'

type BranchRow = {
  id: string
  name: string
  code: string
  utsSube?: {
    kurumNo?: string | null
    token?: string | null
    ortam?: string
    aktif?: boolean
    sonKontrol?: string | null
  } | null
}

type DisFirmaLokasyon = {
  id: string
  firmaId: string
  ad: string
  kurumNo?: string | null
  varsayilan: boolean
}

type DisFirma = {
  id: string
  ad: string
  vkn?: string | null
  kurumNo?: string | null
  adres?: string | null
  telefon?: string | null
  email?: string | null
  notlar?: string | null
  odooPartnerId?: number | null
  lokasyonlar?: DisFirmaLokasyon[]
}

type KuyrukItem = {
  id: string
  tip: string
  durum: string
  belgeNo?: string | null
  karsiAd?: string | null
  karsiKurumNo?: string | null
  karsiVkn?: string | null
  hataDetay?: string | null
  createdAt: string
  branch?: { name: string; code: string }
  kalemler: Array<{ id: string }>
}

type BildirimKalem = {
  barkod: string
  seriNo: string
  lotNo: string
  adet: number
  parseUyari?: string
  hamMetin?: string
}

type GonderilenItem = {
  id: string
  tip: string
  durum: string
  belgeNo?: string | null
  karsiAd?: string | null
  gonderimZamani?: string | null
  createdAt: string
  urunGirisiYapildiMi?: boolean
  branch?: { name: string; code: string }
  kalemler: Array<{ barkod: string; seriNo?: string | null; lotNo?: string | null; adet: number }>
}

type UrunGirisiBekleyenItem = GonderilenItem

type BekleyenAlmaSatir = {
  uno: string
  lno?: string
  sno?: string
  bno?: string
  bid?: string
  gkk?: number
  adt?: number
  urunTanimi?: string
  gonderenKurum?: string
  bildirimDurumu?: string
  bildirimZamani?: string
  vermeTarihi?: string
}

const RED = '#dc2626'
const GREEN = '#16a34a'
const AMBER = '#d97706'
const BLUE = '#2563eb'

const BILDIRIM_TIPLERI = [
  { value: 'ALMA', label: 'Alma' },
  { value: 'VERME', label: 'Verme' },
  { value: 'TUKETICIYE_VERME', label: 'Tüketiciye Verme' },
  { value: 'TANIMSIZ_YERE_VERME', label: 'Tanımsız Yere Verme' },
  { value: 'TUKETICIDEN_IADE', label: 'Tüketiciden İade' },
  { value: 'HEK_ZAYIAT', label: 'Hek / Zayiat' },
] as const

const DEPO_GRUP_KODLARI = ['GVN2', 'ANADEPO']

const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 13,
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  backgroundColor: RED,
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
}

const btnSmall: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  backgroundColor: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

function sekmeBtn(active: boolean): React.CSSProperties {
  return {
    padding: '12px 18px',
    border: 'none',
    borderBottom: active ? `3px solid ${RED}` : '3px solid transparent',
    background: 'transparent',
    color: active ? '#1a1a2e' : '#6b7280',
    fontWeight: active ? 800 : 500,
    fontSize: 14,
    cursor: 'pointer',
  }
}

function subeDurumBadge(branch: BranchRow) {
  const u = branch.utsSube
  if (u?.kurumNo && u?.token && u?.aktif) {
    return { bg: '#dcfce7', color: GREEN, label: 'Hazır' }
  }
  return { bg: '#fef3c7', color: AMBER, label: 'Eksik' }
}

function tipLabel(tip: string) {
  return BILDIRIM_TIPLERI.find((t) => t.value === tip)?.label ?? tip
}

function bekleyenSatirKey(s: BekleyenAlmaSatir, idx: number): string {
  return (s.bid && s.bid.trim()) ? s.bid : `${s.uno}-${s.sno ?? s.lno ?? idx}`
}

function kalemUyariMetni(seriNo: string, lotNo: string): string | undefined {
  if (isUtsSeriLotEksik(seriNo, lotNo)) return 'Seri ve Lot boş — TİTCK kabul etmez'
  return utsAlanUzunlukHatasi(seriNo, lotNo) ?? undefined
}

function kalemOzet(kalemler: GonderilenItem['kalemler']): string {
  if (!kalemler.length) return '—'
  const ilk = kalemler[0]
  const ek = kalemler.length > 1 ? ` +${kalemler.length - 1}` : ''
  const parca = [ilk.barkod, ilk.lotNo || ilk.seriNo].filter(Boolean).join(' / ')
  return `${parca}${ek}`
}

export default function UtsYonetimiPage() {
  const navigate = useNavigate()
  const [sekme, setSekme] = useState<Sekme>('subeler')
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [secilenBranch, setSecilenBranch] = useState<string | null>(null)
  const secilenBranchData = branches.find((b) => b.id === secilenBranch) ?? null
  const [disFirmalar, setDisFirmalar] = useState<DisFirma[]>([])
  const [kuyruk, setKuyruk] = useState<KuyrukItem[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const [subeForm, setSubeForm] = useState({ kurumNo: '', token: '', ortam: 'canli' })
  const [tokenGoster, setTokenGoster] = useState(false)

  const [firmaForm, setFirmaForm] = useState({
    ad: '', vkn: '', kurumNo: '', adres: '', telefon: '', email: '', notlar: '',
    odooPartnerId: null as number | null,
  })
  const [secilenFirma, setSecilenFirma] = useState<string | null>(null)
  const [odooArama, setOdooArama] = useState('')
  const [odooSonuclar, setOdooSonuclar] = useState<any[]>([])
  const [odooAramaYukleniyor, setOdooAramaYukleniyor] = useState(false)
  const [lokasyonEkleAcik, setLokasyonEkleAcik] = useState(false)
  const [lokasyonForm, setLokasyonForm] = useState({ ad: '', kurumNo: '', varsayilan: false })

  const [bildirimForm, setBildirimForm] = useState({
    tip: 'ALMA',
    branchId: '',
    karsiKurumNo: '',
    karsiVkn: '',
    karsiAd: '',
    belgeNo: '',
    hemenGonder: true,
  })
  const [bildirimKalemler, setBildirimKalemler] = useState<BildirimKalem[]>([
    { barkod: '', seriNo: '', lotNo: '', adet: 1 },
  ])
  const [barkodMetin, setBarkodMetin] = useState('')
  const [seciliKuyruk, setSeciliKuyruk] = useState<string[]>([])

  const [bekleyenSubeKodu, setBekleyenSubeKodu] = useState('')
  const [bekleyenFiltre, setBekleyenFiltre] = useState({
    gonderenKurumNo: '',
    gonderenFirmaId: '',
    belgeNo: '',
    urunNumarasi: '',
  })
  const [bekleyenSatirlar, setBekleyenSatirlar] = useState<BekleyenAlmaSatir[]>([])
  const [bekleyenSorguYukleniyor, setBekleyenSorguYukleniyor] = useState(false)
  const [bekleyenIslemId, setBekleyenIslemId] = useState<string | null>(null)
  const [bekleyenSecili, setBekleyenSecili] = useState<string[]>([])
  const [gonderilen, setGonderilen] = useState<GonderilenItem[]>([])
  const [gonderilenSayac, setGonderilenSayac] = useState(0)
  const [urunGirisiBekleyenSayac, setUrunGirisiBekleyenSayac] = useState(0)
  const [urunGirisiBekleyen, setUrunGirisiBekleyen] = useState<UrunGirisiBekleyenItem[]>([])

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    try {
      const [brRes, kuyrukRes, gonderilenRes, urunGirisiRes] = await Promise.all([
        adminApi.get('/admin/uts/subeler'),
        adminApi.get('/admin/uts/kuyruk'),
        adminApi.get('/admin/uts/gonderilen', { params: { days: 30, limit: 100 } }),
        adminApi.get('/admin/uts/urun-girisi-bekleyen'),
      ])
      setBranches(brRes.data?.data ?? [])
      setKuyruk(kuyrukRes.data?.data ?? [])
      setGonderilen(gonderilenRes.data?.data ?? [])
      setGonderilenSayac(gonderilenRes.data?.count ?? 0)
      setUrunGirisiBekleyenSayac(urunGirisiRes.data?.sayac ?? 0)
      setUrunGirisiBekleyen(urunGirisiRes.data?.data ?? [])
    } catch {
      setMesaj({ tip: 'err', text: 'Veriler yüklenemedi' })
    } finally {
      setYukleniyor(false)
    }
  }, [])

  const disYukle = useCallback(async () => {
    const res = await adminApi.get('/admin/uts/dis-firmalar')
    setDisFirmalar(res.data?.data ?? [])
  }, [])

  useEffect(() => { void yukle() }, [yukle])
  useEffect(() => {
    if (sekme === 'firmalar' || sekme === 'bildirim' || sekme === 'bekleyen-alma') void disYukle()
  }, [sekme, disYukle])

  useEffect(() => {
    if (sekme === 'bekleyen-alma' && !bekleyenSubeKodu && branches.length) {
      const hazir = branches.find((b) => b.utsSube?.token && b.utsSube?.aktif)
      if (hazir) setBekleyenSubeKodu(hazir.code)
    }
  }, [sekme, bekleyenSubeKodu, branches])

  useEffect(() => {
    if (sekme !== 'firmalar' || odooArama.trim().length < 2) {
      setOdooSonuclar([])
      return
    }
    const t = setTimeout(() => {
      setOdooAramaYukleniyor(true)
      adminApi.get('/admin/uts/odoo-cariler', { params: { q: odooArama.trim() } })
        .then((res) => setOdooSonuclar(res.data?.data ?? []))
        .catch(() => setOdooSonuclar([]))
        .finally(() => setOdooAramaYukleniyor(false))
    }, 300)
    return () => clearTimeout(t)
  }, [odooArama, sekme])

  const secilenFirmaData = useMemo(
    () => disFirmalar.find((f) => f.id === secilenFirma) ?? null,
    [disFirmalar, secilenFirma],
  )

  const depoGrup = useMemo(
    () => branches.filter((b) => DEPO_GRUP_KODLARI.includes(b.code)),
    [branches],
  )
  const digerSubeler = useMemo(
    () => branches.filter((b) => !DEPO_GRUP_KODLARI.includes(b.code)),
    [branches],
  )

  const kuyrukStats = useMemo(() => ({
    bekleyen: kuyruk.filter((k) => k.durum === 'BEKLIYOR').length,
    hatali: kuyruk.filter((k) => k.durum === 'HATA').length,
    gonderildi: gonderilenSayac,
  }), [kuyruk, gonderilenSayac])

  function branchSec(branch: BranchRow) {
    setSecilenBranch(branch.id)
    setSubeForm({
      kurumNo: branch.utsSube?.kurumNo ?? '',
      token: branch.utsSube?.token ?? '',
      ortam: branch.utsSube?.ortam ?? 'canli',
    })
  }

  async function subeKaydet() {
    if (!secilenBranch) return
    setYukleniyor(true)
    try {
      await adminApi.post('/admin/uts/sube-kaydet', {
        branchId: secilenBranch,
        ...subeForm,
      })
      setMesaj({ tip: 'ok', text: 'Şube ayarları kaydedildi' })
      await yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Kayıt başarısız' })
    } finally {
      setYukleniyor(false)
    }
  }

  async function tokenTest() {
    if (!secilenBranch) return
    setYukleniyor(true)
    try {
      const res = await adminApi.post(`/admin/uts/token-test/${secilenBranch}`)
      setMesaj({
        tip: res.data?.success ? 'ok' : 'err',
        text: res.data?.mesaj ?? 'Test tamamlandı',
      })
      await yukle()
    } catch {
      setMesaj({ tip: 'err', text: 'Token testi başarısız' })
    } finally {
      setYukleniyor(false)
    }
  }

  function firmaSec(firma: DisFirma) {
    setSecilenFirma(firma.id)
    setFirmaForm({
      ad: firma.ad ?? '',
      vkn: firma.vkn ?? '',
      kurumNo: firma.kurumNo ?? '',
      adres: firma.adres ?? '',
      telefon: firma.telefon ?? '',
      email: firma.email ?? '',
      notlar: firma.notlar ?? '',
      odooPartnerId: firma.odooPartnerId ?? null,
    })
    setLokasyonEkleAcik(false)
    setLokasyonForm({ ad: '', kurumNo: '', varsayilan: false })
  }

  function yeniFirma() {
    setSecilenFirma(null)
    setFirmaForm({
      ad: '', vkn: '', kurumNo: '', adres: '', telefon: '', email: '', notlar: '',
      odooPartnerId: null,
    })
    setOdooArama('')
    setOdooSonuclar([])
    setLokasyonEkleAcik(false)
    setLokasyonForm({ ad: '', kurumNo: '', varsayilan: false })
  }

  function odooPartnerSec(partner: any) {
    setFirmaForm({
      ad: partner.name || '',
      vkn: partner.vat && partner.vat !== false ? partner.vat : '',
      kurumNo: '',
      telefon: partner.phone && partner.phone !== false ? partner.phone : '',
      email: partner.email && partner.email !== false ? partner.email : '',
      adres: [partner.street, partner.city].filter((x) => x && x !== false).join(', '),
      notlar: '',
      odooPartnerId: partner.id,
    })
    setOdooArama('')
    setOdooSonuclar([])
    setSecilenFirma(null)
  }

  async function firmaKaydet() {
    if (!firmaForm.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Firma adı zorunlu' })
      return
    }
    setYukleniyor(true)
    try {
      if (secilenFirma) {
        await adminApi.put(`/admin/uts/dis-firma/${secilenFirma}`, firmaForm)
        setMesaj({ tip: 'ok', text: 'Firma kaydedildi' })
      } else {
        const res = await adminApi.post('/admin/uts/dis-firma', firmaForm)
        setSecilenFirma(res.data?.data?.id ?? null)
        setMesaj({ tip: 'ok', text: 'Firma oluşturuldu' })
      }
      await disYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Kayıt başarısız' })
    } finally {
      setYukleniyor(false)
    }
  }

  async function lokasyonKaydet() {
    if (!secilenFirma) {
      setMesaj({ tip: 'err', text: 'Önce firmayı kaydedin' })
      return
    }
    if (!lokasyonForm.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Lokasyon adı zorunlu' })
      return
    }
    setYukleniyor(true)
    try {
      await adminApi.post(`/admin/uts/dis-firma/${secilenFirma}/lokasyon`, lokasyonForm)
      setLokasyonForm({ ad: '', kurumNo: '', varsayilan: false })
      setLokasyonEkleAcik(false)
      setMesaj({ tip: 'ok', text: 'Lokasyon eklendi' })
      await disYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Lokasyon kaydedilemedi' })
    } finally {
      setYukleniyor(false)
    }
  }

  async function lokasyonSil(id: string) {
    setYukleniyor(true)
    try {
      await adminApi.delete(`/admin/uts/dis-firma-lokasyon/${id}`)
      setMesaj({ tip: 'ok', text: 'Lokasyon silindi' })
      await disYukle()
    } catch {
      setMesaj({ tip: 'err', text: 'Lokasyon silinemedi' })
    } finally {
      setYukleniyor(false)
    }
  }

  async function lokasyonVarsayilanYap(lok: DisFirmaLokasyon) {
    setYukleniyor(true)
    try {
      await adminApi.put(`/admin/uts/dis-firma-lokasyon/${lok.id}`, {
        ad: lok.ad,
        kurumNo: lok.kurumNo,
        varsayilan: true,
      })
      await disYukle()
    } catch {
      setMesaj({ tip: 'err', text: 'Varsayılan güncellenemedi' })
    } finally {
      setYukleniyor(false)
    }
  }

  function firmaBildirimeUygula(firmaId: string) {
    const f = disFirmalar.find((x) => x.id === firmaId)
    if (!f) return
    const varsayilanLok = f.lokasyonlar?.find((l) => l.varsayilan) ?? f.lokasyonlar?.[0]
    setBildirimForm((p) => ({
      ...p,
      karsiAd: f.ad,
      karsiKurumNo: varsayilanLok?.kurumNo ?? f.kurumNo ?? '',
      karsiVkn: f.vkn ?? '',
    }))
  }

  function barkodlariEkle() {
    const satirlar = barkodMetin
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    if (!satirlar.length) return
    const yeni = satirlar.map((satir) => {
      if (isGs1DataMatrix(satir)) {
        const parsed = parseGs1DataMatrix(satir)
        if (parsed?.gtin14) {
          const kalem: BildirimKalem = {
            barkod: parsed.gtin14,
            seriNo: parsed.serial ?? '',
            lotNo: parsed.lot ?? '',
            adet: 1,
            hamMetin: satir,
          }
          kalem.parseUyari = kalemUyariMetni(kalem.seriNo, kalem.lotNo)
            ?? (isUtsSeriLotEksik(kalem.seriNo, kalem.lotNo) ? 'GS1 ayrıştırılamadı — Seri ve Lot boş, manuel girin' : undefined)
          return kalem
        }
        return {
          barkod: satir,
          seriNo: '',
          lotNo: '',
          adet: 1,
          hamMetin: satir,
          parseUyari: 'GS1 ayrıştırılamadı — manuel girin',
        }
      }
      const parcalar = satir.split(/[\t,;]+/).map((p) => p.trim()).filter(Boolean)
      const dortParca = parcalar.length >= 4
      const kalem: BildirimKalem = {
        barkod: parcalar[0] ?? '',
        seriNo: parcalar[1] ?? '',
        lotNo: dortParca ? (parcalar[2] ?? '') : '',
        adet: Number(dortParca ? parcalar[3] : parcalar[2]) || 1,
        hamMetin: satir,
      }
      kalem.parseUyari = kalemUyariMetni(kalem.seriNo, kalem.lotNo)
        ?? (isUtsSeriLotEksik(kalem.seriNo, kalem.lotNo) ? 'Seri ve Lot boş — TİTCK kabul etmez, manuel girin' : undefined)
      return kalem
    }).filter((k) => k.barkod)
    setBildirimKalemler((prev) => {
      const bosHaric = prev.filter((k) => k.barkod.trim())
      return [...bosHaric, ...yeni]
    })
    setBarkodMetin('')
  }

  async function bildirimOlustur() {
    const kalemler = bildirimKalemler.filter((k) => k.barkod.trim())
    if (!bildirimForm.branchId || !kalemler.length) {
      setMesaj({ tip: 'err', text: 'Şube ve en az bir barkod zorunlu' })
      return
    }
    const eksikKalemler = kalemler.filter((k) => isUtsSeriLotEksik(k.seriNo, k.lotNo))
    if (eksikKalemler.length) {
      setMesaj({
        tip: 'err',
        text: `Şu kalemlerde ne Seri No ne de Lot No var, TİTCK bunu kabul etmez: ${eksikKalemler.map((k) => k.barkod).join(', ')}`,
      })
      return
    }
    const uzunKalemler = kalemler
      .map((k) => ({ k, hata: utsAlanUzunlukHatasi(k.seriNo, k.lotNo) }))
      .filter((x) => x.hata)
    if (uzunKalemler.length) {
      setMesaj({ tip: 'err', text: `${uzunKalemler[0].k.barkod}: ${uzunKalemler[0].hata}` })
      return
    }
    setYukleniyor(true)
    try {
      await adminApi.post('/admin/uts/bildirim-olustur', {
        ...bildirimForm,
        kalemler,
      })
      setMesaj({ tip: 'ok', text: 'Bildirim oluşturuldu' })
      setBildirimKalemler([{ barkod: '', seriNo: '', lotNo: '', adet: 1 }])
      setBarkodMetin('')
      await yukle()
      setSekme('kuyruk')
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Bildirim oluşturulamadı' })
    } finally {
      setYukleniyor(false)
    }
  }

  async function bildirimGonder(id: string) {
    setYukleniyor(true)
    try {
      await adminApi.post(`/admin/uts/bildirim-gonder/${id}`)
      setMesaj({ tip: 'ok', text: 'Bildirim gönderildi' })
      await yukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Gönderim başarısız' })
    } finally {
      setYukleniyor(false)
    }
  }

  async function topluGonder(ids?: string[]) {
    const hedef = ids ?? seciliKuyruk
    if (!hedef.length) return
    setYukleniyor(true)
    try {
      const res = await adminApi.post('/admin/uts/toplu-gonder', { ids: hedef })
      const ok = (res.data?.sonuclar ?? []).filter((s: { durum: string }) => s.durum === 'GONDERILDI').length
      setMesaj({ tip: 'ok', text: `${ok} bildirim gönderildi` })
      setSeciliKuyruk([])
      await yukle()
    } catch {
      setMesaj({ tip: 'err', text: 'Toplu gönderim başarısız' })
    } finally {
      setYukleniyor(false)
    }
  }

  async function bekleyenAlmaSorgula() {
    if (!bekleyenSubeKodu) {
      setMesaj({ tip: 'err', text: 'Şube seçin' })
      return
    }
    setBekleyenSorguYukleniyor(true)
    setMesaj(null)
    try {
      const gkk = bekleyenFiltre.gonderenKurumNo.trim()
      const res = await adminApi.get('/admin/uts/alma-bekleyenler', {
        params: {
          subeKodu: bekleyenSubeKodu,
          belgeNo: bekleyenFiltre.belgeNo.trim() || undefined,
          gkk: gkk ? Number(gkk) : undefined,
          uno: bekleyenFiltre.urunNumarasi.trim() || undefined,
        },
      })
      const satirlar: BekleyenAlmaSatir[] = res.data?.data ?? []
      setBekleyenSatirlar(satirlar)
      setBekleyenSecili([])
      setMesaj({
        tip: 'ok',
        text: `${res.data?.subeAdi ?? bekleyenSubeKodu} — ${satirlar.length} bekleyen kayıt`,
      })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setMesaj({ tip: 'err', text: err?.response?.data?.error ?? err?.message ?? 'Sorgu başarısız' })
      setBekleyenSatirlar([])
    } finally {
      setBekleyenSorguYukleniyor(false)
    }
  }

  function bekleyenFiltreTemizle() {
    setBekleyenFiltre({ gonderenKurumNo: '', gonderenFirmaId: '', belgeNo: '', urunNumarasi: '' })
    setBekleyenSatirlar([])
  }

  function bekleyenGonderenFirmaSec(firmaId: string) {
    const f = disFirmalar.find((x) => x.id === firmaId)
    const varsayilanLok = f?.lokasyonlar?.find((l) => l.varsayilan) ?? f?.lokasyonlar?.[0]
    setBekleyenFiltre((p) => ({
      ...p,
      gonderenFirmaId: firmaId,
      gonderenKurumNo: varsayilanLok?.kurumNo ?? f?.kurumNo ?? '',
    }))
  }

  async function bekleyenTopluBildir(hedef?: string[]) {
    const keys = hedef ?? bekleyenSecili
    if (!keys.length) return
    const satirlar = bekleyenSatirlar.filter((s, idx) => keys.includes(bekleyenSatirKey(s, idx)))
    if (!satirlar.length) return
    setYukleniyor(true)
    setMesaj(null)
    try {
      const res = await adminApi.post('/admin/uts/bekleyen-alma-toplu-bildir', {
        subeKodu: bekleyenSubeKodu,
        satirlar,
      })
      const basarili = res.data?.basarili ?? 0
      const basarisiz = res.data?.basarisiz ?? 0
      setMesaj({
        tip: basarisiz === 0 ? 'ok' : 'err',
        text: `Toplu alma bildirimi: ${basarili} başarılı, ${basarisiz} başarısız`,
      })
      setBekleyenSecili([])
      await bekleyenAlmaSorgula()
      await yukle()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setMesaj({ tip: 'err', text: err?.response?.data?.error ?? err?.message ?? 'Toplu bildirim başarısız' })
    } finally {
      setYukleniyor(false)
    }
  }

  function depoyaUrunGirisiYonlendir(satir: BekleyenAlmaSatir, bildirimId?: string) {
    setUtsUrunGirisBridge({
      barkod: satir.uno,
      seriNo: satir.sno,
      lotNo: satir.lno,
      adet: satir.adt ?? 1,
      belgeNo: satir.bno,
      tedarikciAd: satir.gonderenKurum,
      utsBildirimId: bildirimId,
    })
    navigate('/admin/depo?tab=urun-giris')
  }

  async function bekleyenAlmaBildir(satir: BekleyenAlmaSatir) {
    const branch = branches.find((b) => b.code === bekleyenSubeKodu)
    if (!branch) {
      setMesaj({ tip: 'err', text: 'Şube bulunamadı' })
      return
    }
    const islemKey = bekleyenSatirKey(satir, 0)
    setBekleyenIslemId(islemKey)
    setMesaj(null)
    try {
      const res = await adminApi.post('/admin/uts/bildirim-olustur', {
        tip: 'ALMA',
        branchId: branch.id,
        belgeNo: satir.bno ?? '',
        karsiKurumNo: satir.gkk ? String(satir.gkk) : '',
        karsiAd: satir.gonderenKurum ?? '',
        hemenGonder: true,
        kalemler: [{
          barkod: satir.uno,
          seriNo: satir.sno ?? '',
          lotNo: satir.lno ?? '',
          adet: satir.adt ?? 1,
        }],
      })
      const durum = res.data?.data?.durum
      setMesaj({
        tip: durum === 'GONDERILDI' ? 'ok' : 'err',
        text: durum === 'GONDERILDI'
          ? `Alma bildirimi gönderildi — ${satir.uno}`
          : res.data?.data?.hataDetay ?? 'Alma bildirimi gönderilemedi',
      })
      await bekleyenAlmaSorgula()
      await yukle()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setMesaj({ tip: 'err', text: err?.response?.data?.error ?? err?.message ?? 'Alma bildirimi başarısız' })
    } finally {
      setBekleyenIslemId(null)
    }
  }

  async function bekleyenAlmakIstemiyorum(satir: BekleyenAlmaSatir) {
    if (!satir.bid) {
      setMesaj({ tip: 'err', text: 'Bildirim kodu (BID) yok — işlem yapılamaz' })
      return
    }
    if (!window.confirm(`${satir.uno} için "Almak İstemiyorum" işaretlensin mi?`)) return
    const islemKey = `red-${satir.bid}`
    setBekleyenIslemId(islemKey)
    setMesaj(null)
    try {
      await adminApi.post('/admin/uts/almak-istemiyorum', {
        subeKodu: bekleyenSubeKodu,
        bid: satir.bid,
      })
      setMesaj({ tip: 'ok', text: `Almak istemiyorum işaretlendi — ${satir.uno}` })
      await bekleyenAlmaSorgula()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      setMesaj({ tip: 'err', text: err?.response?.data?.error ?? err?.message ?? 'İşlem başarısız' })
    } finally {
      setBekleyenIslemId(null)
    }
  }

  const karsiTarafGoster = ['VERME', 'TANIMSIZ_YERE_VERME'].includes(bildirimForm.tip)

  function renderBranchItem(branch: BranchRow) {
    const badge = subeDurumBadge(branch)
    const active = secilenBranch === branch.id
    return (
      <button
        key={branch.id}
        type="button"
        onClick={() => branchSec(branch)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '12px 14px',
          border: active ? `2px solid ${RED}` : '1px solid #e5e7eb',
          borderRadius: 10,
          backgroundColor: active ? '#fef2f2' : '#fff',
          cursor: 'pointer',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{branch.code}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{branch.name}</div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            backgroundColor: badge.bg, color: badge.color,
          }}>
            {badge.label}
          </span>
        </div>
      </button>
    )
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
        UTS Yönetimi
        {urunGirisiBekleyenSayac > 0 ? (
          <span
            title="UTS'te kabul edildi ama depoya henüz girilmedi (3+ gün)"
            style={{
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
              backgroundColor: '#fef3c7', color: AMBER,
            }}
          >
            {urunGirisiBekleyenSayac} ürün girişi bekliyor
          </span>
        ) : null}
      </h1>
      <p style={{ color: '#6b7280', marginBottom: 20, fontSize: 14 }}>
        Ürün Takip Sistemi — şube token, dış firma rehberi ve bildirim kuyruğu
      </p>

      {mesaj ? (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600,
          backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
          color: mesaj.tip === 'ok' ? GREEN : RED,
        }}>
          {mesaj.text}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        {([
          ['subeler', 'Şube Tanımlamaları'],
          ['firmalar', 'Dış Firma Rehberi'],
          ['bildirim', 'Bildirim Oluştur'],
          ['bekleyen-alma', 'Bekleyen Alma Bildirimleri'],
          ['kuyruk', 'Bildirim Kuyruğu'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setSekme(id)} style={sekmeBtn(sekme === id)}>
            {label}
          </button>
        ))}
      </div>

      {sekme === 'subeler' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
          <div>
            {depoGrup.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 8, letterSpacing: '0.05em' }}>
                  DEPO GRUBU (GVN2 + ANADEPO)
                </div>
                {depoGrup.map(renderBranchItem)}
              </div>
            ) : null}
            <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 8, letterSpacing: '0.05em' }}>
              MAĞAZALAR
            </div>
            {digerSubeler.map(renderBranchItem)}
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, backgroundColor: '#fff' }}>
            {!secilenBranchData ? (
              <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Soldan bir şube seçin</div>
            ) : (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
                  {secilenBranchData.code} — UTS Ayarları
                </h2>
                <div style={{ display: 'grid', gap: 14, maxWidth: 480 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Kurum No</label>
                    <input
                      value={subeForm.kurumNo}
                      onChange={(e) => setSubeForm((p) => ({ ...p, kurumNo: e.target.value }))}
                      style={inp}
                      placeholder="UTS kurum numarası"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Token</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type={tokenGoster ? 'text' : 'password'}
                        value={subeForm.token}
                        onChange={(e) => setSubeForm((p) => ({ ...p, token: e.target.value }))}
                        style={{ ...inp, flex: 1 }}
                        placeholder="UTS API token"
                      />
                      <button type="button" onClick={() => setTokenGoster((v) => !v)} style={btnSmall}>
                        {tokenGoster ? 'Gizle' : 'Göster'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Ortam</label>
                    <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                      {(['canli', 'test'] as const).map((o) => (
                        <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <input
                            type="radio"
                            checked={subeForm.ortam === o}
                            onChange={() => setSubeForm((p) => ({ ...p, ortam: o }))}
                          />
                          {o === 'canli' ? 'Canlı' : 'Test'}
                        </label>
                      ))}
                    </div>
                  </div>
                  {secilenBranchData.utsSube?.sonKontrol ? (
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      Son kontrol: {new Date(secilenBranchData.utsSube.sonKontrol).toLocaleString('tr-TR')}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button type="button" onClick={() => void subeKaydet()} disabled={yukleniyor} style={btnPrimary}>
                      Kaydet
                    </button>
                    <button type="button" onClick={() => void tokenTest()} disabled={yukleniyor} style={btnSmall}>
                      Token test et
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {sekme === 'firmalar' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
          <div>
            <button type="button" onClick={yeniFirma} style={{ ...btnSmall, marginBottom: 12, width: '100%' }}>
              + Yeni firma
            </button>
            {disFirmalar.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => firmaSec(f)}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 8,
                  border: secilenFirma === f.id ? `2px solid ${RED}` : '1px solid #e5e7eb',
                  borderRadius: 10, backgroundColor: secilenFirma === f.id ? '#fef2f2' : '#fff', cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14 }}>{f.ad}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  {f.kurumNo ? (
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, backgroundColor: '#dbeafe', color: BLUE }}>
                      KUN: {f.kurumNo}
                    </span>
                  ) : null}
                  {f.vkn ? (
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, backgroundColor: '#f3f4f6', color: '#374151' }}>
                      VKN: {f.vkn}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, backgroundColor: '#fff' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>
              {secilenFirma ? 'Firma Düzenle' : 'Yeni Firma'}
            </h2>

            <div style={{ marginBottom: 20, padding: 14, backgroundColor: '#f9fafb', borderRadius: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Odoo&apos;dan içe aktar</div>
              <input
                value={odooArama}
                onChange={(e) => setOdooArama(e.target.value)}
                placeholder="Firma adı yazın (min. 2 karakter)..."
                style={inp}
              />
              {odooAramaYukleniyor ? (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Aranıyor...</div>
              ) : null}
              {odooSonuclar.length > 0 ? (
                <div style={{
                  marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8,
                  maxHeight: 200, overflowY: 'auto', backgroundColor: '#fff',
                }}>
                  {odooSonuclar.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => odooPartnerSec(p)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '10px 12px', border: 'none', borderBottom: '1px solid #f3f4f6',
                        background: 'transparent', cursor: 'pointer', fontSize: 13,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        {[p.vat, p.city].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              <button type="button" onClick={yeniFirma} style={{ ...btnSmall, marginTop: 10 }}>
                Manuel ekle
              </button>
            </div>

            <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
              {(['ad', 'vkn', 'kurumNo', 'telefon', 'email'] as const).map((key) => (
                <div key={key}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>{key === 'ad' ? 'Firma Adı *' : key.toUpperCase()}</label>
                  <input
                    value={firmaForm[key]}
                    onChange={(e) => setFirmaForm((p) => ({ ...p, [key]: e.target.value }))}
                    style={inp}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Adres</label>
                <input value={firmaForm.adres} onChange={(e) => setFirmaForm((p) => ({ ...p, adres: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Notlar</label>
                <textarea value={firmaForm.notlar} onChange={(e) => setFirmaForm((p) => ({ ...p, notlar: e.target.value }))} style={{ ...inp, minHeight: 80 }} />
              </div>
              {firmaForm.odooPartnerId ? (
                <div style={{ fontSize: 12, color: '#6b7280' }}>Odoo Partner ID: {firmaForm.odooPartnerId}</div>
              ) : null}
              <button type="button" onClick={() => void firmaKaydet()} disabled={yukleniyor} style={btnPrimary}>
                Kaydet
              </button>
            </div>

            {secilenFirma && secilenFirmaData ? (
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Lokasyonlar</h3>
                  <button
                    type="button"
                    onClick={() => setLokasyonEkleAcik((v) => !v)}
                    style={btnSmall}
                  >
                    + Lokasyon ekle
                  </button>
                </div>

                {(secilenFirmaData.lokasyonlar ?? []).length === 0 && !lokasyonEkleAcik ? (
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>Henüz lokasyon yok</div>
                ) : null}

                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  {(secilenFirmaData.lokasyonlar ?? []).map((lok) => (
                    <div
                      key={lok.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => void lokasyonVarsayilanYap(lok)}
                        title="Varsayılan yap"
                        style={{
                          border: 'none', background: 'transparent', cursor: 'pointer',
                          fontSize: 16, color: lok.varsayilan ? AMBER : '#d1d5db',
                        }}
                      >
                        ★
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{lok.ad}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>
                          {lok.kurumNo ? `KUN: ${lok.kurumNo}` : 'Kurum no yok'}
                          {lok.varsayilan ? ' · Varsayılan' : ''}
                        </div>
                      </div>
                      <button type="button" onClick={() => void lokasyonSil(lok.id)} style={{ ...btnSmall, color: RED }}>
                        Sil
                      </button>
                    </div>
                  ))}
                </div>

                {lokasyonEkleAcik ? (
                  <div style={{
                    display: 'grid', gap: 10, padding: 12,
                    border: '1px dashed #e5e7eb', borderRadius: 8,
                  }}>
                    <input
                      placeholder="Lokasyon adı (ör. Merkez, İstanbul Fabrika)"
                      value={lokasyonForm.ad}
                      onChange={(e) => setLokasyonForm((p) => ({ ...p, ad: e.target.value }))}
                      style={inp}
                    />
                    <input
                      placeholder="UTS kurum no"
                      value={lokasyonForm.kurumNo}
                      onChange={(e) => setLokasyonForm((p) => ({ ...p, kurumNo: e.target.value }))}
                      style={inp}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={lokasyonForm.varsayilan}
                        onChange={(e) => setLokasyonForm((p) => ({ ...p, varsayilan: e.target.checked }))}
                      />
                      Varsayılan lokasyon
                    </label>
                    <button type="button" onClick={() => void lokasyonKaydet()} disabled={yukleniyor} style={btnPrimary}>
                      Lokasyonu Kaydet
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {sekme === 'bildirim' ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, backgroundColor: '#fff', maxWidth: 900 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Bildirim Tipi</label>
                <select
                  value={bildirimForm.tip}
                  onChange={(e) => setBildirimForm((p) => ({ ...p, tip: e.target.value }))}
                  style={inp}
                >
                  {BILDIRIM_TIPLERI.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Kaynak Şube</label>
                <select
                  value={bildirimForm.branchId}
                  onChange={(e) => setBildirimForm((p) => ({ ...p, branchId: e.target.value }))}
                  style={inp}
                >
                  <option value="">Seçin</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {karsiTarafGoster ? (
              <div style={{ padding: 14, backgroundColor: '#f9fafb', borderRadius: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>Karşı Taraf</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value) firmaBildirimeUygula(e.target.value) }}
                    style={inp}
                  >
                    <option value="">Dış firma seç...</option>
                    {disFirmalar.map((f) => (
                      <option key={f.id} value={f.id}>{f.ad}</option>
                    ))}
                  </select>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <input placeholder="Kurum No" value={bildirimForm.karsiKurumNo} onChange={(e) => setBildirimForm((p) => ({ ...p, karsiKurumNo: e.target.value }))} style={inp} />
                    <input placeholder="VKN" value={bildirimForm.karsiVkn} onChange={(e) => setBildirimForm((p) => ({ ...p, karsiVkn: e.target.value }))} style={inp} />
                    <input placeholder="Ad" value={bildirimForm.karsiAd} onChange={(e) => setBildirimForm((p) => ({ ...p, karsiAd: e.target.value }))} style={inp} />
                  </div>
                </div>
              </div>
            ) : null}

            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Belge No (fatura/irsaliye)</label>
              <input value={bildirimForm.belgeNo} onChange={(e) => setBildirimForm((p) => ({ ...p, belgeNo: e.target.value }))} style={inp} />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Barkod girişi (GS1 tek satır veya barkod, seri, lot, adet)</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <textarea
                  value={barkodMetin}
                  onChange={(e) => setBarkodMetin(e.target.value)}
                  placeholder="8690000000001&#10;8690000000002, SN123, 2"
                  style={{ ...inp, flex: 1, minHeight: 100, fontFamily: 'monospace', fontSize: 12 }}
                />
                <button type="button" onClick={barkodlariEkle} style={btnPrimary}>Ekle</button>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {['Barkod (UNO)', 'Seri No', 'Lot No', 'Adet', ''].map((h) => (
                    <th key={h} style={{ padding: 8, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bildirimKalemler.map((k, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f3f4f6', backgroundColor: k.parseUyari ? '#fef2f2' : undefined }}>
                    <td style={{ padding: 6 }}>
                      <input value={k.barkod} onChange={(e) => setBildirimKalemler((prev) => prev.map((x, j) => j === i ? { ...x, barkod: e.target.value, parseUyari: kalemUyariMetni(x.seriNo, x.lotNo) } : x))} style={{ ...inp, padding: '4px 8px' }} />
                      {k.hamMetin ? (
                        <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace', marginTop: 4, wordBreak: 'break-all' }} title="Orijinal yapıştırılan ham veri">
                          ham: {k.hamMetin}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: 6 }}>
                      <input value={k.seriNo} onChange={(e) => setBildirimKalemler((prev) => prev.map((x, j) => j === i ? { ...x, seriNo: e.target.value, parseUyari: kalemUyariMetni(e.target.value, x.lotNo) } : x))} style={{ ...inp, padding: '4px 8px' }} />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input value={k.lotNo} onChange={(e) => setBildirimKalemler((prev) => prev.map((x, j) => j === i ? { ...x, lotNo: e.target.value, parseUyari: kalemUyariMetni(x.seriNo, e.target.value) } : x))} style={{ ...inp, padding: '4px 8px' }} />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input type="number" min={1} value={k.adet} onChange={(e) => setBildirimKalemler((prev) => prev.map((x, j) => j === i ? { ...x, adet: Number(e.target.value) || 1 } : x))} style={{ ...inp, padding: '4px 8px', width: 70 }} />
                    </td>
                    <td style={{ padding: 6 }}>
                      {k.parseUyari ? (
                        <span style={{ color: RED, fontSize: 10, display: 'block', marginBottom: 4 }}>{k.parseUyari}</span>
                      ) : null}
                      <button type="button" onClick={() => setBildirimKalemler((prev) => prev.filter((_, j) => j !== i))} style={{ ...btnSmall, color: RED }}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={bildirimForm.hemenGonder}
                onChange={(e) => setBildirimForm((p) => ({ ...p, hemenGonder: e.target.checked }))}
              />
              Hemen gönder
            </label>

            <button type="button" onClick={() => void bildirimOlustur()} disabled={yukleniyor} style={btnPrimary}>
              Bildirimi Oluştur
            </button>
          </div>
        </div>
      ) : null}

      {sekme === 'bildirim' && disFirmalar.length === 0 ? (
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: -8 }}>
          Dış firma listesi boş — Verme bildirimleri için önce &quot;Dış Firma Rehberi&quot; sekmesinden firma ekleyin.
        </div>
      ) : null}

      {sekme === 'bekleyen-alma' ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, backgroundColor: '#fff' }}>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0, marginBottom: 16 }}>
            TİTCK portalındaki &quot;Ürün Kabul İşlemleri / Alma Bildir&quot; ekranının karşılığı.
            Şube dropdown ile sorgu yapılır — her yeni şube için ayrı sekme gerekmez.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Şube *</label>
              <select
                value={bekleyenSubeKodu}
                onChange={(e) => setBekleyenSubeKodu(e.target.value)}
                style={inp}
              >
                <option value="">Seçin</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.code}>
                    {b.code} — {b.name}
                    {!b.utsSube?.token ? ' (token yok)' : !b.utsSube?.aktif ? ' (pasif)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Gönderen (dış firma)</label>
              <select
                value={bekleyenFiltre.gonderenFirmaId}
                onChange={(e) => {
                  if (e.target.value) bekleyenGonderenFirmaSec(e.target.value)
                  else setBekleyenFiltre((p) => ({ ...p, gonderenFirmaId: '', gonderenKurumNo: '' }))
                }}
                style={inp}
              >
                <option value="">Firma seç veya kurum no girin</option>
                {disFirmalar.map((f) => (
                  <option key={f.id} value={f.id}>{f.ad}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Gönderen Kurum No (GKK)</label>
              <input
                value={bekleyenFiltre.gonderenKurumNo}
                onChange={(e) => setBekleyenFiltre((p) => ({ ...p, gonderenKurumNo: e.target.value, gonderenFirmaId: '' }))}
                placeholder="2667269..."
                style={inp}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Belge Numarası</label>
              <input
                value={bekleyenFiltre.belgeNo}
                onChange={(e) => setBekleyenFiltre((p) => ({ ...p, belgeNo: e.target.value }))}
                style={inp}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, marginBottom: 20, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Ürün Numarası (UNO)</label>
              <input
                value={bekleyenFiltre.urunNumarasi}
                onChange={(e) => setBekleyenFiltre((p) => ({ ...p, urunNumarasi: e.target.value }))}
                style={inp}
              />
            </div>
            <button
              type="button"
              onClick={() => void bekleyenAlmaSorgula()}
              disabled={bekleyenSorguYukleniyor || !bekleyenSubeKodu}
              style={btnPrimary}
            >
              {bekleyenSorguYukleniyor ? 'Sorgulanıyor…' : 'Sorgula'}
            </button>
            <button type="button" onClick={bekleyenFiltreTemizle} style={btnSmall}>
              Temizle
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setBekleyenSecili(bekleyenSatirlar.map((s, idx) => bekleyenSatirKey(s, idx)))}
              disabled={!bekleyenSatirlar.length}
              style={btnSmall}
            >
              Tümünü Seç
            </button>
            <button
              type="button"
              onClick={() => void bekleyenTopluBildir(bekleyenSatirlar.map((s, idx) => bekleyenSatirKey(s, idx)))}
              disabled={yukleniyor || !bekleyenSatirlar.length}
              style={btnSmall}
            >
              Tümünü Bildir
            </button>
            <button
              type="button"
              onClick={() => void bekleyenTopluBildir()}
              disabled={yukleniyor || !bekleyenSecili.length}
              style={btnPrimary}
            >
              Seçilenleri Bildir ({bekleyenSecili.length})
            </button>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflowX: 'auto', backgroundColor: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 1400 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {[
                    '', 'Ürün Numarası', 'GS1 (yeniden oluşturulmuş)', 'Gönderen Kurum No', 'Bildirim Kodu', 'Lot/Batch',
                    'Seri/Sıra', 'Ürün Tanımı', 'Gönderen Kurum', 'Adet', 'Belge No',
                    'Bildirim Durumu', 'Bildirim Zamanı', 'Verme Tarihi', '',
                  ].map((h) => (
                    <th key={h || 'chk'} style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bekleyenSatirlar.map((s, idx) => {
                  const islemKey = bekleyenSatirKey(s, idx)
                  const islemde = bekleyenIslemId === islemKey || bekleyenIslemId === `red-${islemKey}`
                  const gs1Gosterim = formatGs1FromUtsFields(s.uno, s.lno, s.sno)
                  return (
                    <tr key={islemKey} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 6 }}>
                        <input
                          type="checkbox"
                          checked={bekleyenSecili.includes(islemKey)}
                          onChange={(e) => setBekleyenSecili((prev) => e.target.checked
                            ? [...prev, islemKey]
                            : prev.filter((x) => x !== islemKey))}
                        />
                      </td>
                      <td style={{ padding: 6, fontFamily: 'monospace' }}>{s.uno}</td>
                      <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 10, maxWidth: 180, wordBreak: 'break-all' }} title="TİTCK alanlarından yeniden oluşturulmuş gösterim">
                        {gs1Gosterim}
                      </td>
                      <td style={{ padding: 6 }}>{s.gkk ?? '—'}</td>
                      <td style={{ padding: 6, fontSize: 10, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.bid}>{s.bid ?? '—'}</td>
                      <td style={{ padding: 6 }}>{s.lno ?? '—'}</td>
                      <td style={{ padding: 6 }}>{s.sno ?? '—'}</td>
                      <td style={{ padding: 6, maxWidth: 200 }} title={s.urunTanimi}>{s.urunTanimi ?? '—'}</td>
                      <td style={{ padding: 6, maxWidth: 140 }} title={s.gonderenKurum}>{s.gonderenKurum ?? '—'}</td>
                      <td style={{ padding: 6 }}>{s.adt ?? 1}</td>
                      <td style={{ padding: 6 }}>{s.bno ?? '—'}</td>
                      <td style={{ padding: 6 }}>{s.bildirimDurumu ?? '—'}</td>
                      <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{s.bildirimZamani ?? '—'}</td>
                      <td style={{ padding: 6, whiteSpace: 'nowrap' }}>{s.vermeTarihi ?? '—'}</td>
                      <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => void bekleyenAlmaBildir(s)}
                          disabled={islemde}
                          style={{ ...btnSmall, marginRight: 6, color: GREEN, borderColor: GREEN }}
                        >
                          Alma Bildir
                        </button>
                        <button
                          type="button"
                          onClick={() => depoyaUrunGirisiYonlendir(s)}
                          style={{ ...btnSmall, marginRight: 6, color: BLUE, borderColor: BLUE }}
                        >
                          Depoya Giriş
                        </button>
                        <button
                          type="button"
                          onClick={() => void bekleyenAlmakIstemiyorum(s)}
                          disabled={islemde || !s.bid}
                          style={{ ...btnSmall, color: RED, borderColor: RED }}
                          title={s.bid ? undefined : 'BID yok'}
                        >
                          Almak İstemiyorum
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {bekleyenSatirlar.length === 0 ? (
                  <tr>
                    <td colSpan={15} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                      {bekleyenSorguYukleniyor ? 'Sorgulanıyor…' : 'Sorgula ile bekleyen kayıtları listeleyin'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {sekme === 'kuyruk' ? (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Bekleyen', value: kuyrukStats.bekleyen, color: AMBER },
              { label: 'Gönderildi', value: kuyrukStats.gonderildi, color: GREEN },
              { label: 'Hatalı', value: kuyrukStats.hatali, color: RED },
            ].map((c) => (
              <div key={c.label} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#fff' }}>
                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button type="button" onClick={() => void topluGonder(kuyruk.map((k) => k.id))} disabled={yukleniyor || !kuyruk.length} style={btnSmall}>
              Tümünü gönder
            </button>
            <button type="button" onClick={() => void topluGonder()} disabled={yukleniyor || !seciliKuyruk.length} style={btnPrimary}>
              Seçilenleri gönder ({seciliKuyruk.length})
            </button>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {['', 'Tip', 'Şube', 'Karşı Taraf', 'Kalem', 'Tarih', 'Bekleme Nedeni', 'Durum', ''].map((h) => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kuyruk.map((k) => (
                  <tr key={k.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8 }}>
                      <input
                        type="checkbox"
                        checked={seciliKuyruk.includes(k.id)}
                        onChange={(e) => setSeciliKuyruk((prev) => e.target.checked ? [...prev, k.id] : prev.filter((x) => x !== k.id))}
                      />
                    </td>
                    <td style={{ padding: 8 }}>{tipLabel(k.tip)}</td>
                    <td style={{ padding: 8 }}>{k.branch?.code ?? '—'}</td>
                    <td style={{ padding: 8 }}>{k.karsiAd || k.karsiKurumNo || k.karsiVkn || '—'}</td>
                    <td style={{ padding: 8 }}>{k.kalemler.length}</td>
                    <td style={{ padding: 8 }}>{new Date(k.createdAt).toLocaleString('tr-TR')}</td>
                    <td style={{ padding: 8, color: RED, maxWidth: 160 }}>{k.hataDetay || (k.durum === 'BEKLIYOR' ? 'Token/bekleme' : '—')}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        backgroundColor: k.durum === 'HATA' ? '#fee2e2' : '#fef3c7',
                        color: k.durum === 'HATA' ? RED : AMBER,
                      }}>
                        {k.durum}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>
                      <button type="button" onClick={() => void bildirimGonder(k.id)} style={btnSmall}>Gönder</button>
                    </td>
                  </tr>
                ))}
                {kuyruk.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Kuyruk boş</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: 16, fontWeight: 800, marginTop: 28, marginBottom: 12 }}>
            Başarıyla Gönderilen Bildirimler (son 30 gün)
          </h3>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  {['Tarih', 'Tip', 'Şube', 'Karşı Taraf', 'Kalem', 'Barkod/Lot', 'Ürün Girişi', ''].map((h) => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gonderilen.map((g) => (
                  <tr key={g.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                      {g.gonderimZamani ? new Date(g.gonderimZamani).toLocaleString('tr-TR') : new Date(g.createdAt).toLocaleString('tr-TR')}
                    </td>
                    <td style={{ padding: 8 }}>{tipLabel(g.tip)}</td>
                    <td style={{ padding: 8 }}>{g.branch?.code ?? '—'}</td>
                    <td style={{ padding: 8 }}>{g.karsiAd ?? '—'}</td>
                    <td style={{ padding: 8 }}>{g.kalemler.length}</td>
                    <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>{kalemOzet(g.kalemler)}</td>
                    <td style={{ padding: 8 }}>
                      {g.tip === 'ALMA' ? (
                        g.urunGirisiYapildiMi ? (
                          <span style={{ color: GREEN, fontWeight: 700 }}>Yapıldı</span>
                        ) : (
                          <span style={{ color: AMBER, fontWeight: 700 }}>Bekliyor</span>
                        )
                      ) : '—'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {g.tip === 'ALMA' && !g.urunGirisiYapildiMi && g.kalemler[0] ? (
                        <button
                          type="button"
                          style={{ ...btnSmall, color: BLUE, borderColor: BLUE }}
                          onClick={() => depoyaUrunGirisiYonlendir({
                            uno: g.kalemler[0].barkod,
                            sno: g.kalemler[0].seriNo ?? undefined,
                            lno: g.kalemler[0].lotNo ?? undefined,
                            adt: g.kalemler[0].adet,
                            bno: g.belgeNo ?? undefined,
                          }, g.id)}
                        >
                          Depoya Giriş
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {gonderilen.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Henüz gönderilmiş bildirim yok</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {urunGirisiBekleyen.length > 0 ? (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12, color: AMBER }}>
                UTS kabul edildi — depoya henüz girilmedi (3+ gün)
              </h3>
              <div style={{ border: `1px solid ${AMBER}`, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fffbeb' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#fef3c7' }}>
                      {['Gönderim', 'Şube', 'Barkod/Lot', ''].map((h) => (
                        <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {urunGirisiBekleyen.map((g) => (
                      <tr key={g.id} style={{ borderTop: '1px solid #fde68a' }}>
                        <td style={{ padding: 8 }}>
                          {g.gonderimZamani ? new Date(g.gonderimZamani).toLocaleDateString('tr-TR') : '—'}
                        </td>
                        <td style={{ padding: 8 }}>{g.branch?.code ?? '—'}</td>
                        <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 11 }}>{kalemOzet(g.kalemler)}</td>
                        <td style={{ padding: 8 }}>
                          {g.kalemler[0] ? (
                            <button
                              type="button"
                              style={btnSmall}
                              onClick={() => depoyaUrunGirisiYonlendir({
                                uno: g.kalemler[0].barkod,
                                sno: g.kalemler[0].seriNo ?? undefined,
                                lno: g.kalemler[0].lotNo ?? undefined,
                                adt: g.kalemler[0].adet,
                                bno: g.belgeNo ?? undefined,
                              }, g.id)}
                            >
                              Depoya Ürün Girişi Yap
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
