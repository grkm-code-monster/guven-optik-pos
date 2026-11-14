import { adminApi } from '../pages/admin/AdminLayout'

export type IkmalAlternatif = { varyantId: number; renk: string; olcu: string; depoAdet: number }
export type IkmalSatir = {
  varyantId: number
  tmplId: number | null
  sablonAdi: string
  model: string
  renk: string
  olcu: string
  barkod: string | null
  kategori: string
  tur: 'CERCEVE' | 'GUNES'
  fiyat: number
  satisAdet: number
  sonSatis: string
  magazaAdet: number
  depoAdet: number
  digerKonumlar: { lokasyon: string; adet: number }[]
  taslaktaAdet: number
  oneri: 'GONDER' | 'ALTERNATIF' | 'TUKENDI'
  onerilenAdet: number
  alternatifler: IkmalAlternatif[]
}
export type IkmalKalem = {
  varyantId: number
  urunAdi: string
  nitelik: string
  adet: number
  sebep: 'SATIS' | 'ALTERNATIF' | 'MINMAX'
  satilanVaryantId?: number
}
export type IkmalTaslak = {
  id: string
  no: number
  hedefLokasyon: string
  kaynakLokasyon: string
  durum: 'TASLAK' | 'GONDERILDI' | 'IPTAL'
  kalemler: IkmalKalem[]
  donemBas: string | null
  donemBit: string | null
  aciklama: string | null
  olusturanAdi: string | null
  transferRef: string | null
  gonderildi: string | null
  createdAt: string
}
export type ToplamaSatir = IkmalKalem & { lotlar: { lotId: number | null; lotNo: string; adet: number }[]; eksik: number }

export async function getSonSevk(lokasyon: string): Promise<string | null> {
  const r = await adminApi.get('/admin/ikmal/son-sevk', { params: { lokasyon } })
  return r.data?.tarih ?? null
}
export async function getIkmalSatilanlar(p: { lokasyon: string; bas: string; bit: string; tur: string }) {
  const r = await adminApi.get('/admin/ikmal/satilanlar', { params: p })
  return r.data as { satirlar: IkmalSatir[]; satisKalemSayisi: number }
}
export async function getIkmalTaslaklar(lokasyon?: string, durum?: string): Promise<IkmalTaslak[]> {
  const r = await adminApi.get('/admin/ikmal/taslaklar', { params: { lokasyon, durum } })
  return r.data?.data ?? []
}
export async function ikmalTaslakOlustur(body: { hedefLokasyon: string; kalemler: IkmalKalem[]; donemBas?: string; donemBit?: string; aciklama?: string }) {
  const r = await adminApi.post('/admin/ikmal/taslak', body)
  return r.data?.data as IkmalTaslak
}
export async function ikmalTaslakIptal(id: string) {
  await adminApi.post(`/admin/ikmal/taslak/${id}/iptal`)
}
export async function ikmalToplama(id: string) {
  const r = await adminApi.get(`/admin/ikmal/taslak/${id}/toplama`)
  return r.data as { taslak: IkmalTaslak; satirlar: ToplamaSatir[] }
}
export async function ikmalGonder(id: string) {
  const r = await adminApi.post(`/admin/ikmal/taslak/${id}/gonder`).catch((e) => ({ data: e?.response?.data ?? { success: false, message: e?.message } }))
  return r.data as { success: boolean; message?: string; refNo?: string | null }
}

// ── Min-max (stok cam / lens / solüsyon) ──
export type StokSeviyeKurali = {
  id: string
  lokasyon: string
  seri: string
  sphMin: string | number | null
  sphMax: string | number | null
  cylMin: string | number | null
  cylMax: string | number | null
  min: number
  max: number
  aktif: boolean
}
export type MinMaxSatir = {
  varyantId: number
  ad: string
  seri: string
  sph: number | null
  cyl: number | null
  min: number
  max: number
  magazaAdet: number
  depoAdet: number
  taslakta: number
  sipariste: number
  satis30: number
  eksik: number
  onerilen: number
}
export async function getKurallar(lokasyon: string): Promise<StokSeviyeKurali[]> {
  const r = await adminApi.get('/admin/ikmal/kurallar', { params: { lokasyon } })
  return r.data?.data ?? []
}
export async function kuralKaydet(body: Partial<StokSeviyeKurali> & { lokasyon: string; seri: string; min: number; max: number }) {
  const r = await adminApi.post('/admin/ikmal/kural', body)
  return r.data?.data as StokSeviyeKurali
}
export async function kuralSil(id: string) {
  await adminApi.delete(`/admin/ikmal/kural/${id}`)
}
export async function kuralKopyala(kaynak: string, hedefler: string[]) {
  const r = await adminApi.post('/admin/ikmal/kural-kopyala', { kaynak, hedefler })
  return Number(r.data?.kopyalanan ?? 0)
}
export async function seriOnizle(seri: string) {
  const r = await adminApi.get('/admin/ikmal/seri-onizle', { params: { seri } })
  return r.data as { sablon: number; ornek: string[] }
}
export async function getMinMax(lokasyon: string) {
  const r = await adminApi.get('/admin/ikmal/minmax', { params: { lokasyon } })
  return r.data as { satirlar: MinMaxSatir[]; kuralOzet: { kuralId: string; seri: string; uyan: number; eksik: number }[] }
}

