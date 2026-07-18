import type { Priority, Task } from '../db/types'
import { PRIORITY_WEIGHT } from './priority'

const NO_DUE = Number.MAX_SAFE_INTEGER

// Sin prioridad pesa menos que "baja": esas tareas van al final de su fecha.
const weight = (p: Priority | null) => (p ? PRIORITY_WEIGHT[p] : -1)

/** Medianoche local del día de la tarea (sin fecha → al final del todo). */
const dayOf = (t: Task) => {
  if (t.dueAt === null) return NO_DUE
  const d = new Date(t.dueAt)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Pendientes, como una agenda: día más próximo primero; dentro del día, las
 * tareas CON hora en orden cronológico y las de solo-fecha después; a igualdad,
 * prioridad alta primero y por último las más antiguas. Sin fecha, al final.
 */
export function sortPending(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const byDay = dayOf(a) - dayOf(b)
    if (byDay !== 0) return byDay
    if (a.dueHasTime !== b.dueHasTime) return a.dueHasTime ? -1 : 1
    return (
      (a.dueAt ?? NO_DUE) - (b.dueAt ?? NO_DUE) ||
      weight(b.priority) - weight(a.priority) ||
      a.createdAt - b.createdAt
    )
  })
}

/** Completadas: la más reciente primero. */
export function sortCompleted(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
}
