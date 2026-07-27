import type { SablonAyar, SablonVeri } from './sablon-types'
import { formatFiyat, gs1ReferansSatirlari, modelVeRenk, nitelikKisa } from './sablon-utils'

export type PreviewProps = {
  data: SablonVeri
  ayar: SablonAyar
  width: number
  height: number
}

/** 2:1 etiket tasarım tabanı (100×50 mm önizleme) */
const BASE2_W = 300
const BASE2_H = 150

/** Güneş paddle etiketi — 102×20 mm (816×160 dot) */
const GUNES_DOT_W = 816
const GUNES_DOT_H = 160
const GUNES_HEAD_X = 280
const GUNES_FOLD_X = 548
const GUNES_STICK_H = 51
const GUNES_HEAD_R = 20
const GUNES_BAR_X = 334
const GUNES_BAR_Y = 16
const GUNES_BAR_H = 27
const GUNES_BAR_NO_X = 334
const GUNES_BAR_NO_Y = 58
const GUNES_URUN_X = 290
const GUNES_URUN_Y = 74
const GUNES_MODEL_X = 290
const GUNES_MODEL_Y = 90
const GUNES_RENK_X = 341
const GUNES_RENK_Y = 90
const GUNES_FIYAT_X = 388
const GUNES_FIYAT_Y = 112
const GUNES_TARIH_X = 289
const GUNES_TARIH_Y = 131
const GUNES_KDV_X = 289
const GUNES_KDV_Y = 144
const GUNES_GS1_X = 569
const GUNES_GS1_Y = 18
const GUNES_GS1_SIZE = 94
const GUNES_REF_X = 665
const GUNES_REF_Y = 38
const GUNES_REF_LINE = 16

/** Depo etiketi tasarım tabanı (50×30 mm → 150×90 px @ 3px/mm, 400×240 dot) */
const DEPO_DOT_W = 400
const DEPO_DOT_H = 240
const DEPO_PAD = 10
const DEPO_HALF = 186
const DEPO_RIGHT = 204
const DEPO_BAR_Y = 6
const DEPO_BAR_H = 48
const DEPO_BARKOD_NO_Y = 58
const DEPO_URUN_Y = 72
const DEPO_META_Y = 92
const DEPO_BOX_TITLE_Y = 110
const DEPO_BOX_Y = 120
const DEPO_BOX_H = 110

function scale2(width: number, height: number) {
  return {
    x: (px: number) => px * (width / BASE2_W),
    y: (px: number) => px * (height / BASE2_H),
    f: (px: number) => px * (height / BASE2_H),
  }
}

function scaleGunes(width: number, height: number) {
  return {
    dX: (dot: number) => dot * (width / GUNES_DOT_W),
    dY: (dot: number) => dot * (height / GUNES_DOT_H),
    dW: (dot: number) => dot * (width / GUNES_DOT_W),
    dH: (dot: number) => dot * (height / GUNES_DOT_H),
    f: (dotFont: number) => Math.max(5, dotFont * (height / GUNES_DOT_H)),
  }
}

/** Paddle/kalem die-cut outline — yalnızca ekran önizlemesi */
function gunesPaddlePath(): string {
  const stickTop = (GUNES_DOT_H - GUNES_STICK_H) / 2
  const stickBot = stickTop + GUNES_STICK_H
  const r = GUNES_HEAD_R
  const right = GUNES_DOT_W
  return [
    `M 0 ${stickTop}`,
    `H ${GUNES_HEAD_X}`,
    `V 0`,
    `H ${right - r}`,
    `A ${r} ${r} 0 0 1 ${right} ${r}`,
    `V ${GUNES_DOT_H - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${GUNES_DOT_H}`,
    `H ${GUNES_HEAD_X}`,
    `V ${stickBot}`,
    `H 0`,
    'Z',
  ].join(' ')
}

