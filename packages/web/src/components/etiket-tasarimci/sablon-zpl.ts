import type { SablonAyar, SablonId, SablonVeri } from './sablon-types'
import { buildGs1, formatFiyat, gs1ReferansSatirlari, modelVeRenk, nitelikKisa } from './sablon-utils'

/** ZPL yazıcı ASCII — yalnızca etiket ZPL üretiminde kullanılır */
function zplAscii(text: string): string {
  const map: Record<string, string> = {
    Ü: 'U', ü: 'u', Ö: 'O', ö: 'o', Ş: 'S', ş: 's',
    Ğ: 'G', ğ: 'g', Ç: 'C', ç: 'c', İ: 'I', ı: 'i',
  }
  return String(text ?? '').replace(/[ÜüÖöŞşĞğÇçİı]/g, (c) => map[c] ?? c)
}

function esc(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~')
}

function textZpl(x: number, y: number, fw: number, fhOrText: number | string, text?: string): string {
  const fh = typeof fhOrText === 'number' ? fhOrText : fw
  const raw = typeof fhOrText === 'string' ? fhOrText : (text ?? '')
  return `^FO${Math.round(x)},${Math.round(y)}^A0N,${Math.round(fw)},${Math.round(fh)}^FD${esc(zplAscii(raw))}^FS`
}

/** Sola yaslı field block — ürün adı gibi çok satırlı metinler için */
function textFbZpl(
  x: number,
  y: number,
  fw: number,
  fh: number,
  fbWidth: number,
  maxLines: number,
  text: string,
): string {
  return `^FO${Math.round(x)},${Math.round(y)}^A0N,${Math.round(fw)},${Math.round(fh)}^FB${fbWidth},${maxLines},0,L,0^FD${esc(zplAscii(text))}^FS`
}

function barcodeZpl(x: number, y: number, h: number, val: string): string {
  return `^FO${Math.round(x)},${Math.round(y)}^BCN,${Math.round(h)},Y,N,N^FD${esc(zplAscii(val))}^FS`
}

function boxZpl(x: number, y: number, w: number, h: number, thickness = 1): string {
  return `^FO${Math.round(x)},${Math.round(y)}^GB${Math.round(w)},${Math.round(h)},${Math.round(thickness)}^FS`
}

function gs1Zpl(x: number, y: number, mod: number, gs1: string): string {
  return `^FO${Math.round(x)},${Math.round(y)}^BQN,2,${mod}^FDMA,${esc(zplAscii(gs1))}^FS`
}

function qrIcerik(veri: SablonVeri): string {
  const barkod = String(veri.barkod ?? '').trim()
  if (barkod) return barkod
  const ref = String(veri.icReferans ?? '').trim()
  if (ref) return ref
  const seri = String(veri.seriNo ?? '').trim()
  if (seri && seri !== '-') return seri
  return 'REF001'
}

function wrap(lines: string[]): string {
  return `^XA\n${lines.filter(Boolean).join('\n')}\n^XZ`
}

/** Güneş etiketi — katlanır paddle, 102×20 mm @ 8 dot/mm */
const GUNES_LABEL_W = 816
const GUNES_LABEL_H = 160
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
const GUNES_GS1_MOD = 5
const GUNES_REF_X = 665
const GUNES_REF_Y = 38
const GUNES_REF_F = 13
const GUNES_REF_LINE = 16

