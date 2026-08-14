import { useEffect, useState, useCallback } from 'react'
import { apiClient } from '../api/client'
import {
  getWarrantyStats, getWarrantyClaims, createWarrantyClaim,
  updateWarrantyClaim, addWarrantyMessage, type WarrantyClaim
} from '../api/warranty.api'

const DURUM_LABEL: Record<string, string> = {
  OPEN: 'Açık', SENT_TO_SUPPLIER: 'Firmaya gönderildi',
  WAITING_RESPONSE: 'Yanıt bekleniyor', IN_RETURN_PROCESS: 'İade sürecinde',
  RESOLVED: 'Çözümlendi', OUT_OF_WARRANTY: 'Garanti dışı',
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
const KATEGORI_LABEL: Record<string, string> = {
  LENS_RX: 'Cam',
  OPTICAL_FRAME_READY: 'Optik Çerçeve',
  OPTICAL_FRAME_RX: 'Optik Çerçeve',
  SUNGLASSES_READY: 'Güneş Gözlüğü',
  SUNGLASSES_RX: 'Güneş Gözlüğü',
  CONTACT_LENS_READY: 'Kontak Lens',
  CONTACT_LENS_RX: 'Kontak Lens',
  SOLUTION: 'Solüsyon',
  ACCESSORY: 'Aksesuar',
}
// Kategori filtre dropdown'ı için benzersiz etiket listesi (bkz. yukarıdaki not).
const KATEGORI_FILTRE_ETIKETLERI = Array.from(new Set(Object.values(KATEGORI_LABEL)))

export default function GarantiPage() {
  const [sekme, setSekme] = useState<'pos' | 'depo'>('pos')
  const [stats, setStats] = useState<any>(null)
  const [claims, setClaims] = useState<WarrantyClaim[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedClaim, setSelectedClaim] = useState<WarrantyClaim | null>(null)
  const [loading, setLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // POS akış state
  const [posStep, setPosStep] = useState(1)
  const [musteriQ, setMusteriQ] = useState('')
  const [musteriSonuc, setMusteriSonuc] = useState<any[]>([])
  const [seciliMusteri, setSeciliMusteri] = useState<any>(null)
  const [musteriSatislar, setMusteriSatislar] = useState<any[]>([])
  const [seciliSatis, setSeciliSatis] = useState<any>(null)
  const [seciliKalem, setSeciliKalem] = useState<any>(null)
  const [form, setForm] = useState({ type: 'CUSTOMER_WARRANTY', expectedOutcome: 'UNKNOWN', problemDesc: '' })
  const [yeniKayit, setYeniKayit] = useState<any>(null)

  // Depo state
  const [depoNot, setDepoNot] = useState('')
  const [depoStatus, setDepoStatus] = useState('')
  const [mesaj, setMesaj] = useState('')
  const [mesajGonderiliyor, setMesajGonderiliyor] = useState(false)

  const loadClaims = useCallback(async () => {
    setLoading(true)
    try {
      const [s, c] = await Promise.all([
        getWarrantyStats(),
        getWarrantyClaims({ search: search || undefined, status: statusFilter || undefined })
      ])
      setStats(s)
      setClaims(c)
      setUnreadCount(c.filter((cl: WarrantyClaim) => cl.status === 'OPEN').length)
    } finally { setLoading(false) }
  }, [search, statusFilter])

  useEffect(() => { void loadClaims() }, [loadClaims])

  async function musteriAra() {
    if (!musteriQ.trim()) return
    const res = await apiClient.get(`/customers?q=${encodeURIComponent(musteriQ)}`)
    setMusteriSonuc(res.data?.data ?? res.data ?? [])
  }

  async function musteriSec(m: any) {
    setSeciliMusteri(m)
    const res = await apiClient.get(`/sales?customerId=${m.id}&status=PAID`)
    const satislar = res.data?.data ?? res.data ?? []
    // Her satış için detay çek (items dahil)
    const detaylar = await Promise.all(
      satislar.slice(0, 20).map((s: any) =>
        apiClient.get(`/sales/${s.id}`).then(r => r.data).catch(() => s)
      )
    )
    setMusteriSatislar(detaylar)
    setPosStep(2)
  }

  function satisSec(s: any) {
    setSeciliSatis(s)
    setPosStep(3)
  }

  function kalemSec(k: any) {
    setSeciliKalem(k)
    setPosStep(4)
  }

  async function kaydet() {
    const chain = ['Tedarikçi', 'NG Ana Depo', seciliSatis?.branchId ?? 'Şube', 'Müşteri']
    const data = {
      saleId: seciliSatis?.id,
      saleItemId: seciliKalem?.id,
      customerId: seciliMusteri?.id,
      branchId: seciliSatis?.branchId,
      type: form.type,
      expectedOutcome: form.expectedOutcome,
      problemDesc: form.problemDesc,
      productName: seciliKalem?.odooProductName || seciliKalem?.product?.name,
      productCategory: seciliKalem?.product?.category ?? null,
      odooCategoryId: seciliKalem?.odooCategoryId ?? null,
      lotNo: seciliKalem?.lotNo,
      barcode: seciliKalem?.barcode,
      internalRef: seciliKalem?.internalRef,
      supplierName: seciliKalem?.supplierName,
      chainJson: JSON.stringify(chain),
    }
    const result = await createWarrantyClaim(data)
    setYeniKayit(result)
    setPosStep(5)
    void loadClaims()
  }

  async function depoKaydet() {
    if (!selectedClaim) return
    await updateWarrantyClaim(selectedClaim.id, {
      status: depoStatus || selectedClaim.status,
      supplierNote: depoNot,
    })
    setSelectedClaim(null)
    setDepoNot(''); setDepoStatus('')
    void loadClaims()
  }

  async function mesajGonder() {
    if (!selectedClaim || !mesaj.trim()) return
    setMesajGonderiliyor(true)
    try {
      await addWarrantyMessage(selectedClaim.id, mesaj)
      setMesaj('')
      const updated = await apiClient.get(`/warranty/${selectedClaim.id}`).then(r => r.data)
      setSelectedClaim(updated)
    } finally { setMesajGonderiliyor(false) }
  }

  async function pdfIndir(claim: WarrantyClaim) {
    const jsPDF = (await import('jspdf')).default
    const html2canvas = (await import('html2canvas')).default
    const div = document.createElement('div')
    div.style.cssText = 'width:794px;padding:40px;background:white;font-family:Arial,sans-serif;font-size:12px;color:#111;'
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
      ${claim.chainJson ? `<div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:16px;"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">İade Silsilesi</div><div>${JSON.parse(claim.chainJson).join(' → ')}</div></div>` : ''}
      <div style="border-top:1px solid #e5e7eb;padding-top:12px;text-align:center;font-size:10px;color:#9ca3af;">Güven Optik POS · ${new Date().toLocaleString('tr-TR')} · Bu belge garanti kaydının resmi çıktısıdır.</div>
    `
    document.body.appendChild(div)
    const canvas = await html2canvas(div, { scale: 2, backgroundColor: '#ffffff' })
    document.body.removeChild(div)
    const pdf = new jsPDF({ format: 'a4', unit: 'mm', orientation: 'portrait' })
    const imgData = canvas.toDataURL('image/png')
    const W = 210
    const imgH = (canvas.height * W) / canvas.width
    pdf.addImage(imgData, 'PNG', 0, 0, W, imgH)
    pdf.save(`garanti-${claim.claimNo}.pdf`)
  }

  const card = { background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>Garanti & İade</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['pos', 'depo'] as const).map(s => (
            <button key={s} type="button" onClick={() => { setSekme(s); if (s === 'depo') setUnreadCount(0) }}
              style={{ position: 'relative', padding: '8px 18px', borderRadius: 8, border: sekme === s ? 'none' : '1px solid #e5e7eb', backgroundColor: sekme === s ? '#C8102E' : 'white', color: sekme === s ? 'white' : '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {s === 'pos' ? '+ Yeni Kayıt' : 'Operasyon — İşlem'}
              {s === 'depo' && unreadCount > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
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

      {sekme === 'pos' && (
        <div style={card}>
          {posStep === 1 && (
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>Adım 1 — Müşteri ara</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input value={musteriQ} onChange={e => setMusteriQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void musteriAra()} placeholder="Telefon veya müşteri adı..." style={{ flex: 1, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
                <button type="button" onClick={() => void musteriAra()} style={{ padding: '8px 16px', borderRadius: 8, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Ara</button>
              </div>
              {musteriSonuc.map((m: any) => (
                <div key={m.id} onClick={() => void musteriSec(m)} style={{ padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><div style={{ fontWeight: 700 }}>{m.name}</div><div style={{ fontSize: 11, color: '#6b7280' }}>{m.phone}</div></div>
                  <span style={{ color: '#9ca3af' }}>›</span>
                </div>
              ))}
            </div>
          )}

          {posStep === 2 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <button type="button" onClick={() => setPosStep(1)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 12 }}>← Geri</button>
                <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>Adım 2 — Satış seç</span>
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, fontWeight: 700 }}>{seciliMusteri?.name} · {seciliMusteri?.phone}</div>
              {musteriSatislar.length === 0 && <div style={{ fontSize: 13, color: '#6b7280' }}>Tamamlanmış satış bulunamadı.</div>}
              {musteriSatislar.map((s: any) => {
                const kalemler = (s.items ?? [])
                  .filter((i: any) => i.status !== 'VOID')
                  .map((i: any) => i.odooProductName || i.product?.name)
                  .filter(Boolean)
                return (
                  <div key={s.id} onClick={() => satisSec(s)} style={{ padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {new Date(s.createdAt).toLocaleDateString('tr-TR')}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
                          {kalemler.length > 0 ? kalemler.join(' · ') : 'Kalem bilgisi yok'}
                        </div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          Satış No: {s.id.slice(-8).toUpperCase()}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700 }}>₺{Number(s.netTotal).toLocaleString('tr-TR')}</div>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                          {s.status === 'PAID' ? 'Tamamlandı' : s.status}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {posStep === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <button type="button" onClick={() => setPosStep(2)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 12 }}>← Geri</button>
                <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>Adım 3 — Kalem seç</span>
              </div>
              {(seciliSatis?.items ?? []).filter((i: any) => i.status !== 'VOID').map((k: any) => {
                const urunAdi = (k.odooProductName && !k.odooProductName.includes('PLACEHOLDER'))
                  ? k.odooProductName
                  : k.product?.name && !k.product.name.includes('PLACEHOLDER')
                  ? k.product.name
                  : 'Cam'
                return (
                  <div key={k.id} onClick={() => kalemSec(k)} style={{ padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{urunAdi}</div>
                      <div style={{ textAlign: 'right', fontSize: 12, color: '#6b7280' }}>₺{Number(k.unitPrice).toLocaleString('tr-TR')}</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', fontSize: 11, color: '#6b7280' }}>
                      {k.lotNo && <span>🔖 Lot/Seri: <strong style={{ color: '#374151' }}>{k.lotNo}</strong></span>}
                      {k.barcode && <span>📦 Barkod: <strong style={{ color: '#374151' }}>{k.barcode}</strong></span>}
                      {k.internalRef && <span>🏷 İç ref: <strong style={{ color: '#374151' }}>{k.internalRef}</strong></span>}
                      {k.utsCode && <span>🔐 UTS: <strong style={{ color: '#374151' }}>{k.utsCode}</strong></span>}
                      {!k.lotNo && !k.barcode && !k.internalRef && !k.utsCode && (
                        <span style={{ color: '#d1d5db' }}>Lot/seri/barkod kaydı yok</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {posStep === 4 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <button type="button" onClick={() => setPosStep(3)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 12 }}>← Geri</button>
                <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>Adım 4 — Garanti formu</span>
              </div>
              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                  <div><span style={{ color: '#6b7280' }}>Müşteri:</span> <strong>{seciliMusteri?.name}</strong></div>
                  <div><span style={{ color: '#6b7280' }}>Şube:</span> <strong>{seciliSatis?.branchId ?? '—'}</strong></div>
                  <div><span style={{ color: '#6b7280' }}>Ürün:</span> <strong>{seciliKalem?.odooProductName || seciliKalem?.product?.name}</strong></div>
                  {seciliKalem?.lotNo && <div><span style={{ color: '#6b7280' }}>Lot:</span> <strong>{seciliKalem.lotNo}</strong></div>}
                  {seciliKalem?.barcode && <div><span style={{ color: '#6b7280' }}>Barkod:</span> <strong>{seciliKalem.barcode}</strong></div>}
                  {seciliKalem?.internalRef && <div><span style={{ color: '#6b7280' }}>İç ref:</span> <strong>{seciliKalem.internalRef}</strong></div>}
                </div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb', fontSize: 11, color: '#6b7280' }}>
                  Silsile: Tedarikçi → NG Ana Depo → {seciliSatis?.branchId ?? 'Şube'} → Müşteri
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Kayıt türü</div>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                    {Object.entries(TUR_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Beklenen sonuç</div>
                  <select value={form.expectedOutcome} onChange={e => setForm(f => ({ ...f, expectedOutcome: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                    <option value="UNKNOWN">Belirsiz</option>
                    <option value="NEW_PRODUCT">Yeni ürün</option>
                    <option value="REPAIR">Parça / tamir</option>
                    <option value="POINTS">Puan yükleme</option>
                    <option value="REFUND">Para iadesi</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Sorun açıklaması</div>
                <textarea value={form.problemDesc} onChange={e => setForm(f => ({ ...f, problemDesc: e.target.value }))} rows={3} placeholder="Müşterinin şikayeti veya ürünün durumu..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => void kaydet()} style={{ padding: '10px 24px', borderRadius: 8, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Kaydı oluştur</button>
              </div>
            </div>
          )}

          {posStep === 5 && yeniKayit && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 8 }}>Garanti kaydı oluşturuldu</div>
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 20px', display: 'inline-block', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Takip numarası</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#C8102E' }}>{yeniKayit.claimNo}</div>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Bu numara ile takip edebilirsiniz.</div>
              <button type="button" onClick={() => { setPosStep(1); setSeciliMusteri(null); setSeciliSatis(null); setSeciliKalem(null); setMusteriQ(''); setMusteriSonuc([]); setYeniKayit(null); setForm({ type: 'CUSTOMER_WARRANTY', expectedOutcome: 'UNKNOWN', problemDesc: '' }) }} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontSize: 13 }}>Yeni kayıt</button>
            </div>
          )}
        </div>
      )}

      {sekme === 'depo' && (
        <div>
          {!selectedClaim ? (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="GTK no, müşteri adı..." style={{ flex: 1, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }} />
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                  <option value="">Tüm durumlar</option>
                  {Object.entries(DURUM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                  <option value="">Tüm kategoriler</option>
                  {/* KATEGORI_LABEL birden çok Odoo kodunu aynı görünen etikete eşliyor
                      (ör. OPTICAL_FRAME_READY ve OPTICAL_FRAME_RX ikisi de "Optik Çerçeve") —
                      kod bazlı listelemek aynı etiketin iki kez görünmesine yol açıyordu.
                      Bunun yerine benzersiz ETİKET listeleniyor. */}
                  {KATEGORI_FILTRE_ETIKETLERI.map(label => <option key={label} value={label}>{label}</option>)}
                </select>
              </div>
              {loading && <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor...</div>}
              {claims.filter(c => !categoryFilter || KATEGORI_LABEL[c.productCategory as string] === categoryFilter).map(c => {
                const renk = DURUM_RENK[c.status] ?? { bg: '#f3f4f6', color: '#374151' }
                const chain = c.chainJson ? JSON.parse(c.chainJson) : []
                return (
                  <div key={c.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => { setSelectedClaim(c); setDepoStatus(c.status) }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: '#C8102E' }}>{c.claimNo}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: renk.bg, color: renk.color, fontWeight: 600 }}>{DURUM_LABEL[c.status] ?? c.status}</span>
                        {c.productCategory && KATEGORI_LABEL[c.productCategory] && (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#f3f4f6', color: '#374151', fontWeight: 600, marginLeft: 6 }}>
                            {KATEGORI_LABEL[c.productCategory]}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{c.customer?.name} · {c.productName} · {c.branchId}</div>
                      {chain.length > 0 && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Silsile: {chain.join(' → ')}</div>}
                    </div>
                    <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>
                  </div>
                )
              })}
              {!loading && claims.length === 0 && <div style={{ fontSize: 13, color: '#6b7280' }}>Kayıt bulunamadı.</div>}
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{selectedClaim.claimNo} — İşlem</div>
                <button type="button" onClick={() => setSelectedClaim(null)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 12 }}>← Liste</button>
              </div>

              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                  <div><span style={{ color: '#6b7280' }}>Müşteri:</span> <strong>{selectedClaim.customer?.name}</strong></div>
                  <div><span style={{ color: '#6b7280' }}>Şube:</span> <strong>{selectedClaim.branchId ?? '—'}</strong></div>
                  <div><span style={{ color: '#6b7280' }}>Ürün:</span> <strong>{selectedClaim.productName}</strong></div>
                  <div><span style={{ color: '#6b7280' }}>Satış personeli:</span> <strong>{(selectedClaim as any).saleUser ?? selectedClaim.user?.name ?? selectedClaim.user?.username ?? '—'}</strong></div>
                  <div><span style={{ color: '#6b7280' }}>Kayıt açan:</span> <strong>{selectedClaim.user?.name ?? selectedClaim.user?.username ?? '—'}</strong></div>
                  {selectedClaim.lotNo && <div><span style={{ color: '#6b7280' }}>Lot:</span> <strong>{selectedClaim.lotNo}</strong></div>}
                  {selectedClaim.barcode && <div><span style={{ color: '#6b7280' }}>Barkod:</span> <strong>{selectedClaim.barcode}</strong></div>}
                </div>
                {selectedClaim.chainJson && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e5e7eb', fontSize: 11, color: '#6b7280' }}>
                    İade silsilesi: {JSON.parse(selectedClaim.chainJson).reverse().join(' → ')}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Durum güncelle</div>
                <select value={depoStatus} onChange={e => setDepoStatus(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}>
                  {Object.entries(DURUM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Operasyon notu</div>
                <textarea value={depoNot} onChange={e => setDepoNot(e.target.value)} rows={2} placeholder="Firmadan gelen yanıt veya işlem notu..." style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8 }}>İletişim / notlar</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8, maxHeight: 200, overflowY: 'auto' }}>
                  {(selectedClaim.messages ?? []).map(m => (
                    <div key={m.id} style={{ background: 'white', borderRadius: 8, padding: '8px 12px', border: '1px solid #e5e7eb', fontSize: 12 }}>
                      <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{m.user?.name ?? m.user?.username} · {new Date(m.createdAt).toLocaleString('tr-TR')}</div>
                      {m.message}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={mesaj} onChange={e => setMesaj(e.target.value)} onKeyDown={e => e.key === 'Enter' && void mesajGonder()} placeholder="Not ekle..." style={{ flex: 1, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }} />
                  <button type="button" onClick={() => void mesajGonder()} disabled={mesajGonderiliyor} style={{ padding: '7px 14px', borderRadius: 8, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12 }}>Gönder</button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" onClick={() => void pdfIndir(selectedClaim)} style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #374151', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  📄 PDF
                </button>
                <button type="button" onClick={() => void depoKaydet()} style={{ padding: '10px 24px', borderRadius: 8, background: '#C8102E', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Kaydet</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
