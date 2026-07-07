import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { adminApi } from './AdminLayout'
import type { WarrantyClaim, WarrantyMessage } from '../../api/warranty.api'

const DURUM_LABEL: Record<string, string> = {
  OPEN: 'Açık',
  SENT_TO_SUPPLIER: 'Firmaya gönderildi',
  WAITING_RESPONSE: 'Yanıt bekleniyor',
  IN_RETURN_PROCESS: 'İade sürecinde',
  RESOLVED: 'Çözümlendi',
  OUT_OF_WARRANTY: 'Garanti dışı',
}

const DURUM_RENK: Record<string, { bg: string; color: string }> = {
  OPEN: { bg: '#fef9c3', color: '#854d0e' },
  SENT_TO_SUPPLIER: { bg: '#dbeafe', color: '#1e40af' },
  WAITING_RESPONSE: { bg: '#ede9fe', color: '#4c1d95' },
  IN_RETURN_PROCESS: { bg: '#fce7f3', color: '#831843' },
  RESOLVED: { bg: '#dcfce7', color: '#166534' },
  OUT_OF_WARRANTY: { bg: '#fee2e2', color: '#991b1b' },
}

const TUR_LABEL: Record<string, string> = {
  CUSTOMER_WARRANTY: 'Garanti (müşteri)',
  STOCK_WARRANTY: 'Garanti (stok)',
  SATISFACTION_RETURN: 'Memnuniyet iadesi',
  EXCESS_ORDER_RETURN: 'Fazla sipariş iadesi',
}

const RESULT_LABEL: Record<string, string> = {
  PENDING: 'Bekliyor',
  NEW_PRODUCT: 'Yeni ürün',
  PART_FREE: 'Parça (ücretsiz)',
  PART_PAID: 'Parça (ücretli)',
  POINTS_LOADED: 'Puan yüklendi',
  OUT_OF_WARRANTY_FEE: 'Garanti dışı (ücretli)',
  OUT_OF_WARRANTY_REJECTED: 'Garanti dışı (red)',
  REFUNDED: 'Ödeme iadesi',
  RESTOCKED: 'Stoka alındı',
}

const TRANSFER_STATUS_LABEL: Record<string, string> = {
  NOT_REQUIRED: 'Transfer gerekmez',
  PENDING: 'Transfer bekliyor',
  COMPLETED: 'Transfer tamamlandı',
}

const OUTCOME_LABEL: Record<string, string> = {
  UNKNOWN: 'Belirsiz',
  NEW_PRODUCT: 'Yeni ürün',
  REPAIR: 'Onarım',
  POINTS: 'Puan',
  REFUND: 'İade',
}

type AdminRole = 'ADMIN' | 'STORE_MANAGER' | 'WAREHOUSE_MANAGER'

type ClaimDetail = WarrantyClaim & {
  saleId?: string | null
  returnBranchId?: string | null
  cargoTrackingNo?: string | null
  returnDeadline?: string | null
  adminApprovedAt?: string | null
  adminApprovedBy?: string | null
  userId?: string | null
  transferSourceBranchId?: string | null
  transferStatus?: string | null
  odooPickingId?: string | null
  managerApprovedAt?: string | null
  managerApprovedBy?: string | null
  refundAmount?: string | number | null
  refundMethod?: string | null
}

function isActionableType(type: string) {
  return type === 'CUSTOMER_WARRANTY' || type === 'STOCK_WARRANTY' || type === 'EXCESS_ORDER_RETURN'
}

function getAllowedStatuses(current: string, role: AdminRole): string[] {
  const all = Object.keys(DURUM_LABEL)
  if (role === 'STORE_MANAGER') return current === 'OPEN' ? ['OPEN'] : [current]
  if (role === 'ADMIN') return all
  const forward: Record<string, string[]> = {
    OPEN: ['OPEN', 'SENT_TO_SUPPLIER'],
    SENT_TO_SUPPLIER: ['SENT_TO_SUPPLIER', 'IN_RETURN_PROCESS'],
    WAITING_RESPONSE: ['WAITING_RESPONSE', 'IN_RETURN_PROCESS'],
    IN_RETURN_PROCESS: ['IN_RETURN_PROCESS'],
    RESOLVED: ['RESOLVED'],
    OUT_OF_WARRANTY: ['OUT_OF_WARRANTY'],
  }
  return forward[current] ?? [current]
}

