import { useEffect, useState } from 'react'
import { onToast, type ToastDetail } from '../../lib/events'

interface ToastItem extends ToastDetail {
  id: number
}

/** Avisos in-app (recordatorios, sync, sesiones): apilados arriba a la derecha, se van solos. */
export function ToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(
    () =>
      onToast((detail) => {
        const id = Date.now() + Math.random()
        setToasts((prev) => [...prev.slice(-3), { ...detail, id }])
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000)
      }),
    [],
  )

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed top-[max(1rem,env(safe-area-inset-top))] right-4 z-[70] flex w-72 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-xl border border-line/10 glass-strong px-4 py-3 shadow-xl"
          style={{ animation: 'levelup-in 0.35s ease-out both' }}
        >
          <p className="text-sm font-semibold text-ink">{t.title}</p>
          {t.body && <p className="mt-0.5 text-xs text-ink-muted">{t.body}</p>}
        </div>
      ))}
    </div>
  )
}
