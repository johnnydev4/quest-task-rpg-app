import type { Priority, Task } from '../db/types'
import { PRIORITY_WEIGHT } from './priority'

const NO_DUE = Number.MAX_SAFE_INTEGER

// Sin prioridad pesa menos que "baja": esas tareas van al final de su fecha.
const weight = (p: Priority | null) => (p ? PRIORITY_WEIGHT[p] : -1)

/** Pendientes: fecha más próxima primero (sin fecha al final), luego prioridad alta, luego más antiguas. */
export function sortPending(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      (a.dueAt ?? NO_DUE) - (b.dueAt ?? NO_DUE) ||
      weight(b.priority) - weight(a.priority) ||
      a.createdAt - b.createdAt,
  )
}

/** Completadas: la más reciente primero. */
export function sortCompleted(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
}
