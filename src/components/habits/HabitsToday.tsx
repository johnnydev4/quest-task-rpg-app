import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { localDateKey } from '../../lib/dates'
import { habitEnded, isScheduledToday } from '../../lib/habits'
import { HabitCard } from './HabitCard'

interface HabitsTodayProps {
  onManage: () => void
  /** 'pending' se muestra arriba de las tareas; 'completed' al fondo de la pestaña Hoy. */
  section?: 'pending' | 'completed'
}

/** Hábitos que tocan hoy, destacados entre las tareas normales de la pestaña Hoy. */
export function HabitsToday({ onManage, section = 'pending' }: HabitsTodayProps) {
  const habits = useLiveQuery(() => db.habits.toArray(), [])
  const todayKey = localDateKey()
  const logsRaw = useLiveQuery(() => db.habitLogs.where('dateKey').equals(todayKey).toArray(), [todayKey])
  const todayLogs = logsRaw ?? []

  // Al completar, la tarjeta se queda unos segundos entre las pendientes
  // (para ver la animación del combo) y luego baja a Completados.
  // El "lingering" se deriva DURANTE el render (patrón de estado derivado):
  // si se hiciera en un efecto, el render intermedio desmontaría la tarjeta
  // un instante y perdería su estado (la animación del combo nunca salía).
  const [lingering, setLingering] = useState<Set<string>>(new Set())
  const prevDoneIds = useRef<Set<string> | null>(null)
  const doneIds = new Set(todayLogs.map((l) => l.habitId))

  if (logsRaw !== undefined) {
    if (prevDoneIds.current === null) {
      // Primera carga: lo ya cumplido va directo a Completados, sin animación.
      prevDoneIds.current = doneIds
    } else {
      const newlyDone = [...doneIds].filter((id) => !prevDoneIds.current!.has(id))
      prevDoneIds.current = doneIds
      if (newlyDone.length > 0) {
        // setState en fase de render: React re-renderiza antes de tocar el DOM.
        setLingering((s) => new Set([...s, ...newlyDone]))
      }
    }
  }

  useEffect(() => {
    if (lingering.size === 0) return
    const t = setTimeout(() => setLingering(new Set()), 2600)
    return () => clearTimeout(t)
  }, [lingering])

  if (!habits) return null

  const today = habits.filter((h) => isScheduledToday(h) && !habitEnded(h))
  if (today.length === 0) return null

  if (section === 'pending') {
    const pending = today.filter((h) => !doneIds.has(h.id) || lingering.has(h.id))
    if (pending.length === 0) return null
    return (
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold text-ink-muted">
          Hábitos de hoy <span className="text-xs font-normal text-ink-faint">{pending.length}</span>
        </h2>
        <div className="space-y-2">
          {pending.map((h) => (
            <HabitCard key={h.id} habit={h} compact onManage={onManage} />
          ))}
        </div>
      </section>
    )
  }

  const completed = today.filter((h) => doneIds.has(h.id) && !lingering.has(h.id))
  if (completed.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-ink-muted">
        Hábitos completados <span className="text-xs font-normal text-ink-faint">{completed.length}</span>
      </h2>
      <div className="space-y-2 opacity-75">
        {completed.map((h) => (
          <HabitCard key={h.id} habit={h} compact onManage={onManage} />
        ))}
      </div>
    </section>
  )
}
