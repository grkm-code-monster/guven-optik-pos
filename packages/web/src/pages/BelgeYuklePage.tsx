import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

const BELGE_TIPLERI_YEDEK = [
  { value: 'IS_SOZLESMESI', label: 'İş Sözleşmesi' },
  { value: 'SGK', label: 'SGK Belgesi' },
  { value: 'KIMLIK', label: 'Kimlik Fotokopisi' },
  { value: 'IKAMETGAH', label: 'İkametgah Belgesi' },
  { value: 'SAGLIK_RAPORU', label: 'Sağlık Raporu' },
  { value: 'DIGER', label: 'Diğer' },
]

const ASKERLIK_SECENEK = [
  { value: '', label: 'Belirtilmedi' },
  { value: 'YAPILDI', label: 'Yapıldı' },
  { value: 'TECILLI', label: 'Tecilli' },
  { value: 'MUAF', label: 'Muaf' },
  { value: 'YAPILMADI', label: 'Yapılmadı' },
]

const DURUM_ETIKET: Record<string, { label: string; bg: string; fg: string }> = {
  BEKLIYOR: { label: '⏳ Bekliyor', bg: '#fef3c7', fg: '#92400e' },
  YUKLENDI: { label: '⏳ İncelemede', bg: '#fef3c7', fg: '#92400e' },
  REVIZYON_ISTENDI: { label: '✎ Revizyon İstendi', bg: '#fee2e2', fg: '#dc2626' },
  ONAYLANDI: { label: '✓ Onaylandı', bg: '#dcfce7', fg: '#166534' },
}

