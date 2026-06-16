import { useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

const inp: React.CSSProperties = { padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: 'white', width: '100%', boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const btnPrimary: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }
const btnSmall: React.CSSProperties = { ...btn, padding: '5px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#374151' }
const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left' as const, fontWeight: 700, color: '#374151', fontSize: 12, backgroundColor: '#f9fafb' }
const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12, borderTop: '1px solid #f3f4f6' }

const POZISYONLAR = ['MUDUR', 'SATIS', 'KASIYER', 'TEKNIK', 'DIGER']
const SIRKETLER = [{ id: 1, ad: 'GÜVEN OPTİK 1959' }, { id: 2, ad: 'NG' }, { id: 3, ad: 'ADESE' }, { id: 4, ad: 'POTENTIAL' }]
const SUBELER = ['GVN1','GVN2','GVN3','GVN4','GVN5','GVN6','GVN8','GVN9','GVN10','ANADEPO']
const BELGE_FORM_TIPLERI = [
  { value: 'IS_SOZLESMESI', label: 'İş Sözleşmesi' },
  { value: 'SGK_GIRIS', label: 'SGK Giriş' },
  { value: 'MAAS_BORDROSU', label: 'Maaş Bordrosu' },
  { value: 'KIMLIK', label: 'Kimlik' },
  { value: 'IKAMETGAH', label: 'İkametgah' },
  { value: 'SAGLIK', label: 'Sağlık' },
  { value: 'DIGER', label: 'Diğer' },
] as const

const BELGE_TIPLERI = [
  'IS_SOZLESMESI',
  'SGK',
  'KIMLIK',
  'IKAMETGAH',
  'SAGLIK_RAPORU',
  'DIGER',
]

const BELGE_ETIKET: Record<string, string> = {
  IS_SOZLESMESI: 'İş Sözl.',
  SGK: 'SGK',
  KIMLIK: 'Kimlik',
  IKAMETGAH: 'İkamet',
  SAGLIK_RAPORU: 'Sağlık',
  DIGER: 'Diğer',
}

function belgeTipiVar(tips: string[] | undefined, tip: string): boolean {
  if (!tips?.length) return false
  if (tip === 'SGK') return tips.includes('SGK') || tips.includes('SGK_GIRIS')
  if (tip === 'SAGLIK_RAPORU') return tips.includes('SAGLIK_RAPORU') || tips.includes('SAGLIK')
  return tips.includes(tip)
}

type PersonelBelge = {
  id: string
  tip: string
  ad: string
  dosyaAdi: string
  mimeType: string
  boyut: number
  onaylandi: boolean
  onayTarihi: string | null
  notlar: string | null
  createdAt: string
  yukleyenId: string
}

function belgeTipLabel(tip: string) {
  return BELGE_FORM_TIPLERI.find((t) => t.value === tip)?.label ?? tip
}

