import { useEffect, useState } from 'react'
import { apiClient } from '../../api/client'
import { searchTransferProductLots, type TransferUrun } from '../../api/transfer.api'
import { useAuthStore } from '../../store/auth.store'
import { getAktifLokasyon } from '../../utils/aktifLokasyon'
import type { LensOrderMeasurementPayload } from '../../utils/saleMeasurements'
import { buildOzelSiparisReceteFields } from '../../utils/ozelSiparisRecete'
import { BAKIM_KATEGORI_ID } from './saleKategoriTree'

type StokDurum = 'YUKLENIYOR' | 'MEVCUT' | 'BASKA_LOKASYON' | 'TRANSFER_YOLDA' | 'YOK'
type TransferDurum = 'islemde' | 'bekliyor' | 'gonderildi' | 'hata' | 'kismi'

type StokLokasyonSatir = { kod: string; kullanilabilir: number }

type UrunStokBilgi = {
  saleItemId: string
  urunAdi: string
  odooProductId: string | null
  lotId: number | null
  tracking: string | null
  stokDurum: StokDurum
  mevcutLokasyon: string | null
  mevcutLokasyonId: number | null
  stokluLokasyonlar: StokLokasyonSatir[]
  seciliKaynakLokasyon: string | null
  aktifLokasyon: string
  transferHata?: string | null
  transferMesaji?: string | null
  siparisVerildi?: boolean
}

type LotSecimState = {
  saleItemId: string
  kaynakKod: string
  lots: TransferUrun[]
}

const KAPALI_SIPARIS_DURUMLARI = new Set(['IPTAL', 'TESLIM_EDILDI', 'MUSTERIYE_TESLIM'])

const LOKASYON_ID_MAP: Record<string, number> = {
  'GVN1': 53, 'GVN3': 54, 'GVN4': 55, 'GVN6': 56,
  'GVN8': 57, 'GVN9': 58, 'GVN2': 59, 'GVN10': 60,
  'ANADEPO': 61, 'GVN5': 62,
}

function isBakimHizmetItem(item: { odooCategoryId?: number | null }): boolean {
  return item.odooCategoryId === BAKIM_KATEGORI_ID
}

function stokKontrolKalemleri(items: any[]): any[] {
  return items.filter((item) => !isBakimHizmetItem(item))
}