function scaleDepo(width: number, height: number) {
  return {
    dX: (dot: number) => dot * (width / DEPO_DOT_W),
    dY: (dot: number) => dot * (height / DEPO_DOT_H),
    dW: (dot: number) => dot * (width / DEPO_DOT_W),
    dH: (dot: number) => dot * (height / DEPO_DOT_H),
    f: (dotFont: number) => Math.max(5, dotFont * (height / DEPO_DOT_H)),
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

/** 1. Güneş Gözlüğü / Aksesuar — katlanır paddle, Code128 + GS1 */
export function SablonGunesGozlugu({ data, ayar, width, height }: PreviewProps) {
  const s = scaleGunes(width, height)
  const barkodVal = data.barkod?.trim() || data.icReferans?.trim() || '8693283900499'
  const nitelikRaw = data.renkVaryant?.trim() || data.icReferans || ''
  const { model, renk } = modelVeRenk(nitelikRaw)
  const refSatirlari = gs1ReferansSatirlari(data)

  return (
    <div style={{ ...base, width, height, border: 'none', backgroundColor: 'transparent' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${GUNES_DOT_W} ${GUNES_DOT_H}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <path
          d={gunesPaddlePath()}
          fill="white"
          stroke="#374151"
          strokeWidth={1.5}
        />
        <line
          x1={GUNES_FOLD_X}
          y1={4}
          x2={GUNES_FOLD_X}
          y2={GUNES_DOT_H - 4}
          stroke="#d1d5db"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      </svg>

      {ayar.gosterBarkod ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(GUNES_BAR_X),
            top: s.dY(GUNES_BAR_Y),
            width: s.dW(180),
            height: s.dH(GUNES_BAR_H),
            backgroundColor: '#f9fafb',
            border: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: s.f(7),
            color: '#374151',
            fontWeight: 600,
          }}
        >
          CODE128
        </div>
      ) : null}

      {ayar.gosterBarkod ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(GUNES_BAR_NO_X),
            top: s.dY(GUNES_BAR_NO_Y),
            fontSize: s.f(11),
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
          }}
        >
          {barkodVal}
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: s.dX(GUNES_URUN_X),
          top: s.dY(GUNES_URUN_Y),
          fontSize: s.f(14),
          fontWeight: 'bold',
          color: ayar.renkBaslik,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: s.dW(240),
        }}
      >
        {data.urunAdi}
      </div>

      {ayar.gosterIcReferans && model ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(GUNES_MODEL_X),
            top: s.dY(GUNES_MODEL_Y),
            fontSize: s.f(13),
            whiteSpace: 'nowrap',
          }}
        >
          {model}
        </div>
      ) : null}

      {ayar.gosterRenk && renk ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(GUNES_RENK_X),
            top: s.dY(GUNES_RENK_Y),
            fontSize: s.f(13),
            whiteSpace: 'nowrap',
          }}
        >
          {renk}
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: s.dX(GUNES_FIYAT_X),
          top: s.dY(GUNES_FIYAT_Y),
          fontSize: s.f(26),
          fontWeight: 'bold',
          color: ayar.renkFiyat,
          whiteSpace: 'nowrap',
        }}
      >
        {formatFiyat(data.fiyat)}
      </div>

      {ayar.gosterSonGuncelleme && data.sonGuncelleme ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(GUNES_TARIH_X),
            top: s.dY(GUNES_TARIH_Y),
            fontSize: s.f(10),
            color: '#555',
            whiteSpace: 'nowrap',
          }}
        >
          FİYAT DEĞİŞİM TARİHİ: {data.sonGuncelleme}
        </div>
      ) : null}

      {ayar.gosterKdv ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(GUNES_KDV_X),
            top: s.dY(GUNES_KDV_Y),
            fontSize: s.f(10),
            color: '#666',
          }}
        >
          KDV DAHİLDİR
        </div>
      ) : null}

      {ayar.gosterGs1 ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(GUNES_GS1_X),
            top: s.dY(GUNES_GS1_Y),
            width: s.dW(GUNES_GS1_SIZE),
            height: s.dH(GUNES_GS1_SIZE),
            backgroundColor: '#888',
            border: '1px solid #666',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: s.f(10),
          }}
        >
          GS1
        </div>
      ) : null}

      {ayar.gosterGs1Kodlari
        ? refSatirlari.map((satir, i) => (
            <div
              key={satir}
              style={{
                position: 'absolute',
                left: s.dX(GUNES_REF_X),
                top: s.dY(GUNES_REF_Y + i * GUNES_REF_LINE),
                fontSize: s.f(13),
                color: '#333',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}
            >
              {satir}
            </div>
          ))
        : null}
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
      {ayar.gosterGs1Kodlari
        ? gs1ReferansSatirlari(data).map((satir, i) => (
            <div
              key={satir}
              style={{
                position: 'absolute',
                right: s.x(80),
                top: s.y(78 + i * 14),
                fontSize: s.f(7),
                color: '#666',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}
            >
              {satir}
            </div>
          ))
        : null}
    </div>
  )
}

