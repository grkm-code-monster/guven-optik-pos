import { useEffect, useMemo, useState } from 'react'
import { adminApi } from './AdminLayout'

// 27.11.2026 — Müdahale Paneli Faz 1 (sadece ADMIN): ödeme düzeltme (tür/banka/taksit/tarih/bölme),
// satış tarihi düzeltme, satış temsilcisi ve düzeltme geçmişi. Her işlem önce ÖNİZLE (hiçbir şey
// yazılmaz), sonra ONAYLA. Önizlemeden sonra form değişirse onay kilitlenir, yeniden önizleme gerekir.

export type MudahalePayment = {
  id: string
  paymentType: string
  grossAmount: string | number
  netAmount: string | number
  bankId: string | null
  posDeviceId: string | null
  installment: number | null
  createdAt: string
  aciklama?: string | null
}

type Bank = { id: string; name: string; isActive: boolean; posDevices: Array<{ id: string; name: string; branchId: string; isActive: boolean }> }
type Plan = { satirlar: string[]; uyarilar: string[]; engeller: string[] }

export const TUR_AD: Record<string, string> = {
  CASH: 'Nakit', CARD: 'Kart', TRANSFER: 'Havale', OPEN_ACCOUNT: 'Açık hesap', SGK: 'SGK', VAKIF: 'Vakıf/Kurum', ETICARET: 'E-ticaret', CIRO_DUZELTME: 'Ciro düzeltme',
}
const DUZELTILEBILIR = ['CASH', 'CARD', 'TRANSFER', 'OPEN_ACCOUNT', 'SGK', 'VAKIF']

const gunTR = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 10)
const saatTR = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(11, 16)
const trYaz = (iso: string) => `${gunTR(iso).split('-').reverse().join('.')} ${saatTR(iso)}`
const tl = (v: string | number) => `${Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`