function indirBelge(belge: { dosyaAdi: string; mimeType: string; icerik: string }) {
  const byteChars = atob(belge.icerik)
  const byteNums = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i)
  const blob = new Blob([byteNums], { type: belge.mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = belge.dosyaAdi
  a.click()
  URL.revokeObjectURL(url)
}

type Personel = {
  id: string; ad: string; soyad: string; telefon: string | null
  email: string | null; pozisyon: string; subeAdi: string | null; subeId?: string | null
  sirketAdi: string | null; maas: number; aktif: boolean
  pdksId: string | null; odooEmployeeId?: number | null; userId?: string | null
  user?: { id: string; username: string; role: string } | null
}

type BaglantiOzet = {
  ozet: { toplam: number; tam: number; eksik: number; hicYok: number }
  data: Personel[]
}

type OdooEmployee = { id: number; name: string }
type PosKullanici = {
  id: string; name: string; username: string; role: string
  personel: { id: string; ad: string; soyad: string } | null
}

type Sube = { id: string; name: string; code: string }

type PrimKural = {
  id: string; ad: string; tip: string; kapsam: string; donem: string
  hedefTutar: number | null; primOrani: number | null; primSabit: number | null
  subeAdi: string | null; pozisyonlar: string | null
}

type PrimSonuc = {
  personelAd: string; pozisyon: string; subeAdi: string | null
  toplamPrim: number
  detaylar: Array<{ kuralAdi: string; kuralTip: string; hedef: number; gerceklesen: number; primTutari: number }>
}

export default function IKPage() {
  const [sekme, setSekme] = useState<'personeller' | 'prim-kurallar' | 'prim-hesap'>('personeller')

  const [personeller, setPersoneller] = useState<Personel[]>([])
  const [personelFormu, setPersonelFormu] = useState(false)
  const [yeniPersonel, setYeniPersonel] = useState({ ad: '', soyad: '', telefon: '', email: '', pozisyon: 'SATIS', subeId: 'GVN1', subeAdi: 'GVN1', sirketId: 3, sirketAdi: 'ADESE', maas: '', aylikHedef: 0 })

  const [primKurallar, setPrimKurallar] = useState<PrimKural[]>([])
  const [kuralFormu, setKuralFormu] = useState(false)
  const [yeniKural, setYeniKural] = useState({
    ad: '', tip: 'MAGAZA', kapsam: 'GENEL_SATIS', donem: 'AYLIK',
    hedefTutar: '', primOrani: '', primSabit: '',
    subeId: '', subeAdi: '', sirketId: 3,
    pozisyonlar: [{ pozisyon: 'MUDUR', oran: 0.4 }, { pozisyon: 'SATIS', oran: 0.3 }]
  })

  const [primDonem, setPrimDonem] = useState({
    baslangic: new Date().toISOString().slice(0, 7) + '-01',
    bitis: new Date().toISOString().slice(0, 10),
    subeId: '', sirketId: 0,
  })
  const [primSonuclar, setPrimSonuclar] = useState<PrimSonuc[]>([])
  const [primHesaplaniyor, setPrimHesaplaniyor] = useState(false)

  const [loading, setLoading] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const [secilenPersonel, setSecilenPersonel] = useState<string | null>(null)
  const [belgeler, setBelgeler] = useState<PersonelBelge[]>([])
  const [belgeYukleniyor, setBelgeYukleniyor] = useState(false)
  const [yeniBelge, setYeniBelge] = useState({ tip: 'SGK_GIRIS', ad: '', notlar: '' })

  const [iseAlMod, setIseAlMod] = useState(false)
  const [yeniPosUser, setYeniPosUser] = useState({
    username: '', pin: '', role: 'SALES_STAFF',
  })
  const [pdksSyncing, setPdksSyncing] = useState(false)
  const [islemYukleniyor, setIslemYukleniyor] = useState<string | null>(null)
  const [aktifFiltre, setAktifFiltre] = useState<'hepsi' | 'aktif' | 'pasif'>('aktif')

  const [baglantiOzet, setBaglantiOzet] = useState<BaglantiOzet | null>(null)
  const [secilenBaglanti, setSecilenBaglanti] = useState<string | null>(null)
  const [odooPersoneller, setOdooPersoneller] = useState<OdooEmployee[]>([])
  const [posKullanicilar, setPosKullanicilar] = useState<PosKullanici[]>([])
  const [baglamaYukleniyor, setBaglamaYukleniyor] = useState(false)
  const [yeniPosForm, setYeniPosForm] = useState({ username: '', pin: '', role: 'SALES_STAFF', branchId: '' })
  const [subeler, setSubeler] = useState<Sube[]>([])
  const [odooSecim, setOdooSecim] = useState<Record<string, string>>({})
  const [posSecim, setPosSecim] = useState<Record<string, string>>({})
  const [odooDegistir, setOdooDegistir] = useState<string | null>(null)
  const [personelBelgeler, setPersonelBelgeler] = useState<Record<string, string[]>>({})

  useEffect(() => { void yuklePersonelSekmesi() }, [])
  useEffect(() => {
    if (sekme === 'prim-kurallar') void kuralYukle()
  }, [sekme])

  async function personelYukle() {
    try {
      const res = await adminApi.get('/admin/personeller', { params: { aktif: 'hepsi' } })
      setPersoneller(res.data?.data ?? [])
    } catch { }
  }

  async function baglantiYukle() {
    try {
      const [ozRes, odooRes, posRes, subeRes, belgeRes] = await Promise.all([
        adminApi.get('/admin/personel-baglanti-ozet'),
        adminApi.get('/admin/odoo-employees'),
        adminApi.get('/admin/pos-kullanicilar'),
        adminApi.get('/admin/branch-list'),
        adminApi.get('/admin/personel-belgeler-ozet'),
      ])
      setBaglantiOzet(ozRes.data)
      setOdooPersoneller(odooRes.data?.data ?? [])
      setPosKullanicilar(posRes.data?.data ?? [])
      setSubeler(subeRes.data?.data ?? [])
      setPersonelBelgeler(belgeRes.data?.data ?? {})
    } catch { }
  }

  async function yuklePersonelSekmesi() {
    await Promise.all([personelYukle(), baglantiYukle()])
  }

  function personelSatir(p: Personel): Personel {
    const b = baglantiOzet?.data?.find((x) => x.id === p.id)
    if (!b) return p
    return {
      ...p,
      odooEmployeeId: p.odooEmployeeId ?? b.odooEmployeeId,
      userId: p.userId ?? b.userId,
      user: b.user ?? p.user,
    }
  }

  function tamBagli(p: Personel) {
    return Boolean(p.pdksId && p.odooEmployeeId && p.userId)
  }

  function hicBagliDegil(p: Personel) {
    return !p.pdksId && !p.odooEmployeeId && !p.userId
  }

  function baglantiDurumu(p: Personel) {
    if (tamBagli(p)) return { text: 'Tam', bg: '#dcfce7', color: '#166534' }
    if (hicBagliDegil(p)) return { text: 'Bağlı Değil', bg: '#fee2e2', color: '#991b1b' }
    return { text: 'Eksik', bg: '#fef3c7', color: '#92400e' }
  }

  async function odooPersonelBagla(personelId: string, odooId: number) {
    setBaglamaYukleniyor(true)
    try {
      await adminApi.post(`/admin/personel-odoo-bagla/${personelId}`, { odooEmployeeId: odooId })
      setOdooDegistir(null)
      await yuklePersonelSekmesi()
    } catch {
      alert('Bağlantı başarısız')
    } finally { setBaglamaYukleniyor(false) }
  }

  async function posKullaniciBagla(personelId: string, userId: string) {
    setBaglamaYukleniyor(true)
    try {
      await adminApi.post(`/admin/personel-pos-bagla/${personelId}`, { userId })
      await yuklePersonelSekmesi()
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Bağlantı başarısız')
    } finally { setBaglamaYukleniyor(false) }
  }

  async function posKullaniciOlustur(personelId: string) {
    if (!yeniPosForm.username || !yeniPosForm.pin || !yeniPosForm.branchId) {
      alert('Kullanıcı adı, PIN ve şube zorunlu')
      return
    }
    setBaglamaYukleniyor(true)
    try {
      await adminApi.post(`/admin/personel-pos-olustur/${personelId}`, yeniPosForm)
      setYeniPosForm({ username: '', pin: '', role: 'SALES_STAFF', branchId: '' })
      await yuklePersonelSekmesi()
      alert('POS kullanıcısı oluşturuldu ve bağlandı')
    } catch (e: any) {
      alert(e?.response?.data?.error ?? 'Oluşturma başarısız')
    } finally { setBaglamaYukleniyor(false) }
  }

  async function kuralYukle() {
    try {
      const res = await adminApi.get('/admin/prim-kurallar')
      setPrimKurallar(res.data?.data ?? [])
    } catch { }
  }

  async function belgeleriYukle(personelId: string) {
    try {
      const res = await adminApi.get(`/admin/personel/${personelId}/belgeler`)
      setBelgeler(res.data?.data ?? [])
    } catch {
      setBelgeler([])
    }
  }

  function personelBelgelerAc(personelId: string) {
    setSecilenPersonel(personelId)
    setYeniBelge({ tip: 'SGK_GIRIS', ad: '', notlar: '' })
    void belgeleriYukle(personelId)
  }

  async function belgeYukle(file: File) {
    if (!secilenPersonel || !yeniBelge.ad.trim()) {
      setMesaj({ tip: 'err', text: 'Belge adı zorunlu' })
      return
    }
    setBelgeYukleniyor(true)
    setMesaj(null)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const dataUrl = e.target?.result as string
        const base64 = dataUrl.split(',')[1]
        await adminApi.post(`/admin/personel/${secilenPersonel}/belge-yukle`, {
          tip: yeniBelge.tip,
          ad: yeniBelge.ad.trim(),
          dosyaAdi: file.name,
          icerik: base64,
          mimeType: file.type || 'application/octet-stream',
          boyut: file.size,
          notlar: yeniBelge.notlar || undefined,
        })
        setMesaj({ tip: 'ok', text: 'Belge yüklendi' })
        setYeniBelge({ tip: 'SGK_GIRIS', ad: '', notlar: '' })
        void belgeleriYukle(secilenPersonel)
      } catch (err: any) {
        setMesaj({ tip: 'err', text: err?.response?.data?.message ?? err?.response?.data?.error ?? 'Yükleme hatası' })
      } finally {
        setBelgeYukleniyor(false)
      }
    }
    reader.readAsDataURL(file)
  }

  async function belgeIndir(belgeId: string) {
    try {
      const res = await adminApi.get(`/admin/personel-belge/${belgeId}/indir`)
      const belge = res.data?.data
      if (belge?.icerik) indirBelge(belge)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'İndirme hatası' })
    }
  }

  async function belgeOnayla(belgeId: string) {
    try {
      await adminApi.patch(`/admin/personel-belge/${belgeId}/onayla`)
      if (secilenPersonel) void belgeleriYukle(secilenPersonel)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Onay hatası' })
    }
  }

  async function belgeSil(belgeId: string) {
    if (!confirm('Bu belge silinsin mi?')) return
    try {
      await adminApi.delete(`/admin/personel-belge/${belgeId}`)
      if (secilenPersonel) void belgeleriYukle(secilenPersonel)
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Silme hatası' })
    }
  }

  async function personelKaydet() {
    setLoading(true); setMesaj(null)
    try {
      await adminApi.post('/admin/personel-ekle', { ...yeniPersonel, maas: Number(yeniPersonel.maas) })
      setMesaj({ tip: 'ok', text: 'Personel eklendi' })
      setPersonelFormu(false)
      await yuklePersonelSekmesi()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  async function iseAl() {
    if (!yeniPersonel.ad || !yeniPersonel.soyad || !yeniPersonel.pozisyon) {
      alert('Ad, soyad, pozisyon zorunlu')
      return
    }
    setLoading(true)
    try {
      const res = await adminApi.post('/admin/personel-ise-al', {
        ...yeniPersonel,
        ...yeniPosUser,
      })
      const d = res.data
      let mesaj = `✓ ${yeniPersonel.ad} ${yeniPersonel.soyad} işe alındı\n`
      if (d.posUser) mesaj += `✓ POS kullanıcısı: ${d.posUser.username}\n`
      if (d.posUserUyari) mesaj += `⚠ ${d.posUserUyari}\n`
      if (d.odooEmployee) mesaj += `✓ Odoo çalışan oluşturuldu\n`
      if (d.odooHata) mesaj += `⚠ Odoo: ${d.odooHata}\n`
      mesaj += `⚠ ${d.pdksUyari}`
      alert(mesaj)
      setIseAlMod(false)
      setPersonelFormu(false)
      setYeniPosUser({ username: '', pin: '', role: 'SALES_STAFF' })
      await yuklePersonelSekmesi()
    } catch (e: any) {
      alert('İşe alım başarısız: ' + (e?.response?.data?.error ?? 'Hata'))
    } finally { setLoading(false) }
  }

  async function istenCikar(personelId: string, ad: string) {
    if (!window.confirm(`${ad} işten çıkarılacak. Onaylıyor musunuz?\n\nPOS girişi, Odoo kaydı pasif edilecek.\nPDKS'ten manuel olarak çıkarın.`)) return
    setIslemYukleniyor(personelId)
    try {
      await adminApi.post(`/admin/personel-isten-cikar/${personelId}`, {
        sebep: 'İşten çıkarıldı',
      })
      await yuklePersonelSekmesi()
    } catch {
      alert('İşlem başarısız')
    } finally { setIslemYukleniyor(null) }
  }

  async function aktifles(personelId: string) {
    setIslemYukleniyor(personelId)
    try {
      await adminApi.post(`/admin/personel-aktifles/${personelId}`)
      await yuklePersonelSekmesi()
    } catch {
      alert('İşlem başarısız')
    } finally { setIslemYukleniyor(null) }
  }

  async function pdksSync() {
    setPdksSyncing(true)
    try {
      const res = await adminApi.post('/admin/pdks-sync')
      alert(`PDKS sync tamamlandı\n${res.data.pdksSayisi} personel kontrol edildi\n${res.data.guncellenen} kayıt güncellendi`)
      await yuklePersonelSekmesi()
    } catch {
      alert('PDKS sync başarısız')
    } finally { setPdksSyncing(false) }
  }

  async function kuralKaydet() {
    setLoading(true); setMesaj(null)
    try {
      await adminApi.post('/admin/prim-kural-ekle', {
        ...yeniKural,
        hedefTutar: Number(yeniKural.hedefTutar) || null,
        primOrani: Number(yeniKural.primOrani) || null,
        primSabit: Number(yeniKural.primSabit) || null,
        pozisyonlar: yeniKural.pozisyonlar,
      })
      setMesaj({ tip: 'ok', text: 'Prim kuralı eklendi' })
      setKuralFormu(false)
      void kuralYukle()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hata' })
    } finally { setLoading(false) }
  }

  async function primHesapla() {
    setPrimHesaplaniyor(true); setMesaj(null)
    try {
      const res = await adminApi.post('/admin/prim-hesapla', {
        donemBaslangic: primDonem.baslangic,
        donemBitis: primDonem.bitis,
        subeId: primDonem.subeId || undefined,
        sirketId: primDonem.sirketId || undefined,
      })
      setPrimSonuclar(res.data?.sonuclar ?? [])
      if (res.data?.sonuclar?.length === 0) {
        setMesaj({ tip: 'err', text: 'Bu dönem için prim kazanımı bulunamadı' })
      }
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Hesaplama hatası' })
    } finally { setPrimHesaplaniyor(false) }
  }

  const POZ_RENK: Record<string, string> = {
    MUDUR: '#7c3aed', SATIS: '#059669', KASIYER: '#2563eb', TEKNIK: '#d97706', DIGER: '#6b7280'
  }

  const filtreliPersoneller = personeller.filter(p =>
    aktifFiltre === 'hepsi' ? true :
    aktifFiltre === 'aktif' ? p.aktif !== false :
    p.aktif === false
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#1a1a2e', marginBottom: 20 }}>👥 İK & Prim Yönetimi</div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 24 }}>
        {([['personeller', '👤 Personeller'], ['prim-kurallar', '📋 Prim Kuralları'], ['prim-hesap', '💰 Prim Hesapla']] as const).map(([s, label]) => (
          <button key={s} type="button" onClick={() => setSekme(s)}
            style={{ padding: '10px 20px', fontSize: 13, fontWeight: sekme === s ? 900 : 600, color: sekme === s ? '#1a1a2e' : '#9ca3af', background: 'none', border: 'none', borderBottom: sekme === s ? '2px solid #1a1a2e' : '2px solid transparent', marginBottom: -2, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {mesaj && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 700,
          backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
          color: mesaj.tip === 'ok' ? '#166534' : '#991b1b' }}>
          {mesaj.tip === 'ok' ? '✓ ' : '✕ '}{mesaj.text}
        </div>
      )}

      {/* PERSONELLER */}
      {sekme === 'personeller' && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {baglantiOzet?.ozet && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Toplam (Aktif)', value: baglantiOzet.ozet.toplam, bg: '#f9fafb', color: '#1a1a2e', border: '#e5e7eb' },
                { label: "3'ü Bağlı", value: baglantiOzet.ozet.tam, bg: '#dcfce7', color: '#166534', border: '#86efac' },
                { label: 'Eksik', value: baglantiOzet.ozet.eksik, bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
                { label: 'Hiç Yok', value: baglantiOzet.ozet.hicYok, bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
              ].map((k) => (
                <div key={k.label} style={{ padding: '14px 16px', borderRadius: 12, backgroundColor: k.bg, border: `1px solid ${k.border}` }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Personel Bağlantıları ({filtreliPersoneller.length})</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => void pdksSync()} disabled={pdksSyncing} style={btnSmall}>
                {pdksSyncing ? 'Syncing...' : '🔄 PDKS Sync'}
              </button>
              <button type="button" onClick={() => { setIseAlMod(true); setPersonelFormu(true) }} style={btnPrimary}>
                + İşe Al
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {(['aktif', 'pasif', 'hepsi'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setAktifFiltre(f)}
                style={{
                  ...btnSmall,
                  background: aktifFiltre === f ? '#1a1a2e' : '#f3f4f6',
                  color: aktifFiltre === f ? '#fff' : '#374151',
                }}
              >
                {f === 'aktif' ? 'Aktif' : f === 'pasif' ? 'Pasif' : 'Tümü'}
              </button>
            ))}
          </div>

          {personelFormu && (
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Yeni Personel</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Ad *</label><input value={yeniPersonel.ad} onChange={e => setYeniPersonel(p => ({ ...p, ad: e.target.value }))} style={inp} /></div>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Soyad *</label><input value={yeniPersonel.soyad} onChange={e => setYeniPersonel(p => ({ ...p, soyad: e.target.value }))} style={inp} /></div>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Telefon</label><input value={yeniPersonel.telefon} onChange={e => setYeniPersonel(p => ({ ...p, telefon: e.target.value }))} style={inp} /></div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Pozisyon *</label>
                  <select value={yeniPersonel.pozisyon} onChange={e => setYeniPersonel(p => ({ ...p, pozisyon: e.target.value }))} style={inp}>
                    {POZISYONLAR.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şube</label>
                  <select value={yeniPersonel.subeId} onChange={e => setYeniPersonel(p => ({ ...p, subeId: e.target.value, subeAdi: e.target.value }))} style={inp}>
                    {SUBELER.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şirket</label>
                  <select value={yeniPersonel.sirketId} onChange={e => {
                    const s = SIRKETLER.find(x => x.id === Number(e.target.value))
                    setYeniPersonel(p => ({ ...p, sirketId: Number(e.target.value), sirketAdi: s?.ad ?? '' }))
                  }} style={inp}>
                    {SIRKETLER.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
                  </select>
                </div>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Maaş (₺)</label><input type="number" value={yeniPersonel.maas} onChange={e => setYeniPersonel(p => ({ ...p, maas: e.target.value }))} style={inp} /></div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Aylık Hedef (₺)</label>
                  <input
                    type="number"
                    value={yeniPersonel.aylikHedef}
                    onChange={e => setYeniPersonel(p => ({ ...p, aylikHedef: Number(e.target.value) }))}
                    placeholder="0"
                    style={inp}
                  />
                </div>
                <div><label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>E-posta</label><input value={yeniPersonel.email} onChange={e => setYeniPersonel(p => ({ ...p, email: e.target.value }))} style={inp} /></div>
              </div>
              {iseAlMod && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#1a1a2e' }}>
                    POS Kullanıcısı Oluştur (opsiyonel)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Kullanıcı Adı</label>
                      <input
                        value={yeniPosUser.username}
                        onChange={e => setYeniPosUser(p => ({ ...p, username: e.target.value }))}
                        placeholder="ör: ahmet.yilmaz"
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>PIN (6 hane)</label>
                      <input
                        type="password"
                        value={yeniPosUser.pin}
                        onChange={e => setYeniPosUser(p => ({ ...p, pin: e.target.value }))}
                        placeholder="123456"
                        maxLength={6}
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Rol</label>
                      <select
                        value={yeniPosUser.role}
                        onChange={e => setYeniPosUser(p => ({ ...p, role: e.target.value }))}
                        style={inp}
                      >
                        <option value="SALES_STAFF">Satış Personeli</option>
                        <option value="STORE_MANAGER">Mağaza Müdürü</option>
                        <option value="REGIONAL_MANAGER">Bölge Müdürü</option>
                        <option value="ACCOUNTANT">Muhasebe</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef3c7', borderRadius: 8, fontSize: 11, color: '#92400e' }}>
                    ⚠ Kayıt sonrası PDKS sistemine manuel olarak ekleyin
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => { setPersonelFormu(false); setIseAlMod(false) }} style={btnSmall}>İptal</button>
                <button type="button" onClick={iseAlMod ? iseAl : personelKaydet} disabled={loading || !yeniPersonel.ad || !yeniPersonel.soyad} style={btnPrimary}>{loading ? 'Kaydediliyor...' : iseAlMod ? '✓ İşe Al' : '✓ Kaydet'}</button>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Ad Soyad</th>
                  <th style={th}>Pozisyon</th>
                  <th style={th}>Şube</th>
                  <th style={th}>PDKS</th>
                  <th style={th}>Odoo</th>
                  <th style={th}>POS</th>
                  <th style={th}>Durum</th>
                  <th style={th}>Belgeler</th>
                  <th style={th}>Bağla</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtreliPersoneller.map((p0) => {
                  const p = personelSatir(p0)
                  const tam = tamBagli(p)
                  const hicYok = hicBagliDegil(p)
                  const dur = baglantiDurumu(p)
                  const panelAcik = secilenBaglanti === p.id
                  return (
                    <>
                      <tr key={p.id} style={{ backgroundColor: secilenPersonel === p.id ? '#f0f9ff' : undefined }}>
                        <td style={{ ...td, fontWeight: 700 }}>{p.ad} {p.soyad}</td>
                        <td style={td}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: `${POZ_RENK[p.pozisyon] ?? '#6b7280'}20`, color: POZ_RENK[p.pozisyon] ?? '#6b7280' }}>{p.pozisyon}</span>
                        </td>
                        <td style={{ ...td, color: '#374151' }}>{p.subeAdi ?? p.subeId ?? '—'}</td>
                        <td style={td}>
                          {p.pdksId ? (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>✓ {p.pdksId}</span>
                          ) : (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f3f4f6', color: '#9ca3af' }}>—</span>
                          )}
                        </td>
                        <td style={td}>
                          {p.odooEmployeeId ? (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>✓ emp:{p.odooEmployeeId}</span>
                          ) : (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>✗</span>
                          )}
                        </td>
                        <td style={td}>
                          {p.userId ? (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>✓ {p.user?.username ?? p.userId}</span>
                          ) : (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#fee2e2', color: '#991b1b', fontWeight: 700 }}>✗</span>
                          )}
                        </td>
                        <td style={td}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: dur.bg, color: dur.color, fontWeight: 700 }}>
                            {dur.text}
                          </span>
                          {hicYok ? null : (
                            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{p.aktif ? 'Aktif' : 'Pasif'}</div>
                          )}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {BELGE_TIPLERI.filter((t) => t !== 'DIGER').map((tip) => {
                              const var_ = belgeTipiVar(personelBelgeler[p.id], tip)
                              return (
                                <span
                                  key={tip}
                                  style={{
                                    fontSize: 9,
                                    padding: '1px 5px',
                                    borderRadius: 10,
                                    fontWeight: 500,
                                    background: var_ ? '#EAF3DE' : '#FCEBEB',
                                    color: var_ ? '#27500A' : '#791F1F',
                                    border: `0.5px solid ${var_ ? '#C0DD97' : '#F7C1C1'}`,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {var_ ? '✓' : '✗'} {BELGE_ETIKET[tip]}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                        <td style={td}>
                          <button
                            type="button"
                            onClick={() => setSecilenBaglanti(panelAcik ? null : p.id)}
                            style={{ ...btnSmall, backgroundColor: panelAcik ? '#1a1a2e' : '#f3f4f6', color: panelAcik ? 'white' : '#374151', fontSize: 11 }}
                          >
                            {panelAcik ? 'Kapat' : tam ? 'Düzenle' : 'Bağla'}
                          </button>
                        </td>
                        <td style={td}>
                          <button type="button" onClick={() => personelBelgelerAc(p.id)} style={{ ...btnSmall, backgroundColor: secilenPersonel === p.id ? '#1a1a2e' : '#f3f4f6', color: secilenPersonel === p.id ? 'white' : '#374151' }}>
                            📁 Belgeler
                          </button>
                        </td>
                      </tr>

                      {panelAcik && (
                        <tr key={`${p.id}-panel`}>
                          <td colSpan={10} style={{ ...td, backgroundColor: '#fafafa' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                              {/* PDKS */}
                              <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>PDKS</div>
                                {p.pdksId ? (
                                  <div style={{ fontSize: 12, color: '#166534' }}>
                                    <div style={{ fontWeight: 900 }}>✓ Bağlı</div>
                                    <div style={{ marginTop: 6 }}>ID: <strong>{p.pdksId}</strong></div>
                                    <div style={{ marginTop: 2 }}>{p.ad} {p.soyad}</div>
                                    <div style={{ marginTop: 2, color: '#6b7280' }}>{p.telefon ?? '—'}</div>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 12, color: '#92400e', backgroundColor: '#fffbeb', border: '1px solid #fde68a', padding: 10, borderRadius: 8 }}>
                                    ⚠ PDKS sisteminden manuel ekleyin.
                                  </div>
                                )}
                              </div>

                              {/* Odoo */}
                              <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <div style={{ fontSize: 12, fontWeight: 900 }}>Odoo</div>
                                  {p.odooEmployeeId ? (
                                    <button type="button" onClick={() => setOdooDegistir(odooDegistir === p.id ? null : p.id)} style={{ ...btnSmall, padding: '4px 8px', fontSize: 11 }}>
                                      {odooDegistir === p.id ? 'Vazgeç' : 'Değiştir'}
                                    </button>
                                  ) : null}
                                </div>
                                {p.odooEmployeeId && odooDegistir !== p.id ? (
                                  <div style={{ fontSize: 12, color: '#166534' }}>
                                    <div style={{ fontWeight: 900 }}>✓ Bağlı</div>
                                    <div style={{ marginTop: 6 }}>Employee ID: <strong>{p.odooEmployeeId}</strong></div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                                    <div style={{ flex: 1 }}>
                                      <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Odoo Çalışanı</label>
                                      <select
                                        value={odooSecim[p.id] ?? ''}
                                        onChange={(e) => setOdooSecim((m) => ({ ...m, [p.id]: e.target.value }))}
                                        style={inp}
                                      >
                                        <option value="">Seç...</option>
                                        {odooPersoneller.map((e) => (
                                          <option key={e.id} value={String(e.id)}>{e.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const v = Number(odooSecim[p.id])
                                        if (!v) return
                                        void odooPersonelBagla(p.id, v)
                                      }}
                                      disabled={baglamaYukleniyor || !odooSecim[p.id]}
                                      style={btnPrimary}
                                    >
                                      {baglamaYukleniyor ? '...' : 'Bağla'}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* POS */}
                              <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>POS</div>
                                {p.userId ? (
                                  <div style={{ fontSize: 12, color: '#166534' }}>
                                    <div style={{ fontWeight: 900 }}>✓ Bağlı</div>
                                    <div style={{ marginTop: 6 }}>Kullanıcı: <strong>{p.user?.username ?? p.userId}</strong></div>
                                    <div style={{ marginTop: 2, color: '#6b7280' }}>Rol: {p.user?.role ?? '—'}</div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                                      <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Mevcut Kullanıcı</label>
                                        <select
                                          value={posSecim[p.id] ?? ''}
                                          onChange={(e) => setPosSecim((m) => ({ ...m, [p.id]: e.target.value }))}
                                          style={inp}
                                        >
                                          <option value="">Seç...</option>
                                          {posKullanicilar.filter((u) => !u.personel).map((u) => (
                                            <option key={u.id} value={u.id}>{u.username} · {u.name} ({u.role})</option>
                                          ))}
                                        </select>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => { if (posSecim[p.id]) void posKullaniciBagla(p.id, posSecim[p.id]) }}
                                        disabled={baglamaYukleniyor || !posSecim[p.id]}
                                        style={btnPrimary}
                                      >
                                        {baglamaYukleniyor ? '...' : 'Bağla'}
                                      </button>
                                    </div>

                                    <div style={{ paddingTop: 10, borderTop: '1px solid #e5e7eb' }}>
                                      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, color: '#1a1a2e' }}>Yeni Oluştur</div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                        <div>
                                          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Kullanıcı Adı</label>
                                          <input value={yeniPosForm.username} onChange={(e) => setYeniPosForm((s) => ({ ...s, username: e.target.value }))} placeholder="ör: ayse.demir" style={inp} />
                                        </div>
                                        <div style={{ marginBottom: 6 }}>
                                          <label style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                                            Şube *
                                          </label>
                                          <select
                                            value={yeniPosForm.branchId}
                                            onChange={(e) => setYeniPosForm((p) => ({ ...p, branchId: e.target.value }))}
                                            style={{
                                              width: '100%', fontSize: 11, padding: '4px 8px',
                                              border: '0.5px solid var(--color-border-secondary)',
                                              borderRadius: 4, marginTop: 2,
                                              background: 'var(--color-background-primary)',
                                              color: 'var(--color-text-primary)',
                                            }}
                                          >
                                            <option value="">— Şube seç —</option>
                                            {subeler.map((s) => (
                                              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                                            ))}
                                          </select>
                                        </div>
                                        <div>
                                          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>PIN</label>
                                          <input type="password" value={yeniPosForm.pin} onChange={(e) => setYeniPosForm((s) => ({ ...s, pin: e.target.value }))} placeholder="123456" maxLength={6} style={inp} />
                                        </div>
                                        <div>
                                          <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Rol</label>
                                          <select value={yeniPosForm.role} onChange={(e) => setYeniPosForm((s) => ({ ...s, role: e.target.value }))} style={inp}>
                                            <option value="SALES_STAFF">Satış Personeli</option>
                                            <option value="STORE_MANAGER">Mağaza Müdürü</option>
                                            <option value="REGIONAL_MANAGER">Bölge Müdürü</option>
                                            <option value="ACCOUNTANT">Muhasebe</option>
                                            <option value="ADMIN">Admin</option>
                                          </select>
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                        <button type="button" onClick={() => void posKullaniciOlustur(p.id)} disabled={baglamaYukleniyor} style={btnPrimary}>
                                          {baglamaYukleniyor ? '...' : 'Oluştur'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{
                              marginTop: 12,
                              padding: '10px 12px',
                              background: '#E6F1FB',
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            >
                              <div style={{ fontWeight: 500, marginBottom: 6 }}>
                                📎 Belge Yükleme Linki
                              </div>
                              <div style={{
                                fontFamily: 'monospace',
                                fontSize: 11,
                                background: '#fff',
                                padding: '4px 8px',
                                borderRadius: 4,
                                marginBottom: 6,
                                wordBreak: 'break-all',
                                color: '#374151',
                              }}
                              >
                                {window.location.origin}/belge-yukle/{p.id}
                              </div>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(
                                      `${window.location.origin}/belge-yukle/${p.id}`,
                                    )
                                    alert('Link kopyalandı!')
                                  }}
                                  style={{ fontSize: 11, padding: '4px 10px' }}
                                >
                                  📋 Kopyala
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const link = `${window.location.origin}/belge-yukle/${p.id}`
                                    const msg = `Merhaba ${p.ad}, belge yükleme linkiniz: ${link}`
                                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`)
                                  }}
                                  style={{
                                    fontSize: 11,
                                    padding: '4px 10px',
                                    background: '#25D366',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                  }}
                                >
                                  WhatsApp ile Gönder
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
                {filtreliPersoneller.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: 'center' as const, color: '#9ca3af', padding: 30 }}>Henüz personel eklenmemiş</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {secilenPersonel ? (
          <div style={{ width: 380, flexShrink: 0, border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, backgroundColor: '#fafafa', position: 'sticky', top: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                {(() => {
                  const p = personeller.find((x) => x.id === secilenPersonel)
                  return p ? `${p.ad} ${p.soyad} — Belgeler` : 'Belgeler'
                })()}
              </div>
              <button type="button" onClick={() => setSecilenPersonel(null)} style={{ ...btnSmall, padding: '4px 8px' }}>✕</button>
            </div>

            <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Belge Yükle</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Tip</label>
                  <select value={yeniBelge.tip} onChange={(e) => setYeniBelge((p) => ({ ...p, tip: e.target.value }))} style={inp}>
                    {BELGE_FORM_TIPLERI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Belge Adı *</label>
                  <input value={yeniBelge.ad} onChange={(e) => setYeniBelge((p) => ({ ...p, ad: e.target.value }))} placeholder="ör: Mayıs 2026 Bordrosu" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Notlar</label>
                  <input value={yeniBelge.notlar} onChange={(e) => setYeniBelge((p) => ({ ...p, notlar: e.target.value }))} style={inp} />
                </div>
                <label style={{ ...btnPrimary, display: 'inline-block', textAlign: 'center', cursor: belgeYukleniyor ? 'wait' : 'pointer', opacity: belgeYukleniyor ? 0.6 : 1 }}>
                  {belgeYukleniyor ? 'Yükleniyor...' : '+ Dosya Seç'}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    style={{ display: 'none' }}
                    disabled={belgeYukleniyor || !yeniBelge.ad.trim()}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void belgeYukle(file)
                      e.target.value = ''
                    }}
                  />
                </label>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>Max 5MB · PDF, JPG, PNG, DOC</div>
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Yüklenen Belgeler ({belgeler.length})</div>
            {belgeler.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, textAlign: 'center' }}>Henüz belge yok</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                {belgeler.map((b) => (
                  <div key={b.id} style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, backgroundColor: '#e0e7ff', color: '#3730a3' }}>{belgeTipLabel(b.tip)}</span>
                        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{b.ad}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>{b.dosyaAdi} · {new Date(b.createdAt).toLocaleDateString('tr-TR')}</div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
                        backgroundColor: b.onaylandi ? '#dcfce7' : '#fef3c7',
                        color: b.onaylandi ? '#166534' : '#92400e',
                      }}>
                        {b.onaylandi ? '✓ Onaylı' : '⏳ Bekliyor'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button type="button" onClick={() => void belgeIndir(b.id)} style={btnSmall}>İndir</button>
                      {!b.onaylandi ? (
                        <button type="button" onClick={() => void belgeOnayla(b.id)} style={{ ...btnSmall, backgroundColor: '#dcfce7', color: '#166534' }}>Onayla</button>
                      ) : null}
                      <button type="button" onClick={() => void belgeSil(b.id)} style={{ ...btnSmall, color: '#ef4444' }}>Sil</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        </div>
      )}

      {/* PRİM KURALLARI */}
      {sekme === 'prim-kurallar' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Prim Kuralları ({primKurallar.length})</div>
            <button type="button" onClick={() => setKuralFormu(!kuralFormu)} style={btnPrimary}>+ Yeni Kural</button>
          </div>

          {kuralFormu && (
            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Yeni Prim Kuralı</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Kural Adı *</label>
                  <input value={yeniKural.ad} onChange={e => setYeniKural(p => ({ ...p, ad: e.target.value }))} placeholder="ör: GVN1 Aylık Satış Primi" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Tip *</label>
                  <select value={yeniKural.tip} onChange={e => setYeniKural(p => ({ ...p, tip: e.target.value }))} style={inp}>
                    <option value="BIREYSEL">Bireysel</option>
                    <option value="MAGAZA">Mağaza</option>
                    <option value="BOLGESEL">Bölgesel</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Kapsam *</label>
                  <select value={yeniKural.kapsam} onChange={e => setYeniKural(p => ({ ...p, kapsam: e.target.value }))} style={inp}>
                    <option value="GENEL_SATIS">Genel Satış</option>
                    <option value="URUN_KATEGORI">Ürün Kategorisi</option>
                    <option value="BELIRLI_URUN">Belirli Ürün</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Dönem *</label>
                  <select value={yeniKural.donem} onChange={e => setYeniKural(p => ({ ...p, donem: e.target.value }))} style={inp}>
                    <option value="AYLIK">Aylık</option>
                    <option value="HAFTALIK">Haftalık</option>
                    <option value="GUNLUK">Günlük</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Hedef Tutar (₺)</label>
                  <input type="number" value={yeniKural.hedefTutar} onChange={e => setYeniKural(p => ({ ...p, hedefTutar: e.target.value }))} placeholder="0" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Prim Oranı (%) — hedef aşımından</label>
                  <input type="number" value={yeniKural.primOrani} onChange={e => setYeniKural(p => ({ ...p, primOrani: e.target.value }))} placeholder="ör: 5" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Sabit Prim (₺) — hedefe ulaşınca</label>
                  <input type="number" value={yeniKural.primSabit} onChange={e => setYeniKural(p => ({ ...p, primSabit: e.target.value }))} placeholder="0" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şube (boş = tümü)</label>
                  <select value={yeniKural.subeId} onChange={e => setYeniKural(p => ({ ...p, subeId: e.target.value, subeAdi: e.target.value }))} style={inp}>
                    <option value="">— Tümü —</option>
                    {SUBELER.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Pozisyon oranları */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Pozisyon Dağılım Oranları</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {yeniKural.pozisyonlar.map((poz, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#f3f4f6', padding: '6px 10px', borderRadius: 8 }}>
                      <select value={poz.pozisyon} onChange={e => setYeniKural(p => ({ ...p, pozisyonlar: p.pozisyonlar.map((x, j) => j === i ? { ...x, pozisyon: e.target.value } : x) }))} style={{ ...inp, width: 'auto', padding: '4px 8px' }}>
                        {POZISYONLAR.map(p => <option key={p}>{p}</option>)}
                      </select>
                      <input type="number" value={poz.oran} step="0.1" min="0" max="1" onChange={e => setYeniKural(p => ({ ...p, pozisyonlar: p.pozisyonlar.map((x, j) => j === i ? { ...x, oran: Number(e.target.value) } : x) }))} style={{ ...inp, width: 70, padding: '4px 8px' }} />
                      <button type="button" onClick={() => setYeniKural(p => ({ ...p, pozisyonlar: p.pozisyonlar.filter((_, j) => j !== i) }))} style={{ ...btnSmall, padding: '4px 8px', color: '#ef4444' }}>✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setYeniKural(p => ({ ...p, pozisyonlar: [...p.pozisyonlar, { pozisyon: 'SATIS', oran: 0.2 }] }))} style={btnSmall}>+ Pozisyon Ekle</button>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                  Toplam oran: {yeniKural.pozisyonlar.reduce((a, p) => a + p.oran, 0).toFixed(2)} (1.00 olmalı)
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => setKuralFormu(false)} style={btnSmall}>İptal</button>
                <button type="button" onClick={kuralKaydet} disabled={loading || !yeniKural.ad} style={btnPrimary}>{loading ? 'Kaydediliyor...' : '✓ Kaydet'}</button>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {primKurallar.map(k => (
              <div key={k.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', backgroundColor: '#f3e8ff', padding: '2px 8px', borderRadius: 20 }}>{k.tip}</span>
                  <span style={{ fontSize: 11, color: '#6b7280' }}>{k.donem}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{k.ad}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{k.kapsam} {k.subeAdi && `· ${k.subeAdi}`}</div>
                {k.hedefTutar && <div style={{ fontSize: 12 }}>Hedef: <strong>₺{k.hedefTutar.toLocaleString('tr-TR')}</strong></div>}
                {k.primOrani && <div style={{ fontSize: 12 }}>Oran: <strong>%{k.primOrani}</strong></div>}
                {k.primSabit && <div style={{ fontSize: 12 }}>Sabit: <strong>₺{k.primSabit.toLocaleString('tr-TR')}</strong></div>}
              </div>
            ))}
            {primKurallar.length === 0 && <div style={{ fontSize: 13, color: '#9ca3af' }}>Henüz prim kuralı eklenmemiş.</div>}
          </div>
        </div>
      )}

      {/* PRİM HESAPLA */}
      {sekme === 'prim-hesap' && (
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Prim Hesaplama</div>

          <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Dönem Başlangıç</label>
                <input type="date" value={primDonem.baslangic} onChange={e => setPrimDonem(p => ({ ...p, baslangic: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Dönem Bitiş</label>
                <input type="date" value={primDonem.bitis} onChange={e => setPrimDonem(p => ({ ...p, bitis: e.target.value }))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Şube (opsiyonel)</label>
                <select value={primDonem.subeId} onChange={e => setPrimDonem(p => ({ ...p, subeId: e.target.value }))} style={inp}>
                  <option value="">Tümü</option>
                  {SUBELER.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <button type="button" onClick={primHesapla} disabled={primHesaplaniyor} style={{ ...btnPrimary, backgroundColor: '#059669' }}>
                {primHesaplaniyor ? '⏳ Hesaplanıyor...' : '🔢 Primleri Hesapla'}
              </button>
            </div>
          </div>

          {primSonuclar.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Hesaplama Sonuçları — {primSonuclar.length} personel</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#059669' }}>
                  Toplam: ₺{primSonuclar.reduce((a, p) => a + p.toplamPrim, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Personel</th>
                      <th style={th}>Pozisyon</th>
                      <th style={th}>Şube</th>
                      <th style={th}>Kural</th>
                      <th style={{ ...th, textAlign: 'right' as const }}>Hedef</th>
                      <th style={{ ...th, textAlign: 'right' as const }}>Gerçekleşen</th>
                      <th style={{ ...th, textAlign: 'right' as const }}>Prim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {primSonuclar.map(p => (
                      p.detaylar.map((d, i) => (
                        <tr key={`${p.personelAd}-${i}`} style={{ borderTop: '1px solid #f3f4f6', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          {i === 0 && <td style={{ ...td, fontWeight: 700 }} rowSpan={p.detaylar.length}>{p.personelAd}</td>}
                          {i === 0 && <td style={td} rowSpan={p.detaylar.length}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, backgroundColor: '#f3e8ff', color: '#7c3aed' }}>{p.pozisyon}</span>
                          </td>}
                          {i === 0 && <td style={td} rowSpan={p.detaylar.length}>{p.subeAdi ?? '—'}</td>}
                          <td style={td}>{d.kuralAdi}</td>
                          <td style={{ ...td, textAlign: 'right' as const }}>₺{d.hedef.toLocaleString('tr-TR')}</td>
                          <td style={{ ...td, textAlign: 'right' as const, color: d.gerceklesen >= d.hedef ? '#059669' : '#ef4444', fontWeight: 700 }}>₺{d.gerceklesen.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                          <td style={{ ...td, textAlign: 'right' as const, fontWeight: 900, color: '#059669' }}>₺{d.primTutari.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                    ))}
                    <tr style={{ backgroundColor: '#f0fdf4', borderTop: '2px solid #86efac' }}>
                      <td colSpan={6} style={{ ...td, fontWeight: 900, textAlign: 'right' as const }}>TOPLAM PRİM:</td>
                      <td style={{ ...td, textAlign: 'right' as const, fontWeight: 900, fontSize: 14, color: '#059669' }}>
                        ₺{primSonuclar.reduce((a, p) => a + p.toplamPrim, 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
