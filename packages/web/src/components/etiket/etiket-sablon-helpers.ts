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
  lokasyon?: string
  miktar?: number
  lotNo?: string
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
    lokasyon: item.lokasyon,
    miktar: item.miktar,
    lotNo: item.lotNo,
    sonGuncelleme: new Date().toLocaleDateString('tr-TR'),
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