const S = {
  baslik: { fontSize: 11, color: '#6b7280', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' as const },
  kutu: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 },
  input: { padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, width: '100%', boxSizing: 'border-box' as const },
  btn: { fontSize: 11, padding: '5px 10px', borderRadius: 999, border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', fontWeight: 700 },
  btnAna: { fontSize: 11, padding: '6px 10px', borderRadius: 999, border: 'none', background: '#C8102E', color: 'white', fontWeight: 700, cursor: 'pointer', flex: 1 },
  etiket: { fontSize: 10, color: '#6b7280', fontWeight: 700 },
}

function PlanGoster({ plan }: { plan: Plan }) {
  return (
    <div style={{ fontSize: 11.5, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {plan.engeller.map((e, i) => <div key={'e' + i} style={{ color: '#991b1b', fontWeight: 700 }}>⛔ {e}</div>)}
      {plan.satirlar.map((s, i) => <div key={'s' + i}>• {s}</div>)}
      {plan.uyarilar.map((u, i) => <div key={'u' + i} style={{ color: '#92400e' }}>⚠️ {u}</div>)}
    </div>
  )
}

function hataMesaji(e: any, varsayilan: string) {
  return e?.response?.data?.message ?? e?.message ?? varsayilan
}

// ───────────────────────── Ödemeler ─────────────────────────

type Satir = { tur: string; tutar: string; tarih: string; bankId: string; posDeviceId: string; taksit: string }

function OdemeDuzelt({ saleId, pay, bankalar, branchId, onBitti, onIptal }: {
  saleId: string; pay: MudahalePayment; bankalar: Bank[]; branchId: string | null; onBitti: (m: string) => void; onIptal: () => void
}) {
  const [satirlar, setSatirlar] = useState<Satir[]>([{
    tur: pay.paymentType, tutar: String(Number(pay.grossAmount)), tarih: gunTR(pay.createdAt),
    bankId: pay.bankId ?? '', posDeviceId: pay.posDeviceId ?? '', taksit: String(pay.installment ?? 1),
  }])
  const [sebep, setSebep] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planAnahtar, setPlanAnahtar] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  const govde = useMemo(() => ({
    paymentId: pay.id,
    yeniler: satirlar.map((s) => ({
      tur: s.tur,
      tutar: Number(String(s.tutar).replace(',', '.')),
      tarih: s.tarih,
      bankId: s.tur === 'CARD' || s.tur === 'TRANSFER' ? s.bankId || null : null,
      posDeviceId: s.tur === 'CARD' ? s.posDeviceId || null : null,
      taksit: s.tur === 'CARD' ? Number(s.taksit) || 1 : null,
    })),
  }), [pay.id, satirlar])
  const anahtar = JSON.stringify(govde)
  const toplam = govde.yeniler.reduce((s, y) => s + (Number.isFinite(y.tutar) ? y.tutar : 0), 0)

  function guncelle(i: number, alan: keyof Satir, deger: string) {
    setSatirlar((prev) => prev.map((s, j) => {
      if (j !== i) return s
      const n = { ...s, [alan]: deger }
      if (alan === 'bankId') {
        const b = bankalar.find((x) => x.id === deger)
        const cihazlar = (b?.posDevices ?? []).filter((d) => d.isActive)
        n.posDeviceId = (cihazlar.find((d) => d.branchId === branchId) ?? cihazlar[0])?.id ?? ''
      }
      return n
    }))
  }

  async function onizle() {
    setYukleniyor(true); setHata(null)
    try {
      const r = await adminApi.post(`/sales/${saleId}/mudahale/odeme/onizle`, govde)
      setPlan(r.data); setPlanAnahtar(anahtar)
    } catch (e) { setHata(hataMesaji(e, 'Önizleme alınamadı.')); setPlan(null) } finally { setYukleniyor(false) }
  }

  async function uygula() {
    if (sebep.trim().length < 5) { setHata('Düzeltme sebebini en az 5 karakter yazın.'); return }
    setYukleniyor(true); setHata(null)
    try {
      const r = await adminApi.post(`/sales/${saleId}/mudahale/odeme/uygula`, { ...govde, sebep: sebep.trim() })
      onBitti(`Ödeme düzeltildi.${r.data?.odoo?.length ? ' Odoo: ' + r.data.odoo.join(', ') + '.' : ''}`)
    } catch (e) { setHata(hataMesaji(e, 'Ödeme düzeltilemedi.')) } finally { setYukleniyor(false) }
  }

  const onayHazir = !!plan && plan.engeller.length === 0 && planAnahtar === anahtar

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {satirlar.map((s, i) => {
        const b = bankalar.find((x) => x.id === s.bankId)
        return (
          <div key={i} style={{ border: '1px dashed #d1d5db', borderRadius: 8, padding: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <div style={S.etiket}>Tür</div>
              <select value={s.tur} onChange={(e) => guncelle(i, 'tur', e.target.value)} style={S.input}>
                {DUZELTILEBILIR.map((t) => <option key={t} value={t}>{TUR_AD[t]}</option>)}
              </select>
            </div>
            <div>
              <div style={S.etiket}>Tutar (₺)</div>
              <input value={s.tutar} onChange={(e) => guncelle(i, 'tutar', e.target.value)} style={S.input} />
            </div>
            <div>
              <div style={S.etiket}>Ödeme tarihi</div>
              <input type="date" value={s.tarih} onChange={(e) => guncelle(i, 'tarih', e.target.value)} style={S.input} />
            </div>
            {(s.tur === 'CARD' || s.tur === 'TRANSFER') ? (
              <div>
                <div style={S.etiket}>Banka</div>
                <select value={s.bankId} onChange={(e) => guncelle(i, 'bankId', e.target.value)} style={S.input}>
                  <option value="">Seçin</option>
                  {bankalar.filter((x) => x.isActive || x.id === s.bankId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            ) : <div />}
            {s.tur === 'CARD' && (
              <>
                <div>
                  <div style={S.etiket}>POS cihazı</div>
                  <select value={s.posDeviceId} onChange={(e) => guncelle(i, 'posDeviceId', e.target.value)} style={S.input}>
                    <option value="">Seçin</option>
                    {(b?.posDevices ?? []).filter((d) => d.isActive || d.id === s.posDeviceId).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={S.etiket}>Taksit</div>
                  <input type="number" min={1} max={36} value={s.taksit} onChange={(e) => guncelle(i, 'taksit', e.target.value)} style={S.input} />
                </div>
              </>
            )}
            {satirlar.length > 1 && (
              <button type="button" onClick={() => setSatirlar((p) => p.filter((_, j) => j !== i))} style={{ ...S.btn, gridColumn: '1 / -1', color: '#991b1b' }}>Bu satırı sil</button>
            )}
          </div>
        )
      })}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5 }}>
        {satirlar.length < 4 ? (
          <button type="button" style={S.btn} onClick={() => setSatirlar((p) => [...p, { ...p[p.length - 1], tutar: '0' }])}>+ Ödemeyi böl</button>
        ) : <span />}
        <span style={{ fontWeight: 700, color: Math.abs(toplam - Number(pay.grossAmount)) > 0.005 ? '#991b1b' : '#166534' }}>
          Toplam {tl(toplam)} / {tl(pay.grossAmount)}
        </span>
      </div>
      <input value={sebep} onChange={(e) => setSebep(e.target.value)} placeholder="Düzeltme sebebi (ör. ödeme 26.11'de Paynet ile alındı)" style={S.input} />
      {hata && <div style={{ color: '#991b1b', fontSize: 11.5, fontWeight: 600 }}>{hata}</div>}
      {plan && <PlanGoster plan={plan} />}
      {plan && planAnahtar !== anahtar && <div style={{ fontSize: 11, color: '#92400e' }}>Form değişti — yeniden önizleyin.</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onIptal} style={{ ...S.btn, flex: 1 }}>Vazgeç</button>
        <button type="button" disabled={yukleniyor} onClick={() => void onizle()} style={{ ...S.btn, flex: 1 }}>{yukleniyor ? '...' : 'Önizle'}</button>
        <button type="button" disabled={!onayHazir || yukleniyor} onClick={() => void uygula()} style={{ ...S.btnAna, opacity: onayHazir ? 1 : 0.4, cursor: onayHazir ? 'pointer' : 'not-allowed' }}>Onayla ve uygula</button>
      </div>
    </div>
  )
}

export function OdemelerBolumu({ saleId, payments, branchId, onDegisti }: {
  saleId: string; payments: MudahalePayment[]; branchId: string | null; onDegisti: (m: string) => void
}) {
  const [bankalar, setBankalar] = useState<Bank[]>([])
  const [acik, setAcik] = useState<string | null>(null)
  useEffect(() => {
    adminApi.get('/sales/payment-banks', { params: { tumu: 1 } })
      .then((r) => setBankalar(Array.isArray(r.data?.data) ? r.data.data : []))
      .catch(() => setBankalar([]))
  }, [])
  useEffect(() => { setAcik(null) }, [saleId])
  const bankAd = (id: string | null) => bankalar.find((b) => b.id === id)?.name ?? ''

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.baslik}>Ödemeler</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {payments.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>Ödeme kaydı yok.</div>}
        {[...payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((p) => (
          <div key={p.id} style={S.kutu}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700 }}>
              <span>{TUR_AD[p.paymentType] ?? p.paymentType}{p.bankId ? ` · ${bankAd(p.bankId)}` : ''}{p.installment ? ` · ${p.installment} taksit` : ''}</span>
              <span>{tl(p.grossAmount)}</span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {trYaz(p.createdAt)}{p.paymentType === 'CARD' ? ` · net ${tl(p.netAmount)}` : ''}
            </div>
            {p.aciklama && <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 2 }}>{p.aciklama}</div>}
            {acik !== p.id ? (
              DUZELTILEBILIR.includes(p.paymentType) && (
                <button type="button" style={{ ...S.btn, marginTop: 6 }} onClick={() => setAcik(p.id)}>Ödemeyi düzelt</button>
              )
            ) : (
              <OdemeDuzelt
                saleId={saleId}
                pay={p}
                bankalar={bankalar}
                branchId={branchId}
                onIptal={() => setAcik(null)}
                onBitti={(m) => { setAcik(null); onDegisti(m) }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ───────────────────────── Tarih ─────────────────────────

export function TarihBolumu({ saleId, createdAt, payments, onDegisti }: {
  saleId: string; createdAt: string; payments: MudahalePayment[]; onDegisti: (m: string) => void
}) {
  const [acik, setAcik] = useState(false)
  const [tarih, setTarih] = useState(gunTR(createdAt))
  const [saat, setSaat] = useState(saatTR(createdAt))
  const [secili, setSecili] = useState<string[]>([])
  const [sebep, setSebep] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planAnahtar, setPlanAnahtar] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  function ac() {
    setTarih(gunTR(createdAt)); setSaat(saatTR(createdAt))
    // varsayılan: satışla AYNI GÜN girilmiş ödemeler satışla birlikte taşınır
    setSecili(payments.filter((p) => gunTR(p.createdAt) === gunTR(createdAt)).map((p) => p.id))
    setSebep(''); setPlan(null); setHata(null); setAcik(true)
  }
  useEffect(() => { setAcik(false) }, [saleId])

  const govde = { tarih, saat, odemeIdler: secili }
  const anahtar = JSON.stringify(govde)

  async function onizle() {
    setYukleniyor(true); setHata(null)
    try {
      const r = await adminApi.post(`/sales/${saleId}/mudahale/tarih/onizle`, govde)
      setPlan(r.data); setPlanAnahtar(anahtar)
    } catch (e) { setHata(hataMesaji(e, 'Önizleme alınamadı.')); setPlan(null) } finally { setYukleniyor(false) }
  }
  async function uygula() {
    if (sebep.trim().length < 5) { setHata('Düzeltme sebebini en az 5 karakter yazın.'); return }
    setYukleniyor(true); setHata(null)
    try {
      const r = await adminApi.post(`/sales/${saleId}/mudahale/tarih/uygula`, { ...govde, sebep: sebep.trim() })
      setAcik(false)
      onDegisti(`Satış tarihi düzeltildi.${r.data?.odoo?.length ? ' Odoo: ' + r.data.odoo.join(', ') + '.' : ''}`)
    } catch (e) { setHata(hataMesaji(e, 'Tarih düzeltilemedi.')) } finally { setYukleniyor(false) }
  }
  const onayHazir = !!plan && plan.engeller.length === 0 && planAnahtar === anahtar

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.baslik}>Satış Tarihi</div>
      <div style={S.kutu}>
        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{trYaz(createdAt)}</div>
        {!acik ? (
          <button type="button" style={{ ...S.btn, marginTop: 6 }} onClick={ac}>Tarihi düzelt</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div><div style={S.etiket}>Yeni tarih</div><input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={S.input} /></div>
              <div><div style={S.etiket}>Saat</div><input type="time" value={saat} onChange={(e) => setSaat(e.target.value)} style={S.input} /></div>
            </div>
            {payments.length > 0 && (
              <div>
                <div style={S.etiket}>Satışla birlikte taşınacak ödemeler</div>
                {payments.map((p) => (
                  <label key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, marginTop: 3 }}>
                    <input type="checkbox" checked={secili.includes(p.id)} onChange={(e) => setSecili((prev) => e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id))} />
                    {TUR_AD[p.paymentType] ?? p.paymentType} {tl(p.grossAmount)} — {trYaz(p.createdAt)}
                  </label>
                ))}
              </div>
            )}
            <input value={sebep} onChange={(e) => setSebep(e.target.value)} placeholder="Düzeltme sebebi" style={S.input} />
            {hata && <div style={{ color: '#991b1b', fontSize: 11.5, fontWeight: 600 }}>{hata}</div>}
            {plan && <PlanGoster plan={plan} />}
            {plan && planAnahtar !== anahtar && <div style={{ fontSize: 11, color: '#92400e' }}>Form değişti — yeniden önizleyin.</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => setAcik(false)} style={{ ...S.btn, flex: 1 }}>Vazgeç</button>
              <button type="button" disabled={yukleniyor} onClick={() => void onizle()} style={{ ...S.btn, flex: 1 }}>{yukleniyor ? '...' : 'Önizle'}</button>
              <button type="button" disabled={!onayHazir || yukleniyor} onClick={() => void uygula()} style={{ ...S.btnAna, opacity: onayHazir ? 1 : 0.4, cursor: onayHazir ? 'pointer' : 'not-allowed' }}>Onayla ve uygula</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ───────────────────────── Temsilci ─────────────────────────

type Personel = { id: string; name: string; branchCode: string | null }

export function TemsilciBolumu({ saleId, userId, onDegisti }: { saleId: string; userId: string; onDegisti: (m: string) => void }) {
  const [liste, setListe] = useState<Personel[]>([])
  const [secim, setSecim] = useState(userId)
  const [not, setNot] = useState('')
  const [kaydediliyor, setKaydediliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  useEffect(() => {
    adminApi.get('/sales/tum-personel').then((r) => setListe(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => setListe([]))
  }, [])
  useEffect(() => { setSecim(userId); setNot(''); setHata(null) }, [saleId, userId])
  const mevcut = liste.find((p) => p.id === userId)

  async function kaydet() {
    setKaydediliyor(true); setHata(null)
    try {
      await adminApi.post(`/sales/${saleId}/temsilci-degistir`, { yeniUserId: secim, ...(not.trim() ? { not: not.trim() } : {}) })
      onDegisti('Satış temsilcisi değiştirildi.')
    } catch (e) { setHata(hataMesaji(e, 'Temsilci değiştirilemedi.')) } finally { setKaydediliyor(false) }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.baslik}>Satış Temsilcisi</div>
      <div style={{ ...S.kutu, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12 }}>Şu an: <b>{mevcut?.name ?? '—'}</b></div>
        <select value={secim} onChange={(e) => setSecim(e.target.value)} style={S.input}>
          {!liste.some((p) => p.id === userId) && <option value={userId}>(mevcut temsilci)</option>}
          {liste.map((p) => <option key={p.id} value={p.id}>{p.name}{p.branchCode ? ` — ${p.branchCode}` : ''}</option>)}
        </select>
        {secim !== userId && (
          <>
            <input value={not} onChange={(e) => setNot(e.target.value)} placeholder="Not (isteğe bağlı)" style={S.input} />
            {hata && <div style={{ color: '#991b1b', fontSize: 11.5, fontWeight: 600 }}>{hata}</div>}
            <button type="button" disabled={kaydediliyor} onClick={() => void kaydet()} style={S.btnAna}>{kaydediliyor ? '...' : 'Temsilciyi değiştir'}</button>
          </>
        )}
      </div>
    </div>
  )
}

// ───────────────────────── Geçmiş ─────────────────────────

type GecmisKayit = { id: string; tarih: string; islem: string; kullanici: string; sebep: string | null; ozet: string[] | null }

export function GecmisBolumu({ saleId, yenile }: { saleId: string; yenile: number }) {
  const [liste, setListe] = useState<GecmisKayit[]>([])
  const [acik, setAcik] = useState<string | null>(null)
  useEffect(() => {
    adminApi.get(`/sales/${saleId}/mudahale/gecmis`).then((r) => setListe(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => setListe([]))
  }, [saleId, yenile])
  return (
    <div style={{ marginTop: 16 }}>
      <div style={S.baslik}>Düzeltme Geçmişi</div>
      {liste.length === 0 ? (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Bu satışta düzeltme kaydı yok.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {liste.map((k) => (
            <div key={k.id} style={{ ...S.kutu, padding: 8, fontSize: 11.5, cursor: k.ozet ? 'pointer' : 'default' }} onClick={() => setAcik(acik === k.id ? null : k.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>{k.islem}</b><span style={{ color: '#6b7280' }}>{trYaz(k.tarih)}</span>
              </div>
              <div style={{ color: '#6b7280' }}>{k.kullanici}{k.sebep ? ` — ${k.sebep}` : ''}</div>
              {acik === k.id && k.ozet && <div style={{ marginTop: 4 }}>{k.ozet.map((s, i) => <div key={i}>• {s}</div>)}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Lot / UTS (Faz 2a) ─────────────────────────

type LotSatir = { mlId: number; lotAdi: string; utsKodu: string | null; qty: number; pickingAdi: string; locationAdi: string }
type LotAday = { id: number; name: string; utsKodu: string | null; stoklar: Array<{ locationAdi: string; qty: number }> }

export function LotDuzelt({ saleId, itemId, onDegisti }: { saleId: string; itemId: string; onDegisti: (m: string) => void }) {
  const [acik, setAcik] = useState(false)
  const [satirlar, setSatirlar] = useState<LotSatir[]>([])
  const [adaylar, setAdaylar] = useState<LotAday[]>([])
  const [not, setNot] = useState<string | null>(null)
  const [kod, setKod] = useState('')
  const [mlId, setMlId] = useState<number | null>(null)
  const [lotId, setLotId] = useState<number | null>(null)
  const [sebep, setSebep] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planAnahtar, setPlanAnahtar] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function ara(q: string) {
    setYukleniyor(true); setHata(null)
    try {
      const r = await adminApi.get(`/sales/${saleId}/mudahale/kalem/${itemId}/lot-ara`, { params: { q } })
      setSatirlar(r.data.satirlar ?? []); setAdaylar(r.data.adaylar ?? []); setNot(r.data.not ?? null)
      if ((r.data.satirlar ?? []).length === 1) setMlId(r.data.satirlar[0].mlId)
      if ((r.data.adaylar ?? []).length === 1) setLotId(r.data.adaylar[0].id)
    } catch (e) { setHata(hataMesaji(e, 'Lotlar getirilemedi.')) } finally { setYukleniyor(false) }
  }
  function ac() {
    setAcik(true); setKod(''); setMlId(null); setLotId(null); setSebep(''); setPlan(null); setAdaylar([])
    void ara('')
  }
  const govde = { itemId, mlId, lotId }
  const anahtar = JSON.stringify(govde)
  async function onizle() {
    if (!mlId || !lotId) { setHata('Değişecek satırı ve doğru lotu seçin.'); return }
    setYukleniyor(true); setHata(null)
    try {
      const r = await adminApi.post(`/sales/${saleId}/mudahale/lot/onizle`, govde)
      setPlan(r.data); setPlanAnahtar(anahtar)
    } catch (e) { setHata(hataMesaji(e, 'Önizleme alınamadı.')); setPlan(null) } finally { setYukleniyor(false) }
  }
  async function uygula() {
    if (sebep.trim().length < 5) { setHata('Düzeltme sebebini en az 5 karakter yazın.'); return }
    setYukleniyor(true); setHata(null)
    try {
      await adminApi.post(`/sales/${saleId}/mudahale/lot/uygula`, { ...govde, sebep: sebep.trim() })
      setAcik(false)
      onDegisti('Lot düzeltildi — Odoo teslimatı ve şube stoğu güncellendi.')
    } catch (e) { setHata(hataMesaji(e, 'Lot düzeltilemedi.')) } finally { setYukleniyor(false) }
  }
  const onayHazir = !!plan && plan.engeller.length === 0 && planAnahtar === anahtar

  if (!acik) return <button type="button" style={S.btn} onClick={ac}>Lot / UTS düzelt</button>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, width: '100%', border: '1px dashed #d1d5db', borderRadius: 8, padding: 8 }}>
      <div>
        <div style={S.etiket}>Satılan (Odoo teslimatındaki) lot</div>
        {satirlar.length === 0 && !yukleniyor && <div style={{ fontSize: 11.5, color: '#9ca3af' }}>—</div>}
        {satirlar.map((s) => (
          <label key={s.mlId} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, marginTop: 3 }}>
            <input type="radio" checked={mlId === s.mlId} onChange={() => setMlId(s.mlId)} />
            {s.lotAdi}{s.utsKodu ? ` · UTS ${s.utsKodu}` : ''} · {s.qty} adet · {s.locationAdi}
          </label>
        ))}
      </div>
      <div>
        <div style={S.etiket}>Doğru lot — karekodu okutun ya da lot/UTS yazın</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={kod} onChange={(e) => setKod(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void ara(kod) }} style={S.input} autoFocus />
          <button type="button" style={S.btn} disabled={yukleniyor} onClick={() => void ara(kod)}>Ara</button>
        </div>
        {adaylar.map((a) => (
          <label key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11.5, marginTop: 4 }}>
            <input type="radio" checked={lotId === a.id} onChange={() => setLotId(a.id)} />
            <span>
              <b>{a.name}</b>{a.utsKodu ? ` · UTS ${a.utsKodu}` : ''}
              <span style={{ color: '#6b7280' }}> — {a.stoklar.length ? a.stoklar.map((s) => `${s.locationAdi}: ${s.qty}`).join(', ') : 'stokta yok'}</span>
            </span>
          </label>
        ))}
        {not && <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>{not}</div>}
      </div>
      <input value={sebep} onChange={(e) => setSebep(e.target.value)} placeholder="Düzeltme sebebi (ör. satışta yanlış kutu okutulmuş)" style={S.input} />
      {hata && <div style={{ color: '#991b1b', fontSize: 11.5, fontWeight: 600 }}>{hata}</div>}
      {plan && <PlanGoster plan={plan} />}
      {plan && planAnahtar !== anahtar && <div style={{ fontSize: 11, color: '#92400e' }}>Seçim değişti — yeniden önizleyin.</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => setAcik(false)} style={{ ...S.btn, flex: 1 }}>Vazgeç</button>
        <button type="button" disabled={yukleniyor} onClick={() => void onizle()} style={{ ...S.btn, flex: 1 }}>{yukleniyor ? '...' : 'Önizle'}</button>
        <button type="button" disabled={!onayHazir || yukleniyor} onClick={() => void uygula()} style={{ ...S.btnAna, opacity: onayHazir ? 1 : 0.4, cursor: onayHazir ? 'pointer' : 'not-allowed' }}>Onayla ve uygula</button>
      </div>
    </div>
  )
}

// ───────────────────────── Fiyat / İndirim / KDV (Faz 2b-1) ─────────────────────────

export type FiyatKalem = { id: string; name: string; qty: number; unitPrice: string | number; discount: string | number; taxRate: string | number | null; lineTotal: string | number }
type FiyatSatir = { unitPrice: string; discount: string; taxRate: string }
const sayi = (v: string) => Number(String(v).replace(',', '.'))

export function FiyatBolumu({ saleId, items, payments, branchId, eFaturaGitti, onDegisti }: {
  saleId: string; items: FiyatKalem[]; payments: MudahalePayment[]; branchId: string | null; eFaturaGitti: boolean; onDegisti: (m: string) => void
}) {
  const [acik, setAcik] = useState(false)
  const [bankalar, setBankalar] = useState<Bank[]>([])
  const [degerler, setDegerler] = useState<Record<string, FiyatSatir>>({})
  const [farkOdeme, setFarkOdeme] = useState<Satir>({ tur: 'CASH', tutar: '0', tarih: gunTR(new Date().toISOString()), bankId: '', posDeviceId: '', taksit: '1' })
  const [azaltId, setAzaltId] = useState('')
  const [sebep, setSebep] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [planAnahtar, setPlanAnahtar] = useState('')
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  useEffect(() => { setAcik(false) }, [saleId])

  function ac() {
    const d: Record<string, FiyatSatir> = {}
    for (const it of items) d[it.id] = { unitPrice: String(Number(it.unitPrice)), discount: String(Number(it.discount)), taxRate: String(Number(it.taxRate ?? 0)) }
    setDegerler(d); setAzaltId(''); setSebep(''); setPlan(null); setHata(null); setAcik(true)
    if (!bankalar.length) adminApi.get('/sales/payment-banks', { params: { tumu: 1 } }).then((r) => setBankalar(Array.isArray(r.data?.data) ? r.data.data : [])).catch(() => {})
  }

  const kalemler = items
    .map((it) => ({ it, v: degerler[it.id] }))
    .filter(({ it, v }) => v && (sayi(v.unitPrice) !== Number(it.unitPrice) || Math.abs(sayi(v.discount) - Number(it.discount)) >= 0.005 || sayi(v.taxRate) !== Number(it.taxRate ?? 0)))
    .map(({ it, v }) => ({ itemId: it.id, unitPrice: sayi(v.unitPrice), discount: sayi(v.discount), taxRate: sayi(v.taxRate) }))
  const fark = Math.round(kalemler.reduce((s, k) => {
    const it = items.find((x) => x.id === k.itemId)!
    return s + (k.unitPrice * it.qty - k.discount) - Number(it.lineTotal)
  }, 0) * 100) / 100
  const govde = {
    kalemler,
    farkEkle: fark > 0.005 ? {
      tur: farkOdeme.tur, tutar: fark, tarih: farkOdeme.tarih,
      bankId: farkOdeme.tur === 'CARD' || farkOdeme.tur === 'TRANSFER' ? farkOdeme.bankId || null : null,
      posDeviceId: farkOdeme.tur === 'CARD' ? farkOdeme.posDeviceId || null : null,
      taksit: farkOdeme.tur === 'CARD' ? Number(farkOdeme.taksit) || 1 : null,
    } : null,
    farkAzaltPaymentId: fark < -0.005 ? azaltId || null : null,
  }
  const anahtar = JSON.stringify(govde)

  async function onizle() {
    if (!kalemler.length) { setHata('Hiçbir kalemde değişiklik yok.'); return }
    setYukleniyor(true); setHata(null)
    try {
      const r = await adminApi.post(`/sales/${saleId}/mudahale/fiyat/onizle`, govde)
      setPlan(r.data); setPlanAnahtar(anahtar)
    } catch (e) { setHata(hataMesaji(e, 'Önizleme alınamadı.')); setPlan(null) } finally { setYukleniyor(false) }
  }
  async function uygula() {
    if (sebep.trim().length < 5) { setHata('Düzeltme sebebini en az 5 karakter yazın.'); return }
    setYukleniyor(true); setHata(null)
    try {
      const r = await adminApi.post(`/sales/${saleId}/mudahale/fiyat/uygula`, { ...govde, sebep: sebep.trim() })
      setAcik(false)
      onDegisti(`Fiyat/indirim/KDV düzeltildi.${r.data?.odoo?.length ? ' Odoo: ' + r.data.odoo.join(', ') + '.' : ''}`)
    } catch (e) { setHata(hataMesaji(e, 'Düzeltilemedi.')) } finally { setYukleniyor(false) }
  }
  const onayHazir = !!plan && plan.engeller.length === 0 && planAnahtar === anahtar
  const b = bankalar.find((x) => x.id === farkOdeme.bankId)

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.baslik}>Fiyat / İndirim / KDV (Odoo faturası dahil)</div>
      <div style={S.kutu}>
        {eFaturaGitti ? (
          <div style={{ fontSize: 11.5, color: '#92400e' }}>E-fatura gönderilmiş — resmi belge değişmez. Sadece POS kaydı için kalemdeki "KDV Düzelt / Brüt Tutar Düzelt"; resmi düzeltme için iptal + yeniden giriş (Faz 3).</div>
        ) : !acik ? (
          <button type="button" style={S.btn} onClick={ac}>Fiyat / indirim / KDV düzelt</button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((it) => {
              const v = degerler[it.id]
              if (!v) return null
              const set = (alan: keyof FiyatSatir, deger: string) => setDegerler((p) => ({ ...p, [it.id]: { ...p[it.id], [alan]: deger } }))
              return (
                <div key={it.id} style={{ border: '1px dashed #d1d5db', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{it.name} <span style={{ color: '#6b7280', fontWeight: 400 }}>· {it.qty} adet · şimdi {tl(it.lineTotal)}</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px', gap: 6 }}>
                    <div><div style={S.etiket}>Birim fiyat (KDV dahil)</div><input value={v.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} style={S.input} /></div>
                    <div><div style={S.etiket}>İndirim (₺)</div><input value={v.discount} onChange={(e) => set('discount', e.target.value)} style={S.input} /></div>
                    <div><div style={S.etiket}>KDV %</div>
                      <select value={v.taxRate} onChange={(e) => set('taxRate', e.target.value)} style={S.input}>
                        {['0', '1', '10', '20'].concat(['0', '1', '10', '20'].includes(v.taxRate) ? [] : [v.taxRate]).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )
            })}
            <div style={{ fontSize: 12, fontWeight: 700, color: fark ? '#92400e' : '#166534' }}>
              {fark > 0.005 ? `Toplam ${tl(fark)} artıyor — fark nasıl ödendi?` : fark < -0.005 ? `Toplam ${tl(-fark)} azalıyor — hangi ödemeden düşülsün?` : 'Toplam değişmiyor.'}
            </div>
            {fark > 0.005 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div><div style={S.etiket}>Tür</div>
                  <select value={farkOdeme.tur} onChange={(e) => setFarkOdeme((p) => ({ ...p, tur: e.target.value }))} style={S.input}>
                    {DUZELTILEBILIR.map((t) => <option key={t} value={t}>{TUR_AD[t]}</option>)}
                  </select>
                </div>
                <div><div style={S.etiket}>Tarih</div><input type="date" value={farkOdeme.tarih} onChange={(e) => setFarkOdeme((p) => ({ ...p, tarih: e.target.value }))} style={S.input} /></div>
                {(farkOdeme.tur === 'CARD' || farkOdeme.tur === 'TRANSFER') && (
                  <div><div style={S.etiket}>Banka</div>
                    <select value={farkOdeme.bankId} onChange={(e) => {
                      const bk = bankalar.find((x) => x.id === e.target.value)
                      const cihazlar = (bk?.posDevices ?? []).filter((d) => d.isActive)
                      setFarkOdeme((p) => ({ ...p, bankId: e.target.value, posDeviceId: (cihazlar.find((d) => d.branchId === branchId) ?? cihazlar[0])?.id ?? '' }))
                    }} style={S.input}>
                      <option value="">Seçin</option>
                      {bankalar.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </div>
                )}
                {farkOdeme.tur === 'CARD' && (
                  <>
                    <div><div style={S.etiket}>POS cihazı</div>
                      <select value={farkOdeme.posDeviceId} onChange={(e) => setFarkOdeme((p) => ({ ...p, posDeviceId: e.target.value }))} style={S.input}>
                        <option value="">Seçin</option>
                        {(b?.posDevices ?? []).filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                    <div><div style={S.etiket}>Taksit</div><input type="number" min={1} max={36} value={farkOdeme.taksit} onChange={(e) => setFarkOdeme((p) => ({ ...p, taksit: e.target.value }))} style={S.input} /></div>
                  </>
                )}
              </div>
            )}
            {fark < -0.005 && (
              <select value={azaltId} onChange={(e) => setAzaltId(e.target.value)} style={S.input}>
                <option value="">Ödeme seçin</option>
                {payments.filter((p) => DUZELTILEBILIR.includes(p.paymentType) && Number(p.grossAmount) + fark >= -0.005).map((p) => (
                  <option key={p.id} value={p.id}>{TUR_AD[p.paymentType]} {tl(p.grossAmount)} — {trYaz(p.createdAt)}</option>
                ))}
              </select>
            )}
            <input value={sebep} onChange={(e) => setSebep(e.target.value)} placeholder="Düzeltme sebebi" style={S.input} />
            {hata && <div style={{ color: '#991b1b', fontSize: 11.5, fontWeight: 600 }}>{hata}</div>}
            {plan && <PlanGoster plan={plan} />}
            {plan && planAnahtar !== anahtar && <div style={{ fontSize: 11, color: '#92400e' }}>Form değişti — yeniden önizleyin.</div>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => setAcik(false)} style={{ ...S.btn, flex: 1 }}>Vazgeç</button>
              <button type="button" disabled={yukleniyor} onClick={() => void onizle()} style={{ ...S.btn, flex: 1 }}>{yukleniyor ? '...' : 'Önizle'}</button>
              <button type="button" disabled={!onayHazir || yukleniyor} onClick={() => void uygula()} style={{ ...S.btnAna, opacity: onayHazir ? 1 : 0.4, cursor: onayHazir ? 'pointer' : 'not-allowed' }}>Onayla ve uygula</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
