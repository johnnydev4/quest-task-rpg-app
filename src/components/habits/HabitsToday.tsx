import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { localDateKey } from '../../lib/dates'
import { habitEnded, isScheduledToday } from '../../lib/habits'
import { HabitCard } from './HabitCard'

/** Hábitos que tocan hoy, destacados entre las tareas normales de la pestaña Hoy. */
export function HabitsToday({ onManage }: { onManage: () => void }) {
  const habits = useLiveQuery(() => db.habits.toArray(), [])
  const todayKey = localDateKey()
  const todayLogs =
    useLiveQuery(() => db.habitLogs.where('dateKey').equals(todayKey).toArray(), [todayKey]) ?? []

  // Al completar, la tarjeta se queda unos segundos entre las pendientes
  // (para ver la animación del combo) y luego baja a Completados.
  const [lingering, setLingering] = useState<Set<string>>(new Set())
  const prevDoneIds = useRef<Set<string>>(new Set())
  const doneIds = new Set(todayLogs.map((l) => l.habitId))

  useEffect(() => {
    const newlyDone = [...doneIds].filter((id) => !prevDoneIds.current.has(id))
    prevDoneIds.current = doneIds
    if (newlyDone.length === 0) return
    setLingering((s) => new Set([...s, ...newlyDone]))
    const t = setTimeout(() => {
      setLingering((s) => {
        const next = new Set(s)
        newlyDone.forEach((id) => next.delete(id))
        return next
      })
    }, 2600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayLogs.length])

  if (!habits) return null

  const today = habits.filter((h) => isScheduledToday(h) && !habitEnded(h))
  if (today.length === 0) return null

  const pending = today.filter((h) => !doneIds.has(h.id) || lingering.has(h.id))
  const completed = today.filter((h) => doneIds.has(h.id) && !lingering.has(h.id))

  return (
    <>
      {pending.length > 0 && (
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
      )}
      {completed.length > 0 && (
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
      )}
    </>
  )
}
