/** Özel sipariş payload'ına aktarılacak reçete alanları */
export type OzelSiparisReceteFields = {
  sagSph?: string | number
  sagCyl?: string | number
  sagAks?: string | number
  sagAdd?: string | number
  sagPd?: string | number
  solSph?: string | number
  solCyl?: string | number
  solAks?: string | number
  solAdd?: string | number
  solPd?: string | number
}

type RxLike = Record<string, unknown> | null | undefined

function hasValue(v: unknown): boolean {
  return v != null && v !== ''
}

function pick(...vals: unknown[]): string | number | undefined {
  for (const v of vals) {
    if (hasValue(v)) return v as string | number
  }
  return undefined
}

/** Kaynakta SPH/CYL/AKS/ADD/PD alanlarından en az biri dolu mu */
export function hasReceteData(rx: RxLike): boolean {
  if (!rx) return false
  return Boolean(
    pick(
      rx.r_sph,
      rx.far_r_sph,
      rx.lens_r_sph,
      rx.r_cyl,
      rx.far_r_cyl,
      rx.lens_r_cyl,
      rx.r_aks,
      rx.far_r_aks,
      rx.lens_r_aks,
      rx.r_add,
      rx.far_r_add,
      rx.lens_r_add,
      rx.r_pd,
      rx.far_r_pd,
      rx.l_sph,
      rx.far_l_sph,
      rx.lens_l_sph,
    ),
  )
}

/**
 * Satış kalemi reçetesi → müşteri reçetesi → müşteri profili sırasıyla reçete alanlarını birleştirir.
 * POS 1. adımda girilen gözlük reçetesi (far_*) ve lens reçetesi (lens_*) desteklenir.
 */
export function buildOzelSiparisReceteFields(sources: {
  saleItemPrescription?: RxLike
  customerPrescription?: RxLike
  customer?: RxLike
}): OzelSiparisReceteFields {
  const item = sources.saleItemPrescription
  const rx = sources.customerPrescription
  const cust = sources.customer

  const fields: OzelSiparisReceteFields = {}
  const sagSph = pick(item?.r_sph, rx?.far_r_sph, rx?.r_sph, rx?.lens_r_sph, cust?.far_r_sph, cust?.lens_r_sph)
  const sagCyl = pick(item?.r_cyl, rx?.far_r_cyl, rx?.r_cyl, rx?.lens_r_cyl, cust?.far_r_cyl, cust?.lens_r_cyl)
  const sagAks = pick(item?.r_aks, rx?.far_r_aks, rx?.r_aks, rx?.lens_r_aks, cust?.far_r_aks, cust?.lens_r_aks)
  const sagAdd = pick(item?.r_add, rx?.far_r_add, rx?.r_add, rx?.lens_r_add, cust?.lens_r_add)
  const sagPd = pick(item?.r_pd, rx?.far_r_pd, rx?.r_pd, cust?.far_r_pd)
  const solSph = pick(item?.l_sph, rx?.far_l_sph, rx?.l_sph, rx?.lens_l_sph, cust?.far_l_sph, cust?.lens_l_sph)
  const solCyl = pick(item?.l_cyl, rx?.far_l_cyl, rx?.l_cyl, rx?.lens_l_cyl, cust?.far_l_cyl, cust?.lens_l_cyl)
  const solAks = pick(item?.l_aks, rx?.far_l_aks, rx?.l_aks, rx?.lens_l_aks, cust?.far_l_aks, cust?.lens_l_aks)
  const solAdd = pick(item?.l_add, rx?.far_l_add, rx?.l_add, rx?.lens_l_add, cust?.lens_l_add)
  const solPd = pick(item?.l_pd, rx?.far_l_pd, rx?.l_pd, cust?.far_l_pd)

  if (hasValue(sagSph)) fields.sagSph = sagSph
  if (hasValue(sagCyl)) fields.sagCyl = sagCyl
  if (hasValue(sagAks)) fields.sagAks = sagAks
  if (hasValue(sagAdd)) fields.sagAdd = sagAdd
  if (hasValue(sagPd)) fields.sagPd = sagPd
  if (hasValue(solSph)) fields.solSph = solSph
  if (hasValue(solCyl)) fields.solCyl = solCyl
  if (hasValue(solAks)) fields.solAks = solAks
  if (hasValue(solAdd)) fields.solAdd = solAdd
  if (hasValue(solPd)) fields.solPd = solPd

  return fields
}
