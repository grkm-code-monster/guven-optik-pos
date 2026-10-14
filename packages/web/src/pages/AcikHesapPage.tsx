import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { apiClient } from '../api/client'
import { searchCustomers, createCustomer } from '../api/customers.api'

type SummaryRow = {
  customer: { id: string; name: string; phone: string }
  totalDebt: number
  paidAmount: number
  remainingDebt: number
}

type SaleRow = {
  saleId: string
  createdAt: string
  itemsCount: number
  netTotal: number
  openAccountTotal: number
  paidTotal: number
  remaining: number
}

type CustomerDetail = {
  customer: { id: string; name: string; phone: string }
  totalDebt: number
  paidAmount: number
  remainingDebt: number
  sales: SaleRow[]
}

const cardStyle: CSSProperties = {
  backgroundColor: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 16,
}

const danger = '#c0392b'
const primary = '#C8102E'

function money(v?: number | string | null) {
  const n = Number(v ?? 0)
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
    Number.isFinite(n) ? n : 0,
  )
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('tr-TR')
  } catch {
    return iso
  }
}

type ManuelTahsilatRow = {
  id: string
  customerName: string
  amount: string
  paymentTypeLabel: string
  aciklama: string | null
  createdAt: string
}

export default function AcikHesapPage() {
  const [sekme, setSekme] = useState<'acik-hesap' | 'manuel-tahsilat'>('acik-hesap')

  // --- Manuel Tahsilat sekmesi (14.10.2026): sistemde hiç satış kaydı olmayan,
  // borcu sadece kağıt üzerinde tutulan müşteriler için serbest tahsilat girişi.
  const [mtMusteriQ, setMtMusteriQ] = useState('')
  const [mtMusteriSonuc, setMtMusteriSonuc] = useState<any[]>([])
  const [mtMusteriAraniyor, setMtMusteriAranıyor] = useState(false)
  const [mtSeciliMusteri, setMtSeciliMusteri] = useState<{ id: string; name: string; phone: string } | null>(null)
  const [mtYeniMusteriAcik, setMtYeniMusteriAcik] = useState(false)
  const [mtYeniAd, setMtYeniAd] = useState('')
  const [mtYeniTelefon, setMtYeniTelefon] = useState('')
  const [mtYeniTc, setMtYeniTc] = useState('')
  const [mtYeniKaydediliyor, setMtYeniKaydediliyor] = useState(false)
  const [mtTutar, setMtTutar] = useState('')
  const [mtOdemeTuru, setMtOdemeTuru] = useState<'CASH' | 'CARD' | 'TRANSFER'>('CASH')
  const [mtAciklama, setMtAciklama] = useState('')
  const [mtKaydediliyor, setMtKaydediliyor] = useState(false)
  const [mtHata, setMtHata] = useState<string | null>(null)
  const [mtBasari, setMtBasari] = useState<string | null>(null)
  const [mtListe, setMtListe] = useState<ManuelTahsilatRow[]>([])
  const [mtListeYukleniyor, setMtListeYukleniyor] = useState(false)

  async function mtListeYukle() {
    setMtListeYukleniyor(true)
    try {
      const res = await apiClient.get('/open-account/manuel-tahsilat')
      setMtListe(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setMtListe([])
    } finally {
      setMtListeYukleniyor(false)
    }
  }

  useEffect(() => {
    if (sekme === 'manuel-tahsilat') void mtListeYukle()
  }, [sekme])

  useEffect(() => {
    const q = mtMusteriQ.trim()
    if (q.length < 3) {
      setMtMusteriSonuc([])
      return
    }
    const t = setTimeout(() => {
      setMtMusteriAranıyor(true)
      searchCustomers(q)
        .then((rows) => setMtMusteriSonuc(Array.isArray(rows) ? rows : []))
        .catch(() => setMtMusteriSonuc([]))
        .finally(() => setMtMusteriAranıyor(false))
    }, 300)
    return () => clearTimeout(t)
  }, [mtMusteriQ])

  function mtAkisiSifirla() {
    setMtMusteriQ('')
    setMtMusteriSonuc([])
    setMtSeciliMusteri(null)
    setMtYeniMusteriAcik(false)
    setMtYeniAd('')
    setMtYeniTelefon('')
    setMtYeniTc('')
    setMtTutar('')
    setMtOdemeTuru('CASH')
    setMtAciklama('')
    setMtHata(null)
    setMtBasari(null)
  }

  async function mtYeniMusteriKaydet() {
    if (!mtYeniAd.trim() || !mtYeniTelefon.trim()) {
      setMtHata('Ad soyad ve telefon zorunlu')
      return
    }
    setMtYeniKaydediliyor(true)
    setMtHata(null)
    try {
      const musteri = await createCustomer({
        name: mtYeniAd.trim(),
        phone: mtYeniTelefon.trim(),
        identityNo: mtYeniTc.trim() || undefined,
      })
      setMtSeciliMusteri({ id: musteri.id, name: musteri.name, phone: musteri.phone })
      setMtYeniMusteriAcik(false)
      setMtMusteriQ('')
      setMtMusteriSonuc([])
    } catch (e: any) {
      setMtHata(e?.response?.data?.message ?? 'Müşteri kaydedilemedi')
    } finally {
      setMtYeniKaydediliyor(false)
    }
  }

  async function mtTahsilatKaydet() {
    if (!mtSeciliMusteri) {
      setMtHata('Önce müşteri seçin veya ekleyin')
      return
    }
    const n = Number(String(mtTutar).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setMtHata('Tutar geçerli olmalı')
      return
    }
    setMtKaydediliyor(true)
    setMtHata(null)
    setMtBasari(null)
    try {
      const res = await apiClient.post('/open-account/manuel-tahsilat', {
        customerId: mtSeciliMusteri.id,
        tutar: n,
        odemeTuru: mtOdemeTuru,
        aciklama: mtAciklama.trim() || null,
      })
      const uyari = res.data?.cashMovementUyari
      setMtBasari(uyari ? `Tahsilat kaydedildi. ${uyari}` : 'Tahsilat kaydedildi ve kasa formuna işlendi.')
      setMtSeciliMusteri(null)
      setMtTutar('')
      setMtOdemeTuru('CASH')
      setMtAciklama('')
      await mtListeYukle()
    } catch (e: any) {
      setMtHata(e?.response?.data?.error ?? 'Tahsilat kaydedilemedi')
    } finally {
      setMtKaydediliyor(false)
    }
  }

  const [summary, setSummary] = useState<SummaryRow[]>([])
  const [summaryLoading, setSummaryLoading] = useState(true)

  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [modalSale, setModalSale] = useState<SaleRow | null>(null)

  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState<'CASH' | 'CARD' | 'HAVALE'>('CASH')
  const [note, setNote] = useState('')
  const [havaleBankName, setHavaleBankName] = useState('')

  const [banks, setBanks] = useState<Array<{ id: string; name: string }>>([])
  const [posDevicesByBankId, setPosDevicesByBankId] = useState<Map<string, Array<{ id: string; name: string }>>>(
    new Map(),
  )
  const [bankId, setBankId] = useState('')
  const [posDeviceId, setPosDeviceId] = useState('')
  const [installment, setInstallment] = useState(1)

  const [saving, setSaving] = useState(false)

  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [bulkToplam, setBulkToplam] = useState('')
  const [bulkDagitim, setBulkDagitim] = useState<Record<string, string>>({})
  const [bulkPaymentType, setBulkPaymentType] = useState<'CASH' | 'CARD' | 'HAVALE'>('CASH')
  const [bulkNote, setBulkNote] = useState('')
  const [bulkHavaleBankName, setBulkHavaleBankName] = useState('')
  const [bulkBankId, setBulkBankId] = useState('')
  const [bulkPosDeviceId, setBulkPosDeviceId] = useState('')
  const [bulkInstallment, setBulkInstallment] = useState(1)
  const [bulkLoadingFifo, setBulkLoadingFifo] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)

  const totals = useMemo(() => {
    const customerCount = summary.length
    const totalRemaining = summary.reduce((acc, r) => acc + Number(r.remainingDebt || 0), 0)
    return { customerCount, totalRemaining }
  }, [summary])

  async function loadSummary() {
    setSummaryLoading(true)
    try {
      const res = await apiClient.get('/open-account')
      const list = res.data?.data ?? []
      setSummary(Array.isArray(list) ? list : [])
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Özet alınamadı')
      setSummary([])
    } finally {
      setSummaryLoading(false)
    }
  }

  async function loadDetail(customerId: string) {
    setDetailLoading(true)
    setError(null)
    try {
      const res = await apiClient.get(`/open-account/customer/${customerId}`)
      setDetail(res.data?.data ?? null)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Müşteri detayı alınamadı')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    void loadSummary()
  }, [])

  useEffect(() => {
    const q = searchQ.trim()
    if (q.length < 3) {
      setSearchResults([])
      return
    }
    const t = setTimeout(() => {
      setSearchLoading(true)
      searchCustomers(q)
        .then((rows) => setSearchResults(Array.isArray(rows) ? rows : []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [searchQ])

  useEffect(() => {
    if (!selectedCustomerId) {
      setDetail(null)
      return
    }
    void loadDetail(selectedCustomerId)
  }, [selectedCustomerId])

  useEffect(() => {
    if (paymentType !== 'CARD' && bulkPaymentType !== 'CARD') return
    // Düzeltme (23.09.2026): '/admin/banks' sadece ADMIN rolüne (veya
    // TANIMLAMALAR ek yetkisine) açık — STORE_MANAGER gibi diğer roller bu
    // isteği alıp sessizce (.catch boş) reddediliyordu, bu yüzden Açık Hesap
    // ödeme ekranında banka listesi hiç gelmiyordu. Satış akışındaki
    // PaymentStep.tsx ile AYNI, herkese açık '/sales/payment-banks' ucunu
    // kullanıyoruz (zaten aktif banka/POS'ları filtreleyerek dönüyor).
    apiClient
      .get('/sales/payment-banks')
      .then((res) => {
        const data = res.data?.data ?? []
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
  }, [paymentType, bulkPaymentType])

  async function loadFifoOneri(customerId: string, tutar: number) {
    setBulkLoadingFifo(true)
    try {
      const res = await apiClient.get(`/open-account/customer/${customerId}/fifo-oneri`, {
        params: { tutar },
      })
      const dagitim: Array<{ saleId: string; tutar: number }> = res.data?.data?.dagitim ?? []
      const next: Record<string, string> = {}
      for (const s of detail?.sales ?? []) {
        next[s.saleId] = '0'
      }
      for (const row of dagitim) {
        next[row.saleId] = String(row.tutar)
      }
      setBulkDagitim(next)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'FIFO önerisi alınamadı')
    } finally {
      setBulkLoadingFifo(false)
    }
  }

  function openBulkPaymentModal() {
    if (!detail || !selectedCustomerId) return
    setBulkToplam(String(detail.remainingDebt))
    const init: Record<string, string> = {}
    for (const s of detail.sales) init[s.saleId] = '0'
    setBulkDagitim(init)
    setBulkPaymentType('CASH')
    setBulkNote('')
    setBulkHavaleBankName('')
    setBulkBankId('')
    setBulkPosDeviceId('')
    setBulkInstallment(1)
    setBulkModalOpen(true)
    void loadFifoOneri(selectedCustomerId, detail.remainingDebt)
  }

  useEffect(() => {
    if (!bulkModalOpen || !selectedCustomerId) return
    const n = Number(String(bulkToplam).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return
    const t = setTimeout(() => {
      void loadFifoOneri(selectedCustomerId, n)
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkToplam, bulkModalOpen, selectedCustomerId])

  const bulkDagitimToplam = useMemo(() => {
    return Object.values(bulkDagitim).reduce((acc, v) => {
      const n = Number(String(v).replace(',', '.'))
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)
  }, [bulkDagitim])

  const bulkToplamNum = useMemo(() => {
    const n = Number(String(bulkToplam).replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }, [bulkToplam])

  const bulkTotalsMatch = Math.abs(bulkDagitimToplam - bulkToplamNum) <= 0.01 && bulkToplamNum > 0

  async function submitBulkPayment() {
    if (!selectedCustomerId || !detail) return
    if (!bulkTotalsMatch) {
      setError('Dağıtım toplamı girilen tutarla eşleşmiyor.')
      return
    }
    if (bulkPaymentType === 'CARD' && (!bulkBankId || !bulkPosDeviceId)) {
      setError('Banka ve POS seçin.')
      return
    }

    const dagitim = Object.entries(bulkDagitim)
      .map(([saleId, tutarStr]) => ({
        saleId,
        tutar: Number(String(tutarStr).replace(',', '.')),
      }))
      .filter((row) => row.tutar > 0)

    if (dagitim.length === 0) {
      setError('En az bir satışa tutar girin.')
      return
    }

    setBulkSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const body: Record<string, unknown> = {
        customerId: selectedCustomerId,
        toplamTutar: bulkToplamNum,
        paymentType: bulkPaymentType === 'HAVALE' ? 'BANK_TRANSFER' : bulkPaymentType,
        dagitim,
        note:
          bulkPaymentType === 'HAVALE' && bulkHavaleBankName.trim()
            ? `Havale bankası: ${bulkHavaleBankName.trim()}${bulkNote ? ` — ${bulkNote}` : ''}`
            : bulkNote?.trim() || null,
      }
      if (bulkPaymentType === 'CARD') {
        body.bankId = bulkBankId
        body.posDeviceId = bulkPosDeviceId
        body.installment = bulkInstallment
      }

      const res = await apiClient.post('/open-account/payment-toplu', body)
      const odooErrors: Array<{ saleId: string; error: string }> = res.data?.data?.odooErrors ?? []
      setBulkModalOpen(false)
      if (odooErrors.length > 0) {
        setSuccess(
          `Ödemeler kaydedildi; ${odooErrors.length} satışta Odoo hatası: ${odooErrors.map((e) => e.error).join('; ')}`,
        )
      } else {
        setSuccess('Toplu ödeme kaydedildi.')
      }
      await loadSummary()
      await loadDetail(selectedCustomerId)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Toplu ödeme kaydedilemedi')
    } finally {
      setBulkSaving(false)
    }
  }

  function selectCustomer(c: { id: string; name: string; phone: string }) {
    setSelectedCustomerId(c.id)
    setSearchQ('')
    setSearchResults([])
    setSuccess(null)
  }

  function openPaymentModal(sale: SaleRow) {
    setModalSale(sale)
    setAmount(String(sale.remaining))
    setPaymentType('CASH')
    setNote('')
    setHavaleBankName('')
    setBankId('')
    setPosDeviceId('')
    setInstallment(1)
    setModalOpen(true)
  }

  async function submitPayment() {
    if (!selectedCustomerId || !modalSale) return
    const n = Number(String(amount).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      setError('Tutar geçerli olmalı.')
      return
    }
    if (paymentType === 'CARD' && (!bankId || !posDeviceId)) {
      setError('Banka ve POS seçin.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const body: Record<string, unknown> = {
        customerId: selectedCustomerId,
        saleId: modalSale.saleId,
        amount: n,
        paymentType: paymentType === 'HAVALE' ? 'BANK_TRANSFER' : paymentType,
        note:
          paymentType === 'HAVALE' && havaleBankName.trim()
            ? `Havale bankası: ${havaleBankName.trim()}${note ? ` — ${note}` : ''}`
            : note?.trim() || null,
      }
      if (paymentType === 'CARD') {
        body.bankId = bankId
        body.posDeviceId = posDeviceId
        body.installment = installment
      }

      const res = await apiClient.post('/open-account/payment', body)
      setModalOpen(false)
      // Düzeltme (23.09.2026): backend artık ödeme yerel olarak kaydedilse
      // bile Odoo'ya (açık faturaya) yazılamadıysa bunu odooSyncError ile
      // bildiriyor — önceden bu her zaman görmezden gelinip "Ödeme
      // kaydedildi" gösteriliyordu, kullanıcı Odoo'nun güncellenmediğini
      // fark edemiyordu.
      const odooSyncError = res.data?.odooSyncError
      if (odooSyncError) {
        setError(
          `Ödeme yerel olarak kaydedildi, ANCAK Odoo'ya işlenemedi: ${odooSyncError}. `
          + 'Odoo\'daki açık hesap/fatura kaydını elle kontrol edin.',
        )
      } else {
        setSuccess('Ödeme kaydedildi (Odoo\'daki açık hesap kaydı da güncellendi).')
      }
      await loadSummary()
      await loadDetail(selectedCustomerId)
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Ödeme kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  const posOptions = bankId ? posDevicesByBankId.get(bankId) ?? [] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Açık Hesap</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['acik-hesap', 'manuel-tahsilat'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSekme(s)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: sekme === s ? 'none' : '1px solid #e5e7eb',
                backgroundColor: sekme === s ? primary : 'white',
                color: sekme === s ? 'white' : '#374151',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {s === 'acik-hesap' ? 'Açık Hesap' : 'Manuel Tahsilat (Kağıt Üstü Borç)'}
            </button>
          ))}
        </div>
      </div>

      {sekme === 'manuel-tahsilat' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...cardStyle, backgroundColor: '#f9fafb', fontSize: 13, color: '#6b7280' }}>
            Sistemde hiç satış kaydı olmayan, borcu sadece kağıt üzerinde tutulan bir müşteriden tahsilat aldıysanız
            burayı kullanın. Müşteriyi arayın ya da yoksa yeni kayıt açın, sonra tutarı girin — nakit tahsilat
            otomatik olarak bugünün kasa formuna işlenir.
          </div>

          {mtBasari ? (
            <div style={{ ...cardStyle, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#166534' }}>
              {mtBasari}
            </div>
          ) : null}
          {mtHata ? (
            <div style={{ ...cardStyle, borderColor: '#fecaca', backgroundColor: '#fef2f2', color: danger }}>
              {mtHata}
            </div>
          ) : null}

          <div style={cardStyle}>
            {!mtSeciliMusteri ? (
              <>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>1. Müşteri Seç</div>
                <input
                  value={mtMusteriQ}
                  onChange={(e) => setMtMusteriQ(e.target.value)}
                  placeholder="İsim veya telefon (en az 3 karakter)"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, outline: 'none', fontSize: 14 }}
                />
                {mtMusteriAraniyor ? <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>Aranıyor...</div> : null}
                {mtMusteriSonuc.length > 0 ? (
                  <div style={{ marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                    {mtMusteriSonuc.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setMtSeciliMusteri({ id: c.id, name: c.name, phone: c.phone })}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid #f3f4f6', backgroundColor: 'white', cursor: 'pointer' }}
                      >
                        <div style={{ fontWeight: 800 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{c.phone}</div>
                      </button>
                    ))}
                  </div>
                ) : null}

                <div style={{ marginTop: 14 }}>
                  {!mtYeniMusteriAcik ? (
                    <button
                      type="button"
                      onClick={() => setMtYeniMusteriAcik(true)}
                      style={{ border: '1px solid #e5e7eb', backgroundColor: 'white', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}
                    >
                      + Yeni Müşteri Kaydı Aç
                    </button>
                  ) : (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                      <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 13 }}>Yeni Müşteri</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <input value={mtYeniAd} onChange={(e) => setMtYeniAd(e.target.value)} placeholder="Ad Soyad *" style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
                        <input value={mtYeniTelefon} onChange={(e) => setMtYeniTelefon(e.target.value)} placeholder="Telefon *" style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
                        <input value={mtYeniTc} onChange={(e) => setMtYeniTc(e.target.value)} placeholder="TC Kimlik No (opsiyonel)" style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                        <button type="button" onClick={() => setMtYeniMusteriAcik(false)} style={{ border: '1px solid #e5e7eb', backgroundColor: 'white', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>Vazgeç</button>
                        <button
                          type="button"
                          disabled={mtYeniKaydediliyor}
                          onClick={() => void mtYeniMusteriKaydet()}
                          style={{ border: 'none', backgroundColor: primary, color: 'white', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 800, fontSize: 13, opacity: mtYeniKaydediliyor ? 0.7 : 1 }}
                        >
                          {mtYeniKaydediliyor ? 'Kaydediliyor...' : 'Müşteriyi Kaydet'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 800 }}>MÜŞTERİ</div>
                    <div style={{ fontWeight: 900, fontSize: 15 }}>{mtSeciliMusteri.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{mtSeciliMusteri.phone}</div>
                  </div>
                  <button type="button" onClick={() => mtAkisiSifirla()} style={{ border: '1px solid #e5e7eb', backgroundColor: 'white', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
                    Değiştir
                  </button>
                </div>

                <div style={{ fontWeight: 900, marginBottom: 8 }}>2. Tahsilat Bilgisi</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>TUTAR</div>
                    <input
                      value={mtTutar}
                      onChange={(e) => setMtTutar(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, outline: 'none' }}
                    />
                  </label>
                  <label>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>ÖDEME TÜRÜ</div>
                    <select
                      value={mtOdemeTuru}
                      onChange={(e) => setMtOdemeTuru(e.target.value as 'CASH' | 'CARD' | 'TRANSFER')}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10 }}
                    >
                      <option value="CASH">Nakit</option>
                      <option value="CARD">Kart</option>
                      <option value="TRANSFER">Havale</option>
                    </select>
                  </label>
                </div>

                <label style={{ display: 'block', marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>AÇIKLAMA (opsiyonel)</div>
                  <input
                    value={mtAciklama}
                    onChange={(e) => setMtAciklama(e.target.value)}
                    placeholder="Örn: eski kağıt üstü borç — Ekim tahsilatı"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, outline: 'none' }}
                  />
                </label>

                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    disabled={mtKaydediliyor}
                    onClick={() => void mtTahsilatKaydet()}
                    style={{ border: 'none', backgroundColor: primary, color: 'white', borderRadius: 10, padding: '12px 20px', cursor: 'pointer', fontWeight: 900, opacity: mtKaydediliyor ? 0.7 : 1 }}
                  >
                    {mtKaydediliyor ? 'Kaydediliyor...' : 'Tahsilatı Kaydet'}
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Son Manuel Tahsilatlar</div>
            {mtListeYukleniyor ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div>
            ) : mtListe.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>Henüz manuel tahsilat girilmemiş.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {mtListe.map((k) => (
                  <div key={k.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{k.customerName}</strong>
                      <span style={{ fontWeight: 900 }}>{money(k.amount)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {k.paymentTypeLabel} · {fmtDate(k.createdAt)}{k.aciklama ? ` — ${k.aciklama}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {success ? (
        <div style={{ ...cardStyle, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', color: '#166534' }}>
          {success}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280' }}>Açık hesap müşteri</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{totals.customerCount}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280' }}>Toplam açık bakiye</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6, color: danger }}>
            {money(totals.totalRemaining)}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Müşteri Ara</div>
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="İsim veya telefon (en az 3 karakter)"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            outline: 'none',
            fontSize: 14,
          }}
        />
        {searchLoading ? <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>Aranıyor...</div> : null}
        {searchResults.length > 0 ? (
          <div
            style={{
              marginTop: 8,
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            {searchResults.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCustomer({ id: c.id, name: c.name, phone: c.phone })}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  border: 'none',
                  borderBottom: '1px solid #f3f4f6',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 800 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{c.phone}</div>
              </button>
            ))}
          </div>
        ) : null}

        {!summaryLoading && summary.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', marginBottom: 8 }}>
              Açık hesaplı müşteriler
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {summary.map((r) => (
                <button
                  key={r.customer.id}
                  type="button"
                  onClick={() => selectCustomer(r.customer)}
                  style={{
                    textAlign: 'left',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: '10px 12px',
                    backgroundColor: selectedCustomerId === r.customer.id ? '#fef2f2' : 'white',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{r.customer.name}</div>
                  <div style={{ fontSize: 12, color: danger, fontWeight: 800, marginTop: 4 }}>
                    Kalan: {money(r.remainingDebt)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {selectedCustomerId ? (
        <div style={cardStyle}>
          {detailLoading ? (
            <div style={{ color: '#6b7280', fontSize: 13 }}>Yükleniyor...</div>
          ) : detail ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{detail.customer.name}</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{detail.customer.phone}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280' }}>Toplam kalan</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: danger }}>{money(detail.remainingDebt)}</div>
                  {detail.sales.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => openBulkPaymentModal()}
                      style={{
                        marginTop: 10,
                        backgroundColor: '#1e40af',
                        color: 'white',
                        border: 'none',
                        borderRadius: 10,
                        padding: '8px 14px',
                        cursor: 'pointer',
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      💰 Toplu Ödeme Gir
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {detail.sales.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Açık bakiyeli satış yok.</div>
                ) : null}
                {detail.sales.map((s) => (
                  <div
                    key={s.saleId}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 12,
                      padding: 12,
                      display: 'grid',
                      gridTemplateColumns: '1.2fr repeat(4, minmax(0, 1fr)) auto',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{fmtDate(s.createdAt)}</div>
                    <div style={{ fontSize: 12 }}>{s.itemsCount} kalem</div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{money(s.netTotal)}</div>
                    <div style={{ fontSize: 12 }}>{money(s.paidTotal)}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: danger }}>{money(s.remaining)}</div>
                    <button
                      type="button"
                      onClick={() => openPaymentModal(s)}
                      style={{
                        backgroundColor: '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: 10,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontWeight: 900,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Ödeme Gir
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <div style={{ color: danger, fontSize: 13 }}>{error}</div> : null}
      </div>
      )}

      {modalOpen && modalSale && detail ? (
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
          <div style={{ ...cardStyle, width: '100%', maxWidth: 620 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 900 }}>Ödeme Gir</div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  borderRadius: 10,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                Kapat
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ fontSize: 12, color: '#6b7280' }}>Satış özeti</div>
              <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280' }}>TARİH</div>
                  <div style={{ fontWeight: 800 }}>{fmtDate(modalSale.createdAt)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280' }}>TOPLAM</div>
                  <div style={{ fontWeight: 800 }}>{money(modalSale.netTotal)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280' }}>KALAN</div>
                  <div style={{ fontWeight: 900, color: danger }}>{money(modalSale.remaining)}</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>ÖDEME TUTARI</div>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    outline: 'none',
                  }}
                />
              </label>
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(['CASH', 'CARD', 'HAVALE'] as const).map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13 }}>
                  <input
                    type="radio"
                    name="payType"
                    checked={paymentType === t}
                    onChange={() => setPaymentType(t)}
                  />
                  {t === 'CASH' ? 'Nakit' : t === 'CARD' ? 'Kredi Kartı' : 'Havale'}
                </label>
              ))}
            </div>

            {paymentType === 'CARD' ? (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <label>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>BANKA</div>
                  <select
                    value={bankId}
                    onChange={(e) => {
                      setBankId(e.target.value)
                      setPosDeviceId('')
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                    }}
                  >
                    <option value="">Seçiniz</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>POS</div>
                  <select
                    value={posDeviceId}
                    onChange={(e) => setPosDeviceId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                    }}
                  >
                    <option value="">Seçiniz</option>
                    {posOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>TAKSİT</div>
                  <select
                    value={installment}
                    onChange={(e) => setInstallment(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {paymentType === 'HAVALE' ? (
              <label style={{ display: 'block', marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>
                  HAVALE BANKASI
                </div>
                <input
                  value={havaleBankName}
                  onChange={(e) => setHavaleBankName(e.target.value)}
                  placeholder="Hangi bankaya yatırıldı?"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    outline: 'none',
                  }}
                />
              </label>
            ) : null}

            <label style={{ display: 'block', marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>NOT (opsiyonel)</div>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  outline: 'none',
                }}
              />
            </label>

            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  flex: 1,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  fontWeight: 900,
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitPayment()}
                style={{
                  flex: 1,
                  border: 'none',
                  backgroundColor: primary,
                  color: 'white',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  fontWeight: 900,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkModalOpen && detail ? (
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
          <div style={{ ...cardStyle, width: '100%', maxWidth: 760, maxHeight: '90vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 900 }}>💰 Toplu Ödeme Gir</div>
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                style={{
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  borderRadius: 10,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                Kapat
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <label>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>TOPLAM TUTAR</div>
                <input
                  value={bulkToplam}
                  onChange={(e) => setBulkToplam(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    outline: 'none',
                  }}
                />
              </label>
              {bulkLoadingFifo ? (
                <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>FIFO önerisi yükleniyor...</div>
              ) : null}
            </div>

            <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {(['CASH', 'CARD', 'HAVALE'] as const).map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13 }}>
                  <input
                    type="radio"
                    name="bulkPayType"
                    checked={bulkPaymentType === t}
                    onChange={() => setBulkPaymentType(t)}
                  />
                  {t === 'CASH' ? 'Nakit' : t === 'CARD' ? 'Kredi Kartı' : 'Havale'}
                </label>
              ))}
            </div>

            <div
              style={{
                marginTop: 12,
                padding: 10,
                borderRadius: 10,
                backgroundColor: bulkTotalsMatch ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${bulkTotalsMatch ? '#bbf7d0' : '#fecaca'}`,
                color: bulkTotalsMatch ? '#166534' : danger,
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              Dağıtım toplamı: {money(bulkDagitimToplam)} / Girilen tutar: {money(bulkToplamNum)}
              {bulkTotalsMatch ? ' ✓' : ' — eşleşmiyor'}
            </div>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1fr 120px',
                  gap: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#6b7280',
                }}
              >
                <div>TARİH</div>
                <div>KALAN</div>
                <div>DAĞITILAN</div>
              </div>
              {detail.sales.map((s) => (
                <div
                  key={s.saleId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr 120px',
                    gap: 8,
                    alignItems: 'center',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtDate(s.createdAt)}</div>
                  <div style={{ fontSize: 12, color: danger, fontWeight: 800 }}>{money(s.remaining)}</div>
                  <input
                    value={bulkDagitim[s.saleId] ?? '0'}
                    onChange={(e) =>
                      setBulkDagitim((prev) => ({ ...prev, [s.saleId]: e.target.value }))
                    }
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      outline: 'none',
                    }}
                  />
                </div>
              ))}
            </div>

            {bulkPaymentType === 'CARD' ? (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <label>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>BANKA</div>
                  <select
                    value={bulkBankId}
                    onChange={(e) => {
                      setBulkBankId(e.target.value)
                      setBulkPosDeviceId('')
                    }}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10 }}
                  >
                    <option value="">Seçiniz</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>POS</div>
                  <select
                    value={bulkPosDeviceId}
                    onChange={(e) => setBulkPosDeviceId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10 }}
                  >
                    <option value="">Seçiniz</option>
                    {(bulkBankId ? posDevicesByBankId.get(bulkBankId) ?? [] : []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>TAKSİT</div>
                  <select
                    value={bulkInstallment}
                    onChange={(e) => setBulkInstallment(Number(e.target.value))}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10 }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {bulkPaymentType === 'HAVALE' ? (
              <label style={{ display: 'block', marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>HAVALE BANKASI</div>
                <input
                  value={bulkHavaleBankName}
                  onChange={(e) => setBulkHavaleBankName(e.target.value)}
                  placeholder="Hangi bankaya yatırıldı?"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, outline: 'none' }}
                />
              </label>
            ) : null}

            <label style={{ display: 'block', marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>NOT (opsiyonel)</div>
              <input
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 10, outline: 'none' }}
              />
            </label>

            <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                style={{
                  flex: 1,
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  fontWeight: 900,
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={bulkSaving || !bulkTotalsMatch || bulkLoadingFifo}
                onClick={() => void submitBulkPayment()}
                style={{
                  flex: 1,
                  border: 'none',
                  backgroundColor: bulkTotalsMatch ? primary : '#9ca3af',
                  color: 'white',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: bulkTotalsMatch ? 'pointer' : 'not-allowed',
                  fontWeight: 900,
                  opacity: bulkSaving ? 0.7 : 1,
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
