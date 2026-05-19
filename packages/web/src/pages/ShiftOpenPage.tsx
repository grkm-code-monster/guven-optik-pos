import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { openShift } from '../api/shifts.api'
import { useAuthStore } from '../store/auth.store'

export default function ShiftOpenPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setShiftId = useAuthStore((s) => s.setShiftId)

  const [openCash, setOpenCash] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const allowed = user?.role === 'STORE_MANAGER' || user?.role === 'ADMIN'
  if (!allowed) return <div className="p-4">Bu sayfaya erişim yetkiniz yok.</div>

  async function submit() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await openShift({ openCash: openCash || '0', note: note || undefined })
      setShiftId(res.id)
      navigate('/', { replace: true })
    } catch (e: any) {
      const code = e?.response?.data?.error
      if (code === 'SHIFT_ALREADY_OPEN') {
        navigate('/', { replace: true })
        return
      }
      setError(e?.response?.data?.message ?? 'Vardiya açılamadı')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-light">
      <div className="h-14 bg-brand-red text-white flex items-center px-4">
        <div className="font-bold">GÜVEN OPTİK</div>
      </div>

      <div className="p-4 flex items-center justify-center">
        <div className="w-full max-w-md rounded-2xl bg-white shadow border border-gray-200 p-6 space-y-4">
          <div className="font-bold text-lg">Vardiya Aç</div>
          <Input label="Açılış Kasası (TL)" inputMode="decimal" value={openCash} onChange={(e) => setOpenCash(e.target.value)} />
          <Input label="Not (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} />
          {error ? <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div> : null}
          <Button className="w-full" disabled={loading} onClick={submit}>
            Vardiyayı Aç
          </Button>
        </div>
      </div>
    </div>
  )
}

