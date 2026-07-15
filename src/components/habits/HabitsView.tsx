import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { createHabit } from '../../db/repo/habits'
import { dateInputToMs, msToDateInput, startOfDayOffset, startOfToday } from '../../lib/dates'
import { COMBO_TIERS, habitEnded, RAINBOW_GRADIENT } from '../../lib/habits'
import { TimeSelect } from '../ui/TimeSelect'
import { DayPicker } from './DayPicker'
import { HabitCard } from './HabitCard'
import { HabitDetailSheet } from './HabitDetailSheet'

const inputClass =
  'w-full rounded-lg border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60'

export function HabitsView() {
  const habits = useLiveQuery(() => db.habits.toArray(), []) ?? []
  const [title, setTitle] = useState('')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [endDate, setEndDate] = useState(() => startOfDayOffset(30))
  const [indefinite, setIndefinite] = useState(false)
  const [reminderTime, setReminderTime] = useState('')
  const [pomodoroMin, setPomodoroMin] = useState('')
  // Tocar un hábito abre su hoja de ajustes.
  const [editingId, setEditingId] = useState<string | null>(null)

  const active = habits.filter((h) => !habitEnded(h)).sort((a, b) => a.createdAt - b.createdAt)
  const finished = habits.filter((h) => habitEnded(h)).sort((a, b) => (b.endDate ?? 0) - (a.endDate ?? 0))

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t || days.length === 0) return
    void createHabit({
      title: t,
      daysOfWeek: days,
      startDate: startOfToday(),
      endDate: indefinite ? null : endDate,
      reminderTime: reminderTime || null,
      pomodoroMinutes: pomodoroMin ? Number(pomodoroMin) : null,
    })
    setTitle('')
    setReminderTime('')
    setPomodoroMin('')
  }

  return (
    <div className="space-y-5">
      {/* Crear hábito */}
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line/5 glass-panel p-4">
        <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">Nuevo hábito</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej. Leer 20 minutos, salir a caminar…"
          aria-label="Título del hábito"
          className={inputClass}
        />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="space-y-1.5">
            <span className="block text-[11px] text-ink-faint">Días a cumplir</span>
            <DayPicker value={days} onChange={setDays} />
          </div>
          <div className="space-y-1.5">
            <span className="block text-[11px] text-ink-faint">Hasta</span>
            <div className="flex items-center gap-2.5">
              <input
                type="date"
                value={msToDateInput(endDate)}
                min={msToDateInput(startOfToday())}
                disabled={indefinite}
                onChange={(e) => {
                  const ms = dateInputToMs(e.target.value)
                  if (ms !== null) setEndDate(ms)
                }}
                aria-label="Fecha límite del hábito"
                className="rounded-lg border border-line/10 glass-input px-3 py-1.5 text-sm text-ink outline-none focus:border-accent-500/60 disabled:opacity-40"
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-dim">
                <input
                  type="checkbox"
                  checked={indefinite}
                  onChange={(e) => setIndefinite(e.target.checked)}
                  aria-label="Hábito indefinido"
                  className="size-4 accent-accent-500"
                />
                Indefinido
              </label>
            </div>
          </div>
          <label className="space-y-1.5">
            <span className="block text-[11px] text-ink-faint">Recordarme a las</span>
            <TimeSelect value={reminderTime} onChange={setReminderTime} noneLabel="Sin aviso" ariaLabel="Hora del aviso del hábito" />
          </label>
          <label className="space-y-1.5">
            <span className="block text-[11px] text-ink-faint">Pomodoro</span>
            <select
              value={pomodoroMin}
              onChange={(e) => setPomodoroMin(e.target.value)}
              aria-label="Minutos de pomodoro del hábito"
              className="rounded-md border border-line/10 glass-input px-2 py-1 text-sm text-ink outline-none focus:border-accent-500/60"
            >
              <option value="">Sin pomodoro</option>
              {[10, 15, 25, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={!title.trim() || days.length === 0}
            className="ml-auto rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-40"
          >
            Crear hábito
          </button>
        </div>
      </form>

      {/* Hábitos activos */}
      {active.length === 0 && finished.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl glass-panel text-3xl">🔁</div>
          <p className="font-medium text-ink-dim">Aún no tienes hábitos</p>
          <p className="max-w-sm text-sm text-ink-faint">
            Crea uno arriba y cúmplelo en sus días: cada racha es un <strong>COMBO</strong> que sube de color
            por el arcoíris y multiplica tu XP.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((h) => (
            <HabitCard key={h.id} habit={h} onManage={() => setEditingId(h.id)} />
          ))}
        </div>
      )}

      {finished.length > 0 && (
        <div className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-ink-muted">
            Finalizados <span className="text-xs font-normal text-ink-faint">{finished.length}</span>
          </h2>
          {finished.map((h) => (
            <HabitCard key={h.id} habit={h} onManage={() => setEditingId(h.id)} />
          ))}
        </div>
      )}

      {editingId && <HabitDetailSheet habitId={editingId} onClose={() => setEditingId(null)} />}

      {/* Leyenda de la escalera de combos */}
      <div className="rounded-2xl border border-line/5 glass-panel p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">
          Escalera de combos (cada cumplimiento sube el color y el XP)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {COMBO_TIERS.map((tier) => (
            <span
              key={tier.combo}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
              style={{ background: tier.name === 'arcoíris' ? RAINBOW_GRADIENT : tier.color }}
            >
              {tier.combo === 7 ? '7+' : tier.combo} · ×{tier.mult} XP {tier.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
