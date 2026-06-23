import { prisma } from '../../database/prisma'

export type BildirimTip = 'SIPARIS' | 'FIYAT' | 'TRANSFER' | 'GENEL'

export async function createBildirim(input: {
  userId: string
  baslik: string
  mesaj: string
  link?: string | null
  tip?: BildirimTip
}) {
  return prisma.bildirim.create({
    data: {
      userId: input.userId,
      baslik: input.baslik,
      mesaj: input.mesaj,
      link: input.link ?? null,
      tip: input.tip ?? 'GENEL',
    },
  })
}

export async function createBildirimler(
  userIds: string[],
  input: Omit<Parameters<typeof createBildirim>[0], 'userId'>,
) {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return []
  return prisma.$transaction(
    unique.map((userId) =>
      prisma.bildirim.create({
        data: {
          userId,
          baslik: input.baslik,
          mesaj: input.mesaj,
          link: input.link ?? null,
          tip: input.tip ?? 'GENEL',
        },
      }),
    ),
  )
}

export async function listBildirimler(userId: string, okundu?: boolean) {
  return prisma.bildirim.findMany({
    where: {
      userId,
      ...(okundu !== undefined ? { okundu } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function bildirimSayac(userId: string) {
  return prisma.bildirim.count({ where: { userId, okundu: false } })
}

export async function bildirimOkundu(id: string, userId: string) {
  const row = await prisma.bildirim.findFirst({ where: { id, userId } })
  if (!row) return null
  return prisma.bildirim.update({ where: { id }, data: { okundu: true } })
}

export async function bildirimleriOkunduIsaretle(userId: string) {
  const result = await prisma.bildirim.updateMany({
    where: { userId, okundu: false },
    data: { okundu: true },
  })
  return result.count
}
