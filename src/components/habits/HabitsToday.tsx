import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { habitEnded, isScheduledToday } from '../../lib/habits'
import { HabitCard } from './HabitCard'

/** Hábitos que tocan hoy, destacados entre las tareas normales de la pestaña Hoy. */
export function HabitsToday({ onManage }: { onManage: () => void }) {
  const habits = useLiveQuery(() => db.habits.toArray(), [])
  if (!habits) return null

  const today = habits.filter((h) => isScheduledToday(h) && !habitEnded(h))
  if (today.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-semibold text-ink-muted">
        Hábitos de hoy <span className="text-xs font-normal text-ink-faint">{today.length}</span>
      </h2>
      <div className="space-y-2">
        {today.map((h) => (
          <HabitCard key={h.id} habit={h} compact onManage={onManage} />
        ))}
      </div>
    </section>
  )
}
