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

export type TaskSortMode = 'agenda' | 'name' | 'priority' | 'created' | 'manual'

export const TASK_SORT_OPTIONS: { id: TaskSortMode; label: string }[] = [
  { id: 'agenda', label: 'Fecha y hora' },
  { id: 'name', label: 'Nombre (A–Z)' },
  { id: 'priority', label: 'Prioridad' },
  { id: 'created', label: 'Añadidas primero' },
  { id: 'manual', label: 'Manual (arrastrar)' },
]

/** Posición manual; las tareas antiguas usan su fecha de creación. */
const slot = (t: Task) => t.order ?? t.createdAt

const byName = (a: Task, b: Task) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })

/** Orden de agenda: día más próximo → con hora antes que solo-fecha → prioridad → antigüedad. */
function byAgenda(a: Task, b: Task): number {
  const d = dayOf(a) - dayOf(b)
  if (d !== 0) return d
  if (a.dueHasTime !== b.dueHasTime) return a.dueHasTime ? -1 : 1
  return (
    (a.dueAt ?? NO_DUE) - (b.dueAt ?? NO_DUE) ||
    weight(b.priority) - weight(a.priority) ||
    a.createdAt - b.createdAt
  )
}

/**
 * Pendientes ordenadas según el modo elegido por el usuario. Por defecto,
 * agenda (día/hora). "name" alfabético, "priority" por prioridad y luego
 * agenda, "created" las más recientes primero.
 */
export function sortPending(tasks: Task[], mode: TaskSortMode = 'agenda'): Task[] {
  const arr = [...tasks]
  switch (mode) {
    case 'name':
      return arr.sort(byName)
    case 'priority':
      return arr.sort((a, b) => weight(b.priority) - weight(a.priority) || byAgenda(a, b))
    case 'created':
      return arr.sort((a, b) => b.createdAt - a.createdAt)
    case 'manual':
      return arr.sort((a, b) => slot(a) - slot(b) || a.createdAt - b.createdAt)
    case 'agenda':
    default:
      return arr.sort(byAgenda)
  }
}

/** Completadas: la más reciente primero. */
export function sortCompleted(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
}
