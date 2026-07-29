import { useEffect, useRef, useState } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line, Bar, Doughnut } from 'react-chartjs-2'
import { adminApi as apiClient } from '../admin/AdminLayout'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
)

const KURLAR: Record<string, { sym: string; gun: number; alis: number }> = {
  TRY: { sym: '₺', gun: 1, alis: 1 },
  USD: { sym: '$', gun: 38.42, alis: 36.80 },
  EUR: { sym: '€', gun: 41.15, alis: 39.20 },
}

const SUBELER = [
  { id: '', ad: 'Tüm şubeler' },
  { id: 'GVN1', ad: 'GVN1' }, { id: 'GVN2', ad: 'GVN2' }, { id: 'GVN3', ad: 'GVN3' },
  { id: 'GVN4', ad: 'GVN4' }, { id: 'GVN5', ad: 'GVN5' }, { id: 'GVN6', ad: 'GVN6' },
  { id: 'GVN8', ad: 'GVN8' }, { id: 'GVN9', ad: 'GVN9' }, { id: 'GVN10', ad: 'GVN10' },
]

function fmt(v: number, doviz: string) {
  const { sym, gun } = KURLAR[doviz] ?? KURLAR.TRY
  return sym + Math.round(v / gun).toLocaleString('tr-TR')
}

const KATEGORI_KEYS = ['GUNES_GOZLUGU', 'CAM', 'LENS', 'OPTIK_CERCEVE', 'AKSESUAR', 'SOLUSYON'] as const
const KATEGORI_LABELS = ['Güneş', 'Cam', 'Lens', 'Çerçeve', 'Aksesuar', 'Solüsyon']
const KATEGORI_RENKLER = ['#A32D2D', '#185FA5', '#3B6D11', '#BA7517', '#6B3FA0', '#888780']

