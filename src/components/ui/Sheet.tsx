import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Hoja inferior (bottom sheet) estilo Microsoft To Do adaptada al Liquid Glass:
 * sube desde abajo con un tirador, título y botón "Listo". Cierra con Escape,
 * tocando fuera o el botón. Se dibuja por encima de todo (z alto).
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Portal a <body>: evita que un `transform` de un ancestro (la animación de
  // un modal) convierta este `fixed` en relativo al panel y lo recorte.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[82dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-line/5 glass-strong shadow-2xl"
        style={{ animation: 'sheet-up 0.26s ease-out both' }}
      >
        <div className="sticky top-0 z-10 glass-strong">
          <div className="flex justify-center pt-2.5">
            <span className="h-1 w-9 rounded-full bg-ink/25" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-3">
            <span aria-hidden="true" />
            <h3 className="text-center text-base font-semibold text-ink">{title}</h3>
            <button onClick={onClose} className="justify-self-end text-[15px] font-semibold text-accent-400">
              Listo
            </button>
          </div>
        </div>
        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
