import type { Priority } from '../db/types'

/** XP otorgado al completar una tarea, ponderado por prioridad (spec §7). */
export const XP_BY_PRIORITY: Record<Priority, number> = {
  low: 10,
  medium: 25,
  high: 50,
}

/** XP de una tarea sin prioridad asignada. */
export const XP_NO_PRIORITY = 20

export function xpForPriority(priority: Priority | null): number {
  return priority ? XP_BY_PRIORITY[priority] : XP_NO_PRIORITY
}

/** Las subtareas dan XP menor (spec §7). */
export const SUBTASK_XP = 5
