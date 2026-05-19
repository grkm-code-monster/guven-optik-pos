import * as React from 'react'

export default function Input({
  label,
  error,
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <label className="block">
      {label ? (
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      ) : null}
      <input
        {...props}
        className={`w-full border border-gray-300 rounded-lg p-2 text-sm focus:border-brand-red outline-none ${className}`}
      />
      {error ? <div className="mt-1 text-sm text-red-600">{error}</div> : null}
    </label>
  )
}

