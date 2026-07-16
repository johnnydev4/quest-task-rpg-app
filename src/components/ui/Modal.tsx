import { useEffect, useRef, type ReactNode } from 'react'
import { useSwipeToClose } from '../../lib/useSwipeToClose'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Modal centrado en escritorio, hoja inferior en móvil. Cierra con Escape, clic fuera o deslizando hacia abajo la cabecera. */
export function Modal({ title, onClose, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Deslizar hacia abajo sobre la cabecera cierra el modal (gesto de hoja iOS,
  // con listeners nativos no-pasivos: los de React no funcionan en Safari).
  useSwipeToClose(panelRef, headerRef, onClose)

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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[85dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-line/5 glass-strong shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl"
        style={{ animation: 'modal-in 0.22s ease-out both' }}
      >
        <header
          ref={headerRef}
          className="sticky top-0 z-10 flex items-center justify-between border-b border-line/5 glass-strong px-5 py-4"
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
