import type { CSSProperties, ReactNode } from 'react'
import clsx from 'clsx'

interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  size?: 'sm' | 'md'
  className?: string
  style?: CSSProperties
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  size = 'md',
  className,
  style,
}: EmptyStateProps) {
  const small = size === 'sm'
  return (
    <div
      className={clsx('empty-state', className)}
      style={small ? { padding: 'var(--sp-6)', ...style } : style}
    >
      {icon && (
        <div className="empty-state-icon" style={small ? { fontSize: 32 } : undefined}>
          {icon}
        </div>
      )}
      <div className="empty-state-title" style={small ? { fontSize: 'var(--text-sm)' } : undefined}>
        {title}
      </div>
      {description && (
        <div className="empty-state-desc" style={small ? { fontSize: 'var(--text-xs)' } : undefined}>
          {description}
        </div>
      )}
      {actions && <div style={{ marginTop: 'var(--sp-3)' }}>{actions}</div>}
    </div>
  )
}
