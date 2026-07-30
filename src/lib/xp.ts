import type { Priority } from '../db/types'
import { xpForLevel } from './level'

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

/** El tope diario de XP empieza a aplicarse en este nivel. */
export const DAILY_CAP_FROM_LEVEL = 3
/** Por día solo se puede ganar esta fracción del XP que pide el nivel actual. */
export const DAILY_CAP_RATIO = 0.2

/**
 * XP máximo que se puede ganar hoy, o `null` si el nivel aún no tiene tope.
 * A partir del nivel 3 hace falta un mínimo de 5 días activos para subir.
 */
export function dailyXpCap(level: number): number | null {
  if (level < DAILY_CAP_FROM_LEVEL) return null
  return Math.round(xpForLevel(level) * DAILY_CAP_RATIO)
}
