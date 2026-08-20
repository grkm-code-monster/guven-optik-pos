import { useRef, useState } from 'react'
import {
  indirEnvanterSablon,
  onizleEnvanterExcel,
  satirOnizlemedenParsed,
  uygulaEnvanterImport,
  type EnvanterOnizlemeSonuc,
  type EnvanterSatirDurum,
  type EnvanterUygulaSonuc,
  type ParsedEnvanterRow,
} from '../../api/envanter-import.api'

// Tek istekte gönderilecek maksimum satır sayısı. Her satır ~13-15 sıralı Odoo
// çağrısı gerektirebiliyor; nginx proxy_read_timeout 60sn olduğu için büyük
// dosyalarda (200+ satır) tek istek zaman aşımına (504) uğrayabiliyor.
// Bu yüzden import parçalara bölünüp arka arkaya gönderiliyor.
const IMPORT_PARCA_BOYUTU = 15

function parcalaraBol<T>(dizi: T[], boyut: number): T[][] {
  const parcalar: T[][] = []
  for (let i = 0; i < dizi.length; i += boyut) {
    parcalar.push(dizi.slice(i, i + boyut))
  }
  return parcalar
}

const LOKASYONLAR = [
  { id: 'GVN1', sirket: 'ADESE' },
  { id: 'GVN3', sirket: 'ADESE' },
  { id: 'GVN4', sirket: 'ADESE' },
  { id: 'GVN6', sirket: 'ADESE' },
  { id: 'GVN8', sirket: 'ADESE' },
  { id: 'GVN9', sirket: 'ADESE' },
  { id: 'GVNP', sirket: 'ADESE' },
  { id: 'GVN2', sirket: 'NG' },
  { id: 'GVN7', sirket: 'NG' },
  { id: 'GVN10', sirket: 'NG' },
  { id: 'ANADEPO', sirket: 'NG' },
  { id: 'ETICARET', sirket: 'NG' },
  { id: 'GVN5', sirket: 'POTENTIAL' },
] as const

const DURUM_ETIKET: Record<EnvanterSatirDurum, string> = {
  YENI_SABLON: 'Yeni Şablon',
  YENI_VARYANT: 'Yeni Varyant',
  MEVCUT_VARYANT: 'Mevcut Varyant',
  HATA: 'Hata',
}

const DURUM_RENK: Record<EnvanterSatirDurum, { bg: string; color: string }> = {
  YENI_SABLON: { bg: '#dbeafe', color: '#1d4ed8' },
  YENI_VARYANT: { bg: '#fef3c7', color: '#b45309' },
  MEVCUT_VARYANT: { bg: '#dcfce7', color: '#166534' },
  HATA: { bg: '#fee2e2', color: '#b91c1c' },
}

const inp: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  fontSize: 13,
  boxSizing: 'border-box',
  backgroundColor: 'white',
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 10,
  border: 'none',
  backgroundColor: '#1a1a2e',
  color: 'white',
  fontWeight: 800,
  fontSize: 13,
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 10,
  border: '1px solid #e5e7eb',
  backgroundColor: '#f3f4f6',
  color: '#374151',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  fontWeight: 800,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid #e5e7eb',
  backgroundColor: '#f9fafb',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid #f3f4f6',
  fontSize: 13,
  color: '#111',
}

function hataMesaji(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data
    if (data?.error) return data.error
  }
  if (err instanceof Error) return err.message
  return 'Bilinmeyen hata'
}

function kategoriAdayMetni(adaylar: Array<{ id: number; completeName: string }>): string {
  return adaylar.map((a) => `#${a.id} ${a.completeName}`).join('; ')
}

