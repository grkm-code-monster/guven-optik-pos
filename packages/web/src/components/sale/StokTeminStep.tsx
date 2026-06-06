import { useEffect, useState } from 'react'
import { apiClient } from '../../api/client'
import { useAuthStore } from '../../store/auth.store'
import { getAktifLokasyon } from '../../utils/aktifLokasyon'
import type { LensOrderMeasurementPayload } from '../../utils/saleMeasurements'

type StokDurum = 'YUKLENIYOR' | 'MEVCUT' | 'BASKA_LOKASYON' | 'YOK'

type UrunStokBilgi = {
  saleItemId: string
  urunAdi: string
  odooProductId: string | null
  stokDurum: StokDurum
  mevcutLokasyon: string | null
  mevcutLokasyonId: number | null
  aktifLokasyon: string
}

const LOKASYON_ID_MAP: Record<string, number> = {
  'GVN1': 53, 'GVN3': 54, 'GVN4': 55, 'GVN6': 56,
  'GVN8': 57, 'GVN9': 58, 'GVN2': 59, 'GVN10': 60,
  'ANADEPO': 61, 'GVN5': 62,
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
  const [transferDurumlari, setTransferDurumlari] = useState<Record<string, 'bekliyor' | 'gonderildi' | 'hata'>>({})
  const aktifLokasyon = getAktifLokasyon()

  useEffect(() => {
    void stokKontrolEt()
  }, [])

  async function stokKontrolEt() {
    setYukleniyor(true)
    const items: any[] = sale?.items ?? []
    const sonuclar: UrunStokBilgi[] = []

    for (const item of items) {
      const urunAdi = item.odooProductName ?? item.product?.name ?? ''
      const odooProductId = item.odooProductId ?? null

      if (!urunAdi) continue

      let stokDurum: StokDurum = 'YOK'
      let mevcutLokasyon: string | null = null
      let mevcutLokasyonId: number | null = null

      try {
        // Aktif lokasyonda stok var mı?
        const aktifLokId = LOKASYON_ID_MAP[aktifLokasyon]
        if (aktifLokId) {
          const res = await apiClient.get(`/admin/lokasyon-stok?lokasyonId=${aktifLokId}&q=${encodeURIComponent(urunAdi)}`)
          const stoklar = res.data?.data ?? []
          // Aynı ürünü bul — başka müşteriye ayrılmamış stok
          const uygun = stoklar.find((s: any) =>
            s.productName?.toLowerCase().includes(urunAdi.toLowerCase()) ||
            (odooProductId && String(s.productId) === String(odooProductId))
          )
          if (uygun && uygun.quantity > (uygun.reservedQty ?? 0)) {
            stokDurum = 'MEVCUT'
            mevcutLokasyon = aktifLokasyon
            mevcutLokasyonId = aktifLokId
          }
        }

        // Aktif lokasyonda yoksa diğer lokasyonlara bak
        if (stokDurum === 'YOK') {
          const digerLokasyonlar = Object.entries(LOKASYON_ID_MAP).filter(([key]) => key !== aktifLokasyon)
          for (const [lokKey, lokId] of digerLokasyonlar) {
            const res = await apiClient.get(`/admin/lokasyon-stok?lokasyonId=${lokId}&q=${encodeURIComponent(urunAdi)}`)
            const stoklar = res.data?.data ?? []
            const uygun = stoklar.find((s: any) =>
              s.productName?.toLowerCase().includes(urunAdi.toLowerCase()) ||
              (odooProductId && String(s.productId) === String(odooProductId))
            )
            if (uygun && uygun.quantity > (uygun.reservedQty ?? 0)) {
              stokDurum = 'BASKA_LOKASYON'
              mevcutLokasyon = lokKey
              mevcutLokasyonId = lokId
              break
            }
          }
        }
      } catch {
        stokDurum = 'YOK'
      }

      sonuclar.push({
        saleItemId: item.id,
        urunAdi,
        odooProductId,
        stokDurum,
        mevcutLokasyon,
        mevcutLokasyonId,
        aktifLokasyon,
      })
    }

    setStokBilgileri(sonuclar)
    setYukleniyor(false)
  }

  async function transferTalepGonder(urun: UrunStokBilgi) {
    if (!urun.mevcutLokasyonId || !LOKASYON_ID_MAP[urun.aktifLokasyon]) return
    setTransferDurumlari(p => ({ ...p, [urun.saleItemId]: 'bekliyor' }))
    try {
      await apiClient.post('/admin/transfer-olustur', {
        kalemler: [{
          kaynak: urun.mevcutLokasyonId,
          hedef: LOKASYON_ID_MAP[urun.aktifLokasyon],
          productId: urun.odooProductId ? Number(urun.odooProductId) : 0,
          lotId: null,
          miktar: 1,
          urunAdi: urun.urunAdi,
        }]
      })
      setTransferDurumlari(p => ({ ...p, [urun.saleItemId]: 'gonderildi' }))
      // Satışçıya yeşil tik göster
      setStokBilgileri(prev => prev.map(s =>
        s.saleItemId === urun.saleItemId ? { ...s, stokDurum: 'MEVCUT' } : s
      ))
    } catch {
      setTransferDurumlari(p => ({ ...p, [urun.saleItemId]: 'hata' }))
    }
  }

  async function siparisAc(urun: UrunStokBilgi) {
    setTransferDurumlari(p => ({ ...p, [urun.saleItemId]: 'bekliyor' }))
    try {
      console.log('[DEBUG] selectedCustomer:', JSON.stringify(selectedCustomer))
      const musteriAdi = selectedCustomer?.name
        ?? `${selectedCustomer?.firstName ?? ''} ${selectedCustomer?.lastName ?? ''}`.trim()
        ?? 'Müşteri'
      const musteriTelefon = selectedCustomer?.phone ?? ''
      const satisTemsilcisi = useAuthStore.getState().user?.name
      const recete = latestPrescription
      const payload: any = {
        musteriAdi: musteriAdi || 'Müşteri',
        musteriTelefon: musteriTelefon || '',
        musteriId: selectedCustomer?.id ?? undefined,
        urunAdi: urun.urunAdi || 'Ürün',
        tip: 'RECETELI',
        subeId: getAktifLokasyon(),
        subeAdi: getAktifLokasyon(),
        satisTemsilcisi,
      }
      if (recete?.far_r_sph ?? recete?.r_sph) payload.sagSph = recete.far_r_sph ?? recete.r_sph
      if (recete?.far_r_cyl ?? recete?.r_cyl) payload.sagCyl = recete.far_r_cyl ?? recete.r_cyl
      if (recete?.far_r_aks ?? recete?.r_axs) payload.sagAks = recete.far_r_aks ?? recete.r_axs
      if (recete?.far_r_add ?? recete?.r_add) payload.sagAdd = recete.far_r_add ?? recete.r_add
      if (recete?.far_r_pd) payload.sagPd = recete.far_r_pd
      if (recete?.far_l_sph ?? recete?.l_sph) payload.solSph = recete.far_l_sph ?? recete.l_sph
      if (recete?.far_l_cyl ?? recete?.l_cyl) payload.solCyl = recete.far_l_cyl ?? recete.l_cyl
      if (recete?.far_l_aks ?? recete?.l_axs) payload.solAks = recete.far_l_aks ?? recete.l_axs
      if (recete?.far_l_add ?? recete?.l_add) payload.solAdd = recete.far_l_add ?? recete.l_add
      if (recete?.far_l_pd) payload.solPd = recete.far_l_pd

      const olcum = lensOrderMeasurements?.find((m) => m.saleItemId === urun.saleItemId)
      if (olcum) payload.olcumBilgisi = [olcum]

      await apiClient.post('/admin/ozel-siparis-ekle', payload)
      setTransferDurumlari(p => ({ ...p, [urun.saleItemId]: 'gonderildi' }))
      setStokBilgileri(prev => prev.map(s =>
        s.saleItemId === urun.saleItemId
          ? { ...s, stokDurum: 'MEVCUT', mevcutLokasyon: 'SİPARİŞ VERİLDİ' }
          : s
      ))
    } catch {
      setTransferDurumlari(p => ({ ...p, [urun.saleItemId]: 'hata' }))
    }
  }

  const hepsiHazir = stokBilgileri.length > 0 && stokBilgileri.every(s => s.stokDurum === 'MEVCUT')

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
          {stokBilgileri.map(s => (
            <div key={s.saleItemId} style={{
              border: `1px solid ${s.stokDurum === 'MEVCUT' ? '#86efac' : s.stokDurum === 'BASKA_LOKASYON' ? '#fde68a' : '#fca5a5'}`,
              borderRadius: 12,
              padding: 16,
              backgroundColor: s.stokDurum === 'MEVCUT' ? '#f0fdf4' : s.stokDurum === 'BASKA_LOKASYON' ? '#fffbeb' : '#fff1f2',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{s.urunAdi}</div>
                  {s.stokDurum === 'MEVCUT' && (
                    <span style={{ fontSize: 12, color: '#166534', fontWeight: 700 }}>
                      ✅ {
                        s.mevcutLokasyon === 'SİPARİŞ VERİLDİ'
                          ? 'Sipariş verildi — tedarikçiden gelecek'
                          : s.mevcutLokasyon === s.aktifLokasyon
                          ? 'Bu mağazada mevcut'
                          : `${s.mevcutLokasyon} lokasyonundan transfer edilecek`
                      }
                    </span>
                  )}
                  {s.stokDurum === 'BASKA_LOKASYON' && (
                    <span style={{ fontSize: 12, color: '#92400e' }}>
                      📍 {s.mevcutLokasyon} lokasyonunda mevcut
                    </span>
                  )}
                  {s.stokDurum === 'YOK' && (
                    <span style={{ fontSize: 12, color: '#991b1b' }}>
                      ❌ Hiçbir lokasyonda stokta yok
                    </span>
                  )}
                </div>
                <div>
                  {s.stokDurum === 'BASKA_LOKASYON' && (
                    <button type="button"
                      onClick={() => void transferTalepGonder(s)}
                      disabled={transferDurumlari[s.saleItemId] === 'bekliyor'}
                      style={{ padding: '8px 16px', backgroundColor: '#1d4ed8', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
                      {transferDurumlari[s.saleItemId] === 'bekliyor' ? '⏳...' : '🔄 Transfer Et'}
                    </button>
                  )}
                  {s.stokDurum === 'YOK' && (
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
              Satışta ürün bulunamadı.
            </div>
          )}
        </div>
      )}

      {!yukleniyor && stokBilgileri.length > 0 && (
        <div style={{
          backgroundColor: hepsiHazir ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${hepsiHazir ? '#86efac' : '#fde68a'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13,
        }}>
          {hepsiHazir
            ? '✅ Tüm ürünler hazır. Satışa devam edebilirsiniz.'
            : '⚠️ Bazı ürünler için işlem gerekiyor. Tüm işlemleri tamamlayıp devam edebilirsiniz.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button type="button" onClick={onGeri}
          style={{ padding: '10px 20px', backgroundColor: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#374151' }}>
          ← Geri
        </button>
        <button type="button" onClick={onDevam} disabled={yukleniyor}
          style={{ padding: '10px 24px', backgroundColor: '#1a1a2e', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: yukleniyor ? 'not-allowed' : 'pointer', color: 'white', opacity: yukleniyor ? 0.6 : 1 }}>
          Onaya Devam →
        </button>
      </div>
    </div>
  )
}