function saleItemLotId(item: any): number | null {
  const raw = item?.odooLotId ?? item?.lotId ?? null
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function varsayilanKaynakLokasyon(lokasyonlar: StokLokasyonSatir[]): string | null {
  if (!lokasyonlar.length) return null
  return lokasyonlar.reduce((best, cur) =>
    cur.kullanilabilir > best.kullanilabilir ? cur : best,
  ).kod
}

function lokasyonIdFromKod(kod: string | null | undefined): number | null {
  if (!kod) return null
  return LOKASYON_ID_MAP[kod] ?? null
}

function isLotTracked(tracking: string | null | undefined): boolean {
  return Boolean(tracking && tracking !== 'none')
}

export default function StokTeminStep({
  sale,
  selectedCustomer,
  latestPrescription,
  lensOrderMeasurements,
  onDevam,
  onGeri,
}: {
  sale: any
  selectedCustomer: any
  latestPrescription: any
  lensOrderMeasurements?: LensOrderMeasurementPayload[]
  onDevam: () => void
  onGeri: () => void
}) {
  const [stokBilgileri, setStokBilgileri] = useState<UrunStokBilgi[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [transferDurumlari, setTransferDurumlari] = useState<Record<string, TransferDurum>>({})
  const [aktifSiparisKalemler, setAktifSiparisKalemler] = useState<Set<string>>(new Set())
  const [lotSecim, setLotSecim] = useState<LotSecimState | null>(null)
  const [lotSecimLoading, setLotSecimLoading] = useState(false)
  const branchCode = useAuthStore((s) => s.user?.branchCode)
  const aktifLokasyon = getAktifLokasyon(branchCode)

  useEffect(() => {
    void yukleStokVeSiparisler()
  }, [sale?.id])

  function siparisVerildiIsaretle(items: UrunStokBilgi[], aktifIds: Set<string>): UrunStokBilgi[] {
    return items.map((s) => {
      if (!aktifIds.has(s.saleItemId)) return s
      return {
        ...s,
        stokDurum: 'MEVCUT',
        mevcutLokasyon: 'SİPARİŞ VERİLDİ',
        siparisVerildi: true,
      }
    })
  }

  async function mevcutSiparisleriGetir(): Promise<Set<string>> {
    if (!sale?.id) return new Set()
    try {
      const res = await apiClient.get('/admin/ozel-siparisler', {
        params: { satisSiparisId: sale.id, limit: 200 },
      })
      const list = (res.data?.data ?? []) as Array<{ saleItemId?: string | null; durum?: string }>
      const ids = new Set<string>()
      for (const s of list) {
        if (!s.saleItemId || KAPALI_SIPARIS_DURUMLARI.has(String(s.durum ?? ''))) continue
        ids.add(s.saleItemId)
      }
      return ids
    } catch {
      return new Set()
    }
  }

  async function yukleStokVeSiparisler() {
    setYukleniyor(true)
    const aktifIds = await mevcutSiparisleriGetir()
    setAktifSiparisKalemler(aktifIds)
    const sonuclar = await stokKontrolHesapla()
    setStokBilgileri(siparisVerildiIsaretle(sonuclar, aktifIds))
    setYukleniyor(false)
  }

  async function stokKontrolHesapla(): Promise<UrunStokBilgi[]> {
    const items = stokKontrolKalemleri(sale?.items ?? [])
    const sonuclar: UrunStokBilgi[] = []

    for (const item of items) {
      const urunAdi = item.odooProductName ?? item.product?.name ?? ''
      const odooProductId = item.odooProductId ?? null
      const lotId = saleItemLotId(item)
      let tracking: string | null = null

      if (!urunAdi) continue

      let stokDurum: StokDurum = 'YOK'
      let mevcutLokasyon: string | null = null
      let mevcutLokasyonId: number | null = null
      let stokluLokasyonlar: StokLokasyonSatir[] = []
      let seciliKaynakLokasyon: string | null = null

      if (odooProductId) {
        try {
          const res = await apiClient.get('/admin/stok-kontrol-urun', {
            params: { productId: odooProductId },
          })
          tracking = res.data?.data?.tracking ?? null
          const lokasyonlar: StokLokasyonSatir[] = res.data?.data?.lokasyonlar ?? []
          const stoklu = lokasyonlar.filter((l) => l.kullanilabilir > 0)

          const aktif = stoklu.find((l) => l.kod === aktifLokasyon)
          if (aktif) {
            stokDurum = 'MEVCUT'
            mevcutLokasyon = aktifLokasyon
            mevcutLokasyonId = lokasyonIdFromKod(aktifLokasyon)
          } else {
            stokluLokasyonlar = stoklu.filter((l) => l.kod !== aktifLokasyon)
            if (stokluLokasyonlar.length) {
              stokDurum = 'BASKA_LOKASYON'
              seciliKaynakLokasyon = varsayilanKaynakLokasyon(stokluLokasyonlar)
              mevcutLokasyon = seciliKaynakLokasyon
              mevcutLokasyonId = lokasyonIdFromKod(seciliKaynakLokasyon)
            }
          }
        } catch {
          stokDurum = 'YOK'
        }
      }

      sonuclar.push({
        saleItemId: item.id,
        urunAdi,
        odooProductId,
        lotId,
        tracking,
        stokDurum,
        mevcutLokasyon,
        mevcutLokasyonId,
        stokluLokasyonlar,
        seciliKaynakLokasyon,
        aktifLokasyon,
      })
    }

    return sonuclar
  }

  function kaynakLokasyonSec(saleItemId: string, kod: string) {
    const saleItem = (sale?.items ?? []).find((i: any) => i.id === saleItemId)
    const satisLotId = saleItem ? saleItemLotId(saleItem) : null
    setLotSecim((prev) => (prev?.saleItemId === saleItemId ? null : prev))
    setStokBilgileri((prev) => prev.map((s) =>
      s.saleItemId === saleItemId
        ? {
          ...s,
          seciliKaynakLokasyon: kod,
          mevcutLokasyon: kod,
          mevcutLokasyonId: lokasyonIdFromKod(kod),
          lotId: isLotTracked(s.tracking) ? satisLotId : s.lotId,
          transferHata: null,
        }
        : s,
    ))
  }

  async function lotCozumle(
    urun: UrunStokBilgi,
    kaynakKod: string,
  ): Promise<
    | { type: 'ready'; lotId: number | null }
    | { type: 'picker'; lots: TransferUrun[] }
    | { type: 'error'; message: string }
  > {
    if (urun.lotId) return { type: 'ready', lotId: urun.lotId }

    const tracked = isLotTracked(urun.tracking)
    if (!tracked && urun.odooProductId) {
      try {
        const lots = await searchTransferProductLots(Number(urun.odooProductId), kaynakKod, 'pos')
        const withLot = lots.filter((l) => l.lotId)
        if (withLot.length === 0) return { type: 'ready', lotId: null }
      } catch {
        return { type: 'ready', lotId: null }
      }
    }

    if (!tracked) return { type: 'ready', lotId: null }
    if (!urun.odooProductId) {
      return { type: 'error', message: 'Bu lokasyonda uygun lot bulunamadı' }
    }

    let lots: TransferUrun[]
    try {
      lots = await searchTransferProductLots(Number(urun.odooProductId), kaynakKod, 'pos')
    } catch {
      return { type: 'error', message: `${kaynakKod} lokasyonunda lot listesi alınamadı` }
    }

    const withLot = lots.filter((l) => l.lotId && Number(l.lotId) > 0)
    if (withLot.length === 0) {
      return { type: 'error', message: `${kaynakKod} lokasyonunda uygun lot bulunamadı` }
    }
    if (withLot.length === 1) {
      return { type: 'ready', lotId: Number(withLot[0].lotId) }
    }
    return { type: 'picker', lots: withLot }
  }

  function transferSonucIsle(urun: UrunStokBilgi, res: any) {
    if (res.data?.success) {
      const satirDurum = res.data?.transferler?.[0]?.durum as string | undefined
      if (satirDurum === 'basarili') {
        setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'gonderildi' }))
        setStokBilgileri((prev) => prev.map((s) =>
          s.saleItemId === urun.saleItemId
            ? {
              ...s,
              stokDurum: 'MEVCUT',
              mevcutLokasyon: urun.aktifLokasyon,
              transferMesaji: res.data?.message ?? 'Transfer tamamlandı',
              transferHata: null,
            }
            : s
        ))
        return
      }
      setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'bekliyor' }))
      setStokBilgileri((prev) => prev.map((s) =>
        s.saleItemId === urun.saleItemId
          ? {
            ...s,
            stokDurum: 'TRANSFER_YOLDA',
            transferMesaji: res.data?.message ?? `${urun.aktifLokasyon} şubesinde kabul bekliyor`,
            transferHata: null,
          }
          : s
      ))
      return
    }

    if (res.data?.partial) {
      setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'kismi' }))
      setStokBilgileri((prev) => prev.map((s) =>
        s.saleItemId === urun.saleItemId
          ? {
            ...s,
            transferHata: res.data?.message ?? 'Transfer kısmen tamamlandı, muhasebe kontrolü gerekli',
            transferMesaji: null,
          }
          : s
      ))
      return
    }

    setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'hata' }))
    setStokBilgileri((prev) => prev.map((s) =>
      s.saleItemId === urun.saleItemId
        ? {
          ...s,
          transferHata: res.data?.message ?? res.data?.error ?? 'Transfer başarısız',
          transferMesaji: null,
        }
        : s
    ))
  }

  async function transferApiCagir(urun: UrunStokBilgi, kaynakId: number, lotId: number | null) {
    return apiClient.post('/admin/transfer-olustur', {
      kalemler: [{
        kaynak: kaynakId,
        hedef: LOKASYON_ID_MAP[urun.aktifLokasyon],
        productId: urun.odooProductId ? Number(urun.odooProductId) : 0,
        lotId,
        miktar: 1,
        urunAdi: urun.urunAdi,
      }],
    })
  }

  async function lotSecildi(saleItemId: string, lot: TransferUrun) {
    const urun = stokBilgileri.find((s) => s.saleItemId === saleItemId)
    if (!urun || !lot.lotId) return
    const guncel: UrunStokBilgi = { ...urun, lotId: Number(lot.lotId) }
    setLotSecim(null)
    setStokBilgileri((prev) => prev.map((s) => (s.saleItemId === saleItemId ? guncel : s)))
    await transferTalepGonder(guncel)
  }

  async function transferTalepGonder(urun: UrunStokBilgi) {
    const kaynakKod = urun.seciliKaynakLokasyon ?? urun.mevcutLokasyon
    const kaynakId = lokasyonIdFromKod(kaynakKod)
    if (!kaynakId || !LOKASYON_ID_MAP[urun.aktifLokasyon] || !kaynakKod) return
    setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'islemde' }))
    setLotSecim((prev) => (prev?.saleItemId === urun.saleItemId ? null : prev))
    setStokBilgileri((prev) => prev.map((s) =>
      s.saleItemId === urun.saleItemId
        ? { ...s, transferHata: null, transferMesaji: null }
        : s
    ))
    try {
      setLotSecimLoading(true)
      const lotSonuc = await lotCozumle(urun, kaynakKod)
      setLotSecimLoading(false)

      if (lotSonuc.type === 'error') {
        setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'hata' }))
        setStokBilgileri((prev) => prev.map((s) =>
          s.saleItemId === urun.saleItemId
            ? { ...s, transferHata: lotSonuc.message, transferMesaji: null }
            : s
        ))
        return
      }

      if (lotSonuc.type === 'picker') {
        setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'hata' }))
        setLotSecim({
          saleItemId: urun.saleItemId,
          kaynakKod,
          lots: lotSonuc.lots,
        })
        setStokBilgileri((prev) => prev.map((s) =>
          s.saleItemId === urun.saleItemId
            ? { ...s, transferHata: `${kaynakKod} lokasyonunda birden fazla lot var — seçin`, transferMesaji: null }
            : s
        ))
        return
      }

      const lotId = lotSonuc.lotId
      if (lotId && lotId !== urun.lotId) {
        setStokBilgileri((prev) => prev.map((s) =>
          s.saleItemId === urun.saleItemId ? { ...s, lotId } : s
        ))
      }

      const res = await transferApiCagir(urun, kaynakId, lotId)
      const failMsg = String(res.data?.message ?? '')
      if (!res.data?.success && failMsg.includes('lot/seri takipli') && !urun.lotId && lotId == null) {
        const retry = await lotCozumle({ ...urun, tracking: 'serial' }, kaynakKod)
        if (retry.type === 'ready' && retry.lotId) {
          const retryRes = await transferApiCagir(urun, kaynakId, retry.lotId)
          transferSonucIsle({ ...urun, lotId: retry.lotId }, retryRes)
          return
        }
        if (retry.type === 'picker') {
          setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'hata' }))
          setLotSecim({ saleItemId: urun.saleItemId, kaynakKod, lots: retry.lots })
          setStokBilgileri((prev) => prev.map((s) =>
            s.saleItemId === urun.saleItemId
              ? { ...s, transferHata: `${kaynakKod} lokasyonunda birden fazla lot var — seçin`, transferMesaji: null }
              : s
          ))
          return
        }
      }

      transferSonucIsle({ ...urun, lotId: lotId ?? urun.lotId }, res)
    } catch (e: any) {
      setLotSecimLoading(false)
      setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'hata' }))
      setStokBilgileri((prev) => prev.map((s) =>
        s.saleItemId === urun.saleItemId
          ? {
            ...s,
            transferHata: e?.response?.data?.message ?? e?.response?.data?.error ?? 'Bağlantı hatası, tekrar deneyin',
            transferMesaji: null,
          }
          : s
      ))
    }
  }

  async function siparisVerildiDurumunaAl(saleItemId: string) {
    setAktifSiparisKalemler((prev) => new Set([...prev, saleItemId]))
    setStokBilgileri((prev) => prev.map((s) =>
      s.saleItemId === saleItemId
        ? { ...s, stokDurum: 'MEVCUT', mevcutLokasyon: 'SİPARİŞ VERİLDİ', siparisVerildi: true, transferHata: null }
        : s
    ))
  }

  async function siparisAc(urun: UrunStokBilgi) {
    if (urun.siparisVerildi || aktifSiparisKalemler.has(urun.saleItemId)) return
    setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'bekliyor' }))
    try {
      const musteriAdi = selectedCustomer?.name
        ?? `${selectedCustomer?.firstName ?? ''} ${selectedCustomer?.lastName ?? ''}`.trim()
        ?? 'Müşteri'
      const musteriTelefon = selectedCustomer?.phone ?? ''
      const satisTemsilcisi = useAuthStore.getState().user?.name
      const saleItem = (sale?.items ?? []).find((i: any) => i.id === urun.saleItemId)
      const receteFields = buildOzelSiparisReceteFields({
        saleItemPrescription: saleItem?.prescription,
        customerPrescription: latestPrescription,
        customer: selectedCustomer,
      })
      const payload: any = {
        musteriAdi: musteriAdi || 'Müşteri',
        musteriTelefon: musteriTelefon || '',
        musteriId: selectedCustomer?.id ?? undefined,
        satisSiparisId: sale?.id ?? undefined,
        saleItemId: urun.saleItemId,
        urunAdi: urun.urunAdi || 'Ürün',
        tip: 'RECETELI',
        subeId: aktifLokasyon,
        subeAdi: aktifLokasyon,
        satisTemsilcisi,
        miktar: saleItem?.qty ?? 1,
        ...receteFields,
      }

      const olcum = lensOrderMeasurements?.find((m) => m.saleItemId === urun.saleItemId)
      if (olcum) payload.olcumBilgisi = [olcum]

      const res = await apiClient.post('/admin/ozel-siparis-ekle', payload)
      if (res.data?.success || res.data?.zatenVar) {
        setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'gonderildi' }))
        siparisVerildiDurumunaAl(urun.saleItemId)
      } else {
        setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'hata' }))
      }
    } catch {
      setTransferDurumlari((p) => ({ ...p, [urun.saleItemId]: 'hata' }))
    }
  }

  const tumKalemler: any[] = sale?.items ?? []
  const fizikselKalemSayisi = stokKontrolKalemleri(tumKalemler).length
  const sadeceBakimHizmet = tumKalemler.length > 0 && fizikselKalemSayisi === 0
  const transferEngelli = Object.values(transferDurumlari).some((d) => d === 'hata' || d === 'kismi')
  const hepsiHazir =
    !transferEngelli
    && (stokBilgileri.length === 0
      ? sadeceBakimHizmet
      : stokBilgileri.every((s) => s.stokDurum === 'MEVCUT'))

  function transferButonMetni(saleItemId: string): string {
    const durum = transferDurumlari[saleItemId]
    if (durum === 'islemde') return '⏳...'
    if (durum === 'bekliyor') return '→ Yolda'
    if (durum === 'hata' || durum === 'kismi') return '🔄 Tekrar Dene'
    return '🔄 Transfer Et'
  }

  function kalemKenarlik(stokDurum: StokDurum, transferHata?: string | null) {
    if (transferHata) return '#fca5a5'
    if (stokDurum === 'MEVCUT') return '#86efac'
    if (stokDurum === 'TRANSFER_YOLDA') return '#93c5fd'
    if (stokDurum === 'BASKA_LOKASYON') return '#fde68a'
    return '#fca5a5'
  }

  function kalemArkaPlan(stokDurum: StokDurum, transferHata?: string | null) {
    if (transferHata) return '#fff1f2'
    if (stokDurum === 'MEVCUT') return '#f0fdf4'
    if (stokDurum === 'TRANSFER_YOLDA') return '#eff6ff'
    if (stokDurum === 'BASKA_LOKASYON') return '#fffbeb'
    return '#fff1f2'
  }

  return (
    <div style={{ padding: '24px 0' }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#1a1a2e', marginBottom: 8 }}>📦 Stok & Temin Durumu</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        Seçilen ürünlerin stok durumu kontrol ediliyor.
      </div>

      {yukleniyor ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 13 }}>
          ⏳ Stok kontrol ediliyor...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {stokBilgileri.map((s) => (
            <div key={s.saleItemId} style={{
              border: `1px solid ${kalemKenarlik(s.stokDurum, s.transferHata)}`,
              borderRadius: 12,
              padding: 16,
              backgroundColor: kalemArkaPlan(s.stokDurum, s.transferHata),
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{s.urunAdi}</div>
                  {s.stokDurum === 'TRANSFER_YOLDA' && (
                    <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                      → {s.transferMesaji ?? `${s.aktifLokasyon} şubesinde kabul bekliyor`}
                    </span>
                  )}
                  {s.stokDurum === 'MEVCUT' && (
                    <span style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>
                      ✅ {
                        s.transferMesaji
                          ?? (s.mevcutLokasyon === 'SİPARİŞ VERİLDİ'
                            ? 'Sipariş verildi — tedarikçiden gelecek'
                            : s.mevcutLokasyon === s.aktifLokasyon
                              ? 'Bu mağazada mevcut'
                              : `${s.mevcutLokasyon} lokasyonundan transfer edilecek`)
                      }
                    </span>
                  )}
                  {s.stokDurum === 'BASKA_LOKASYON' && s.stokluLokasyonlar.length > 1 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#92400e', fontWeight: 700 }}>
                        📍 Transfer kaynağı seçin:
                      </span>
                      <select
                        value={s.seciliKaynakLokasyon ?? ''}
                        onChange={(e) => kaynakLokasyonSec(s.saleItemId, e.target.value)}
                        style={{
                          fontSize: 12,
                          padding: '6px 10px',
                          borderRadius: 8,
                          border: '1px solid #fde68a',
                          backgroundColor: 'white',
                          color: '#92400e',
                          maxWidth: 280,
                        }}
                      >
                        {s.stokluLokasyonlar.map((l) => (
                          <option key={l.kod} value={l.kod}>
                            {l.kod}: {l.kullanilabilir} adet
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {s.stokDurum === 'BASKA_LOKASYON' && s.stokluLokasyonlar.length <= 1 ? (
                    <span style={{ fontSize: 12, color: '#92400e' }}>
                      📍 {s.seciliKaynakLokasyon ?? s.mevcutLokasyon} lokasyonunda mevcut
                      {s.stokluLokasyonlar[0]
                        ? ` (${s.stokluLokasyonlar[0].kullanilabilir} adet)`
                        : ''}
                    </span>
                  ) : null}
                  {s.stokDurum === 'YOK' && (
                    <span style={{ fontSize: 12, color: '#991b1b' }}>
                      ❌ Hiçbir lokasyonda stokta yok
                    </span>
                  )}
                  {s.transferHata ? (
                    <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 700, marginTop: 8 }}>
                      {transferDurumlari[s.saleItemId] === 'kismi' ? '⚠️ ' : '❌ '}
                      {s.transferHata}
                    </div>
                  ) : null}
                  {lotSecimLoading && transferDurumlari[s.saleItemId] === 'islemde' ? (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Lot bilgisi kontrol ediliyor...</div>
                  ) : null}
                  {lotSecim?.saleItemId === s.saleItemId ? (
                    <div style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid #fde68a',
                      backgroundColor: '#fffbeb',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>
                        Lot/seri seçin ({lotSecim.kaynakKod})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {lotSecim.lots.map((lot) => (
                          <button
                            key={`${lot.lotId}-${lot.lotNo}`}
                            type="button"
                            onClick={() => void lotSecildi(s.saleItemId, lot)}
                            style={{
                              textAlign: 'left',
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: '1px solid #fde68a',
                              backgroundColor: 'white',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>Lot: {lot.lotNo ?? lot.lotId}</div>
                            <div style={{ color: '#6b7280' }}>Stok: {lot.stok ?? 1}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div>
                  {s.stokDurum === 'BASKA_LOKASYON' && (
                    <button type="button"
                      onClick={() => void transferTalepGonder(s)}
                      disabled={transferDurumlari[s.saleItemId] === 'islemde' || transferDurumlari[s.saleItemId] === 'bekliyor'}
                      style={{ padding: '8px 16px', backgroundColor: '#1d4ed8', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'white', cursor: (transferDurumlari[s.saleItemId] === 'islemde' || transferDurumlari[s.saleItemId] === 'bekliyor') ? 'wait' : 'pointer' }}>
                      {transferButonMetni(s.saleItemId)}
                    </button>
                  )}
                  {s.stokDurum === 'TRANSFER_YOLDA' && (
                    <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                      ⏳ Kabul bekleniyor
                    </span>
                  )}
                  {s.stokDurum === 'YOK' && (s.siparisVerildi || aktifSiparisKalemler.has(s.saleItemId)) && (
                    <span style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>
                      ✅ Sipariş verildi — tedarikçiden gelecek
                    </span>
                  )}
                  {s.stokDurum === 'YOK' && !s.siparisVerildi && !aktifSiparisKalemler.has(s.saleItemId) && (
                    <button type="button"
                      onClick={() => void siparisAc(s)}
                      disabled={transferDurumlari[s.saleItemId] === 'bekliyor'}
                      style={{ padding: '8px 16px', backgroundColor: transferDurumlari[s.saleItemId] === 'bekliyor' ? '#9ca3af' : '#92400e', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'white', cursor: transferDurumlari[s.saleItemId] === 'bekliyor' ? 'not-allowed' : 'pointer' }}>
                      {transferDurumlari[s.saleItemId] === 'bekliyor' ? '⏳ Gönderiliyor...' : '🛒 Sipariş Ver'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {stokBilgileri.length === 0 && (
            <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 30,
              backgroundColor: '#f9fafb', borderRadius: 12 }}>
              {sadeceBakimHizmet
                ? 'Bakım/hizmet kalemleri stok kontrolü gerektirmez. Satışa devam edebilirsiniz.'
                : 'Satışta ürün bulunamadı.'}
            </div>
          )}
        </div>
      )}

      {!yukleniyor && (stokBilgileri.length > 0 || sadeceBakimHizmet) && (
        <div style={{
          backgroundColor: hepsiHazir ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${hepsiHazir ? '#86efac' : '#fde68a'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13,
        }}>
          {hepsiHazir
            ? sadeceBakimHizmet
              ? '✅ Bakım/hizmet kalemleri için ek işlem gerekmiyor. Satışa devam edebilirsiniz.'
              : '✅ Tüm ürünler hazır. Satışa devam edebilirsiniz.'
            : transferEngelli
              ? '⚠️ Transfer hatası veya kısmi tamamlanma var. Devam etmeden önce sorunu çözün veya tekrar deneyin.'
              : '⚠️ Bazı ürünler için işlem gerekiyor. Tüm işlemleri tamamlayıp devam edebilirsiniz.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" onClick={onGeri}
          style={{ padding: '10px 20px', backgroundColor: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>
          ← Geri
        </button>
        <button type="button" onClick={onDevam} disabled={yukleniyor || !hepsiHazir}
          style={{ padding: '10px 24px', backgroundColor: '#1a1a2e', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (yukleniyor || !hepsiHazir) ? 'not-allowed' : 'pointer', color: 'white', opacity: (yukleniyor || !hepsiHazir) ? 0.6 : 1 }}>
          Onaya Devam →
        </button>
      </div>
    </div>
  )
}
