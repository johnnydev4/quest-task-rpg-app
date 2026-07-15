import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Modal centrado en escritorio, hoja inferior en móvil. Cierra con Escape, clic fuera o deslizando hacia abajo la cabecera. */
export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Deslizar hacia abajo sobre la cabecera cierra el modal (gesto de hoja iOS).
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  function onHeaderTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  function onHeaderTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dy = t.clientY - start.y
    const dx = t.clientX - start.x
    if (dy > 55 && dy > Math.abs(dx) * 1.5) onClose()
  }

  // Bloquea el scroll de la página de fondo mientras el modal está abierto
  // (en iOS, sin esto la interfaz de atrás "se mueve" al arrastrar la hoja).
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-line/5 glass-strong shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl"
        style={{ animation: 'modal-in 0.22s ease-out both' }}
      >
        <header
          className="sticky top-0 z-10 flex items-center justify-between border-b border-line/5 glass-strong px-5 py-4"
          onTouchStart={onHeaderTouchStart}
          onTouchEnd={onHeaderTouchEnd}
        >
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}
