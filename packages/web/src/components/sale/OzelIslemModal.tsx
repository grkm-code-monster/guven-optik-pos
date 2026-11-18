/**
 * 18.11.2026 — Cam satırındaki "🎨 Özel İşlem" penceresi.
 * Odoo BAKIM / ÖZEL İŞLEM kategorisindeki hizmet ürünlerinden biri seçilir (Renklendirme
 * ve kaplamalar); sağ ve sol cam için (ikisi aynıysa tek seferde) işleme özel alanlar,
 * detay ve firmaya not girilir. Kayıt, cama bağlı (linkedItemId, linkType'sız) normal
 * bir satış kalemi olarak eklenir.
 *
 * Renklendirme: "Standart renk" veya "Terapötik filtre" (ayrı ürün, fiyat farkı) seçilir;
 * isteğe bağlı "Ayna kaplama" (ayrı ürün, kendi fiyatı) aynı anda ikinci kalem olarak eklenir.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { apiClient } from '../../api/client'
import { addItem, getSaleById, updateItem } from '../../api/sales.api'
import type { Sale, SaleItem } from '../../api/types'
import {
  AYNA_RENKLERI,
  DIGER_KAPLAMA_ALANI,
  bosTaraflar,
  isAynaAdi,
  isDigerKaplamaAdi,
  isRenklendirmeAdi,
  isTerapotikAdi,
  nitelikCoz,
  nitelikOlustur,
  ozelIslemAlanlari,
  type OzelIslemAlan,
  type OzelIslemTaraflari,
  type TarafDegerleri,
} from '../../utils/ozelIslem'

type OzelIslemUrun = { variantId: number; name: string; price: number }

function sayi(v: string): number {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export default function OzelIslemModal(props: {
  saleId: string
  cam: SaleItem
  camAdi: string
  duzenlenen?: SaleItem | null
  /** Bu cama zaten bağlı özel işlemler (ayna kaplama tekrar eklenmesin diye) */
  mevcutIslemler?: SaleItem[]
  onClose: () => void
  onSaved: (sale: Sale) => void
}) {
  const { saleId, cam, camAdi, duzenlenen, mevcutIslemler = [], onClose, onSaved } = props
  const [urunler, setUrunler] = useState<OzelIslemUrun[]>([])
  const [kategoriId, setKategoriId] = useState<number | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [secili, setSecili] = useState<OzelIslemUrun | null>(null)
  const [taraflar, setTaraflar] = useState<OzelIslemTaraflari>(() =>
    duzenlenen ? nitelikCoz(duzenlenen.maintenanceNature) : bosTaraflar(),
  )
  const [firmaNotu, setFirmaNotu] = useState(duzenlenen?.maintenanceDescription ?? '')
  const [fiyat, setFiyat] = useState(duzenlenen ? String(duzenlenen.unitPrice ?? '') : '')
  const [indirim, setIndirim] = useState(duzenlenen ? String(duzenlenen.discount ?? '0') : '0')
  const [hata, setHata] = useState<string | null>(null)
  const [kaydediliyor, setKaydediliyor] = useState(false)
  // Renklendirme ile birlikte eklenecek ayna kaplama (ayrı kalem)
  const [aynaEkle, setAynaEkle] = useState(false)
  const [aynaRenk, setAynaRenk] = useState('')
  const [aynaFiyat, setAynaFiyat] = useState('')

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

  const alanlar = useMemo(() => ozelIslemAlanlari(secili?.name), [secili])

  const renkUrun = urunler.find((u) => isRenklendirmeAdi(u.name))
  const terapUrun = urunler.find((u) => isTerapotikAdi(u.name))
  const aynaUrun = urunler.find((u) => isAynaAdi(u.name))
  /** Üstteki düğmeler: Renklendirme önce, sonra kaplamalar; terapötik filtre ve ayna Renklendirme'nin içinde */
  const ustUrunler = useMemo(() => {
    const liste = urunler.filter((u) => !isTerapotikAdi(u.name) && !isAynaAdi(u.name))
    const sira = (u: OzelIslemUrun) => (isRenklendirmeAdi(u.name) ? 0 : isDigerKaplamaAdi(u.name) ? 2 : 1)
    return [...liste].sort((a, b) => sira(a) - sira(b) || a.name.localeCompare(b.name, 'tr'))
  }, [urunler])
  const renkModu = Boolean(secili && (isRenklendirmeAdi(secili.name) || isTerapotikAdi(secili.name)))
  const mevcutAyna = mevcutIslemler.find((x) => isAynaAdi(x.odooProductName) && x.id !== duzenlenen?.id)
  const aynaEklenebilir = renkModu && Boolean(aynaUrun) && !mevcutAyna && !(duzenlenen && isAynaAdi(duzenlenen.odooProductName))

  function ustSeciliMi(u: OzelIslemUrun): boolean {
    if (!secili) return false
    if (isRenklendirmeAdi(u.name)) return renkModu
    return secili.variantId === u.variantId
  }

  function sec(u: OzelIslemUrun) {
    setSecili(u)
    if (!duzenlenen || String(duzenlenen.odooProductId) !== String(u.variantId)) setFiyat(String(u.price ?? 0))
  }

  function aynaAc(ac: boolean) {
    setAynaEkle(ac)
    if (ac && !aynaFiyat && aynaUrun) setAynaFiyat(String(aynaUrun.price ?? 0))
  }

  function patch(p: Partial<OzelIslemTaraflari>) {
    setTaraflar((t) => ({ ...t, ...p }))
  }

  function degerYaz(taraf: 'sag' | 'sol', etiket: string, v: string) {
    setTaraflar((t) =>
      taraf === 'sag' ? { ...t, sagDeger: { ...t.sagDeger, [etiket]: v } } : { ...t, solDeger: { ...t.solDeger, [etiket]: v } },
    )
  }

  /** Sadece bu işlemin alanları + Detay kaydedilir (önce başka işlem seçilip doldurulduysa artıklar atılır) */
  function sadeAlanlar(d: TarafDegerleri): TarafDegerleri {
    const izinli = new Set([...alanlar.map((a) => a.etiket), 'Detay'])
    const out: TarafDegerleri = {}
    for (const [k, v] of Object.entries(d)) if (izinli.has(k) && String(v ?? '').trim()) out[k] = v
    return out
  }

  function tarafAc(taraf: 'sag' | 'sol') {
    setTaraflar((t) => {
      const yeni = { ...t, [taraf]: !t[taraf] }
      if (!yeni.sag && !yeni.sol) return t // en az bir cam seçili kalsın
      // tek cam kaldıysa onun değerleri ekranda kalsın
      if (!yeni.sag && yeni.sol && t.ayni) yeni.solDeger = { ...t.sagDeger }
      if (yeni.sag && !yeni.sol && !t.sag) yeni.sagDeger = { ...t.solDeger }
      return yeni
    })
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
    if (isDigerKaplamaAdi(secili.name)) {
      const ayniTek = taraflar.sag && taraflar.sol && taraflar.ayni
      const eksik =
        (taraflar.sag && !String(taraflar.sagDeger[DIGER_KAPLAMA_ALANI] ?? '').trim()) ||
        (taraflar.sol && !ayniTek && !String(taraflar.solDeger[DIGER_KAPLAMA_ALANI] ?? '').trim())
      if (eksik) {
        setHata('Diğer kaplamada kaplamanın adını yazın (örn. Zeiss DuraVision Platinum).')
        return
      }
    }
    const aynaF = sayi(aynaFiyat || '0')
    if (aynaEkle && aynaEklenebilir) {
      if (!aynaRenk) {
        setHata('Ayna kaplama rengini seçin ya da ayna kaplamayı kaldırın.')
        return
      }
      if (!Number.isFinite(aynaF) || aynaF < 0) {
        setHata('Ayna kaplama fiyatı geçersiz.')
        return
      }
    }
    const kayit: OzelIslemTaraflari = {
      ...taraflar,
      sagDeger: sadeAlanlar(taraflar.sagDeger),
      solDeger: sadeAlanlar(taraflar.sol && taraflar.sag && taraflar.ayni ? taraflar.sagDeger : taraflar.solDeger),
    }
    const payload = {
      productId: `odoo_${secili.variantId}`,
      odooProductId: String(secili.variantId),
      odooProductName: secili.name,
      ...(kategoriId != null ? { odooCategoryId: kategoriId } : {}),
      qty: 1,
      unitPrice: f.toFixed(2),
      discount: ind.toFixed(2),
      linkedItemId: cam.id,
      maintenanceNature: nitelikOlustur(kayit) || null,
      maintenanceDescription: firmaNotu.trim() || null,
    }
    setKaydediliyor(true)
    try {
      if (duzenlenen) await updateItem(saleId, duzenlenen.id, payload)
      else await addItem(saleId, payload)
      if (aynaEkle && aynaEklenebilir && aynaUrun) {
        try {
          await addItem(saleId, {
            productId: `odoo_${aynaUrun.variantId}`,
            odooProductId: String(aynaUrun.variantId),
            odooProductName: aynaUrun.name,
            ...(kategoriId != null ? { odooCategoryId: kategoriId } : {}),
            qty: 1,
            unitPrice: aynaF.toFixed(2),
            discount: '0.00',
            linkedItemId: cam.id,
            maintenanceNature: nitelikOlustur({
              sag: taraflar.sag,
              sol: taraflar.sol,
              ayni: true,
              sagDeger: { Ayna: aynaRenk },
              solDeger: { Ayna: aynaRenk },
            }),
            maintenanceDescription: null,
          })
        } catch {
          // Renklendirme kaydedildi; tekrar denemede ikinci kez eklenmesin diye pencere kapanır
          window.alert(
            "Renklendirme kaydedildi ama ayna kaplama eklenemedi. Renklendirme satırının Düzenle'sinden ayna kaplamayı tekrar ekleyin.",
          )
        }
      }
      onSaved(await getSaleById(saleId))
      onClose()
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { message?: string; error?: string } }
      }
      setHata(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Özel işlem kaydedilemedi.')
    } finally {
      setKaydediliyor(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={kutu} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
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
            {(!secili || renkModu || ustUrunler.some((u) => u.variantId === secili.variantId)
              ? ustUrunler
              : [secili, ...ustUrunler]
            ).map((u) => (
              <button
                key={u.variantId}
                type="button"
                onClick={() => (isRenklendirmeAdi(u.name) && renkModu ? undefined : sec(u))}
                style={chip(ustSeciliMi(u))}
              >
                {u.name}
              </button>
            ))}
          </div>
        )}

        {renkModu ? (
          <>
            <Baslik>Renk türü</Baslik>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={() => renkUrun && sec(renkUrun)}
                disabled={!renkUrun}
                style={chip(Boolean(secili && isRenklendirmeAdi(secili.name)))}
              >
                Standart renk
              </button>
              <button
                type="button"
                onClick={() => terapUrun && sec(terapUrun)}
                disabled={!terapUrun}
                style={chip(Boolean(secili && isTerapotikAdi(secili.name)))}
              >
                Terapötik filtre
              </button>
            </div>
          </>
        ) : null}

        <Baslik>Hangi cam</Baslik>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button type="button" onClick={() => tarafAc('sag')} style={chip(taraflar.sag)}>
            {taraflar.sag ? '✓ ' : ''}Sağ
          </button>
          <button type="button" onClick={() => tarafAc('sol')} style={chip(taraflar.sol)}>
            {taraflar.sol ? '✓ ' : ''}Sol
          </button>
          {taraflar.sag && taraflar.sol ? (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 700,
                marginLeft: 6,
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={taraflar.ayni} onChange={(e) => patch({ ayni: e.target.checked })} />
              Sol, Sağ ile aynı
            </label>
          ) : null}
        </div>

        {taraflar.sag ? (
          <TarafKutusu
            baslik={taraflar.sol && taraflar.ayni ? 'SAĞ + SOL' : 'SAĞ'}
            alanlar={alanlar}
            deger={taraflar.sagDeger}
            onDeger={(k, v) => degerYaz('sag', k, v)}
          />
        ) : null}
        {taraflar.sol && !(taraflar.sag && taraflar.ayni) ? (
          <TarafKutusu baslik="SOL" alanlar={alanlar} deger={taraflar.solDeger} onDeger={(k, v) => degerYaz('sol', k, v)} />
        ) : null}

        {renkModu && mevcutAyna ? (
          <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
            🪞 Bu camda ayna kaplama zaten var ({mevcutAyna.maintenanceNature ?? ''}). Değiştirmek için o satırın Düzenle'sini
            kullanın.
          </div>
        ) : null}
        {aynaEklenebilir ? (
          <div
            style={{
              marginTop: 12,
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: '10px 12px',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <input type="checkbox" checked={aynaEkle} onChange={(e) => aynaAc(e.target.checked)} />
              🪞 Ayna (mirror) kaplama da ekle
            </label>
            {aynaEkle ? (
              <>
                <Baslik>Ayna rengi</Baslik>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {AYNA_RENKLERI.map((r) => (
                    <button key={r} type="button" onClick={() => setAynaRenk(r)} style={chip(aynaRenk === r)}>
                      {r}
                    </button>
                  ))}
                </div>
                <Baslik>Ayna kaplama fiyatı (₺)</Baslik>
                <input
                  value={aynaFiyat}
                  onChange={(e) => setAynaFiyat(e.target.value)}
                  inputMode="decimal"
                  style={{ ...input, width: 160 }}
                />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  Ayrı satır olarak eklenir; seçili cam(lar)a (
                  {taraflar.sag && taraflar.sol ? 'Sağ+Sol' : taraflar.sag ? 'Sağ' : 'Sol'}) uygulanır.
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <Baslik>Firmaya not</Baslik>
        <textarea
          value={firmaNotu}
          onChange={(e) => setFirmaNotu(e.target.value)}
          placeholder="Firmadan istenen işlemle ilgili not (sipariş mesajına da yazılır)"
          rows={3}
          style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 4,
          }}
        >
          <label>
            <Baslik>{renkModu ? 'Renklendirme fiyatı (₺)' : 'Fiyat (₺)'}</Baslik>
            <input value={fiyat} onChange={(e) => setFiyat(e.target.value)} inputMode="decimal" style={input} />
          </label>
          <label>
            <Baslik>İndirim (₺)</Baslik>
            <input value={indirim} onChange={(e) => setIndirim(e.target.value)} inputMode="decimal" style={input} />
          </label>
        </div>

        {hata ? (
          <div
            style={{
              marginTop: 10,
              color: '#b91c1c',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {hata}
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 16,
          }}
        >
          <button type="button" onClick={onClose} style={ikincilBtn}>
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => void kaydet()}
            disabled={kaydediliyor || !secili}
            style={birincilBtn(kaydediliyor || !secili)}
          >
            {kaydediliyor ? 'Kaydediliyor…' : duzenlenen ? 'Güncelle' : 'Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TarafKutusu(props: {
  baslik: string
  alanlar: OzelIslemAlan[]
  deger: TarafDegerleri
  onDeger: (etiket: string, v: string) => void
}) {
  const { baslik, alanlar, deger, onDeger } = props
  return (
    <div
      style={{
        marginTop: 12,
        border: '1px solid #ddd6fe',
        borderRadius: 10,
        padding: '4px 12px 12px',
        background: '#faf8ff',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          color: '#6d28d9',
          marginTop: 8,
        }}
      >
        {baslik}
      </div>
      {alanlar.map((a) => (
        <div key={a.etiket}>
          <Baslik>{a.etiket}</Baslik>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignItems: 'center',
            }}
          >
            {(a.secenekler ?? []).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => onDeger(a.etiket, deger[a.etiket] === o ? '' : o)}
                style={chip(deger[a.etiket] === o)}
              >
                {o}
              </button>
            ))}
            {a.serbest ? (
              <input
                value={deger[a.etiket] ?? ''}
                onChange={(e) => onDeger(a.etiket, e.target.value)}
                placeholder={a.ipucu ?? ''}
                style={{ ...input, width: a.secenekler?.length ? 130 : '100%' }}
              />
            ) : null}
          </div>
        </div>
      ))}
      <Baslik>Detay</Baslik>
      <input
        value={deger.Detay ?? ''}
        onChange={(e) => onDeger('Detay', e.target.value)}
        placeholder="Ek detay (isteğe bağlı)"
        style={input}
      />
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
