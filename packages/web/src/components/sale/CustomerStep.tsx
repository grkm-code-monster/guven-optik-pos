import { useEffect, useMemo, useState } from 'react'
import { useIsMobile } from '../../hooks/useSidebarResponsive'
import {
  addPrescription,
  createCustomer,
  getCustomerById,
  resolveOdooCustomer,
  getCustomerPrescriptions,
  searchCustomers,
  updateCustomer,
} from '../../api/customers.api'
import { nearRxFromFarAndAdd } from '../../utils/prescriptionSummary'
import { LegacyArchiveSearchResults } from './LegacyArchivePanel'

function rangeOptions(min: number, max: number, step: number, digits: number) {
  const out: Array<{ value: string; label: string }> = [{ value: '', label: 'Değer Yok' }]
  const nSteps = Math.round((max - min) / step)
  for (let i = 0; i <= nSteps; i++) {
    const v = min + i * step
    const s = v.toFixed(digits)
    const label = v > 0 ? `+${s}` : s
    out.push({ value: label, label })
  }
  return out
}

function intOptions(min: number, max: number) {
  const out: Array<{ value: string; label: string }> = [{ value: '', label: 'Değer Yok' }]
  for (let i = min; i <= max; i++) out.push({ value: String(i), label: String(i) })
  return out
}

const SPH_OPTIONS = rangeOptions(-30, 30, 0.25, 2)
const CYL_OPTIONS = rangeOptions(-9, 9, 0.25, 2)
const DEFAULT_RX_SPH_CYL = '0.00'
const AKS_OPTIONS = intOptions(0, 180)
const BC_OPTIONS = (() => {
  const out: Array<{ value: string; label: string }> = [{ value: '', label: 'Değer Yok' }]
  for (let v = 7.5; v <= 9.00001; v += 0.1) {
    out.push({ value: v.toFixed(1), label: v.toFixed(1) })
  }
  return out
})()
const LENS_ADD_OPTIONS = [
  { value: '', label: 'Değer Yok' },
  { value: 'LOW', label: 'LOW' },
  { value: 'MEDIUM', label: 'MEDIUM' },
  { value: 'HIGH', label: 'HIGH' },
]

const FAR_ADD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Değer Yok' },
  ...['0.00', '0.75', '1.00', '1.25', '1.50', '1.75', '2.00', '2.25', '2.50', '2.75', '3.00', '3.25', '3.50', '3.75', '4.00'].map(
    (v) => ({ value: v, label: v }),
  ),
]

