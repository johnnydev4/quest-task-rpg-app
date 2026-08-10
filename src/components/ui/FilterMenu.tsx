import { useEffect, useRef, useState } from 'react'
import { FilterIcon } from './icons'

export interface FilterOption {
  id: string
  label: string
  /** Punto de color a la izquierda (el de la lista); null = punto hueco. */
  color?: string | null
  emoji?: string | null
}

/**
 * Desplegable de filtro por listas: cada entrada es una casilla y las
 * desmarcadas se ocultan del resultado. Mismo lenguaje visual que `SortMenu`
 * (botón compacto de cristal, panel Liquid Glass); cierra con clic fuera o
 * Escape, pero NO al marcar, para poder quitar varias listas de una vez.
 */
export function FilterMenu({
  options,
  hidden,
  onChange,
  label = 'Filtrar',
}: {
  options: FilterOption[]
  /** Ids ocultos del resultado. */
  hidden: Set<string>
  onChange: (hidden: Set<string>) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Solo cuentan las listas ocultas que aún existen (una lista borrada podría
  // haber dejado su id guardado en el filtro).
  const activeCount = options.filter((o) => hidden.has(o.id)).length
  const toggle = (id: string) => {
    const next = new Set(hidden)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
          activeCount > 0
            ? 'border-accent-500/40 bg-accent-500/10 text-accent-300'
            : 'border-line/10 glass-input text-ink-dim hover:bg-ink/5 hover:text-ink'
        }`}
      >
        <FilterIcon className="size-3.5" />
        <span className="hidden sm:inline">{label}</span>
        {activeCount > 0 && (
          <span className="rounded-full bg-accent-500/20 px-1.5 text-[0.625rem] font-bold text-accent-300">
            {activeCount}
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-3 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 max-h-80 min-w-56 overflow-y-auto rounded-xl border border-line/10 glass-strong py-1 shadow-2xl"
          style={{ animation: 'menu-pop 0.14s ease-out both' }}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <span className="text-[0.6875rem] font-semibold tracking-wide text-ink-faint uppercase">
              Mostrar listas
            </span>
            <button
              onClick={() => onChange(activeCount > 0 ? new Set() : new Set(options.map((o) => o.id)))}
              className="shrink-0 text-[0.6875rem] font-medium text-accent-400 transition-colors hover:text-accent-300"
            >
              {activeCount > 0 ? 'Todas' : 'Ninguna'}
            </button>
          </div>
          {options.map((o) => {
            const visible = !hidden.has(o.id)
            return (
              <button
                key={o.id}
                role="menuitemcheckbox"
                aria-checked={visible}
                onClick={() => toggle(o.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                    visible ? 'border-accent-500 bg-accent-500 text-white' : 'border-ink-muted'
                  }`}
                  aria-hidden="true"
                >
                  {visible && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-2.5">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span
                  className={`size-2 shrink-0 rounded-full ${o.color ? '' : 'border border-ink-muted'}`}
                  style={o.color ? { backgroundColor: o.color } : undefined}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  {o.emoji ? `${o.emoji} ${o.label}` : o.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
