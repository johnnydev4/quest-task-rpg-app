import type { RecurrenceEnd, Task } from '../../../db/types'
import { updateTask } from '../../../db/repo/tasks'
import { RECURRENCE_UNITS, describeRule } from '../../../lib/recurrence'
import { dateInputToMs, msToDateInput, startOfDayOffset } from '../../../lib/dates'
import { GlassSelect, numberOptions, type GlassOption } from '../../ui/GlassSelect'

interface RecurrenceSectionProps {
  task: Task
}

const dateInputClass =
  'rounded-lg border border-line/10 glass-input px-2.5 py-1 text-xs font-medium text-ink outline-none focus:border-accent-500/60'

/** Fin de recurrencia como opciones para el desplegable de cristal. */
const END_OPTIONS: GlassOption<'never' | 'count' | 'until'>[] = [
  { value: 'never', label: 'para siempre' },
  { value: 'count', label: 'N veces más' },
  { value: 'until', label: 'hasta fecha' },
]

export function RecurrenceSection({ task }: RecurrenceSectionProps) {
  const rule = task.recurrenceRule

  if (!rule) {
    return (
      <button
        type="button"
        onClick={() =>
          updateTask(task.id, { recurrenceRule: { every: 1, unit: 'day', end: { type: 'never' } } })
        }
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-line/15 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-line/30 hover:text-ink-dim"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
          <path d="m17 2 4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="m7 22-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
        Repetir tarea…
      </button>
    )
  }

  function setEnd(type: 'never' | 'count' | 'until') {
    const end: RecurrenceEnd =
      type === 'never'
        ? { type: 'never' }
        : type === 'count'
          ? { type: 'count', remaining: 5 }
          : { type: 'until', date: startOfDayOffset(30) }
    updateTask(task.id, { recurrenceRule: { ...rule!, end } })
  }

  return (
    <div className="space-y-2 rounded-lg border border-line/5 glass-input px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-dim">
        <span>Cada</span>
        <GlassSelect
          value={rule.every}
          options={numberOptions(1, 60)}
          onChange={(v) =>
            updateTask(task.id, { recurrenceRule: { ...rule, every: Math.max(1, v) } })
          }
          ariaLabel="Intervalo de repetición"
        />
        <GlassSelect
          value={rule.unit}
          options={RECURRENCE_UNITS.map((u) => ({
            value: u.id,
            label: rule.every === 1 ? u.label : u.plural,
          }))}
          onChange={(v) => updateTask(task.id, { recurrenceRule: { ...rule, unit: v } })}
          ariaLabel="Unidad de repetición"
        />
        <span>·</span>
        <GlassSelect
          value={rule.end.type}
          options={END_OPTIONS}
          onChange={(v) => setEnd(v)}
          ariaLabel="Fin de la recurrencia"
          minWidthClass="min-w-36"
        />
        {rule.end.type === 'count' && (
          <GlassSelect
            value={rule.end.remaining}
            options={numberOptions(1, 99)}
            onChange={(v) =>
              updateTask(task.id, {
                recurrenceRule: { ...rule, end: { type: 'count', remaining: Math.max(1, v) } },
              })
            }
            ariaLabel="Repeticiones restantes"
          />
        )}
        {rule.end.type === 'until' && (
          <input
            type="date"
            value={msToDateInput(rule.end.date)}
            onChange={(e) => {
              const ms = dateInputToMs(e.target.value)
              if (ms !== null)
                updateTask(task.id, { recurrenceRule: { ...rule, end: { type: 'until', date: ms } } })
            }}
            aria-label="Fecha de fin de recurrencia"
            className={dateInputClass}
          />
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[0.6875rem] text-ink-faint">{describeRule(rule)} — al completar se crea la siguiente</span>
        <button
          type="button"
          onClick={() => updateTask(task.id, { recurrenceRule: null })}
          className="text-[0.6875rem] text-ink-faint transition-colors hover:text-danger"
        >
          Quitar
        </button>
      </div>
    </div>
  )
}