/** 3. Depo Etiketi — 50×30 mm */
export function SablonDepoKutu({ data, ayar, width, height }: PreviewProps) {
  const s = scaleDepo(width, height)
  const barkodVal = data.barkod?.trim() || data.icReferans?.trim() || '8693283900499'
  const nitelik = nitelikKisa(data.renkVaryant?.trim() || data.icReferans || '')

  return (
    <div style={{ ...base, width, height }}>
      {ayar.gosterBarkod ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(DEPO_PAD),
            top: s.dY(DEPO_BAR_Y),
            width: s.dW(DEPO_DOT_W - DEPO_PAD * 2),
            height: s.dH(DEPO_BAR_H),
            backgroundColor: '#f9fafb',
            border: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: s.f(8),
            color: '#374151',
            fontWeight: 600,
          }}
        >
          CODE128
        </div>
      ) : null}

      {ayar.gosterBarkodNo ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(DEPO_PAD),
            top: s.dY(DEPO_BARKOD_NO_Y),
            width: s.dW(DEPO_DOT_W - DEPO_PAD * 2),
            fontSize: s.f(11),
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {barkodVal}
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: s.dX(DEPO_PAD),
          top: s.dY(DEPO_URUN_Y),
          width: s.dW(DEPO_DOT_W - DEPO_PAD * 2),
          fontSize: s.f(14),
          fontWeight: 'bold',
          color: ayar.renkBaslik,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {data.urunAdi}
      </div>

      {ayar.gosterNitelik && nitelik ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(DEPO_PAD),
            top: s.dY(DEPO_META_Y),
            width: s.dW(DEPO_HALF),
            fontSize: s.f(10),
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {nitelik}
        </div>
      ) : null}

      {ayar.gosterSonSayim ? (
        <div
          style={{
            position: 'absolute',
            left: s.dX(DEPO_RIGHT),
            top: s.dY(DEPO_META_Y),
            width: s.dW(DEPO_HALF),
            fontSize: s.f(8),
            color: '#999999',
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title="Gecici: sonGuncelleme — gercek son sayim tarihi sonra eklenecek"
        >
          {data.sonGuncelleme}
        </div>
      ) : null}

      {ayar.gosterCerceveTuru ? (
        <>
          <div style={{ position: 'absolute', left: s.dX(DEPO_PAD), top: s.dY(DEPO_BOX_TITLE_Y), fontSize: s.f(7), color: '#666666' }}>
            Çerçeve Türü
          </div>
          <div
            style={{
              position: 'absolute',
              left: s.dX(DEPO_PAD),
              top: s.dY(DEPO_BOX_Y),
              width: s.dW(DEPO_HALF),
              height: s.dH(DEPO_BOX_H),
              border: '1px solid #374151',
              boxSizing: 'border-box',
            }}
          />
        </>
      ) : null}

      {ayar.gosterMateryal ? (
        <>
          <div style={{ position: 'absolute', left: s.dX(DEPO_RIGHT), top: s.dY(DEPO_BOX_TITLE_Y), fontSize: s.f(7), color: '#666666' }}>
            Materyal
          </div>
          <div
            style={{
              position: 'absolute',
              left: s.dX(DEPO_RIGHT),
              top: s.dY(DEPO_BOX_Y),
              width: s.dW(DEPO_HALF),
              height: s.dH(DEPO_BOX_H),
              border: '1px solid #374151',
              boxSizing: 'border-box',
            }}
          />
        </>
      ) : null}
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
