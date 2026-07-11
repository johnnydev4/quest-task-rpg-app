import type { Task } from '../db/types'
import { PRIORITY_WEIGHT } from './priority'

const NO_DUE = Number.MAX_SAFE_INTEGER

/** Pendientes: fecha más próxima primero (sin fecha al final), luego prioridad alta, luego más antiguas. */
export function sortPending(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      (a.dueAt ?? NO_DUE) - (b.dueAt ?? NO_DUE) ||
      PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
      a.createdAt - b.createdAt,
  )
}

/** Completadas: la más reciente primero. */
export function sortCompleted(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
}
