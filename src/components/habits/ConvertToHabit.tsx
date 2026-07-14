import { useState } from 'react'
import type { Task } from '../../db/types'
import { createHabit } from '../../db/repo/habits'
import { deleteTask } from '../../db/repo/tasks'
import { emitToast } from '../../lib/events'
import { dateInputToMs, msToDateInput, startOfDayOffset, startOfToday } from '../../lib/dates'
import { DayPicker } from './DayPicker'

interface ConvertToHabitProps {
  task: Task
  onClose: () => void
  /** Empieza ya expandido (p. ej. dentro de una hoja que abre la configuración directamente). */
  autoOpen?: boolean
}

/**
 * Convierte una tarea en hábito: eliges los días y hasta cuándo; la tarea
 * desaparece de las listas y pasa a vivir en Hábitos como barra de progreso.
 */
export function ConvertToHabit({ task, onClose, autoOpen = false }: ConvertToHabitProps) {
  const [open, setOpen] = useState(autoOpen)
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [endDate, setEndDate] = useState(() => startOfDayOffset(30))

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-line/15 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-line/30 hover:text-ink-dim"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
        Convertir en hábito…
      </button>
    )
  }

  async function convert() {
    if (days.length === 0) return
    await createHabit({ title: task.title, daysOfWeek: days, startDate: startOfToday(), endDate })
    await deleteTask(task.id)
    emitToast({ title: 'Hábito creado 🔁', body: `${task.title} · empieza tu primer COMBO ⚡` })
    onClose()
  }

  return (
    <div className="space-y-3 rounded-lg border border-line/5 bg-surface-700/60 px-3 py-3">
      <p className="text-xs text-ink-muted">
        La tarea pasará a <strong className="text-ink-dim">Hábitos</strong> como barra de progreso con
        COMBOS. Elige los días y hasta cuándo:
      </p>
      <DayPicker value={days} onChange={setDays} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={msToDateInput(endDate)}
          min={msToDateInput(startOfToday())}
          onChange={(e) => {
            const ms = dateInputToMs(e.target.value)
            if (ms !== null) setEndDate(ms)
          }}
          aria-label="Fecha límite del hábito"
          className="rounded-lg border border-line/10 bg-surface-700 px-3 py-1.5 text-sm text-ink outline-none focus:border-accent-500/60"
        />
        <button
          type="button"
          onClick={() => void convert()}
          disabled={days.length === 0}
          className="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-40"
        >
          Convertir 🔁
        </button>
        {!autoOpen && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-line/10 px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-ink/5"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}
