export default function Badge({ status }: { status: string }) {
  const s = status?.toUpperCase?.() ?? ''

  const map: Record<string, string> = {
    PENDING: 'bg-gray-100 text-gray-700 border-gray-200',
    ORDERED: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    IN_LAB: 'bg-blue-50 text-blue-800 border-blue-200',
    READY: 'bg-green-50 text-green-800 border-green-200',
    DELIVERED: 'bg-green-100 text-green-900 border-green-200',
    VOID: 'bg-red-50 text-red-700 border-red-200',
    DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
    PAID: 'bg-green-50 text-green-800 border-green-200',
  }

  const cls = map[s] ?? 'bg-gray-100 text-gray-700 border-gray-200'

  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{s}</span>
}

