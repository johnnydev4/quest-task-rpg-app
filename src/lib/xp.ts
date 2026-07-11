import type { Priority } from '../db/types'

/** XP otorgado al completar una tarea, ponderado por prioridad (spec §7). */
export const XP_BY_PRIORITY: Record<Priority, number> = {
  low: 10,
  medium: 25,
  high: 50,
}

/** Las subtareas dan XP menor (spec §7). */
export const SUBTASK_XP = 5
