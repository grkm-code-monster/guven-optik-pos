import * as React from 'react'

type Variant = 'primary' | 'secondary' | 'danger'

export default function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    'h-11 min-h-[44px] px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants: Record<Variant, string> = {
    primary: 'bg-brand-red text-white hover:bg-brand-red2',
    secondary: 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
    danger: 'border border-brand-red text-brand-red hover:bg-brand-light',
  }

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