// ── Satın alma siparişleri ──
export type SatinAlmaSiparis = {
  id: string
  no: number
  lokasyon: string
  tedarikciId: number | null
  tedarikciAdi: string | null
  durum: 'TASLAK' | 'VERILDI' | 'TAMAMLANDI' | 'IPTAL'
  kaynak: string
  kalemler: { varyantId: number; urunAdi: string; nitelik?: string; adet: number; not?: string }[]
  aciklama: string | null
  olusturanAdi: string | null
  verildi: string | null
  createdAt: string
}
export async function getTedarikciler(q?: string): Promise<{ id: number; ad: string }[]> {
  const r = await adminApi.get('/admin/ikmal/tedarikciler', { params: { q } })
  return r.data?.data ?? []
}
export async function getSiparisler(lokasyon?: string): Promise<SatinAlmaSiparis[]> {
  const r = await adminApi.get('/admin/ikmal/siparisler', { params: { lokasyon } })
  return r.data?.data ?? []
}
export async function siparisOlustur(body: { lokasyon: string; tedarikciId?: number | null; tedarikciAdi?: string | null; kalemler: { varyantId: number; urunAdi: string; nitelik?: string; adet: number; not?: string }[]; kaynak?: string; aciklama?: string }) {
  const r = await adminApi.post('/admin/ikmal/siparis', body)
  return r.data?.data as SatinAlmaSiparis
}
export async function siparisDurum(id: string, durum: SatinAlmaSiparis['durum']) {
  await adminApi.post(`/admin/ikmal/siparis/${id}/durum`, { durum })
}
export async function getSeriler(): Promise<{ seri: string; kategori: string; adet: number }[]> {
  const r = await adminApi.get('/admin/ikmal/seriler')
  return r.data?.data ?? []
}

// ── Satın Alma (firma ziyareti) — 14.11.2026 ──
export type SaTur = 'OPTIK' | 'GUNES'
export type SaDurum = 'COK_SATAN' | 'TUKENDI' | 'DURGUN' | 'YENI' | 'ESKI' | 'NORMAL'
export type SaMarka = {
  marka: string
  markaKey: string
  turler: SaTur[]
  stok: number
  satis12: number
  siber: number
  modelSayisi: number
  tedarikciId: number | null
  tedarikciAdi: string | null
  faturaFirma: string | null
  temsilci: string | null
  telefon: string | null
  ziyaretDonemi: string | null
  aciklama: string | null
}
export type SaVaryant = {
  id: number
  renk: string
  olcu: string
  barkod: string | null
  aktif: boolean
  stok: number
  depo: number
  lokasyonlar: Record<string, number>
  satis12: number
  fiyat: number
  maliyet: number
}
export type SaModel = {
  anahtar: string
  tur: SaTur
  model: string
  digerYazimlar: string[]
  sistemde: boolean
  sablonAdi: string | null
  varyantlar: SaVaryant[]
  renkler: { renk: string; stok: number; satis12: number; siber: number; sistemde: boolean }[]
  stok: number
  depo: number
  magaza: number
  satis12: number
  satis3: number
  siber: number
  satisLokasyon: Record<string, number>
  sonSatis: string | null
  ilkGiris: string | null
  fiyat: number | null
  maliyet: number | null
  durum: SaDurum
}
export type SaMarkaAnaliz = {
  marka: string
  markaKey: string
  kart: SaMarka | null
  modeller: SaModel[]
  donem: { b12: string; b3: string; bugun: string }
  posBaslangic: Record<string, string>
}
export async function getSaMarkalar(yenile = false) {
  const r = await adminApi.get('/admin/ikmal/satin-alma/markalar', { params: yenile ? { yenile: '1' } : {}, timeout: 180000 })
  return r.data as { data: SaMarka[]; posBaslangic: Record<string, string>; zaman: string }
}
export async function getSaMarkaAnaliz(marka: string) {
  const r = await adminApi.get('/admin/ikmal/satin-alma/marka', { params: { marka }, timeout: 180000 })
  return r.data as SaMarkaAnaliz
}
export async function saOkut(kod: string) {
  const r = await adminApi.get('/admin/ikmal/satin-alma/okut', { params: { kod } })
  return (r.data?.data ?? null) as { markaKey: string; marka: string; anahtar: string; varyantId: number } | null
}
export async function saMarkaKartKaydet(body: { marka: string; tedarikciId?: number | null; tedarikciAdi?: string | null; temsilci?: string | null; telefon?: string | null; ziyaretDonemi?: string | null; aciklama?: string | null }) {
  const r = await adminApi.put('/admin/ikmal/satin-alma/marka-kart', body)
  return r.data?.data
}
