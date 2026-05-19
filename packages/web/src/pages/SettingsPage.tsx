import { useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { saveTenantConfig, tenantConfig } from '../config/tenant.config'

export default function SettingsPage() {
  const initial = useMemo(() => tenantConfig, [])
  const [brandName, setBrandName] = useState(initial.brandName)
  const [brandYear, setBrandYear] = useState(initial.brandYear)
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor)
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl)

  async function onLogoFile(file: File | null) {
    if (!file) {
      setLogoUrl(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setLogoUrl(String(reader.result))
    reader.readAsDataURL(file)
  }

  function save() {
    saveTenantConfig({
      brandName,
      brandYear,
      primaryColor,
      primaryColorHover: initial.primaryColorHover,
      logoUrl,
    })
    window.location.reload()
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-xl bg-white border border-gray-200 p-4">
        <div className="font-bold mb-3">Ayarlar</div>
        <div className="space-y-3">
          <Input label="Marka adı" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          <Input label="Yıl" value={brandYear} onChange={(e) => setBrandYear(e.target.value)} />

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Ana renk</div>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-11 min-h-[44px] w-full border border-gray-300 rounded-lg px-2"
            />
          </label>

          <label className="block">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Logo yükle</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => void onLogoFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
          </label>

          <Button className="w-full" onClick={save}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  )
}

