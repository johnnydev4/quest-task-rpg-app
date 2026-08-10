import { useMemo, useRef, useState, type FormEvent } from 'react'
import { parseQuickAdd, type QuickParseList, type QuickParseResult } from '../../lib/quickParse'
import { FolderIcon } from '../ui/icons'

interface QuickAddProps {
  placeholder: string
  /** Listas cuyo nombre puede detectarse en el texto ("Paga tarjeta finanzas"). */
  lists?: QuickParseList[]
  onAdd: (parsed: QuickParseResult) => void
}

/**
 * Captura rápida siempre visible (spec §2: fricción mínima, 1–2 toques) con
 * detección inteligente: "Gimnasio el lunes a las 8pm cada semana #salud".
 * Lo detectado se muestra como chips antes de guardar.
 */
export function QuickAdd({ placeholder, lists, onAdd }: QuickAddProps) {
  const [text, setText] = useState('')
  // Lista aceptada por el usuario. Se compara con la sugerencia actual, así al
  // seguir escribiendo (otra lista, o ninguna) la elección caduca sola.
  const [pickedListId, setPickedListId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, lists ?? []) : null), [text, lists])
  const suggestion = parsed?.listSuggestion ?? null
  const picked = suggestion !== null && suggestion.id === pickedListId

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!parsed || !parsed.title.trim()) return
    onAdd(
      picked && suggestion
        ? { ...parsed, title: suggestion.title, listId: suggestion.id }
        : parsed,
    )
    setText('')
    setPickedListId(null)
    // En táctil (smartphone), Enter añade la tarea Y esconde el teclado; en
    // escritorio el foco se queda para encadenar varias tareas seguidas.
    if (window.matchMedia('(pointer: coarse)').matches) inputRef.current?.blur()
  }

  return (
    <div className="space-y-1.5">
      {parsed && (parsed.chips.length > 0 || suggestion !== null) && (
        <div className="flex flex-wrap items-center gap-1.5 px-1" aria-live="polite">
          <span className="text-[11px] text-ink-faint">Detectado:</span>
          {parsed.chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center rounded-full border border-accent-500/30 bg-accent-500/10 px-2 py-0.5 text-[11px] font-medium text-accent-300"
            >
              {chip}
            </span>
          ))}
          {suggestion && (
            // La lista no se aplica sola: es un botón que el usuario acepta o no.
            <button
              type="button"
              onClick={() => setPickedListId(picked ? null : suggestion.id)}
              aria-pressed={picked}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                picked
                  ? 'border-accent-500/60 bg-accent-500/25 text-accent-300'
                  : 'border-line/25 bg-surface-700/60 text-ink-muted hover:border-accent-500/40 hover:text-accent-300'
              }`}
            >
              <FolderIcon className="size-3" />
              {picked ? suggestion.name : `Añadir a ${suggestion.name}`}
            </button>
          )}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Añadir tarea"
          enterKeyHint="done"
          // glass-panel (con blur propio): el contenedor de alrededor es
          // transparente, así que aquí no hay anidamiento que iOS ignore.
          className="min-w-0 flex-1 rounded-xl border border-line/10 glass-panel px-4 py-3 text-sm text-ink placeholder-ink-faint shadow-lg outline-none transition-colors focus:border-accent-500/60"
        />
        <button
          type="submit"
          aria-label="Añadir"
          className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-on-accent shadow-lg shadow-accent-600/25 transition-colors hover:bg-accent-500 active:scale-95"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-5" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </form>
    </div>
  )
}
