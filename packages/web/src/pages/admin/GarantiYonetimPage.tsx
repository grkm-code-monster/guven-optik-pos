import { useEffect, useState, useCallback } from 'react'
import { apiClient } from '../../api/client'
import { getWarrantyStats, getWarrantyClaims, updateWarrantyClaim, addWarrantyMessage, type WarrantyClaim } from '../../api/warranty.api'

const DURUM_LABEL: Record<string, string> = {
  OPEN: 'Açık', SENT_TO_SUPPLIER: 'Firmaya gönderildi',
  WAITING_RESPONSE: 'Yanıt bekleniyor', IN_RETURN_PROCESS: 'İade sürecinde',
  RESOLVED: 'Çözümlendi', OUT_OF_WARRANTY: 'Garanti dışı',
}
const DURUM_RENK: Record<string, string> = {
  OPEN: { bg: '#fef9c3', color: '#854d0e' },
  SENT_TO_SUPPLIER: { bg: '#dbeafe', color: '#1e40af' },
  WAITING_RESPONSE: { bg: '#ede9fe', color: '#4c1d95' },
  IN_RETURN_PROCESS: { bg: '#fce7f3', color: '#831843' },
  RESOLVED: { bg: '#dcfce7', color: '#166534' },
  OUT_OF_WARRANTY: { bg: '#fee2e2', color: '#991b1b' },
}
const KATEGORI_LABEL: Record<string, string> = {
  LENS_RX: 'Cam', OPTICAL_FRAME_READY: 'Optik Çerçeve',
  OPTICAL_FRAME_RX: 'Optik Çerçeve', SUNGLASSES_READY: 'Güneş Gözlüğü',
  SUNGLASSES_RX: 'Güneş Gözlüğü', CONTACT_LENS_READY: 'Kontak Lens',
  CONTACT_LENS_RX: 'Kontak Lens', SOLUTION: 'Solüsyon', ACCESSORY: 'Aksesuar',
}
const TUR_LABEL: Record<string, string> = {
  CUSTOMER_WARRANTY: 'Garanti (müşteri)', STOCK_WARRANTY: 'Garanti (stok)',
  SATISFACTION_RETURN: 'Memnuniyet iadesi', EXCESS_ORDER_RETURN: 'Fazla sipariş iadesi',
}
const SUBELER = ['GVN1', 'GVN2', 'GVN3', 'GVN4', 'GVN5', 'GVN6', 'GVN8', 'GVN9', 'GVN10', 'ANADEPO']
const SUBE_LABEL: Record<string, string> = {
  'GVN1': 'GVN1', 'GVN2': 'GVN2', 'GVN3': 'GVN3',
  'GVN4': 'GVN4', 'GVN5': 'GVN5', 'GVN6': 'GVN6',
  'GVN8': 'GVN8', 'GVN9': 'GVN9', 'GVN10': 'GVN10',
}