/** Güneş/Aksesuar — Görkem onaylı nihai koordinatlar (madde 2) */
function zplGunesAksesuar(veri: SablonVeri, ayar: SablonAyar): string {
  const lines: string[] = []
  lines.push(`^PW${GUNES_LABEL_W}`)
  lines.push(`^LL${GUNES_LABEL_H}`)

  const barkodVal = qrIcerik(veri)
  const nitelikRaw = veri.renkVaryant?.trim() || veri.icReferans || ''
  const { model, renk } = modelVeRenk(nitelikRaw)

  if (ayar.gosterBarkod) {
    lines.push(barcodeZpl(GUNES_BAR_X, GUNES_BAR_Y, GUNES_BAR_H, barkodVal))
    lines.push(textZpl(GUNES_BAR_NO_X, GUNES_BAR_NO_Y, 11, barkodVal))
  }

  lines.push(textFbZpl(GUNES_URUN_X, GUNES_URUN_Y, 14, 14, 250, 1, veri.urunAdi ?? ''))

  if (ayar.gosterIcReferans && model) {
    lines.push(textZpl(GUNES_MODEL_X, GUNES_MODEL_Y, GUNES_REF_F, model))
  }
  if (ayar.gosterRenk && renk) {
    lines.push(textZpl(GUNES_RENK_X, GUNES_RENK_Y, GUNES_REF_F, renk))
  }

  lines.push(textZpl(GUNES_FIYAT_X, GUNES_FIYAT_Y, 26, 26, formatFiyat(veri.fiyat)))

  if (ayar.gosterSonGuncelleme) {
    const tarih = veri.sonGuncelleme ?? ''
    if (tarih) {
      lines.push(textZpl(GUNES_TARIH_X, GUNES_TARIH_Y, 10, `FIYAT DEGISIM TARIHI: ${tarih}`))
    }
  }

  if (ayar.gosterKdv) {
    lines.push(textZpl(GUNES_KDV_X, GUNES_KDV_Y, 10, 'KDV DAHILDIR'))
  }

  if (ayar.gosterGs1) {
    lines.push(gs1Zpl(GUNES_GS1_X, GUNES_GS1_Y, GUNES_GS1_MOD, buildGs1(veri)))
  }

  if (ayar.gosterGs1Kodlari) {
    gs1ReferansSatirlari(veri).forEach((satir, i) => {
      lines.push(textZpl(GUNES_REF_X, GUNES_REF_Y + i * GUNES_REF_LINE, GUNES_REF_F, satir))
    })
  }

  return wrap(lines)
}

/** Depo etiketi — 50×30 mm @ 8 dot/mm (yatay) */
const DEPO_LABEL_W = 400
const DEPO_LABEL_H = 240
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

function zplOptikCerceveUts(veri: SablonVeri, ayar: SablonAyar): string {
  const lines: string[] = []
  lines.push(textZpl(95, 30, ayar.fontUrunAdi, veri.urunAdi ?? ''))
  if (ayar.gosterIcReferans) {
    lines.push(textZpl(95, 75, ayar.fontKucuk, `${veri.icReferans ?? ''}  |  ${veri.renkVaryant ?? ''}`))
  }
  lines.push(textZpl(95, 130, ayar.fontFiyat, formatFiyat(veri.fiyat)))
  if (ayar.gosterKdv) lines.push(textZpl(95, 175, 9, 'KDV DAHİLDİR'))
  if (ayar.gosterSonGuncelleme) lines.push(textZpl(95, 215, 9, `Son fiyat günc: ${veri.sonGuncelleme ?? ''}`))
  if (ayar.gosterSeri) lines.push(textZpl(95, 245, 9, `Seri: ${veri.seriNo ?? ''}`))
  if (ayar.gosterGs1) lines.push(gs1Zpl(550, 15, 10, buildGs1(veri)))
  if (ayar.gosterGs1Kodlari) {
    gs1ReferansSatirlari(veri).forEach((satir, i) => {
      lines.push(textZpl(678, 220 + i * 20, 8, satir))
    })
  }
  return wrap(lines)
}

