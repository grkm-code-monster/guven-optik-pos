import * as React from 'react'

export default function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title?: string
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="font-bold text-lg">{title}</div>
          <button
            type="button"
            className="h-11 min-h-[44px] px-3 rounded-lg border border-gray-300 hover:bg-gray-50"
            onClick={onClose}
          >
            Kapat
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

