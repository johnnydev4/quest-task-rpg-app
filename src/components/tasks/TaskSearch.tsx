import { useEffect, useRef, useState } from 'react'
import { SearchIcon } from '../ui/icons'

/**
 * Buscador de tareas por nombre (pestaña "Todas"). Un botón compacto que se
 * despliega en un campo al pulsarlo; filtra en vivo mientras se escribe. Mismo
 * lenguaje visual que `FilterMenu`/`SortMenu`. Escape o la ✕ lo vacían y cierran.
 */
export function TaskSearch({
  value,
  onChange,
  label = 'Buscar tarea',
}: {
  value: string
  onChange: (value: string) => void
  label?: string
}) {
  // Con texto ya escrito nace abierto (p. ej. al volver a la vista con búsqueda).
  const [open, setOpen] = useState(value.length > 0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const close = () => {
    onChange('')
    setOpen(false)
  }

  if (!open && value.length === 0) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className="flex items-center gap-1.5 rounded-lg border border-line/10 glass-input px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink"
      >
        <SearchIcon className="size-3.5" />
        <span className="hidden sm:inline">Buscar</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 rounded-lg border border-accent-500/40 bg-accent-500/10 pr-1 pl-2.5 transition-colors focus-within:border-accent-500/60">
      <SearchIcon className="size-3.5 shrink-0 text-accent-300" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
        }}
        placeholder="Buscar tarea…"
        aria-label={label}
        className="w-32 bg-transparent py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none sm:w-44"
      />
      <button
        type="button"
        onClick={close}
        aria-label="Cerrar búsqueda"
        className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
