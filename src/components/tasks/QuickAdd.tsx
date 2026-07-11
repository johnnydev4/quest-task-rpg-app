import { useMemo, useState, type FormEvent } from 'react'
import { parseQuickAdd, type QuickParseResult } from '../../lib/quickParse'

interface QuickAddProps {
  placeholder: string
  onAdd: (parsed: QuickParseResult) => void
}

/**
 * Captura rápida siempre visible (spec §2: fricción mínima, 1–2 toques) con
 * detección inteligente: "Gimnasio el lunes a las 8pm cada semana #salud".
 * Lo detectado se muestra como chips antes de guardar.
 */
export function QuickAdd({ placeholder, onAdd }: QuickAddProps) {
  const [text, setText] = useState('')
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!parsed || !parsed.title.trim()) return
    onAdd(parsed)
    setText('')
  }

  return (
    <div className="space-y-1.5">
      {parsed && parsed.chips.length > 0 && (
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
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Añadir tarea"
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
