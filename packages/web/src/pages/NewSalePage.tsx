import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import { useAuthStore } from '../store/auth.store'
import { confirmSale, createSale, getSaleById } from '../api/sales.api'
import { getCurrentShift } from '../api/shifts.api'
import { getCustomerById, getLatestPrescription } from '../api/customers.api'
import CustomerStep from '../components/sale/CustomerStep'
import { formatDaimiPrescriptionSummary } from '../utils/prescriptionSummary'
import ItemsStep from '../components/sale/ItemsStep'
import PricingStep from '../components/sale/PricingStep'
import type { PricingOverview } from '../utils/sgkPricing'
import PaymentStep, { type PendingPaymentPayload } from '../components/sale/PaymentStep'
import LensMeasurementStep from '../components/sale/LensMeasurementStep'
import StatusStep from '../components/sale/StatusStep'
import StokTeminStep from '../components/sale/StokTeminStep'
import {
  draftsToLensOrderMeasurements,
  saleNeedsLensMeasurementStep,
  type LensMeasurementDraft,
} from '../utils/saleMeasurements'
import { hasReceteData } from '../utils/ozelSiparisRecete'

function formatMoney(v?: string) {
  if (!v) return '-'
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
}

type Step = 1 | 2 | 3 | 4 | 5 | 5.5 | 6

