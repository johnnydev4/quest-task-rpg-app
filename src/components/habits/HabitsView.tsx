import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { createHabit } from '../../db/repo/habits'
import { dateInputToMs, msToDateInput, startOfDayOffset, startOfToday } from '../../lib/dates'
import { COMBO_TIERS, habitEnded } from '../../lib/habits'
import { DayPicker } from './DayPicker'
import { HabitCard } from './HabitCard'

const inputClass =
  'w-full rounded-lg border border-line/10 bg-surface-700 px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60'

export function HabitsView() {
  const habits = useLiveQuery(() => db.habits.toArray(), []) ?? []
  const [title, setTitle] = useState('')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [endDate, setEndDate] = useState(() => startOfDayOffset(30))

  const active = habits.filter((h) => !habitEnded(h)).sort((a, b) => a.createdAt - b.createdAt)
  const finished = habits.filter((h) => habitEnded(h)).sort((a, b) => b.endDate - a.endDate)

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t || days.length === 0) return
    void createHabit({ title: t, daysOfWeek: days, startDate: startOfToday(), endDate })
    setTitle('')
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
          <label className="space-y-1.5">
            <span className="block text-[11px] text-ink-faint">Hasta</span>
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
            por el arcoíris y multiplica tu XP. ⚡
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((h) => (
            <HabitCard key={h.id} habit={h} />
          ))}
        </div>
      )}

      {finished.length > 0 && (
        <div className="space-y-3">
          <h2 className="px-1 text-sm font-semibold text-ink-muted">
            Finalizados <span className="text-xs font-normal text-ink-faint">{finished.length}</span>
          </h2>
          {finished.map((h) => (
            <HabitCard key={h.id} habit={h} />
          ))}
        </div>
      )}

      {/* Leyenda del arcoíris de combos */}
      <div className="rounded-2xl border border-line/5 glass-panel p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">
          Escalera de combos ⚡ (más combo → más color → más XP)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {[...COMBO_TIERS].reverse().map((tier) => (
            <span
              key={tier.min}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
              style={{ backgroundColor: tier.color }}
            >
              ×{tier.min}+ {tier.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
