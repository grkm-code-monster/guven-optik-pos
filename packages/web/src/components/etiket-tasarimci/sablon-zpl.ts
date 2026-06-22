import type { SablonAyar, SablonId, SablonVeri } from './sablon-types'
import { formatFiyat } from './sablon-utils'

function esc(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\^/g, '\\^')
    .replace(/~/g, '\\~')
}

function textZpl(x: number, y: number, font: number, text: string): string {
  const f = Math.round(font)
  return `^FO${Math.round(x)},${Math.round(y)}^A0N,${f},${f}^FD${esc(text)}^FS`
}

function barcodeZpl(x: number, y: number, h: number, val: string): string {
  return `^FO${Math.round(x)},${Math.round(y)}^BCN,${Math.round(h)},Y,N,N^FD${esc(val)}^FS`
}

function gs1Zpl(x: number, y: number, mod: number, gs1: string): string {
  return `^FO${Math.round(x)},${Math.round(y)}^BQN,2,${mod}^FDMA,${esc(gs1)}^FS`
}

function buildGs1(veri: SablonVeri): string {
  const gtin = String(veri.utsKodu ?? veri.barkod ?? '08612345678903').replace(/\D/g, '').padStart(14, '0').slice(-14)
  const serial = String(veri.seriNo ?? 'SN123456').replace(/[()]/g, '')
  return `(01)${gtin}(21)${serial}`
}

function wrap(lines: string[]): string {
  return `^XA\n${lines.filter(Boolean).join('\n')}\n^XZ`
}

function zplGunesAksesuar(veri: SablonVeri, ayar: SablonAyar): string {
  const lines: string[] = []
  lines.push(textZpl(95, 30, ayar.fontUrunAdi, veri.urunAdi ?? ''))
  if (ayar.gosterIcReferans) {
    const ref = ayar.gosterRenk
      ? `${veri.icReferans ?? ''}  |  ${veri.renkVaryant ?? ''}`
      : String(veri.icReferans ?? '')
    lines.push(textZpl(95, 70, ayar.fontKucuk, ref))
  }
  lines.push(textZpl(95, 120, ayar.fontFiyat, formatFiyat(veri.fiyat)))
  if (ayar.gosterKdv) lines.push(textZpl(95, 165, 9, 'KDV DAHİLDİR'))
  if (ayar.gosterSonGuncelleme) lines.push(textZpl(95, 200, 9, `Son fiyat günc: ${veri.sonGuncelleme ?? ''}`))
  if (ayar.gosterSeri) lines.push(textZpl(95, 230, 9, `Seri: ${veri.seriNo ?? ''}`))
  if (ayar.gosterBarkod) lines.push(barcodeZpl(520, 20, 100, veri.barkod ?? veri.icReferans ?? 'REF001'))
  return wrap(lines)
}

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
    lines.push(textZpl(678, 220, 8, `(01) ${veri.utsKodu ?? ''}`))
    lines.push(textZpl(678, 240, 8, `(21) ${veri.seriNo ?? ''}`))
    lines.push(textZpl(678, 260, 8, '(11) 220622'))
    lines.push(textZpl(678, 280, 8, '(10) 1'))
  }
  return wrap(lines)
}

function zplDepoKutu(veri: SablonVeri, ayar: SablonAyar): string {
  const lines: string[] = []
  lines.push(textZpl(20, 20, ayar.fontUrunAdi, veri.urunAdi ?? ''))
  if (ayar.gosterIcReferans) lines.push(textZpl(20, 70, ayar.fontKucuk, `Ref: ${veri.icReferans ?? ''}`))
  if (ayar.gosterRenk) lines.push(textZpl(20, 100, ayar.fontKucuk, `Renk: ${veri.renkVaryant ?? ''}`))
  if (ayar.gosterMiktar) lines.push(textZpl(20, 150, ayar.fontFiyat, `Miktar: ${veri.miktar ?? 0} adet`))
  if (ayar.gosterLokasyon) lines.push(textZpl(20, 210, ayar.fontKucuk, `Lokasyon: ${veri.lokasyon ?? ''}`))
  if (ayar.gosterLot) lines.push(textZpl(20, 250, ayar.fontKucuk, `Lot: ${veri.lotNo ?? ''}`))
  if (ayar.gosterBarkod) lines.push(barcodeZpl(20, 400, 120, veri.barkod ?? veri.icReferans ?? 'REF001'))
  lines.push(textZpl(20, 540, 9, veri.sonGuncelleme ?? ''))
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
