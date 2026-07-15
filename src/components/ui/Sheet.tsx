import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useIsDesktop } from '../../lib/useMediaQuery'

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** En escritorio, en vez de hoja inferior: panel lateral derecho a altura completa. */
  sideOnDesktop?: boolean
}

/**
 * Hoja inferior (bottom sheet) estilo Microsoft To Do adaptada al Liquid Glass:
 * sube desde abajo con un tirador, título y botón "Listo". Cierra con Escape,
 * tocando fuera, el botón o deslizándola hacia abajo (táctil).
 * Con sideOnDesktop, en pantallas grandes se ancla a la derecha (como el
 * panel de detalle de las tareas) y entra deslizándose desde la derecha.
 */
export function Sheet({ title, onClose, children, sideOnDesktop = false }: SheetProps) {
  const isDesktop = useIsDesktop()
  const side = sideOnDesktop && isDesktop

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Deslizar hacia abajo sobre la cabecera cierra la hoja (solo tiene sentido
  // en la variante inferior; el panel lateral se cierra con Listo/fondo/Escape).
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  function onHeaderTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  function onHeaderTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start || side) return
    const t = e.changedTouches[0]
    const dy = t.clientY - start.y
    const dx = t.clientX - start.x
    // Gesto claramente vertical hacia abajo
    if (dy > 55 && dy > Math.abs(dx) * 1.5) onClose()
  }

  // Portal a <body>: evita que un `transform` de un ancestro (la animación de
  // un modal) convierta este `fixed` en relativo al panel y lo recorte.
  return createPortal(
    <div className={`fixed inset-0 z-[60] flex ${side ? 'items-stretch justify-end' : 'items-end justify-center'}`}>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          side
            ? 'relative h-full w-[400px] overflow-y-auto overscroll-contain border-l border-line/10 glass-strong shadow-2xl'
            : 'relative max-h-[82dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-line/5 glass-strong shadow-2xl'
        }
        style={{ animation: `${side ? 'slide-in-right 0.28s' : 'sheet-up 0.26s'} ease-out both` }}
      >
        <div
          className="sticky top-0 z-10 glass-strong"
          onTouchStart={onHeaderTouchStart}
          onTouchEnd={onHeaderTouchEnd}
        >
          {!side && (
            <div className="flex justify-center pt-2.5">
              <span className="h-1 w-9 rounded-full bg-ink/25" aria-hidden="true" />
            </div>
          )}
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
