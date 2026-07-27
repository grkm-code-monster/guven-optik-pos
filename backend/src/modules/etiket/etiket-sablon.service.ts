import { prisma } from '../../database/prisma';
import type { Prisma } from '@prisma/client';

export async function listSablonlar(kategori?: string) {
  const where: Prisma.EtiketSablonuWhereInput = { aktif: true };
  if (kategori) where.kategori = kategori;
  return prisma.etiketSablonu.findMany({
    where,
    orderBy: [{ kategori: 'asc' }, { ad: 'asc' }],
  });
}

export async function getSablon(id: string) {
  return prisma.etiketSablonu.findUnique({ where: { id } });
}

export async function getSablonBySlug(slug: string) {
  return prisma.etiketSablonu.findUnique({ where: { slug } });
}

export async function createSablon(data: {
  ad: string;
  kategori: string;
  elemanlar: unknown;
  etiketGenislik: number;
  etiketYukseklik: number;
  slug?: string;
}) {
  return prisma.etiketSablonu.create({
    data: {
      ad: data.ad,
      slug: data.slug,
      kategori: data.kategori,
      elemanlar: data.elemanlar as Prisma.InputJsonValue,
      etiketGenislik: data.etiketGenislik,
      etiketYukseklik: data.etiketYukseklik,
    },
  });
}

export async function upsertSablonBySlug(data: {
  ad: string;
  slug: string;
  kategori: string;
  elemanlar: unknown;
  etiketGenislik: number;
  etiketYukseklik: number;
}) {
  const existing = await prisma.etiketSablonu.findUnique({ where: { slug: data.slug } });
  if (existing) {
    return prisma.etiketSablonu.update({
      where: { slug: data.slug },
      data: {
        ad: data.ad,
        kategori: data.kategori,
        elemanlar: data.elemanlar as Prisma.InputJsonValue,
        etiketGenislik: data.etiketGenislik,
        etiketYukseklik: data.etiketYukseklik,
        aktif: true,
      },
    });
  }
  return createSablon(data);
}

export async function updateSablon(
  id: string,
  data: Partial<{
    ad: string;
    kategori: string;
    elemanlar: unknown;
    etiketGenislik: number;
    etiketYukseklik: number;
    aktif: boolean;
  }>,
) {
  const update: Prisma.EtiketSablonuUpdateInput = {};
  if (data.ad != null) update.ad = data.ad;
  if (data.kategori != null) update.kategori = data.kategori;
  if (data.elemanlar != null) update.elemanlar = data.elemanlar as Prisma.InputJsonValue;
  if (data.etiketGenislik != null) update.etiketGenislik = data.etiketGenislik;
  if (data.etiketYukseklik != null) update.etiketYukseklik = data.etiketYukseklik;
  if (data.aktif != null) update.aktif = data.aktif;
  return prisma.etiketSablonu.update({ where: { id }, data: update });
}

export async function deleteSablon(id: string) {
  return prisma.etiketSablonu.update({
    where: { id },
    data: { aktif: false },
  });
}
