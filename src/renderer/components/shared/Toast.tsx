import { useState, useEffect, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: number
  message: string
  type: ToastType
}

// Module-level registry so showToast() works from anywhere without context
let _addToast: ((msg: string, type: ToastType) => void) | null = null
let _nextId = 0

export function showToast(message: string, type: ToastType = 'info') {
  _addToast?.(message, type)
}

const COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: '#0d2318', border: '#22c55e', icon: '✓' },
  error:   { bg: '#2a0a0a', border: '#ef4444', icon: '✕' },
  warning: { bg: '#2a1800', border: '#f59e0b', icon: '⚠' },
  info:    { bg: '#0d1a2a', border: '#3b82f6', icon: 'ℹ' },
}

export function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = ++_nextId
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  useEffect(() => {
    _addToast = addToast
    return () => { _addToast = null }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 40,
        right: 16,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => {
        const c = COLORS[toast.type]
        return (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              fontSize: 13,
              color: '#e8eaf0',
              maxWidth: 320,
              animation: 'toast-in 0.2s ease-out',
              pointerEvents: 'all',
            }}
          >
            <span style={{ color: c.border, fontWeight: 700, fontSize: 12 }}>{c.icon}</span>
            <span style={{ flex: 1 }}>{toast.message}</span>
          </div>
        )
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
