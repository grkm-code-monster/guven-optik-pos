import type { Sale } from '../../api/types'
import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import { fetchBranchCampaigns, logCampaignApplications, type Campaign } from '../../api/campaigns.api'
import { dbCampaignToCard } from '../../utils/campaignPricing'
import { useAuthStore } from '../../store/auth.store'
import {
  type AppliedCampaignCard,
  CAMPAIGN_TYPE_OPTIONS,
  type CampaignTypeId,
  type CampaignUrunLinesState,
  evaluateCampaignStack,
} from '../../utils/campaignPricing'
import {
  buildPricingOverview,
  computeSgkFromModalSelections,
  getFirstLensPrescription,
  type PaymentPricingMode,
  type PricingOverview,
  type SgkModalFormState,
  type SgkModalSnapshot,
  VAKIF_OPTIONS,
} from '../../utils/sgkPricing'

function moneyNum(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

const ODOO_NAME_PLACEHOLDER = '__ODOO_PLACEHOLDER__'

function saleItemDisplayName(item: NonNullable<Sale['items']>[number]): string {
  return (
    item.odooProductName ||
    (item.product?.name !== ODOO_NAME_PLACEHOLDER ? item.product?.name : null) ||
    'Odoo Ürünü'
  )
}

const MODE_OPTIONS: Array<{ id: PaymentPricingMode; label: string }> = [
  { id: 'NORMAL', label: 'Normal' },
  { id: 'SGK', label: 'SGK' },
  { id: 'VAKIF', label: 'Vakıf Ödemesi' },
  { id: 'OZEL_SIGORTA', label: 'Özel Sigorta' },
]

function defaultSgkForm(): SgkModalFormState {
  return {
    farR: false,
    farL: false,
    farBoth: false,
    cokOdakli: false,
    nearR: false,
    nearL: false,
    nearBoth: false,
    frameDaimi: false,
    frameYakin: false,
    frameOrigin: null,
  }
}

export default function PricingStep({
  sale,
  customerPrescription,
  onOverviewChange,
  onNext,
  onBack,
}: {
  sale: Sale | null
  customerPrescription?: Record<string, unknown> | null
  onOverviewChange?: (o: PricingOverview) => void
  onNext: () => void
  onBack: () => void
}) {
  const [mode, setMode] = useState<PaymentPricingMode>('NORMAL')
  const [foundationName, setFoundationName] = useState<string>(VAKIF_OPTIONS[0])
  const [foundationAmount, setFoundationAmount] = useState('')
  const [insuranceCompanyNote, setInsuranceCompanyNote] = useState('')

  const [sgkConfirmedSnapshot, setSgkConfirmedSnapshot] = useState<SgkModalSnapshot | null>(null)
  const [sgkModalOpen, setSgkModalOpen] = useState(false)
  const [sgkForm, setSgkForm] = useState<SgkModalFormState>(() => defaultSgkForm())
  const [sgkCalcErrors, setSgkCalcErrors] = useState<string[]>([])
  const [sgkModalDraft, setSgkModalDraft] = useState<SgkModalSnapshot | null>(null)

  const [campaigns, setCampaigns] = useState<AppliedCampaignCard[]>([])
  const [dbCampaigns, setDbCampaigns] = useState<Campaign[]>([])
  const [dbLoading, setDbLoading] = useState(false)
  const branchId = useAuthStore((s) => s.user?.branchId ?? '')
  const [campaignModalOpen, setCampaignModalOpen] = useState(false)
  const [campaignKind, setCampaignKind] = useState<CampaignTypeId>('KASA')
  const [kasaAmountStr, setKasaAmountStr] = useState('')
  const [nakitPercentStr, setNakitPercentStr] = useState('')
  const [nakitOdemeOnay, setNakitOdemeOnay] = useState(false)
  const [urunLines, setUrunLines] = useState<CampaignUrunLinesState>({})

  const [hediyeModalOpen, setHediyeModalOpen] = useState(false)
  const [hediyeCode, setHediyeCode] = useState('')
  const [hediyeAmountStr, setHediyeAmountStr] = useState('')
  const [hediye, setHediye] = useState<{ code: string; amountTRY: number } | null>(null)

  useEffect(() => {
    setSgkConfirmedSnapshot(null)
    setSgkModalOpen(false)
    setSgkForm(defaultSgkForm())
    setSgkCalcErrors([])
    setSgkModalDraft(null)
    setCampaigns([])
    setHediye(null)
    setHediyeCode('')
    setHediyeAmountStr('')
    if (branchId) {
      setDbLoading(true)
      fetchBranchCampaigns(branchId)
        .then(setDbCampaigns)
        .catch(() => {})
        .finally(() => setDbLoading(false))
    }
  }, [sale?.id, branchId])

  useEffect(() => {
    if (mode !== 'SGK') {
      setSgkConfirmedSnapshot(null)
    }
  }, [mode])

  const overview = useMemo((): PricingOverview => {
    const catalogNet = roundMoney(Number(sale?.netTotal ?? 0))
    const base = buildPricingOverview(catalogNet, sale?.items ?? [], mode, {
      foundationName,
      foundationAmountStr: foundationAmount,
      insuranceCompanyNote,
      sgkModalSnapshot: mode === 'SGK' ? sgkConfirmedSnapshot : null,
      campaigns,
      nakitKampanyaAktif: nakitOdemeOnay,
    })
    const rawGift = hediye ? roundMoney(hediye.amountTRY) : 0
    const giftAmt = Math.min(rawGift, roundMoney(base.customerPaysTRY))
    const customerAfterGift = Math.max(0, roundMoney(base.customerPaysTRY - giftAmt))
    return {
      ...base,
      catalogSaleNetTRY: catalogNet,
      customerPaysTRY: customerAfterGift,
      giftVoucherCode: hediye && giftAmt > 0 ? hediye.code : null,
      giftVoucherAmountTRY: giftAmt > 0 ? giftAmt : undefined,
    }
  }, [
    sale?.netTotal,
    sale?.items,
    mode,
    foundationName,
    foundationAmount,
    insuranceCompanyNote,
    sgkConfirmedSnapshot,
    campaigns,
    nakitOdemeOnay,
    hediye,
  ])

  useEffect(() => {
    onOverviewChange?.(overview)
  }, [overview, onOverviewChange])

  const openSgkModal = () => {
    setSgkCalcErrors([])
    setSgkModalDraft(null)
    setSgkModalOpen(true)
  }

  const runSgkCalculate = () => {
    const rx = getFirstLensPrescription(sale?.items ?? []) ?? customerPrescription ?? {}
    const result = computeSgkFromModalSelections(rx, sgkForm)
    if (!result.ok) {
      setSgkCalcErrors(result.errors)
      setSgkModalDraft(null)
      return
    }
    setSgkCalcErrors([])
    setSgkModalDraft(result.snapshot)
  }

  const applySgkModal = () => {
    if (!sgkModalDraft) return
    setSgkConfirmedSnapshot(sgkModalDraft)
    setSgkModalOpen(false)
    setSgkModalDraft(null)
    setSgkCalcErrors([])
  }

  function openCampaignModal() {
    const init: CampaignUrunLinesState = {}
    for (const it of sale?.items ?? []) {
      init[it.id] = { sel: false, mode: 'PCT', valueStr: '' }
    }
    setUrunLines(init)
    setCampaignKind('KASA')
    setKasaAmountStr('')
    setNakitPercentStr('')
    setCampaignModalOpen(true)
  }

  function addCampaignToList() {
    const id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const card: AppliedCampaignCard = { id, kind: campaignKind }
    if (campaignKind === 'KASA') card.kasaAmountStr = kasaAmountStr
    if (campaignKind === 'NAKIT_ORAN') card.nakitPercentStr = nakitPercentStr
    if (campaignKind === 'URUN_BAZLI') card.urun = { ...urunLines }
    setCampaigns((prev) => [...prev, card])
    setCampaignModalOpen(false)
  }

  function applyHediye() {
    const amt = roundMoney(Number(String(hediyeAmountStr).replace(',', '.')))
    const code = hediyeCode.trim()
    if (!code || amt <= 0) return
    setHediye({ code, amountTRY: amt })
    setHediyeModalOpen(false)
  }

  function setFarCheckbox<K extends keyof SgkModalFormState>(field: K, checked: boolean) {
    setSgkForm((f) => {
      const next = { ...f, [field]: checked }
      if (field === 'farBoth') {
        if (checked) {
          next.farR = false
          next.farL = false
        }
        return next as SgkModalFormState
      }
      if (field === 'farR' || field === 'farL') {
        if (checked) next.farBoth = false
      }
      return next as SgkModalFormState
    })
  }

  function setNearCheckbox<K extends keyof SgkModalFormState>(field: K, checked: boolean) {
    setSgkForm((f) => {
      const next = { ...f, [field]: checked }
      if (field === 'nearBoth') {
        if (checked) {
          next.nearR = false
          next.nearL = false
        }
        return next as SgkModalFormState
      }
      if (field === 'nearR' || field === 'nearL') {
        if (checked) next.nearBoth = false
      }
      return next as SgkModalFormState
    })
  }

  if (!sale) {
    return (
      <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
        Satış yükleniyor...
      </div>
    )
  }

  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px' }}>
      <div style={{ fontWeight: 900, marginBottom: '12px' }}>Fiyatlandırma</div>

      <div style={{ marginBottom: '14px' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 800,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '8px',
          }}
        >
          Ödeme tipi
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: mode === m.id ? '2px solid #C8102E' : '1px solid #e5e7eb',
                backgroundColor: mode === m.id ? '#fdf2f4' : '#fff',
                color: mode === m.id ? '#C8102E' : '#374151',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'SGK' ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '14px',
            backgroundColor: '#f9fafb',
          }}
        >
          <div style={{ fontWeight: 900, fontSize: '13px', marginBottom: '10px' }}>SGK hakkı</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={openSgkModal}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: sgkConfirmedSnapshot ? '2px solid #059669' : '2px dashed #94a3b8',
                backgroundColor: sgkConfirmedSnapshot ? '#ecfdf5' : '#fff',
                color: '#111',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                <input type="checkbox" readOnly checked={!!sgkConfirmedSnapshot} aria-hidden />
                SGK Hakkı Var — kapsam seç
              </label>
            </button>
            {!sgkConfirmedSnapshot ? (
              <span style={{ fontSize: '12px', color: '#92400e' }}>
                SGK seçili; kapsam ve hesaplama yapılmadı → katkı 0 ₺ müşteri tam öder.
              </span>
            ) : null}
          </div>

          {overview.sgkComputedLines.length > 0 || overview.frameContributionTRY > 0 ? (
            <>
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                {overview.sgkComputedLines.map((gl) => (
                  <div key={gl.key} style={{ fontWeight: 600, color: '#111' }}>
                    {gl.label} (SPH: {gl.sphSummary}): {moneyNum(gl.amountTRY)}
                  </div>
                ))}
                {overview.frameContributionTRY > 0 ? (
                  <div style={{ fontWeight: 600 }}>
                    Çerçeve (
                    {!sgkForm.frameOrigin ? '—' : sgkForm.frameOrigin === 'YERLI' ? 'Yerli' : 'İthal'}):{' '}
                    {moneyNum(overview.frameContributionTRY)}
                  </div>
                ) : null}
              </div>
              <div style={{ marginTop: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800 }}>
                  <span>Toplam SGK katkısı</span>
                  <span>{moneyNum(overview.sgkContributionTotalTRY)}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '14px',
                    fontWeight: 900,
                    marginTop: '10px',
                    color: '#C8102E',
                  }}
                >
                  <span>Müşteri öder</span>
                  <span>{moneyNum(overview.customerPaysTRY)}</span>
                </div>
              </div>
              {overview.pricingInvoiceNote ? (
                <div style={{ marginTop: '12px', fontSize: '11px', color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                  <strong>SGK fatura notu:</strong>
                  <br />
                  {overview.pricingInvoiceNote}
                </div>
              ) : null}
            </>
          ) : null}

          {/* Frame origin badge: kullanıcı seçiminden (onaylı snapshot için not) */}
          {sgkConfirmedSnapshot && sgkConfirmedSnapshot.frameContributionTRY > 0 ? null : null}
        </div>
      ) : null}

      {mode === 'VAKIF' ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '14px',
          }}
        >
          <div style={{ fontWeight: 900, fontSize: '13px', marginBottom: '10px' }}>Vakıf ödemesi</div>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px' }}>
            Vakıf adı
            <select
              value={foundationName}
              onChange={(e) => setFoundationName(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            >
              {VAKIF_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', fontSize: '12px' }}>
            Vakıf katkı tutarı (₺)
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="Örn: 2500"
              value={foundationAmount}
              onChange={(e) => setFoundationAmount(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
          </label>
          <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
            <span>Vakıf katkısı (uygulanan)</span>
            <span>{moneyNum(overview.thirdPartyCoverageTRY)}</span>
          </div>
          <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 900, color: '#C8102E', display: 'flex', justifyContent: 'space-between' }}>
            <span>Müşteri öder</span>
            <span>{moneyNum(overview.customerPaysTRY)}</span>
          </div>
          {overview.pricingInvoiceNote ? (
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#475569' }}>{overview.pricingInvoiceNote}</div>
          ) : null}
        </div>
      ) : null}

      {mode === 'OZEL_SIGORTA' ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '14px',
          }}
        >
          <div style={{ fontWeight: 900, fontSize: '13px', marginBottom: '8px' }}>Özel sigorta</div>
          <div style={{ fontSize: '12px', color: '#374151', marginBottom: '10px' }}>Tam tutar müşteriye yansır.</div>
          <label style={{ display: 'block', fontSize: '12px' }}>
            Sigorta şirketi (opsiyonel)
            <textarea
              value={insuranceCompanyNote}
              onChange={(e) => setInsuranceCompanyNote(e.target.value)}
              rows={3}
              placeholder="Örn: Anadolu Sigorta"
              style={{
                display: 'block',
                width: '100%',
                marginTop: '6px',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                resize: 'vertical',
                fontSize: '13px',
              }}
            />
          </label>
          <div style={{ marginTop: '10px', fontSize: '14px', fontWeight: 900, display: 'flex', justifyContent: 'space-between' }}>
            <span>Müşteri öder</span>
            <span style={{ color: '#C8102E' }}>{moneyNum(overview.customerPaysTRY)}</span>
          </div>
        </div>
      ) : null}

      {mode === 'NORMAL' ? (
        <div style={{ marginBottom: '14px', fontSize: '13px', color: '#374151', fontWeight: 700 }}>
          Genel toplam müşteriye yansır: <strong style={{ color: '#111' }}>{moneyNum(overview.customerPaysTRY)}</strong>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
        <button
          type="button"
          onClick={openCampaignModal}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid #C8102E',
            backgroundColor: '#fff',
            color: '#C8102E',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          KAMPANYA
        </button>
        <button
          type="button"
          onClick={() => setHediyeModalOpen(true)}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            backgroundColor: '#f3f4f6',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          HEDİYE ÇEKİ
        </button>
      </div>

      {campaigns.length > 0 ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '14px',
            backgroundColor: '#fafafa',
          }}
        >
          <div style={{ fontWeight: 900, fontSize: '13px', marginBottom: '8px' }}>Kampanyalar</div>
          {campaigns.map((c) => {
            const preview = evaluateCampaignStack({
              catalogNetTRY: overview.catalogSaleNetTRY,
              items: sale.items ?? [],
              campaigns: [c],
              nakitKampanyaAktif: nakitOdemeOnay,
            })
            const line = preview.lines[0]?.summaryText ?? c.kind
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  marginBottom: '6px',
                }}
              >
                <span>{line}</span>
                <button
                  type="button"
                  onClick={() => setCampaigns((prev) => prev.filter((x) => x.id !== c.id))}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#ef4444',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Sil
                </button>
              </div>
            )
          })}
        </div>
      ) : null}

      {hediye ? (
        <div
          style={{
            marginBottom: '14px',
            padding: '10px 12px',
            borderRadius: '10px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fcd34d',
            fontSize: '13px',
          }}
        >
          <span style={{ fontWeight: 800, color: '#78350f' }}>
            Hediye Çeki [{hediye.code}]: −{moneyNum(overview.giftVoucherAmountTRY ?? hediye.amountTRY)}
          </span>
          <button
            type="button"
            onClick={() => setHediye(null)}
            style={{
              marginLeft: '12px',
              border: 'none',
              background: 'transparent',
              color: '#ef4444',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Kaldır
          </button>
        </div>
      ) : null}

      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '12px',
          padding: '12px',
          marginBottom: '14px',
          backgroundColor: '#f9fafb',
        }}
      >
        <div style={{ fontWeight: 900, fontSize: '13px', marginBottom: '10px' }}>Fiyat özeti</div>
        <div style={row}>
          <span style={label}>Ödeme tipi</span>
          <span style={value}>{overview.modeLabel}</span>
        </div>
        {overview.thirdPartyCoverageTRY > 0 ? (
          <div style={row}>
            <span style={label}>{mode === 'SGK' ? 'SGK katkısı' : 'Vakıf katkısı'}</span>
            <span style={{ ...value, color: '#059669' }}>−{moneyNum(overview.thirdPartyCoverageTRY)}</span>
          </div>
        ) : null}
        {overview.campaignSummaryLines.map((line, i) => (
          <div key={i} style={row}>
            <span style={label}>Kampanya</span>
            <span style={{ ...value, color: '#059669' }}>{line}</span>
          </div>
        ))}
        {overview.giftVoucherAmountTRY ? (
          <div style={row}>
            <span style={label}>Hediye çeki</span>
            <span style={{ ...value, color: '#059669' }}>−{moneyNum(overview.giftVoucherAmountTRY)}</span>
          </div>
        ) : null}
        <div style={{ ...row, marginTop: '8px' }}>
          <span style={{ ...label, fontWeight: 900 }}>Müşteri öder</span>
          <span style={{ fontSize: '18px', fontWeight: 900, color: '#C8102E' }}>{moneyNum(overview.customerPaysTRY)}</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
          <thead>
            <tr>
              <th style={th}>Ürün</th>
              <th style={th}>Liste Fiyatı</th>
              <th style={th}>İndirim</th>
              <th style={th}>KDV</th>
              <th style={th}>Toplam</th>
            </tr>
          </thead>
          <tbody>
            {(sale.items ?? []).map((item) => (
              <tr key={item.id}>
                <td style={td}>{saleItemDisplayName(item)}</td>
                <td style={td}>{item.unitPrice}</td>
                <td style={td}>{item.discount}</td>
                <td style={td}>{item.taxAmount}</td>
                <td style={td}>{item.lineTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '14px', borderTop: '1px solid #e5e7eb', paddingTop: '14px' }}>
        <div style={row}>
          <span style={label}>Ara Toplam</span>
          <span style={value}>{sale.grossTotal}</span>
        </div>
        <div style={row}>
          <span style={label}>Toplam İndirim</span>
          <span style={value}>{sale.discountTotal}</span>
        </div>
        <div style={row}>
          <span style={label}>KDV</span>
          <span style={value}>{sale.taxTotal}</span>
        </div>
        <div style={{ ...row, marginTop: '8px' }}>
          <span style={{ ...label, fontWeight: 900 }}>GENEL TOPLAM</span>
          <span style={{ fontSize: '20px', fontWeight: 900, color: '#C8102E' }}>{sale.netTotal}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            backgroundColor: '#f3f4f6',
            cursor: 'pointer',
            fontWeight: 800,
          }}
        >
          ← Geri
        </button>
        <button
          type="button"
          onClick={async () => {
            if (campaigns.length > 0) {
              const eval_ = evaluateCampaignStack({
                catalogNetTRY: overview.catalogSaleNetTRY,
                items: sale.items ?? [],
                campaigns,
                nakitKampanyaAktif: nakitOdemeOnay,
              })
              const entries = eval_.lines
                .filter((l) => l.discountTRY > 0)
                .map((l) => ({
                  campaignId: l.id,
                  saleId: sale.id,
                  branchId,
                  branchCode: branchId,
                  userId: useAuthStore.getState().user?.id ?? '',
                  discountTRY: l.discountTRY,
                }))
              if (entries.length > 0) {
                await logCampaignApplications(entries).catch(() => {})
              }
            }
            onNext()
          }}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#C8102E',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 900,
          }}
        >
          Ödemeye Geç →
        </button>
      </div>


      {campaignModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            backgroundColor: 'rgba(17,24,39,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setCampaignModalOpen(false)}
          role="presentation"
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              overflow: 'auto',
              backgroundColor: '#fff',
              borderRadius: '14px',
              padding: '18px',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div style={{ fontWeight: 900, marginBottom: '12px' }}>Kampanya ekle</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {dbLoading && (
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Kampanyalar yükleniyor...</p>
              )}
              {dbCampaigns.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>
                    Tanımlı Kampanyalar
                  </div>
                  {dbCampaigns.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        const card = dbCampaignToCard(c)
                        setCampaigns((prev) => {
                          if (prev.find((x) => x.id === c.id)) return prev
                          return [...prev, card]
                        })
                        setCampaignModalOpen(false)
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        marginBottom: 6,
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        backgroundColor: '#f9fafb',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {c.name}
                      {c.discountPct ? ` — %${c.discountPct}` : ''}
                      {c.discountTL ? ` — ₺${c.discountTL}` : ''}
                    </button>
                  ))}
                  <div style={{ borderTop: '1px solid #e5e7eb', margin: '10px 0' }} />
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>
                    Manuel Kampanya
                  </div>
                </div>
              )}
              {CAMPAIGN_TYPE_OPTIONS.map((opt) => (
                <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <input
                    type="radio"
                    name="campType"
                    checked={campaignKind === opt.id}
                    onChange={() => setCampaignKind(opt.id)}
                  />
                  <span>
                    <strong>{opt.label}</strong> — {opt.desc}
                  </span>
                </label>
              ))}
            </div>
            {campaignKind === 'KASA' ? (
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '12px' }}>
                Sabit tutar (₺)
                <input
                  type="number"
                  min={0}
                  value={kasaAmountStr}
                  onChange={(e) => setKasaAmountStr(e.target.value)}
                  style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
              </label>
            ) : null}
            {campaignKind === 'NAKIT_ORAN' ? (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginBottom: '8px' }}>
                  <input type="checkbox" checked={nakitOdemeOnay} onChange={(e) => setNakitOdemeOnay(e.target.checked)} />
                  Ödeme nakitte — kampanya aktif
                </label>
                <label style={{ display: 'block', fontSize: '12px', marginBottom: '12px' }}>
                  İndirim oranı (%)
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={nakitPercentStr}
                    onChange={(e) => setNakitPercentStr(e.target.value)}
                    style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                </label>
              </>
            ) : null}
            {campaignKind === 'IKI_AL_BIR_ODE' ? (
              <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>En ucuz satır kalemi indirime dahil edilir.</p>
            ) : null}
            {campaignKind === 'URUN_BAZLI' ? (
              <div style={{ marginBottom: '12px', maxHeight: '240px', overflow: 'auto' }}>
                {(sale.items ?? []).map((it) => (
                  <div key={it.id} style={{ borderBottom: '1px solid #f3f4f6', padding: '8px 0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={!!urunLines[it.id]?.sel}
                        onChange={(e) =>
                          setUrunLines((prev) => ({
                            ...prev,
                            [it.id]: {
                              sel: e.target.checked,
                              mode: prev[it.id]?.mode ?? 'PCT',
                              valueStr: prev[it.id]?.valueStr ?? '',
                            },
                          }))
                        }
                      />
                      {saleItemDisplayName(it)}
                    </label>
                    {urunLines[it.id]?.sel ? (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', marginLeft: '24px' }}>
                        <select
                          value={urunLines[it.id]?.mode ?? 'PCT'}
                          onChange={(e) =>
                            setUrunLines((prev) => ({
                              ...prev,
                              [it.id]: {
                                sel: true,
                                mode: e.target.value as 'PCT' | 'FIXED',
                                valueStr: prev[it.id]?.valueStr ?? '',
                              },
                            }))
                          }
                          style={{ padding: '6px', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                        >
                          <option value="PCT">Oran %</option>
                          <option value="FIXED">Tutar ₺</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={urunLines[it.id]?.valueStr ?? ''}
                          onChange={(e) =>
                            setUrunLines((prev) => ({
                              ...prev,
                              [it.id]: {
                                sel: true,
                                mode: prev[it.id]?.mode ?? 'PCT',
                                valueStr: e.target.value,
                              },
                            }))
                          }
                          style={{ flex: 1, padding: '6px', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={addCampaignToList}
                style={{
                  padding: '11px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#C8102E',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Listeye Ekle
              </button>
              <button
                type="button"
                onClick={() => setCampaignModalOpen(false)}
                style={{
                  padding: '11px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {hediyeModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            backgroundColor: 'rgba(17,24,39,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setHediyeModalOpen(false)}
          role="presentation"
        >
          <div
            style={{
              width: '100%',
              maxWidth: '400px',
              backgroundColor: '#fff',
              borderRadius: '14px',
              padding: '18px',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div style={{ fontWeight: 900, marginBottom: '12px' }}>Hediye çeki</div>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '10px' }}>
              Çek kodu
              <input
                value={hediyeCode}
                onChange={(e) => setHediyeCode(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
            </label>
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '14px' }}>
              Tutar (₺)
              <input
                type="number"
                min={0}
                value={hediyeAmountStr}
                onChange={(e) => setHediyeAmountStr(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={applyHediye}
                style={{
                  padding: '11px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#C8102E',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Tamam
              </button>
              <button
                type="button"
                onClick={() => setHediyeModalOpen(false)}
                style={{
                  padding: '11px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sgkModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            backgroundColor: 'rgba(17,24,39,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setSgkModalOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSgkModalOpen(false)
          }}
          role="presentation"
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              maxHeight: '90vh',
              overflow: 'auto',
              backgroundColor: '#fff',
              borderRadius: '14px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 22px 50px rgba(0,0,0,0.18)',
              padding: '18px',
            }}
            role="dialog"
            aria-labelledby="sgk-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="sgk-modal-title" style={{ fontWeight: 900, marginBottom: '14px', fontSize: '16px' }}>
              SGK kapsamı
            </div>

            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px', color: '#6b7280' }}>OPTİK CAM</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              <SgkCk
                checked={sgkForm.farR}
                label="Daimi Sağ Cam"
                onChange={(c) => setFarCheckbox('farR', c)}
              />
              <SgkCk
                checked={sgkForm.farL}
                label="Daimi Sol Cam"
                onChange={(c) => setFarCheckbox('farL', c)}
              />
              <SgkCk
                checked={sgkForm.farBoth}
                label="Daimi Her İkisi (Sağ + Sol)"
                onChange={(c) => setFarCheckbox('farBoth', c)}
              />
              <SgkCk
                checked={sgkForm.cokOdakli}
                label="Çok Odaklı (Progresif/Bifokal) — tablo: çok odaklı"
                onChange={(c) => setSgkForm((f) => ({ ...f, cokOdakli: c }))}
              />
            </div>

            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px', color: '#6b7280' }}>YAKIN CAM</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              <SgkCk checked={sgkForm.nearR} label="Yakın Sağ Cam" onChange={(c) => setNearCheckbox('nearR', c)} />
              <SgkCk checked={sgkForm.nearL} label="Yakın Sol Cam" onChange={(c) => setNearCheckbox('nearL', c)} />
              <SgkCk
                checked={sgkForm.nearBoth}
                label="Yakın Her İkisi (Sağ + Sol)"
                onChange={(c) => setNearCheckbox('nearBoth', c)}
              />
            </div>

            <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px', color: '#6b7280' }}>ÇERÇEVE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
              <SgkCk checked={sgkForm.frameDaimi} label="Daimi Çerçeve" onChange={(c) => setSgkForm((f) => ({ ...f, frameDaimi: c }))} />
              <SgkCk checked={sgkForm.frameYakin} label="Yakın Çerçeve" onChange={(c) => setSgkForm((f) => ({ ...f, frameYakin: c }))} />
            </div>

            {sgkForm.frameDaimi || sgkForm.frameYakin ? (
              <fieldset style={{ marginBottom: '14px', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px' }}>
                <legend style={{ fontWeight: 800, fontSize: '11px', color: '#6b7280' }}>Çerçeve menşei</legend>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="radio"
                    name="sf"
                    checked={sgkForm.frameOrigin === 'YERLI'}
                    onChange={() => setSgkForm((f) => ({ ...f, frameOrigin: 'YERLI' }))}
                  />
                  Yerli (500 ₺)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="radio"
                    name="sf"
                    checked={sgkForm.frameOrigin === 'ITHAL'}
                    onChange={() => setSgkForm((f) => ({ ...f, frameOrigin: 'ITHAL' }))}
                  />
                  İthal (350 ₺)
                </label>
              </fieldset>
            ) : null}

            {sgkCalcErrors.length > 0 ? (
              <div style={{ padding: '10px', marginBottom: '12px', backgroundColor: '#fef2f2', borderRadius: '8px', fontSize: '12px', color: '#b91c1c' }}>
                {sgkCalcErrors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            ) : null}

            {sgkModalDraft ? (
              <div style={{ marginBottom: '14px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                <div style={{ fontWeight: 800, marginBottom: '8px' }}>Özet — SGK katkıları</div>
                {sgkModalDraft.lines.map((gl) => (
                  <div key={gl.key} style={{ fontSize: '13px', marginBottom: '6px', color: '#111' }}>
                    <span style={{ fontWeight: 600 }}>{gl.label}</span>{' '}
                    <span style={{ color: '#6b7280' }}>(SPH: {gl.sphSummary}):</span> {moneyNum(gl.amountTRY)}
                  </div>
                ))}
                {sgkModalDraft.frameContributionTRY > 0 ? (
                  <div style={{ fontSize: '13px', marginBottom: '6px', fontWeight: 600 }}>
                    Çerçeve ({sgkForm.frameOrigin === 'YERLI' ? 'Yerli' : 'İthal'}):{' '}
                    {moneyNum(sgkModalDraft.frameContributionTRY)}
                  </div>
                ) : null}
                <div style={{ borderTop: '1px dashed #e5e7eb', margin: '12px 0', paddingTop: '10px', fontWeight: 900 }}>
                  Toplam SGK Hakkı: {moneyNum(sgkModalDraft.sgkContributionTotalTRY)}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={runSgkCalculate}
                style={{
                  padding: '11px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Hesapla
              </button>
              <button
                type="button"
                disabled={!sgkModalDraft}
                onClick={applySgkModal}
                style={{
                  padding: '11px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: !sgkModalDraft ? '#d1d5db' : '#059669',
                  color: '#fff',
                  fontWeight: 900,
                  cursor: !sgkModalDraft ? 'default' : 'pointer',
                }}
              >
                Tamam
              </button>
              <button
                type="button"
                onClick={() => setSgkModalOpen(false)}
                style={{
                  padding: '11px 16px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SgkCk({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (c: boolean) => void
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

const th: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '11px',
  fontWeight: 800,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid #e5e7eb',
  backgroundColor: '#f9fafb',
}

const td: CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  fontSize: '13px',
  color: '#111',
}

const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  marginTop: '6px',
}

const label: CSSProperties = { fontSize: '13px', color: '#6b7280', fontWeight: 700 }
const value: CSSProperties = { fontSize: '13px', color: '#111', fontWeight: 900 }
