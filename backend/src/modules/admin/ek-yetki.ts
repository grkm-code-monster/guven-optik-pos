import { Role } from '@prisma/client';
import type { JwtPayload } from '../auth/auth.types';

/** Kanonik ek yetki anahtarları (Adım 1 onaylı) */
export const EK_YETKI = {
  TANIMLAMALAR: 'TANIMLAMALAR',
  KAMPANYALAR: 'KAMPANYALAR',
  DEPO_YONETIMI: 'DEPO_YONETIMI',
  DEPO_STOK: 'DEPO_STOK',
  DEPO_TRANSFER: 'DEPO_TRANSFER',
  DEPO_SAYIM: 'DEPO_SAYIM',
  DEPO_ALIM_IADE: 'DEPO_ALIM_IADE',
  DEPO_URUN_GIRIS: 'DEPO_URUN_GIRIS',
  DEPO_EXCEL_ENVANTER: 'DEPO_EXCEL_ENVANTER',
  DEPO_SIPARIS: 'DEPO_SIPARIS',
  STOK_YONETIMI: 'STOK_YONETIMI',
  ETIKET_TASARIMCI: 'ETIKET_TASARIMCI',
  URUN_YAPILANDIRMA: 'URUN_YAPILANDIRMA',
  GARANTI_IADE: 'GARANTI_IADE',
  UTS_YONETIMI: 'UTS_YONETIMI',
  MUHASEBE: 'MUHASEBE',
  FINANS: 'FINANS',
  IK_PRIM: 'IK_PRIM',
  PATRON_PANELI: 'PATRON_PANELI',
} as const;

export type EkYetkiKey = (typeof EK_YETKI)[keyof typeof EK_YETKI];

/** İK & Prim'den seçilebilir anahtarlar (PATRON/RAPOR_MATRIS rol bazlı kalır) */
export const EK_YETKI_SECILEBILIR: EkYetkiKey[] = Object.values(EK_YETKI);

export const EK_YETKI_LIST: EkYetkiKey[] = [...EK_YETKI_SECILEBILIR];

const SECILEMEZ = new Set(['PATRON', 'RAPOR_MATRIS']);

export function filterSecilebilirEkYetkiler(keys: string[]): EkYetkiKey[] {
  return keys.filter(
    (k): k is EkYetkiKey =>
      !SECILEMEZ.has(k) && (EK_YETKI_SECILEBILIR as readonly string[]).includes(k),
  );
}

export const POS_ROLES: Role[] = [
  Role.SALES_STAFF,
  Role.STORE_MANAGER,
  Role.WAREHOUSE_MANAGER,
  Role.REGIONAL_MANAGER,
  Role.ADMIN,
];

const DEPO_KEYS: EkYetkiKey[] = [
  EK_YETKI.DEPO_YONETIMI,
  EK_YETKI.DEPO_STOK,
  EK_YETKI.DEPO_TRANSFER,
  EK_YETKI.DEPO_SAYIM,
  EK_YETKI.DEPO_ALIM_IADE,
  EK_YETKI.DEPO_URUN_GIRIS,
  EK_YETKI.DEPO_EXCEL_ENVANTER,
  EK_YETKI.DEPO_SIPARIS,
];

/** Depo formları için ortak okuma uçları — herhangi bir depo yetkisi yeterli */
const DEPO_YARDIMCI_KEYS = DEPO_KEYS;

type RouteAccessRule = {
  test: (path: string) => boolean;
  yetkiler: EkYetkiKey[];
  roles: Role[];
};

function prefix(path: string, p: string): boolean {
  return path === p || path.startsWith(`${p}/`);
}