export default function ExcelEnvanterImportTab() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lokasyon, setLokasyon] = useState('ANADEPO')
  const [dosyaAdi, setDosyaAdi] = useState<string | null>(null)
  const [onizleme, setOnizleme] = useState<EnvanterOnizlemeSonuc | null>(null)
  const [haricTutHatalilar, setHaricTutHatalilar] = useState(false)
  const [onizlemeYukleniyor, setOnizlemeYukleniyor] = useState(false)
  const [uygulamaYukleniyor, setUygulamaYukleniyor] = useState(false)
  const [sablonIndiriliyor, setSablonIndiriliyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)
  const [uygulaSonuc, setUygulaSonuc] = useState<EnvanterUygulaSonuc | null>(null)
  const [ilerleme, setIlerleme] = useState<{ tamamlanan: number; toplam: number; parca: number; toplamParca: number } | null>(null)

  const gecerliSatirlar = onizleme?.satirlar.filter((s) => s.durum !== 'HATA') ?? []
  const gosterilecekSatirlar = haricTutHatalilar
    ? gecerliSatirlar
    : (onizleme?.satirlar ?? [])

  async function handleSablonIndir() {
    setSablonIndiriliyor(true)
    setHata(null)
    try {
      await indirEnvanterSablon()
    } catch (e) {
      setHata(hataMesaji(e))
    } finally {
      setSablonIndiriliyor(false)
    }
  }

  async function handleDosyaSec(file: File | null) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setHata('Lütfen .xlsx formatında bir Excel dosyası seçin')
      return
    }

    setDosyaAdi(file.name)
    setOnizlemeYukleniyor(true)
    setHata(null)
    setUygulaSonuc(null)
    setHaricTutHatalilar(false)

    try {
      const sonuc = await onizleEnvanterExcel(file)
      setOnizleme(sonuc)
    } catch (e) {
      setOnizleme(null)
      setHata(hataMesaji(e))
    } finally {
      setOnizlemeYukleniyor(false)
    }
  }

  function handleYenidenYukle() {
    setOnizleme(null)
    setUygulaSonuc(null)
    setHaricTutHatalilar(false)
    setDosyaAdi(null)
    setHata(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleUygula() {
    if (!onizleme || gecerliSatirlar.length === 0) return

    const onay = window.confirm(
      `${gecerliSatirlar.length} satır ${lokasyon} lokasyonuna içe aktarılacak. Devam edilsin mi?`,
    )
    if (!onay) return

    setUygulamaYukleniyor(true)
    setHata(null)
    setUygulaSonuc(null)

    const tumSatirlar = gecerliSatirlar.map(satirOnizlemedenParsed)
    const parcalar = parcalaraBol<ParsedEnvanterRow>(tumSatirlar, IMPORT_PARCA_BOYUTU)
    setIlerleme({ tamamlanan: 0, toplam: tumSatirlar.length, parca: 0, toplamParca: parcalar.length })

    // Bu aktarımın TÜM parçalarında (chunk) aynı kalması gereken kimlik —
    // Odoo Lot/Seri (GRS-tarih-EXC{kimlik}-satır) üretiminde kullanılıyor.
    // Excel'deki UTS Kodu sütunuyla hiçbir ilgisi yok, sadece "bu aktarım
    // oturumu" için ayırt edici bir etiket.
    const aktarimKimligi = String(Math.floor(1000 + Math.random() * 9000))

    const birlesik: EnvanterUygulaSonuc = {
      success: true,
      ozet: { basarili: 0, basarisiz: 0 },
      satirlar: [],
    }

    for (let i = 0; i < parcalar.length; i++) {
      const parca = parcalar[i]
      try {
        const sonuc = await uygulaEnvanterImport({ lokasyonKodu: lokasyon, satirlar: parca, aktarimKimligi })
        birlesik.ozet.basarili += sonuc.ozet.basarili
        birlesik.ozet.basarisiz += sonuc.ozet.basarisiz
        birlesik.satirlar.push(...sonuc.satirlar)
        if (!sonuc.success) birlesik.success = false
      } catch (e) {
        // Bu parça isteği ağ/timeout hatasıyla düşmüş olabilir; backend arka planda
        // çalışmaya devam etmiş olabileceğinden satırları doğrudan "kayıp" saymıyoruz sadece bu parçanın sonucunu göremediğimizi bildiriyoruz. Diğer parçalarla devam ediyoruz.
        birlesik.ozet.basarisiz += parca.length
        birlesik.success = false
        for (const satir of parca) {
          birlesik.satirlar.push({
            satirNo: satir.satirNo,
            durum: 'BASARISIZ',
            mesaj: `Bu parça için istek yanıtı alınamadı (${hataMesaji(e)}). Kayıt yine de arka planda oluşmuş olabilir — dosyayı tekrar yükleyip önizlemede bu satırın "Mevcut Varyant" olarak göründüğünü kontrol edin.`,
          })
        }
      }
      setIlerleme({
        tamamlanan: Math.min(tumSatirlar.length, (i + 1) * IMPORT_PARCA_BOYUTU),
        toplam: tumSatirlar.length,
        parca: i + 1,
        toplamParca: parcalar.length,
      })
    }

    setUygulaSonuc(birlesik)
    setUygulamaYukleniyor(false)
    setIlerleme(null)
  }

  return (
    <div>
      <p style={{ fontSize: 14, color: '#6b7280', marginTop: 0, marginBottom: 20, maxWidth: 720 }}>
        Excel şablonunu indirip doldurun, ardından dosyayı yükleyerek önizleme alın.
        Onayladıktan sonra şablon, varyant, lot ve stok kayıtları seçtiğiniz lokasyona yazılır.
      </p>

      <div style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        marginBottom: 20,
        padding: 16,
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        backgroundColor: '#fafafa',
      }}
      >
        <button
          type="button"
          onClick={() => void handleSablonIndir()}
          disabled={sablonIndiriliyor}
          style={btnSecondary}
        >
          {sablonIndiriliyor ? 'İndiriliyor...' : '📥 Boş Şablon İndir'}
        </button>

        <div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
            Excel dosyası (.xlsx)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={onizlemeYukleniyor || uygulamaYukleniyor}
            onChange={(e) => void handleDosyaSec(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13 }}
          />
          {dosyaAdi && (
            <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
              Seçili: {dosyaAdi}
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>
            Hedef lokasyon
          </label>
          <select
            value={lokasyon}
            onChange={(e) => setLokasyon(e.target.value)}
            disabled={uygulamaYukleniyor}
            style={{ ...inp, minWidth: 160 }}
          >
            {LOKASYONLAR.map((l) => (
              <option key={l.id} value={l.id}>
                {l.id} ({l.sirket})
              </option>
            ))}
          </select>
        </div>
      </div>

      {onizlemeYukleniyor && (
        <div style={{ padding: 16, color: '#374151', fontSize: 14, fontWeight: 600 }}>
          Önizleme hazırlanıyor...
        </div>
      )}

      {hata && (
        <div style={{
          padding: 12,
          borderRadius: 10,
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          fontSize: 13,
          marginBottom: 16,
        }}
        >
          {hata}
        </div>
      )}

      {onizleme && !onizlemeYukleniyor && (
        <>
          <div style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 16,
            padding: 14,
            borderRadius: 10,
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            fontSize: 13,
            color: '#166534',
          }}
          >
            <span><strong>{onizleme.ozet.yeniSablon}</strong> yeni şablon</span>
            <span><strong>{onizleme.ozet.yeniVaryant}</strong> yeni varyant</span>
            <span><strong>{onizleme.ozet.mevcutVaryant}</strong> mevcut varyant</span>
            {onizleme.ozet.hata > 0 && (
              <span style={{ color: '#b91c1c' }}>
                <strong>{onizleme.ozet.hata}</strong> hatalı satır
              </span>
            )}
          </div>

          {onizleme.ozet.hata > 0 && (
            <div style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              backgroundColor: '#fff7ed',
              border: '1px solid #fed7aa',
            }}
            >
              <span style={{ fontSize: 13, color: '#9a3412', flex: '1 1 200px' }}>
                {onizleme.ozet.hata} satırda hata var. Dosyayı düzeltip tekrar yükleyebilir
                veya hatalı satırları hariç tutarak devam edebilirsiniz.
              </span>
              <button type="button" onClick={handleYenidenYukle} style={btnSecondary}>
                Dosyayı düzelt ve tekrar yükle
              </button>
              <button
                type="button"
                onClick={() => setHaricTutHatalilar(true)}
                disabled={haricTutHatalilar || gecerliSatirlar.length === 0}
                style={{
                  ...btnPrimary,
                  backgroundColor: haricTutHatalilar ? '#6b7280' : '#b45309',
                }}
              >
                Hatalı satırları hariç tut ({gecerliSatirlar.length} satır)
              </button>
            </div>
          )}

          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={th}>Satır</th>
                  <th style={th}>Durum</th>
                  <th style={th}>Ürün</th>
                  <th style={th}>Model</th>
                  <th style={th}>Renk</th>
                  <th style={th}>Ölçü</th>
                  <th style={th}>Barkod</th>
                  <th style={th}>Adet</th>
                  <th style={th}>Mesaj</th>
                </tr>
              </thead>
              <tbody>
                {gosterilecekSatirlar.map((s) => {
                  const renk = DURUM_RENK[s.durum]
                  const hataSatiri = s.durum === 'HATA'
                  return (
                    <tr
                      key={s.satirNo}
                      style={{ backgroundColor: hataSatiri ? '#fef2f2' : undefined }}
                    >
                      <td style={td}>{s.satirNo}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: 6,
                          backgroundColor: renk.bg,
                          color: renk.color,
                        }}
                        >
                          {DURUM_ETIKET[s.durum]}
                        </span>
                      </td>
                      <td style={td}>{s.urunAdi}</td>
                      <td style={td}>{s.model}</td>
                      <td style={td}>{s.renk}</td>
                      <td style={td}>{s.olcu}</td>
                      <td style={td}>{s.barkod || '—'}</td>
                      <td style={td}>{s.adet}</td>
                      <td style={{
                        ...td,
                        color: hataSatiri ? '#b91c1c' : '#6b7280',
                        fontWeight: hataSatiri ? 700 : 400,
                        maxWidth: 280,
                      }}
                      >
                        {s.mesaj}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handleUygula()}
              disabled={
                uygulamaYukleniyor
                || gecerliSatirlar.length === 0
                || (onizleme.ozet.hata > 0 && !haricTutHatalilar)
              }
              style={{
                ...btnPrimary,
                opacity: (onizleme.ozet.hata > 0 && !haricTutHatalilar) ? 0.5 : 1,
              }}
              title={
                onizleme.ozet.hata > 0 && !haricTutHatalilar
                  ? 'Hatalı satırları hariç tutun veya dosyayı düzeltin'
                  : undefined
              }
            >
              {uygulamaYukleniyor
                ? 'İçe aktarılıyor, lütfen bekleyin...'
                : `✅ Onayla ve İçe Aktar (${gecerliSatirlar.length} satır → ${lokasyon})`}
            </button>
            {onizleme.ozet.hata > 0 && !haricTutHatalilar && (
              <span style={{ fontSize: 12, color: '#b45309' }}>
                Hatalı satırlar varken içe aktarma kapalı — hariç tutun veya dosyayı düzeltin.
              </span>
            )}
          </div>
        </>
      )}

      {uygulamaYukleniyor && (
        <div style={{
          marginTop: 20,
          padding: 20,
          borderRadius: 12,
          border: '1px solid #dbeafe',
          backgroundColor: '#eff6ff',
          textAlign: 'center',
        }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>
            İçe aktarma devam ediyor
          </div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: ilerleme ? 10 : 0 }}>
            {ilerleme
              ? `${ilerleme.tamamlanan} / ${ilerleme.toplam} satır işlendi (parça ${ilerleme.parca}/${ilerleme.toplamParca}). Zaman aşımını önlemek için satırlar küçük parçalar halinde gönderiliyor, sekmeyi kapatmayın.`
              : 'Şablon, varyant, lot ve stok kayıtları oluşturuluyor. Bu işlem satır sayısına göre birkaç dakika sürebilir.'}
          </div>
          {ilerleme && (
            <div style={{ height: 8, borderRadius: 999, backgroundColor: '#dbeafe', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.round((ilerleme.tamamlanan / Math.max(1, ilerleme.toplam)) * 100)}%`,
                  backgroundColor: '#1d4ed8',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}
        </div>
      )}

      {uygulaSonuc && !uygulamaYukleniyor && (
        <div style={{
          marginTop: 24,
          padding: 16,
          borderRadius: 12,
          border: `1px solid ${uygulaSonuc.ozet.basarisiz > 0 ? '#fed7aa' : '#bbf7d0'}`,
          backgroundColor: uygulaSonuc.ozet.basarisiz > 0 ? '#fff7ed' : '#f0fdf4',
        }}
        >
          <div style={{
            fontSize: 16,
            fontWeight: 900,
            color: uygulaSonuc.ozet.basarisiz > 0 ? '#9a3412' : '#166534',
            marginBottom: 12,
          }}
          >
            İçe aktarma tamamlandı: {uygulaSonuc.ozet.basarili} başarılı, {uygulaSonuc.ozet.basarisiz} başarısız
          </div>

          {uygulaSonuc.satirlar.some((s) => s.durum === 'BASARISIZ') && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#b91c1c', marginBottom: 8 }}>
                Başarısız satırlar
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#7f1d1d' }}>
                {uygulaSonuc.satirlar
                  .filter((s) => s.durum === 'BASARISIZ')
                  .map((s) => (
                    <li key={s.satirNo} style={{ marginBottom: 8 }}>
                      <div>Satır {s.satirNo}: {s.mesaj}</div>
                      {s.kategoriAdaylari?.length ? (
                        <div style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: '#92400e',
                          backgroundColor: '#fffbeb',
                          padding: '6px 10px',
                          borderRadius: 6,
                          border: '1px solid #fde68a',
                        }}
                        >
                          Olası kategoriler: {kategoriAdayMetni(s.kategoriAdaylari)}
                          {' '}
                          — hangisi doğruysa Excel&apos;de Kategori sütununa tam yolunu yazın.
                        </div>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {uygulaSonuc.satirlar.some((s) => s.durum === 'BASARILI') && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#166534', marginBottom: 8 }}>
                Başarılı satırlar
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#14532d' }}>
                {uygulaSonuc.satirlar
                  .filter((s) => s.durum === 'BASARILI')
                  .map((s) => (
                    <li key={s.satirNo} style={{ marginBottom: 4 }}>
                      Satır {s.satirNo}
                      {s.olusturulanLotId ? ` — lot #${s.olusturulanLotId}` : ''}
                      {s.olusturulanVaryantId ? `, varyant #${s.olusturulanVaryantId}` : ''}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
