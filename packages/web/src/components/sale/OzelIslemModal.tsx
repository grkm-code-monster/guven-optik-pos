/**
 * 18.11.2026 — Cam satırındaki "🎨 Özel İşlem" penceresi.
 * Odoo BAKIM / ÖZEL İŞLEM kategorisindeki hizmet ürünlerinden biri seçilir; taraf,
 * (renklendirmede) renk / yoğunluk / tip, detay ve firmaya not girilir. Kayıt,
 * cama bağlı (linkedItemId, linkType'sız) normal bir satış kalemi olarak eklenir.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { apiClient } from '../../api/client'
import { addItem, getSaleById, updateItem } from '../../api/sales.api'
import type { Sale, SaleItem } from '../../api/types'
import {
  bosOzelIslemDetay,
  isRenklendirme,
  nitelikCoz,
  nitelikOlustur,
  type OzelIslemDetay,
  type OzelIslemTaraf,
} from '../../utils/ozelIslem'

type OzelIslemUrun = { variantId: number; name: string; price: number }

const RENKLER = ['Kahve', 'Gri', 'Yeşil', 'Mavi', 'Pembe', 'Sarı', 'Mor']
const YOGUNLUKLAR = ['10', '25', '50', '75', '85']
const TIPLER = ['Düz', 'Degrade', 'Çift degrade']
const TARAFLAR: OzelIslemTaraf[] = ['Sağ', 'Sol', 'Sağ+Sol']

function sayi(v: string): number {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export default function OzelIslemModal(props: {
  saleId: string
  cam: SaleItem
  camAdi: string
  duzenlenen?: SaleItem | null
  onClose: () => void
  onSaved: (sale: Sale) => void
}) {
  const { saleId, cam, camAdi, duzenlenen, onClose, onSaved } = props
  const [urunler, setUrunler] = useState<OzelIslemUrun[]>([])
  const [kategoriId, setKategoriId] = useState<number | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secili, setSecili] = useState<OzelIslemUrun | null>(null)
  const [detay, setDetay] = useState<OzelIslemDetay>(() =>
    duzenlenen ? nitelikCoz(duzenlenen.maintenanceNature) : bosOzelIslemDetay(),
  )
  const [firmaNotu, setFirmaNotu] = useState(duzenlenen?.maintenanceDescription ?? '')
  const [fiyat, setFiyat] = useState(duzenlenen ? String(duzenlenen.unitPrice ?? '') : '')
  const [indirim, setIndirim] = useState(duzenlenen ? String(duzenlenen.discount ?? '0') : '0')
  const [hata, setHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)

  useEffect(() => {
    let iptal = false
    apiClient
      .get('/sales/ozel-islem-urunleri')
      .then((res) => {
        if (iptal) return
        const liste = (res.data?.urunler ?? []) as OzelIslemUrun[]
        setUrunler(liste)
        setKategoriId(res.data?.kategoriId ?? null)
        if (duzenlenen?.odooProductId) {
          const bulunan = liste.find((u) => String(u.variantId) === String(duzenlenen.odooProductId))
          setSecili(
            bulunan ?? {
              variantId: Number(duzenlenen.odooProductId),
              name: duzenlenen.odooProductName ?? 'Özel İşlem',
              price: Number(duzenlenen.unitPrice ?? 0),
            },
          )
        }
      })
      .catch(() => {
        if (!iptal) setHata('Özel işlem listesi alınamadı. İnterneti kontrol edip tekrar deneyin.')
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false)
      })
    return () => {
      iptal = true
    }
  }, [duzenlenen])

  const renkMi = useMemo(() => isRenklendirme(secili?.name), [secili])

  function sec(u: OzelIslemUrun) {
    setSecili(u)
    if (!duzenlenen || String(duzenlenen.odooProductId) !== String(u.variantId)) setFiyat(String(u.price ?? 0))
  }

  function patch(p: Partial<OzelIslemDetay>) {
    setDetay((d) => ({ ...d, ...p }))
  }

  async function kaydet() {
    setHata(null)
    if (!secili) {
      setHata('Önce bir işlem seçin.')
      return
    }
    const f = sayi(fiyat)
    const ind = sayi(indirim || '0')
    if (!Number.isFinite(f) || f < 0) {
      setHata('Fiyat geçersiz.')
      return
    }
    if (!Number.isFinite(ind) || ind < 0 || ind > f) {
      setHata('İndirim geçersiz.')
      return
    }
    const kayitDetay: OzelIslemDetay = renkMi ? detay : { ...detay, renk: '', yogunluk: '', tip: '' }
    const payload = {
      productId: `odoo_${secili.variantId}`,
      odooProductId: String(secili.variantId),
      odooProductName: secili.name,
      ...(kategoriId != null ? { odooCategoryId: kategoriId } : {}),
      qty: 1,
      unitPrice: f.toFixed(2),
      discount: ind.toFixed(2),
      linkedItemId: cam.id,
      maintenanceNature: nitelikOlustur(kayitDetay) || null,
      maintenanceDescription: firmaNotu.trim() || null,
    }
    setKaydediliyor(true)
    try {
      if (duzenlenen) await updateItem(saleId, duzenlenen.id, payload)
      else await addItem(saleId, payload)
      onSaved(await getSaleById(saleId))
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string; error?: string } } }
      setHata(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Özel işlem kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={kutu} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>🎨 Özel İşlem {duzenlenen ? '— Düzenle' : ''}</div>
          <button type="button" onClick={onClose} style={kapatBtn} aria-label="Kapat">
            ✕
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>Cam: {camAdi}</div>

        <Baslik>İşlem</Baslik>
        {yukleniyor ? (
          <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor…</div>
        ) : urunler.length === 0 && !secili ? (
          <div style={{ fontSize: 13, color: '#b91c1c' }}>
            Özel işlem listesi boş. (Odoo'da "BAKIM / ÖZEL İŞLEM" kategorisi henüz kurulmamış olabilir.)
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(urunler.some((u) => u.variantId === secili?.variantId) || !secili ? urunler : [secili, ...urunler]).map((u) => (
              <button key={u.variantId} type="button" onClick={() => sec(u)} style={chip(secili?.variantId === u.variantId)}>
                {u.name}
              </button>
            ))}
          </div>
        )}

        <Baslik>Hangi cam</Baslik>
        <div style={{ display: 'flex', gap: 8 }}>
          {TARAFLAR.map((t) => (
            <button key={t} type="button" onClick={() => patch({ taraf: t })} style={chip(detay.taraf === t)}>
              {t === 'Sağ+Sol' ? 'İkisi (Sağ+Sol)' : t}
            </button>
          ))}
        </div>

        {renkMi ? (
          <>
            <Baslik>Renk</Baslik>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {RENKLER.map((r) => (
                <button key={r} type="button" onClick={() => patch({ renk: r })} style={chip(detay.renk === r)}>
                  {r}
                </button>
              ))}
            </div>
            <input value={detay.renk} onChange={(e) => patch({ renk: e.target.value })} placeholder="Renk (örn. Kahve, G15…)" style={input} />

            <Baslik>Yoğunluk %</Baslik>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {YOGUNLUKLAR.map((y) => (
                <button key={y} type="button" onClick={() => patch({ yogunluk: y })} style={chip(detay.yogunluk === y)}>
                  %{y}
                </button>
              ))}
              <input
                value={detay.yogunluk}
                onChange={(e) => patch({ yogunluk: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
                placeholder="%"
                inputMode="numeric"
                style={{ ...input, width: 70 }}
              />
            </div>

            <Baslik>Tip</Baslik>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TIPLER.map((t) => (
                <button key={t} type="button" onClick={() => patch({ tip: detay.tip === t ? '' : t })} style={chip(detay.tip === t)}>
                  {t}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <Baslik>Detay</Baslik>
        <input
          value={detay.detay}
          onChange={(e) => patch({ detay: e.target.value })}
          placeholder={renkMi ? 'Ek detay (isteğe bağlı)' : 'Örn. Sağ 2 mm içe / Prizma 1 dpt baz aşağı / 65 çap'}
          style={input}
        />

        <Baslik>Firmaya not</Baslik>
        <textarea
          value={firmaNotu}
          onChange={(e) => setFirmaNotu(e.target.value)}
          placeholder="Firmadan istenen işlemle ilgili not (sipariş mesajına da yazılır)"
          rows={3}
          style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
          <label>
            <Baslik>Fiyat (₺)</Baslik>
            <input value={fiyat} onChange={(e) => setFiyat(e.target.value)} inputMode="decimal" style={input} />
          </label>
          <label>
            <Baslik>İndirim (₺)</Baslik>
            <input value={indirim} onChange={(e) => setIndirim(e.target.value)} inputMode="decimal" style={input} />
          </label>
        </div>

        {hata ? <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>{hata}</div> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={ikincilBtn}>
            Vazgeç
          </button>
          <button type="button" onClick={() => void kaydet()} disabled={kaydediliyor || !secili} style={birincilBtn(kaydediliyor || !secili)}>
            {kaydediliyor ? 'Kaydediliyor…' : duzenlenen ? 'Güncelle' : 'Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Baslik({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        margin: '12px 0 6px',
      }}
    >
      {children}
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100,
  padding: 12,
}

const kutu: CSSProperties = {
  background: 'white',
  borderRadius: 14,
  padding: 18,
  width: '100%',
  maxWidth: 520,
  maxHeight: '92vh',
  overflowY: 'auto',
  boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
}

const input: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 14,
}

function chip(aktif: boolean): CSSProperties {
  return {
    padding: '7px 12px',
    borderRadius: 999,
    border: `1px solid ${aktif ? '#7c3aed' : '#d1d5db'}`,
    background: aktif ? '#7c3aed' : 'white',
    color: aktif ? 'white' : '#111',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  }
}

const kapatBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 18,
  cursor: 'pointer',
  color: '#6b7280',
}

const ikincilBtn: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #d1d5db',
  background: 'white',
  fontWeight: 700,
  cursor: 'pointer',
}

function birincilBtn(pasif: boolean): CSSProperties {
  return {
    padding: '10px 18px',
    borderRadius: 10,
    border: 'none',
    background: pasif ? '#c4b5fd' : '#7c3aed',
    color: 'white',
    fontWeight: 800,
    cursor: pasif ? 'not-allowed' : 'pointer',
  }
}
