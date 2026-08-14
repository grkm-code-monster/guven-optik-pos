import { useEffect, useMemo, useState, useRef } from 'react'
import type { Sale } from '../../api/types'
import { apiClient } from '../../api/client'
import { hasAnyPrescriptionData, isLensMeasurementSaleItem, mergedPrescriptionNumbers } from '../../utils/saleMeasurements'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { downloadOzelSiparisKartPdf } from '../../utils/ozelSiparisKartPdf'

type ItemStatus = 'DELIVERED' | 'IN_LAB' | 'ORDERED' | 'PENDING'

type AtolyeBranch = { id: string; name: string; code: string }

const DURUM_LABEL: Record<string, string> = {
  DELIVERED: 'Teslim Edildi',
  IN_LAB: 'Laboratuvarda',
  ORDERED: 'Sipariş',
  PENDING: 'Beklemede',
  VOID: 'İptal',
}

const DURUM_RENK: Record<string, { bg: string; color: string }> = {
  DELIVERED: { bg: '#dcfce7', color: '#166534' },
  IN_LAB: { bg: '#dbeafe', color: '#1e40af' },
  ORDERED: { bg: '#fef9c3', color: '#854d0e' },
  PENDING: { bg: '#f3f4f6', color: '#374151' },
}

export default function StatusStep({
  sale,
  onNewSale,
  onRefresh,
  customerPrescription,
}: {
  sale: Sale | null
  onNewSale: () => void
  onRefresh: () => Promise<{ mesaj?: string; processing?: boolean } | void>
  customerPrescription?: Record<string, unknown> | null
}) {
  const hasLensOrder = useMemo(() => {
    return (sale?.items ?? []).some((i: any) =>
      i.linkType === 'FRAME_LENS' || i.linkType === 'CUSTOMER_FRAME'
    )
  }, [sale?.items])

  const [picked, setPicked] = useState<ItemStatus>(() =>
    (sale?.items ?? []).some((i: any) =>
      i.linkType === 'FRAME_LENS' || i.linkType === 'CUSTOMER_FRAME'
    ) ? 'ORDERED' : 'DELIVERED'
  )
  const [deliveryDate, setDeliveryDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshInfo, setRefreshInfo] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [resmiFaturaLoading, setResmiFaturaLoading] = useState(false)
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [satisSatirNotu, setSatisSatirNotu] = useState('')
  const [atolyeBranches, setAtolyeBranches] = useState<AtolyeBranch[]>([])
  const [seciliAtolyeId, setSeciliAtolyeId] = useState('')
  const pdfRef = useRef<HTMLDivElement>(null)

  const customerName = sale?.customer?.name ?? ''
  const itemsToUpdate = useMemo(() => (sale?.items ?? []).filter((i) => String(i.status).toUpperCase() !== 'VOID'), [sale?.items])
  const labEligibleItems = useMemo(
    () => itemsToUpdate.filter((it) => isLensMeasurementSaleItem(it)),
    [itemsToUpdate],
  )

  useEffect(() => {
    apiClient
      .get('/sales/atolye-branches')
      .then((res) => {
        const list: AtolyeBranch[] = res.data?.data ?? []
        setAtolyeBranches(list)
        if (list.length > 0) {
          setSeciliAtolyeId((prev) => prev || list[0].id)
        }
      })
      .catch(() => setAtolyeBranches([]))
  }, [])

  useEffect(() => {
    if (picked === 'IN_LAB' && atolyeBranches.length > 0 && !seciliAtolyeId) {
      setSeciliAtolyeId(atolyeBranches[0].id)
    }
  }, [picked, atolyeBranches, seciliAtolyeId])

  const canSave =
    !saving &&
    !(picked === 'IN_LAB' && (atolyeBranches.length === 0 || !seciliAtolyeId || labEligibleItems.length === 0))

  async function save() {
    if (!sale) return
    if (picked === 'IN_LAB') {
      if (atolyeBranches.length === 0) {
        setError('Tanımlı atölye şubesi bulunamadı. Yönetici panelinden şubeye atölye bayrağı ekleyin.')
        return
      }
      if (!seciliAtolyeId) {
        setError('Laboratuvara gönderim için atölye şubesi seçin.')
        return
      }
      if (labEligibleItems.length === 0) {
        setError('Laboratuvara gönderilecek cam/lens kalemi bulunamadı (çerçeve kalemleri hariç tutulur).')
        return
      }
    }
    setSaving(true)
    setError(null)
    try {
      const targets = picked === 'IN_LAB' ? labEligibleItems : itemsToUpdate
      await Promise.all(
        targets.map((it) =>
          apiClient.patch(`/sales/${sale.id}/items/${it.id}/status`, {
            status: picked,
            deliveryDate: deliveryDate || undefined,
            ...(picked === 'IN_LAB' ? { atolyeBranchId: seciliAtolyeId } : {}),
          }),
        ),
      )
      onNewSale()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Durum kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  async function pdfIndir() {
    if (!pdfRef.current) return
    setPdfLoading(true)
    try {
      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' })
      const W = 210, H = 297
      const imgH = (canvas.height * W) / canvas.width
      let pos = 0
      pdf.addImage(imgData, 'PNG', 0, pos, W, imgH)
      let remaining = imgH - H
      while (remaining > 0) {
        pos -= H; pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, pos, W, imgH)
        remaining -= H
      }
      pdf.save(`satis-${sale?.id?.slice(-6) ?? 'belge'}.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  async function resmiFaturaIndir() {
    if (!sale || sale.eFaturaDurum !== 'GONDERILDI') return
    setResmiFaturaLoading(true)
    setError(null)
    try {
      const res = await apiClient.get(`/sales/${sale.id}/fatura-pdf`, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e: any) {
      const data = e?.response?.data
      if (data instanceof Blob) {
        try {
          const text = await data.text()
          const parsed = JSON.parse(text) as { message?: string }
          setError(parsed.message ?? 'Resmi fatura PDF alınamadı')
        } catch {
          setError('Resmi fatura PDF alınamadı')
        }
      } else {
        setError(e?.response?.data?.message ?? 'Resmi fatura PDF alınamadı')
      }
    } finally {
      setResmiFaturaLoading(false)
    }
  }

  async function kartBas(it: any) {
    const rx = mergedPrescriptionNumbers(it, customerPrescription)
    if (!hasAnyPrescriptionData(rx)) {
      setError('Bu kalemde reçete kaydı bulunamadı — kart basılamadı.')
      return
    }
    const urunAdi = (it.odooProductName && !it.odooProductName.includes('PLACEHOLDER'))
      ? it.odooProductName
      : it.product?.name && !it.product.name.includes('PLACEHOLDER')
      ? it.product.name
      : 'Cam'
    await downloadOzelSiparisKartPdf({
      musteriAdi: customerName,
      musteriTelefon: sale?.customer?.phone,
      urunAdi,
      sagSph: rx.r_sph, sagCyl: rx.r_cyl, sagAks: rx.r_aks, sagAdd: rx.r_add,
      solSph: rx.l_sph, solCyl: rx.l_cyl, solAks: rx.l_aks, solAdd: rx.l_add,
    })
  }

  async function durumuYenile() {
    if (!sale) return
    setRefreshLoading(true)
    setError(null)
    setRefreshInfo(null)
    try {
      const result = await onRefresh()
      if (result?.processing && result?.mesaj) {
        setRefreshInfo(result.mesaj)
      } else if (result?.mesaj && !result?.processing) {
        setError(result.mesaj)
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.response?.data?.mesaj ?? 'Satış durumu yenilenemedi')
    } finally {
      setRefreshLoading(false)
    }
  }

  if (!sale) return <div style={{ padding: 16 }}>Yükleniyor...</div>

  const items = (sale.items ?? []).filter((i) => String(i.status).toUpperCase() !== 'VOID')
  const payments = sale.payments ?? []
  const nakit = payments.filter(p => p.paymentType === 'CASH').reduce((s, p) => s + Number(p.netAmount), 0)
  const kart = payments.filter(p => p.paymentType === 'CARD').reduce((s, p) => s + Number(p.netAmount), 0)
  const havale = payments.filter(p => p.paymentType === 'TRANSFER').reduce((s, p) => s + Number(p.netAmount), 0)
  const acikHesap = payments.filter(p => p.paymentType === 'OPEN_ACCOUNT').reduce((s, p) => s + Number(p.netAmount), 0)
  const sgkHakki = payments.filter(p => p.paymentType === 'SGK').reduce((s, p) => s + Number(p.netAmount), 0)
  const vakifOdemesi = payments.filter(p => p.paymentType === 'VAKIF').reduce((s, p) => s + Number(p.netAmount), 0)
  const eticaret = payments.filter(p => p.paymentType === 'ETICARET').reduce((s, p) => s + Number(p.netAmount), 0)
  const toplam = Number(sale.netTotal)
  const odenen = nakit + kart + havale + acikHesap + sgkHakki + vakifOdemesi + eticaret
  const kalan = toplam - odenen

  const para = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺'

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div style={{ textAlign: 'center', padding: '10px 0 4px' }}>
        <div style={{ fontSize: 44 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#111' }}>Satış Tamamlandı!</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>
          Satış No:{' '}
          <span style={{ fontWeight: 800, fontFamily: 'monospace' }}>
            {sale.referansNo ?? sale.id}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Müşteri: <span style={{ fontWeight: 800 }}>{customerName || '—'}</span></div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {sale.eFaturaDurum ? (
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              e-Fatura: <strong>{sale.eFaturaDurum}</strong>
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void durumuYenile()}
            disabled={refreshLoading}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb',
              fontWeight: 700,
              fontSize: 12,
              cursor: refreshLoading ? 'wait' : 'pointer',
              opacity: refreshLoading ? 0.7 : 1,
            }}
          >
            {refreshLoading ? 'Yenileniyor...' : '🔄 Durumu Yenile'}
          </button>
        </div>
        {refreshInfo ? (
          <div style={{ color: '#92400e', fontSize: 12, marginTop: 8, fontWeight: 600 }}>{refreshInfo}</div>
        ) : null}
        {sale.odooSyncError ? (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 12, fontWeight: 600, textAlign: 'left' }}>
            ⚠️ Stok/Odoo senkronizasyon uyarısı: {sale.odooSyncError}
            <div style={{ fontWeight: 400, marginTop: 2 }}>Satış kaydedildi, ancak stok düşme/teslimat işlemi Odoo'da tamamlanamamış olabilir. Lütfen Stok Sorgula'dan kontrol edin.</div>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Durum</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {([['DELIVERED','✅ Teslim Edildi'],['IN_LAB','🔬 Laboratuvara Verildi'],['ORDERED','📦 Sipariş Bekliyor'],['PENDING','📌 Rezerve']] as [ItemStatus, string][]).map(([val, label]) => (
            <button key={val} type="button" onClick={() => setPicked(val)} style={{ padding: '14px 16px', borderRadius: 10, border: picked === val ? '2px solid #C8102E' : '1px solid #e5e7eb', backgroundColor: picked === val ? '#fdf2f4' : 'white', cursor: 'pointer', fontWeight: 700, fontSize: 14, textAlign: 'left' }}>{label}</button>
          ))}
        </div>
      </div>

      {picked === 'IN_LAB' ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>
            Atölye Şubesi
          </div>
          {atolyeBranches.length === 0 ? (
            <p style={{ color: '#b45309', fontSize: 13, margin: 0 }}>
              Tanımlı atölye şubesi bulunamadı. Yönetici panelinden şubeye atölye bayrağı ekleyin.
            </p>
          ) : (
            <>
              <select
                value={seciliAtolyeId}
                onChange={(e) => setSeciliAtolyeId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  fontSize: 14,
                }}
              >
                {atolyeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8, marginBottom: 0 }}>
                Seçilen atölye, laboratuvara gidecek {labEligibleItems.length} cam/lens kalemine uygulanır
                {itemsToUpdate.length > labEligibleItems.length
                  ? ` (${itemsToUpdate.length - labEligibleItems.length} çerçeve/diğer kalem bu durumdan etkilenmez).`
                  : '.'}
              </p>
            </>
          )}
          {labEligibleItems.length === 0 && atolyeBranches.length > 0 ? (
            <p style={{ color: '#b45309', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Bu satışta laboratuvara gönderilebilecek cam/lens kalemi yok.
            </p>
          ) : null}
        </div>
      ) : null}

      {labEligibleItems.some((it: any) => hasAnyPrescriptionData(mergedPrescriptionNumbers(it, customerPrescription))) ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>
            Garanti / Reçete Kartı (ZC100)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {labEligibleItems.filter((it: any) => hasAnyPrescriptionData(mergedPrescriptionNumbers(it, customerPrescription))).map((it: any) => {
              const urunAdi = (it.odooProductName && !it.odooProductName.includes('PLACEHOLDER'))
                ? it.odooProductName
                : it.product?.name && !it.product.name.includes('PLACEHOLDER')
                ? it.product.name
                : 'Cam'
              return (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 10, border: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{urunAdi}</span>
                  <button
                    type="button"
                    onClick={() => void kartBas(it)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d97706', backgroundColor: 'white', color: '#d97706', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    🪪 Kart Bas
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Tahmini Teslim Tarihi</div>
        <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14 }} />
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Notlar</div>
        <textarea value={satisSatirNotu} onChange={(e) => setSatisSatirNotu(e.target.value)} placeholder="Teslimat notu, kargo bilgisi..." rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {error ? <div style={{ color: '#ef4444', fontSize: 13, marginTop: 10 }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button type="button" onClick={() => void save()} disabled={!canSave} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', backgroundColor: '#C8102E', color: 'white', fontWeight: 800, fontSize: 15, cursor: !canSave ? 'not-allowed' : 'pointer', opacity: !canSave ? 0.7 : 1 }}>
          {saving ? 'Kaydediliyor...' : 'Kaydet & Bitir'}
        </button>
        <button type="button" onClick={() => void pdfIndir()} disabled={pdfLoading} style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #374151', backgroundColor: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {pdfLoading ? '...' : '📄 PDF'}
        </button>
        {sale.eFaturaDurum === 'GONDERILDI' ? (
          <button
            type="button"
            onClick={() => void resmiFaturaIndir()}
            disabled={resmiFaturaLoading}
            style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #1a1a2e', backgroundColor: 'white', fontWeight: 700, fontSize: 13, cursor: resmiFaturaLoading ? 'wait' : 'pointer' }}
          >
            {resmiFaturaLoading ? '...' : '🧾 Resmi Fatura'}
          </button>
        ) : null}
        <button type="button" onClick={onNewSale} style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #e5e7eb', backgroundColor: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          Yeni Satış
        </button>
      </div>

      {/* PDF içeriği — gizli div */}
      <div style={{ position: 'absolute', left: -9999, top: 0 }}>
        <div ref={pdfRef} style={{ width: 794, padding: 40, backgroundColor: 'white', fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#111' }}>
          
          {/* Başlık */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Güven Optik</div>
              <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>1959 · Optik Mağaza POS</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Satış Belgesi</div>
              <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>{sale.referansNo ?? sale.id?.slice(-12)}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{new Date(sale.createdAt ?? '').toLocaleDateString('tr-TR')}</div>
            </div>
          </div>

          {/* Müşteri */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Müşteri</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{customerName}</div>
              <div style={{ color: '#6b7280' }}>{sale.customer?.phone}</div>
              {deliveryDate && <div style={{ marginTop: 6, fontSize: 11 }}>Teslim: {new Date(deliveryDate).toLocaleDateString('tr-TR')}</div>}
            </div>
            <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Durum</div>
              <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 4, backgroundColor: DURUM_RENK[picked]?.bg ?? '#f3f4f6', color: DURUM_RENK[picked]?.color ?? '#374151', fontWeight: 700, fontSize: 12 }}>{DURUM_LABEL[picked] ?? picked}</div>
            </div>
          </div>

          {/* Ürünler */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Ürünler</div>
            {items.map((it) => {
              const durum = String(it.status).toUpperCase()
              const renkBilgi = DURUM_RENK[durum] ?? DURUM_RENK['PENDING']
              const urunAdi = (it.odooProductName && !it.odooProductName.includes('PLACEHOLDER'))
                ? it.odooProductName
                : it.product?.name && !it.product.name.includes('PLACEHOLDER')
                ? it.product.name
                : 'Cam'
              const rx = it.prescription
              return (
                <div key={it.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 12px', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700 }}>{urunAdi}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: renkBilgi?.bg ?? '#f3f4f6', color: renkBilgi?.color ?? '#374151', fontWeight: 600 }}>{DURUM_LABEL[durum] ?? durum}</span>
                      </div>
                      {it.linkType && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{it.linkType === 'CUSTOMER_FRAME' ? 'Kendi çerçevesi' : it.linkType === 'FRAME_LENS' ? 'Çerçeveye bağlı cam' : ''}</div>}
                      {rx && (
                        <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '2px 12px', fontSize: 11 }}>
                          <span style={{ color: '#6b7280' }}>Sağ:</span>
                          <span>SPH {rx.r_sph ?? '—'} / CYL {rx.r_cyl ?? '—'} / AKS {rx.r_aks ?? '—'} / PD {rx.r_pd ?? '—'}</span>
                          <span style={{ color: '#6b7280' }}>Sol:</span>
                          <span>SPH {rx.l_sph ?? '—'} / CYL {rx.l_cyl ?? '—'} / AKS {rx.l_aks ?? '—'} / PD {rx.l_pd ?? '—'}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>{para(Number(it.lineTotal))}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{it.qty} adet · {para(Number(it.unitPrice))}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Ödeme ve özet */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Ödeme Detayı</div>
              <table style={{ width: '100%', fontSize: 12 }}>
                <tbody>
                  {nakit > 0 && <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>Nakit</td><td style={{ textAlign: 'right' }}>{para(nakit)}</td></tr>}
                  {kart > 0 && <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>Kredi Kartı</td><td style={{ textAlign: 'right' }}>{para(kart)}</td></tr>}
                  {havale > 0 && <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>Havale</td><td style={{ textAlign: 'right' }}>{para(havale)}</td></tr>}
                  {acikHesap > 0 && <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>Açık Hesap</td><td style={{ textAlign: 'right' }}>{para(acikHesap)}</td></tr>}
                  {sgkHakki > 0 && <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>SGK Hakkı</td><td style={{ textAlign: 'right' }}>{para(sgkHakki)}</td></tr>}
                  {vakifOdemesi > 0 && <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>Vakıf Ödemesi</td><td style={{ textAlign: 'right' }}>{para(vakifOdemesi)}</td></tr>}
                  {eticaret > 0 && <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>Kurum Ödemesi</td><td style={{ textAlign: 'right' }}>{para(eticaret)}</td></tr>}
                  <tr style={{ borderTop: '1px solid #e5e7eb' }}><td style={{ paddingTop: 4, color: '#6b7280' }}>Ödenen</td><td style={{ textAlign: 'right', paddingTop: 4 }}>{para(odenen)}</td></tr>
                  <tr><td style={{ color: kalan > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>Kalan</td><td style={{ textAlign: 'right', color: kalan > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{para(kalan)}</td></tr>
                </tbody>
              </table>
            </div>
            <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Özet</div>
              <table style={{ width: '100%', fontSize: 12 }}>
                <tbody>
                  <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>Ara toplam</td><td style={{ textAlign: 'right' }}>{para(Number(sale.grossTotal))}</td></tr>
                  <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>KDV</td><td style={{ textAlign: 'right' }}>{para(Number(sale.netTotal) - Number(sale.grossTotal))}</td></tr>
                  <tr><td style={{ color: '#6b7280', paddingBottom: 4 }}>İndirim</td><td style={{ textAlign: 'right' }}>{Number(sale.discountTotal) > 0 ? para(Number(sale.discountTotal)) : '—'}</td></tr>
                  <tr style={{ borderTop: '1px solid #e5e7eb' }}><td style={{ paddingTop: 4, fontWeight: 700 }}>Genel toplam</td><td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 4 }}>{para(toplam)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Notlar */}
          {satisSatirNotu && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Notlar</div>
              <div style={{ fontSize: 12, color: '#374151' }}>{satisSatirNotu}</div>
            </div>
          )}

          {/* Footer */}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, textAlign: 'center', fontSize: 10, color: '#9ca3af' }}>
            Güven Optik POS · {new Date().toLocaleString('tr-TR')} · Bu belge satış kaydının resmi çıktısıdır.
          </div>
        </div>
      </div>
    </div>
  )
}
