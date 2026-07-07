import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { Sale } from '../../api/types'
import Button from '../ui/Button'
import {
  allMeasurementDraftsComplete,
  buildInitialMeasurementDrafts,
  getLensMeasurementSaleItems,
  prescriptionReadoutForItem,
  prescriptionReadoutFromCustomerRx,
  type LensMeasurementDraft,
  type LensOrderFrameTypeApi,
  updateDraftAt,
} from '../../utils/saleMeasurements'

const BASE_OPTS = ['1', '2', '3', '4', '5', '6']

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
  const [drafts, setDrafts] = useState<LensMeasurementDraft[]>(() => buildInitialMeasurementDrafts(sale))
  const [ix, setIx] = useState(0)
  const [activeIx, setActiveIx] = useState<number | null>(null)

  useEffect(() => {
    if (activeIx !== null) setIx(activeIx)
  }, [activeIx])

  const cur = activeIx !== null ? drafts[activeIx] : null
  const lens = useMemo(() => lenses.find((l) => l.id === cur?.saleItemId), [lenses, cur?.saleItemId])

  if (lenses.length === 0) {
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
    <div style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>5. Ölçümler</div>

      {/* Grup listesi */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {drafts.map((draft, i) => {
          const isDone = draft && (draft.rph || draft.lph || draft.corridor)
          const groupLenses = draft.saleItemIds
            .map((id) => lenses.find((l) => l.id === id))
            .filter(Boolean) as typeof lenses
          const urunOzet = groupLenses
            .map((l) => l.odooProductName || l.product?.name || 'Cam')
            .join(' · ')
          return (
            <div
              key={draft.groupLabel ? `${draft.groupLabel}-${i}` : draft.saleItemId}
              style={{
                border: `1px solid ${isDone ? '#10b981' : '#e5e7eb'}`,
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{draft.groupLabel ?? urunOzet}</div>
                {draft.groupLabel ? (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{urunOzet}</div>
                ) : null}
                {groupLenses.length > 1 ? (
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{groupLenses.length} cam kalemi</div>
                ) : null}
                {isDone ? <div style={{ fontSize: 11, color: '#10b981', marginTop: 2 }}>✓ Ölçüm girildi</div> : null}
              </div>
              <button
                type="button"
                onClick={() => setActiveIx(i)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: `1px solid ${isDone ? '#10b981' : '#C8102E'}`,
                  backgroundColor: 'white',
                  color: isDone ? '#10b981' : '#C8102E',
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {isDone ? '✏️ Düzenle' : '+ Ölçüm Ekle'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Alt butonlar */}
      <div style={{ display: 'flex', gap: 10 }}>
        <Button onClick={onBack}>← Geri</Button>
        <Button disabled={!allMeasurementDraftsComplete(drafts)} onClick={() => onComplete(drafts)}>
          Onaya Geç →
        </Button>
      </div>

      {/* Ölçüm formu popup */}
      {activeIx !== null && drafts[activeIx]
        ? (() => {
            const i = activeIx
            const draft = drafts[i]
            const activeLens = lenses.find((l) => l.id === draft.saleItemId) ?? lenses[i]
            const { farR, farL } = activeLens?.prescription
              ? prescriptionReadoutForItem(activeLens)
              : prescriptionReadoutFromCustomerRx(customerPrescription)
            const patchActive = (p: Partial<LensMeasurementDraft>) => {
              setDrafts(updateDraftAt(drafts, i, p))
            }
            const urunAdi = draft.groupLabel
              ?? (activeLens?.odooProductName || activeLens?.product?.name || 'Cam')
            const frameSelVal = draft.ownFrame ? '__OWN__' : draft.frameItemId ?? ''
            const ft = (id: LensOrderFrameTypeApi, label: string) => (
              <button
                key={id}
                type="button"
                onClick={() => patchActive({ frameType: id })}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: draft.frameType === id ? '2px solid #C8102E' : '1px solid #e5e7eb',
                  backgroundColor: draft.frameType === id ? '#fdf2f4' : '#fff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )

            return (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  zIndex: 1000,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                <div
                  style={{
                    backgroundColor: 'white',
                    borderRadius: 16,
                    padding: 24,
                    width: '100%',
                    maxWidth: 640,
                    maxHeight: '90vh',
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ fontWeight: 900, fontSize: 15 }}>{urunAdi} — Ölçümler</div>
                    <button
                      type="button"
                      onClick={() => setActiveIx(null)}
                      style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Reçete özeti */}
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, color: '#6b7280', fontSize: 11, marginBottom: 8 }}>REÇETE</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#C8102E', marginBottom: 6 }}>SAĞ GÖZ</div>
                        {(
                          [
                            ['SPH', farR.split(' / ')[0]],
                            ['CYL', farR.split(' / ')[1]],
                            ['AKS', farR.split(' / ')[2]],
                            ['ADD', farR.split(' / ')[3]],
                          ] as const
                        ).map(([label, val]) => (
                          <div key={label} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#6b7280' }}>{label}</span>
                            <span>{val ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ backgroundColor: '#eff6ff', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', marginBottom: 6 }}>SOL GÖZ</div>
                        {(
                          [
                            ['SPH', farL.split(' / ')[0]],
                            ['CYL', farL.split(' / ')[1]],
                            ['AKS', farL.split(' / ')[2]],
                            ['ADD', farL.split(' / ')[3]],
                          ] as const
                        ).map(([label, val]) => (
                          <div key={label} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#6b7280' }}>{label}</span>
                            <span>{val ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* BÖLÜM 1: Göz aktif */}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', marginBottom: 14, backgroundColor: '#fafafa' }}>
                    <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 1: Göz aktif ──</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={draft.rightEyeActive}
                          onChange={(e) => patchActive({ rightEyeActive: e.target.checked })}
                        />
                        Sağ göz aktif
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={draft.leftEyeActive}
                          onChange={(e) => patchActive({ leftEyeActive: e.target.checked })}
                        />
                        Sol göz aktif
                      </label>
                    </div>
                  </div>

                  {/* BÖLÜM 2: Montaj ölçüleri */}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', marginBottom: 14 }}>
                    <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 2: Montaj ölçüleri ──</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                      <NumField
                        label="RPH (sağ montaj yüksekliği)"
                        value={draft.rph}
                        onChange={(v) => patchActive({ rph: v })}
                        required={draft.rightEyeActive}
                        disabled={!draft.rightEyeActive}
                      />
                      <NumField
                        label="LPH (sol montaj yüksekliği)"
                        value={draft.lph}
                        onChange={(v) => patchActive({ lph: v })}
                        required={draft.leftEyeActive}
                        disabled={!draft.leftEyeActive}
                      />
                      <NumField label="Koridor yüksekliği" value={draft.corridor} onChange={(v) => patchActive({ corridor: v })} required />
                      <NumField
                        label="Sağ çap"
                        value={draft.rightDia}
                        onChange={(v) => patchActive({ rightDia: v })}
                        required={draft.rightEyeActive}
                        disabled={!draft.rightEyeActive}
                      />
                      <NumField
                        label="Sol çap"
                        value={draft.leftDia}
                        onChange={(v) => patchActive({ leftDia: v })}
                        required={draft.leftEyeActive}
                        disabled={!draft.leftEyeActive}
                      />
                      <NumField label="Vertex mesafesi (v)" value={draft.vertex} onChange={(v) => patchActive({ vertex: v })} required />
                      <NumField label="Pantoskopik açı (p)" value={draft.pantoscopic} onChange={(v) => patchActive({ pantoscopic: v })} required />
                      <NumField label="Çerçeve bombe açısı (W)" value={draft.frameBow} onChange={(v) => patchActive({ frameBow: v })} required />
                    </div>
                  </div>

                  {/* BÖLÜM 3: Çerçeve tipi */}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', marginBottom: 14 }}>
                    <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 3: Çerçeve tipi ──</div>
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
                  </div>

                  {/* BÖLÜM 4: Çerçeve ölçüleri */}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', marginBottom: 14 }}>
                    <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 4: Çerçeve ölçüleri ──</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={draft.frameDimsEnabled}
                        onChange={(e) => patchActive({ frameDimsEnabled: e.target.checked })}
                      />
                      Çerçeve ölçüleri
                    </label>
                    {draft.frameDimsEnabled ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginTop: '10px' }}>
                        <NumField label="Şablon genişliği (A)" value={draft.templateA} onChange={(v) => patchActive({ templateA: v })} required />
                        <NumField label="Şablon yüksekliği (B)" value={draft.templateB} onChange={(v) => patchActive({ templateB: v })} required />
                        <NumField label="Köprü mesafesi (DBL)" value={draft.dbl} onChange={(v) => patchActive({ dbl: v })} required />
                        <NumField label="Çapraz genişlik (ED)" value={draft.ed} onChange={(v) => patchActive({ ed: v })} required />
                      </div>
                    ) : null}
                  </div>

                  {/* BÖLÜM 5–8: Opsiyonel alanlar */}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px', marginBottom: 14 }}>
                    <div style={{ fontWeight: 800, marginBottom: '10px', fontSize: '14px' }}>── Bölüm 5–8: Opsiyonel alanlar ──</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '8px' }}>Bölüm 5: Özel baz</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={draft.customBaseEnabled}
                            onChange={(e) => patchActive({ customBaseEnabled: e.target.checked })}
                          />
                          Özel baz
                        </label>
                        {draft.customBaseEnabled ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 700 }}>
                              Sağ baz
                              <select
                                value={draft.customBaseRight}
                                onChange={(e) => patchActive({ customBaseRight: e.target.value })}
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
                                value={draft.customBaseLeft}
                                onChange={(e) => patchActive({ customBaseLeft: e.target.value })}
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
                      </div>

                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '8px' }}>Bölüm 6: Prizma</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={draft.prismEnabled} onChange={(e) => patchActive({ prismEnabled: e.target.checked })} />
                          Prizma
                        </label>
                        {draft.prismEnabled ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', fontSize: '12px', marginTop: '10px' }}>
                            <NumField label="R P1" value={draft.prismR1Val} onChange={(v) => patchActive({ prismR1Val: v })} />
                            <NumField label="R P1 aks" value={draft.prismR1Aks} onChange={(v) => patchActive({ prismR1Aks: v })} />
                            <NumField label="R P2" value={draft.prismR2Val} onChange={(v) => patchActive({ prismR2Val: v })} />
                            <NumField label="R P2 aks" value={draft.prismR2Aks} onChange={(v) => patchActive({ prismR2Aks: v })} />
                            <NumField label="L P1" value={draft.prismL1Val} onChange={(v) => patchActive({ prismL1Val: v })} />
                            <NumField label="L P1 aks" value={draft.prismL1Aks} onChange={(v) => patchActive({ prismL1Aks: v })} />
                            <NumField label="L P2" value={draft.prismL2Val} onChange={(v) => patchActive({ prismL2Val: v })} />
                            <NumField label="L P2 aks" value={draft.prismL2Aks} onChange={(v) => patchActive({ prismL2Aks: v })} />
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '8px' }}>Bölüm 7: Odak kaydırma</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={draft.shiftSectionEnabled}
                            onChange={(e) => patchActive({ shiftSectionEnabled: e.target.checked })}
                          />
                          Odak kaydırma
                        </label>
                        {draft.shiftSectionEnabled ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', marginTop: '10px' }}>
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
                                    checked={draft[ck]}
                                    onChange={(e) => patchActive({ [ck]: e.target.checked } as Partial<LensMeasurementDraft>)}
                                  />
                                  {lab}
                                  <input
                                    type="number"
                                    step={0.01}
                                    value={draft[vk]}
                                    disabled={!draft[ck]}
                                    onChange={(e) => patchActive({ [vk]: e.target.value } as Partial<LensMeasurementDraft>)}
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
                                    checked={draft[ck]}
                                    onChange={(e) => patchActive({ [ck]: e.target.checked } as Partial<LensMeasurementDraft>)}
                                  />
                                  {lab}
                                  <input
                                    type="number"
                                    step={0.01}
                                    value={draft[vk]}
                                    disabled={!draft[ck]}
                                    onChange={(e) => patchActive({ [vk]: e.target.value } as Partial<LensMeasurementDraft>)}
                                    style={{ width: 72, padding: '4px 6px', borderRadius: '6px', border: '1px solid #e5e7eb' }}
                                  />
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13px', marginBottom: '8px' }}>Bölüm 8: Özel engraving</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={draft.engravingEnabled}
                            onChange={(e) => patchActive({ engravingEnabled: e.target.checked })}
                          />
                          Özel engraving (max 3 karakter)
                        </label>
                        {draft.engravingEnabled ? (
                          <input
                            value={draft.engraving}
                            maxLength={3}
                            onChange={(e) => patchActive({ engraving: e.target.value.replace(/[^a-zA-Z0-9]/g, '') })}
                            style={{ maxWidth: 120, padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', marginTop: '8px' }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setActiveIx(null)}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid #e5e7eb',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Kapat
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveIx(null)
                      }}
                      style={{
                        flex: 1,
                        padding: 12,
                        borderRadius: 10,
                        border: 'none',
                        backgroundColor: '#C8102E',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 800,
                      }}
                    >
                      Kaydet
                    </button>
                  </div>
                </div>
              </div>
            )
          })()
        : null}
    </div>
  )
}
