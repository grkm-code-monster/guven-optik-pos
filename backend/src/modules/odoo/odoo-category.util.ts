import { execute } from './odoo.service';

export type OdooCategoryRow = {
  id: number;
  name: string;
  complete_name: string;
  parent_id: false | [number, string];
};

export class OdooCategoryMatchError extends Error {
  readonly code = 'category-ambiguous' as const;

  constructor(
    message: string,
    readonly candidates: OdooCategoryRow[],
  ) {
    super(message);
    this.name = 'OdooCategoryMatchError';
  }
}

export type KategoriAdaySatir = { id: number; completeName: string };

export function mapCategoryCandidates(candidates: OdooCategoryRow[]): KategoriAdaySatir[] {
  return candidates.map((c) => ({ id: c.id, completeName: c.complete_name }));
}

export function formatCategoryCandidatesMessage(candidates: OdooCategoryRow[]): string {
  if (!candidates.length) return '';
  const list = candidates.map((c) => `#${c.id} ${c.complete_name}`).join('; ');
  return ` Olası kategoriler: ${list} — hangisi doğruysa Excel'e tam yolunu yazın.`;
}

function m2oId(v: unknown): number | null {
  if (Array.isArray(v) && v.length) return Number(v[0]) || null;
  if (typeof v === 'number') return v;
  return null;
}

/** Boşluk, büyük/küçük harf ve Türkçe karakter farklarını yok sayar */
export function normalizeCategoryLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function leafCategoryLabel(completeName: string): string {
  const parts = completeName.split('/').map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? completeName.trim();
}

function sameParent(row: OdooCategoryRow, parentId?: number | null): boolean {
  if (parentId == null || parentId <= 0) return true;
  return m2oId(row.parent_id) === parentId;
}

function uniqueById(rows: OdooCategoryRow[]): OdooCategoryRow[] {
  const map = new Map<number, OdooCategoryRow>();
  for (const row of rows) map.set(row.id, row);
  return [...map.values()];
}

async function loadAllCategories(): Promise<OdooCategoryRow[]> {
  return (await execute(
    'product.category',
    'search_read',
    [[]],
    { fields: ['id', 'name', 'complete_name', 'parent_id'], limit: 5000, order: 'complete_name asc' },
  )) as OdooCategoryRow[];
}

async function exactMatches(trimmed: string, parentId?: number | null): Promise<OdooCategoryRow[]> {
  const found: OdooCategoryRow[] = [];

  const byName = (await execute(
    'product.category',
    'search_read',
    [[['name', '=', trimmed]]],
    { fields: ['id', 'name', 'complete_name', 'parent_id'], limit: 20 },
  )) as OdooCategoryRow[];
  found.push(...byName);

  if (trimmed.includes('/')) {
    const byPath = (await execute(
      'product.category',
      'search_read',
      [[['complete_name', '=', trimmed]]],
      { fields: ['id', 'name', 'complete_name', 'parent_id'], limit: 20 },
    )) as OdooCategoryRow[];
    found.push(...byPath);
  }

  return uniqueById(found).filter((row) => sameParent(row, parentId));
}

function normalizedMatches(
  trimmed: string,
  allCategories: OdooCategoryRow[],
  parentId?: number | null,
): OdooCategoryRow[] {
  const normInput = normalizeCategoryLabel(trimmed);
  if (!normInput) return [];

  return uniqueById(
    allCategories.filter((row) => {
      if (!sameParent(row, parentId)) return false;
      const labels = [
        row.name,
        row.complete_name,
        leafCategoryLabel(row.complete_name),
      ];
      return labels.some((label) => normalizeCategoryLabel(label) === normInput);
    }),
  );
}

export async function findExistingCategoryMatch(
  rawName: string,
  opts?: { parentId?: number | null },
): Promise<{
  matchType: 'none' | 'exact' | 'normalized' | 'ambiguous';
  match: OdooCategoryRow | null;
  candidates: OdooCategoryRow[];
}> {
  const trimmed = rawName?.trim() ?? '';
  if (!trimmed) {
    return { matchType: 'none', match: null, candidates: [] };
  }

  const exact = await exactMatches(trimmed, opts?.parentId);
  if (exact.length === 1) {
    return { matchType: 'exact', match: exact[0], candidates: exact };
  }
  if (exact.length > 1) {
    const normInput = normalizeCategoryLabel(trimmed);
    const allSameComplete = exact.every(
      (row) => normalizeCategoryLabel(row.complete_name)
        === normalizeCategoryLabel(exact[0].complete_name),
    );
    const inputMatchesFullPath = trimmed.includes('/')
      && exact.some((row) => normalizeCategoryLabel(row.complete_name) === normInput);
    if (allSameComplete && inputMatchesFullPath) {
      const chosen = [...exact].sort((a, b) => a.id - b.id)[0];
      console.warn(
        `[odoo-category] Yinelenen kategori kayıtları (${exact.map((c) => `#${c.id}`).join(', ')}) — `
        + `tam yol eşleşmesi ile #${chosen.id} kullanılıyor`,
      );
      return { matchType: 'exact', match: chosen, candidates: exact };
    }
    return { matchType: 'ambiguous', match: null, candidates: exact };
  }

  const allCategories = await loadAllCategories();
  const normalized = normalizedMatches(trimmed, allCategories, opts?.parentId);
  if (normalized.length === 1) {
    return { matchType: 'normalized', match: normalized[0], candidates: normalized };
  }
  if (normalized.length > 1) {
    return { matchType: 'ambiguous', match: null, candidates: normalized };
  }

  return { matchType: 'none', match: null, candidates: [] };
}

/** Otomatik akışlar: tam → normalize → yoksa oluştur; belirsizse hata */
export async function resolveOrCreateCategoryId(
  rawName: string,
  opts?: { parentId?: number | null },
): Promise<{ id: number; matchType: 'exact' | 'normalized' | 'created'; category: OdooCategoryRow | null }> {
  const trimmed = rawName?.trim() ?? '';
  if (!trimmed) {
    throw new Error('Kategori adı zorunlu');
  }

  const result = await findExistingCategoryMatch(trimmed, opts);
  if (result.matchType === 'ambiguous') {
    throw new OdooCategoryMatchError(
      'Kategori adı birden fazla olası eşleşmeye sahip, tam adını netleştirin.',
      result.candidates,
    );
  }
  if (result.match) {
    return {
      id: result.match.id,
      matchType: result.matchType === 'exact' ? 'exact' : 'normalized',
      category: result.match,
    };
  }

  const data: Record<string, unknown> = { name: trimmed };
  if (opts?.parentId != null && opts.parentId > 0) data.parent_id = opts.parentId;

  const id = Number(await execute('product.category', 'create', [data]));
  return { id, matchType: 'created', category: null };
}
