import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { apiClient } from '../api/client'
import { getSaleById, voidSale } from '../api/sales.api'
import type { Sale } from '../api/types'
import { isLensMeasurementSaleItem } from '../utils/saleMeasurements'

const cardStyle: CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
}

const pageWrap: CSSProperties = {
  maxWidth: 900,
  margin: '0 auto',
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const danger = '#c0392b'
const primary = '#C8102E'

function money(v?: string | number | null) {
  const n = Number(v ?? 0)
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
    Number.isFinite(n) ? n : 0,
  )
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR')
  } catch {
    return iso
  }
}

function headerSaleStatusBadge(status: string) {
  const s = status?.toUpperCase?.() ?? ''
  const map: Record<string, { label: string; bg: string; color: string }> = {
    PAID: { label: 'Ödendi', bg: '#22c55e', color: '#fff' },
    DRAFT: { label: 'Taslak', bg: '#f97316', color: '#fff' },
    VOID: { label: 'İptal', bg: '#9ca3af', color: '#fff' },
  }
  const c = map[s] ?? { label: status, bg: '#6b7280', color: '#fff' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: c.bg,
        color: c.color,
        padding: '10px 18px',
        fontSize: 15,
        fontWeight: 800,
        letterSpacing: '0.02em',
      }}
    >
      {c.label}
    </span>
  )
}

function itemStatusBadge(status: string) {
  const s = status?.toUpperCase?.() ?? ''
  const map: Record<string, { label: string; bg: string; color: string }> = {
    DELIVERED: { label: 'Teslim Edildi', bg: '#dcfce7', color: '#166534' },
    IN_LAB: { label: 'Laboratuvar', bg: '#fef9c3', color: '#854d0e' },
    ORDERED: { label: 'Cam Bekleniyor', bg: '#ffedd5', color: '#9a3412' },
    PENDING: { label: 'Beklemede', bg: '#ffedd5', color: '#9a3412' },
    WAITING: { label: 'Bekleniyor', bg: '#ffedd5', color: '#9a3412' },
    READY: { label: 'Hazır', bg: '#dbeafe', color: '#1e40af' },
  }
  const c = map[s] ?? { label: status, bg: '#f3f4f6', color: '#374151' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: c.bg,
        color: c.color,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {c.label}
    </span>
  )
}

function paymentDotColor(type: string) {
  const map: Record<string, string> = {
    CASH: '#22c55e',
    CARD: '#3b82f6',
    OPEN_ACCOUNT: '#f97316',
    TRANSFER: '#a855f7',
  }
  return map[type] ?? '#9ca3af'
}

function paymentTypeBadge(type: string) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: '#f3f4f6',
        color: '#111',
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {paymentTypeLabel(type)}
    </span>
  )
}

const STATUS_BTN_STYLES: Record<
  string,
  { border: string; color: string; hoverBg: string; hoverColor: string }
> = {
  IN_LAB: { border: '#eab308', color: '#854d0e', hoverBg: '#fef9c3', hoverColor: '#713f12' },
  ORDERED: { border: '#f97316', color: '#9a3412', hoverBg: '#ffedd5', hoverColor: '#7c2d12' },
  READY: { border: '#3b82f6', color: '#1e40af', hoverBg: '#dbeafe', hoverColor: '#1e3a8a' },
  DELIVERED: { border: '#22c55e', color: '#166534', hoverBg: '#dcfce7', hoverColor: '#14532d' },
}

function paymentTypeLabel(t: string) {
  const map: Record<string, string> = {
    CASH: 'Nakit',
    CARD: 'Kart',
    TRANSFER: 'Havale',
    OPEN_ACCOUNT: 'Açık Hesap',
  }
  return map[t] ?? t
}

function openAccountRemaining(payments: any[]) {
  const openPayments = payments.filter((p) => p.paymentType === 'OPEN_ACCOUNT')
  const openAccountTotal = openPayments.reduce((acc, p) => acc + Number(p.grossAmount), 0)
  if (openAccountTotal === 0) return 0

  const firstOpenDate = openPayments
    .map((p) => new Date(p.createdAt))
    .sort((a, b) => a.getTime() - b.getTime())[0]

  const closedAmount = payments
    .filter(
      (p) =>
        p.paymentType !== 'OPEN_ACCOUNT' &&
        new Date(p.createdAt).getTime() > firstOpenDate.getTime(),
    )
    .reduce((acc, p) => acc + Number(p.grossAmount), 0)

  return Math.max(0, openAccountTotal - closedAmount)
}

const PDF_DURUM_LABEL: Record<string, string> = {
  DELIVERED: 'Teslim Edildi',
  IN_LAB: 'Laboratuvarda',
  ORDERED: 'Sipariş',
  PENDING: 'Beklemede',
  READY: 'Hazır',
  VOID: 'İptal',
}

