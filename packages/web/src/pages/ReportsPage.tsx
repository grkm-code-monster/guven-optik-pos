import { useState } from 'react'
import Button from '../components/ui/Button'
import { downloadExcel, getDailyReport } from '../api/reports.api'

function todayYMD() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatMoney(v?: string) {
  if (!v) return '-'
  const n = Number(v)
  if (Number.isNaN(n)) return v
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)
}

export default function ReportsPage() {
  const [date, setDate] = useState(todayYMD())
  const [report, setReport] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function fetchReport() {
    setLoading(true)
    setError(null)
    try {
      const r = await getDailyReport(date)
      setReport(r)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Rapor alınamadı')
    } finally {
      setLoading(false)
    }
  }

  async function excel() {
    setError(null)
    try {
      const blob = await downloadExcel(date)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gunluk-kasa-${date}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Excel indirilemedi')
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-gray-200 p-4 flex flex-col md:flex-row md:items-end gap-3">
        <label className="block">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Tarih</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 min-h-[44px] border border-gray-300 rounded-lg px-3 text-sm focus:border-brand-red outline-none"
          />
        </label>
        <div className="flex gap-2">
          <Button disabled={loading} onClick={fetchReport}>
            Rapor Getir
          </Button>
          <Button variant="secondary" onClick={excel}>
            Excel İndir
          </Button>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div> : null}

      {report ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Satış</div>
              <div className="text-xl font-bold">{formatMoney(report.totalSales)}</div>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Net Ciro</div>
              <div className="text-xl font-bold">{formatMoney(report.totalNet)}</div>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Komisyon</div>
              <div className="text-xl font-bold">{formatMoney(report.totalCommission)}</div>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Kasa</div>
              <div className="text-xl font-bold">{formatMoney(report.expectedCash)}</div>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="font-bold mb-3">Ödeme Dağılımı</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between border border-gray-200 rounded-lg px-3 py-2">
                <span>Nakit</span>
                <span className="font-semibold">{formatMoney(report.cashTotal)}</span>
              </div>
              <div className="flex justify-between border border-gray-200 rounded-lg px-3 py-2">
                <span>Kart (Brüt)</span>
                <span className="font-semibold">{formatMoney(report.cardGross)}</span>
              </div>
              <div className="flex justify-between border border-gray-200 rounded-lg px-3 py-2">
                <span>Kart (Net)</span>
                <span className="font-semibold">{formatMoney(report.cardNet)}</span>
              </div>
              <div className="flex justify-between border border-gray-200 rounded-lg px-3 py-2">
                <span>KDV</span>
                <span className="font-semibold">{formatMoney(report.taxTotal)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="font-bold mb-3">Banka Kırılımı</div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4">Banka</th>
                    <th className="py-2 pr-4">Taksit</th>
                    <th className="py-2 pr-4">Brüt</th>
                    <th className="py-2 pr-4">Komisyon</th>
                    <th className="py-2 pr-4">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bankBreakdown?.map((b: any, idx: number) => (
                    <tr key={idx} className="border-t border-gray-200">
                      <td className="py-2 pr-4">{b.bankName}</td>
                      <td className="py-2 pr-4">{b.installment}</td>
                      <td className="py-2 pr-4">{formatMoney(b.gross)}</td>
                      <td className="py-2 pr-4">{formatMoney(b.commission)}</td>
                      <td className="py-2 pr-4">{formatMoney(b.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