function zplDepoKutu(veri: SablonVeri, ayar: SablonAyar): string {
  const lines: string[] = []
  lines.push(`^PW${DEPO_LABEL_W}`)
  lines.push(`^LL${DEPO_LABEL_H}`)

  const barkodVal = qrIcerik(veri)
  const textW = DEPO_LABEL_W - DEPO_PAD * 2

  if (ayar.gosterBarkod) lines.push(barcodeZpl(DEPO_PAD, DEPO_BAR_Y, DEPO_BAR_H, barkodVal))
  if (ayar.gosterBarkodNo) lines.push(textZpl(DEPO_PAD, DEPO_BARKOD_NO_Y, 11, barkodVal))
  lines.push(textFbZpl(DEPO_PAD, DEPO_URUN_Y, 14, 14, textW, 1, veri.urunAdi ?? ''))

  if (ayar.gosterNitelik) {
    const nitelik = nitelikKisa(veri.renkVaryant?.trim() || veri.icReferans || '')
    if (nitelik) lines.push(textFbZpl(DEPO_PAD, DEPO_META_Y, 10, 10, DEPO_HALF, 1, nitelik))
  }

  if (ayar.gosterSonSayim) {
    // GECICI: sonGuncelleme — gercek "son sayim tarihi" alani gelince degistirilmeli
    const tarih = veri.sonGuncelleme ?? ''
    if (tarih) lines.push(textFbZpl(DEPO_RIGHT, DEPO_META_Y, 8, 8, DEPO_HALF, 1, tarih))
  }

  if (ayar.gosterCerceveTuru) {
    lines.push(textZpl(DEPO_PAD, DEPO_BOX_TITLE_Y, 7, 'Cerceve Turu'))
    lines.push(boxZpl(DEPO_PAD, DEPO_BOX_Y, DEPO_HALF, DEPO_BOX_H))
  }

  if (ayar.gosterMateryal) {
    lines.push(textZpl(DEPO_RIGHT, DEPO_BOX_TITLE_Y, 7, 'Materyal'))
    lines.push(boxZpl(DEPO_RIGHT, DEPO_BOX_Y, DEPO_HALF, DEPO_BOX_H))
  }

  return wrap(lines)
}

function zplKampanyaYuzde(veri: SablonVeri, ayar: SablonAyar): string {
  const yuzde = ayar.indirimYuzdesi ?? veri.indirimYuzdesi ?? 25
  const lines: string[] = []
  lines.push(textZpl(40, 30, 48, `%${yuzde} İNDİRİM`))
  lines.push(textZpl(40, 120, ayar.fontUrunAdi, veri.urunAdi ?? ''))
  if (ayar.gosterIcReferans) lines.push(textZpl(40, 165, ayar.fontKucuk, veri.icReferans ?? ''))
  lines.push(textZpl(40, 220, ayar.fontFiyat, formatFiyat(veri.fiyat)))
  if (ayar.gosterKdv) lines.push(textZpl(40, 300, 9, 'KDV DAHİLDİR'))
  return wrap(lines)
}

function zplKampanyaFiyat(veri: SablonVeri, ayar: SablonAyar): string {
  const lines: string[] = []
  lines.push(textZpl(40, 25, ayar.fontUrunAdi, veri.urunAdi ?? ''))
  if (ayar.gosterIcReferans) lines.push(textZpl(40, 70, ayar.fontKucuk, veri.icReferans ?? ''))
  lines.push(textZpl(40, 130, 28, `ESKİ: ${formatFiyat(veri.eskiFiyat ?? veri.fiyat)}`))
  lines.push(textZpl(40, 190, ayar.fontFiyat, `YENİ: ${formatFiyat(veri.yeniFiyat ?? veri.fiyat)}`))
  lines.push(textZpl(40, 280, 16, 'FİYAT DÜŞTÜ!'))
  return wrap(lines)
}

function zplKampanyaIkinci(veri: SablonVeri, ayar: SablonAyar): string {
  const ind = ayar.ikinciUrunIndirim ?? 50
  const lines: string[] = []
  lines.push(textZpl(30, 40, 44, `2. ÜRÜN %${ind}`))
  lines.push(textZpl(30, 200, ayar.fontUrunAdi, veri.urunAdi ?? ''))
  if (ayar.gosterIcReferans) lines.push(textZpl(30, 260, ayar.fontKucuk, veri.icReferans ?? ''))
  lines.push(textZpl(30, 310, ayar.fontFiyat, formatFiyat(veri.fiyat)))
  return wrap(lines)
}

const ZPL_MAP: Record<SablonId, (v: SablonVeri, a: SablonAyar) => string> = {
  'gunes-aksesuar': zplGunesAksesuar,
  'optik-cerceve-uts': zplOptikCerceveUts,
  'depo-kutu': zplDepoKutu,
  'kampanya-yuzde': zplKampanyaYuzde,
  'kampanya-fiyat': zplKampanyaFiyat,
  'kampanya-ikinci': zplKampanyaIkinci,
}

export function uretSablonZpl(id: SablonId, veri: SablonVeri, ayar: SablonAyar): string {
  return ZPL_MAP[id](veri, ayar)
}
