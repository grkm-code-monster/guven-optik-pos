import { prisma } from '../../database/prisma';

const ODOO_SKIP_IDS = new Set([1, 5]); // Administrator, Fatma Nazlı (manuel hariç)

export function branchCodeFromOdooDepartment(deptName: string | null | undefined): string | null {
  if (!deptName) return null;
  const magaza = deptName.match(/GVN(\d+)\s*Mağaza/i);
  if (magaza) return `GVN${magaza[1]}`;
  if (/Ana\s*Depo/i.test(deptName)) return 'ANADEPO';
  return null;
}

export function normalizePersonName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '');
}

export function personelMatchesOdooName(
  personel: { ad: string; soyad: string },
  odooName: string,
): boolean {
  const on = normalizePersonName(odooName);
  const pn = normalizePersonName(`${personel.ad}${personel.soyad}`);
  const pnRev = normalizePersonName(`${personel.soyad}${personel.ad}`);
  if (pn === on || pnRev === on) return true;
  const first = normalizePersonName(personel.ad.split(/\s+/)[0] ?? personel.ad);
  const last = normalizePersonName(personel.soyad);
  return on.includes(first) && on.includes(last);
}

export async function branchInfoByCode(code: string): Promise<{ id: string; code: string; name: string } | null> {
  return prisma.branch.findFirst({
    where: { code: { equals: code, mode: 'insensitive' } },
    select: { id: true, code: true, name: true },
  });
}

export async function syncPersonelSubeFromBranchCode(
  personelId: string,
  branchCode: string,
): Promise<{ subeId: string; subeAdi: string } | null> {
  const branch = await branchInfoByCode(branchCode);
  if (!branch) return null;
  await prisma.personel.update({
    where: { id: personelId },
    data: { subeId: branch.code, subeAdi: branch.name },
  });
  return { subeId: branch.code, subeAdi: branch.name };
}

export async function syncPersonelSubeFromUserId(personelId: string, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { branch: { select: { code: true, name: true } } },
  });
  if (!user?.branch) return false;
  await prisma.personel.update({
    where: { id: personelId },
    data: { subeId: user.branch.code, subeAdi: user.branch.name },
  });
  return true;
}

export async function findPersonelLinkedToUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { personelId: true },
  });
  if (user?.personelId) {
    return prisma.personel.findUnique({ where: { id: user.personelId } });
  }
  return prisma.personel.findFirst({ where: { userId } });
}

export async function syncOdooEmployeeIdFromPersonel(
  personelId: string,
  odooEmployeeId: number,
): Promise<void> {
  const personel = await prisma.personel.findUnique({
    where: { id: personelId },
    select: { userId: true },
  });
  if (!personel) throw new Error('Personel bulunamadı');

  await prisma.$transaction([
    prisma.personel.update({
      where: { id: personelId },
      data: { odooEmployeeId },
    }),
    ...(personel.userId
      ? [
          prisma.user.update({
            where: { id: personel.userId },
            data: { odooEmployeeId },
          }),
        ]
      : []),
  ]);
}

export async function syncOdooEmployeeIdFromUser(
  userId: string,
  odooEmployeeId: number,
): Promise<{ personelSynced: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { personelId: true },
  });
  const personel = await findPersonelLinkedToUser(userId);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        odooEmployeeId,
        ...(personel && !user?.personelId ? { personelId: personel.id } : {}),
      },
    }),
    ...(personel
      ? [
          prisma.personel.update({
            where: { id: personel.id },
            data: {
              odooEmployeeId,
              ...(personel.userId ? {} : { userId }),
            },
          }),
        ]
      : []),
  ]);

  return { personelSynced: !!personel };
}

export async function syncEkYetkilerFromPersonel(
  personelId: string,
  ekYetkiler: string[],
): Promise<void> {
  const personel = await prisma.personel.findUnique({
    where: { id: personelId },
    select: { userId: true },
  });
  if (!personel) throw new Error('Personel bulunamadı');

  await prisma.$transaction([
    prisma.personel.update({
      where: { id: personelId },
      data: { ekYetkiler },
    }),
    ...(personel.userId
      ? [
          prisma.user.update({
            where: { id: personel.userId },
            data: { ekYetkiler },
          }),
        ]
      : []),
  ]);
}

export { ODOO_SKIP_IDS };
