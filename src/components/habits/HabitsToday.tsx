import { useEffect, useId, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Habit } from '../../db/types'
import { emitConfigOpened, onConfigOpened } from '../../lib/events'
import { localDateKey } from '../../lib/dates'
import { habitEnded, isScheduledToday } from '../../lib/habits'
import { HabitCard } from './HabitCard'
import { HabitDetailSheet } from './HabitDetailSheet'

/**
 * Hábitos que tocan hoy, partidos en pendientes y completados. Al completar,
 * la tarjeta se queda unos segundos entre las pendientes ("lingering", para
 * ver la animación del combo) y luego baja a Completados.
 * El lingering se deriva DURANTE el render (patrón de estado derivado): en un
 * efecto, el render intermedio desmontaría la tarjeta un instante y perdería
 * su estado (la animación del combo nunca llegaba a verse).
 */
export function useTodayHabits(): { pendingHabits: Habit[]; completedHabits: Habit[] } {
  const habits = useLiveQuery(() => db.habits.toArray(), [])
  const todayKey = localDateKey()
  const logsRaw = useLiveQuery(() => db.habitLogs.where('dateKey').equals(todayKey).toArray(), [todayKey])

  const [lingering, setLingering] = useState<Set<string>>(new Set())
  const prevDoneIds = useRef<Set<string> | null>(null)
  const doneIds = new Set((logsRaw ?? []).map((l) => l.habitId))

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

  const today = (habits ?? []).filter((h) => isScheduledToday(h) && !habitEnded(h))
  return {
    pendingHabits: today.filter((h) => !doneIds.has(h.id) || lingering.has(h.id)),
    completedHabits: today.filter((h) => doneIds.has(h.id) && !lingering.has(h.id)),
  }
}

interface HabitsTodayProps {
  /** 'pending': solo las tarjetas, para incrustar dentro de la sección "Hoy".
      'completed': sección plegable (plegada por defecto) al fondo de la pestaña. */
  section?: 'pending' | 'completed'
}

/** Hábitos que tocan hoy, integrados con las tareas de la pestaña Hoy. */
export function HabitsToday({ section = 'pending' }: HabitsTodayProps) {
  const { pendingHabits, completedHabits } = useTodayHabits()
  // Plegable de completados (plegado por defecto, como "Completadas hoy").
  const [open, setOpen] = useState(false)
  // Tocar un hábito abre su hoja de ajustes (como el menú de una tarea).
  // Solo un panel de configuración a la vez en toda la app: al abrir se avisa
  // (cierra el detalle de tarea u otras hojas) y se escucha para cerrarse.
  const instanceId = useId()
  const [editingId, setEditingId] = useState<string | null>(null)
  const openHabit = (id: string) => {
    emitConfigOpened(instanceId)
    setEditingId(id)
  }
  useEffect(
    () =>
      onConfigOpened((d) => {
        if (d.source !== instanceId) setEditingId(null)
      }),
    [instanceId],
  )

  const sheet = editingId && <HabitDetailSheet habitId={editingId} onClose={() => setEditingId(null)} />

  if (section === 'pending') {
    if (pendingHabits.length === 0) return null
    return (
      <>
        {pendingHabits.map((h) => (
          <HabitCard key={h.id} habit={h} compact onManage={() => openHabit(h.id)} />
        ))}
        {sheet}
      </>
    )
  }

  if (completedHabits.length === 0) return null
  return (
    <section className="space-y-2">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-1 text-sm font-semibold text-ink-muted transition-colors hover:text-ink-dim"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        Hábitos completados <span className="text-xs font-normal text-ink-faint">{completedHabits.length}</span>
      </button>
      {open && (
        <div className="space-y-2 opacity-75">
          {completedHabits.map((h) => (
            <HabitCard key={h.id} habit={h} compact onManage={() => openHabit(h.id)} />
          ))}
        </div>
      )}
      {sheet}
    </section>
  )
}
