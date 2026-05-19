const stored = localStorage.getItem('tenantConfig')
const defaults = {
  brandName: 'GÜVEN OPTİK',
  brandYear: '1959',
  primaryColor: '#C8102E',
  primaryColorHover: '#a50d25',
  logoUrl: null as string | null,
}

export const tenantConfig = stored ? { ...defaults, ...JSON.parse(stored) } : defaults

export function saveTenantConfig(config: Partial<typeof defaults>) {
  localStorage.setItem('tenantConfig', JSON.stringify({ ...tenantConfig, ...config }))
  window.location.reload()
}

