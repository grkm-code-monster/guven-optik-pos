/** Frontend ek yetki sabitleri — backend ek-yetki.ts ile senkron tutulmalı */

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
} as const

export type EkYetkiKey = (typeof EK_YETKI)[keyof typeof EK_YETKI]

export const EK_YETKI_SECILEBILIR: EkYetkiKey[] = Object.values(EK_YETKI)

export const EK_YETKI_LABELS: Record<EkYetkiKey, string> = {
  TANIMLAMALAR: 'Tanımlamalar',
  KAMPANYALAR: 'Kampanyalar',
  DEPO_YONETIMI: 'Depo Yönetimi (tüm sekmeler)',
  DEPO_STOK: 'Depo → Stok Durumu',
  DEPO_TRANSFER: 'Depo → Transferler',
  DEPO_SAYIM: 'Depo → Sayım',
  DEPO_ALIM_IADE: 'Depo → Alım & İade',
  DEPO_URUN_GIRIS: 'Depo → Ürün Girişi',
  DEPO_EXCEL_ENVANTER: 'Depo → Excel Envanter',
  DEPO_SIPARIS: 'Depo → Siparişler',
  STOK_YONETIMI: 'Stok Yönetimi',
  ETIKET_TASARIMCI: 'Etiket Tasarımcısı',
  URUN_YAPILANDIRMA: 'Ürün Yapılandırma',
  GARANTI_IADE: 'Garanti & İade',
  UTS_YONETIMI: 'UTS Yönetimi',
  MUHASEBE: 'Muhasebe',
  FINANS: 'Finans Yönetimi',
  IK_PRIM: 'İK & Prim',
}

export type AdminUserLite = {
  role?: string
  ekYetkiler?: string[]
}

export function hasEkYetki(user: AdminUserLite, required: string): boolean {
  const perms = user.ekYetkiler ?? []
  if (perms.includes(required)) return true
  if (required.startsWith('DEPO_') && perms.includes(EK_YETKI.DEPO_YONETIMI)) return true
  return false
}

export function hasAnyDepoYetki(user: AdminUserLite): boolean {
  return (user.ekYetkiler ?? []).some(
    (k) => k === EK_YETKI.DEPO_YONETIMI || k.startsWith('DEPO_'),
  )
}

const FULL_MENU_ROLES = new Set(['ADMIN', 'WAREHOUSE_MANAGER', 'STORE_MANAGER'])

/** Menü rotası → gerekli ek yetki anahtarı (depo: herhangi depo yetkisi) */
export const MENU_ROUTE_YETKI: Record<string, string> = {
  '/admin/tanimlamalar': EK_YETKI.TANIMLAMALAR,
  '/admin/kampanyalar': EK_YETKI.KAMPANYALAR,
  '/admin/depo': '__DEPO__',
  '/admin/stok-yonetimi': EK_YETKI.STOK_YONETIMI,
  '/admin/etiket-tasarimci': EK_YETKI.ETIKET_TASARIMCI,
  '/admin/etiket-sablon-duzenleyici': EK_YETKI.ETIKET_TASARIMCI,
  '/admin/urun-yapilandirma': EK_YETKI.URUN_YAPILANDIRMA,
  '/admin/garanti': EK_YETKI.GARANTI_IADE,
  '/admin/uts': EK_YETKI.UTS_YONETIMI,
  '/admin/muhasebe': EK_YETKI.MUHASEBE,
  '/admin/finans': EK_YETKI.FINANS,
  '/admin/ik': EK_YETKI.IK_PRIM,
}

export function canSeeAdminMenuItem(user: AdminUserLite, to: string): boolean {
  const role = user.role ?? ''

  if (to === '/admin/patron') {
    return role === 'ADMIN' || role === 'REGIONAL_MANAGER'
  }
  if (to === '/admin/rapor-matris') {
    return role === 'ADMIN'
  }
  if (to === '/admin/deploy') {
    return role === 'ADMIN'
  }

  if (FULL_MENU_ROLES.has(role)) {
    if (role === 'STORE_MANAGER' && to === '/admin/stok-yonetimi') return false
    if (to === '/admin/patron' || to === '/admin/rapor-matris' || to === '/admin/deploy') return false
    return true
  }

  const ek = user.ekYetkiler ?? []
  if (ek.length === 0) return false

  const needed = MENU_ROUTE_YETKI[to]
  if (!needed) return false
  if (needed === '__DEPO__') return hasAnyDepoYetki(user)
  return hasEkYetki(user, needed)
}

export const DEPO_TAB_YETKI: Record<string, string> = {
  stok: EK_YETKI.DEPO_STOK,
  transfer: EK_YETKI.DEPO_TRANSFER,
  sayim: EK_YETKI.DEPO_SAYIM,
  alim: EK_YETKI.DEPO_ALIM_IADE,
  'urun-giris': EK_YETKI.DEPO_URUN_GIRIS,
  'excel-envanter': EK_YETKI.DEPO_EXCEL_ENVANTER,
  siparisler: EK_YETKI.DEPO_SIPARIS,
}

export function canSeeDepoTab(user: AdminUserLite, tabId: string): boolean {
  const role = user.role ?? ''
  if (FULL_MENU_ROLES.has(role)) return true
  const key = DEPO_TAB_YETKI[tabId]
  if (!key) return false
  return hasEkYetki(user, key)
}
