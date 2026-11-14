import { useMemo, useState } from 'react'

/**
 * 14.11.2026 — Ürün Girişi: bekleyen müşteri siparişleri paneli.
 * Fatura satırı müşteriye bağlanınca: satılan ürün otomatik eşleşir, ürün müşterinin mağazasına gider,
 * sipariş "geldi" olur. Bağ yoksa satır normal stok girişidir.
 */

export type SiparisAday = {
  id: string
  musteriAdi: string
  musteriTelefon: string | null
  subeId: string | null
  urunAdi: string
  miktar: number
  gelenAdet: number
  kalan: number
  durum: string
  tedarikciAdi: string | null
  olusturma: string
  satisTemsilcisi: string | null
  optikCam: boolean
  recete: {
    sagSph: number | null; sagCyl: number | null; sagAks: number | null; sagAdd: number | null
    solSph: number | null; solCyl: number | null; solAks: number | null; solAdd: number | null
  }
  odooProductId: number | null
  odooTmplId: number | null
  odooUrunAdi: string | null
  odooBarkod: string | null
}

export type SiparisBag = {
  siparisId: string
  musteriAdi: string
  subeId: string | null
  urunAdi: string
  optikCam: boolean
  /** Ürün eşleşmesi bu bağdan geldiyse bağ kaldırılınca eşleşme de kaldırılır */
  bagdanEslesti: boolean
}

const d2 = (v: number | null) => (v == null ? '' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`)
function receteOzet(r: SiparisAday['recete']): string {
  const sag = [d2(r.sagSph), d2(r.sagCyl)].filter(Boolean).join(' / ')
  const sol = [d2(r.solSph), d2(r.solCyl)].filter(Boolean).join(' / ')
  return [sag ? `Sağ ${sag}${r.sagAdd ? ` add ${d2(r.sagAdd)}` : ''}` : '', sol ? `Sol ${sol}${r.solAdd ? ` add ${d2(r.solAdd)}` : ''}` : ''].filter(Boolean).join(' · ')
}

const fold = (s: string) =>
  (s ?? '').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C')

const btn: React.CSSProperties = { padding: '4px 9px', borderRadius: 6, border: '1px solid #c4b5fd', backgroundColor: 'white', color: '#6d28d9', fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }

export default function MusteriSiparisPaneli({
  siparisler,
  yukleniyor,
  hata,
  kullanilan,
  firmaIpucu,
  aktifSatirAdi,
  onSatiraBagla,
  onTumune,
  onYenile,
}: {
  siparisler: SiparisAday[]
  yukleniyor: boolean
  hata: string | null
  /** bu faturada siparişe bağlanmış adet (siparisId → adet) */
  kullanilan: Map<string, number>
  /** cari / fiziki tedarikçi adı — o firmanın siparişleri üstte */
  firmaIpucu: string
  aktifSatirAdi: string | null
  onSatiraBagla: (s: SiparisAday) => void
  onTumune: (musteriSiparisleri: SiparisAday[]) => void
  onYenile: () => void
}) {
  const [acik, setAcik] = useState(true)
  const [ara, setAra] = useState('')

  const liste = useMemo(() => {
    const q = fold(ara).trim()
    const firma = fold(firmaIpucu).split(/\s+/).filter((w) => w.length >= 3)
    const uyar = (s: SiparisAday) => !!s.tedarikciAdi && firma.some((w) => fold(s.tedarikciAdi ?? '').includes(w))
    return siparisler
      .filter((s) => !q || fold(`${s.musteriAdi} ${s.urunAdi} ${s.subeId ?? ''} ${s.musteriTelefon ?? ''} ${s.tedarikciAdi ?? ''}`).includes(q))
      .map((s) => ({ s, firma: uyar(s) }))
      .sort((a, b) => Number(b.firma) - Number(a.firma) || b.s.olusturma.localeCompare(a.s.olusturma))
  }, [siparisler, ara, firmaIpucu])

  const musteriGrubu = (s: SiparisAday) =>
    siparisler.filter((x) => fold(x.musteriAdi) === fold(s.musteriAdi) && x.subeId === s.subeId)

  return (
    <div style={{ border: '2px solid #c4b5fd', borderRadius: 12, backgroundColor: '#faf5ff', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer' }} onClick={() => setAcik((x) => !x)}>
        <b style={{ fontSize: 13, color: '#5b21b6' }}>👤 Bekleyen müşteri siparişleri ({siparisler.length})</b>
        <span style={{ fontSize: 11, color: '#6b7280' }}>
          {aktifSatirAdi ? <>Seçili satır: <b style={{ color: '#1a1a2e' }}>{aktifSatirAdi}</b> — aşağıdan müşteriyi seçin</> : 'Bir satırda "👤 Kime?" deyin, sonra müşteriyi seçin. Bağlanmayan satır normal stok girişidir.'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12 }}>{acik ? '▾' : '▸'}</span>
      </div>
      {acik ? (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={ara}
              onChange={(e) => setAra(e.target.value)}
              placeholder="Müşteri, ürün, mağaza, telefon ara…"
              style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12 }}
            />
            <button type="button" style={btn} onClick={onYenile}>↻</button>
          </div>
          {hata ? <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 6 }}>{hata}</div> : null}
          {yukleniyor ? <div style={{ fontSize: 12, color: '#6b7280' }}>Siparişler okunuyor…</div> : null}
          <div style={{ maxHeight: 300, overflowY: 'auto', backgroundColor: 'white', borderRadius: 8, border: '1px solid #ede9fe' }}>
            {liste.map(({ s, firma }) => {
              const kul = kullanilan.get(s.id) ?? 0
              const kalan = s.kalan - kul
              const grup = musteriGrubu(s)
              return (
                <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 10px', borderBottom: '1px solid #f3f4f6', opacity: kalan > 0 ? 1 : 0.5 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>
                      <b>{s.musteriAdi}</b> · 🏪 {s.subeId ?? '—'} · {new Date(s.olusturma).toLocaleDateString('tr-TR')}
                      {firma ? <span style={{ marginLeft: 6, fontSize: 10, color: '#059669', fontWeight: 800 }}>bu firmaya verilmiş</span> : null}
                      {s.tedarikciAdi && !firma ? <span style={{ marginLeft: 6, fontSize: 10, color: '#6b7280' }}>firma: {s.tedarikciAdi}</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: '#374151' }}>
                      {s.urunAdi}
                      {!s.odooTmplId ? <span style={{ marginLeft: 6, color: '#b45309' }}>(Odoo karşılığı yok — ürünü elle seçin)</span> : null}
                    </div>
                    {s.optikCam && receteOzet(s.recete) ? <div style={{ fontSize: 11, color: '#6d28d9' }}>{receteOzet(s.recete)}</div> : null}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11, whiteSpace: 'nowrap' }}>
                    <div>kalan <b>{Math.max(0, kalan)}</b>/{s.miktar}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 3, justifyContent: 'flex-end' }}>
                      <button type="button" style={{ ...btn, opacity: aktifSatirAdi && kalan > 0 ? 1 : 0.4 }} disabled={!aktifSatirAdi || kalan <= 0} onClick={() => onSatiraBagla(s)}>
                        Satıra bağla
                      </button>
                      <button type="button" style={btn} title="Bağlanmamış tüm satırları bu müşterinin siparişlerine sırayla dağıt" onClick={() => onTumune(grup)}>
                        Tüm satırlar
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {!liste.length && !yukleniyor ? <div style={{ fontSize: 12, color: '#6b7280', padding: 10 }}>Bekleyen müşteri siparişi yok.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
