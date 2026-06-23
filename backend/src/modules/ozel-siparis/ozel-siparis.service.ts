import { Role } from '@prisma/client'
import { prisma } from '../../database/prisma'
import { createBildirimler } from '../bildirim/bildirim.service'
import { execute } from '../odoo/odoo.service'
import { createTransfer } from '../transfer/transfer.service'
import {
  normalizeOzelSiparisDurum,
  ozelSiparisDurumLabel,
  OZEL_SIPARIS_DURUM_SIRASI,
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

  const transferUrunler = eslestirmeler
    .filter((e) => e.lotAdi && e.odooProductId)
    .map((e) => ({
      id: String(e.odooProductId),
      ad: e.urunAdi ?? siparis.urunAdi,
      adet: 1,
      lotNo: e.lotAdi!,
    }))

  let transferSonuc: { success?: boolean; pickingName?: string; message?: string } | null = null
  if (transferUrunler.length) {
    transferSonuc = await createTransfer({
      cikisLokasyon: 'ANADEPO',
      girisLokasyon: siparis.subeId,
      tarih: new Date().toISOString().slice(0, 10),
      referans: `OzelSiparis:${siparis.id}`,
      personel: input.userId ?? 'DYSE',
      not: `${siparis.musteriAdi} — ${siparis.urunAdi}`,
      urunler: transferUrunler,
    })
    if (transferSonuc && transferSonuc.success === false) {
      throw new Error(transferSonuc.message ?? 'Odoo transfer başarısız')
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
