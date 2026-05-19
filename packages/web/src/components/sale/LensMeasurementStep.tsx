import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import type { Sale } from '../../api/types'
import Button from '../ui/Button'
import {
  allMeasurementDraftsComplete,
  buildInitialMeasurementDrafts,
  getLensMeasurementSaleItems,
  getMountFrameItems,
  lensPairingLabel,
  prescriptionReadoutForItem,
  prescriptionReadoutFromCustomerRx,
  type LensMeasurementDraft,
  type LensOrderFrameTypeApi,
  updateDraftAt,
} from '../../utils/saleMeasurements'

function star(): ReactNode {
  return <span style={{ color: '#dc2626' }}> *</span>
}

function NumField({
  label,
  value,
  onChange,
  required,
  disabled,
}: {
  label: React.ReactNode
  value: string
  onChange: (v: string) => void
  required?: boolean
  disabled?: boolean
}) {
  return (
    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', opacity: disabled ? 0.5 : 1 }}>
      <div style={{ marginBottom: '4px' }}>
        {label}
        {required ? star() : null}
      </div>
      <input
        type="number"
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          fontSize: '13px',
        }}
      />
    </label>
  )
}

const BASE_OPTS = ['1', '2', '3', '4', '5', '6']

export default function LensMeasurementStep({
  sale,
  customerPrescription,
  onComplete,
  onBack,
}: {
  sale: Sale
  customerPrescription?: Record<string, unknown> | null
  onComplete: (drafts: LensMeasurementDraft[]) => void
  onBack: () => void
}) {
  const lenses = getLensMeasurementSaleItems(sale.items)
  const frames = getMountFrameItems(sale.items)
  const [drafts, setDrafts] = useState<LensMeasurementDraft[]>(() => buildInitialMeasurementDrafts(sale))
  const [ix, setIx] = useState(0)

  const n = drafts.length
  const cur = drafts[ix]
  const lens = useMemo(() => lenses.find((l) => l.id === cur?.saleItemId), [lenses, cur?.saleItemId])
  const { farR, farL } = useMemo(() => {
    if (lens?.prescription) return prescriptionReadoutForItem(lens)
    return prescriptionReadoutFromCustomerRx(customerPrescription)
  }, [lens, customerPrescription])

  const patch = (p: Partial<LensMeasurementDraft>) => {
    if (!cur) return
    setDrafts(updateDraftAt(drafts, ix, p))
  }

  const setCam = (saleItemId: string) => {
    setDrafts(updateDraftAt(drafts, ix, { saleItemId }))
  }

  const setFrameSel = (value: string) => {
    if (value === '__OWN__') {
      patch({ ownFrame: true, frameItemId: null })
      return
    }
    patch({ ownFrame: false, frameItemId: value || null })
  }

  const frameSelVal = cur?.ownFrame ? '__OWN__' : cur?.frameItemId ?? ''

  const ft = (id: LensOrderFrameTypeApi, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => patch({ frameType: id })}
      style={{
        padding: '10px 14px',
        borderRadius: '10px',
        border: cur?.frameType === id ? '2px solid #C8102E' : '1px solid #e5e7eb',
        backgroundColor: cur?.frameType === id ? '#fdf2f4' : '#fff',
        fontWeight: 800,
        fontSize: '13px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )

  const canContinueAll = allMeasurementDraftsComplete(drafts)

  if (!cur || n === 0) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ fontWeight: 800 }}>Ölçü kalemi yok.</div>
        <Button variant="secondary" onClick={onBack}>
          Geri
        </Button>
      </div>
    )
  }

  return (
    <div
      style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ fontWeight: 900, fontSize: '18px' }}>5. Ölçüler</div>

      {/* Bölüm 1 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
        <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 1: Ürün eşleştirme ──</div>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>
          Cam ürünü
          <select
            value={cur.saleItemId}
            onChange={(e) => setCam(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
          >
            {lenses.map((l, i) => (
              <option key={l.id} value={l.id}>
                {lensPairingLabel(l, i)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700 }}>
          Çerçeve / güneş gözlüğü
          <select
            value={frameSelVal}
            onChange={(e) => setFrameSel(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '6px', padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
          >
            <option value="">— Seçin —</option>
            {frames.map((f, fi) => (
              <option key={f.id} value={f.id}>
                Çerçeve {fi + 1} (
                {(() => {
                  const urunAdi =
                    f.odooProductName ||
                    (f.product?.name !== '__ODOO_PLACEHOLDER__' ? f.product?.name : null) ||
                    'Odoo Ürünü'
                  return urunAdi
                })()}
                )
              </option>
            ))}
            <option value="__OWN__">Kendi çerçevesi</option>
          </select>
        </label>
        {cur.ownFrame ? (
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginTop: '10px' }}>
            Kendi çerçevesi notu (montaj)
            <textarea
              value={cur.ownFrameNote}
              onChange={(e) => patch({ ownFrameNote: e.target.value })}
              rows={3}
              placeholder="Hangi çerçeve, marka/model…"
              style={{
                display: 'block',
                width: '100%',
                marginTop: '6px',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                fontSize: '13px',
              }}
            />
          </label>
        ) : null}
      </div>

      {/* Bölüm 2 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', backgroundColor: '#fafafa' }}>
        <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 2: Reçete (salt okunur) ──</div>
        <div style={{ fontSize: '12px', lineHeight: 1.55, marginBottom: '12px' }}>
          <div>
            <strong>Daimi R:</strong> {farR}
          </div>
          <div>
            <strong>Daimi L:</strong> {farL}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={cur.rightEyeActive} onChange={(e) => patch({ rightEyeActive: e.target.checked })} />
            Sağ göz aktif
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={cur.leftEyeActive} onChange={(e) => patch({ leftEyeActive: e.target.checked })} />
            Sol göz aktif
          </label>
        </div>
      </div>

      {/* Bölüm 3 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
        <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 3: Montaj ölçüleri ──</div>
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '8px' }}>
            Çerçeve tipi
            {star()}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {ft('KAPALI', 'Kapalı')}
            {ft('NILOR', 'Nilör')}
            {ft('FASET', 'Faset')}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
          <NumField
            label="RPH (sağ montaj yüksekliği)"
            value={cur.rph}
            onChange={(v) => patch({ rph: v })}
            required={cur.rightEyeActive}
            disabled={!cur.rightEyeActive}
          />
          <NumField
            label="LPH (sol montaj yüksekliği)"
            value={cur.lph}
            onChange={(v) => patch({ lph: v })}
            required={cur.leftEyeActive}
            disabled={!cur.leftEyeActive}
          />
          <NumField label="Koridor yüksekliği" value={cur.corridor} onChange={(v) => patch({ corridor: v })} required />
          <NumField
            label="Sağ çap"
            value={cur.rightDia}
            onChange={(v) => patch({ rightDia: v })}
            required={cur.rightEyeActive}
            disabled={!cur.rightEyeActive}
          />
          <NumField
            label="Sol çap"
            value={cur.leftDia}
            onChange={(v) => patch({ leftDia: v })}
            required={cur.leftEyeActive}
            disabled={!cur.leftEyeActive}
          />
          <NumField label="Vertex mesafesi (v)" value={cur.vertex} onChange={(v) => patch({ vertex: v })} required />
          <NumField label="Pantoskopik açı (p)" value={cur.pantoscopic} onChange={(v) => patch({ pantoscopic: v })} required />
          <NumField label="Çerçeve bombe açısı (W)" value={cur.frameBow} onChange={(v) => patch({ frameBow: v })} required />
        </div>
      </div>

      {/* Bölüm 4 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
        <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 4: Çerçeve ölçüleri ──</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
          <input type="checkbox" checked={cur.frameDimsEnabled} onChange={(e) => patch({ frameDimsEnabled: e.target.checked })} />
          Çerçeve ölçüleri
        </label>
        {cur.frameDimsEnabled ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginTop: '10px' }}>
            <NumField label="Şablon genişliği (A)" value={cur.templateA} onChange={(v) => patch({ templateA: v })} required />
            <NumField label="Şablon yüksekliği (B)" value={cur.templateB} onChange={(v) => patch({ templateB: v })} required />
            <NumField label="Köprü mesafesi (DBL)" value={cur.dbl} onChange={(v) => patch({ dbl: v })} required />
            <NumField label="Çapraz genişlik (ED)" value={cur.ed} onChange={(v) => patch({ ed: v })} required />
          </div>
        ) : null}
      </div>

      {/* Bölüm 5 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px' }}>
        <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 5: Opsiyonel alanlar ──</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={cur.customBaseEnabled} onChange={(e) => patch({ customBaseEnabled: e.target.checked })} />
            Özel baz
          </label>
          {cur.customBaseEnabled ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <label style={{ fontSize: '12px', fontWeight: 700 }}>
                Sağ baz
                <select
                  value={cur.customBaseRight}
                  onChange={(e) => patch({ customBaseRight: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '6px', padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                >
                  <option value="">—</option>
                  {BASE_OPTS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: '12px', fontWeight: 700 }}>
                Sol baz
                <select
                  value={cur.customBaseLeft}
                  onChange={(e) => patch({ customBaseLeft: e.target.value })}
                  style={{ display: 'block', width: '100%', marginTop: '6px', padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                >
                  <option value="">—</option>
                  {BASE_OPTS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={cur.prismEnabled} onChange={(e) => patch({ prismEnabled: e.target.checked })} />
            Prizma
          </label>
          {cur.prismEnabled ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', fontSize: '12px' }}>
              <NumField label="R P1" value={cur.prismR1Val} onChange={(v) => patch({ prismR1Val: v })} />
              <NumField label="R P1 aks" value={cur.prismR1Aks} onChange={(v) => patch({ prismR1Aks: v })} />
              <NumField label="R P2" value={cur.prismR2Val} onChange={(v) => patch({ prismR2Val: v })} />
              <NumField label="R P2 aks" value={cur.prismR2Aks} onChange={(v) => patch({ prismR2Aks: v })} />
              <NumField label="L P1" value={cur.prismL1Val} onChange={(v) => patch({ prismL1Val: v })} />
              <NumField label="L P1 aks" value={cur.prismL1Aks} onChange={(v) => patch({ prismL1Aks: v })} />
              <NumField label="L P2" value={cur.prismL2Val} onChange={(v) => patch({ prismL2Val: v })} />
              <NumField label="L P2 aks" value={cur.prismL2Aks} onChange={(v) => patch({ prismL2Aks: v })} />
            </div>
          ) : null}

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={cur.shiftSectionEnabled} onChange={(e) => patch({ shiftSectionEnabled: e.target.checked })} />
            Odak kaydırma
          </label>
          {cur.shiftSectionEnabled ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
              <div>
                <div style={{ fontWeight: 800, marginBottom: '6px' }}>R</div>
                {(
                  [
                    ['shiftRIn', 'shiftRInVal', 'İçe'],
                    ['shiftROut', 'shiftROutVal', 'Dışa'],
                    ['shiftRUp', 'shiftRUpVal', 'Yukarı'],
                    ['shiftRDown', 'shiftRDownVal', 'Aşağı'],
                  ] as const
                ).map(([ck, vk, lab]) => (
                  <label key={ck} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <input
                      type="checkbox"
                      checked={cur[ck]}
                      onChange={(e) => patch({ [ck]: e.target.checked } as Partial<LensMeasurementDraft>)}
                    />
                    {lab}
                    <input
                      type="number"
                      step={0.01}
                      value={cur[vk]}
                      disabled={!cur[ck]}
                      onChange={(e) => patch({ [vk]: e.target.value } as Partial<LensMeasurementDraft>)}
                      style={{ width: 72, padding: '4px 6px', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                    />
                  </label>
                ))}
              </div>
              <div>
                <div style={{ fontWeight: 800, marginBottom: '6px' }}>L</div>
                {(
                  [
                    ['shiftLIn', 'shiftLInVal', 'İçe'],
                    ['shiftLOut', 'shiftLOutVal', 'Dışa'],
                    ['shiftLUp', 'shiftLUpVal', 'Yukarı'],
                    ['shiftLDown', 'shiftLDownVal', 'Aşağı'],
                  ] as const
                ).map(([ck, vk, lab]) => (
                  <label key={ck} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <input
                      type="checkbox"
                      checked={cur[ck]}
                      onChange={(e) => patch({ [ck]: e.target.checked } as Partial<LensMeasurementDraft>)}
                    />
                    {lab}
                    <input
                      type="number"
                      step={0.01}
                      value={cur[vk]}
                      disabled={!cur[ck]}
                      onChange={(e) => patch({ [vk]: e.target.value } as Partial<LensMeasurementDraft>)}
                      style={{ width: 72, padding: '4px 6px', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" checked={cur.engravingEnabled} onChange={(e) => patch({ engravingEnabled: e.target.checked })} />
            Özel engraving (max 3 karakter)
          </label>
          {cur.engravingEnabled ? (
            <input
              value={cur.engraving}
              maxLength={3}
              onChange={(e) => patch({ engraving: e.target.value.replace(/[^a-zA-Z0-9]/g, '') })}
              style={{ maxWidth: 120, padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <Button variant="secondary" onClick={onBack}>
          ← Geri
        </Button>
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#6b7280' }}>
          {ix + 1} / {n} eşleşme
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {ix > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                setIx((i) => Math.max(0, i - 1))
              }}
            >
              ← Önceki
            </Button>
          ) : null}
          {ix < n - 1 ? (
            <Button
              onClick={() => {
                setIx((i) => Math.min(n - 1, i + 1))
              }}
            >
              Sonraki →
            </Button>
          ) : (
            <Button disabled={!canContinueAll} onClick={() => onComplete(drafts)}>
              Onaya Geç →
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