const ADMIN_ROUTE_RULES: RouteAccessRule[] = [
  // ── Depo: Sipariş ──
  {
    test: (p) => p.startsWith('/ozel-siparis'),
    yetkiler: [EK_YETKI.DEPO_SIPARIS],
    roles: POS_ROLES,
  },
  // ── Depo: Transfer ──
  {
    test: (p) => p.startsWith('/transfer-'),
    yetkiler: [EK_YETKI.DEPO_TRANSFER],
    roles: POS_ROLES,
  },
  // ── Depo: Sayım ──
  {
    test: (p) => p === '/stock-adjustment',
    yetkiler: [EK_YETKI.DEPO_SAYIM],
    roles: [Role.ADMIN, Role.WAREHOUSE_MANAGER],
  },
  // ── Depo: Stok okuma ──
  {
    test: (p) =>
      p === '/stock' ||
      p === '/lokasyon-stok' ||
      p === '/stok-kontrol-urun' ||
      p === '/lot-ara',
    yetkiler: [EK_YETKI.DEPO_STOK],
    roles: POS_ROLES,
  },
  // ── Depo: Alım & İade ──
  {
    test: (p) =>
      p === '/satin-alma-faturalari' ||
      p === '/fatura-islendi' ||
      p === '/irsaliye-olustur' ||
      p.startsWith('/bekleyen-fatura'),
    yetkiler: [EK_YETKI.DEPO_ALIM_IADE],
    roles: [Role.ADMIN],
  },
  // ── Depo: Ürün girişi ──
  {
    test: (p) =>
      p === '/urun-giris' ||
      p === '/urun-ara' ||
      p === '/urun-olustur' ||
      p === '/urun-tracking-guncelle' ||
      p === '/urun-id-kontrol' ||
      prefix(p, '/urun-varyanlar') ||
      p.startsWith('/cari-') ||
      p === '/kategori-listesi' ||
      p.startsWith('/nitelik-') ||
      p === '/doviz-kuru' ||
      p === '/satis-fiyati-guncelle' ||
      p === '/sirket-listesi' ||
      p === '/uretici-ara' ||
      p === '/test-sirket-auth' ||
      p === '/lokasyon-sirket-harita',
    yetkiler: [EK_YETKI.DEPO_URUN_GIRIS, EK_YETKI.URUN_YAPILANDIRMA],
    roles: [Role.ADMIN],
  },
  // ── Depo: Excel envanter ──
  {
    test: (p) => prefix(p, '/envanter-import'),
    yetkiler: [EK_YETKI.DEPO_EXCEL_ENVANTER],
    roles: [Role.ADMIN],
  },
  // ── Depo yardımcı (şube listesi vb.) ──
  {
    test: (p) => p === '/branches' || p === '/branch-list',
    yetkiler: DEPO_YARDIMCI_KEYS,
    roles: POS_ROLES,
  },
  // ── Stok yönetimi ──
  {
    test: (p) => prefix(p, '/fiyat-degisiklikleri'),
    yetkiler: [EK_YETKI.STOK_YONETIMI],
    roles: [Role.ADMIN, Role.STORE_MANAGER, Role.REGIONAL_MANAGER],
  },
  {
    test: (p) => p.match(/^\/stok-urun\/\d+\/lotlar$/) != null,
    yetkiler: [EK_YETKI.STOK_YONETIMI],
    roles: [Role.ADMIN, Role.WAREHOUSE_MANAGER, Role.STORE_MANAGER, Role.REGIONAL_MANAGER],
  },
  {
    test: (p) =>
      p.startsWith('/stok-urun') ||
      p.startsWith('/stok-fiyat') ||
      p === '/stok-kontrol' ||
      p.startsWith('/stok-kontrol/') ||
      p.startsWith('/odoo-kategori') ||
      p.startsWith('/odoo-nitelik') ||
      p.startsWith('/odoo-sablon') ||
      prefix(p, '/odoo-attr-lines') ||
      prefix(p, '/odoo-temizle-attr-lines') ||
      p.startsWith('/odoo-varyant') ||
      p === '/varyant-lot-bilgisi' ||
      prefix(p, '/varyant-lot-bilgisi/'),
    yetkiler: [EK_YETKI.STOK_YONETIMI, EK_YETKI.URUN_YAPILANDIRMA],
    roles: [Role.ADMIN, Role.WAREHOUSE_MANAGER],
  },
  // ── Tanımlamalar ──
  {
    test: (p) =>
      prefix(p, '/banks') ||
      prefix(p, '/users') ||
      p === '/users-sync' ||
      p === '/branch' ||
      prefix(p, '/branch/') ||
      p === '/sirket-ayar' ||
      prefix(p, '/sirket-ayar/') ||
      p === '/employees' ||
      p === '/departments' ||
      p === '/odoo-users' ||
      p === '/odoo-employees' ||
      p === '/pdks-places' ||
      p === '/sync-logs' ||
      p === '/sync-errors' ||
      prefix(p, '/sync-retry') ||
      prefix(p, '/sync-override') ||
      p === '/dis-musteri-transfer' ||
      prefix(p, '/eticaret'),
    yetkiler: [EK_YETKI.TANIMLAMALAR],
    roles: [Role.ADMIN],
  },
  // ── Kampanyalar ──
  {
    test: (p) => prefix(p, '/campaigns'),
    yetkiler: [EK_YETKI.KAMPANYALAR],
    roles: [Role.ADMIN],
  },
  // ── UTS ──
  {
    test: (p) => prefix(p, '/uts'),
    yetkiler: [EK_YETKI.UTS_YONETIMI],
    roles: [Role.ADMIN],
  },
  // ── Muhasebe ──
  {
    test: (p) => p.startsWith('/muhasebe') || p === '/muhasebe-kurulum',
    yetkiler: [EK_YETKI.MUHASEBE],
    roles: [Role.ADMIN],
  },
  // ── Finans ──
  {
    test: (p) =>
      p.startsWith('/finans') ||
      p.startsWith('/ortak') ||
      p === '/ortaklar' ||
      p === '/ortak-ekle' ||
      p === '/ortak-cari',
    yetkiler: [EK_YETKI.FINANS],
    roles: [Role.ADMIN],
  },
  // ── İK & Prim ──
  {
    test: (p) =>
      p.startsWith('/personel') ||
      p.startsWith('/prim-') ||
      p === '/pdks-sync' ||
      p === '/pdks-personel-import' ||
      p === '/pdks-personeller' ||
      p === '/pos-kullanicilar',
    yetkiler: [EK_YETKI.IK_PRIM],
    roles: [Role.ADMIN],
  },
];

