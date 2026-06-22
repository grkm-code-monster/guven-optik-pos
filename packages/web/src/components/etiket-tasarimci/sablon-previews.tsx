import type { SablonAyar, SablonVeri } from './sablon-types'
import { formatFiyat } from './sablon-utils'

export type PreviewProps = {
  data: SablonVeri
  ayar: SablonAyar
  width: number
  height: number
}

/** 2:1 etiket tasarım tabanı (100×50 mm önizleme) */
const BASE2_W = 300
const BASE2_H = 150

/** Depo etiketi tasarım tabanı (100×75 mm) */
const DEPO_W = 300
const DEPO_H = 225

function scale2(width: number, height: number) {
  return {
    x: (px: number) => px * (width / BASE2_W),
    y: (px: number) => px * (height / BASE2_H),
    f: (px: number) => px * (height / BASE2_H),
  }
}

function scaleDepo(width: number, height: number) {
  return {
    x: (px: number) => px * (width / DEPO_W),
    y: (px: number) => px * (height / DEPO_H),
    f: (px: number) => px * (height / DEPO_H),
  }
}

function Kulakcik({ w, h }: { w: number; h: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: w,
        height: h,
        backgroundColor: '#f0f0f0',
        borderRight: '1px dashed #ddd',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontSize: Math.max(7, w * 0.15),
          color: '#ccc',
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
        }}
      >
        KULAKÇIK
      </span>
    </div>
  )
}

const base: React.CSSProperties = {
  position: 'relative',
  border: '1px solid #ccc',
  backgroundColor: 'white',
  fontFamily: 'Arial, sans-serif',
  overflow: 'hidden',
  boxSizing: 'border-box',
}

/** 1. Güneş Gözlüğü / Aksesuar — UTS'siz, Code128 */
export function SablonGunesGozlugu({ data, ayar, width, height }: PreviewProps) {
  const s = scale2(width, height)
  const kW = s.x(30)
  const textL = s.x(38)

  return (
    <div style={{ ...base, width, height }}>
      <Kulakcik w={kW} h={height} />
      <div
        style={{
          position: 'absolute',
          left: textL,
          top: s.y(15),
          fontSize: s.f(14),
          fontWeight: 'bold',
          color: ayar.renkBaslik,
          whiteSpace: 'nowrap',
        }}
      >
        {data.urunAdi}
      </div>
      {ayar.gosterIcReferans ? (
        <div style={{ position: 'absolute', left: textL, top: s.y(35), fontSize: s.f(11), color: '#333' }}>
          {ayar.gosterRenk
            ? `${data.icReferans}  |  ${data.renkVaryant}`
            : data.icReferans}
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: textL,
          top: s.y(55),
          fontSize: s.f(22),
          fontWeight: 'bold',
          color: ayar.renkFiyat,
        }}
      >
        {formatFiyat(data.fiyat)}
      </div>
      {ayar.gosterKdv ? (
        <div style={{ position: 'absolute', left: textL, top: s.y(85), fontSize: s.f(8), color: '#999' }}>
          KDV DAHİLDİR
        </div>
      ) : null}
      {ayar.gosterSonGuncelleme ? (
        <div style={{ position: 'absolute', left: textL, top: s.y(100), fontSize: s.f(8), color: '#aaa' }}>
          Son fiyat günc: {data.sonGuncelleme}
        </div>
      ) : null}
      {ayar.gosterSeri ? (
        <div style={{ position: 'absolute', left: textL, top: s.y(115), fontSize: s.f(8), color: '#aaa' }}>
          Seri: {data.seriNo}
        </div>
      ) : null}
      {ayar.gosterBarkod ? (
        <div
          style={{
            position: 'absolute',
            left: s.x(35),
            right: s.x(10),
            bottom: s.y(10),
            height: s.y(35),
            backgroundColor: '#f9fafb',
            border: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: s.x(6),
            fontSize: s.f(10),
            color: '#374151',
          }}
        >
          CODE128
        </div>
      ) : null}
    </div>
  )
}

