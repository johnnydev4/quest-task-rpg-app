import { useEffect, useRef, useState } from 'react'
import { SortIcon } from './icons'

export interface SortOption<T extends string> {
  id: T
  label: string
}

/**
 * Desplegable para ordenar una lista (por nombre, fecha…). Botón compacto de
 * cristal que abre un menú Liquid Glass con la opción activa marcada. Cierra
 * al elegir, tocar fuera o con Escape.
 */
export function SortMenu<T extends string>({
  value,
  options,
  onChange,
  label = 'Ordenar',
}: {
  value: T
  options: SortOption<T>[]
  onChange: (v: T) => void
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

  const current = options.find((o) => o.id === value) ?? options[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex items-center gap-1 rounded-lg border border-line/10 glass-input px-2 py-1 text-xs font-medium text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink lg:gap-1.5 lg:px-2.5 lg:py-1.5"
      >
        <SortIcon className="size-3 lg:size-3.5" />
        <span className="hidden sm:inline">{current.label}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`size-2.5 text-ink-faint transition-transform lg:size-3 ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-44 overflow-hidden rounded-xl border border-line/10 glass-strong py-1 shadow-2xl"
          style={{ animation: 'menu-pop 0.14s ease-out both' }}
        >
          {options.map((o) => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={o.id === value}
              onClick={() => {
                onChange(o.id)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <span className="w-4 shrink-0 text-accent-400" aria-hidden="true">
                {o.id === value && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
