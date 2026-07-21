import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { deleteHabit, updateHabit } from '../../db/repo/habits'
import { formatDateTime, startOfDayOffset } from '../../lib/dates'
import { emitToast } from '../../lib/events'
import { pomodoro } from '../../services/pomodoro'
import { ConfirmButton } from '../ui/ConfirmButton'
import { MiniCalendar } from '../ui/MiniCalendar'
import { Sheet } from '../ui/Sheet'
import { TimeSelect } from '../ui/TimeSelect'
import { CustomMinutesInput } from '../tasks/TaskDetail'
import { DayPicker } from './DayPicker'

const POMODORO_PRESETS = [10, 15, 25, 45, 60, 90]

/**
 * Hoja de ajustes de un hábito (como el menú de una tarea): título, días,
 * fecha límite o indefinido, hora del aviso, pomodoro y eliminar.
 */
export function HabitDetailSheet({ habitId, onClose }: { habitId: string; onClose: () => void }) {
  const habit = useLiveQuery(() => db.habits.get(habitId), [habitId])
  const lists = useLiveQuery(() => db.lists.orderBy('order').toArray(), []) ?? []
  // Último cumplimiento con su hora exacta (los registros viejos solo tienen createdAt).
  const lastDone = useLiveQuery(async () => {
    const logs = await db.habitLogs.where('habitId').equals(habitId).toArray()
    const stamps = logs.map((l) => l.completedAt ?? l.createdAt)
    return stamps.length > 0 ? Math.max(...stamps) : null
  }, [habitId])
  const [title, setTitle] = useState<string | null>(null)
  const [calOpen, setCalOpen] = useState(false)

  if (!habit) return null

  const endLabel =
    habit.endDate === null
      ? 'Indefinido'
      : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(habit.endDate)

  function saveTitle() {
    if (!habit || title === null) return
    const t = title.trim()
    if (t && t !== habit.title) void updateHabit(habit.id, { title: t })
    setTitle(null)
  }

  const sectionLabel = 'block text-xs font-semibold tracking-wide text-ink-faint uppercase'

  return (
    <Sheet title="Ajustar hábito" onClose={onClose}>
      <div className="space-y-5 pb-2">
        {/* Título */}
        <input
          value={title ?? habit.title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Título del hábito"
          className="w-full border-none bg-transparent text-xl font-semibold text-ink outline-none focus:shadow-none"
        />

        {/* Días programados */}
        <div className="space-y-2">
          <span className={sectionLabel}>Días a cumplir</span>
          <DayPicker
            value={habit.daysOfWeek}
            onChange={(days) => days.length > 0 && void updateHabit(habit.id, { daysOfWeek: [...days].sort() })}
          />
        </div>

        {/* Fecha límite / indefinido */}
        <div className="space-y-2">
          <span className={sectionLabel}>Duración</span>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-dim">
              <input
                type="checkbox"
                checked={habit.endDate === null}
                onChange={(e) =>
                  void updateHabit(habit.id, { endDate: e.target.checked ? null : startOfDayOffset(30) })
                }
                aria-label="Hábito indefinido"
                className="size-4 accent-accent-500"
              />
              Indefinido
            </label>
            {habit.endDate !== null && (
              <button
                type="button"
                onClick={() => setCalOpen((v) => !v)}
                aria-expanded={calOpen}
                className="flex items-center gap-1.5 rounded-lg border border-line/10 px-3 py-1.5 text-sm text-ink-dim transition-colors hover:bg-ink/5"
              >
                Hasta el {endLabel}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`size-3.5 transition-transform ${calOpen ? 'rotate-90' : ''}`} aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
          {habit.endDate !== null && calOpen && (
            <MiniCalendar
              // endDate ya es medianoche local, va directo
              value={habit.endDate}
              onSelect={(dayMs) => {
                void updateHabit(habit.id, { endDate: dayMs })
                setCalOpen(false)
              }}
            />
          )}
        </div>

        {/* Aviso */}
        <div className="space-y-2">
          <span className={sectionLabel}>Recordarme</span>
          <TimeSelect
            value={habit.reminderTime ?? ''}
            onChange={(v) => void updateHabit(habit.id, { reminderTime: v || null })}
            noneLabel="Sin aviso"
            ariaLabel="Hora del aviso del hábito"
          />
        </div>

        {/* Pomodoro */}
        <div className="space-y-2">
          <span className={sectionLabel}>Pomodoro</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void updateHabit(habit.id, { pomodoroMinutes: null })}
              aria-pressed={habit.pomodoroMinutes == null}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                habit.pomodoroMinutes == null
                  ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                  : 'border-line/10 text-ink-muted hover:bg-ink/5'
              }`}
            >
              Sin pomodoro
            </button>
            {POMODORO_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void updateHabit(habit.id, { pomodoroMinutes: m })}
                aria-pressed={habit.pomodoroMinutes === m}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  habit.pomodoroMinutes === m
                    ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                    : 'border-line/10 text-ink-muted hover:bg-ink/5'
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
          <CustomMinutesInput
            current={
              habit.pomodoroMinutes != null && !POMODORO_PRESETS.includes(habit.pomodoroMinutes)
                ? habit.pomodoroMinutes
                : null
            }
            onApply={(min) => void updateHabit(habit.id, { pomodoroMinutes: min })}
          />
          {habit.pomodoroMinutes != null && (
            <button
              type="button"
              onClick={() => {
                void pomodoro.start({ habitId: habit.id }).then(() => pomodoro.setMinimized(true))
                emitToast({ title: '🍅 Pomodoro iniciado', body: `${habit.title} · objetivo ${habit.pomodoroMinutes} min` })
                onClose()
              }}
              className="w-full rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-500"
            >
              ▶ Empezar ahora · objetivo {habit.pomodoroMinutes} min
            </button>
          )}
        </div>

        {/* Lista (atributo RPG): el XP del hábito sube ese atributo */}
        <div className="space-y-2">
          <span className={sectionLabel}>Lista</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void updateHabit(habit.id, { listId: null })}
              aria-pressed={habit.listId == null}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                habit.listId == null
                  ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                  : 'border-line/10 text-ink-muted hover:bg-ink/5'
              }`}
            >
              Sin lista
            </button>
            {lists.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => void updateHabit(habit.id, { listId: l.id })}
                aria-pressed={habit.listId === l.id}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  habit.listId === l.id
                    ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                    : 'border-line/10 text-ink-muted hover:bg-ink/5'
                }`}
              >
                <span
                  className={`size-2 rounded-full ${l.color ? '' : 'border-2 border-ink-muted'}`}
                  style={l.color ? { backgroundColor: l.color } : undefined}
                  aria-hidden="true"
                />
                {l.emoji ? `${l.emoji} ${l.name}` : l.name}
              </button>
            ))}
          </div>
        </div>

        {/* Eliminar */}
        <div className="flex items-center justify-between gap-3 border-t border-line/5 pt-3">
          <span className="min-w-0 text-xs text-ink-faint">
            {lastDone ? `Último cumplimiento: ${formatDateTime(lastDone)}` : 'Aún sin cumplimientos'}
          </span>
          <ConfirmButton
            label="Eliminar hábito"
            confirmLabel="¿Seguro? Toca de nuevo"
            onConfirm={async () => {
              await deleteHabit(habit.id)
              onClose()
            }}
          />
        </div>
      </div>
    </Sheet>
  )
}
