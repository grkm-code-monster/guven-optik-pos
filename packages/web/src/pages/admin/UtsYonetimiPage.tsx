import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminApi } from './AdminLayout'

type Sekme = 'subeler' | 'firmalar' | 'bildirim' | 'kuyruk'

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

type DisFirma = {
  id: string
  ad: string
  vkn?: string | null
  kurumNo?: string | null
  adres?: string | null
  telefon?: string | null
  email?: string | null
  notlar?: string | null
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

type BildirimKalem = { barkod: string; seriNo: string; adet: number }

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

export default function UtsYonetimiPage() {
  const [sekme, setSekme] = useState<Sekme>('subeler')
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [secilenBranch, setSecilenBranch] = useState<string | null>(null)
  const [disFirmalar, setDisFirmalar] = useState<DisFirma[]>([])
  const [kuyruk, setKuyruk] = useState<KuyrukItem[]>([])
  const [yukleniyor, setYukleniyor] = useState(false)
  const [mesaj, setMesaj] = useState<{ tip: 'ok' | 'err'; text: string } | null>(null)

  const [subeForm, setSubeForm] = useState({ kurumNo: '', token: '', ortam: 'canli' })
  const [tokenGoster, setTokenGoster] = useState(false)

  const [firmaForm, setFirmaForm] = useState({
    ad: '', vkn: '', kurumNo: '', adres: '', telefon: '', email: '', notlar: '',
  })
  const [secilenFirma, setSecilenFirma] = useState<string | null>(null)

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
    { barkod: '', seriNo: '', adet: 1 },
  ])
  const [barkodMetin, setBarkodMetin] = useState('')
  const [seciliKuyruk, setSeciliKuyruk] = useState<string[]>([])

  const yukle = useCallback(async () => {
    setYukleniyor(true)
    try {
      const [brRes, kuyrukRes] = await Promise.all([
        adminApi.get('/admin/uts/subeler'),
        adminApi.get('/admin/uts/kuyruk'),
      ])
      setBranches(brRes.data?.data ?? [])
      setKuyruk(kuyrukRes.data?.data ?? [])
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
    if (sekme === 'firmalar' || sekme === 'bildirim') void disYukle()
  }, [sekme, disYukle])

  const seciliBranchData = useMemo(
    () => branches.find((b) => b.id === secilenBranch) ?? null,
    [branches, secilenBranch],
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
    gonderildi: 0,
  }), [kuyruk])

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
    })
  }

  function yeniFirma() {
    setSecilenFirma(null)
    setFirmaForm({ ad: '', vkn: '', kurumNo: '', adres: '', telefon: '', email: '', notlar: '' })
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
      } else {
        await adminApi.post('/admin/uts/dis-firma', firmaForm)
      }
      setMesaj({ tip: 'ok', text: 'Firma kaydedildi' })
      await disYukle()
      yeniFirma()
    } catch (e: any) {
      setMesaj({ tip: 'err', text: e?.response?.data?.error ?? 'Kayıt başarısız' })
    } finally {
      setYukleniyor(false)
    }
  }

  function firmaBildirimeUygula(firmaId: string) {
    const f = disFirmalar.find((x) => x.id === firmaId)
    if (!f) return
    setBildirimForm((p) => ({
      ...p,
      karsiAd: f.ad,
      karsiKurumNo: f.kurumNo ?? '',
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
      const parcalar = satir.split(/[\t,;]+/).map((p) => p.trim()).filter(Boolean)
      return {
        barkod: parcalar[0] ?? '',
        seriNo: parcalar[1] ?? '',
        adet: Number(parcalar[2]) || 1,
      }
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
    setYukleniyor(true)
    try {
      await adminApi.post('/admin/uts/bildirim-olustur', {
        ...bildirimForm,
        kalemler,
      })
      setMesaj({ tip: 'ok', text: 'Bildirim oluşturuldu' })
      setBildirimKalemler([{ barkod: '', seriNo: '', adet: 1 }])
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
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>UTS Yönetimi</h1>
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
              <button type="button" onClick={() => void firmaKaydet()} disabled={yukleniyor} style={btnPrimary}>
                Kaydet
              </button>
            </div>
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
              <label style={{ fontSize: 12, fontWeight: 600 }}>Barkod girişi (her satır: barkod veya barkod, seri, adet)</label>
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
                  {['Barkod (UNO)', 'Seri No', 'Adet', ''].map((h) => (
                    <th key={h} style={{ padding: 8, textAlign: 'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bildirimKalemler.map((k, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 6 }}>
                      <input value={k.barkod} onChange={(e) => setBildirimKalemler((prev) => prev.map((x, j) => j === i ? { ...x, barkod: e.target.value } : x))} style={{ ...inp, padding: '4px 8px' }} />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input value={k.seriNo} onChange={(e) => setBildirimKalemler((prev) => prev.map((x, j) => j === i ? { ...x, seriNo: e.target.value } : x))} style={{ ...inp, padding: '4px 8px' }} />
                    </td>
                    <td style={{ padding: 6 }}>
                      <input type="number" min={1} value={k.adet} onChange={(e) => setBildirimKalemler((prev) => prev.map((x, j) => j === i ? { ...x, adet: Number(e.target.value) || 1 } : x))} style={{ ...inp, padding: '4px 8px', width: 70 }} />
                    </td>
                    <td style={{ padding: 6 }}>
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
        </div>
      ) : null}
    </div>
  )
}
