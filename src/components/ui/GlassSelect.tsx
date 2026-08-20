import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface GlassOption<T extends string | number> {
  value: T
  label: string
}

/**
 * Desplegable Liquid Glass genérico: botón compacto de cristal que muestra el
 * valor activo y, al pulsar, abre un menú translúcido con blur (estética iOS)
 * en lugar de la rueda/lista nativa del sistema, que se ve anticuada.
 *
 * Cierra al elegir, al tocar fuera o con Escape. Si la lista es larga (números)
 * hace scroll con altura máxima y auto-desplaza a la opción activa al abrir.
 */
export function GlassSelect<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  align = 'left',
  minWidthClass = 'min-w-28',
}: {
  value: T
  options: GlassOption<T>[]
  onChange: (v: T) => void
  ariaLabel: string
  align?: 'left' | 'right'
  minWidthClass?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

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

  // Al abrir, deja la opción activa a la vista (útil en listas largas de números).
  useLayoutEffect(() => {
    if (open && activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'center' })
    }
  }, [open])

  const current = options.find((o) => o.value === value) ?? options[0]

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex items-center gap-1 rounded-lg border border-line/10 glass-input px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-ink/5"
      >
        <span>{current?.label}</span>
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
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute z-40 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-line/10 glass-strong py-1 shadow-2xl ${minWidthClass} ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ animation: 'menu-pop 0.14s ease-out both' }}
        >
          {options.map((o) => {
            const selected = o.value === value
            return (
              <button
                key={String(o.value)}
                ref={selected ? activeRef : undefined}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-ink/5 ${selected ? 'text-ink' : 'text-ink-dim hover:text-ink'}`}
              >
                <span className="w-4 shrink-0 text-accent-400" aria-hidden="true">
                  {selected && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Genera opciones numéricas [min..max] con etiqueta = número (o formateada). */
export function numberOptions(
  min: number,
  max: number,
  format?: (n: number) => string,
): GlassOption<number>[] {
  const out: GlassOption<number>[] = []
  for (let n = min; n <= max; n++) out.push({ value: n, label: format ? format(n) : String(n) })
  return out
}