function toDateInputValue(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  fontSize: 13,
  boxSizing: 'border-box',
}

export default function WarrantyDetailPanel({
  claimId,
  open,
  onClose,
  onUpdated,
  role,
  adminUserId,
  branches,
  subeMap,
  supplierSuggestions,
}: {
  claimId: string | null
  open: boolean
  onClose: () => void
  onUpdated: () => void
  role: AdminRole
  adminUserId?: string
  branches: Array<{ id: string; name?: string; code?: string }>
  subeMap: Record<string, string>
  supplierSuggestions: string[]
}) {
  const canApprove = role === 'ADMIN'
  const canSendToSupplier = role === 'ADMIN' || role === 'WAREHOUSE_MANAGER'
  const isStoreManager = role === 'STORE_MANAGER'
  const isWarehouseOrAdmin = role === 'ADMIN' || role === 'WAREHOUSE_MANAGER'

  const [claim, setClaim] = useState<ClaimDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mesaj, setMesaj] = useState('')

  const [status, setStatus] = useState('')
  const [result, setResult] = useState('PENDING')
  const [expectedOutcome, setExpectedOutcome] = useState('UNKNOWN')
  const [supplierName, setSupplierName] = useState('')
  const [returnBranchId, setReturnBranchId] = useState('')
  const [cargoTrackingNo, setCargoTrackingNo] = useState('')
  const [returnDeadline, setReturnDeadline] = useState('')
  const [problemDesc, setProblemDesc] = useState('')
  const [transferSourceBranchId, setTransferSourceBranchId] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundMethod, setRefundMethod] = useState('Nakit')
  const [showRefundForm, setShowRefundForm] = useState(false)

  const loadClaim = useCallback(async () => {
    if (!claimId) return
    setLoading(true)
    try {
      const res = await adminApi.get(`/warranty/${claimId}`)
      const c = res.data as ClaimDetail
      setClaim(c)
      setStatus(c.status)
      setResult(c.result ?? 'PENDING')
      setExpectedOutcome(c.expectedOutcome ?? 'UNKNOWN')
      setSupplierName(c.supplierName ?? '')
      setReturnBranchId(c.returnBranchId ?? '')
      setCargoTrackingNo(c.cargoTrackingNo ?? '')
      setReturnDeadline(toDateInputValue(c.returnDeadline))
      setProblemDesc(c.problemDesc ?? '')
      setTransferSourceBranchId(c.transferSourceBranchId ?? '')
      setRefundAmount(c.refundAmount != null ? String(c.refundAmount) : '')
      setRefundMethod(c.refundMethod ?? 'Nakit')
      setShowRefundForm(false)
    } catch {
      setClaim(null)
    } finally {
      setLoading(false)
    }
  }, [claimId])

  useEffect(() => {
    if (open && claimId) void loadClaim()
    if (!open) {
      setClaim(null)
      setMesaj('')
    }
  }, [open, claimId, loadClaim])

  if (!open || !claimId) return null

  const actionable = claim ? isActionableType(claim.type) : false
  const satisfactionOnly = claim?.type === 'SATISFACTION_RETURN'
  const storeCanEdit = Boolean(
    claim && isStoreManager && claim.status === 'OPEN' && claim.userId === adminUserId,
  )
  const fieldsDisabled = !actionable || satisfactionOnly || (isStoreManager && !storeCanEdit)
  const showActions = actionable && !satisfactionOnly

  const statusRenk = claim ? (DURUM_RENK[claim.status] ?? { bg: '#f3f4f6', color: '#374151' }) : null
  const adminApproved = Boolean(claim?.adminApprovedAt)
  const canTransfer = role === 'ADMIN' || role === 'WAREHOUSE_MANAGER'
  const canManagerApprove = role === 'WAREHOUSE_MANAGER'
  const canSetSatisfactionResult = canTransfer && Boolean(claim?.managerApprovedAt)
  const satisfactionResultDone = claim?.result === 'REFUNDED' || claim?.result === 'RESTOCKED'
  const transferStatus = claim?.transferStatus ?? 'NOT_REQUIRED'
  const managerApproved = Boolean(claim?.managerApprovedAt)

  async function kaydet() {
    if (!claim) return
    setSaving(true)
    try {
      await adminApi.patch(`/warranty/claims/${claim.id}/status`, {
        status,
        supplierName: supplierName || undefined,
        returnBranchId: returnBranchId || undefined,
        cargoTrackingNo: cargoTrackingNo || undefined,
        returnDeadline: returnDeadline || undefined,
        expectedOutcome,
      })
      await loadClaim()
      onUpdated()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function tedarikciyeGonder() {
    if (!claim || !supplierName.trim() || !returnBranchId) {
      alert('Tedarikçi adı ve iade şubesi seçilmelidir.')
      return
    }
    setSaving(true)
    try {
      await adminApi.patch(`/warranty/claims/${claim.id}/status`, {
        status: 'SENT_TO_SUPPLIER',
        supplierName,
        returnBranchId,
        returnDeadline: returnDeadline || undefined,
        expectedOutcome,
      })
      await loadClaim()
      onUpdated()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Gönderim başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function sonucGir() {
    if (!claim || result === 'PENDING') {
      alert('Lütfen bir sonuç seçin.')
      return
    }
    setSaving(true)
    try {
      await adminApi.patch(`/warranty/claims/${claim.id}/result`, {
        result,
        problemDesc: problemDesc || undefined,
        expectedOutcome,
      })
      await loadClaim()
      onUpdated()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Sonuç kaydı başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function transferBaslat() {
    if (!claim || !transferSourceBranchId) {
      alert('Kaynak şube seçilmelidir.')
      return
    }
    setSaving(true)
    try {
      await adminApi.post(`/warranty/claims/${claim.id}/transfer`, { transferSourceBranchId })
      await loadClaim()
      onUpdated()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Transfer başlatılamadı')
    } finally {
      setSaving(false)
    }
  }

  async function transferTamamla() {
    if (!claim) return
    setSaving(true)
    try {
      await adminApi.patch(`/warranty/claims/${claim.id}/transfer/complete`, {})
      await loadClaim()
      onUpdated()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Transfer tamamlanamadı')
    } finally {
      setSaving(false)
    }
  }

  async function depoYoneticisiOnayla() {
    if (!claim) return
    setSaving(true)
    try {
      await adminApi.patch(`/warranty/claims/${claim.id}/manager-approve`)
      await loadClaim()
      onUpdated()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Onay başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function satisfactionSonucGir(nextResult: 'RESTOCKED' | 'REFUNDED') {
    if (!claim) return
    if (nextResult === 'REFUNDED' && (!refundAmount.trim() || !refundMethod.trim())) {
      alert('İade tutarı ve yöntemi zorunludur.')
      return
    }
    setSaving(true)
    try {
      await adminApi.patch(`/warranty/claims/${claim.id}/result`, {
        result: nextResult,
        ...(nextResult === 'REFUNDED'
          ? { refundAmount: Number(refundAmount), refundMethod: refundMethod }
          : {}),
      })
      setShowRefundForm(false)
      await loadClaim()
      onUpdated()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Sonuç kaydı başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function onayla() {
    if (!claim) return
    setSaving(true)
    try {
      await adminApi.patch(`/warranty/claims/${claim.id}/approve`)
      await loadClaim()
      onUpdated()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Onay başarısız')
    } finally {
      setSaving(false)
    }
  }

  async function mesajGonder() {
    if (!claim || !mesaj.trim()) return
    try {
      await adminApi.post(`/warranty/claims/${claim.id}/messages`, { message: mesaj })
      setMesaj('')
      await loadClaim()
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Mesaj gönderilemedi')
    }
  }

  function renderField(
    label: string,
    value: React.ReactNode,
    edit?: React.ReactNode,
  ) {
    return (
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>
          {label}
        </label>
        {fieldsDisabled ? (
          <div style={{ fontSize: 13, color: '#1a1a2e' }}>{value || '—'}</div>
        ) : (
          edit
        )}
      </div>
    )
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000 }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(480px, 100vw)',
          height: '100vh',
          background: 'white',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            {loading ? (
              <div style={{ fontWeight: 800, fontSize: 16 }}>Yükleniyor...</div>
            ) : claim ? (
              <>
                <div style={{ fontWeight: 900, fontSize: 17, color: '#C8102E', marginBottom: 8 }}>{claim.claimNo}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: statusRenk!.bg, color: statusRenk!.color, fontWeight: 700 }}>
                    {DURUM_LABEL[claim.status] ?? claim.status}
                  </span>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: '#f3f4f6', color: '#374151', fontWeight: 700 }}>
                    {TUR_LABEL[claim.type] ?? claim.type}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ color: '#991b1b' }}>Kayıt yüklenemedi</div>
            )}
          </div>
          <button type="button" onClick={onClose} style={{ border: 'none', background: '#f3f4f6', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
          {claim && (
            <>
              <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Ürün</div>
                <div><b>{claim.productName ?? '—'}</b></div>
                {claim.lotNo && <div style={{ marginTop: 4 }}>Lot/Seri: {claim.lotNo}</div>}
                {claim.barcode && <div>Barkod: {claim.barcode}</div>}
              </div>

              <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Satış / Müşteri</div>
                {claim.saleId && (
                  <div style={{ marginBottom: 4 }}>
                    Satış: <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{claim.saleId.slice(0, 8)}…</span>
                  </div>
                )}
                <div>{claim.customer?.name ?? '—'}</div>
                {claim.customer?.phone && <div style={{ color: '#6b7280' }}>{claim.customer.phone}</div>}
                <div style={{ marginTop: 4, color: '#6b7280' }}>
                  {satisfactionOnly ? 'İade alan şube' : 'Şube'}: {subeMap[claim.branchId ?? ''] ?? claim.branchId ?? '—'}
                </div>
              </div>

              {satisfactionOnly && (
                <div style={{ marginBottom: 16, padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', marginBottom: 10 }}>
                    Müşteri İadesi Akışı
                  </div>

                  {transferStatus !== 'NOT_REQUIRED' && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: transferStatus === 'COMPLETED' ? '#dcfce7' : '#fef9c3', color: transferStatus === 'COMPLETED' ? '#166534' : '#854d0e', fontWeight: 700 }}>
                        {TRANSFER_STATUS_LABEL[transferStatus] ?? transferStatus}
                      </span>
                      {claim.transferSourceBranchId && (
                        <div style={{ fontSize: 12, color: '#374151', marginTop: 6 }}>
                          Kaynak şube: {subeMap[claim.transferSourceBranchId] ?? claim.transferSourceBranchId}
                        </div>
                      )}
                    </div>
                  )}

                  {canTransfer && transferStatus === 'NOT_REQUIRED' && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Kaynak şube (transfer)</label>
                      <select value={transferSourceBranchId} onChange={(e) => setTransferSourceBranchId(e.target.value)} style={fieldStyle}>
                        <option value="">Seçin</option>
                        {branches.filter((b) => b.id !== claim.branchId).map((b) => (
                          <option key={b.id} value={b.id}>{b.name ?? b.code ?? b.id}</option>
                        ))}
                      </select>
                      <button type="button" disabled={saving || !transferSourceBranchId} onClick={() => void transferBaslat()} style={{ marginTop: 8, width: '100%', padding: 10, borderRadius: 8, background: '#1e40af', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                        Transfer Başlat
                      </button>
                    </div>
                  )}

                  {canTransfer && transferStatus === 'PENDING' && (
                    <button type="button" disabled={saving} onClick={() => void transferTamamla()} style={{ width: '100%', padding: 10, borderRadius: 8, background: '#0f766e', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, marginBottom: 10 }}>
                      Transfer Tamamlandı
                    </button>
                  )}

                  {canManagerApprove && (
                    managerApproved ? (
                      <div style={{ marginBottom: 10, fontSize: 12, color: '#166534', background: '#dcfce7', padding: '8px 12px', borderRadius: 8 }}>
                        ✅ Depo Yöneticisi Onayı — {claim.managerApprovedAt ? new Date(claim.managerApprovedAt).toLocaleString('tr-TR') : ''}
                        {claim.managerApprovedBy ? ` — ${claim.managerApprovedBy}` : ''}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={saving || transferStatus !== 'COMPLETED'}
                        title={transferStatus !== 'COMPLETED' ? 'Önce transfer tamamlanmalı' : undefined}
                        onClick={() => void depoYoneticisiOnayla()}
                        style={{ width: '100%', padding: 10, borderRadius: 8, background: transferStatus === 'COMPLETED' ? '#166534' : '#9ca3af', color: 'white', border: 'none', cursor: transferStatus === 'COMPLETED' ? 'pointer' : 'not-allowed', fontWeight: 700, marginBottom: 10 }}
                      >
                        Depo Yöneticisi Onayı
                      </button>
                    )
                  )}

                  {!canManagerApprove && managerApproved && (
                    <div style={{ marginBottom: 10, fontSize: 12, color: '#166534', background: '#dcfce7', padding: '8px 12px', borderRadius: 8 }}>
                      ✅ Depo Yöneticisi Onayı — {claim.managerApprovedAt ? new Date(claim.managerApprovedAt).toLocaleString('tr-TR') : ''}
                      {claim.managerApprovedBy ? ` — ${claim.managerApprovedBy}` : ''}
                    </div>
                  )}

                  {satisfactionResultDone ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', padding: '10px 12px', background: '#f3f4f6', borderRadius: 8 }}>
                      Sonuç: {RESULT_LABEL[claim.result] ?? claim.result}
                      {claim.result === 'REFUNDED' && claim.refundAmount != null && (
                        <div style={{ fontSize: 12, fontWeight: 500, marginTop: 4, color: '#374151' }}>
                          {Number(claim.refundAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ — {claim.refundMethod ?? '—'}
                        </div>
                      )}
                    </div>
                  ) : canTransfer && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>Sonuç</div>
                      {!canSetSatisfactionResult ? (
                        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }} title="Önce depo yöneticisi onayı gerekli">
                          Önce depo yöneticisi onayı gerekli
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <button type="button" disabled={saving || showRefundForm} onClick={() => void satisfactionSonucGir('RESTOCKED')} style={{ padding: 14, borderRadius: 8, background: '#374151', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                              📦 Stoka Al
                            </button>
                            <button type="button" disabled={saving} onClick={() => setShowRefundForm(true)} style={{ padding: 14, borderRadius: 8, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                              💰 Ödeme İadesi
                            </button>
                          </div>
                          {showRefundForm && (
                            <div style={{ padding: 12, background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8 }}>
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>İade tutarı (₺)</label>
                              <input type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} style={{ ...fieldStyle, marginBottom: 8 }} />
                              <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Yöntem</label>
                              <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} style={{ ...fieldStyle, marginBottom: 8 }}>
                                <option value="Nakit">Nakit</option>
                                <option value="Kart">Kart</option>
                              </select>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button type="button" disabled={saving} onClick={() => void satisfactionSonucGir('REFUNDED')} style={{ flex: 1, padding: 10, borderRadius: 8, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                                  İadeyi Kaydet
                                </button>
                                <button type="button" onClick={() => setShowRefundForm(false)} style={{ padding: '10px 12px', borderRadius: 8, background: '#f3f4f6', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                                  İptal
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {!satisfactionOnly && (
              <div style={{ marginBottom: 16 }}>
                {renderField(
                  'Durum',
                  DURUM_LABEL[status] ?? status,
                  <select value={status} onChange={(e) => setStatus(e.target.value)} style={fieldStyle} disabled={fieldsDisabled}>
                    {getAllowedStatuses(claim.status, role).map((s) => (
                      <option key={s} value={s}>{DURUM_LABEL[s] ?? s}</option>
                    ))}
                  </select>,
                )}
                {renderField(
                  'Sonuç',
                  RESULT_LABEL[result] ?? result,
                  <select value={result} onChange={(e) => setResult(e.target.value)} style={fieldStyle} disabled={fieldsDisabled || !isWarehouseOrAdmin}>
                    {Object.entries(RESULT_LABEL).filter(([k]) => k !== 'REFUNDED' && k !== 'RESTOCKED').map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>,
                )}
                {renderField(
                  'Beklenen sonuç',
                  OUTCOME_LABEL[expectedOutcome] ?? expectedOutcome,
                  <select value={expectedOutcome} onChange={(e) => setExpectedOutcome(e.target.value)} style={fieldStyle} disabled={fieldsDisabled}>
                    {Object.entries(OUTCOME_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>,
                )}
                {renderField(
                  'Tedarikçi',
                  supplierName,
                  <>
                    <input
                      list="warranty-suppliers"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      style={fieldStyle}
                      placeholder="Tedarikçi adı"
                    />
                    <datalist id="warranty-suppliers">
                      {supplierSuggestions.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </>,
                )}
                {renderField(
                  'İade şubesi',
                  subeMap[returnBranchId] ?? returnBranchId,
                  <select value={returnBranchId} onChange={(e) => setReturnBranchId(e.target.value)} style={fieldStyle} disabled={fieldsDisabled}>
                    <option value="">Seçin</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name ?? b.code ?? b.id}</option>
                    ))}
                  </select>,
                )}
                {renderField(
                  'Kargo takip no',
                  cargoTrackingNo,
                  <input value={cargoTrackingNo} onChange={(e) => setCargoTrackingNo(e.target.value)} style={fieldStyle} />,
                )}
                {renderField(
                  'İade son tarihi',
                  returnDeadline ? new Date(returnDeadline).toLocaleDateString('tr-TR') : '—',
                  <input type="date" value={returnDeadline} onChange={(e) => setReturnDeadline(e.target.value)} style={fieldStyle} />,
                )}
                {renderField(
                  'Sorun açıklaması',
                  problemDesc || '—',
                  <textarea value={problemDesc} onChange={(e) => setProblemDesc(e.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }} />,
                )}
              </div>
              )}

              {!satisfactionOnly && adminApproved && (
                <div style={{ marginBottom: 14, fontSize: 12, color: '#166534', background: '#dcfce7', padding: '8px 12px', borderRadius: 8 }}>
                  ✅ Onaylandı — {claim.adminApprovedAt ? new Date(claim.adminApprovedAt).toLocaleString('tr-TR') : ''}
                  {claim.adminApprovedBy ? ` — ${claim.adminApprovedBy}` : ''}
                </div>
              )}

              <div style={{ marginBottom: 8, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Notlar</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8, maxHeight: 160, overflowY: 'auto' }}>
                  {(claim.messages ?? []).map((m: WarrantyMessage) => (
                    <div key={m.id} style={{ background: 'white', borderRadius: 6, padding: '7px 10px', border: '1px solid #e5e7eb', fontSize: 12 }}>
                      <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>
                        {m.user?.name ?? m.user?.username} · {new Date(m.createdAt).toLocaleString('tr-TR')}
                      </div>
                      {m.message}
                    </div>
                  ))}
                  {(claim.messages ?? []).length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>Henüz not yok.</div>}
                </div>
                {!(satisfactionOnly && isStoreManager) && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={mesaj}
                    onChange={(e) => setMesaj(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void mesajGonder()}
                    placeholder="+ Not ekle"
                    style={{ flex: 1, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }}
                  />
                  <button type="button" onClick={() => void mesajGonder()} style={{ padding: '8px 12px', borderRadius: 6, background: '#1a1a2e', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                    Ekle
                  </button>
                </div>
                )}
              </div>
            </>
          )}
        </div>

        {showActions && claim && (
          <div style={{ padding: '12px 18px', borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(isStoreManager ? storeCanEdit : true) && (
              <button type="button" disabled={saving} onClick={() => void kaydet()} style={{ flex: 1, minWidth: 100, padding: 10, borderRadius: 8, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                Kaydet
              </button>
            )}
            {canSendToSupplier && claim.status === 'OPEN' && (
              <button type="button" disabled={saving} onClick={() => void tedarikciyeGonder()} style={{ flex: 1, minWidth: 120, padding: 10, borderRadius: 8, background: '#1e40af', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                Tedarikçiye Gönder
              </button>
            )}
            {isWarehouseOrAdmin && (
              <button type="button" disabled={saving || result === 'PENDING'} onClick={() => void sonucGir()} style={{ flex: 1, minWidth: 100, padding: 10, borderRadius: 8, background: '#374151', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                Sonuç Gir
              </button>
            )}
            {canApprove && (
              adminApproved ? (
                <button type="button" disabled style={{ flex: '1 1 100%', padding: 10, borderRadius: 8, background: '#dcfce7', color: '#166534', border: '1px solid #86efac', fontWeight: 700, cursor: 'default' }}>
                  ✅ Onaylandı — {claim.adminApprovedAt ? new Date(claim.adminApprovedAt).toLocaleString('tr-TR') : ''}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving || result === 'PENDING' || !['RESOLVED', 'OUT_OF_WARRANTY'].includes(claim.status)}
                  title={result === 'PENDING' ? 'Önce sonuç girilmeli' : undefined}
                  onClick={() => void onayla()}
                  style={{ flex: 1, minWidth: 100, padding: 10, borderRadius: 8, background: '#166534', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, opacity: result === 'PENDING' ? 0.5 : 1 }}
                >
                  Onayla
                </button>
              )
            )}
          </div>
        )}
      </aside>
    </>
  )
}
