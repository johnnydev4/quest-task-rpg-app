import type { RecurrenceEnd, Task } from '../../../db/types'
import { updateTask } from '../../../db/repo/tasks'
import { RECURRENCE_UNITS, describeRule } from '../../../lib/recurrence'
import { dateInputToMs, msToDateInput, startOfDayOffset } from '../../../lib/dates'

interface RecurrenceSectionProps {
  task: Task
}

const selectClass =
  'rounded-md border border-line/10 bg-surface-700 px-2 py-1 text-xs text-ink outline-none focus:border-accent-500/60'

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
    <div className="space-y-2 rounded-lg border border-line/5 bg-surface-700/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-dim">
        <span>Cada</span>
        <input
          type="number"
          min={1}
          max={365}
          value={rule.every}
          onChange={(e) =>
            updateTask(task.id, {
              recurrenceRule: { ...rule, every: Math.max(1, Number(e.target.value) || 1) },
            })
          }
          aria-label="Intervalo de repetición"
          className={`${selectClass} w-14`}
        />
        <select
          value={rule.unit}
          onChange={(e) =>
            updateTask(task.id, {
              recurrenceRule: { ...rule, unit: e.target.value as typeof rule.unit },
            })
          }
          aria-label="Unidad de repetición"
          className={selectClass}
        >
          {RECURRENCE_UNITS.map((u) => (
            <option key={u.id} value={u.id}>
              {rule.every === 1 ? u.label : u.plural}
            </option>
          ))}
        </select>
        <span>·</span>
        <select
          value={rule.end.type}
          onChange={(e) => setEnd(e.target.value as 'never' | 'count' | 'until')}
          aria-label="Fin de la recurrencia"
          className={selectClass}
        >
          <option value="never">para siempre</option>
          <option value="count">N veces más</option>
          <option value="until">hasta fecha</option>
        </select>
        {rule.end.type === 'count' && (
          <input
            type="number"
            min={1}
            max={999}
            value={rule.end.remaining}
            onChange={(e) =>
              updateTask(task.id, {
                recurrenceRule: {
                  ...rule,
                  end: { type: 'count', remaining: Math.max(1, Number(e.target.value) || 1) },
                },
              })
            }
            aria-label="Repeticiones restantes"
            className={`${selectClass} w-14`}
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
            className={`${selectClass}`}
          />
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-faint">{describeRule(rule)} — al completar se crea la siguiente</span>
        <button
          type="button"
          onClick={() => updateTask(task.id, { recurrenceRule: null })}
          className="text-[11px] text-ink-faint transition-colors hover:text-danger"
        >
          Quitar
        </button>
      </div>
    </div>
  )
}