export default function GarantiYonetimPage() {
  const [stats, setStats] = useState<any>(null)
  const [claims, setClaims] = useState<WarrantyClaim[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [katFilter, setKatFilter] = useState('')
  const [selected, setSelected] = useState<WarrantyClaim | null>(null)
  const [loading, setLoading] = useState(false)
  const [depoStatus, setDepoStatus] = useState('')
  const [depoNot, setDepoNot] = useState('')
  const [mesaj, setMesaj] = useState('')
  const [sonuc, setSonuc] = useState('')
  const [iadeAdimlar, setIadeAdimlar] = useState<Record<string, any>>({})
  const [tedarikciNo, setTedarikciNo] = useState('')
  const [yeniUrunAdi, setYeniUrunAdi] = useState('')
  const [iadeOnaylandi, setIadeOnaylandi] = useState(false)
  const [garantiDisiOnaylandi, setGarantiDisiOnaylandi] = useState(false)
  const [subeMap, setSubeMap] = useState<Record<string, string>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([
        getWarrantyStats(),
        getWarrantyClaims({ search: search || undefined, status: statusFilter || undefined })
      ])
      setStats(s)
      setClaims(katFilter ? c.filter((cl: WarrantyClaim) => cl.productCategory === katFilter) : c)
    } finally { setLoading(false) }
  }, [search, statusFilter, katFilter])

  useEffect(() => { void loadData() }, [loadData])

  useEffect(() => {
    apiClient.get('/admin/branch-list').then(r => {
      const list = r.data?.data ?? r.data ?? []
      const map: Record<string, string> = {}
      list.forEach((b: any) => { map[b.id] = b.name ?? b.code })
      console.log('[subeMap]', JSON.stringify(map))
      setSubeMap(map)
    }).catch((e) => console.error('[branches error]', e))
  }, [])

  useEffect(() => {
    setSonuc('')
    setIadeAdimlar({})
    setTedarikciNo('')
    setYeniUrunAdi('')
    setIadeOnaylandi(false)
    setGarantiDisiOnaylandi(false)
  }, [selected?.id])

  async function kaydet() {
    if (!selected) return
    await updateWarrantyClaim(selected.id, {
      status: depoStatus || selected.status,
      supplierNote: depoNot,
    })
    setSelected(null)
    setDepoNot(''); setDepoStatus('')
    void loadData()
  }

  async function mesajGonder() {
    if (!selected || !mesaj.trim()) return
    await addWarrantyMessage(selected.id, mesaj)
    setMesaj('')
    const updated = await apiClient.get(`/warranty/${selected.id}`).then(r => r.data)
    setSelected(updated)
  }

  async function pdfIndir(claim: WarrantyClaim) {
    const jsPDF = (await import('jspdf')).default
    const html2canvas = (await import('html2canvas')).default
    const div = document.createElement('div')
    div.style.cssText = 'width:794px;padding:40px;background:white;font-family:Arial,sans-serif;font-size:12px;color:#111;position:fixed;left:-9999px;'
    const chain = claim.chainJson ? JSON.parse(claim.chainJson) : []
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e5e7eb;">
        <div><div style="font-size:20px;font-weight:700;">Güven Optik</div><div style="color:#6b7280;font-size:11px;">1959 · Garanti & İade Belgesi</div></div>
        <div style="text-align:right;"><div style="font-size:10px;color:#9ca3af;">Takip Numarası</div><div style="font-size:22px;font-weight:700;color:#C8102E;">${claim.claimNo}</div><div style="font-size:11px;color:#6b7280;">${new Date(claim.createdAt).toLocaleDateString('tr-TR')}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="background:#f9fafb;border-radius:8px;padding:12px;">
          <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Müşteri & Ürün</div>
          <div><b>Müşteri:</b> ${claim.customer?.name ?? '—'}</div>
          <div><b>Ürün:</b> ${claim.productName ?? '—'}</div>
          ${claim.lotNo ? `<div><b>Lot/Seri:</b> ${claim.lotNo}</div>` : ''}
          ${claim.barcode ? `<div><b>Barkod:</b> ${claim.barcode}</div>` : ''}
          ${claim.internalRef ? `<div><b>İç ref:</b> ${claim.internalRef}</div>` : ''}
        </div>
        <div style="background:#f9fafb;border-radius:8px;padding:12px;">
          <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Kayıt Bilgileri</div>
          <div><b>Şube:</b> ${claim.branchId ?? '—'}</div>
          <div><b>Kayıt açan:</b> ${claim.user?.name ?? claim.user?.username ?? '—'}</div>
          <div><b>Durum:</b> ${DURUM_LABEL[claim.status] ?? claim.status}</div>
          <div><b>Tür:</b> ${TUR_LABEL[claim.type] ?? claim.type}</div>
        </div>
      </div>
      ${claim.problemDesc ? `<div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:16px;"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">Sorun Açıklaması</div><div>${claim.problemDesc}</div></div>` : ''}
      ${chain.length ? `<div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:16px;"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">İade Silsilesi</div><div>${chain.join(' → ')}</div></div>` : ''}
      <div style="border-top:1px solid #e5e7eb;padding-top:12px;text-align:center;font-size:10px;color:#9ca3af;">Güven Optik POS · ${new Date().toLocaleString('tr-TR')} · Bu belge garanti kaydının resmi çıktısıdır.</div>
    `
    document.body.appendChild(div)
    const canvas = await html2canvas(div, { scale: 2, backgroundColor: '#ffffff' })
    document.body.removeChild(div)
    const pdf = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width)
    pdf.save(`garanti-${claim.claimNo}.pdf`)
  }

  async function pdfTedarikci() {
    if (!selected) return
    const jsPDF = (await import('jspdf')).default
    const html2canvas = (await import('html2canvas')).default
    const div = document.createElement('div')
    div.style.cssText = 'width:794px;padding:40px;background:white;font-family:Arial,sans-serif;font-size:12px;color:#111;position:fixed;left:-9999px;'
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #C8102E;">
        <div><div style="font-size:22px;font-weight:700;">Güven Optik</div><div style="color:#6b7280;font-size:11px;">1959 · Tedarikçi Bilgi Formu</div></div>
        <div style="text-align:right;"><div style="font-size:10px;color:#9ca3af;">Garanti Takip No</div><div style="font-size:20px;font-weight:700;color:#C8102E;">${selected.claimNo}</div><div style="font-size:11px;color:#6b7280;">${new Date().toLocaleDateString('tr-TR')}</div></div>
      </div>
      <div style="margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Ürün Bilgileri</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr><td style="padding:4px 0;color:#6b7280;width:140px;">Ürün</td><td><strong>${selected.productName ?? '—'}</strong></td></tr>
          ${selected.lotNo ? `<tr><td style="padding:4px 0;color:#6b7280;">Lot/Seri No</td><td><strong>${selected.lotNo}</strong></td></tr>` : ''}
          ${selected.barcode ? `<tr><td style="padding:4px 0;color:#6b7280;">Barkod</td><td><strong>${selected.barcode}</strong></td></tr>` : ''}
          ${tedarikciNo ? `<tr><td style="padding:4px 0;color:#6b7280;">Sipariş/Fatura No</td><td><strong>${tedarikciNo}</strong></td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#6b7280;">Müşteri</td><td><strong>${selected.customer?.name ?? '—'}</strong></td></tr>
        </table>
      </div>
      <div style="margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Sorun Açıklaması</div>
        <div>${selected.problemDesc ?? '—'}</div>
      </div>
      <div style="margin-bottom:16px;padding:12px;background:#fef9c3;border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:#854d0e;text-transform:uppercase;margin-bottom:6px;">Talebimiz</div>
        <div style="font-size:13px;font-weight:700;">Yukarıda belirtilen ürün için <u>puan yükleme</u> talep ediyoruz.</div>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:12px;font-size:10px;color:#9ca3af;text-align:center;">Güven Optik POS · ${new Date().toLocaleString('tr-TR')}</div>
    `
    document.body.appendChild(div)
    const canvas = await html2canvas(div, { scale: 2, backgroundColor: '#ffffff' })
    document.body.removeChild(div)
    const pdf = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width)
    pdf.save(`tedarikci-bilgi-${selected.claimNo}.pdf`)
  }

  async function pdfIadeFatura() {
    if (!selected) return
    const jsPDF = (await import('jspdf')).default
    const html2canvas = (await import('html2canvas')).default
    const chain = selected.chainJson ? JSON.parse(selected.chainJson).reverse() : []
    const div = document.createElement('div')
    div.style.cssText = 'width:794px;padding:40px;background:white;font-family:Arial,sans-serif;font-size:12px;color:#111;position:fixed;left:-9999px;'
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #C8102E;">
        <div><div style="font-size:22px;font-weight:700;">Güven Optik</div><div style="color:#6b7280;font-size:11px;">1959 · İade Belgesi</div></div>
        <div style="text-align:right;"><div style="font-size:10px;color:#9ca3af;">Garanti Takip No</div><div style="font-size:20px;font-weight:700;color:#C8102E;">${selected.claimNo}</div><div style="font-size:11px;color:#6b7280;">${new Date().toLocaleDateString('tr-TR')}</div></div>
      </div>
      <div style="margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Ürün Bilgileri</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <tr><td style="padding:4px 0;color:#6b7280;width:140px;">Ürün</td><td><strong>${selected.productName ?? '—'}</strong></td></tr>
          ${selected.lotNo ? `<tr><td style="padding:4px 0;color:#6b7280;">Lot/Seri No</td><td><strong>${selected.lotNo}</strong></td></tr>` : ''}
          ${selected.barcode ? `<tr><td style="padding:4px 0;color:#6b7280;">Barkod</td><td><strong>${selected.barcode}</strong></td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#6b7280;">Müşteri</td><td><strong>${selected.customer?.name ?? '—'}</strong></td></tr>
          <tr><td style="padding:4px 0;color:#6b7280;">Sorun</td><td>${selected.problemDesc ?? '—'}</td></tr>
        </table>
      </div>
      <div style="margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:8px;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">İade Silsilesi</div>
        ${chain.map((adim: string, i: number) => chain[i + 1] ? `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;">
          <span style="padding:3px 10px;border-radius:4px;background:#fee2e2;color:#991b1b;font-weight:600;">${adim}</span>
          <span>→</span>
          <span style="padding:3px 10px;border-radius:4px;background:#dbeafe;color:#1e40af;font-weight:600;">${chain[i + 1]}</span>
          <span style="color:#6b7280;">iade faturası</span>
          ${iadeAdimlar[`iade_${i}`] && iadeAdimlar[`iade_${i}_fatura`] ? `<span style="margin-left:auto;font-size:11px;color:#374151;">Fatura: <strong>${iadeAdimlar[`iade_${i}_fatura`]}</strong></span>` : ''}
        </div>
      ` : '').join('')}
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:12px;font-size:10px;color:#9ca3af;text-align:center;">Güven Optik POS · ${new Date().toLocaleString('tr-TR')}</div>
    `
    document.body.appendChild(div)
    const canvas = await html2canvas(div, { scale: 2, backgroundColor: '#ffffff' })
    document.body.removeChild(div)
    const pdf = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width)
    pdf.save(`iade-${selected.claimNo}.pdf`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Garanti & İade</h1>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: '1.5rem' }}>
          {[
            { lbl: 'Açık', val: stats.open, color: '#854d0e' },
            { lbl: 'Firmada', val: stats.sent, color: '#1e40af' },
            { lbl: 'Çözümlendi', val: stats.resolved, color: '#166534' },
            { lbl: 'Garanti dışı', val: stats.outOfWarranty, color: '#991b1b' },
          ].map(c => (
            <div key={c.lbl} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{c.lbl}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.val}</div>
            </div>
          ))}
        </div>
      )}

      {!selected ? (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="GTK no, müşteri, ürün..." style={{ flex: 1, minWidth: 180, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
              <option value="">Tüm durumlar</option>
              {Object.entries(DURUM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={katFilter} onChange={e => setKatFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
              <option value="">Tüm kategoriler</option>
              {Object.entries(KATEGORI_LABEL).filter(([k], i, a) => a.findIndex(([,v]) => v === KATEGORI_LABEL[k]) === i).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['GTK No', 'Tarih', 'Müşteri', 'Ürün', 'Kategori', 'Şube', 'Durum', ''].map(h => (
                    <td key={h} style={{ padding: '10px 12px', color: '#6b7280', fontWeight: 600 }}>{h}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} style={{ padding: 16, color: '#6b7280', textAlign: 'center' }}>Yükleniyor...</td></tr>}
                {!loading && claims.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: '#6b7280', textAlign: 'center' }}>Kayıt bulunamadı.</td></tr>}
                {claims.map(c => {
                  const renk = DURUM_RENK[c.status] ?? { bg: '#f3f4f6', color: '#374151' }
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => { setSelected(c); setDepoStatus(c.status) }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#C8102E' }}>{c.claimNo}</td>
                      <td style={{ padding: '10px 12px' }}>{new Date(c.createdAt).toLocaleDateString('tr-TR')}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{c.customer?.name ?? '—'}</td>
                      <td style={{ padding: '10px 12px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.productName ?? '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{c.productCategory ? (KATEGORI_LABEL[c.productCategory] ?? c.productCategory) : '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#6b7280' }}>{subeMap[c.branchId ?? ''] ?? c.branchId ?? '—'}</td>
                      <td style={{ padding: '10px 12px' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: renk.bg, color: renk.color, fontWeight: 600 }}>{DURUM_LABEL[c.status] ?? c.status}</span></td>
                      <td style={{ padding: '10px 12px' }}><button type="button" style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #e5e7eb' }}>Detay</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{selected.claimNo}</div>
            <button type="button" onClick={() => setSelected(null)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 12 }}>← Liste</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Müşteri & Ürün</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px' }}>
                <span style={{ color: '#6b7280' }}>Müşteri</span><strong>{selected.customer?.name ?? '—'}</strong>
                <span style={{ color: '#6b7280' }}>Ürün</span><strong>{selected.productName ?? '—'}</strong>
                <span style={{ color: '#6b7280' }}>Kategori</span><strong>{selected.productCategory ? (KATEGORI_LABEL[selected.productCategory] ?? selected.productCategory) : '—'}</strong>
                <span style={{ color: '#6b7280' }}>Tür</span><strong>{TUR_LABEL[selected.type] ?? selected.type}</strong>
                {selected.lotNo && <><span style={{ color: '#6b7280' }}>Lot/Seri</span><strong>{selected.lotNo}</strong></>}
                {selected.barcode && <><span style={{ color: '#6b7280' }}>Barkod</span><strong>{selected.barcode}</strong></>}
                {selected.internalRef && <><span style={{ color: '#6b7280' }}>İç ref</span><strong>{selected.internalRef}</strong></>}
                <span style={{ color: '#6b7280' }}>Şube</span><strong>{subeMap[selected.branchId ?? ''] ?? selected.branchId ?? '—'}</strong>
                <span style={{ color: '#6b7280' }}>Kayıt açan</span><strong>{selected.user?.name ?? selected.user?.username ?? '—'}</strong>
              </div>
              {selected.chainJson && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb', fontSize: 11, color: '#6b7280' }}>
                  İade silsilesi: {JSON.parse(selected.chainJson).join(' → ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Sorun</div>
                <div>{selected.problemDesc ?? '—'}</div>
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Durum güncelle</div>
                <select value={depoStatus} onChange={e => setDepoStatus(e.target.value)} style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, marginBottom: 8 }}>
                  {Object.entries(DURUM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <textarea value={depoNot} onChange={e => setDepoNot(e.target.value)} rows={2} placeholder="Not veya firma yanıtı..." style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 10 }}>Sonuç & İade</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 10px', border: `1px solid ${sonuc === 'PUAN' ? '#C8102E' : '#e5e7eb'}`, borderRadius: 8, background: sonuc === 'PUAN' ? '#fdf2f4' : 'white' }}>
                    <input type="radio" name="sonuc" value="PUAN" checked={sonuc === 'PUAN'} onChange={() => setSonuc('PUAN')} />
                    <div><div style={{ fontWeight: 600 }}>Puan yükleme</div><div style={{ fontSize: 11, color: '#6b7280' }}>Firma hesabımıza puan yükleyecek</div></div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 10px', border: `1px solid ${sonuc === 'YENI_URUN' ? '#C8102E' : '#e5e7eb'}`, borderRadius: 8, background: sonuc === 'YENI_URUN' ? '#fdf2f4' : 'white' }}>
                    <input type="radio" name="sonuc" value="YENI_URUN" checked={sonuc === 'YENI_URUN'} onChange={() => setSonuc('YENI_URUN')} />
                    <div><div style={{ fontWeight: 600 }}>Yeni ürün / parça</div><div style={{ fontSize: 11, color: '#6b7280' }}>Firma yeni ürün veya parça gönderecek</div></div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 10px', border: `1px solid ${sonuc === 'IADE' ? '#C8102E' : '#e5e7eb'}`, borderRadius: 8, background: sonuc === 'IADE' ? '#fdf2f4' : 'white' }}>
                    <input type="radio" name="sonuc" value="IADE" checked={sonuc === 'IADE'} onChange={() => setSonuc('IADE')} />
                    <div><div style={{ fontWeight: 600 }}>Fatura iadesi</div><div style={{ fontSize: 11, color: '#6b7280' }}>Silsile boyunca iade faturası kesilecek</div></div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '8px 10px', border: `1px solid ${sonuc === 'GARANTI_DISI' ? '#C8102E' : '#e5e7eb'}`, borderRadius: 8, background: sonuc === 'GARANTI_DISI' ? '#fdf2f4' : 'white' }}>
                    <input type="radio" name="sonuc" value="GARANTI_DISI" checked={sonuc === 'GARANTI_DISI'} onChange={() => setSonuc('GARANTI_DISI')} />
                    <div><div style={{ fontWeight: 600 }}>Garanti dışı</div><div style={{ fontSize: 11, color: '#6b7280' }}>Firma kabul etmedi</div></div>
                  </label>
                </div>

                {sonuc === 'PUAN' && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Tedarikçi sipariş / fatura no</div>
                    <input type="text" value={tedarikciNo} onChange={e => setTedarikciNo(e.target.value)} placeholder="SIP-2024-0312 veya FAT-2024-0891..." style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
                    <button type="button" onClick={() => void pdfTedarikci()} style={{ marginTop: 8, width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #374151', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      📄 Tedarikçi Bilgi Formu PDF
                    </button>
                  </div>
                )}

                {sonuc === 'YENI_URUN' && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Gelen ürün / parça</div>
                    <input type="text" value={yeniUrunAdi} onChange={e => setYeniUrunAdi(e.target.value)} placeholder="Ürün adı veya parça açıklaması..." style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, marginBottom: 8 }} />
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Not: Ürün girişi yapılırken garanti no ({selected?.claimNo}) fatura notuna eklenecek.</div>
                    <button type="button" onClick={() => window.open('/admin/depo?sekme=transfer&garantiNo=' + selected?.claimNo, '_blank')} style={{ width: '100%', padding: '8px', borderRadius: 6, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      📦 Ürün Girişine Git
                    </button>
                  </div>
                )}

                {sonuc === 'IADE' && selected?.chainJson && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>İade silsilesi</div>
                    {JSON.parse(selected.chainJson).reverse().map((adim: string, i: number, arr: string[]) => {
                      const sonrakiAdim = arr[i + 1]
                      return sonrakiAdim ? (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>{adim}</span>
                          <span>→</span>
                          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontWeight: 600 }}>{sonrakiAdim}</span>
                          <span style={{ color: '#6b7280' }}>iade faturası</span>
                        </div>
                      ) : null
                    })}
                    <div style={{ marginTop: 10 }}>
                      {!iadeOnaylandi ? (
                        <button type="button" onClick={() => setIadeOnaylandi(true)} style={{ width: '100%', padding: '9px', borderRadius: 6, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                          ✓ İade Sürecini Onayla ve PDF Oluştur
                        </button>
                      ) : (
                        <div>
                          <div style={{ fontSize: 12, color: '#166534', fontWeight: 700, marginBottom: 8 }}>✓ İade süreci onaylandı — tüm adımlar tamamlandı</div>
                          <button type="button" onClick={() => void pdfIadeFatura()} style={{ width: '100%', padding: '9px', borderRadius: 6, border: '1px solid #374151', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                            📄 İade Belgesi PDF
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {sonuc === 'GARANTI_DISI' && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}>
                    {!garantiDisiOnaylandi ? (
                      <button type="button" onClick={async () => {
                        await updateWarrantyClaim(selected!.id, { status: 'OUT_OF_WARRANTY' })
                        setGarantiDisiOnaylandi(true)
                        void loadData()
                      }} style={{ width: '100%', padding: '9px', borderRadius: 6, background: '#374151', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        Garanti Dışı Olarak Kapat
                      </button>
                    ) : (
                      <div style={{ color: '#991b1b', fontWeight: 700, fontSize: 12 }}>✓ Garanti dışı olarak kapatıldı.</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>İletişim / Notlar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8, maxHeight: 180, overflowY: 'auto' }}>
              {(selected.messages ?? []).map(m => (
                <div key={m.id} style={{ background: 'white', borderRadius: 6, padding: '7px 10px', border: '1px solid #e5e7eb', fontSize: 12 }}>
                  <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>{m.user?.name ?? m.user?.username} · {new Date(m.createdAt).toLocaleString('tr-TR')}</div>
                  {m.message}
                </div>
              ))}
              {(selected.messages ?? []).length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>Henüz not yok.</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={mesaj} onChange={e => setMesaj(e.target.value)} onKeyDown={e => e.key === 'Enter' && void mesajGonder()} placeholder="Not ekle..." style={{ flex: 1, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12 }} />
              <button type="button" onClick={() => void mesajGonder()} style={{ padding: '7px 14px', borderRadius: 6, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12 }}>Gönder</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => void pdfIndir(selected)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #374151', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>📄 PDF</button>
            <button type="button" onClick={() => void kaydet()} style={{ padding: '10px 20px', borderRadius: 8, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Kaydet</button>
          </div>
        </div>
      )}
    </div>
  )
}
