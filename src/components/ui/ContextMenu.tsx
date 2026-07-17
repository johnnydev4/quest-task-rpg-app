import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface MenuEntry {
  label: string
  icon?: ReactNode
  /** Acción directa; se ignora si la entrada tiene submenu. */
  onClick?: () => void
  /** Opciones anidadas: se despliegan en acordeón bajo la entrada. */
  submenu?: MenuEntry[]
  /** Marca la opción como la activa (check a la izquierda en submenús). */
  selected?: boolean
}

/**
 * Menú contextual Liquid Glass (clic derecho): panel de cristal anclado al
 * cursor, recolocado para no salirse de la pantalla. Los submenús se abren
 * en acordeón. Cierra con clic fuera, Escape u otra apertura de menú.
 */
export function ContextMenu({
  x,
  y,
  entries,
  onClose,
}: {
  x: number
  y: number
  entries: MenuEntry[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [openSub, setOpenSub] = useState<string | null>(null)

  // Reposiciona para que el menú quede siempre dentro del viewport.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    })
  }, [x, y, openSub])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const itemClass =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink'

  return createPortal(
    <div
      className="fixed inset-0 z-[70]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        ref={ref}
        role="menu"
        className="absolute min-w-56 overflow-hidden rounded-xl border border-line/10 glass-strong py-1 shadow-2xl"
        style={{ left: pos.left, top: pos.top, animation: 'menu-pop 0.14s ease-out both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {entries.map((entry) => (
          <div key={entry.label}>
            <button
              role="menuitem"
              aria-haspopup={entry.submenu ? 'menu' : undefined}
              aria-expanded={entry.submenu ? openSub === entry.label : undefined}
              onClick={() => {
                if (entry.submenu) {
                  setOpenSub((s) => (s === entry.label ? null : entry.label))
                } else {
                  entry.onClick?.()
                  onClose()
                }
              }}
              className={itemClass}
            >
              {entry.icon && (
                <span className="text-ink-muted" aria-hidden="true">
                  {entry.icon}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {entry.submenu && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`size-3.5 shrink-0 text-ink-faint transition-transform ${openSub === entry.label ? 'rotate-90' : ''}`} aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              )}
            </button>
            {entry.submenu && openSub === entry.label && (
              <div className="border-y border-line/5 bg-ink/[0.04] py-0.5" role="menu">
                {entry.submenu.map((sub) => (
                  <button
                    key={sub.label}
                    role="menuitem"
                    onClick={() => {
                      sub.onClick?.()
                      onClose()
                    }}
                    className={`${itemClass} py-1.5 pl-6 text-[13px]`}
                  >
                    <span className="w-4 shrink-0 text-accent-400" aria-hidden="true">
                      {sub.selected && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{sub.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  )
}
