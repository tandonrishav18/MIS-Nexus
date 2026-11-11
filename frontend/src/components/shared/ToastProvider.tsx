import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToastMessage {
  id: string
  title: string
  description?: string
  tone: 'success' | 'warning' | 'danger' | 'info'
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastMessage, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4500)
    },
    []
  )

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-card border bg-white p-3.5 shadow-popover',
              t.tone === 'success' && 'border-[#B8E2D4]',
              t.tone === 'warning' && 'border-[#F1DBA8]',
              t.tone === 'danger' && 'border-[#F3C2C0]',
              t.tone === 'info' && 'border-[#C5D7EE]'
            )}
          >
            {t.tone === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#168568]" />}
            {t.tone === 'warning' && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D69A35]" />}
            {t.tone === 'danger' && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D9534F]" />}
            {t.tone === 'info' && <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1E4E8C]" />}
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-[#172B4D]">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 text-[12px] text-[#42526E]">{t.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="rounded-control p-0.5 text-[#6B778C] hover:bg-[#F1F4F8] hover:text-[#172B4D]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}