const PDF_DURUM_RENK: Record<string, { bg: string; color: string }> = {
  DELIVERED: { bg: '#dcfce7', color: '#166534' },
  IN_LAB: { bg: '#dbeafe', color: '#1e40af' },
  ORDERED: { bg: '#fef9c3', color: '#854d0e' },
  PENDING: { bg: '#f3f4f6', color: '#374151' },
  READY: { bg: '#dbeafe', color: '#1e40af' },
}

function pdfPara(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺'
}

function hasLensOrderMeasurement(m: unknown): m is Record<string, unknown> {
  return m != null && typeof m === 'object' && Object.keys(m as object).length > 0
}

function LensOrderMeasurementGrid({ m }: { m: Record<string, unknown> }) {
  const row = (label: string, val: unknown) =>
    val != null && val !== '' ? (
      <>
        <div style={{ color: '#6b7280', fontWeight: 600 }}>{label}</div>
        <div>{String(val)}</div>
      </>
    ) : null

  return (
    <div style={{ marginTop: 12, border: '1px solid #d1fae5', borderRadius: 12, overflow: 'hidden' }}>
      <div
        style={{
          backgroundColor: '#f0fdf4',
          padding: '10px 14px',
          fontSize: 11,
          fontWeight: 800,
          color: '#16a34a',
          letterSpacing: '0.05em',
        }}
      >
        MONTAJ ÖLÇÜLERİ
      </div>
      <div
        style={{
          padding: '12px 14px',
          display: 'grid',
          gridTemplateColumns: '140px 1fr',
          gap: '6px 12px',
          fontSize: 13,
        }}
      >
        {row('Çerçeve Tipi', m.frameType)}
        {row('RPH (Sağ)', m.rph)}
        {row('LPH (Sol)', m.lph)}
        {row('Koridor', m.corridor)}
        {row('Sağ Çap', m.rightDia)}
        {row('Sol Çap', m.leftDia)}
        {row('Vertex', m.vertex)}
        {row('Pantoskopik', m.pantoscopic)}
        {row('Çerçeve Bombesi', m.frameBow)}
        {row('Engraving', m.engraving)}
        {(m.prismR1Val || m.prismL1Val) ? (
          <>
            <div style={{ color: '#6b7280', fontWeight: 600 }}>Prizma</div>
            <div>
              R: {String(m.prismR1Val ?? '—')}/{String(m.prismR1Aks ?? '—')}° · L:{' '}
              {String(m.prismL1Val ?? '—')}/{String(m.prismL1Aks ?? '—')}°
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detayTab, setDetayTab] = useState<'siparis' | 'recete' | 'islemler' | 'belgeler'>('siparis')

  const [sale, setSale] = useState<Sale | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)

  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidSaving, setVoidSaving] = useState(false)

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payType, setPayType] = useState<'CASH' | 'CARD' | 'HAVALE'>('CASH')
  const [payNote, setPayNote] = useState('')
  const [havaleBankName, setHavaleBankName] = useState('')
  const [banks, setBanks] = useState<Array<{ id: string; name: string }>>([])
  const [posDevicesByBankId, setPosDevicesByBankId] = useState<Map<string, Array<{ id: string; name: string }>>>(
    new Map(),
  )
  const [bankId, setBankId] = useState('')
  const [posDeviceId, setPosDeviceId] = useState('')
  const [installment, setInstallment] = useState(1)
  const [paySaving, setPaySaving] = useState(false)

  const [pdfLoading, setPdfLoading] = useState(false)
  const [resmiFaturaLoading, setResmiFaturaLoading] = useState(false)
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [belgeError, setBelgeError] = useState<string | null>(null)
  const [belgeInfo, setBelgeInfo] = useState<string | null>(null)
  const pdfRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await getSaleById(id)
      setSale(data)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Satış yüklenemedi')
      setSale(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (payType !== 'CARD') return
    apiClient
      .get('/admin/banks')
      .then((res) => {
        const data = res.data ?? []
        setBanks(data.map((b: any) => ({ id: b.id, name: b.name })))
        const map = new Map<string, Array<{ id: string; name: string }>>()
        for (const b of data) {
          map.set(
            b.id,
            (b.posDevices ?? []).map((p: any) => ({ id: p.id, name: p.name })),
          )
        }
        setPosDevicesByBankId(map)
      })
      .catch(() => {})
  }, [payType])

  const bankNameById = useMemo(() => new Map(banks.map((b) => [b.id, b.name])), [banks])

  const items = useMemo(
    () => (sale?.items ?? []).filter((i: any) => String(i.status).toUpperCase() !== 'VOID'),
    [sale?.items],
  )

  const openRemaining = useMemo(
    () => openAccountRemaining(sale?.payments ?? []),
    [sale?.payments],
  )

  const hasOpenAccount = useMemo(
    () => (sale?.payments ?? []).some((p: any) => p.paymentType === 'OPEN_ACCOUNT'),
    [sale?.payments],
  )

  const pdfItems = useMemo(
    () => items,
    [items],
  )

  const pdfPayments = sale?.payments ?? []
  const pdfNakit = pdfPayments.filter((p) => p.paymentType === 'CASH').reduce((s, p) => s + Number(p.netAmount), 0)
  const pdfKart = pdfPayments.filter((p) => p.paymentType === 'CARD').reduce((s, p) => s + Number(p.netAmount), 0)
  const pdfAcikHesap = pdfPayments
    .filter((p) => p.paymentType === 'OPEN_ACCOUNT')
    .reduce((s, p) => s + Number(p.netAmount), 0)
  const pdfToplam = Number(sale?.netTotal ?? 0)
  const pdfOdenen = pdfNakit + pdfKart + pdfAcikHesap
  const pdfKalan = pdfToplam - pdfOdenen
  const pdfPrimaryStatus = String(pdfItems[0]?.status ?? 'PENDING').toUpperCase()

  const receteKalemleri = useMemo(
    () =>
      items.filter(
        (it: any) => it.prescription || hasLensOrderMeasurement(it.lensOrderMeasurement),
      ),
    [items],
  )

  async function pdfIndir() {
    if (!pdfRef.current || !sale) return
    setPdfLoading(true)
    setBelgeError(null)
    try {
      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' })
      const W = 210
      const H = 297
      const imgH = (canvas.height * W) / canvas.width
      let pos = 0
      pdf.addImage(imgData, 'PNG', 0, pos, W, imgH)
      let remaining = imgH - H
      while (remaining > 0) {
        pos -= H
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, pos, W, imgH)
        remaining -= H
      }
      pdf.save(`satis-${sale.id.slice(-6)}.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  async function resmiFaturaIndir() {
    if (!sale || sale.eFaturaDurum !== 'GONDERILDI') return
    setResmiFaturaLoading(true)
    setBelgeError(null)
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
          setBelgeError(parsed.message ?? 'Resmi fatura PDF alınamadı')
        } catch {
          setBelgeError('Resmi fatura PDF alınamadı')
        }
      } else {
        setBelgeError(e?.response?.data?.message ?? 'Resmi fatura PDF alınamadı')
      }
    } finally {
      setResmiFaturaLoading(false)
    }
  }

  async function durumuYenile() {
    if (!sale) return
    setRefreshLoading(true)
    setBelgeError(null)
    setBelgeInfo(null)
    try {
      const res = await apiClient.post(`/efatura/satis-onay/${sale.id}`)
      if (res.data?.processing && res.data?.mesaj) {
        setBelgeInfo(String(res.data.mesaj))
      } else if (res.data?.hata && !res.data?.basarili) {
        setBelgeError(String(res.data.hata))
      }
      await load()
    } catch (e: any) {
      setBelgeError(e?.response?.data?.message ?? e?.response?.data?.hata ?? 'Satış durumu yenilenemedi')
    } finally {
      setRefreshLoading(false)
    }
  }

  async function updateAllItemStatus(status: string) {
    if (!sale?.id) return
    const targetItems =
      status === 'IN_LAB' ? items.filter((it: any) => isLensMeasurementSaleItem(it)) : items
    if (status === 'IN_LAB' && targetItems.length === 0) {
      setError('Laboratuvara gönderilecek cam/lens kalemi bulunamadı (çerçeve kalemleri hariç tutulur).')
      return
    }
    setStatusSaving(true)
    setError(null)
    try {
      await Promise.all(
        targetItems.map((it: any) =>
          apiClient.patch(`/sales/${sale.id}/items/${it.id}/status`, { status }),
        ),
      )
      setSuccess(
        status === 'IN_LAB'
          ? `${targetItems.length} cam/lens kalemi laboratuvara gönderildi.`
          : 'Kalem durumları güncellendi.',
      )
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Durum güncellenemedi')
    } finally {
      setStatusSaving(false)
    }
  }

  async function submitVoid() {
    if (!sale?.id || voidReason.trim().length < 5) {
      setError('İptal nedeni en az 5 karakter olmalı.')
      return
    }
    setVoidSaving(true)
    setError(null)
    try {
      await voidSale(sale.id, { voidReason: voidReason.trim() })
      navigate('/sales')
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Satış iptal edilemedi')
    } finally {
      setVoidSaving(false)
    }
  }

  async function submitOpenPayment() {
    if (!sale?.id || !sale?.customerId) return
    const n = Number(String(payAmount).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setError('Tutar geçerli olmalı.')
      return
    }
    if (payType === 'CARD' && (!bankId || !posDeviceId)) {
      setError('Banka ve POS seçin.')
      return
    }
    setPaySaving(true)
    setError(null)
    try {
      await apiClient.post('/open-account/payment', {
        customerId: sale.customerId,
        saleId: sale.id,
        amount: n,
        paymentType: payType === 'HAVALE' ? 'BANK_TRANSFER' : payType,
        note:
          payType === 'HAVALE' && havaleBankName.trim()
            ? `Havale bankası: ${havaleBankName.trim()}${payNote ? ` — ${payNote}` : ''}`
            : payNote?.trim() || null,
        bankId: payType === 'CARD' ? bankId : undefined,
        posDeviceId: payType === 'CARD' ? posDeviceId : undefined,
        installment: payType === 'CARD' ? installment : undefined,
      })
      setPayModalOpen(false)
      setSuccess('Açık hesap ödemesi kaydedildi.')
      await load()
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Ödeme kaydedilemedi')
    } finally {
      setPaySaving(false)
    }
  }

  const posOptions = bankId ? posDevicesByBankId.get(bankId) ?? [] : []
  const canVoid = sale?.status === 'PAID' || sale?.status === 'DRAFT'

  if (loading) {
    return (
      <div style={{ ...pageWrap, color: '#6b7280' }}>Yükleniyor...</div>
    )
  }

  if (!sale) {
    return (
      <div style={pageWrap}>
        <div style={{ color: danger }}>{error ?? 'Satış bulunamadı.'}</div>
        <button type="button" onClick={() => navigate('/sales')} style={{ marginTop: 12, fontWeight: 800 }}>
          ← Geri
        </button>
      </div>
    )
  }

  return (
    <div style={pageWrap}>
      <div
        style={{
          background: 'linear-gradient(135deg, #8B0000 0%, #5c0000 100%)',
          padding: 32,
          borderRadius: '0 0 24px 24px',
          margin: '-24px -24px 0',
          color: '#fff',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/sales')}
          style={{
            border: 'none',
            background: 'none',
            color: 'rgba(255,255,255,0.85)',
            fontWeight: 800,
            cursor: 'pointer',
            padding: 0,
            marginBottom: 16,
            fontSize: 14,
          }}
        >
          ← Geri
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontWeight: 900,
                fontSize: 28,
                letterSpacing: '0.04em',
              }}
            >
              Satış {sale.referansNo ? sale.referansNo : `#${String(sale.id).slice(0, 8)}`}
            </div>
            <div style={{ marginTop: 10, fontSize: '1.4rem', fontWeight: 800, color: '#FFD700' }}>
              {sale.customer?.name ?? '—'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>
              {sale.customer?.phone ?? '—'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
              {fmtDate(sale.createdAt)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
            {sale.referansNo ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.6)',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.95)',
                  fontFamily: "'Courier New', Courier, monospace",
                }}
              >
                {sale.referansNo}
              </span>
            ) : null}
            {sale.odooSaleOrderId ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.6)',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.95)',
                }}
              >
                Odoo #{sale.odooSaleOrderId}
              </span>
            ) : null}
            {headerSaleStatusBadge(sale.status)}
          </div>
        </div>
      </div>

      {success ? (
        <div style={{ ...cardStyle, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#166534' }}>
          {success}
        </div>
      ) : null}
      {error ? <div style={{ color: danger, fontSize: 13, fontWeight: 600 }}>{error}</div> : null}

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
        {(['siparis', 'recete', 'belgeler', 'islemler'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setDetayTab(t)}
            style={{
              padding: '10px 18px', fontSize: 13, border: 'none', cursor: 'pointer',
              borderBottom: detayTab === t ? '2px solid #C8102E' : '2px solid transparent',
              background: 'transparent',
              color: detayTab === t ? '#C8102E' : '#6b7280',
              fontWeight: detayTab === t ? 800 : 500,
            }}
          >
            {t === 'siparis'
              ? '🧾 Sipariş Detayı'
              : t === 'recete'
                ? '👁 Reçete & Ölçümler'
                : t === 'belgeler'
                  ? '📋 Belgeler'
                  : '⚙️ İşlemler'}
          </button>
        ))}
      </div>

      {detayTab === 'siparis' && <>
      <div style={{ ...cardStyle, borderLeft: '4px solid #8B0000' }}>
        <div style={{ fontWeight: 900, marginBottom: 14, fontSize: 16 }}>Kalemler</div>
        <div>
          {items.map((it: any, idx: number) => (
            <div
              key={it.id}
              style={{
                padding: '14px 4px',
                borderBottom: idx < items.length - 1 ? '1px solid #e5e7eb' : 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fff5f5'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 800, flex: 1, fontSize: 16 }}>
                  {it.name ?? it.odooProductName ?? it.product?.name ?? 'Ürün'}
                </div>
                {itemStatusBadge(it.status)}
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 12,
                  fontSize: 11,
                }}
              >
                <div>
                  <div style={{ color: '#9ca3af', fontWeight: 700, marginBottom: 2 }}>Adet</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{it.qty}</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontWeight: 700, marginBottom: 2 }}>Fiyat</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{money(it.unitPrice)}</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontWeight: 700, marginBottom: 2 }}>İndirim</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{money(it.discount)}</div>
                </div>
                <div>
                  <div style={{ color: '#9ca3af', fontWeight: 700, marginBottom: 2 }}>KDV</div>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{money(it.taxAmount)}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', fontWeight: 700 }}>
                Satır toplamı:{' '}
                <span style={{ color: '#111', fontWeight: 900, fontSize: 14 }}>{money(it.lineTotal)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, backgroundColor: '#fafafa' }}>
        <div style={{ fontWeight: 900, marginBottom: 14, fontSize: 16 }}>Finansal Özet</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Ara toplam
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.grossTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              İndirim
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.discountTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              KDV
            </div>
            <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.taxTotal)}</div>
          </div>
          {Number(sale.sgkAmount) > 0 ? (
            <div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                SGK katkısı
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.sgkAmount)}</div>
            </div>
          ) : null}
          {Number(sale.prescriptionAmount) > 0 ? (
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: '#9ca3af',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Vakıf / reçete katkısı
              </div>
              <div style={{ fontWeight: 800, fontSize: 18, marginTop: 4 }}>{money(sale.prescriptionAmount)}</div>
            </div>
          ) : null}
          <div style={{ gridColumn: '1 / -1', paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Genel Toplam
            </div>
            <div style={{ fontWeight: 900, fontSize: 28, marginTop: 4, color: danger }}>{money(sale.netTotal)}</div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 14, fontSize: 16 }}>Ödemeler</div>
        {(sale.payments ?? []).length === 0 ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Ödeme kaydı yok.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {(sale.payments ?? []).map((p: any, idx: number) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: idx < (sale.payments ?? []).length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: paymentDotColor(p.paymentType),
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    {paymentTypeBadge(p.paymentType)}
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{money(p.grossAmount)}</div>
                  </div>
                  <div style={{ color: '#9ca3af', marginTop: 4, fontSize: 12 }}>{fmtDate(p.createdAt)}</div>
                  {p.paymentType === 'CARD' ? (
                    <div style={{ marginTop: 6, color: '#6b7280', fontSize: 12 }}>
                      {p.bankId ? `Banka: ${bankNameById.get(p.bankId) ?? p.bankId}` : null}
                      {p.installment ? ` · Taksit: ${p.installment}` : null}
                      {p.commissionAmount ? ` · Komisyon: ${money(p.commissionAmount)}` : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>}

      {detayTab === 'recete' && <>
        <div style={{ ...cardStyle }}>
          <div style={{ fontWeight: 900, marginBottom: 16, fontSize: 16 }}>Reçete & Ölçümler</div>
          {receteKalemleri.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 14, padding: '16px 0' }}>Bu satışta reçete veya montaj ölçüsü kaydı yok.</div>
          ) : (
            receteKalemleri.map((it: any) => {
              const p = it.prescription
              return (
                <div key={it.id} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: '#1a1a2e' }}>{it.name}</div>
                  {p ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                        {p.prescriptionType && <div><span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>Reçete Tipi</span><div style={{ fontWeight: 700 }}>{p.prescriptionType}</div></div>}
                        {p.doctorName && <div><span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>Doktor</span><div style={{ fontWeight: 700 }}>{p.doctorName}</div></div>}
                        {p.prescriptionDate && <div><span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>Reçete Tarihi</span><div style={{ fontWeight: 700 }}>{fmtDate(p.prescriptionDate)}</div></div>}
                        {p.eReceteCode && <div><span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700 }}>e-Reçete Kodu</span><div style={{ fontWeight: 700 }}>{p.eReceteCode}</div></div>}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f9fafb' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11 }}></th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 11 }}>SPH</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 11 }}>CYL</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 11 }}>AKS</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 11 }}>ADD</th>
                            <th style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#6b7280', fontSize: 11 }}>PD</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#374151' }}>Sağ (R)</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.r_sph ?? '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.r_cyl ?? '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.r_aks ?? '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.r_add ?? '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.r_pd ?? '—'}</td>
                          </tr>
                          <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#374151' }}>Sol (L)</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.l_sph ?? '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.l_cyl ?? '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.l_aks ?? '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.l_add ?? '—'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{p.l_pd ?? '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </>
                  ) : null}
                  {it.frames && it.frames.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, marginBottom: 6 }}>ÇERÇEVE ÖLÇÜLERİ</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                        {it.frames.map((f: any) => (
                          <div key={f.id}>
                            {f.brand && <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Marka</span><div style={{ fontWeight: 700, fontSize: 13 }}>{f.brand}</div></div>}
                            {f.model && <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Model</span><div style={{ fontWeight: 700, fontSize: 13 }}>{f.model}</div></div>}
                            {f.h && <div><span style={{ fontSize: 11, color: '#9ca3af' }}>H</span><div style={{ fontWeight: 700, fontSize: 13 }}>{f.h}</div></div>}
                            {f.cap && <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Cap</span><div style={{ fontWeight: 700, fontSize: 13 }}>{f.cap}</div></div>}
                            {f.vertex && <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Vertex</span><div style={{ fontWeight: 700, fontSize: 13 }}>{f.vertex}</div></div>}
                            {f.pantos && <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Pantos</span><div style={{ fontWeight: 700, fontSize: 13 }}>{f.pantos}</div></div>}
                            {f.frameAngle && <div><span style={{ fontSize: 11, color: '#9ca3af' }}>Çerçeve Açısı</span><div style={{ fontWeight: 700, fontSize: 13 }}>{f.frameAngle}</div></div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {hasLensOrderMeasurement(it.lensOrderMeasurement) ? (
                    <LensOrderMeasurementGrid m={it.lensOrderMeasurement} />
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </>}

      {detayTab === 'belgeler' && sale ? (
        <>
          <div style={cardStyle}>
            <div style={{ fontWeight: 900, marginBottom: 8, fontSize: 16 }}>Belgeler</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              Satış belgesi ve resmi e-fatura çıktıları.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
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
                  padding: '8px 14px',
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
            {belgeError ? (
              <div style={{ color: danger, fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{belgeError}</div>
            ) : null}
            {belgeInfo ? (
              <div style={{ color: '#92400e', fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{belgeInfo}</div>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button
                type="button"
                onClick={() => void pdfIndir()}
                disabled={pdfLoading}
                style={{
                  padding: '12px 20px',
                  borderRadius: 10,
                  border: '1px solid #374151',
                  backgroundColor: 'white',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: pdfLoading ? 'wait' : 'pointer',
                }}
              >
                {pdfLoading ? 'Hazırlanıyor...' : '📄 Satış Belgesi'}
              </button>
              {sale.eFaturaDurum === 'GONDERILDI' ? (
                <button
                  type="button"
                  onClick={() => void resmiFaturaIndir()}
                  disabled={resmiFaturaLoading}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 10,
                    border: '1px solid #1a1a2e',
                    backgroundColor: 'white',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: resmiFaturaLoading ? 'wait' : 'pointer',
                  }}
                >
                  {resmiFaturaLoading ? 'Hazırlanıyor...' : '🧾 Resmi Fatura'}
                </button>
              ) : (
                <div style={{ fontSize: 13, color: '#9ca3af', alignSelf: 'center' }}>
                  Fatura henüz gönderilmedi
                  {sale.eFaturaDurum ? ` (${sale.eFaturaDurum})` : ''}
                </div>
              )}
            </div>
          </div>

          <div style={{ position: 'absolute', left: -9999, top: 0 }}>
            <div ref={pdfRef} style={{ width: 794, padding: 40, backgroundColor: 'white', fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#111' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>Güven Optik</div>
                  <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>1959 · Optik Mağaza POS</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Satış Belgesi</div>
                  <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>{sale.id.slice(-12)}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{new Date(sale.createdAt ?? '').toLocaleDateString('tr-TR')}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Müşteri</div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{sale.customer?.name ?? '—'}</div>
                  <div style={{ color: '#6b7280' }}>{sale.customer?.phone}</div>
                </div>
                <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Durum</div>
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      borderRadius: 4,
                      backgroundColor: PDF_DURUM_RENK[pdfPrimaryStatus]?.bg ?? '#f3f4f6',
                      color: PDF_DURUM_RENK[pdfPrimaryStatus]?.color ?? '#374151',
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {PDF_DURUM_LABEL[pdfPrimaryStatus] ?? pdfPrimaryStatus}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Ürünler</div>
                {pdfItems.map((it: any) => {
                  const durum = String(it.status).toUpperCase()
                  const urunAdi =
                    it.odooProductName && !it.odooProductName.includes('PLACEHOLDER')
                      ? it.odooProductName
                      : it.product?.name && !it.product.name.includes('PLACEHOLDER')
                        ? it.product.name
                        : it.name ?? 'Ürün'
                  const rx = it.prescription
                  return (
                    <div key={it.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 12px', backgroundColor: '#f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700 }}>{urunAdi}</span>
                            <span
                              style={{
                                fontSize: 10,
                                padding: '2px 8px',
                                borderRadius: 4,
                                backgroundColor: PDF_DURUM_RENK[durum]?.bg ?? '#f3f4f6',
                                color: PDF_DURUM_RENK[durum]?.color ?? '#374151',
                                fontWeight: 600,
                              }}
                            >
                              {PDF_DURUM_LABEL[durum] ?? durum}
                            </span>
                          </div>
                          {it.linkType ? (
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                              {it.linkType === 'CUSTOMER_FRAME'
                                ? 'Kendi çerçevesi'
                                : it.linkType === 'FRAME_LENS'
                                  ? 'Çerçeveye bağlı cam'
                                  : ''}
                            </div>
                          ) : null}
                          {rx ? (
                            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: '2px 12px', fontSize: 11 }}>
                              <span style={{ color: '#6b7280' }}>Sağ:</span>
                              <span>
                                SPH {rx.r_sph ?? '—'} / CYL {rx.r_cyl ?? '—'} / AKS {rx.r_aks ?? '—'} / PD {rx.r_pd ?? '—'}
                              </span>
                              <span style={{ color: '#6b7280' }}>Sol:</span>
                              <span>
                                SPH {rx.l_sph ?? '—'} / CYL {rx.l_cyl ?? '—'} / AKS {rx.l_aks ?? '—'} / PD {rx.l_pd ?? '—'}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700 }}>{pdfPara(Number(it.lineTotal))}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            {it.qty} adet · {pdfPara(Number(it.unitPrice))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Ödeme Detayı</div>
                  <table style={{ width: '100%', fontSize: 12 }}>
                    <tbody>
                      {pdfNakit > 0 ? (
                        <tr>
                          <td style={{ color: '#6b7280', paddingBottom: 4 }}>Nakit</td>
                          <td style={{ textAlign: 'right' }}>{pdfPara(pdfNakit)}</td>
                        </tr>
                      ) : null}
                      {pdfKart > 0 ? (
                        <tr>
                          <td style={{ color: '#6b7280', paddingBottom: 4 }}>Kredi Kartı</td>
                          <td style={{ textAlign: 'right' }}>{pdfPara(pdfKart)}</td>
                        </tr>
                      ) : null}
                      {pdfAcikHesap > 0 ? (
                        <tr>
                          <td style={{ color: '#6b7280', paddingBottom: 4 }}>Açık Hesap</td>
                          <td style={{ textAlign: 'right' }}>{pdfPara(pdfAcikHesap)}</td>
                        </tr>
                      ) : null}
                      <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ paddingTop: 4, color: '#6b7280' }}>Ödenen</td>
                        <td style={{ textAlign: 'right', paddingTop: 4 }}>{pdfPara(pdfOdenen)}</td>
                      </tr>
                      <tr>
                        <td style={{ color: pdfKalan > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>Kalan</td>
                        <td style={{ textAlign: 'right', color: pdfKalan > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                          {pdfPara(pdfKalan)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Özet</div>
                  <table style={{ width: '100%', fontSize: 12 }}>
                    <tbody>
                      <tr>
                        <td style={{ color: '#6b7280', paddingBottom: 4 }}>Ara toplam</td>
                        <td style={{ textAlign: 'right' }}>{pdfPara(Number(sale.grossTotal))}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#6b7280', paddingBottom: 4 }}>KDV (dahil)</td>
                        <td style={{ textAlign: 'right' }}>{pdfPara(Number(sale.taxTotal))}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#6b7280', paddingBottom: 4 }}>İndirim</td>
                        <td style={{ textAlign: 'right' }}>
                          {Number(sale.discountTotal) > 0 ? pdfPara(Number(sale.discountTotal)) : '—'}
                        </td>
                      </tr>
                      <tr style={{ borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ paddingTop: 4, fontWeight: 700 }}>Genel toplam</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 4 }}>{pdfPara(pdfToplam)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, textAlign: 'center', fontSize: 10, color: '#9ca3af' }}>
                Güven Optik POS · {new Date().toLocaleString('tr-TR')} · Bu belge satış kaydının resmi çıktısıdır.
              </div>
            </div>
          </div>
        </>
      ) : null}

      {detayTab === 'islemler' && <>
      <div style={cardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 12, fontSize: 16 }}>Durum Değiştir</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
          Mevcut durum tüm kalemlere uygulanır.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'Laboratuvara Gönderildi', status: 'IN_LAB' },
            { label: 'Cam Bekleniyor', status: 'ORDERED' },
            { label: 'Hazır', status: 'READY' },
            { label: 'Teslim Edildi', status: 'DELIVERED' },
          ].map((btn) => {
            const st = STATUS_BTN_STYLES[btn.status]
            return (
              <button
                key={btn.status}
                type="button"
                disabled={statusSaving}
                onClick={() => void updateAllItemStatus(btn.status)}
                onMouseEnter={(e) => {
                  if (statusSaving) return
                  e.currentTarget.style.backgroundColor = st.hoverBg
                  e.currentTarget.style.color = st.hoverColor
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = st.color
                }}
                style={{
                  border: `2px solid ${st.border}`,
                  backgroundColor: 'transparent',
                  color: st.color,
                  borderRadius: 999,
                  padding: '10px 18px',
                  cursor: statusSaving ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  fontSize: 13,
                  opacity: statusSaving ? 0.6 : 1,
                  transition: 'background-color 0.15s, color 0.15s',
                }}
              >
                {btn.label}
              </button>
            )
          })}
        </div>
      </div>

      {canVoid ? (
        <div style={{ ...cardStyle, backgroundColor: '#fff5f5', borderColor: '#fecaca' }}>
          <div style={{ fontWeight: 900, marginBottom: 10, fontSize: 16, color: danger }}>İptal</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14, fontSize: 13, color: '#7f1d1d' }}>
            <span style={{ fontSize: 18, lineHeight: 1.2 }}>⚠️</span>
            <span>
              Satışı iptal etmek geri alınamaz. İptal nedeni kayıt altına alınır ve yetkili onayı gerektirir.
            </span>
          </div>
          {!voidOpen ? (
            <button
              type="button"
              onClick={() => setVoidOpen(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#8B0000'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = danger
              }}
              style={{
                backgroundColor: danger,
                color: 'white',
                border: 'none',
                borderRadius: 999,
                padding: '12px 20px',
                fontWeight: 900,
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
            >
              Satışı İptal Et
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="İptal nedeni (min. 5 karakter)"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #fecaca',
                  borderRadius: 12,
                  outline: 'none',
                  fontSize: 14,
                  backgroundColor: '#fff',
                }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setVoidOpen(false)}
                  style={{
                    flex: 1,
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#fff',
                    borderRadius: 999,
                    padding: '10px 14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={voidSaving}
                  onClick={() => void submitVoid()}
                  onMouseEnter={(e) => {
                    if (!voidSaving) e.currentTarget.style.backgroundColor = '#8B0000'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = danger
                  }}
                  style={{
                    flex: 1,
                    border: 'none',
                    backgroundColor: danger,
                    color: 'white',
                    borderRadius: 999,
                    padding: '10px 14px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    opacity: voidSaving ? 0.7 : 1,
                    transition: 'background-color 0.15s',
                  }}
                >
                  İptali Onayla
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {hasOpenAccount && openRemaining > 0 ? (
        <div style={cardStyle}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Açık Hesap Ödeme</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: danger, marginBottom: 12 }}>
            Kalan: {money(openRemaining)}
          </div>
          <button
            type="button"
            onClick={() => {
              setPayAmount(String(openRemaining))
              setPayModalOpen(true)
            }}
            style={{
              backgroundColor: '#16a34a',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              padding: '10px 14px',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Ödeme Gir
          </button>
        </div>
      ) : null}
      </>}

      {payModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 50,
          }}
        >
          <div style={{ ...cardStyle, width: '100%', maxWidth: 560 }}>
            <div style={{ fontWeight: 900, marginBottom: 12 }}>Açık Hesap Ödemesi</div>
            <div style={{ marginBottom: 10, color: danger, fontWeight: 900 }}>
              Kalan: {money(openRemaining)}
            </div>
            <label>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>TUTAR</div>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  outline: 'none',
                }}
              />
            </label>
            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(['CASH', 'CARD', 'HAVALE'] as const).map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                  <input type="radio" checked={payType === t} onChange={() => setPayType(t)} />
                  {t === 'CASH' ? 'Nakit' : t === 'CARD' ? 'Kredi Kartı' : 'Havale'}
                </label>
              ))}
            </div>
            {payType === 'CARD' ? (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <select
                  value={bankId}
                  onChange={(e) => {
                    setBankId(e.target.value)
                    setPosDeviceId('')
                  }}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                >
                  <option value="">Banka</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <select
                  value={posDeviceId}
                  onChange={(e) => setPosDeviceId(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                >
                  <option value="">POS</option>
                  {posOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <select
                  value={installment}
                  onChange={(e) => setInstallment(Number(e.target.value))}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
                >
                  {[1, 3, 6, 9, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} taksit
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {payType === 'HAVALE' ? (
              <input
                value={havaleBankName}
                onChange={(e) => setHavaleBankName(e.target.value)}
                placeholder="Havale bankası"
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                }}
              />
            ) : null}
            <input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Not (opsiyonel)"
              style={{
                width: '100%',
                marginTop: 10,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
              }}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                style={{
                  flex: 1,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  borderRadius: 10,
                  padding: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={paySaving}
                onClick={() => void submitOpenPayment()}
                style={{
                  flex: 1,
                  border: 'none',
                  backgroundColor: primary,
                  color: 'white',
                  borderRadius: 10,
                  padding: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  opacity: paySaving ? 0.7 : 1,
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
