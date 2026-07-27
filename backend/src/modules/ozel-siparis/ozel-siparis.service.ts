import { Role } from '@prisma/client'
import { prisma } from '../../database/prisma'
import { createBildirimler } from '../bildirim/bildirim.service'
import { execute } from '../odoo/odoo.service'
import {
  getCompanyIdFromLokasyon,
  getLokasyonId,
  getLokasyonSirket,
} from '../odoo/odooLocations'
import { olusturTransfer } from '../admin/transfer-olustur.service'
import type { SirketlerArasiTransferSonuc } from '../admin/sirketler-arasi-transfer.service'
import {
  normalizeOzelSiparisDurum,
  ozelSiparisDurumLabel,
  OZEL_SIPARIS_DURUM_SIRASI,
  isOzelSiparisAktif,
} from './ozel-siparis.constants'

export async function getOzelSiparisLoglari(siparisId: string) {
  return prisma.ozelSiparisLog.findMany({
    where: { siparisId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
}

async function findSiparisBildirimAlicilari(siparis: {
  olusturanUserId: string | null
  subeId: string | null
  satisSiparisId: string | null
}) {
  const userIds = new Set<string>()

  if (siparis.olusturanUserId) {
    userIds.add(siparis.olusturanUserId)
  }

  if (siparis.satisSiparisId) {
    const sale = await prisma.sale.findUnique({
      where: { id: siparis.satisSiparisId },
      select: { userId: true },
    })
    if (sale?.userId) userIds.add(sale.userId)
  }

  if (siparis.subeId) {
    const branch = await prisma.branch.findFirst({
      where: { code: siparis.subeId },
      select: { id: true },
    })
    if (branch) {
      const managers = await prisma.user.findMany({
        where: { branchId: branch.id, role: Role.STORE_MANAGER, isActive: true },
        select: { id: true },
      })
      managers.forEach((m) => userIds.add(m.id))
    }
  }

  return [...userIds]
}

async function sendSiparisDurumBildirimi(
  siparis: {
    id: string
    musteriAdi: string
    urunAdi: string
    olusturanUserId: string | null
    subeId: string | null
    satisSiparisId: string | null
  },
  yeniDurum: string,
  ozel?: { baslik?: string; mesaj?: string },
) {
  const alicilar = await findSiparisBildirimAlicilari(siparis)
  if (!alicilar.length) return

  await createBildirimler(alicilar, {
    baslik: ozel?.baslik ?? `Sipariş güncellendi — ${siparis.musteriAdi}`,
    mesaj: ozel?.mesaj ?? `${siparis.urunAdi} siparişi: ${ozelSiparisDurumLabel(yeniDurum)}`,
    link: `/admin/depo?tab=siparisler&siparisId=${siparis.id}`,
    tip: 'SIPARIS',
  })
}

export async function updateOzelSiparisDurum(
  id: string,
  input: {
    durum: string
    userId?: string | null
    tedarikciSiparisNo?: string
    notlar?: string
    gercekGelisTarihi?: string | Date | null
    teslimTarihi?: string | Date | null
    bildirimGonder?: boolean
    bildirimOzel?: { baslik?: string; mesaj?: string }
  },
) {
  const mevcut = await prisma.ozelSiparis.findUnique({ where: { id } })
  if (!mevcut) {
    throw new Error('Sipariş bulunamadı')
  }

  const yeniDurum = normalizeOzelSiparisDurum(input.durum)
  const eskiDurum = normalizeOzelSiparisDurum(mevcut.durum)

  if (!OZEL_SIPARIS_DURUM_SIRASI.includes(yeniDurum as (typeof OZEL_SIPARIS_DURUM_SIRASI)[number]) && yeniDurum !== 'IPTAL') {
    throw new Error(`Geçersiz durum: ${input.durum}`)
  }

  const data: Record<string, unknown> = { durum: yeniDurum }
  if (input.tedarikciSiparisNo !== undefined) data.tedarikciSiparisNo = input.tedarikciSiparisNo || null
  if (input.notlar !== undefined) data.notlar = input.notlar || null
  if (input.gercekGelisTarihi) data.gercekGelisTarihi = new Date(input.gercekGelisTarihi)
  if (input.teslimTarihi) data.teslimTarihi = new Date(input.teslimTarihi)
  if (yeniDurum === 'TESLIM_EDILDI' && !input.teslimTarihi) {
    data.teslimTarihi = new Date()
  }

  const [siparis] = await prisma.$transaction([
    prisma.ozelSiparis.update({ where: { id }, data: data as any }),
    prisma.ozelSiparisLog.create({
      data: {
        siparisId: id,
        eskiDurum: mevcut.durum,
        yeniDurum,
        userId: input.userId ?? null,
        notlar: input.notlar ?? null,
      },
    }),
  ])

  if (input.bildirimGonder !== false && eskiDurum !== yeniDurum) {
    await sendSiparisDurumBildirimi(siparis, yeniDurum, input.bildirimOzel)
  }

  return siparis
}

export async function kaydetOzelSiparisKarekodlar(input: {
  siparisId: string
  karekodlar: string[]
  tarayanUserId?: string | null
}) {
  const siparis = await prisma.ozelSiparis.findUnique({ where: { id: input.siparisId } })
  if (!siparis) throw new Error('Sipariş bulunamadı')

  const kodlar = [...new Set(input.karekodlar.map((k) => k.trim()).filter(Boolean))]
  if (!kodlar.length) throw new Error('En az bir karekod gerekli')

  await prisma.$transaction([
    ...kodlar.map((karekod) =>
      prisma.ozelSiparisKarekod.create({
        data: {
          siparisId: input.siparisId,
          karekod,
          tarayanUserId: input.tarayanUserId ?? null,
        },
      }),
    ),
  ])

  return updateOzelSiparisDurum(input.siparisId, {
    durum: 'TESLIM_ALINDI',
    userId: input.tarayanUserId,
    bildirimGonder: true,
  })
}

export async function listOzelSiparisKarekodlar(siparisId: string) {
  return prisma.ozelSiparisKarekod.findMany({
    where: { siparisId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function processLaboratuvarCron() {
  const since = new Date(Date.now() - 15 * 60 * 1000)
  const logs = await prisma.ozelSiparisLog.findMany({
    where: {
      yeniDurum: 'TESLIM_ALINDI',
      createdAt: { lte: since },
      siparis: { durum: 'TESLIM_ALINDI' },
    },
    include: { siparis: true },
    orderBy: { createdAt: 'asc' },
  })

  const processed = new Set<string>()
  let count = 0
  for (const log of logs) {
    if (processed.has(log.siparisId)) continue
    processed.add(log.siparisId)
    await updateOzelSiparisDurum(log.siparisId, {
      durum: 'LABORATUVARDA',
      userId: null,
      notlar: 'Otomatik: Teslim alındıktan 15 dk sonra',
      bildirimGonder: true,
    })
    count += 1
  }
  return count
}

type OdooLotRow = {
  id: number
  name: string
  ref?: string | false
  x_uts_kodu?: string | false
  product_id?: [number, string]
}

export async function eslestirKarekodOdoo(karekod: string, companyId?: number | null) {
  const kod = karekod.trim()
  if (!kod) return null
  const fields = ['id', 'name', 'ref', 'x_uts_kodu', 'product_id']
  const domains = [
    [['ref', '=', kod]],
    [['name', '=', kod]],
    [['x_uts_kodu', '=', kod]],
    [['ref', 'ilike', kod]],
  ]
  for (const domain of domains) {
    const lots = (await execute('stock.lot', 'search_read', [domain], { fields, limit: 1 }, companyId ?? undefined)) as OdooLotRow[]
    if (lots?.[0]) return lots[0]
  }
  return null
}

export async function getOzelSiparisStokGirisDetay(siparisId: string) {
  const siparis = await prisma.ozelSiparis.findUnique({ where: { id: siparisId } })
  if (!siparis) throw new Error('Sipariş bulunamadı')

  const karekodlar = await listOzelSiparisKarekodlar(siparisId)
  const eslestirmeler = await Promise.all(
    karekodlar.map(async (k) => {
      const lot = await eslestirKarekodOdoo(k.karekod, siparis.sirketId)
      return {
        ...k,
        lotAdi: lot?.name ?? null,
        utsKodu: (lot?.x_uts_kodu as string) || null,
        urunAdi: lot?.product_id?.[1] ?? null,
        odooLotId: lot?.id ?? null,
        odooProductId: lot?.product_id?.[0] ?? null,
      }
    }),
  )

  return { siparis, eslestirmeler }
}

const OZEL_SIPARIS_CIKIS_LOKASYON = 'ANADEPO'

type OzelSiparisTransferSonuc =
  | { success: true; yontem: 'sirket-ici'; transferId?: number; refNo?: string; odooPickingId?: number; pickingName?: string }
  | { success: true; yontem: 'sirketler-arasi'; transfer: SirketlerArasiTransferSonuc }
  | { success: false; message: string }

async function resolveLotIdInCompany(
  lotName: string,
  productId: number,
  companyId: number,
): Promise<number | undefined> {
  const lots = await execute(
    'stock.lot',
    'search_read',
    [[['name', '=', lotName], ['product_id', '=', productId]]],
    { fields: ['id'], limit: 1 },
    companyId,
  )
  return lots[0]?.id as number | undefined
}

async function runOzelSiparisStokTransfer(input: {
  siparis: { id: string; urunAdi: string; musteriAdi: string; subeId: string }
  kalemler: Array<{
    odooProductId: number
    lotAdi: string
    urunAdi: string | null
    odooLotId: number | null
  }>
  userId?: string | null
}): Promise<OzelSiparisTransferSonuc> {
  const { siparis, kalemler } = input
  const cikisLokasyon = OZEL_SIPARIS_CIKIS_LOKASYON
  const girisLokasyon = siparis.subeId

  const cikisSirket = getLokasyonSirket(cikisLokasyon)
  const girisSirket = getLokasyonSirket(girisLokasyon)
  if (!cikisSirket || !girisSirket) {
    return {
      success: false,
      message: `Lokasyon şirketi tanımsız: ${!cikisSirket ? cikisLokasyon : girisLokasyon}`,
    }
  }

  const kaynakId = await getLokasyonId(cikisLokasyon)
  const hedefId = await getLokasyonId(girisLokasyon)
  const kaynakSirketId = getCompanyIdFromLokasyon(cikisLokasyon)
  if (!kaynakId || !hedefId || !kaynakSirketId) {
    return { success: false, message: 'Transfer lokasyon/şirket bilgisi çözülemedi' }
  }

  const transferKalemler = []
  for (const kalem of kalemler) {
    let lotId = kalem.odooLotId ?? undefined
    if (kalem.lotAdi) {
      const kaynakLotId = await resolveLotIdInCompany(kalem.lotAdi, kalem.odooProductId, kaynakSirketId)
      if (kaynakLotId) lotId = kaynakLotId
    }
    transferKalemler.push({
      kaynak: kaynakId,
      hedef: hedefId,
      productId: kalem.odooProductId,
      resolvedProductId: kalem.odooProductId,
      miktar: 1,
      urunAdi: kalem.urunAdi ?? siparis.urunAdi,
      lotId,
    })
  }

  const result = await olusturTransfer({
    kalemler: transferKalemler,
    notlar: `OzelSiparis:${siparis.id} — ${siparis.musteriAdi} — ${siparis.urunAdi}`,
    hemenKabul: true,
  })

  if (!result.success) {
    return { success: false, message: result.message ?? 'Transfer başarısız' }
  }

  const row = result.transferler[0] as {
    tip?: string
    transferRef?: string
    pickingId?: number
    kabulPickingId?: number
    pickingName?: string
    fatura?: string
    alimFatura?: string
    hedefStokGirisi?: string
    stokHareketi?: string
    kalemSayisi?: number
    adimlar?: unknown[]
  } | undefined

  const pickingId = row?.kabulPickingId ?? row?.pickingId

  if (row?.tip === 'sirketler-arasi') {
    const transfer: SirketlerArasiTransferSonuc = {
      tip: 'sirketler-arasi',
      durum: 'basarili',
      transferRef: row.transferRef ?? `OZEL-${siparis.id}`,
      satisSiparisi: row.transferRef ?? `OZEL-${siparis.id}`,
      kalemSayisi: row.kalemSayisi ?? kalemler.length,
      fatura: row.fatura,
      alimFatura: row.alimFatura,
      hedefStokGirisi: row.hedefStokGirisi,
      stokHareketi: row.stokHareketi,
      kabulPickingId: row.kabulPickingId,
      adimlar: (row.adimlar as SirketlerArasiTransferSonuc['adimlar']) ?? [],
    }
    return { success: true, yontem: 'sirketler-arasi', transfer }
  }

  return {
    success: true,
    yontem: 'sirket-ici',
    transferId: pickingId,
    odooPickingId: pickingId,
    refNo: row?.pickingName ?? (pickingId ? String(pickingId) : undefined),
    pickingName: row?.pickingName,
  }
}

export async function stokaAlOzelSiparis(
  siparisId: string,
  input: { userId?: string | null; bekleyenFaturaId?: string },
) {
  const detay = await getOzelSiparisStokGirisDetay(siparisId)
  const { siparis, eslestirmeler } = detay

  if (siparis.durum !== 'TESLIM_ALINDI') {
    throw new Error('Sadece TESLIM_ALINDI siparişler stoka alınabilir')
  }
  if (!eslestirmeler.length) {
    throw new Error('Taranmış karekod bulunamadı')
  }
  if (!siparis.subeId) {
    throw new Error('Sipariş şube bilgisi eksik')
  }

  const eslesmeyen = eslestirmeler.filter((e) => !e.lotAdi || !e.odooProductId)
  if (eslesmeyen.length > 0) {
    throw new Error(`${eslesmeyen.length} karekod Odoo lot/ürün ile eşleşmedi — stok transferi yapılamaz`)
  }

  let transferSonuc: OzelSiparisTransferSonuc | null = null
  if (eslestirmeler.length > 0) {
    transferSonuc = await runOzelSiparisStokTransfer({
      siparis: {
        id: siparis.id,
        urunAdi: siparis.urunAdi,
        musteriAdi: siparis.musteriAdi,
        subeId: siparis.subeId,
      },
      kalemler: eslestirmeler.map((e) => ({
        odooProductId: e.odooProductId!,
        lotAdi: e.lotAdi!,
        urunAdi: e.urunAdi,
        odooLotId: e.odooLotId,
      })),
      userId: input.userId,
    })
    if (!transferSonuc.success) {
      throw new Error(transferSonuc.message)
    }
  }

  const anadepo = await prisma.branch.findFirst({ where: { code: 'ANADEPO' } })
  const utsKalemler = eslestirmeler
    .map((e) => ({
      barkod: (e.utsKodu || e.karekod).trim(),
      lotNo: e.lotAdi ?? undefined,
      seriNo: e.lotAdi ?? undefined,
      adet: 1,
    }))
    .filter((k) => k.barkod)

  let utsBildirimId: string | null = null
  if (anadepo && utsKalemler.length) {
    const bildirim = await prisma.utsBildirim.create({
      data: {
        tip: 'ALMA',
        branchId: anadepo.id,
        belgeNo: `OZEL-${siparis.id.slice(0, 8)}`,
        payload: { kaynak: 'OZEL_SIPARIS', siparisId },
        durum: 'BEKLIYOR',
        kalemler: {
          create: utsKalemler,
        },
      },
    })
    utsBildirimId = bildirim.id
  }

  if (input.bekleyenFaturaId) {
    await prisma.bekleyenFatura.update({
      where: { id: input.bekleyenFaturaId },
      data: { durum: 'ESLESTI', eslesmeTarihi: new Date(), notlar: `Özel sipariş: ${siparis.id}` },
    }).catch(() => undefined)
  }

  const updated = await updateOzelSiparisDurum(siparisId, {
    durum: 'HAZIR',
    userId: input.userId,
    bildirimGonder: true,
    bildirimOzel: {
      baslik: 'Siparişiniz hazır',
      mesaj: `${siparis.urunAdi} siparişiniz hazır — ${siparis.musteriAdi}`,
    },
  })

  return {
    data: updated,
    transfer: transferSonuc,
    utsBildirimId,
    eslestirmeler,
  }
}

export function parseOzelSiparisReceteNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = String(v).trim().replace(',', '.')
  if (!s) return null
  const n = Number(s.replace(/^\+/, ''))
  return Number.isFinite(n) ? n : null
}

export type CreateOzelSiparisInput = {
  musteriAdi?: string
  musteriTelefon?: string
  musteriId?: string
  satisSiparisId?: string
  saleItemId?: string
  subeId?: string
  subeAdi?: string
  sirketId?: number | string
  tip?: string
  urunAdi?: string
  urunKodu?: string
  miktar?: number | string
  sagSph?: unknown
  sagCyl?: unknown
  sagAks?: unknown
  sagAdd?: unknown
  sagPd?: unknown
  solSph?: unknown
  solCyl?: unknown
  solAks?: unknown
  solAdd?: unknown
  solPd?: unknown
  camTipi?: string
  camIndeksi?: string
  kaplama?: string
  cerceveBilgisi?: string
  tedarikciId?: number | string
  tedarikciAdi?: string
  tahminiMaliyet?: number | string
  satisFiyati?: number | string
  notlar?: string
  tahminiGelisTarihi?: string | Date
  olusturanKullanici?: string
  olcumBilgisi?: unknown
  satisTemsilcisi?: string
}

export type CreateOzelSiparisResult =
  | { success: true; data: Awaited<ReturnType<typeof prisma.ozelSiparis.create>>; zatenVar?: false }
  | {
      success: true
      zatenVar: true
      mevcutSiparis: Awaited<ReturnType<typeof prisma.ozelSiparis.create>>
      data: Awaited<ReturnType<typeof prisma.ozelSiparis.create>>
    }

/** Mevcut POST /admin/ozel-siparis-ekle mantığı — davranış değiştirilmedi */
export async function createOzelSiparis(
  input: CreateOzelSiparisInput,
  olusturanUserId?: string | null,
): Promise<CreateOzelSiparisResult> {
  const {
    musteriAdi, musteriTelefon, musteriId,
    satisSiparisId, saleItemId, subeId, subeAdi, sirketId,
    tip, urunAdi, urunKodu, miktar,
    sagSph, sagCyl, sagAks, sagAdd, sagPd,
    solSph, solCyl, solAks, solAdd, solPd,
    camTipi, camIndeksi, kaplama, cerceveBilgisi,
    tedarikciId, tedarikciAdi,
    tahminiMaliyet, satisFiyati,
    notlar, tahminiGelisTarihi, olusturanKullanici, olcumBilgisi, satisTemsilcisi,
  } = input

  if (!musteriAdi?.trim() || !urunAdi?.trim() || !tip) {
    throw new Error('musteriAdi, urunAdi, tip zorunlu')
  }

  if (saleItemId) {
    const mevcutKayitlar = await prisma.ozelSiparis.findMany({
      where: { saleItemId: String(saleItemId) },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    const mevcutAktif = mevcutKayitlar.find((s) => isOzelSiparisAktif(s.durum))
    if (mevcutAktif) {
      return {
        success: true,
        zatenVar: true,
        mevcutSiparis: mevcutAktif,
        data: mevcutAktif,
      }
    }
  }

  const siparis = await prisma.ozelSiparis.create({
    data: {
      musteriAdi,
      musteriTelefon,
      musteriId,
      satisSiparisId,
      saleItemId: saleItemId ? String(saleItemId) : null,
      subeId,
      subeAdi,
      sirketId: sirketId ? Number(sirketId) : null,
      tip,
      urunAdi,
      urunKodu,
      miktar: Number(miktar) || 1,
      sagSph: parseOzelSiparisReceteNum(sagSph),
      sagCyl: parseOzelSiparisReceteNum(sagCyl),
      sagAks: parseOzelSiparisReceteNum(sagAks),
      sagAdd: parseOzelSiparisReceteNum(sagAdd),
      sagPd: parseOzelSiparisReceteNum(sagPd),
      solSph: parseOzelSiparisReceteNum(solSph),
      solCyl: parseOzelSiparisReceteNum(solCyl),
      solAks: parseOzelSiparisReceteNum(solAks),
      solAdd: parseOzelSiparisReceteNum(solAdd),
      solPd: parseOzelSiparisReceteNum(solPd),
      camTipi,
      camIndeksi,
      kaplama,
      cerceveBilgisi,
      tedarikciId: tedarikciId ? Number(tedarikciId) : null,
      tedarikciAdi,
      tahminiMaliyet: tahminiMaliyet ? Number(tahminiMaliyet) : null,
      satisFiyati: satisFiyati ? Number(satisFiyati) : null,
      notlar,
      olusturanKullanici,
      olusturanUserId: olusturanUserId ?? undefined,
      olcumBilgisi: olcumBilgisi ?? undefined,
      satisTemsilcisi: satisTemsilcisi ?? undefined,
      tahminiGelisTarihi: tahminiGelisTarihi ? new Date(tahminiGelisTarihi) : null,
    },
  })

  return { success: true, data: siparis }
}