export function isDepoYetki(key: EkYetkiKey): boolean {
  return key.startsWith('DEPO_');
}

export function userHasEkYetki(user: JwtPayload, required: EkYetkiKey): boolean {
  const perms = user.ekYetkiler ?? [];
  if (perms.includes(required)) return true;
  if (isDepoYetki(required) && perms.includes(EK_YETKI.DEPO_YONETIMI)) return true;
  return false;
}

export function userHasAnyEkYetki(user: JwtPayload, required: EkYetkiKey[]): boolean {
  return required.some((k) => userHasEkYetki(user, k));
}

export function resolveAdminRouteAccess(path: string): { yetkiler: EkYetkiKey[]; roles: Role[] } {
  for (const rule of ADMIN_ROUTE_RULES) {
    if (rule.test(path)) {
      return { yetkiler: rule.yetkiler, roles: rule.roles };
    }
  }
  return { yetkiler: [], roles: [Role.ADMIN] };
}

export function canAccessAdminPanel(user: { role: Role; ekYetkiler?: string[] }): boolean {
  if (
    user.role === Role.ADMIN ||
    user.role === Role.STORE_MANAGER ||
    user.role === Role.WAREHOUSE_MANAGER
  ) {
    return true;
  }
  return (user.ekYetkiler?.length ?? 0) > 0;
}