export default function NewSalePage() {
  const storedShiftId = useAuthStore((s) => s.shiftId)
  const [searchParams] = useSearchParams()
  const resumeSaleId = searchParams.get('saleId')

  const [step, setStep] = useState<Step>(1)
  const [error, setError] = useState<string | null>(null)

  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null)
  const [latestPrescription, setLatestPrescription] = useState<any | null>(null)

  const [sale, setSale] = useState<any | null>(null)
  const [pricingOverview, setPricingOverview] = useState<PricingOverview | null>(null)
  const [pendingPayments, setPendingPayments] = useState<PendingPaymentPayload | null>(null)
  const [lensMeasurementDrafts, setLensMeasurementDrafts] = useState<LensMeasurementDraft[]>([])
  const [saleConfirmed, setSaleConfirmed] = useState(false)

  const [shiftId, setShiftId] = useState<string | null>(storedShiftId ?? null)
  const [shiftLoading, setShiftLoading] = useState(false)

  const currentStep = step
  const setCurrentStep = setStep

  const steps = [
    { id: 1 as Step, label: 'Müşteri' },
    { id: 2 as Step, label: 'Ürünler' },
    { id: 3 as Step, label: 'Fiyat' },
    { id: 4 as Step, label: 'Ödeme' },
    { id: 5 as Step, label: 'Ölçüler' },
    { id: 5.5 as Step, label: 'Temin' },
    { id: 6 as Step, label: 'Onay' },
  ]

  useEffect(() => {
    if (storedShiftId) {
      setShiftId(storedShiftId)
      return
    }
    setShiftLoading(true)
    getCurrentShift()
      .then((shift) => setShiftId(shift?.id ?? null))
      .catch((e: any) => {
        console.error('NewSale shift fetch error', e)
        setError(e?.response?.data?.message ?? 'Vardiya bilgisi alınamadı')
      })
      .finally(() => setShiftLoading(false))
  }, [storedShiftId])

  useEffect(() => {
    if (!resumeSaleId) return
    getSaleById(resumeSaleId)
      .then((s) => {
        setSale(s)
        if (s.customer) {
          setSelectedCustomer(s.customer)
          ;(window as any).__aktifMusteriAdi = s.customer.name ?? ''
        }
        getLatestPrescription(s.customerId).then(setLatestPrescription).catch(() => null)
        setStep(2)
      })
      .catch((e: any) => console.error('Resume sale error', e))
  }, [resumeSaleId])

  useEffect(() => {
    if (currentStep !== 3 && currentStep !== 4 && currentStep !== 5 && currentStep !== 5.5 && currentStep !== 6) return
    if (!sale?.id) return
    getSaleById(sale.id)
      .then(setSale)
      .catch((e: any) => console.error('NewSale getSaleById error', e))
  }, [currentStep, sale?.id])

  const createNewSale = async () => {
    if (!selectedCustomer || !shiftId) return
    try {
      const result = await createSale({
        customerId: selectedCustomer.id,
        shiftId: shiftId,
      })
      setSale(result)
    } catch (e: any) {
      console.error('Sale create error:', e)
      setError(e?.response?.data?.message ?? 'Satış oluşturulamadı')
    }
  }

  const handleCustomerSelect = (customer: any) => {
    const ayniMusteri = selectedCustomer?.id === customer.id
    setSelectedCustomer(customer)
    ;(window as any).__aktifMusteriAdi = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim()
    setLatestPrescription(customer.appliedPrescription ?? null)
    if (!ayniMusteri) {
      setSale(null)
      setPendingPayments(null)
      setSaleConfirmed(false)
      setLensMeasurementDrafts([])
    }
    setError(null)
    setStep(2)
    if (customer.appliedPrescription) {
      getCustomerById(customer.id)
        .then((full) => setSelectedCustomer(full))
        .catch((e: any) => console.error('Customer detail fetch error', e))
      return
    }
    Promise.all([
      getLatestPrescription(customer.id).catch(() => null),
      getCustomerById(customer.id).catch(() => null),
    ]).then(([rx, full]) => {
      if (full) setSelectedCustomer(full)
      if (rx && hasReceteData(rx)) setLatestPrescription(rx)
      else if (full && hasReceteData(full)) setLatestPrescription(full)
      else setLatestPrescription(rx)
    })
  }

  useEffect(() => {
    if (currentStep === 2 && selectedCustomer && shiftId && !sale) {
      void createNewSale()
    }
  }, [currentStep, selectedCustomer, shiftId, sale])

  const handlePaymentContinue = useCallback((payload?: PendingPaymentPayload) => {
    if (!payload?.payments?.length) {
      setError('Ödeme planı eksik.')
      return
    }
    setError(null)
    setPendingPayments(payload)
    setCurrentStep(saleNeedsLensMeasurementStep(sale) ? 5 : 5.5)
  }, [sale])

  const handleConfirmSale = useCallback(async () => {
    if (!sale?.id || !pendingPayments) {
      setError('Onay için önce ödeme adımını tamamlayın.')
      return
    }
    setError(null)
    try {
      await confirmSale(sale.id, {
        ...pendingPayments,
        thirdPartyAmount: pricingOverview?.thirdPartyCoverageTRY ?? 0,
        sgkAmount:
          pricingOverview?.mode === 'SGK' ? (pricingOverview?.thirdPartyCoverageTRY ?? 0) : 0,
        vakifAmount:
          pricingOverview?.mode === 'VAKIF' ? (pricingOverview?.thirdPartyCoverageTRY ?? 0) : 0,
        kasaIndirimTutar: pricingOverview?.kasaIndirimTutar ?? 0,
        pricingInvoiceNote: pricingOverview?.pricingInvoiceNote ?? undefined,
        lensOrderMeasurements: lensMeasurementDrafts.length > 0
          ? draftsToLensOrderMeasurements(lensMeasurementDrafts)
          : undefined,
      })
      const refreshed = await getSaleById(sale.id)
      setSale(refreshed)
      setSaleConfirmed(true)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Satış onaylanamadı')
    }
  }, [sale?.id, pendingPayments, pricingOverview?.mode, pricingOverview?.thirdPartyCoverageTRY, pricingOverview?.kasaIndirimTutar, pricingOverview?.pricingInvoiceNote, lensMeasurementDrafts])

  const handleRefreshSale = useCallback(async () => {
    if (!sale?.id) return
    const refreshed = await getSaleById(sale.id)
    setSale(refreshed)
  }, [sale?.id])

  const canGoToStep = (target: Step): boolean => {
    if (target === 1) return true
    if (!selectedCustomer) return false
    if (target === 2) return true
    if (!sale) return false
    if (target === 3) return true
    if (target === 4) return true
    if (target === 5) return !!pendingPayments
    if (target === 6) return !!pendingPayments
    return false
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {steps.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={!canGoToStep(s.id) && s.id > currentStep}
                onClick={() => {
                  if (canGoToStep(s.id)) {
                    setError(null)
                    setCurrentStep(s.id)
                  }
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  cursor: canGoToStep(s.id) || s.id <= currentStep ? 'pointer' : 'not-allowed',
                  fontWeight: 800,
                  backgroundColor: currentStep === s.id ? '#C8102E' : '#f3f4f6',
                  color: currentStep === s.id ? 'white' : '#111',
                  opacity: !canGoToStep(s.id) && s.id > currentStep ? 0.45 : 1,
                }}
              >
                {s.id}. {s.label}
              </button>
            ))}
          </div>
        </div>

        {shiftLoading ? <div style={{ fontSize: '13px', color: '#6b7280' }}>Vardiya bilgisi yükleniyor...</div> : null}
        {error ? <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: 700 }}>{error}</div> : null}

        {currentStep === 1 ? (
          <CustomerStep
            onSelectCustomer={handleCustomerSelect}
            onApplyPrescription={setLatestPrescription}
            initialCustomer={selectedCustomer}
          />
        ) : null}

        {currentStep === 2 && sale ? (
          <ItemsStep saleId={sale.id} items={sale.items ?? []} onSaleUpdated={(s) => setSale(s)} customerPrescription={latestPrescription} />
        ) : null}

        {currentStep === 2 && !sale ? (
          <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontWeight: 800, marginBottom: '8px' }}>Kalemler</div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              {selectedCustomer ? (
                !shiftId && !shiftLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <span style={{ color: '#b45309', fontWeight: 700 }}>
                      Açık vardiya bulunamadı. Lütfen önce vardiya açın.
                    </span>
                    <Link
                      to="/shift/open"
                      style={{
                        display: 'inline-block',
                        width: 'fit-content',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        backgroundColor: '#C8102E',
                        color: 'white',
                        fontWeight: 800,
                        fontSize: '13px',
                        textDecoration: 'none',
                      }}
                    >
                      Vardiya Aç →
                    </Link>
                  </div>
                ) : (
                  'Satış oluşturuluyor...'
                )
              ) : (
                'Önce müşteri seçin.'
              )}
            </div>
          </div>
        ) : null}

        {(currentStep === 3 || currentStep === 4 || currentStep === 5 || currentStep === (5.5 as any) || currentStep === 6) ? (
          <>
            <div style={{ display: currentStep === 3 ? 'block' : 'none' }}>
              <PricingStep
                sale={sale}
                customerPrescription={latestPrescription}
                onOverviewChange={setPricingOverview}
                onNext={() => setCurrentStep(4)}
                onBack={() => setCurrentStep(2)}
              />
            </div>
            <div style={{ display: currentStep === 4 ? 'block' : 'none' }}>
              <PaymentStep
                sale={sale}
                deferConfirm
                pricingOverview={pricingOverview}
                onBack={() => setCurrentStep(3)}
                onNext={handlePaymentContinue}
              />
            </div>
          </>
        ) : null}

        {(currentStep === 5 || currentStep === 5.5 || currentStep === 6) && sale ? (
          <>
            <div style={{ display: currentStep === 5 ? 'block' : 'none' }}>
              <LensMeasurementStep
                sale={sale}
                customerPrescription={latestPrescription}
                onComplete={(drafts) => {
                  setLensMeasurementDrafts(drafts)
                  setStep(5.5)
                }}
                onBack={() => setStep(4)}
              />
            </div>
            <div style={{ display: currentStep === 5.5 ? 'block' : 'none' }}>
              <StokTeminStep
                sale={sale}
                selectedCustomer={selectedCustomer}
                latestPrescription={latestPrescription}
                lensOrderMeasurements={
                  lensMeasurementDrafts.length > 0
                    ? draftsToLensOrderMeasurements(lensMeasurementDrafts)
                    : undefined
                }
                onDevam={() => setCurrentStep(6)}
                onGeri={() => setCurrentStep(saleNeedsLensMeasurementStep(sale) ? 5 : 4)}
              />
            </div>
          </>
        ) : null}

        {currentStep === 6 && !saleConfirmed ? (
          <div
            style={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <div style={{ fontWeight: 900, fontSize: '18px' }}>6. Onay</div>
            <div style={{ fontSize: '13px', color: '#374151' }}>
              Ödeme planı hazır. Satışı kesinleştirmek için onaylayın.
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>
              Ödeme satırı: <strong>{pendingPayments?.payments?.length ?? 0}</strong>
              {lensMeasurementDrafts.length > 0 ? (
                <>
                  {' '}
                  · Ölçü kaydı: <strong>{lensMeasurementDrafts.length}</strong>
                </>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Button variant="secondary" onClick={() => setCurrentStep(5)}>
                ← Ölçüler
              </Button>
              <Button onClick={() => void handleConfirmSale()}>Satışı onayla ve tamamla</Button>
            </div>
          </div>
        ) : null}

        {currentStep === 6 && saleConfirmed && sale ? (
          <StatusStep
            sale={sale}
            onRefresh={handleRefreshSale}
            onNewSale={() => {
              window.location.href = '/sales/new'
            }}
          />
        ) : null}
      </div>

      <div
        style={{
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '16px',
          height: 'fit-content',
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: '8px' }}>Özet</div>
        {selectedCustomer ? (
          <div
            style={{
              border: '1px solid #bbf7d0',
              backgroundColor: '#f0fdf4',
              borderRadius: '12px',
              padding: '12px',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '14px' }}>{selectedCustomer.name}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{selectedCustomer.phone}</div>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>Müşteri seçilmedi.</div>
        )}
        {latestPrescription ? (
          <div
            style={{
              border: '1px solid #e5e7eb',
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '12px',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 900, marginBottom: '6px' }}>Reçete</div>
            <div style={{ fontSize: '12px', color: '#111', lineHeight: 1.45 }}>
              {latestPrescription.summary ?? formatDaimiPrescriptionSummary(latestPrescription)}
            </div>
            {latestPrescription.saleDate || latestPrescription.createdAt ? (
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: 4 }}>
                Tarih:{' '}
                {new Date(
                  latestPrescription.saleDate ?? latestPrescription.createdAt,
                ).toLocaleDateString('tr-TR')}
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
          {pricingOverview ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ödeme tipi</span>
                <span style={{ fontWeight: 800 }}>{pricingOverview.modeLabel}</span>
              </div>
              {pricingOverview.thirdPartyCoverageTRY > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{pricingOverview.mode === 'SGK' ? 'SGK katkısı' : 'Vakıf katkısı'}</span>
                  <span style={{ fontWeight: 800, color: '#059669' }}>
                    −
                    {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
                      pricingOverview.thirdPartyCoverageTRY,
                    )}
                  </span>
                </div>
              ) : null}
              {pricingOverview.campaignSummaryLines.map((line, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <span>Kampanya</span>
                  <span style={{ fontWeight: 800, color: '#059669', textAlign: 'right' }}>{line}</span>
                </div>
              ))}
              {pricingOverview.giftVoucherAmountTRY ? (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Hediye çeki</span>
                  <span style={{ fontWeight: 800, color: '#059669' }}>
                    −
                    {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
                      pricingOverview.giftVoucherAmountTRY,
                    )}
                  </span>
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '6px',
                  paddingTop: '8px',
                  borderTop: '1px solid #e5e7eb',
                }}
              >
                <span style={{ fontWeight: 900 }}>Müşteri öder</span>
                <span style={{ fontWeight: 900, color: '#C8102E' }}>
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
                    pricingOverview.customerPaysTRY,
                  )}
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ara Toplam</span>
                <span style={{ fontWeight: 800 }}>{formatMoney(sale?.grossTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>KDV</span>
                <span style={{ fontWeight: 800 }}>{formatMoney(sale?.taxTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Genel Toplam</span>
                <span style={{ fontWeight: 900 }}>{formatMoney(sale?.netTotal)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
