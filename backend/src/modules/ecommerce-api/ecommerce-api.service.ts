import { prisma } from '../../database/prisma';
import {
  listExternalCatalogProducts,
  listExternalStock,
} from '../admin/stok-yonetimi.service';

let branchNameCache: Map<string, string> | null = null;
let branchNameCacheAt = 0;
const BRANCH_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getBranchNameMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (branchNameCache && now - branchNameCacheAt < BRANCH_CACHE_TTL_MS) {
    return branchNameCache;
  }

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { code: true, name: true },
  });
  branchNameCache = new Map(branches.map((b) => [b.code.toUpperCase(), b.name]));
  branchNameCacheAt = now;
  return branchNameCache;
}

export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number.parseInt(String(query.pageSize ?? '100'), 10) || 100),
  );
  return { page, pageSize };
}

export async function getExternalProducts(query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  return listExternalCatalogProducts({ page, pageSize });
}

export async function getExternalStock(query: Record<string, unknown>) {
  const { page, pageSize } = parsePagination(query);
  const barkod = typeof query.barkod === 'string' ? query.barkod : undefined;
  const branchNameMap = await getBranchNameMap();
  return listExternalStock({ page, pageSize, barkod, branchNameMap });
}
