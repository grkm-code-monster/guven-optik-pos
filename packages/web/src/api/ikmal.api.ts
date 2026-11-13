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
  sebep: 'SATIS' | 'ALTERNATIF'
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
