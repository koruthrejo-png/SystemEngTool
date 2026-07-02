import { forwardRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'secondary-on-navy' | 'ghost' | 'danger-ghost'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-action text-white hover:bg-action-hover font-medium',
  secondary: 'border border-navy text-navy hover:bg-navy/5 font-medium',
  'secondary-on-navy': 'border border-white/30 text-white hover:bg-white/10 font-medium',
  ghost: 'text-action hover:bg-action-tint/50 font-medium',
  'danger-ghost': 'text-ink-faint hover:text-error'
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps): JSX.Element {
  return (
    <button
      className={`px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

const FIELD_CLASSES =
  'w-full text-sm px-3 py-2 bg-white border border-line rounded text-ink placeholder:text-ink-faint/60 focus:outline-none focus:ring-2 focus:ring-action/60 focus:border-action'

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...props }, ref) {
    return <input ref={ref} className={`${FIELD_CLASSES} ${className}`} {...props} />
  }
)

export function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea className={`${FIELD_CLASSES} resize-none ${className}`} {...props} />
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return <select className={`${FIELD_CLASSES} ${className}`} {...props} />
}

export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }): JSX.Element {
  return (
    <span className={`text-[11px] font-bold uppercase tracking-[0.05em] leading-4 text-ink-faint ${className}`}>
      {children}
    </span>
  )
}

export function Panel({
  children,
  className = '',
  ...props
}: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div className={`bg-white border-line ${className}`} {...props}>
      {children}
    </div>
  )
}