type AltKirilimSatir = { ad: string; ciro: number; adet: number; yuzde: number }

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--color-background-secondary)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--color-text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function PatronPage() {
  const [sekme, setSekme] = useState<'rapor' | 'sirket'>('rapor')
  const [doviz, setDoviz] = useState('TRY')
  const [subeId, setSubeId] = useState('')
  const today = new Date().toISOString().split('T')[0]
  const firstDay = new Date(new Date().setDate(1)).toISOString().split('T')[0]
  const [baslangic, setBaslangic] = useState(firstDay)
  const [bitis, setBitis] = useState(today)
  const [ozet, setOzet] = useState<any>(null)
  const [personel, setPersonel] = useState<any[]>([])
  const [kategori, setKategori] = useState<any>(null)
  const [gunluk, setGunluk] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [seciliAnaKategori, setSeciliAnaKategori] = useState<string | null>(null)
  const [altKirilim, setAltKirilim] = useState<AltKirilimSatir[]>([])
  const [altYukleniyor, setAltYukleniyor] = useState(false)
  const kategoriChartRef = useRef<any>(null)

  function handleKategoriChartClick(event: React.MouseEvent<HTMLCanvasElement>) {
    try {
      const chart = kategoriChartRef.current
      if (!chart) {
        console.warn('[patron] kategori grafiği referansı henüz hazır değil')
        return
      }
      const elements = chart.getElementsAtEventForMode(event.nativeEvent, 'nearest', { intersect: true }, false)
      if (elements.length) {
        void kategoriTikla(elements[0].index)
      } else {
        console.warn('[patron] tıklanan noktada dilim bulunamadı')
      }
    } catch (e) {
      console.error('[patron] kategori grafiği tıklama hatası', e)
    }
  }

  async function kategoriTikla(index: number) {
    const anaKategori = KATEGORI_KEYS[index]
    if (!anaKategori) return
    setSeciliAnaKategori(anaKategori)
    setAltYukleniyor(true)
    try {
      const params = `?baslangic=${baslangic}&bitis=${bitis}${subeId ? '&subeId=' + subeId : ''}&anaKategori=${anaKategori}`
      const res = await apiClient.get('/reports/patron/kategori-alt' + params)
      setAltKirilim(res.data ?? [])
    } catch (e) {
      console.error(e)
      setAltKirilim([])
    } finally {
      setAltYukleniyor(false)
    }
  }

  function kategoriGeri() {
    setSeciliAnaKategori(null)
    setAltKirilim([])
  }

  async function loadData() {
    setLoading(true)
    kategoriGeri()
    try {
      const params = `?baslangic=${baslangic}&bitis=${bitis}${subeId ? '&subeId=' + subeId : ''}`
      const [o, p, k, g] = await Promise.all([
        apiClient.get('/reports/patron/ozet' + params),
        apiClient.get('/reports/patron/personel' + params),
        apiClient.get('/reports/patron/kategori' + params),
        apiClient.get('/reports/patron/gunluk-seri' + params),
      ])
      setOzet(o.data)
      setPersonel(p.data)
      setKategori(k.data)
      setGunluk(g.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [baslangic, bitis, subeId])

  const card = { background: 'white', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 12, padding: '1rem' }
  const k = KURLAR[doviz]

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Patron Paneli</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {(['rapor', 'sirket'] as const).map(s => (
              <button key={s} type="button" onClick={() => setSekme(s)} style={{ padding: '6px 16px', borderRadius: 8, border: sekme === s ? 'none' : '1px solid #e5e7eb', backgroundColor: sekme === s ? '#C8102E' : 'white', color: sekme === s ? 'white' : '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {s === 'rapor' ? 'Rapor Dashboard' : 'Şirket Dashboard'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
          <input type="date" value={bitis} onChange={e => setBitis(e.target.value)} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
          <select value={subeId} onChange={e => setSubeId(e.target.value)} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            {SUBELER.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
          </select>
          <select value={doviz} onChange={e => setDoviz(e.target.value)} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <option value="TRY">₺ TRY</option>
            <option value="USD">$ USD</option>
            <option value="EUR">€ EUR</option>
          </select>
        </div>
      </div>

      {doviz !== 'TRY' && (
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 12, padding: '6px 12px', background: 'var(--color-background-secondary)', borderRadius: 8 }}>
          Güncel kur: 1{k.sym} = ₺{k.gun} · Alış kuru: 1{k.sym} = ₺{k.alis} · Kur farkı: +{(((k.gun - k.alis) / k.alis) * 100).toFixed(1)}%
        </div>
      )}

      {loading && <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 12 }}>Yükleniyor...</div>}

      {sekme === 'rapor' && ozet && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: '1.5rem' }}>
            <MetricCard label="Toplam ciro" value={fmt(ozet.netTotal, doviz)} />
            <MetricCard label="Satış adedi" value={String(ozet.satisAdedi)} />
            <MetricCard label="Ortalama sepet" value={fmt(ozet.ortalamaSepet, doviz)} />
            <MetricCard label="KDV" value={fmt(ozet.kdvToplam, doviz)} />
            <MetricCard label="Açık hesap" value={fmt(ozet.acikHesap, doviz)} color="var(--color-text-warning)" />
            <MetricCard label="SGK tahsilat" value={fmt(ozet.sgk, doviz)} />
            <MetricCard label="Yeni müşteri" value={String(ozet.yeniMusteriSayisi)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.5rem' }}>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Günlük ciro trendi</div>
              <div style={{ position: 'relative', height: 160 }}>
                <Line
                  data={{
                    labels: gunluk.map((g: { tarih: string }) => g.tarih),
                    datasets: [{
                      label: 'Günlük Ciro',
                      data: gunluk.map((g: { ciro: number }) => Number(g.ciro)),
                      borderColor: '#A32D2D',
                      backgroundColor: 'rgba(163,45,45,0.1)',
                      tension: 0.3,
                      fill: true,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: {
                        ticks: {
                          callback: (v: string | number) =>
                            new Intl.NumberFormat('tr-TR', {
                              style: 'currency',
                              currency: 'TRY',
                              maximumFractionDigits: 0,
                            }).format(Number(v)),
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Şube karşılaştırması</div>
              <div style={{ position: 'relative', height: 160 }}>
                <Bar
                  data={{
                    labels: ozet?.subeBreakdown?.map((s: { subeAdi: string }) => s.subeAdi) ?? [],
                    datasets: [{
                      label: 'Ciro',
                      data: ozet?.subeBreakdown?.map((s: { ciro: number }) => Number(s.ciro)) ?? [],
                      backgroundColor: '#A32D2D',
                      borderRadius: 4,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: {
                        ticks: {
                          callback: (v: string | number) =>
                            new Intl.NumberFormat('tr-TR', {
                              style: 'currency',
                              currency: 'TRY',
                              maximumFractionDigits: 0,
                            }).format(Number(v)),
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.5rem' }}>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {seciliAnaKategori
                    ? `Kategori dağılımı — ${KATEGORI_LABELS[KATEGORI_KEYS.indexOf(seciliAnaKategori as any)]} alt kırılımı`
                    : 'Kategori dağılımı'}
                </div>
                {seciliAnaKategori && (
                  <button
                    type="button"
                    onClick={kategoriGeri}
                    style={{ fontSize: 11, fontWeight: 700, color: '#374151', background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
                  >
                    ← Geri
                  </button>
                )}
              </div>

              {!seciliAnaKategori ? (
                <>
                  <div style={{ position: 'relative', height: 160 }}>
                    <Doughnut
                      ref={kategoriChartRef}
                      onClick={handleKategoriChartClick}
                      data={{
                        labels: KATEGORI_LABELS,
                        datasets: [{
                          data: KATEGORI_KEYS.map((key) =>
                            Number((kategori as any)?.[key]?.ciro ?? (kategori as any)?.[key] ?? 0),
                          ),
                          backgroundColor: KATEGORI_RENKLER,
                          borderWidth: 0,
                        }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', marginTop: 6 }}>
                    Alt kırılımı görmek için bir dilime tıklayın
                  </div>
                </>
              ) : (
                <>
                  <div style={{ position: 'relative', height: 160 }}>
                    {altYukleniyor ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: '#6b7280' }}>
                        Yükleniyor...
                      </div>
                    ) : altKirilim.length === 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: '#6b7280' }}>
                        Bu kategoride veri yok
                      </div>
                    ) : (
                      <Doughnut
                        data={{
                          labels: [KATEGORI_LABELS[KATEGORI_KEYS.indexOf(seciliAnaKategori as any)], ...altKirilim.map((a) => a.ad)],
                          datasets: [
                            {
                              // İç halka: seçili ana kategorinin kendisi (hub)
                              data: [1],
                              backgroundColor: [KATEGORI_RENKLER[KATEGORI_KEYS.indexOf(seciliAnaKategori as any)]],
                              borderWidth: 0,
                              weight: 0.5,
                            },
                            {
                              // Dış halka: alt kategori kırılımı (yüzdesel)
                              data: altKirilim.map((a) => a.yuzde),
                              backgroundColor: altKirilim.map((_, i) =>
                                ['#A32D2D', '#185FA5', '#3B6D11', '#BA7517', '#6B3FA0', '#888780', '#D97706', '#0E7490'][i % 8],
                              ),
                              borderWidth: 0,
                              weight: 1,
                            },
                          ] as any,
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              callbacks: {
                                label: (ctx: any) => {
                                  if (ctx.datasetIndex === 0) return ` ${ctx.label}`
                                  const row = altKirilim[ctx.dataIndex]
                                  return ` ${row?.ad}: %${row?.yuzde.toFixed(1)}`
                                },
                              },
                            },
                          },
                        }}
                      />
                    )}
                  </div>
                  {altKirilim.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {altKirilim.map((row, i) => (
                        <div key={row.ad} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, backgroundColor: ['#A32D2D', '#185FA5', '#3B6D11', '#BA7517', '#6B3FA0', '#888780', '#D97706', '#0E7490'][i % 8] }} />
                          <span style={{ flex: 1, color: '#374151' }}>{row.ad}</span>
                          <span style={{ fontWeight: 700 }}>%{row.yuzde.toFixed(1)}</span>
                          <span style={{ color: '#9ca3af', minWidth: 60, textAlign: 'right' }}>{fmt(row.ciro, doviz)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Ödeme yöntemleri</div>
              <div style={{ position: 'relative', height: 160 }}>
                <Doughnut
                  data={{
                    labels: ['Nakit', 'Kart', 'SGK', 'Açık Hesap'],
                    datasets: [{
                      data: [
                        Number(ozet?.nakit ?? 0),
                        Number(ozet?.kart ?? 0),
                        Number(ozet?.sgk ?? 0),
                        Number(ozet?.acikHesap ?? 0),
                      ],
                      backgroundColor: ['#3B6D11', '#185FA5', '#BA7517', '#A32D2D'],
                      borderWidth: 0,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Personel performansı</div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 4px', color: '#6b7280' }}>Personel</td>
                  <td style={{ padding: '5px 4px', color: '#6b7280', textAlign: 'center' }}>Satış</td>
                  <td style={{ padding: '5px 4px', color: '#6b7280', textAlign: 'right' }}>Ciro</td>
                </tr></thead>
                <tbody>
                  {personel.map((p: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 4px' }}>{p.ad}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'center' }}>{p.satisAdedi}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700 }}>{fmt(p.ciro, doviz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Kategori detayı</div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 4px', color: '#6b7280' }}>Kategori</td>
                  <td style={{ padding: '5px 4px', color: '#6b7280', textAlign: 'center' }}>Adet</td>
                  <td style={{ padding: '5px 4px', color: '#6b7280', textAlign: 'right' }}>Ciro</td>
                </tr></thead>
                <tbody>
                  {kategori && Object.entries(kategori).map(([kat, val]: any) => (
                    <tr key={kat} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 4px' }}>{kat}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'center' }}>{val.adet}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700 }}>{fmt(val.ciro, doviz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {sekme === 'sirket' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: '1.5rem' }}>
            <MetricCard label="Toplam gelir" value={ozet ? fmt(ozet.netTotal, doviz) : '—'} color="var(--color-text-success)" />
            <MetricCard label="Personel maliyeti" value={fmt(149760, doviz)} color="var(--color-text-danger)" />
            <MetricCard label="Kira & giderler" value={fmt(111000, doviz)} color="var(--color-text-danger)" />
            <MetricCard label="Net kar" value={ozet ? fmt(ozet.netTotal - 198200, doviz) : '—'} color="var(--color-text-success)" />
            <MetricCard label="KDV borcu" value={fmt(27100, doviz)} color="var(--color-text-warning)" />
            <MetricCard label="Stok değeri" value={fmt(3895500, doviz)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.5rem' }}>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Personel maliyetleri</div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 4px', color: '#6b7280' }}>Personel</td>
                  <td style={{ padding: '5px 4px', color: '#6b7280', textAlign: 'right' }}>Maaş</td>
                  <td style={{ padding: '5px 4px', color: '#6b7280', textAlign: 'right' }}>SGK</td>
                  <td style={{ padding: '5px 4px', color: '#6b7280', textAlign: 'right' }}>Toplam</td>
                </tr></thead>
                <tbody>
                  {[
                    { ad: 'Sys. Yön.', maas: 45000, sgk: 8100 },
                    { ad: 'Servis Adese', maas: 32000, sgk: 5760 },
                    { ad: 'Servis NG', maas: 28000, sgk: 5040 },
                    { ad: 'Kasiyer GVN1', maas: 22000, sgk: 3960 },
                    { ad: 'Kasiyer GVN4', maas: 22000, sgk: 3960 },
                  ].map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 4px' }}>{p.ad}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right' }}>{fmt(p.maas, doviz)}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', color: '#6b7280' }}>{fmt(p.sgk, doviz)}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700 }}>{fmt(p.maas + p.sgk, doviz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Mağaza & genel giderler</div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '5px 4px', color: '#6b7280' }}>Kalem</td>
                  <td style={{ padding: '5px 4px', color: '#6b7280' }}>Şube</td>
                  <td style={{ padding: '5px 4px', color: '#6b7280', textAlign: 'right' }}>Tutar</td>
                </tr></thead>
                <tbody>
                  {[
                    { kalem: 'Kira', sube: 'GVN3', tutar: 48000 },
                    { kalem: 'Kira', sube: 'GVN1', tutar: 35000 },
                    { kalem: 'Kira', sube: 'GVN2', tutar: 28000 },
                    { kalem: 'Elektrik/su', sube: 'Tüm şubeler', tutar: 12400 },
                    { kalem: 'Muhasebe', sube: 'Merkez', tutar: 8500 },
                    { kalem: 'Sigorta', sube: 'Tüm şubeler', tutar: 6200 },
                  ].map((g, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 4px' }}>{g.kalem}</td>
                      <td style={{ padding: '7px 4px', color: '#6b7280' }}>{g.sube}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right' }}>{fmt(g.tutar, doviz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>KDV & komisyon hesabı</div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    { k: 'Tahsil edilen KDV', v: ozet?.kdvToplam ?? 47400, renk: '' },
                    { k: 'Ödenen KDV (alışlar)', v: -18200, renk: 'var(--color-text-danger)' },
                    { k: 'Devreden KDV', v: -2100, renk: 'var(--color-text-secondary)' },
                    { k: 'Beyan edilecek KDV', v: (ozet?.kdvToplam ?? 47400) - 18200 - 2100, renk: 'var(--color-text-warning)' },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 4px', color: '#6b7280' }}>{r.k}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: i === 3 ? 700 : 400, color: r.renk || 'inherit' }}>{r.v < 0 ? '-' : ''}{fmt(Math.abs(r.v), doviz)}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={2} style={{ padding: '8px 4px', fontWeight: 700, fontSize: 12 }}>Komisyonlar</td></tr>
                  {[
                    { k: 'Banka komisyonu', v: 4280 },
                    { k: 'SGK işveren', v: 26820 },
                    { k: 'Sigorta primleri', v: 6200 },
                  ].map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 4px', color: '#6b7280' }}>{r.k}</td>
                      <td style={{ padding: '7px 4px', textAlign: 'right' }}>{fmt(r.v, doviz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Basit bilanço</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Aktif</div>
                  {[{ k: 'Nakit & banka', v: ozet?.nakit ?? 124000 }, { k: 'Alacaklar', v: ozet?.acikHesap ?? 18200 }, { k: 'Stok', v: 3895500 }, { k: 'Demirbaş', v: 85000 }].map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ color: '#6b7280' }}>{r.k}</span><span>{fmt(r.v, doviz)}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: 'var(--color-text-success)' }}>
                    {fmt((ozet?.nakit ?? 124000) + (ozet?.acikHesap ?? 18200) + 3895500 + 85000, doviz)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Pasif</div>
                  {[{ k: 'Borçlar', v: 48000 }, { k: 'Banka kredisi', v: 120000 }, { k: 'KDV borcu', v: 27100 }, { k: 'SGK borcu', v: 26820 }].map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ color: '#6b7280' }}>{r.k}</span><span style={{ color: 'var(--color-text-danger)' }}>{fmt(r.v, doviz)}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 6, color: 'var(--color-text-danger)' }}>{fmt(221920, doviz)}</div>
                </div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #e5e7eb', fontSize: 13, fontWeight: 700 }}>
                Net varlık: <span style={{ color: 'var(--color-text-success)' }}>{fmt((ozet?.nakit ?? 124000) + (ozet?.acikHesap ?? 18200) + 3895500 + 85000 - 221920, doviz)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
