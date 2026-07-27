import { generateZplFromSablon, getEtiketSablonBySlug, type EtiketDil } from '../../api/etiket.api'
import type { CanvasElement, EtiketRenderVeri, EtiketSablonRender } from './etiket-canvas-render'
import type { SablonId } from '../etiket-tasarimci/sablon-types'
import { sablonBul, VARSAYILAN_AYAR } from '../etiket-tasarimci/sablon-registry'
import { uretSablonZpl } from '../etiket-tasarimci/sablon-zpl'
import type { SablonAyar, SablonVeri } from '../etiket-tasarimci/sablon-types'

export type EtiketUrunVeri = {
  urunAdi: string
  seriNo?: string
  fiyat?: number | string
  barkod?: string | null
  icReferans?: string
  renkVaryant?: string
  utsKodu?: string | null
  categAdi?: string
  lokasyon?: string
  miktar?: number
  lotNo?: string | null
  sktTarihi?: string
  sonGuncelleme?: string
}

export function gunesKategorisiMi(categAdi?: string): boolean {
  const kat = (categAdi ?? '').toLowerCase()
  return kat.includes('güneş') || kat.includes('gunes')
}

/** Pilot DB sablonu slug — eski SablonId secimine gore */
export function pilotSlugForSablon(sablonId: SablonId, categAdi?: string): string | null {
  if (sablonId === 'gunes-aksesuar' && gunesKategorisiMi(categAdi)) {
    return 'gunes-gozlugu-katlanir'
  }
  if (sablonId === 'depo-kutu') {
    return 'depo-etiketi'
  }
  return null
}

/** Ürün kategorisine ve UTS durumuna göre varsayılan şablon */
export function otomatikSablonSec(urunKategori: string, utsKodlu: boolean): SablonId {
  const kat = (urunKategori || '').toLowerCase()
  const cerceve = kat.includes('çerçeve') || kat.includes('cerceve') || kat.includes('cerçeve')
  if (cerceve) {
    return utsKodlu ? 'optik-cerceve-uts' : 'gunes-aksesuar'
  }
  if (kat.includes('aksesuar')) {
    return 'gunes-aksesuar'
  }
  if (kat.includes('güneş') || kat.includes('gunes')) {
    return 'gunes-aksesuar'
  }
  return 'gunes-aksesuar'
}

export function urundenSablonVeri(item: EtiketUrunVeri): SablonVeri {
  return {
    urunAdi: item.urunAdi,
    icReferans: item.icReferans ?? item.barkod ?? '',
    renkVaryant: item.renkVaryant,
    fiyat: item.fiyat,
    seriNo: item.seriNo || '-',
    barkod: item.barkod ?? item.icReferans ?? '',
    utsKodu: item.utsKodu ?? undefined,
    kategoriAdi: item.categAdi,
    lokasyon: item.lokasyon,
    miktar: item.miktar,
    lotNo: item.lotNo ?? undefined,
    sktTarihi: item.sktTarihi,
    sonGuncelleme: item.sonGuncelleme ?? new Date().toLocaleDateString('tr-TR'),
  }
}

function etiketItemToApiPayload(item: EtiketUrunVeri) {
  return {
    urunAdi: item.urunAdi,
    seriNo: item.seriNo || '-',
    fiyat: item.fiyat,
    barkod: item.barkod ?? item.icReferans,
    icReferans: item.icReferans ?? item.barkod ?? undefined,
    renkVaryant: item.renkVaryant,
    utsKodu: item.utsKodu ?? undefined,
    lotNo: item.lotNo ?? undefined,
    sktTarihi: item.sktTarihi,
    sonGuncelleme: item.sonGuncelleme ?? new Date().toLocaleDateString('tr-TR'),
  }
}

export function etiketUrunToRenderVeri(item: EtiketUrunVeri): EtiketRenderVeri {
  return {
    urunAdi: item.urunAdi,
    icReferans: item.icReferans ?? item.barkod ?? undefined,
    renkVaryant: item.renkVaryant,
    fiyat: item.fiyat,
    seriNo: item.seriNo,
    barkod: item.barkod ?? item.icReferans ?? undefined,
    utsKodu: item.utsKodu ?? undefined,
    lotNo: item.lotNo ?? undefined,
    sktTarihi: item.sktTarihi,
    sonGuncelleme: item.sonGuncelleme ?? new Date().toLocaleDateString('tr-TR'),
  }
}

/** Pilot DB sablonu — gorsel render icin eleman listesi */
export async function getPilotEtiketSablon(
  sablonId: SablonId,
  categAdi?: string,
): Promise<EtiketSablonRender | null> {
  const slug = pilotSlugForSablon(sablonId, categAdi)
  if (!slug) return null
  const dbSablon = await getEtiketSablonBySlug(slug)
  return {
    elemanlar: dbSablon.elemanlar as CanvasElement[],
    genislikMm: dbSablon.etiketGenislik,
    yukseklikMm: dbSablon.etiketYukseklik,
  }
}

export function uretCokluEtiketZpl(
  sablonId: SablonId,
  items: EtiketUrunVeri[],
  ayar?: SablonAyar,
): string {
  const sablon = sablonBul(sablonId)
  const a = ayar ?? sablon?.defaultAyar ?? VARSAYILAN_AYAR
  return items
    .map((item) => uretSablonZpl(sablonId, urundenSablonVeri(item), a))
    .join('\n')
}

/** Pilot motor varsa DB sablonu, yoksa eski sablon-registry yolu */
export async function uretEtiketZplTercihli(
  sablonId: SablonId,
  items: EtiketUrunVeri[],
  categAdi?: string,
  source: 'pos' | 'admin' = 'admin',
  dil: EtiketDil = 'ppla',
): Promise<string> {
  const slug = pilotSlugForSablon(sablonId, categAdi)
  if (slug) {
    const dbSablon = await getEtiketSablonBySlug(slug)
    const { zpl } = await generateZplFromSablon(
      {
        sablonId: dbSablon.id,
        etiketler: items.map(etiketItemToApiPayload),
        dil,
      },
      source,
    )
    return zpl
  }
  return uretCokluEtiketZpl(sablonId, items)
}