export default function CustomerStep({
  onSelectCustomer,
  onApplyPrescription,
  initialCustomer,
}: {
  onSelectCustomer: (customer: any) => void
  onApplyPrescription?: (rx: any) => void
  initialCustomer?: any | null
}) {
  const mobil = useIsMobile()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(initialCustomer ?? null)
  const [receteHistory, setReceteHistory] = useState<any[]>([])
  const [receteLoading, setReceteLoading] = useState(false)
  const [appliedPrescription, setAppliedPrescription] = useState<any | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [kvkOnayDurumu, setKvkOnayDurumu] = useState<'bekliyor' | 'onaylandi' | 'reddedildi' | null>(null)
  const [kvkOnayTarihi, setKvkOnayTarihi] = useState<string | null>(null)
  const [kvkYukleniyor, setKvkYukleniyor] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [identityNo, setIdentityNo] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [email, setEmail] = useState('')
  const [adres, setAdres] = useState('')
  const [il, setIl] = useState('')
  const [ilce, setIlce] = useState('')
  const [note, setNote] = useState('')
  const [hasPresciption, setHasPresciption] = useState(false)

  const [editInfoOpen, setEditInfoOpen] = useState(false)
  const [rxModalOpen, setRxModalOpen] = useState(false)
  const [lensRxModalOpen, setLensRxModalOpen] = useState(false)
  const [receteTab, setReceteTab] = useState<'gozluk' | 'lens'>('gozluk')

  // Daimi (Far)
  const [far_r_pd, setFar_r_pd] = useState('')
  const [far_r_sph, setFar_r_sph] = useState(DEFAULT_RX_SPH_CYL)
  const [far_r_cyl, setFar_r_cyl] = useState(DEFAULT_RX_SPH_CYL)
  const [far_r_aks, setFar_r_aks] = useState('')
  const [far_r_add, setFar_r_add] = useState('')
  const [far_r_diagnosis, setFar_r_diagnosis] = useState('')
  const [far_l_pd, setFar_l_pd] = useState('')
  const [far_l_sph, setFar_l_sph] = useState(DEFAULT_RX_SPH_CYL)
  const [far_l_cyl, setFar_l_cyl] = useState(DEFAULT_RX_SPH_CYL)
  const [far_l_aks, setFar_l_aks] = useState('')
  const [far_l_add, setFar_l_add] = useState('')
  const [far_l_diagnosis, setFar_l_diagnosis] = useState('')

  // Yakın
  const [near_r_pd, setNear_r_pd] = useState('')
  const [near_r_sph, setNear_r_sph] = useState(DEFAULT_RX_SPH_CYL)
  const [near_r_cyl, setNear_r_cyl] = useState(DEFAULT_RX_SPH_CYL)
  const [near_r_aks, setNear_r_aks] = useState('')
  const [near_r_diagnosis, setNear_r_diagnosis] = useState('')
  const [near_l_pd, setNear_l_pd] = useState('')
  const [near_l_sph, setNear_l_sph] = useState(DEFAULT_RX_SPH_CYL)
  const [near_l_cyl, setNear_l_cyl] = useState(DEFAULT_RX_SPH_CYL)
  const [near_l_aks, setNear_l_aks] = useState('')
  const [near_l_diagnosis, setNear_l_diagnosis] = useState('')

  // Lens
  const [lens_r_bc, setLens_r_bc] = useState('')
  const [lens_r_sph, setLens_r_sph] = useState(DEFAULT_RX_SPH_CYL)
  const [lens_r_cyl, setLens_r_cyl] = useState(DEFAULT_RX_SPH_CYL)
  const [lens_r_aks, setLens_r_aks] = useState('')
  const [lens_r_add, setLens_r_add] = useState('')
  const [lens_r_note, setLens_r_note] = useState('')
  const [lens_l_bc, setLens_l_bc] = useState('')
  const [lens_l_sph, setLens_l_sph] = useState(DEFAULT_RX_SPH_CYL)
  const [lens_l_cyl, setLens_l_cyl] = useState(DEFAULT_RX_SPH_CYL)
  const [lens_l_aks, setLens_l_aks] = useState('')
  const [lens_l_add, setLens_l_add] = useState('')
  const [lens_l_note, setLens_l_note] = useState('')

  // E-Reçete
  const [eRx_no, setERx_no] = useState('')
  const [eRx_date, setERx_date] = useState('')
  const [eRx_hospital, setERx_hospital] = useState('')
  const [eRx_doctor, setERx_doctor] = useState('')
  const [eRx_diagnosis, setERx_diagnosis] = useState('')

  async function refreshPrescriptionCard(customerId: string) {
    const list = [...(await getCustomerPrescriptions(customerId))].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    setReceteHistory(list)
    if (list.length > 0) {
      applyRecete(list[0])
    }
    try {
      const full = await getCustomerById(customerId)
      setSelectedCustomer(full)
    } catch {
      /* kart güncellemesi reçete özeti ile sınırlı */
    }
  }

  function syncNearFromFar(
    add: string,
    far: { sph: string; cyl: string; aks: string },
    setNear: { sph: (v: string) => void; cyl: (v: string) => void; aks: (v: string) => void },
  ) {
    if (!add.trim()) return
    const near = nearRxFromFarAndAdd({ ...far, add })
    setNear.sph(near.sph)
    setNear.cyl(near.cyl)
    setNear.aks(near.aks)
  }

  function onFarRAddChange(add: string) {
    setFar_r_add(add)
    syncNearFromFar(add, { sph: far_r_sph, cyl: far_r_cyl, aks: far_r_aks }, {
      sph: setNear_r_sph,
      cyl: setNear_r_cyl,
      aks: setNear_r_aks,
    })
  }

  function onFarLAddChange(add: string) {
    setFar_l_add(add)
    syncNearFromFar(add, { sph: far_l_sph, cyl: far_l_cyl, aks: far_l_aks }, {
      sph: setNear_l_sph,
      cyl: setNear_l_cyl,
      aks: setNear_l_aks,
    })
  }

  function copyRtoL(kind: 'daimi' | 'yakin' | 'lens') {
    if (kind === 'daimi') {
      setFar_l_pd(far_r_pd)
      setFar_l_sph(far_r_sph)
      setFar_l_cyl(far_r_cyl)
      setFar_l_aks(far_r_aks)
      setFar_l_add(far_r_add)
      syncNearFromFar(far_r_add, { sph: far_r_sph, cyl: far_r_cyl, aks: far_r_aks }, {
        sph: setNear_l_sph,
        cyl: setNear_l_cyl,
        aks: setNear_l_aks,
      })
      return
    }
    if (kind === 'yakin') {
      setNear_l_pd(near_r_pd)
      setNear_l_sph(near_r_sph)
      setNear_l_cyl(near_r_cyl)
      setNear_l_aks(near_r_aks)
      return
    }
    setLens_l_bc(lens_r_bc)
    setLens_l_sph(lens_r_sph)
    setLens_l_cyl(lens_r_cyl)
    setLens_l_aks(lens_r_aks)
    setLens_l_add(lens_r_add)
  }

  const canSearch = useMemo(() => q.trim().length >= 3, [q])

  useEffect(() => {
    if (!canSearch) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      setLoading(true)
      setError(null)
      searchCustomers(q.trim())
        .then(setResults)
        .catch((e: any) => setError(e?.response?.data?.message ?? 'Müşteri araması başarısız'))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q, canSearch])

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setReceteHistory([])
      setAppliedPrescription(null)
      return
    }
    setReceteLoading(true)
    getCustomerPrescriptions(selectedCustomer.id)
      .then((list) => {
        setReceteHistory([...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
      })
      .catch(() => {
        setReceteHistory([])
      })
      .finally(() => setReceteLoading(false))
  }, [selectedCustomer?.id])

  function applyRecete(rx: any) {
    setAppliedPrescription(rx)
    onApplyPrescription?.(rx)
  }

  function receteTarih(rx: any) {
    const raw = rx?.saleDate ?? rx?.createdAt
    if (!raw) return '-'
    return new Date(raw).toLocaleDateString('tr-TR')
  }

  useEffect(() => {
    syncNearFromFar(far_r_add, { sph: far_r_sph, cyl: far_r_cyl, aks: far_r_aks }, {
      sph: setNear_r_sph,
      cyl: setNear_r_cyl,
      aks: setNear_r_aks,
    })
  }, [far_r_sph, far_r_cyl, far_r_aks, far_r_add])

  useEffect(() => {
    syncNearFromFar(far_l_add, { sph: far_l_sph, cyl: far_l_cyl, aks: far_l_aks }, {
      sph: setNear_l_sph,
      cyl: setNear_l_cyl,
      aks: setNear_l_aks,
    })
  }, [far_l_sph, far_l_cyl, far_l_aks, far_l_add])

  async function quickSave() {
    setError(null)
    if (!name.trim() || !phone.trim()) {
      setError('Ad Soyad ve Telefon zorunludur.')
      return
    }
    if (hasPresciption) {
      if (!eRx_no.trim() || !eRx_date.trim() || !eRx_hospital.trim() || !eRx_doctor.trim() || !eRx_diagnosis.trim()) {
        setError('E-Reçete bilgileri zorunludur.')
        return
      }
    }
    try {
      const created = await (createCustomer as any)({
        name: name.trim(),
        phone: phone.trim(),
        note: note.trim() || undefined,
        identityNo: identityNo.trim() || undefined,
        birthDate: birthDate ? new Date(birthDate).toISOString() : undefined,
        ePostaEmail: email.trim() || undefined,
        adres: adres.trim() || undefined,
        il: il.trim() || undefined,
        ilce: ilce.trim() || undefined,
        hasPresciption,
        far_r_pd: far_r_pd || undefined,
        far_r_sph: far_r_sph || undefined,
        far_r_cyl: far_r_cyl || undefined,
        far_r_aks: far_r_aks || undefined,
        far_r_diagnosis: far_r_diagnosis || undefined,
        far_l_pd: far_l_pd || undefined,
        far_l_sph: far_l_sph || undefined,
        far_l_cyl: far_l_cyl || undefined,
        far_l_aks: far_l_aks || undefined,
        far_l_diagnosis: far_l_diagnosis || undefined,
        near_r_pd: near_r_pd || undefined,
        near_r_sph: near_r_sph || undefined,
        near_r_cyl: near_r_cyl || undefined,
        near_r_aks: near_r_aks || undefined,
        near_r_diagnosis: near_r_diagnosis || undefined,
        near_l_pd: near_l_pd || undefined,
        near_l_sph: near_l_sph || undefined,
        near_l_cyl: near_l_cyl || undefined,
        near_l_aks: near_l_aks || undefined,
        near_l_diagnosis: near_l_diagnosis || undefined,
        lens_r_bc: lens_r_bc || undefined,
        lens_r_sph: lens_r_sph || undefined,
        lens_r_cyl: lens_r_cyl || undefined,
        lens_r_aks: lens_r_aks || undefined,
        lens_r_add: lens_r_add || undefined,
        lens_l_bc: lens_l_bc || undefined,
        lens_l_sph: lens_l_sph || undefined,
        lens_l_cyl: lens_l_cyl || undefined,
        lens_l_aks: lens_l_aks || undefined,
        lens_l_add: lens_l_add || undefined,
        eRx_no: eRx_no.trim() || undefined,
        eRx_date: eRx_date || undefined,
        eRx_hospital: eRx_hospital.trim() || undefined,
        eRx_doctor: eRx_doctor.trim() || undefined,
        eRx_diagnosis: eRx_diagnosis.trim() || undefined,
      })
      setModalOpen(false)
      setName('')
      setPhone('')
      setIdentityNo('')
      setBirthDate('')
      setEmail('')
      setAdres('')
      setIl('')
      setIlce('')
      setNote('')
      setHasPresciption(false)
      onSelectCustomer(created)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Müşteri oluşturulamadı')
    }
  }

  return (
    <div
      style={{
        backgroundColor: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '16px',
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: '12px' }}>Müşteri</div>

      <div style={{ marginBottom: '12px' }}>
        <label
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 700,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '6px',
          }}
        >
          Telefon / Ad ara
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="En az 3 karakter"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </div>

      {loading ? <div style={{ fontSize: '13px', color: '#6b7280' }}>Aranıyor...</div> : null}
      {error ? <div style={{ fontSize: '13px', color: '#ef4444', marginBottom: '8px' }}>{error}</div> : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {results.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={async () => {
              if (c._kaynak === 'odoo') {
                setLoading(true)
                try {
                  const real = await resolveOdooCustomer({
                    odooPartnerId: c.odooPartnerId,
                    name: c.name,
                    phone: c.phone,
                    email: c.ePostaEmail,
                  })
                  setSelectedCustomer(real)
                } catch (e: any) {
                  setError(e?.response?.data?.message ?? 'Müşteri aktarılamadı')
                  setLoading(false)
                  return
                }
                setLoading(false)
              } else {
                setSelectedCustomer(c)
              }
              setQ('')
              setResults([])
              setError(null)
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              padding: '10px 12px',
              backgroundColor: 'white',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '14px', color: '#111' }}>{c.name}</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{c.phone}</div>
          </button>
        ))}
        {canSearch && !loading && results.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#6b7280' }}>Güncel kayıtlarda sonuç yok.</div>
        ) : null}
      </div>

      <LegacyArchiveSearchResults
        query={q}
        enabled={canSearch && !loading && results.length === 0 && !selectedCustomer}
        onPromoted={(customer) => {
          setSelectedCustomer(customer)
          setQ('')
          setResults([])
          setError(null)
        }}
        onError={setError}
      />

      <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            backgroundColor: 'white',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Hızlı Müşteri Oluştur
        </button>
      </div>

      {selectedCustomer ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 16,
            marginTop: 12,
            backgroundColor: 'white',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#111', lineHeight: 1.2 }}>{selectedCustomer.name}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{selectedCustomer.phone}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', marginBottom: 8 }}>REÇETE GEÇMİŞİ</div>
            {receteLoading ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div>
            ) : receteHistory.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>Kayıtlı satış reçetesi yok</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {receteHistory.map((rx) => {
                  const active = appliedPrescription?.id === rx.id
                  const isLens = rx.source === 'LENS'
                  const borderColor = active ? '#C8102E' : isLens ? '#2563eb' : '#e5e7eb'
                  const bgColor = active ? '#fdf2f4' : isLens ? '#eff6ff' : 'white'
                  const tipRenk = isLens ? '#1d4ed8' : '#C8102E'
                  const tipLabel = isLens ? '👁 Kontakt Lens' : '👓 Gözlük'

                  // Gözlük özeti
                  const gozlukOzet = !isLens ? (() => {
                    const r = [rx.far_r_sph, rx.far_r_cyl, rx.far_r_aks].filter(Boolean).join('/')
                    const l = [rx.far_l_sph, rx.far_l_cyl, rx.far_l_aks].filter(Boolean).join('/')
                    const yakin_r = [rx.near_r_sph, rx.near_r_cyl, rx.near_r_aks].filter(Boolean).join('/')
                    const yakin_l = [rx.near_l_sph, rx.near_l_cyl, rx.near_l_aks].filter(Boolean).join('/')
                    return { r, l, yakin_r, yakin_l, add_r: rx.far_r_add, add_l: rx.far_l_add, pd_r: rx.far_r_pd, pd_l: rx.far_l_pd }
                  })() : null

                  // Lens özeti
                  const lensOzet = isLens ? (() => {
                    return {
                      r: [rx.lens_r_sph, rx.lens_r_cyl, rx.lens_r_aks].filter(Boolean).join('/'),
                      l: [rx.lens_l_sph, rx.lens_l_cyl, rx.lens_l_aks].filter(Boolean).join('/'),
                      bc_r: rx.lens_r_bc, bc_l: rx.lens_l_bc,
                      add_r: rx.lens_r_add, add_l: rx.lens_l_add,
                      note_r: rx.lens_r_note, note_l: rx.lens_l_note,
                    }
                  })() : null

                  return (
                    <div
                      key={rx.id}
                      style={{
                        border: `2px solid ${borderColor}`,
                        borderRadius: 10,
                        padding: '10px 12px',
                        backgroundColor: bgColor,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: tipRenk, background: isLens ? '#dbeafe' : '#fdf2f4', padding: '2px 8px', borderRadius: 999 }}>{tipLabel}</span>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>{receteTarih(rx)}</span>
                            {rx.eRx_no && <span style={{ fontSize: 11, color: '#6b7280' }}>· e-Reçete: {rx.eRx_no}</span>}
                          </div>
                          {gozlukOzet && (
                            <div style={{ fontSize: 12, color: '#1e3a5f' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                                {gozlukOzet.r && <div><span style={{ color: '#9ca3af' }}>Uzak R:</span> {gozlukOzet.r}{gozlukOzet.add_r ? ` ADD:${gozlukOzet.add_r}` : ''}{gozlukOzet.pd_r ? ` PD:${gozlukOzet.pd_r}` : ''}</div>}
                                {gozlukOzet.l && <div><span style={{ color: '#9ca3af' }}>Uzak L:</span> {gozlukOzet.l}{gozlukOzet.add_l ? ` ADD:${gozlukOzet.add_l}` : ''}{gozlukOzet.pd_l ? ` PD:${gozlukOzet.pd_l}` : ''}</div>}
                                {gozlukOzet.yakin_r && <div><span style={{ color: '#9ca3af' }}>Yakın R:</span> {gozlukOzet.yakin_r}</div>}
                                {gozlukOzet.yakin_l && <div><span style={{ color: '#9ca3af' }}>Yakın L:</span> {gozlukOzet.yakin_l}</div>}
                              </div>
                              {rx.eRx_doctor && <div style={{ marginTop: 4, color: '#6b7280' }}>Dr: {rx.eRx_doctor}{rx.eRx_hospital ? ` · ${rx.eRx_hospital}` : ''}</div>}
                            </div>
                          )}
                          {lensOzet && (
                            <div style={{ fontSize: 12, color: '#1e3a5f' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
                                {lensOzet.r && <div><span style={{ color: '#9ca3af' }}>R:</span> {lensOzet.r}{lensOzet.bc_r ? ` BC:${lensOzet.bc_r}` : ''}{lensOzet.add_r ? ` ADD:${lensOzet.add_r}` : ''}</div>}
                                {lensOzet.l && <div><span style={{ color: '#9ca3af' }}>L:</span> {lensOzet.l}{lensOzet.bc_l ? ` BC:${lensOzet.bc_l}` : ''}{lensOzet.add_l ? ` ADD:${lensOzet.add_l}` : ''}</div>}
                                {lensOzet.note_r && <div style={{ gridColumn: 'span 2', color: '#6b7280' }}>Not: {lensOzet.note_r}</div>}
                              </div>
                              {rx.eRx_doctor && <div style={{ marginTop: 4, color: '#6b7280' }}>Dr: {rx.eRx_doctor}{rx.eRx_hospital ? ` · ${rx.eRx_hospital}` : ''}</div>}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => applyRecete(rx)}
                          style={{
                            padding: '6px 10px', borderRadius: 8,
                            border: `1px solid ${tipRenk}`,
                            backgroundColor: 'white', color: tipRenk,
                            fontSize: 11, fontWeight: 800, cursor: 'pointer',
                            whiteSpace: 'nowrap', flexShrink: 0,
                          }}
                        >
                          Bu reçeteyi kullan
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {appliedPrescription ? (
              <div style={{ fontSize: 12, color: '#C8102E', fontWeight: 700, marginTop: 8 }}>
                Seçili reçete satışa aktarılacak
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setName(selectedCustomer.name ?? '')
                setPhone(selectedCustomer.phone ?? '')
                setIdentityNo(selectedCustomer.identityNo ?? '')
                setBirthDate(selectedCustomer.birthDate ? String(selectedCustomer.birthDate).slice(0, 10) : '')
                setEmail(selectedCustomer.ePostaEmail ?? '')
                setAdres(selectedCustomer.adres ?? '')
                setIl(selectedCustomer.il ?? '')
                setIlce(selectedCustomer.ilce ?? '')
                setNote(selectedCustomer.note ?? '')
                setEditInfoOpen(true)
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #e5e7eb',
                backgroundColor: '#f3f4f6',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 13,
              }}
            >
              Bilgileri Güncelle
            </button>
            <button
              type="button"
              onClick={() => {
                setRxModalOpen(true)
                setError(null)
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #C8102E',
                backgroundColor: 'white',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 13,
                color: '#C8102E',
              }}
            >
              + Yeni Reçete Ekle
            </button>
            <button
              type="button"
              onClick={() => {
                setLensRxModalOpen(true)
                setError(null)
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #1d4ed8',
                backgroundColor: 'white',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 13,
                color: '#1d4ed8',
              }}
            >
              + Lens Reçetesi Ekle
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSelectCustomer({ ...selectedCustomer, appliedPrescription: appliedPrescription ?? undefined })}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '12px 14px',
              borderRadius: 10,
              border: 'none',
              backgroundColor: '#C8102E',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            Satışa Devam Et →
          </button>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 1000,
            overflowY: 'auto',
            padding: '20px 0',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '720px',
              margin: 'auto',
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '12px' }}>Hızlı Müşteri Oluştur</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
              <Field label="Ad Soyad*" value={name} onChange={setName} />
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Telefon*</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setKvkOnayDurumu(null); setKvkOnayTarihi(null) }}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const }}
                    placeholder="05xx xxx xx xx"
                  />
                  <button
                    type="button"
                    disabled={phone.trim().length < 10 || kvkYukleniyor}
                    onClick={async () => {
                      if (!phone.trim()) return
                      setKvkYukleniyor(true)
                      try {
                        await new Promise(r => setTimeout(r, 800))
                        setKvkOnayDurumu('bekliyor')
                        setKvkOnayTarihi(null)
                      } catch {
                        setKvkOnayDurumu(null)
                      } finally {
                        setKvkYukleniyor(false)
                      }
                    }}
                    style={{
                      padding: '10px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      background: kvkOnayDurumu === 'onaylandi' ? '#dcfce7' : kvkOnayDurumu === 'reddedildi' ? '#fee2e2' : '#f3f4f6',
                      color: kvkOnayDurumu === 'onaylandi' ? '#166534' : kvkOnayDurumu === 'reddedildi' ? '#991b1b' : '#374151',
                    }}
                  >
                    {kvkYukleniyor ? '...' : kvkOnayDurumu === 'onaylandi' ? '✓ KVK Onaylı' : kvkOnayDurumu === 'reddedildi' ? '✗ KVK Reddedildi' : 'KVK Sorgula'}
                  </button>
                </div>
                {kvkOnayDurumu === 'bekliyor' && (
                  <div style={{ marginTop: 6, padding: '8px 12px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: '#854d0e', marginBottom: 4 }}>KVK onayı bekleniyor</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => { setKvkOnayDurumu('onaylandi'); setKvkOnayTarihi(new Date().toLocaleString('tr-TR')) }} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#166534', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓ Onay Verildi</button>
                      <button type="button" onClick={() => { setKvkOnayDurumu('reddedildi'); setKvkOnayTarihi(new Date().toLocaleString('tr-TR')) }} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#991b1b', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✗ Reddedildi</button>
                    </div>
                  </div>
                )}
                {kvkOnayDurumu === 'onaylandi' && kvkOnayTarihi && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#166534' }}>✓ Onay tarihi: {kvkOnayTarihi}</div>
                )}
                {kvkOnayDurumu === 'reddedildi' && kvkOnayTarihi && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#991b1b' }}>✗ Reddedildi: {kvkOnayTarihi} — İzinsiz ticari ileti gönderilemez</div>
                )}
              </div>
              <Field label="TC Kimlik" value={identityNo} onChange={setIdentityNo} />
              <Field label="Doğum Tarihi" type="date" value={birthDate} onChange={setBirthDate} />
              <Field label="E-posta" value={email} onChange={setEmail} />
              <Field label="Adres" value={adres} onChange={setAdres} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="İl" value={il} onChange={setIl} />
                <Field label="İlçe" value={ilce} onChange={setIlce} />
              </div>
              <Field label="Not" value={note} onChange={setNote} />
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={hasPresciption} onChange={(e) => setHasPresciption(e.target.checked)} />
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#111' }}>Reçetesi var mı?</span>
              </label>
            </div>

            {hasPresciption ? (
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
                  <button
                    type="button"
                    onClick={() => setReceteTab('gozluk')}
                    style={{
                      padding: '8px 16px', fontSize: 13, border: 'none', cursor: 'pointer',
                      borderBottom: receteTab === 'gozluk' ? '2px solid #C8102E' : '2px solid transparent',
                      background: 'transparent',
                      color: receteTab === 'gozluk' ? '#C8102E' : '#6b7280',
                      fontWeight: receteTab === 'gozluk' ? 800 : 500,
                    }}
                  >👓 Gözlük Reçetesi</button>
                  <button
                    type="button"
                    onClick={() => setReceteTab('lens')}
                    style={{
                      padding: '8px 16px', fontSize: 13, border: 'none', cursor: 'pointer',
                      borderBottom: receteTab === 'lens' ? '2px solid #C8102E' : '2px solid transparent',
                      background: 'transparent',
                      color: receteTab === 'lens' ? '#C8102E' : '#6b7280',
                      fontWeight: receteTab === 'lens' ? 800 : 500,
                    }}
                  >👁 Kontakt Lens</button>
                </div>

                {receteTab === 'gozluk' && <>
                <SectionTitle title="DAİMİ GÖZ NUMARALARI" />
                <RxRow
                  title="Daimi"
                  onCopySame={() => copyRtoL('daimi')}
                  r={{
                    pd: [far_r_pd, setFar_r_pd],
                    sph: [far_r_sph, setFar_r_sph],
                    cyl: [far_r_cyl, setFar_r_cyl],
                    aks: [far_r_aks, setFar_r_aks],
                    add: [far_r_add, onFarRAddChange],
                    dx: [far_r_diagnosis, setFar_r_diagnosis],
                  }}
                  l={{
                    pd: [far_l_pd, setFar_l_pd],
                    sph: [far_l_sph, setFar_l_sph],
                    cyl: [far_l_cyl, setFar_l_cyl],
                    aks: [far_l_aks, setFar_l_aks],
                    add: [far_l_add, onFarLAddChange],
                    dx: [far_l_diagnosis, setFar_l_diagnosis],
                  }}
                />

                <SectionTitle title="YAKIN GÖZ NUMARALARI" />
                <RxRow
                  title="Yakın"
                  onCopySame={() => copyRtoL('yakin')}
                  r={{ pd: [near_r_pd, setNear_r_pd], sph: [near_r_sph, setNear_r_sph], cyl: [near_r_cyl, setNear_r_cyl], aks: [near_r_aks, setNear_r_aks], dx: [near_r_diagnosis, setNear_r_diagnosis] }}
                  l={{ pd: [near_l_pd, setNear_l_pd], sph: [near_l_sph, setNear_l_sph], cyl: [near_l_cyl, setNear_l_cyl], aks: [near_l_aks, setNear_l_aks], dx: [near_l_diagnosis, setNear_l_diagnosis] }}
                />

                </>}

                {receteTab === 'lens' && <>
                <SectionTitle title="LENS NUMARALARI" />
                <LensRow
                  onCopySame={() => copyRtoL('lens')}
                  r={{
                    bc: [lens_r_bc, setLens_r_bc],
                    sph: [lens_r_sph, setLens_r_sph],
                    cyl: [lens_r_cyl, setLens_r_cyl],
                    aks: [lens_r_aks, setLens_r_aks],
                    add: [lens_r_add, setLens_r_add],
                    note: [lens_r_note, setLens_r_note],
                  }}
                  l={{
                    bc: [lens_l_bc, setLens_l_bc],
                    sph: [lens_l_sph, setLens_l_sph],
                    cyl: [lens_l_cyl, setLens_l_cyl],
                    aks: [lens_l_aks, setLens_l_aks],
                    add: [lens_l_add, setLens_l_add],
                    note: [lens_l_note, setLens_l_note],
                  }}
                />

                <SectionTitle title="E-REÇETE BİLGİLERİ (ZORUNLU)" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <Field label="E-Reçete Numarası*" value={eRx_no} onChange={setERx_no} />
                  <Field label="Tarih*" type="date" value={eRx_date} onChange={setERx_date} />
                  <Field label="Hastane*" value={eRx_hospital} onChange={setERx_hospital} />
                  <Field label="Doktor*" value={eRx_doctor} onChange={setERx_doctor} />
                  <div style={{ gridColumn: 'span 2' }}>
                    <Field label="Tanı*" value={eRx_diagnosis} onChange={setERx_diagnosis} />
                  </div>
                </div>
                </>}
              </div>
            ) : null}

            {error ? <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px' }}>{error}</div> : null}

            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => void quickSave()}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '10px',
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
      ) : null}

      {editInfoOpen ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 1000,
            overflowY: 'auto',
            padding: '20px 0',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '720px',
              margin: 'auto',
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: '24px',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '12px' }}>Bilgileri Güncelle</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
              <Field label="Ad Soyad*" value={name} onChange={setName} />
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Telefon*</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setKvkOnayDurumu(null); setKvkOnayTarihi(null) }}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const }}
                    placeholder="05xx xxx xx xx"
                  />
                  <button
                    type="button"
                    disabled={phone.trim().length < 10 || kvkYukleniyor}
                    onClick={async () => {
                      if (!phone.trim()) return
                      setKvkYukleniyor(true)
                      try {
                        await new Promise(r => setTimeout(r, 800))
                        setKvkOnayDurumu('bekliyor')
                        setKvkOnayTarihi(null)
                      } catch {
                        setKvkOnayDurumu(null)
                      } finally {
                        setKvkYukleniyor(false)
                      }
                    }}
                    style={{
                      padding: '10px 12px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      background: kvkOnayDurumu === 'onaylandi' ? '#dcfce7' : kvkOnayDurumu === 'reddedildi' ? '#fee2e2' : '#f3f4f6',
                      color: kvkOnayDurumu === 'onaylandi' ? '#166534' : kvkOnayDurumu === 'reddedildi' ? '#991b1b' : '#374151',
                    }}
                  >
                    {kvkYukleniyor ? '...' : kvkOnayDurumu === 'onaylandi' ? '✓ KVK Onaylı' : kvkOnayDurumu === 'reddedildi' ? '✗ KVK Reddedildi' : 'KVK Sorgula'}
                  </button>
                </div>
                {kvkOnayDurumu === 'bekliyor' && (
                  <div style={{ marginTop: 6, padding: '8px 12px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: '#854d0e', marginBottom: 4 }}>KVK onayı bekleniyor</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => { setKvkOnayDurumu('onaylandi'); setKvkOnayTarihi(new Date().toLocaleString('tr-TR')) }} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#166534', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✓ Onay Verildi</button>
                      <button type="button" onClick={() => { setKvkOnayDurumu('reddedildi'); setKvkOnayTarihi(new Date().toLocaleString('tr-TR')) }} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#991b1b', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✗ Reddedildi</button>
                    </div>
                  </div>
                )}
                {kvkOnayDurumu === 'onaylandi' && kvkOnayTarihi && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#166534' }}>✓ Onay tarihi: {kvkOnayTarihi}</div>
                )}
                {kvkOnayDurumu === 'reddedildi' && kvkOnayTarihi && (
                  <div style={{ marginTop: 4, fontSize: 11, color: '#991b1b' }}>✗ Reddedildi: {kvkOnayTarihi} — İzinsiz ticari ileti gönderilemez</div>
                )}
              </div>
              <Field label="TC Kimlik" value={identityNo} onChange={setIdentityNo} />
              <Field label="Doğum Tarihi" type="date" value={birthDate} onChange={setBirthDate} />
              <Field label="E-posta" value={email} onChange={setEmail} />
              <Field label="Adres" value={adres} onChange={setAdres} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="İl" value={il} onChange={setIl} />
                <Field label="İlçe" value={ilce} onChange={setIlce} />
              </div>
              <Field label="Not" value={note} onChange={setNote} />
            </div>

            {error ? <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px' }}>{error}</div> : null}

            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button
                type="button"
                onClick={() => setEditInfoOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedCustomer?.id) return
                  setError(null)
                  try {
                    const updated = await (updateCustomer as any)(selectedCustomer.id, {
                      name: name.trim(),
                      phone: phone.trim(),
                      identityNo: identityNo.trim() || undefined,
                      birthDate: birthDate ? new Date(birthDate).toISOString() : null,
                      ePostaEmail: email.trim() || undefined,
                      adres: adres.trim() || undefined,
                      il: il.trim() || undefined,
                      ilce: ilce.trim() || undefined,
                      note: note.trim() || undefined,
                    })
                    setSelectedCustomer(updated)
                    setEditInfoOpen(false)
                  } catch (e: any) {
                    setError(e?.response?.data?.message ?? 'Müşteri güncellenemedi')
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '10px',
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
      ) : null}

      {rxModalOpen ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 1000,
            overflowY: 'auto',
            padding: '20px 0',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '720px',
              margin: 'auto',
              backgroundColor: 'white',
              borderRadius: '16px',
              padding: mobil ? '16px' : '24px',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '12px' }}>Gözlük Reçetesi Ekle</div>

            <div style={{ marginTop: '14px' }}>
              <SectionTitle title="DAİMİ GÖZ NUMARALARI" />
              <RxRow
                title="Daimi"
                onCopySame={() => copyRtoL('daimi')}
                r={{
                  pd: [far_r_pd, setFar_r_pd],
                  sph: [far_r_sph, setFar_r_sph],
                  cyl: [far_r_cyl, setFar_r_cyl],
                  aks: [far_r_aks, setFar_r_aks],
                  add: [far_r_add, onFarRAddChange],
                  dx: [far_r_diagnosis, setFar_r_diagnosis],
                }}
                l={{
                  pd: [far_l_pd, setFar_l_pd],
                  sph: [far_l_sph, setFar_l_sph],
                  cyl: [far_l_cyl, setFar_l_cyl],
                  aks: [far_l_aks, setFar_l_aks],
                  add: [far_l_add, onFarLAddChange],
                  dx: [far_l_diagnosis, setFar_l_diagnosis],
                }}
              />

              <SectionTitle title="YAKIN GÖZ NUMARALARI" />
              <RxRow
                title="Yakın"
                onCopySame={() => copyRtoL('yakin')}
                r={{ pd: [near_r_pd, setNear_r_pd], sph: [near_r_sph, setNear_r_sph], cyl: [near_r_cyl, setNear_r_cyl], aks: [near_r_aks, setNear_r_aks], dx: [near_r_diagnosis, setNear_r_diagnosis] }}
                l={{ pd: [near_l_pd, setNear_l_pd], sph: [near_l_sph, setNear_l_sph], cyl: [near_l_cyl, setNear_l_cyl], aks: [near_l_aks, setNear_l_aks], dx: [near_l_diagnosis, setNear_l_diagnosis] }}
              />

              <SectionTitle title="E-REÇETE BİLGİLERİ" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Field label="E-Reçete Numarası" value={eRx_no} onChange={setERx_no} />
                <Field label="Tarih" type="date" value={eRx_date} onChange={setERx_date} />
                <Field label="Hastane" value={eRx_hospital} onChange={setERx_hospital} />
                <Field label="Doktor" value={eRx_doctor} onChange={setERx_doctor} />
                <div style={{ gridColumn: 'span 2' }}>
                  <Field label="Tanı" value={eRx_diagnosis} onChange={setERx_diagnosis} />
                </div>
              </div>
            </div>

            {error ? <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '8px' }}>{error}</div> : null}

            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button
                type="button"
                onClick={() => setRxModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedCustomer?.id) return
                  setError(null)
                  try {
                    await (addPrescription as any)(selectedCustomer.id, {
                      source: 'MANUAL',

                      far_r_pd: far_r_pd || undefined,
                      far_r_sph: far_r_sph || undefined,
                      far_r_cyl: far_r_cyl || undefined,
                      far_r_aks: far_r_aks || undefined,
                      far_r_note: far_r_diagnosis || undefined,
                      far_l_pd: far_l_pd || undefined,
                      far_l_sph: far_l_sph || undefined,
                      far_l_cyl: far_l_cyl || undefined,
                      far_l_aks: far_l_aks || undefined,
                      far_l_note: far_l_diagnosis || undefined,

                      near_r_pd: near_r_pd || undefined,
                      near_r_sph:
                        near_r_sph ||
                        nearRxFromFarAndAdd({ sph: far_r_sph, cyl: far_r_cyl, aks: far_r_aks, add: far_r_add }).sph ||
                        undefined,
                      near_r_cyl:
                        near_r_cyl ||
                        (far_r_add ? far_r_cyl : undefined) ||
                        undefined,
                      near_r_aks:
                        near_r_aks ||
                        (far_r_add ? far_r_aks : undefined) ||
                        undefined,
                      near_r_note: near_r_diagnosis || undefined,
                      near_l_pd: near_l_pd || undefined,
                      near_l_sph:
                        near_l_sph ||
                        nearRxFromFarAndAdd({ sph: far_l_sph, cyl: far_l_cyl, aks: far_l_aks, add: far_l_add }).sph ||
                        undefined,
                      near_l_cyl:
                        near_l_cyl ||
                        (far_l_add ? far_l_cyl : undefined) ||
                        undefined,
                      near_l_aks:
                        near_l_aks ||
                        (far_l_add ? far_l_aks : undefined) ||
                        undefined,
                      near_l_note: near_l_diagnosis || undefined,

                      eRx_no: eRx_no.trim() || undefined,
                      eRx_date: eRx_date || undefined,
                      eRx_hospital: eRx_hospital.trim() || undefined,
                      eRx_doctor: eRx_doctor.trim() || undefined,
                      eRx_diagnosis: eRx_diagnosis.trim() || undefined,
                    })
                    await refreshPrescriptionCard(selectedCustomer.id)
                    setRxModalOpen(false)
                  } catch (e: any) {
                    setError(e?.response?.data?.message ?? 'Reçete eklenemedi')
                  }
                }}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: '10px',
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
      ) : null}

      {lensRxModalOpen ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
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
              padding: mobil ? 16 : 24,
              width: '100%',
              maxWidth: 600,
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12, color: '#1d4ed8' }}>Lens Reçetesi Ekle</div>

            <SectionTitle title="LENS NUMARALARI" />
            <LensRow
              onCopySame={() => copyRtoL('lens')}
              r={{
                bc: [lens_r_bc, setLens_r_bc],
                sph: [lens_r_sph, setLens_r_sph],
                cyl: [lens_r_cyl, setLens_r_cyl],
                aks: [lens_r_aks, setLens_r_aks],
                add: [lens_r_add, setLens_r_add],
                note: [lens_r_note, setLens_r_note],
              }}
              l={{
                bc: [lens_l_bc, setLens_l_bc],
                sph: [lens_l_sph, setLens_l_sph],
                cyl: [lens_l_cyl, setLens_l_cyl],
                aks: [lens_l_aks, setLens_l_aks],
                add: [lens_l_add, setLens_l_add],
                note: [lens_l_note, setLens_l_note],
              }}
            />

            <SectionTitle title="E-REÇETE BİLGİLERİ (LENS)" />
            <Field label="E-Reçete No" value={eRx_no} onChange={setERx_no} />
            <Field label="Tarih" value={eRx_date} onChange={setERx_date} type="date" />
            <Field label="Hastane" value={eRx_hospital} onChange={setERx_hospital} />
            <Field label="Doktor" value={eRx_doctor} onChange={setERx_doctor} />
            <Field label="Tanı" value={eRx_diagnosis} onChange={setERx_diagnosis} />

            {error ? <div style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{error}</div> : null}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setLensRxModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '10px',
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
                onClick={async () => {
                  if (!selectedCustomer?.id) return
                  setError(null)
                  try {
                    await (addPrescription as any)(selectedCustomer.id, {
                      source: 'LENS',
                      lens_r_bc: lens_r_bc || undefined,
                      lens_r_sph: lens_r_sph || undefined,
                      lens_r_cyl: lens_r_cyl || undefined,
                      lens_r_aks: lens_r_aks || undefined,
                      lens_r_add: lens_r_add || undefined,
                      lens_r_note: lens_r_note || undefined,
                      lens_l_bc: lens_l_bc || undefined,
                      lens_l_sph: lens_l_sph || undefined,
                      lens_l_cyl: lens_l_cyl || undefined,
                      lens_l_aks: lens_l_aks || undefined,
                      lens_l_add: lens_l_add || undefined,
                      lens_l_note: lens_l_note || undefined,
                      eRx_no: eRx_no || undefined,
                      eRx_date: eRx_date || undefined,
                      eRx_hospital: eRx_hospital || undefined,
                      eRx_doctor: eRx_doctor || undefined,
                      eRx_diagnosis: eRx_diagnosis || undefined,
                    })
                    await refreshPrescriptionCard(selectedCustomer.id)
                    setLensRxModalOpen(false)
                  } catch (e: any) {
                    setError(e?.response?.data?.message ?? 'Lens reçetesi eklenemedi')
                  }
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 10,
                  border: 'none',
                  backgroundColor: '#1d4ed8',
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
      ) : null}
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '6px',
        }}
      >
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          fontSize: '14px',
          outline: 'none',
        }}
      />
    </label>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{ marginTop: '14px', marginBottom: '10px', fontWeight: 900, fontSize: '12px', color: '#111' }}>
      ─── {title} ───
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '6px',
        }}
      >
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          minWidth: 0,
          padding: '10px 12px',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          fontSize: '11px',
          outline: 'none',
          backgroundColor: 'white',
        }}
      >
        {options.map((o) => (
          <option key={o.label} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

type RxSideFields = {
  pd: [string, (v: string) => void]
  sph: [string, (v: string) => void]
  cyl: [string, (v: string) => void]
  aks: [string, (v: string) => void]
  dx: [string, (v: string) => void]
  add?: [string, (v: string) => void]
}

function RxRow({
  title,
  onCopySame,
  r,
  l,
}: {
  title: string
  onCopySame: () => void
  r: RxSideFields
  l: RxSideFields
}) {
  const mobil = useIsMobile()

  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontWeight: 900, marginBottom: '10px' }}>{title}</div>
      <div
        style={{
          display: mobil ? 'flex' : 'grid',
          flexDirection: mobil ? 'column' : undefined,
          gridTemplateColumns: mobil ? undefined : '1fr auto 1fr',
          gap: '12px',
          alignItems: mobil ? 'stretch' : 'center',
        }}
      >
        {/* SAĞ GÖZ (R) */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontWeight: 'bold', color: '#C8102E' }}>R (Sağ)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#6b7280' }}>PD:</div>
              <input
                value={r.pd[0]}
                onChange={(e) => r.pd[1](e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                style={{
                  width: '120px',
                  padding: '8px 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobil ? '1fr 1fr' : (r.add ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr'),
              gap: '6px',
              marginTop: '10px',
            }}
          >
            <SelectField label="SPH" value={r.sph[0]} onChange={r.sph[1]} options={SPH_OPTIONS} />
            <SelectField label="CYL" value={r.cyl[0]} onChange={r.cyl[1]} options={CYL_OPTIONS} />
            <SelectField label="AKS" value={r.aks[0]} onChange={r.aks[1]} options={AKS_OPTIONS} />
            {r.add ? <SelectField label="ADD" value={r.add[0]} onChange={r.add[1]} options={FAR_ADD_OPTIONS} /> : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 900, color: '#6b7280', paddingTop: '6px' }}>Not:</div>
            <textarea
              value={r.dx[0]}
              onChange={(e) => r.dx[1](e.target.value)}
              placeholder="Opsiyonel not..."
              rows={2}
              maxLength={600}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>
        </div>

        {/* ORTA BUTON */}
        <button
          onClick={onCopySame}
          type="button"
          style={{
            padding: mobil ? '10px 12px' : '8px 10px',
            borderRadius: '8px',
            border: '1px solid #C8102E',
            backgroundColor: '#fdf2f4',
            color: '#C8102E',
            fontSize: mobil ? '13px' : '11px',
            fontWeight: '700',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            writingMode: mobil ? 'horizontal-tb' : 'vertical-rl',
            width: mobil ? '100%' : undefined,
          }}
        >
          {mobil ? 'Sağı Sola Kopyala →' : 'Aynı →'}
        </button>

        {/* SOL GÖZ (L) */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontWeight: 'bold', color: '#1550a8' }}>L (Sol)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#6b7280' }}>PD:</div>
              <input
                value={l.pd[0]}
                onChange={(e) => l.pd[1](e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                style={{
                  width: '120px',
                  padding: '8px 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobil ? '1fr 1fr' : (l.add ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr'),
              gap: '6px',
              marginTop: '10px',
            }}
          >
            <SelectField label="SPH" value={l.sph[0]} onChange={l.sph[1]} options={SPH_OPTIONS} />
            <SelectField label="CYL" value={l.cyl[0]} onChange={l.cyl[1]} options={CYL_OPTIONS} />
            <SelectField label="AKS" value={l.aks[0]} onChange={l.aks[1]} options={AKS_OPTIONS} />
            {l.add ? <SelectField label="ADD" value={l.add[0]} onChange={l.add[1]} options={FAR_ADD_OPTIONS} /> : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 900, color: '#6b7280', paddingTop: '6px' }}>Not:</div>
            <textarea
              value={l.dx[0]}
              onChange={(e) => l.dx[1](e.target.value)}
              placeholder="Opsiyonel not..."
              rows={2}
              maxLength={600}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function LensRow({
  onCopySame,
  r,
  l,
}: {
  onCopySame: () => void
  r: {
    bc: [string, (v: string) => void]
    sph: [string, (v: string) => void]
    cyl: [string, (v: string) => void]
    aks: [string, (v: string) => void]
    add: [string, (v: string) => void]
    note: [string, (v: string) => void]
  }
  l: {
    bc: [string, (v: string) => void]
    sph: [string, (v: string) => void]
    cyl: [string, (v: string) => void]
    aks: [string, (v: string) => void]
    add: [string, (v: string) => void]
    note: [string, (v: string) => void]
  }
}) {
  const mobil = useIsMobile()

  return (
    <div style={{ marginBottom: '10px' }}>
      <div
        style={{
          display: mobil ? 'flex' : 'grid',
          flexDirection: mobil ? 'column' : undefined,
          gridTemplateColumns: mobil ? undefined : '1fr auto 1fr',
          gap: '12px',
          alignItems: mobil ? 'stretch' : 'center',
        }}
      >
        {/* SAĞ GÖZ (R) */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 'bold', color: '#C8102E' }}>R (Sağ)</div>
            <div style={{ minWidth: '100px', flex: 1 }}>
              <SelectField label="B.C." value={r.bc[0]} onChange={r.bc[1]} options={BC_OPTIONS} />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobil ? '1fr 1fr' : '1fr 1fr 1fr',
              gap: '6px',
              marginTop: '10px',
            }}
          >
            <SelectField label="SPH" value={r.sph[0]} onChange={r.sph[1]} options={SPH_OPTIONS} />
            <SelectField label="CYL" value={r.cyl[0]} onChange={r.cyl[1]} options={CYL_OPTIONS} />
            <SelectField label="AKS" value={r.aks[0]} onChange={r.aks[1]} options={AKS_OPTIONS} />
          </div>

          <div style={{ marginTop: '10px' }}>
            <SelectField label="Add:" value={r.add[0]} onChange={r.add[1]} options={LENS_ADD_OPTIONS} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 900, color: '#6b7280', paddingTop: '6px' }}>Not:</div>
            <textarea
              value={r.note[0]}
              onChange={(e) => r.note[1](e.target.value)}
              placeholder="Opsiyonel not..."
              rows={2}
              maxLength={600}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>
        </div>

        {/* ORTA BUTON */}
        <button
          onClick={onCopySame}
          type="button"
          style={{
            padding: mobil ? '10px 12px' : '8px 10px',
            borderRadius: '8px',
            border: '1px solid #C8102E',
            backgroundColor: '#fdf2f4',
            color: '#C8102E',
            fontSize: mobil ? '13px' : '11px',
            fontWeight: '700',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            writingMode: mobil ? 'horizontal-tb' : 'vertical-rl',
            width: mobil ? '100%' : undefined,
          }}
        >
          {mobil ? 'Sağı Sola Kopyala →' : 'Aynı →'}
        </button>

        {/* SOL GÖZ (L) */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 'bold', color: '#1550a8' }}>L (Sol)</div>
            <div style={{ minWidth: '100px', flex: 1 }}>
              <SelectField label="B.C." value={l.bc[0]} onChange={l.bc[1]} options={BC_OPTIONS} />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobil ? '1fr 1fr' : '1fr 1fr 1fr',
              gap: '6px',
              marginTop: '10px',
            }}
          >
            <SelectField label="SPH" value={l.sph[0]} onChange={l.sph[1]} options={SPH_OPTIONS} />
            <SelectField label="CYL" value={l.cyl[0]} onChange={l.cyl[1]} options={CYL_OPTIONS} />
            <SelectField label="AKS" value={l.aks[0]} onChange={l.aks[1]} options={AKS_OPTIONS} />
          </div>

          <div style={{ marginTop: '10px' }}>
            <SelectField label="Add:" value={l.add[0]} onChange={l.add[1]} options={LENS_ADD_OPTIONS} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 900, color: '#6b7280', paddingTop: '6px' }}>Not:</div>
            <textarea
              value={l.note[0]}
              onChange={(e) => l.note[1](e.target.value)}
              placeholder="Opsiyonel not..."
              rows={2}
              maxLength={600}
              style={{
                flex: 1,
                padding: '10px 12px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '13px',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