const cardStyle: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #e5e7eb' }
const lbl: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }
const fieldWrap: React.CSSProperties = { marginBottom: 12 }
const btnDark: React.CSSProperties = { padding: '10px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }
const btnLight: React.CSSProperties = { padding: '8px 14px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function indirDosya(dosya: { dosyaAdi: string; mimeType: string; icerik: string }) {
  const byteChars = atob(dosya.icerik)
  const byteNums = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i)
  const blob = new Blob([byteNums], { type: dosya.mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = dosya.dosyaAdi
  a.click()
  URL.revokeObjectURL(url)
}

type Tab = 'belgeler' | 'ozgecmis' | 'sozlesmeler'

export default function BelgeYuklePage() {
  const { personelId } = useParams<{ personelId: string }>()
  const [personel, setPersonel] = useState<any>(null)
  const [tab, setTab] = useState<Tab>('belgeler')
  const [hata, setHata] = useState<string | null>(null)
  const [basarili, setBasarili] = useState<string | null>(null)

  // Belgeler
  const [kategoriler, setKategoriler] = useState<Array<{ kod: string; ad: string; grup: string }>>([])
  const [yuklenenBelgeler, setYuklenenBelgeler] = useState<any[]>([])
  const [form, setForm] = useState({ tip: '', ad: '', notlar: '' })
  const [dosya, setDosya] = useState<File | null>(null)
  const [yukleniyor, setYukleniyor] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Özgeçmiş (CV)
  const [cv, setCv] = useState<Record<string, any>>({})
  const [cvKaydediliyor, setCvKaydediliyor] = useState(false)

  // Sözleşmeler
  const [sozlesmeler, setSozlesmeler] = useState<any[]>([])

  useEffect(() => {
    if (!personelId) return
    axios.get(`/api/admin/public/personel-belge-form/${personelId}`)
      .then((res) => {
        setPersonel(res.data.data)
        setYuklenenBelgeler(res.data.data.belgeler ?? [])
      })
      .catch(() => setHata('Personel bulunamadı'))
    axios.get('/api/admin/public/belge-kategorileri')
      .then((res) => {
        const kats = res.data?.data ?? []
        setKategoriler(kats.length ? kats : BELGE_TIPLERI_YEDEK.map((t) => ({ kod: t.value, ad: t.label, grup: 'DIGER' })))
        setForm((p) => ({ ...p, tip: kats[0]?.kod ?? BELGE_TIPLERI_YEDEK[0].value }))
      })
      .catch(() => {
        setKategoriler(BELGE_TIPLERI_YEDEK.map((t) => ({ kod: t.value, ad: t.label, grup: 'DIGER' })))
        setForm((p) => ({ ...p, tip: BELGE_TIPLERI_YEDEK[0].value }))
      })
  }, [personelId])

  useEffect(() => {
    if (!personelId || tab !== 'ozgecmis') return
    axios.get(`/api/admin/public/personel-ozgecmis/${personelId}`)
      .then((res) => setCv(res.data?.data?.ozgecmis ?? {}))
      .catch(() => {})
  }, [personelId, tab])

  useEffect(() => {
    if (!personelId || tab !== 'sozlesmeler') return
    axios.get(`/api/admin/public/personel-sozlesmeler/${personelId}`)
      .then((res) => setSozlesmeler(res.data?.data ?? []))
      .catch(() => {})
  }, [personelId, tab])

  function belgeKategoriLabel(kod: string) {
    return kategoriler.find((k) => k.kod === kod)?.ad ?? kod
  }

  async function yukle() {
    if (!dosya || !form.ad.trim()) {
      setHata('Belge adı ve dosya zorunlu')
      return
    }
    if (dosya.size > 5 * 1024 * 1024) {
      setHata("Dosya 5MB'den büyük olamaz")
      return
    }
    setYukleniyor(true)
    setHata(null)
    try {
      const base64 = await fileToBase64(dosya)
      await axios.post(`/api/admin/public/personel-belge-yukle/${personelId}`, {
        tip: form.tip, ad: form.ad, base64, mimeType: dosya.type, dosyaAdi: dosya.name, notlar: form.notlar,
      })
      setBasarili('Belge başarıyla yüklendi!')
      setDosya(null)
      setForm((p) => ({ ...p, ad: '', notlar: '' }))
      if (fileRef.current) fileRef.current.value = ''
      const res = await axios.get(`/api/admin/public/personel-belge-form/${personelId}`)
      setYuklenenBelgeler(res.data.data.belgeler ?? [])
      setTimeout(() => setBasarili(null), 3000)
    } catch (e: any) {
      setHata(e?.response?.data?.error ?? 'Yükleme başarısız')
    } finally { setYukleniyor(false) }
  }

  async function cvKaydet() {
    setCvKaydediliyor(true)
    setHata(null)
    try {
      await axios.post(`/api/admin/public/personel-ozgecmis/${personelId}`, cv)
      setBasarili('Bilgi formunuz kaydedildi!')
      setTimeout(() => setBasarili(null), 3000)
    } catch {
      setHata('Kaydetme başarısız, lütfen tekrar deneyin')
    } finally { setCvKaydediliyor(false) }
  }

  function listEkle(alan: string) {
    setCv((p) => ({ ...p, [alan]: [...(p[alan] ?? []), {}] }))
  }
  function listSil(alan: string, idx: number) {
    setCv((p) => ({ ...p, [alan]: (p[alan] ?? []).filter((_: any, i: number) => i !== idx) }))
  }
  function listGuncelle(alan: string, idx: number, key: string, deger: string) {
    setCv((p) => {
      const liste = [...(p[alan] ?? [])]
      liste[idx] = { ...liste[idx], [key]: deger }
      return { ...p, [alan]: liste }
    })
  }

  async function sozlesmeIndir(sozlesmeId: string) {
    try {
      const res = await axios.get(`/api/admin/public/sozlesme-dosya/${sozlesmeId}`)
      if (res.data?.data) indirDosya(res.data.data)
    } catch {
      setHata('Sözleşme indirilemedi')
    }
  }

  async function sozlesmeYukle(sozlesmeId: string, file: File) {
    setHata(null)
    try {
      const base64 = await fileToBase64(file)
      await axios.post(`/api/admin/public/personel-sozlesme-yukle/${sozlesmeId}`, {
        base64, mimeType: file.type, dosyaAdi: file.name,
      })
      setBasarili('İmzalı sözleşme yüklendi!')
      const res = await axios.get(`/api/admin/public/personel-sozlesmeler/${personelId}`)
      setSozlesmeler(res.data?.data ?? [])
      setTimeout(() => setBasarili(null), 3000)
    } catch {
      setHata('Sözleşme yüklenemedi')
    }
  }

  if (hata && !personel) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', background: '#f9fafb' }}>
      <div style={{ background: '#fff', padding: 32, borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <div style={{ fontSize: 16, color: '#ef4444' }}>{hata}</div>
      </div>
    </div>
  )

  if (!personel) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div style={{ color: '#6b7280' }}>Yükleniyor...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui', padding: '24px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        <div style={{ background: '#1a1a2e', color: '#fff', borderRadius: 16, padding: '20px 24px', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>Güven Optik 1959</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{personel.ad} {personel.soyad}</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Personel Bilgi Formu ve Belgeler</div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, background: '#fff', borderRadius: 12, padding: 6, border: '1px solid #e5e7eb' }}>
          {([['ozgecmis', '📋 Bilgi Formu'], ['belgeler', '📎 Belgeler'], ['sozlesmeler', '📄 Sözleşmeler']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              style={{ flex: 1, padding: '10px 8px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', backgroundColor: tab === k ? '#1a1a2e' : 'transparent', color: tab === k ? '#fff' : '#6b7280' }}>
              {l}
            </button>
          ))}
        </div>

        {basarili ? (
          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#166534' }}>
            ✓ {basarili}
          </div>
        ) : null}
        {hata ? (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>
            {hata}
          </div>
        ) : null}

        {/* ─── BİLGİ FORMU (CV) ─── */}
        {tab === 'ozgecmis' && (
          <div>
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Kişisel Bilgiler</div>
              <Alan lbl2="T.C. Kimlik No" val={cv.tcKimlikNo} onChange={(v) => setCv((p) => ({ ...p, tcKimlikNo: v }))} />
              <Alan lbl2="Doğum Tarihi" tip="date" val={cv.dogumTarihi?.slice ? cv.dogumTarihi.slice(0, 10) : cv.dogumTarihi} onChange={(v) => setCv((p) => ({ ...p, dogumTarihi: v }))} />
              <Alan lbl2="Doğum Yeri" val={cv.dogumYeri} onChange={(v) => setCv((p) => ({ ...p, dogumYeri: v }))} />
              <Alan lbl2="Cinsiyet" val={cv.cinsiyet} onChange={(v) => setCv((p) => ({ ...p, cinsiyet: v }))} />
              <Alan lbl2="Medeni Durum" val={cv.medeniDurum} onChange={(v) => setCv((p) => ({ ...p, medeniDurum: v }))} />
              <Alan lbl2="Uyruk" val={cv.uyruk} onChange={(v) => setCv((p) => ({ ...p, uyruk: v }))} />
              <Alan lbl2="Kan Grubu" val={cv.kanGrubu} onChange={(v) => setCv((p) => ({ ...p, kanGrubu: v }))} />
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>İletişim Bilgileri</div>
              <Alan lbl2="Alternatif Telefon" val={cv.alternatifTelefon} onChange={(v) => setCv((p) => ({ ...p, alternatifTelefon: v }))} />
              <Alan lbl2="İkamet Adresi" val={cv.ikametAdresi} onChange={(v) => setCv((p) => ({ ...p, ikametAdresi: v }))} />
              <Alan lbl2="İl" val={cv.il} onChange={(v) => setCv((p) => ({ ...p, il: v }))} />
              <Alan lbl2="İlçe" val={cv.ilce} onChange={(v) => setCv((p) => ({ ...p, ilce: v }))} />
              <Alan lbl2="Posta Kodu" val={cv.postaKodu} onChange={(v) => setCv((p) => ({ ...p, postaKodu: v }))} />
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Acil Durum Bilgileri</div>
              <Alan lbl2="Yakınlık Derecesi" val={cv.acilYakinlikDerecesi} onChange={(v) => setCv((p) => ({ ...p, acilYakinlikDerecesi: v }))} />
              <Alan lbl2="Ad Soyad" val={cv.acilAdSoyad} onChange={(v) => setCv((p) => ({ ...p, acilAdSoyad: v }))} />
              <Alan lbl2="Telefon" val={cv.acilTelefon} onChange={(v) => setCv((p) => ({ ...p, acilTelefon: v }))} />
              <Alan lbl2="Alternatif Telefon" val={cv.acilAlternatifTelefon} onChange={(v) => setCv((p) => ({ ...p, acilAlternatifTelefon: v }))} />
            </div>

            <ListeKart baslik="Eğitim Bilgileri" liste={cv.egitimler ?? []}
              kolonlar={[{ k: 'seviye', l: 'Eğitim Seviyesi' }, { k: 'okulAdi', l: 'Okul Adı' }, { k: 'bolum', l: 'Bölüm' }, { k: 'baslangic', l: 'Başlangıç' }, { k: 'mezuniyet', l: 'Mezuniyet' }, { k: 'mezuniyetDurumu', l: 'Mezuniyet Durumu' }]}
              onEkle={() => listEkle('egitimler')} onSil={(i) => listSil('egitimler', i)} onGuncelle={(i, k, v) => listGuncelle('egitimler', i, k, v)} />

            <ListeKart baslik="İş Deneyimi" liste={cv.isDeneyimleri ?? []}
              kolonlar={[{ k: 'firmaAdi', l: 'Firma Adı' }, { k: 'gorevi', l: 'Görevi' }, { k: 'baslangic', l: 'Başlangıç' }, { k: 'ayrilis', l: 'Ayrılış' }, { k: 'ayrilisNedeni', l: 'Ayrılış Nedeni' }, { k: 'isTanimi', l: 'Yapılan İş Tanımı' }]}
              onEkle={() => listEkle('isDeneyimleri')} onSil={(i) => listSil('isDeneyimleri', i)} onGuncelle={(i, k, v) => listGuncelle('isDeneyimleri', i, k, v)} />

            <ListeKart baslik="Yabancı Dil Bilgileri" liste={cv.yabanciDiller ?? []}
              kolonlar={[{ k: 'dil', l: 'Dil' }, { k: 'okuma', l: 'Okuma Seviyesi' }, { k: 'yazma', l: 'Yazma Seviyesi' }, { k: 'konusma', l: 'Konuşma Seviyesi' }]}
              onEkle={() => listEkle('yabanciDiller')} onSil={(i) => listSil('yabanciDiller', i)} onGuncelle={(i, k, v) => listGuncelle('yabanciDiller', i, k, v)} />

            <ListeKart baslik="Bilgisayar Bilgileri" liste={cv.bilgisayarBilgileri ?? []}
              kolonlar={[{ k: 'program', l: 'Program (ör: Excel, Odoo ERP)' }, { k: 'seviye', l: 'Seviye' }]}
              onEkle={() => listEkle('bilgisayarBilgileri')} onSil={(i) => listSil('bilgisayarBilgileri', i)} onGuncelle={(i, k, v) => listGuncelle('bilgisayarBilgileri', i, k, v)} />

            <ListeKart baslik="Referanslar" liste={cv.referanslar ?? []}
              kolonlar={[{ k: 'adSoyad', l: 'Ad Soyad' }, { k: 'firma', l: 'Firma' }, { k: 'gorevi', l: 'Görevi' }, { k: 'telefon', l: 'Telefon' }, { k: 'yakinlikDerecesi', l: 'Yakınlık Derecesi' }]}
              onEkle={() => listEkle('referanslar')} onSil={(i) => listSil('referanslar', i)} onGuncelle={(i, k, v) => listGuncelle('referanslar', i, k, v)} />

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Ehliyet ve Askerlik</div>
              <Alan lbl2="Ehliyet Sınıfı" val={cv.ehliyetSinifi} onChange={(v) => setCv((p) => ({ ...p, ehliyetSinifi: v }))} />
              <Alan lbl2="Ehliyet Veriliş Tarihi" tip="date" val={cv.ehliyetVerilisTarihi?.slice ? cv.ehliyetVerilisTarihi.slice(0, 10) : cv.ehliyetVerilisTarihi} onChange={(v) => setCv((p) => ({ ...p, ehliyetVerilisTarihi: v }))} />
              <div style={fieldWrap}>
                <label style={lbl}>Askerlik Durumu</label>
                <select value={cv.askerlikDurumu ?? ''} onChange={(e) => setCv((p) => ({ ...p, askerlikDurumu: e.target.value }))} style={inputStyle}>
                  {ASKERLIK_SECENEK.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {cv.askerlikDurumu === 'TECILLI' ? (
                <Alan lbl2="Tecil Tarihi" tip="date" val={cv.tecilTarihi?.slice ? cv.tecilTarihi.slice(0, 10) : cv.tecilTarihi} onChange={(v) => setCv((p) => ({ ...p, tecilTarihi: v }))} />
              ) : null}
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Kısa Özgeçmiş</div>
              <textarea value={cv.kisaOzgecmis ?? ''} onChange={(e) => setCv((p) => ({ ...p, kisaOzgecmis: e.target.value }))} rows={4} placeholder="Kendinizi kısaca tanıtın..." style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Ek Bilgiler</div>
              <BoolSecim lbl2="Sigara Kullanıyor musunuz?" val={cv.sigaraKullaniyor} onChange={(v) => setCv((p) => ({ ...p, sigaraKullaniyor: v }))} />
              <BoolSecim lbl2="Seyahat Engeliniz Var mı?" val={cv.seyahatEngeliVar} onChange={(v) => setCv((p) => ({ ...p, seyahatEngeliVar: v }))} />
              <BoolSecim lbl2="Vardiyalı Çalışabilir misiniz?" val={cv.vardiyaliCalisabilir} onChange={(v) => setCv((p) => ({ ...p, vardiyaliCalisabilir: v }))} />
              <Alan lbl2="Kullanılan Programlar" val={cv.kullanilanProgramlar} onChange={(v) => setCv((p) => ({ ...p, kullanilanProgramlar: v }))} />
              <Alan lbl2="Hobiler" val={cv.hobiler} onChange={(v) => setCv((p) => ({ ...p, hobiler: v }))} />
              <Alan lbl2="Diğer Açıklamalar" val={cv.digerAciklamalar} onChange={(v) => setCv((p) => ({ ...p, digerAciklamalar: v }))} />
            </div>

            <button type="button" onClick={() => void cvKaydet()} disabled={cvKaydediliyor} style={{ ...btnDark, width: '100%', padding: 14, fontSize: 15, opacity: cvKaydediliyor ? 0.6 : 1 }}>
              {cvKaydediliyor ? 'Kaydediliyor...' : '💾 Bilgi Formunu Kaydet'}
            </button>
          </div>
        )}

        {/* ─── BELGELER ─── */}
        {tab === 'belgeler' && (
          <div>
            {yuklenenBelgeler.length > 0 && (
              <div style={cardStyle}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#374151' }}>Yüklenen Belgeler ({yuklenenBelgeler.length})</div>
                {yuklenenBelgeler.map((b: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < yuklenenBelgeler.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                    <span style={{ fontSize: 16 }}>{b.onaylandi ? '✅' : '⏳'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{b.ad}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>{belgeKategoriLabel(b.tip)} · {b.onaylandi ? 'Onaylandı' : 'Onay bekliyor'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#1a1a2e' }}>Yeni Belge Yükle</div>

              <div style={fieldWrap}>
                <label style={lbl}>Belge Tipi *</label>
                <select value={form.tip} onChange={(e) => setForm((p) => ({ ...p, tip: e.target.value }))} style={inputStyle}>
                  {kategoriler.map((t) => <option key={t.kod} value={t.kod}>{t.ad}</option>)}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={lbl}>Belge Adı *</label>
                <input type="text" value={form.ad} onChange={(e) => setForm((p) => ({ ...p, ad: e.target.value }))} placeholder="ör: Kimlik Fotokopisi" style={inputStyle} />
              </div>

              <div style={fieldWrap}>
                <label style={lbl}>Not (opsiyonel)</label>
                <textarea value={form.notlar} onChange={(e) => setForm((p) => ({ ...p, notlar: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'none' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Dosya *</label>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => setDosya(e.target.files?.[0] ?? null)} style={{ width: '100%', padding: '10px 12px', border: '1px dashed #d1d5db', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Max 5MB · PDF, JPG, PNG, DOC</div>
              </div>

              <button type="button" onClick={() => void yukle()} disabled={yukleniyor || !dosya || !form.ad.trim()} style={{ ...btnDark, width: '100%', padding: 13, fontSize: 15, opacity: yukleniyor ? 0.6 : 1, cursor: yukleniyor ? 'wait' : 'pointer' }}>
                {yukleniyor ? 'Yükleniyor...' : '📎 Belgeyi Yükle'}
              </button>
            </div>
          </div>
        )}

        {/* ─── SÖZLEŞMELER ─── */}
        {tab === 'sozlesmeler' && (
          <div>
            {sozlesmeler.length === 0 ? (
              <div style={{ ...cardStyle, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Size atanmış bir sözleşme yok</div>
            ) : sozlesmeler.map((s) => (
              <div key={s.id} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.sablonAdi}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    backgroundColor: (DURUM_ETIKET[s.durum] ?? DURUM_ETIKET.BEKLIYOR).bg,
                    color: (DURUM_ETIKET[s.durum] ?? DURUM_ETIKET.BEKLIYOR).fg,
                  }}>
                    {(DURUM_ETIKET[s.durum] ?? DURUM_ETIKET.BEKLIYOR).label}
                  </span>
                </div>
                {s.aciklama && s.durum === 'REVIZYON_ISTENDI' ? (
                  <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', borderRadius: 6, padding: '6px 10px', marginBottom: 8 }}>
                    İK notu: {s.aciklama}
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
                  1. Sözleşmeyi indirin. 2. Doldurup imzalayın. 3. Aşağıdan taratıp/fotoğrafını yükleyin.
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => void sozlesmeIndir(s.id)} style={btnLight}>⬇ Sözleşmeyi İndir</button>
                  <label style={{ ...btnDark, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}>
                    ⬆ İmzalıyı Yükle
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void sozlesmeYukle(s.id, f); e.target.value = '' }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#9ca3af' }}>
          Güven Optik 1959 — İnsan Kaynakları
        </div>
      </div>
    </div>
  )
}

function Alan({ lbl2, val, onChange, tip }: { lbl2: string; val: any; onChange: (v: string) => void; tip?: string }) {
  return (
    <div style={fieldWrap}>
      <label style={lbl}>{lbl2}</label>
      <input type={tip ?? 'text'} value={val ?? ''} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  )
}

function BoolSecim({ lbl2, val, onChange }: { lbl2: string; val: boolean | null | undefined; onChange: (v: boolean) => void }) {
  return (
    <div style={fieldWrap}>
      <label style={lbl}>{lbl2}</label>
      <select value={val === true ? 'evet' : val === false ? 'hayir' : ''} onChange={(e) => onChange(e.target.value === 'evet')} style={inputStyle}>
        <option value="">Belirtilmedi</option>
        <option value="evet">Evet</option>
        <option value="hayir">Hayır</option>
      </select>
    </div>
  )
}

function ListeKart({
  baslik, liste, kolonlar, onEkle, onSil, onGuncelle,
}: {
  baslik: string
  liste: any[]
  kolonlar: Array<{ k: string; l: string }>
  onEkle: () => void
  onSil: (i: number) => void
  onGuncelle: (i: number, k: string, v: string) => void
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{baslik}</div>
        <button type="button" onClick={onEkle} style={btnLight}>+ Ekle</button>
      </div>
      {liste.length === 0 ? (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Henüz kayıt eklenmedi</div>
      ) : liste.map((kayit: any, i: number) => (
        <div key={i} style={{ border: '1px solid #f3f4f6', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
            <button type="button" onClick={() => onSil(i)} style={{ ...btnLight, color: '#ef4444', padding: '3px 10px' }}>Sil</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {kolonlar.map((k) => (
              <input key={k.k} placeholder={k.l} value={kayit[k.k] ?? ''} onChange={(e) => onGuncelle(i, k.k, e.target.value)} style={{ ...inputStyle, fontSize: 13 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