/** 2. Optik Çerçeve — UTS'li, GS1 DataMatrix */
export function SablonOptikCerceveUts({ data, ayar, width, height }: PreviewProps) {
  const s = scale2(width, height)
  const kW = s.x(30)
  const textL = s.x(38)
  const gs1Size = s.x(65)

  return (
    <div style={{ ...base, width, height }}>
      <Kulakcik w={kW} h={height} />
      <div
        style={{
          position: 'absolute',
          left: textL,
          top: s.y(15),
          fontSize: s.f(14),
          fontWeight: 'bold',
          color: ayar.renkBaslik,
        }}
      >
        {data.urunAdi}
      </div>
      {ayar.gosterIcReferans ? (
        <div style={{ position: 'absolute', left: textL, top: s.y(35), fontSize: s.f(11), color: '#333' }}>
          {data.icReferans}  |  {data.renkVaryant}
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: textL,
          top: s.y(55),
          fontSize: s.f(22),
          fontWeight: 'bold',
          color: ayar.renkFiyat,
        }}
      >
        {formatFiyat(data.fiyat)}
      </div>
      {ayar.gosterKdv ? (
        <div style={{ position: 'absolute', left: textL, top: s.y(85), fontSize: s.f(8), color: '#999' }}>
          KDV DAHİLDİR
        </div>
      ) : null}
      {ayar.gosterSonGuncelleme ? (
        <div style={{ position: 'absolute', left: textL, top: s.y(100), fontSize: s.f(8), color: '#aaa' }}>
          Son fiyat günc: {data.sonGuncelleme}
        </div>
      ) : null}
      {ayar.gosterSeri ? (
        <div style={{ position: 'absolute', left: textL, top: s.y(115), fontSize: s.f(8), color: '#aaa' }}>
          Seri: {data.seriNo}
        </div>
      ) : null}
      {ayar.gosterGs1 ? (
        <div
          style={{
            position: 'absolute',
            top: s.y(10),
            right: s.x(10),
            width: gs1Size,
            height: gs1Size,
            backgroundColor: '#888',
            border: '1px solid #666',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: s.f(12),
          }}
        >
          GS1
        </div>
      ) : null}
      {ayar.gosterGs1Kodlari ? (
        <>
          <div style={{ position: 'absolute', right: s.x(80), top: s.y(78), fontSize: s.f(7), color: '#666', whiteSpace: 'nowrap' }}>
            (01) {data.utsKodu}
          </div>
          <div style={{ position: 'absolute', right: s.x(80), top: s.y(92), fontSize: s.f(7), color: '#666', whiteSpace: 'nowrap' }}>
            (21) {data.seriNo}
          </div>
          <div style={{ position: 'absolute', right: s.x(80), top: s.y(106), fontSize: s.f(7), color: '#666', whiteSpace: 'nowrap' }}>
            (11) 220622
          </div>
          <div style={{ position: 'absolute', right: s.x(80), top: s.y(120), fontSize: s.f(7), color: '#666', whiteSpace: 'nowrap' }}>
            (10) 1
          </div>
        </>
      ) : null}
    </div>
  )
}

/** 3. Depo / Kutu Etiketi */
export function SablonDepoKutu({ data, ayar, width, height }: PreviewProps) {
  const s = scaleDepo(width, height)
  const pad = s.x(12)

  return (
    <div style={{ ...base, width, height }}>
      <div style={{ position: 'absolute', left: pad, top: s.y(15), fontSize: s.f(18), fontWeight: 'bold', color: ayar.renkBaslik }}>
        {data.urunAdi}
      </div>
      {ayar.gosterIcReferans ? (
        <div style={{ position: 'absolute', left: pad, top: s.y(42), fontSize: s.f(12), color: '#333' }}>
          Ref: {data.icReferans}
        </div>
      ) : null}
      {ayar.gosterRenk ? (
        <div style={{ position: 'absolute', left: pad, top: s.y(62), fontSize: s.f(12), color: '#333' }}>
          Renk: {data.renkVaryant}
        </div>
      ) : null}
      {ayar.gosterMiktar ? (
        <div style={{ position: 'absolute', left: pad, top: s.y(88), fontSize: s.f(20), fontWeight: 'bold', color: ayar.renkFiyat }}>
          Miktar: {data.miktar} adet
        </div>
      ) : null}
      {ayar.gosterLokasyon ? (
        <div style={{ position: 'absolute', left: pad, top: s.y(118), fontSize: s.f(12), color: '#555' }}>
          Lokasyon: {data.lokasyon}
        </div>
      ) : null}
      {ayar.gosterLot ? (
        <div style={{ position: 'absolute', left: pad, top: s.y(140), fontSize: s.f(12), color: '#555' }}>
          Lot: {data.lotNo}
        </div>
      ) : null}
      {ayar.gosterBarkod ? (
        <div
          style={{
            position: 'absolute',
            left: pad,
            right: pad,
            bottom: s.y(38),
            height: s.y(42),
            backgroundColor: '#f9fafb',
            border: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: s.x(8),
            fontSize: s.f(11),
          }}
        >
          CODE128 — {data.barkod}
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: pad, bottom: s.y(12), fontSize: s.f(8), color: '#aaa' }}>
        {data.sonGuncelleme}
      </div>
    </div>
  )
}

