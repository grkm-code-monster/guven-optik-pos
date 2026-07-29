import { useEffect, useState } from 'react'
import { adminApi } from './AdminLayout'

const inp: React.CSSProperties = { padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', backgroundColor: 'white', width: '100%', boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700 }
const btnPrimary: React.CSSProperties = { ...btn, backgroundColor: '#1a1a2e', color: 'white' }
const btnSmall: React.CSSProperties = { ...btn, padding: '5px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#374151' }
const label: React.CSSProperties = { fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }
const card: React.CSSProperties = { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, marginBottom: 8 }

const DURUM_ETIKET: Record<string, { label: string; bg: string; fg: string }> = {
  BEKLIYOR: { label: '⏳ Bekliyor', bg: '#fef3c7', fg: '#92400e' },
  YUKLENDI: { label: '⏳ İncelemede', bg: '#fef3c7', fg: '#92400e' },
  REVIZYON_ISTENDI: { label: '✎ Revizyon İstendi', bg: '#fee2e2', fg: '#dc2626' },
  ONAYLANDI: { label: '✓ Onaylandı', bg: '#dcfce7', fg: '#166534' },
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

type Ozgecmis = Record<string, any> | null

const ASKERLIK_SECENEK = [
  { value: '', label: 'Belirtilmedi' },
  { value: 'YAPILDI', label: 'Yapıldı' },
  { value: 'TECILLI', label: 'Tecilli' },
  { value: 'MUAF', label: 'Muaf' },
  { value: 'YAPILMADI', label: 'Yapılmadı' },
]

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

type Tab = 'ozgecmis' | 'sozlesmeler' | 'bordro' | 'saglik' | 'log'

export default function PersonelOzlukModulu({ personelId }: { personelId: string }) {
  const [acik, setAcik] = useState(false)
  const [tab, setTab] = useState<Tab>('ozgecmis')
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  // Özgeçmiş
  const [ozgecmis, setOzgecmis] = useState<Ozgecmis>(null)
  const [sertifikalar, setSertifikalar] = useState<any[]>([])
  const [duzenle, setDuzenle] = useState(false)
  const [form, setForm] = useState<Record<string, any>>({})
  const [kaydediliyor, setKaydediliyor] = useState(false)

  // Sözleşmeler
  const [sozlesmeler, setSozlesmeler] = useState<any[]>([])
  const [sablonlar, setSablonlar] = useState<any[]>([])
  const [ataSablonId, setAtaSablonId] = useState('')

  // Bordro
  const [bordrolar, setBordrolar] = useState<any[]>([])
  const [bordroForm, setBordroForm] = useState({ ay: String(new Date().getMonth() + 1), yil: String(new Date().getFullYear()), aciklama: '' })
  const [bordroYukleniyor, setBordroYukleniyor] = useState(false)

  // Hastalık raporu
  const [raporlar, setRaporlar] = useState<any[]>([])
  const [raporForm, setRaporForm] = useState({ baslangicTarihi: '', bitisTarihi: '', saglikKurumu: '', aciklama: '' })
  const [raporDosya, setRaporDosya] = useState<File | null>(null)
  const [raporEkleniyor, setRaporEkleniyor] = useState(false)

  // Log
  const [loglar, setLoglar] = useState<any[]>([])

  useEffect(() => {
    if (!acik) return
    void yukleTab(tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, tab, personelId])

  async function yukleTab(t: Tab) {
    setMesaj(null)
    try {
      if (t === 'ozgecmis') {
        const res = await adminApi.get(`/admin/personel/${personelId}/ozgecmis`)
        setOzgecmis(res.data?.data?.ozgecmis ?? null)
        setSertifikalar(res.data?.data?.sertifikalar ?? [])
        setForm(res.data?.data?.ozgecmis ?? {})
      } else if (t === 'sozlesmeler') {
        const [rSoz, rSablon] = await Promise.all([
          adminApi.get(`/admin/personel/${personelId}/sozlesmeler`),
          adminApi.get('/admin/personel-sozlesme-sablonlari'),
        ])
        setSozlesmeler(rSoz.data?.data ?? [])
        setSablonlar((rSablon.data?.data ?? []).filter((s: any) => s.aktif))
      } else if (t === 'bordro') {
        const res = await adminApi.get(`/admin/personel/${personelId}/bordrolar`)
        setBordrolar(res.data?.data ?? [])
      } else if (t === 'saglik') {
        const res = await adminApi.get(`/admin/personel/${personelId}/hastalik-raporlari`)
        setRaporlar(res.data?.data ?? [])
      } else if (t === 'log') {
        const res = await adminApi.get(`/admin/personel/${personelId}/belge-loglari`)
        setLoglar(res.data?.data ?? [])
      }
    } catch {
      setMesaj({ tip: 'err', text: 'Veri yüklenemedi' })
    }
  }

  async function ozgecmisKaydet() {
    setKaydediliyor(true)
    setMesaj(null)
    try {
      await adminApi.put(`/admin/personel/${personelId}/ozgecmis`, form)
      setMesaj({ tip: 'ok', text: 'Özgeçmiş kaydedildi' })
      setDuzenle(false)
      void yukleTab('ozgecmis')
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Kayıt hatası' })
    } finally {
      setKaydediliyor(false)
    }
  }

  function listAlanEkle(alan: string, bosKayit: Record<string, any>) {
    setForm((p) => ({ ...p, [alan]: [...(p[alan] ?? []), bosKayit] }))
  }
  function listAlanSil(alan: string, idx: number) {
    setForm((p) => ({ ...p, [alan]: (p[alan] ?? []).filter((_: any, i: number) => i !== idx) }))
  }
  function listAlanGuncelle(alan: string, idx: number, key: string, deger: string) {
    setForm((p) => {
      const liste = [...(p[alan] ?? [])]
      liste[idx] = { ...liste[idx], [key]: deger }
      return { ...p, [alan]: liste }
    })
  }

  async function sertifikaSil(id: string) {
    if (!confirm('Bu sertifika silinsin mi?')) return
    try {
      await adminApi.delete(`/admin/personel-sertifika/${id}`)
      void yukleTab('ozgecmis')
    } catch {
      setMesaj({ tip: 'err', text: 'Silme hatası' })
    }
  }

  async function sozlesmeAta() {
    if (!ataSablonId) return
    try {
      await adminApi.post(`/admin/personel/${personelId}/sozlesme-ata`, { sablonId: ataSablonId })
      setMesaj({ tip: 'ok', text: 'Sözleşme atandı' })
      setAtaSablonId('')
      void yukleTab('sozlesmeler')
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Atama hatası' })
    }
  }

  async function sozlesmeOnayla(id: string) {
    try {
      await adminApi.patch(`/admin/personel-sozlesme/${id}/onayla`)
      void yukleTab('sozlesmeler')
    } catch {
      setMesaj({ tip: 'err', text: 'Onay hatası' })
    }
  }

  async function sozlesmeRevizyonIste(id: string) {
    const aciklama = prompt('Revizyon açıklaması:')
    if (aciklama === null) return
    try {
      await adminApi.patch(`/admin/personel-sozlesme/${id}/revizyon-iste`, { aciklama })
      void yukleTab('sozlesmeler')
    } catch {
      setMesaj({ tip: 'err', text: 'İşlem hatası' })
    }
  }

  async function sozlesmeIndirImzali(id: string) {
    try {
      const res = await adminApi.get(`/admin/personel-sozlesme/${id}/dosya`)
      if (res.data?.data) indirDosya(res.data.data)
    } catch {
      setMesaj({ tip: 'err', text: 'Bu sözleşme henüz yüklenmemiş' })
    }
  }

  async function sozlesmeSil(id: string) {
    if (!confirm('Bu sözleşme kaydı silinsin mi?')) return
    try {
      await adminApi.delete(`/admin/personel-sozlesme/${id}`)
      void yukleTab('sozlesmeler')
    } catch {
      setMesaj({ tip: 'err', text: 'Silme hatası' })
    }
  }

  async function bordroYukle(file: File) {
    setBordroYukleniyor(true)
    setMesaj(null)
    try {
      const base64 = await fileToBase64(file)
      await adminApi.post(`/admin/personel/${personelId}/bordro-yukle`, {
        ay: Number(bordroForm.ay), yil: Number(bordroForm.yil),
        base64, mimeType: file.type || 'application/pdf', dosyaAdi: file.name,
        aciklama: bordroForm.aciklama || undefined,
      })
      setMesaj({ tip: 'ok', text: 'Bordro yüklendi' })
      setBordroForm((p) => ({ ...p, aciklama: '' }))
      void yukleTab('bordro')
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Yükleme hatası' })
    } finally {
      setBordroYukleniyor(false)
    }
  }

  async function bordroIndir(id: string) {
    try {
      const res = await adminApi.get(`/admin/personel-bordro/${id}/indir`)
      if (res.data?.data) indirDosya(res.data.data)
    } catch {
      setMesaj({ tip: 'err', text: 'İndirme hatası' })
    }
  }

  async function bordroSil(id: string) {
    if (!confirm('Bu bordro silinsin mi?')) return
    try {
      await adminApi.delete(`/admin/personel-bordro/${id}`)
      void yukleTab('bordro')
    } catch {
      setMesaj({ tip: 'err', text: 'Silme hatası' })
    }
  }

  async function raporEkle() {
    if (!raporForm.baslangicTarihi || !raporForm.bitisTarihi) {
      setMesaj({ tip: 'err', text: 'Başlangıç ve bitiş tarihi zorunlu' })
      return
    }
    setRaporEkleniyor(true)
    setMesaj(null)
    try {
      let base64: string | undefined
      let mimeType: string | undefined
      let dosyaAdi: string | undefined
      if (raporDosya) {
        base64 = await fileToBase64(raporDosya)
        mimeType = raporDosya.type
        dosyaAdi = raporDosya.name
      }
      await adminApi.post(`/admin/personel/${personelId}/hastalik-raporu-ekle`, {
        ...raporForm, base64, mimeType, dosyaAdi,
      })
      setMesaj({ tip: 'ok', text: 'Hastalık raporu eklendi' })
      setRaporForm({ baslangicTarihi: '', bitisTarihi: '', saglikKurumu: '', aciklama: '' })
      setRaporDosya(null)
      void yukleTab('saglik')
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Ekleme hatası' })
    } finally {
      setRaporEkleniyor(false)
    }
  }

  async function raporIndir(id: string) {
    try {
      const res = await adminApi.get(`/admin/personel-hastalik-raporu/${id}/indir`)
      if (res.data?.data) indirDosya(res.data.data)
    } catch {
      setMesaj({ tip: 'err', text: 'Bu raporun dosyası yok' })
    }
  }

  async function raporSil(id: string) {
    if (!confirm('Bu rapor silinsin mi?')) return
    try {
      await adminApi.delete(`/admin/personel-hastalik-raporu/${id}`)
      void yukleTab('saglik')
    } catch {
      setMesaj({ tip: 'err', text: 'Silme hatası' })
    }
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'ozgecmis', label: '📋 Özgeçmiş (CV)' },
    { key: 'sozlesmeler', label: '📄 Sözleşmeler' },
    { key: 'bordro', label: '💰 Bordrolar' },
    { key: 'saglik', label: '🩺 Hastalık Raporları' },
    { key: 'log', label: '🕒 İşlem Geçmişi' },
  ]

  return (
    <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <div
        onClick={() => setAcik(!acik)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
      >
        <div style={{ fontSize: 13, fontWeight: 700 }}>📁 Özlük Dosyası Modülü (CV, Sözleşme, Bordro, Sağlık)</div>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{acik ? '▲ Kapat' : '▼ Aç'}</span>
      </div>

      {acik ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{ ...btnSmall, backgroundColor: tab === t.key ? '#1a1a2e' : '#f3f4f6', color: tab === t.key ? 'white' : '#374151' }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mesaj ? (
            <div style={{
              fontSize: 12, padding: '8px 12px', borderRadius: 8, marginBottom: 10,
              backgroundColor: mesaj.tip === 'ok' ? '#dcfce7' : '#fee2e2',
              color: mesaj.tip === 'ok' ? '#166534' : '#dc2626',
            }}>
              {mesaj.text}
            </div>
          ) : null}

          {/* ─── ÖZGEÇMİŞ ─── */}
          {tab === 'ozgecmis' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                {duzenle ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => { setDuzenle(false); setForm(ozgecmis ?? {}) }} style={btnSmall}>Vazgeç</button>
                    <button type="button" disabled={kaydediliyor} onClick={() => void ozgecmisKaydet()} style={{ ...btnPrimary, opacity: kaydediliyor ? 0.6 : 1 }}>
                      {kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setDuzenle(true)} style={btnSmall}>Düzenle</button>
                )}
              </div>

              {!ozgecmis && !duzenle ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, textAlign: 'center' }}>
                  Bu personel henüz bilgi formunu doldurmadı. Personele belge/CV yükleme linkini WhatsApp üzerinden paylaşabilirsiniz.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={card}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Kişisel Bilgiler</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <Alan duzenle={duzenle} label="T.C. Kimlik No" val={form.tcKimlikNo} onChange={(v) => setForm((p) => ({ ...p, tcKimlikNo: v }))} />
                      <Alan duzenle={duzenle} label="Doğum Tarihi" tip="date" val={form.dogumTarihi?.slice ? form.dogumTarihi.slice(0, 10) : ''} onChange={(v) => setForm((p) => ({ ...p, dogumTarihi: v }))} />
                      <Alan duzenle={duzenle} label="Doğum Yeri" val={form.dogumYeri} onChange={(v) => setForm((p) => ({ ...p, dogumYeri: v }))} />
                      <Alan duzenle={duzenle} label="Cinsiyet" val={form.cinsiyet} onChange={(v) => setForm((p) => ({ ...p, cinsiyet: v }))} />
                      <Alan duzenle={duzenle} label="Medeni Durum" val={form.medeniDurum} onChange={(v) => setForm((p) => ({ ...p, medeniDurum: v }))} />
                      <Alan duzenle={duzenle} label="Uyruk" val={form.uyruk} onChange={(v) => setForm((p) => ({ ...p, uyruk: v }))} />
                      <Alan duzenle={duzenle} label="Kan Grubu" val={form.kanGrubu} onChange={(v) => setForm((p) => ({ ...p, kanGrubu: v }))} />
                    </div>
                  </div>

                  <div style={card}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>İletişim / Adres</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <Alan duzenle={duzenle} label="Alternatif Telefon" val={form.alternatifTelefon} onChange={(v) => setForm((p) => ({ ...p, alternatifTelefon: v }))} />
                      <Alan duzenle={duzenle} label="İl" val={form.il} onChange={(v) => setForm((p) => ({ ...p, il: v }))} />
                      <Alan duzenle={duzenle} label="İlçe" val={form.ilce} onChange={(v) => setForm((p) => ({ ...p, ilce: v }))} />
                      <Alan duzenle={duzenle} label="Posta Kodu" val={form.postaKodu} onChange={(v) => setForm((p) => ({ ...p, postaKodu: v }))} />
                      <div style={{ gridColumn: '1 / -1' }}>
                        <Alan duzenle={duzenle} label="İkamet Adresi" val={form.ikametAdresi} onChange={(v) => setForm((p) => ({ ...p, ikametAdresi: v }))} />
                      </div>
                    </div>
                  </div>

                  <div style={card}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Acil Durum Bilgileri</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                      <Alan duzenle={duzenle} label="Yakınlık Derecesi" val={form.acilYakinlikDerecesi} onChange={(v) => setForm((p) => ({ ...p, acilYakinlikDerecesi: v }))} />
                      <Alan duzenle={duzenle} label="Ad Soyad" val={form.acilAdSoyad} onChange={(v) => setForm((p) => ({ ...p, acilAdSoyad: v }))} />
                      <Alan duzenle={duzenle} label="Telefon" val={form.acilTelefon} onChange={(v) => setForm((p) => ({ ...p, acilTelefon: v }))} />
                      <Alan duzenle={duzenle} label="Alternatif Telefon" val={form.acilAlternatifTelefon} onChange={(v) => setForm((p) => ({ ...p, acilAlternatifTelefon: v }))} />
                    </div>
                  </div>

                  <div style={card}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Ehliyet / Askerlik</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                      <Alan duzenle={duzenle} label="Ehliyet Sınıfı" val={form.ehliyetSinifi} onChange={(v) => setForm((p) => ({ ...p, ehliyetSinifi: v }))} />
                      <Alan duzenle={duzenle} label="Veriliş Tarihi" tip="date" val={form.ehliyetVerilisTarihi?.slice ? form.ehliyetVerilisTarihi.slice(0, 10) : ''} onChange={(v) => setForm((p) => ({ ...p, ehliyetVerilisTarihi: v }))} />
                      <div>
                        <label style={label}>Askerlik Durumu</label>
                        {duzenle ? (
                          <select value={form.askerlikDurumu ?? ''} onChange={(e) => setForm((p) => ({ ...p, askerlikDurumu: e.target.value }))} style={inp}>
                            {ASKERLIK_SECENEK.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        ) : (
                          <div style={{ fontSize: 13 }}>{ASKERLIK_SECENEK.find((s) => s.value === form.askerlikDurumu)?.label ?? '—'}</div>
                        )}
                      </div>
                      {form.askerlikDurumu === 'TECILLI' ? (
                        <Alan duzenle={duzenle} label="Tecil Tarihi" tip="date" val={form.tecilTarihi?.slice ? form.tecilTarihi.slice(0, 10) : ''} onChange={(v) => setForm((p) => ({ ...p, tecilTarihi: v }))} />
                      ) : null}
                    </div>
                  </div>

                  <ListeAlan
                    baslik="Eğitim Bilgileri" alan="egitimler" duzenle={duzenle}
                    liste={form.egitimler ?? []}
                    kolonlar={[
                      { key: 'seviye', label: 'Eğitim Seviyesi' }, { key: 'okulAdi', label: 'Okul Adı' },
                      { key: 'bolum', label: 'Bölüm' }, { key: 'baslangic', label: 'Başlangıç' },
                      { key: 'mezuniyet', label: 'Mezuniyet' }, { key: 'mezuniyetDurumu', label: 'Durum' },
                    ]}
                    onEkle={() => listAlanEkle('egitimler', {})}
                    onSil={(i) => listAlanSil('egitimler', i)}
                    onGuncelle={(i, k, v) => listAlanGuncelle('egitimler', i, k, v)}
                  />

                  <ListeAlan
                    baslik="İş Deneyimi" alan="isDeneyimleri" duzenle={duzenle}
                    liste={form.isDeneyimleri ?? []}
                    kolonlar={[
                      { key: 'firmaAdi', label: 'Firma Adı' }, { key: 'gorevi', label: 'Görevi' },
                      { key: 'baslangic', label: 'Başlangıç' }, { key: 'ayrilis', label: 'Ayrılış' },
                      { key: 'ayrilisNedeni', label: 'Ayrılış Nedeni' }, { key: 'isTanimi', label: 'İş Tanımı' },
                    ]}
                    onEkle={() => listAlanEkle('isDeneyimleri', {})}
                    onSil={(i) => listAlanSil('isDeneyimleri', i)}
                    onGuncelle={(i, k, v) => listAlanGuncelle('isDeneyimleri', i, k, v)}
                  />

                  <ListeAlan
                    baslik="Yabancı Dil Bilgileri" alan="yabanciDiller" duzenle={duzenle}
                    liste={form.yabanciDiller ?? []}
                    kolonlar={[
                      { key: 'dil', label: 'Dil' }, { key: 'okuma', label: 'Okuma' },
                      { key: 'yazma', label: 'Yazma' }, { key: 'konusma', label: 'Konuşma' },
                    ]}
                    onEkle={() => listAlanEkle('yabanciDiller', {})}
                    onSil={(i) => listAlanSil('yabanciDiller', i)}
                    onGuncelle={(i, k, v) => listAlanGuncelle('yabanciDiller', i, k, v)}
                  />

                  <ListeAlan
                    baslik="Bilgisayar Bilgileri" alan="bilgisayarBilgileri" duzenle={duzenle}
                    liste={form.bilgisayarBilgileri ?? []}
                    kolonlar={[{ key: 'program', label: 'Program' }, { key: 'seviye', label: 'Seviye' }]}
                    onEkle={() => listAlanEkle('bilgisayarBilgileri', {})}
                    onSil={(i) => listAlanSil('bilgisayarBilgileri', i)}
                    onGuncelle={(i, k, v) => listAlanGuncelle('bilgisayarBilgileri', i, k, v)}
                  />

                  <ListeAlan
                    baslik="Referanslar" alan="referanslar" duzenle={duzenle}
                    liste={form.referanslar ?? []}
                    kolonlar={[
                      { key: 'adSoyad', label: 'Ad Soyad' }, { key: 'firma', label: 'Firma' },
                      { key: 'gorevi', label: 'Görevi' }, { key: 'telefon', label: 'Telefon' },
                      { key: 'yakinlikDerecesi', label: 'Yakınlık' },
                    ]}
                    onEkle={() => listAlanEkle('referanslar', {})}
                    onSil={(i) => listAlanSil('referanslar', i)}
                    onGuncelle={(i, k, v) => listAlanGuncelle('referanslar', i, k, v)}
                  />

                  <div style={card}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Sertifikalar</div>
                    {sertifikalar.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Kayıtlı sertifika yok</div>
                    ) : sertifikalar.map((s) => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: 12 }}>{s.ad} {s.kurum ? `— ${s.kurum}` : ''} {s.tarih ? `(${new Date(s.tarih).toLocaleDateString('tr-TR')})` : ''}</div>
                        <button type="button" onClick={() => void sertifikaSil(s.id)} style={{ ...btnSmall, color: '#ef4444' }}>Sil</button>
                      </div>
                    ))}
                  </div>

                  <div style={card}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Kısa Özgeçmiş / Ek Bilgiler</div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={label}>Kısa Özgeçmiş</label>
                      {duzenle ? (
                        <textarea rows={3} value={form.kisaOzgecmis ?? ''} onChange={(e) => setForm((p) => ({ ...p, kisaOzgecmis: e.target.value }))} style={{ ...inp, resize: 'vertical' }} />
                      ) : (
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{form.kisaOzgecmis || '—'}</div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      <BoolAlan duzenle={duzenle} label="Sigara Kullanıyor mu?" val={form.sigaraKullaniyor} onChange={(v) => setForm((p) => ({ ...p, sigaraKullaniyor: v }))} />
                      <BoolAlan duzenle={duzenle} label="Seyahat Engeli Var mı?" val={form.seyahatEngeliVar} onChange={(v) => setForm((p) => ({ ...p, seyahatEngeliVar: v }))} />
                      <BoolAlan duzenle={duzenle} label="Vardiyalı Çalışabilir mi?" val={form.vardiyaliCalisabilir} onChange={(v) => setForm((p) => ({ ...p, vardiyaliCalisabilir: v }))} />
                      <Alan duzenle={duzenle} label="Kullanılan Programlar" val={form.kullanilanProgramlar} onChange={(v) => setForm((p) => ({ ...p, kullanilanProgramlar: v }))} />
                      <Alan duzenle={duzenle} label="Hobiler" val={form.hobiler} onChange={(v) => setForm((p) => ({ ...p, hobiler: v }))} />
                      <Alan duzenle={duzenle} label="Diğer Açıklamalar" val={form.digerAciklamalar} onChange={(v) => setForm((p) => ({ ...p, digerAciklamalar: v }))} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── SÖZLEŞMELER ─── */}
          {tab === 'sozlesmeler' && (
            <div>
              <div style={{ ...card, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={label}>Sözleşme Şablonu Ata</label>
                  <select value={ataSablonId} onChange={(e) => setAtaSablonId(e.target.value)} style={inp}>
                    <option value="">Şablon seçin...</option>
                    {sablonlar.map((s) => <option key={s.id} value={s.id}>{s.ad} (v{s.versiyon})</option>)}
                  </select>
                </div>
                <button type="button" disabled={!ataSablonId} onClick={() => void sozlesmeAta()} style={btnPrimary}>Ata</button>
              </div>
              {sablonlar.length === 0 ? (
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
                  Henüz sözleşme şablonu tanımlanmamış. Şablonları "Personel Listesi" sekmesindeki "Sözleşme Şablonları" panelinden ekleyebilirsiniz.
                </div>
              ) : null}

              {sozlesmeler.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, textAlign: 'center' }}>Henüz atanmış sözleşme yok</div>
              ) : sozlesmeler.map((s) => (
                <div key={s.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{s.sablonAdi} (v{s.sablonVersiyon})</div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>
                        {s.indirilmeTarihi ? `İndirildi: ${new Date(s.indirilmeTarihi).toLocaleDateString('tr-TR')}` : 'Henüz indirilmedi'}
                        {s.yuklenmeTarihi ? ` · Yüklendi: ${new Date(s.yuklenmeTarihi).toLocaleDateString('tr-TR')}` : ''}
                      </div>
                      {s.aciklama && s.durum === 'REVIZYON_ISTENDI' ? (
                        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>Not: {s.aciklama}</div>
                      ) : null}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
                      backgroundColor: (DURUM_ETIKET[s.durum] ?? DURUM_ETIKET.BEKLIYOR).bg,
                      color: (DURUM_ETIKET[s.durum] ?? DURUM_ETIKET.BEKLIYOR).fg,
                    }}>
                      {(DURUM_ETIKET[s.durum] ?? DURUM_ETIKET.BEKLIYOR).label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {s.yuklenmeTarihi ? <button type="button" onClick={() => void sozlesmeIndirImzali(s.id)} style={btnSmall}>İmzalıyı İndir</button> : null}
                    {s.durum === 'YUKLENDI' ? <button type="button" onClick={() => void sozlesmeOnayla(s.id)} style={{ ...btnSmall, backgroundColor: '#dcfce7', color: '#166534' }}>Onayla</button> : null}
                    {s.durum !== 'ONAYLANDI' ? <button type="button" onClick={() => void sozlesmeRevizyonIste(s.id)} style={{ ...btnSmall, backgroundColor: '#fee2e2', color: '#dc2626' }}>Revizyon İste</button> : null}
                    <button type="button" onClick={() => void sozlesmeSil(s.id)} style={{ ...btnSmall, color: '#ef4444' }}>Sil</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── BORDROLAR ─── */}
          {tab === 'bordro' && (
            <div>
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Yeni Bordro Yükle</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={label}>Ay</label>
                    <select value={bordroForm.ay} onChange={(e) => setBordroForm((p) => ({ ...p, ay: e.target.value }))} style={inp}>
                      {AY_ADLARI.map((a, i) => <option key={a} value={String(i + 1)}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={label}>Yıl</label>
                    <input type="number" value={bordroForm.yil} onChange={(e) => setBordroForm((p) => ({ ...p, yil: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={label}>Açıklama</label>
                    <input value={bordroForm.aciklama} onChange={(e) => setBordroForm((p) => ({ ...p, aciklama: e.target.value }))} style={inp} />
                  </div>
                </div>
                <label style={{ ...btnPrimary, display: 'inline-block', cursor: bordroYukleniyor ? 'wait' : 'pointer', opacity: bordroYukleniyor ? 0.6 : 1 }}>
                  {bordroYukleniyor ? 'Yükleniyor...' : '+ Bordro Dosyası Seç'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={bordroYukleniyor} onChange={(e) => { const f = e.target.files?.[0]; if (f) void bordroYukle(f); e.target.value = '' }} />
                </label>
              </div>

              {bordrolar.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, textAlign: 'center' }}>Henüz bordro yok</div>
              ) : bordrolar.map((b) => (
                <div key={b.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{AY_ADLARI[b.ay - 1]} {b.yil}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{b.dosyaAdi} {b.aciklama ? `· ${b.aciklama}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => void bordroIndir(b.id)} style={btnSmall}>İndir</button>
                    <button type="button" onClick={() => void bordroSil(b.id)} style={{ ...btnSmall, color: '#ef4444' }}>Sil</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── HASTALIK RAPORLARI ─── */}
          {tab === 'saglik' && (
            <div>
              <div style={card}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Yeni Hastalık Raporu</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={label}>Başlangıç Tarihi *</label>
                    <input type="date" value={raporForm.baslangicTarihi} onChange={(e) => setRaporForm((p) => ({ ...p, baslangicTarihi: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={label}>Bitiş Tarihi *</label>
                    <input type="date" value={raporForm.bitisTarihi} onChange={(e) => setRaporForm((p) => ({ ...p, bitisTarihi: e.target.value }))} style={inp} />
                  </div>
                  <div>
                    <label style={label}>Sağlık Kurumu</label>
                    <input value={raporForm.saglikKurumu} onChange={(e) => setRaporForm((p) => ({ ...p, saglikKurumu: e.target.value }))} style={inp} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={label}>Açıklama</label>
                    <input value={raporForm.aciklama} onChange={(e) => setRaporForm((p) => ({ ...p, aciklama: e.target.value }))} style={inp} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setRaporDosya(e.target.files?.[0] ?? null)} style={{ fontSize: 12 }} />
                  <button type="button" disabled={raporEkleniyor} onClick={() => void raporEkle()} style={{ ...btnPrimary, opacity: raporEkleniyor ? 0.6 : 1 }}>
                    {raporEkleniyor ? 'Ekleniyor...' : 'Raporu Ekle'}
                  </button>
                </div>
              </div>

              {raporlar.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, textAlign: 'center' }}>Henüz hastalık raporu yok</div>
              ) : raporlar.map((r) => (
                <div key={r.id} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {new Date(r.baslangicTarihi).toLocaleDateString('tr-TR')} — {new Date(r.bitisTarihi).toLocaleDateString('tr-TR')} ({r.gunSayisi} gün)
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{r.saglikKurumu} {r.aciklama ? `· ${r.aciklama}` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {r.dosyaAdi ? <button type="button" onClick={() => void raporIndir(r.id)} style={btnSmall}>İndir</button> : null}
                    <button type="button" onClick={() => void raporSil(r.id)} style={{ ...btnSmall, color: '#ef4444' }}>Sil</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── İŞLEM GEÇMİŞİ ─── */}
          {tab === 'log' && (
            <div>
              {loglar.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: 16, textAlign: 'center' }}>Kayıt yok</div>
              ) : loglar.map((l) => (
                <div key={l.id} style={{ fontSize: 11, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span style={{ color: '#9ca3af' }}>{new Date(l.createdAt).toLocaleString('tr-TR')}</span>
                  {' — '}
                  <b>{l.islem}</b>
                  {l.aciklama ? ` — ${l.aciklama}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function Alan({ duzenle, label: lbl, val, onChange, tip }: { duzenle: boolean; label: string; val: any; onChange: (v: string) => void; tip?: string }) {
  return (
    <div>
      <label style={label}>{lbl}</label>
      {duzenle ? (
        <input type={tip ?? 'text'} value={val ?? ''} onChange={(e) => onChange(e.target.value)} style={inp} />
      ) : (
        <div style={{ fontSize: 13 }}>{val ? (tip === 'date' ? new Date(val).toLocaleDateString('tr-TR') : val) : '—'}</div>
      )}
    </div>
  )
}

function BoolAlan({ duzenle, label: lbl, val, onChange }: { duzenle: boolean; label: string; val: boolean | null | undefined; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label style={label}>{lbl}</label>
      {duzenle ? (
        <select value={val === true ? 'evet' : val === false ? 'hayir' : ''} onChange={(e) => onChange(e.target.value === 'evet')} style={inp}>
          <option value="">Belirtilmedi</option>
          <option value="evet">Evet</option>
          <option value="hayir">Hayır</option>
        </select>
      ) : (
        <div style={{ fontSize: 13 }}>{val === true ? 'Evet' : val === false ? 'Hayır' : '—'}</div>
      )}
    </div>
  )
}

function ListeAlan({
  baslik, liste, kolonlar, duzenle, onEkle, onSil, onGuncelle,
}: {
  baslik: string
  alan: string
  liste: any[]
  kolonlar: Array<{ key: string; label: string }>
  duzenle: boolean
  onEkle: () => void
  onSil: (i: number) => void
  onGuncelle: (i: number, k: string, v: string) => void
}) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{baslik}</div>
        {duzenle ? <button type="button" onClick={onEkle} style={btnSmall}>+ Ekle</button> : null}
      </div>
      {liste.length === 0 ? (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Kayıt yok</div>
      ) : liste.map((kayit: any, i: number) => (
        <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0', borderBottom: i < liste.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
          {kolonlar.map((k) => (
            <div key={k.key} style={{ flex: '1 1 120px', minWidth: 100 }}>
              {duzenle ? (
                <input placeholder={k.label} value={kayit[k.key] ?? ''} onChange={(e) => onGuncelle(i, k.key, e.target.value)} style={{ ...inp, fontSize: 12, padding: '5px 8px' }} />
              ) : (
                <div style={{ fontSize: 12 }}>{kayit[k.key] || '—'}</div>
              )}
            </div>
          ))}
          {duzenle ? <button type="button" onClick={() => onSil(i)} style={{ ...btnSmall, color: '#ef4444' }}>Sil</button> : null}
        </div>
      ))}
    </div>
  )
}
