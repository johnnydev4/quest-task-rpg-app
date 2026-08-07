import { useState } from 'react'
import type { Task } from '../../db/types'
import { formatDue } from '../../lib/dates'
import { moveOverdueToToday, skipOverdue } from '../../db/repo/tasks'
import { ForwardIcon, HistoryIcon, SunIcon } from '../ui/icons'

/**
 * Aviso diario de tareas vencidas: una vez al día, al entrar a Hoy, sube desde
 * abajo con las filas en cascada. Cada tarea se puede saltar o traer a hoy;
 * cuando no queda ninguna (o el usuario cierra), el aviso se va.
 */
export function OverdueDailyPopup({ tasks, onClose }: { tasks: Task[]; onClose: () => void }) {
  // Copia propia: actuar sobre una tarea la saca de aquí, no de la lista viva
  // (así el aviso no se reordena bajo el dedo mientras se despacha).
  const [items, setItems] = useState(tasks)
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)

  function close() {
    setClosing(true)
    setTimeout(onClose, 220)
  }

  async function handle(action: (id: string) => Promise<void>, ids: string[]) {
    if (busy) return
    setBusy(true)
    for (const id of ids) await action(id)
    const rest = items.filter((t) => !ids.includes(t.id))
    setItems(rest)
    setBusy(false)
    if (rest.length === 0) close()
  }

  const allIds = items.map((t) => t.id)

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-label="Tareas vencidas"
    >
      <div
        className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl border border-line/10 glass-strong shadow-2xl"
        style={{ animation: closing ? 'levelup-out 0.2s ease-in both' : 'sheet-up 0.35s ease-out both' }}
      >
        <div className="flex items-center gap-2 border-b border-line/5 px-4 py-3">
          <HistoryIcon className="size-4 shrink-0 text-accent-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {items.length} {items.length === 1 ? 'tarea vencida' : 'tareas vencidas'}
            </p>
            <p className="text-xs text-ink-muted">Sáltalas o tráelas al día de hoy.</p>
          </div>
          <button
            onClick={close}
            aria-label="Cerrar aviso"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ul className="max-h-64 overflow-y-auto px-2 py-2">
          {items.map((t, i) => (
            <li
              key={t.id}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5"
              style={{ animation: 'sheet-up 0.3s ease-out both', animationDelay: `${120 + i * 70}ms` }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{t.title}</span>
                <span className="block text-[11px] text-ink-faint">{t.dueAt !== null && formatDue(t.dueAt)}</span>
              </span>
              <button
                onClick={() => void handle(skipOverdue, [t.id])}
                aria-label={`Saltar ${t.title}`}
                title="Saltar"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line/10 text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <ForwardIcon className="size-4" />
              </button>
              <button
                onClick={() => void handle(moveOverdueToToday, [t.id])}
                aria-label={`Agregar ${t.title} a hoy`}
                title="Agregar a hoy"
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line/10 text-ink-dim transition-colors hover:bg-accent-500/10 hover:text-accent-400"
              >
                <SunIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2 border-t border-line/5 px-4 py-3">
          <button
            onClick={() => void handle(skipOverdue, allIds)}
            disabled={busy}
            className="flex-1 rounded-xl border border-line/10 px-3 py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-50"
          >
            Saltar todas
          </button>
          <button
            onClick={() => void handle(moveOverdueToToday, allIds)}
            disabled={busy}
            className="flex-1 rounded-xl bg-accent-600 px-3 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-50"
          >
            Agregar a hoy
          </button>
        </div>
      </div>
    </div>
  )
}