/** 4. Kampanya — Yüzde İndirim */
export function SablonKampanyaYuzde({ data, ayar, width, height }: PreviewProps) {
  const s = scale2(width, height)
  const yuzde = ayar.indirimYuzdesi ?? data.indirimYuzdesi ?? 25
  const pad = s.x(15)

  return (
    <div style={{ ...base, width, height }}>
      <div
        style={{
          position: 'absolute',
          left: pad,
          top: s.y(12),
          fontSize: s.f(32),
          fontWeight: 'bold',
          color: ayar.renkKampanya,
          lineHeight: 1,
        }}
      >
        %{yuzde} İNDİRİM
      </div>
      <div style={{ position: 'absolute', left: pad, top: s.y(58), fontSize: s.f(14), fontWeight: 'bold', color: ayar.renkBaslik }}>
        {data.urunAdi}
      </div>
      {ayar.gosterIcReferans ? (
        <div style={{ position: 'absolute', left: pad, top: s.y(80), fontSize: s.f(11), color: '#333' }}>
          {data.icReferans}
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: pad, top: s.y(102), fontSize: s.f(22), fontWeight: 'bold', color: ayar.renkFiyat }}>
        {formatFiyat(data.fiyat)}
      </div>
      {ayar.gosterKdv ? (
        <div style={{ position: 'absolute', left: pad, bottom: s.y(10), fontSize: s.f(8), color: '#999' }}>
          KDV DAHİLDİR
        </div>
      ) : null}
    </div>
  )
}

/** 5. Kampanya — Fiyat Düşüşü */
export function SablonKampanyaFiyat({ data, ayar, width, height }: PreviewProps) {
  const s = scale2(width, height)
  const pad = s.x(15)

  return (
    <div style={{ ...base, width, height }}>
      <div style={{ position: 'absolute', left: pad, top: s.y(12), fontSize: s.f(14), fontWeight: 'bold', color: ayar.renkBaslik }}>
        {data.urunAdi}
      </div>
      {ayar.gosterIcReferans ? (
        <div style={{ position: 'absolute', left: pad, top: s.y(32), fontSize: s.f(11), color: '#333' }}>
          {data.icReferans}
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: pad, top: s.y(55), fontSize: s.f(16), color: '#999', textDecoration: 'line-through' }}>
        ESKİ: {formatFiyat(data.eskiFiyat ?? data.fiyat)}
      </div>
      <div style={{ position: 'absolute', left: pad, top: s.y(88), fontSize: s.f(24), fontWeight: 'bold', color: ayar.renkKampanya }}>
        YENİ: {formatFiyat(data.yeniFiyat ?? data.fiyat)}
      </div>
      <div style={{ position: 'absolute', left: pad, bottom: s.y(12), fontSize: s.f(14), color: ayar.renkKampanya, fontWeight: 'bold' }}>
        FİYAT DÜŞTÜ!
      </div>
    </div>
  )
}

/** 6. Kampanya — İkinci Ürün */
export function SablonKampanyaIkinci({ data, ayar, width, height }: PreviewProps) {
  const s = scale2(width, height)
  const pad = s.x(15)
  const ind = ayar.ikinciUrunIndirim ?? 50

  return (
    <div style={{ ...base, width, height }}>
      <div
        style={{
          position: 'absolute',
          left: pad,
          top: s.y(15),
          fontSize: s.f(30),
          fontWeight: 'bold',
          color: ayar.renkKampanya,
          lineHeight: 1.05,
        }}
      >
        2. ÜRÜN
        <br />
        %{ind}
      </div>
      <div style={{ position: 'absolute', left: pad, top: s.y(95), fontSize: s.f(14), fontWeight: 'bold', color: ayar.renkBaslik }}>
        {data.urunAdi}
      </div>
      {ayar.gosterIcReferans ? (
        <div style={{ position: 'absolute', left: pad, top: s.y(118), fontSize: s.f(11), color: '#333' }}>
          {data.icReferans}
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: pad, bottom: s.y(12), fontSize: s.f(20), fontWeight: 'bold', color: ayar.renkFiyat }}>
        {formatFiyat(data.fiyat)}
      </div>
    </div>
  )
}

export const SABLON_PREVIEW_MAP = {
  'gunes-aksesuar': SablonGunesGozlugu,
  'optik-cerceve-uts': SablonOptikCerceveUts,
  'depo-kutu': SablonDepoKutu,
  'kampanya-yuzde': SablonKampanyaYuzde,
  'kampanya-fiyat': SablonKampanyaFiyat,
  'kampanya-ikinci': SablonKampanyaIkinci,
} as const
