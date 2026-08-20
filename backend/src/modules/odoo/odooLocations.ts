/** Frontend lokasyon kodu → Odoo stock.location numeric id */
export const LOKASYON_ID_MAP: Record<string, number> = {
  GVN1: 53,
  GVN3: 54,
  GVN4: 55,
  GVN6: 56,
  GVN8: 57,
  GVN9: 58,
  GVN2: 59,
  GVN10: 60,
  ANADEPO: 61,
  GVN5: 62,
  GVN7: 64,
  ETICARET: 65,
  GVNP: 66,
};

/** Frontend lokasyon → şirket */
export const LOKASYON_SIRKET: Record<string, string> = {
  GVN1: 'ADESE',
  GVN3: 'ADESE',
  GVN4: 'ADESE',
  GVN6: 'ADESE',
  GVN8: 'ADESE',
  GVN9: 'ADESE',
  GVN2: 'NG',
  GVN10: 'NG',
  ANADEPO: 'NG',
  GVN5: 'POTENTIAL',
  GVN7: 'NG',
  ETICARET: 'NG',
  GVNP: 'ADESE',
};

export const LOKASYON_MAP: Record<string, string> = {
  GVN1: 'GVN1',
  GVN2: 'GVN2',
  GVN3: 'GVN3',
  GVN4: 'GVN4',
  GVN5: 'GVN5',
  GVN6: 'GVN6',
  GVN8: 'GVN8',
  GVN9: 'GVN9',
  GVN10: 'GVN10',
  ANADEPO: 'ANADEPO',
  GVN7: 'GVN7',
  ETICARET: 'ETICARET',
  GVNP: 'GVNP',
};

/** Şirket adı → Odoo res.company id */
export const SIRKET_COMPANY_ID: Record<string, number> = {
  ADESE: 3,
  NG: 2,
  POTENTIAL: 4,
};

/** Şirket → ana depo (stock.location id) */
export const SIRKET_ANADEPO_MAP: Record<number, number> = {
  1: 8,   // GÜVEN OPTİK → WH/Stok
  2: 61,  // NG → NG/Stok/ANA-DEPO
  3: 32,  // ADESE → ADESE/Stok
  4: 42,  // POTENTIAL → POTEN/Stok
};

export function getAnaDepoLocationId(companyId: number): number {
  return SIRKET_ANADEPO_MAP[companyId] ?? SIRKET_ANADEPO_MAP[1];
}

const BRANCH_CODE_ALIASES: Record<string, string> = {
  PILOT01: 'GVN1',
};

function normalizeKey(kodu: string): string {
  return String(kodu ?? '').trim().toUpperCase();
}

export function frontendToOdooLokasyonName(frontendId: string): string {
  const key = String(frontendId ?? '').trim();
  if (!key) return key;
  return LOKASYON_MAP[key] ?? LOKASYON_MAP[normalizeKey(key)] ?? key;
}

export function getLokasyonSirket(lokasyonId: string): string | null {
  const key = String(lokasyonId ?? '').trim();
  return LOKASYON_SIRKET[key] ?? LOKASYON_SIRKET[normalizeKey(key)] ?? null;
}

export function getCompanyIdFromLokasyon(lokasyonId: string): number | null {
  const sirket = getLokasyonSirket(lokasyonId);
  if (!sirket) return null;
  return SIRKET_COMPANY_ID[sirket] ?? null;
}

export function getCompanyIdFromBranchCode(branchCode: string): number {
  const key = normalizeKey(branchCode);
  const fromCode = getCompanyIdFromLokasyon(key);
  if (fromCode != null) return fromCode;
  const alias = BRANCH_CODE_ALIASES[key];
  if (alias) {
    const fromAlias = getCompanyIdFromLokasyon(alias);
    if (fromAlias != null) return fromAlias;
  }
  return SIRKET_COMPANY_ID.ADESE;
}

export function resolveBranchStockLocationId(branchCode: string): number {
  const key = normalizeKey(branchCode);
  const fromMap = LOKASYON_ID_MAP[key];
  if (fromMap != null) return fromMap;
  return getAnaDepoLocationId(getCompanyIdFromBranchCode(branchCode));
}

export function getLokasyonMap(_force = false): Promise<Record<string, number>> {
  return Promise.resolve({ ...LOKASYON_ID_MAP });
}

export async function getLokasyonId(lokasyonKodu: string): Promise<number | null> {
  const key = String(lokasyonKodu ?? '').trim();
  if (!key) return null;
  const id = LOKASYON_ID_MAP[key] ?? LOKASYON_ID_MAP[normalizeKey(key)];
  return id ?? null;
}

export function clearLokasyonCache(): void {
  // Sabit map — cache yok
}
