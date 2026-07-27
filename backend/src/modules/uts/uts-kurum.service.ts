import { prisma } from '../../database/prisma';
import { LOKASYON_ID_MAP } from '../odoo/odooLocations';

const LOCATION_ID_TO_BRANCH_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(LOKASYON_ID_MAP).map(([code, id]) => [id, code]),
);

function normalizeSubeKodu(subeKodu: string): string {
  return String(subeKodu ?? '').trim().toUpperCase();
}

/** Branch.code (örn. GVN1) üzerinden UtsSube.kurumNo döner */
export async function getUtsKurumNo(subeKodu: string): Promise<string | null> {
  const code = normalizeSubeKodu(subeKodu);
  if (!code) return null;

  const branch = await prisma.branch.findFirst({
    where: { code: { equals: code, mode: 'insensitive' } },
    include: { utsSube: true },
  });

  const kurumNo = branch?.utsSube?.kurumNo?.trim();
  return kurumNo || null;
}

/** Odoo stock.location id → Branch.odooLocationId veya LOKASYON_ID_MAP fallback */
export async function getUtsKurumNoByOdooLocationId(locationId: number): Promise<string | null> {
  const branch = await prisma.branch.findFirst({
    where: { odooLocationId: locationId },
    include: { utsSube: true },
  });
  if (branch) {
    const kurumNo = branch.utsSube?.kurumNo?.trim();
    return kurumNo || null;
  }

  const branchCode = LOCATION_ID_TO_BRANCH_CODE[locationId];
  if (branchCode) return getUtsKurumNo(branchCode);
  return null;
}

export async function getBranchCodeByOdooLocationId(locationId: number): Promise<string | null> {
  const branch = await prisma.branch.findFirst({
    where: { odooLocationId: locationId },
    select: { code: true },
  });
  if (branch?.code) return branch.code.toUpperCase();

  return LOCATION_ID_TO_BRANCH_CODE[locationId] ?? null;
}
