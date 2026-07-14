import type { Habit } from '../db/types'

/** Orden de la semana para la UI (lunes primero); los valores son getDay(). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const WEEKDAY_SHORT: Record<number, string> = {
  1: 'L',
  2: 'M',
  3: 'X',
  4: 'J',
  5: 'V',
  6: 'S',
  0: 'D',
}

const pad = (n: number) => String(n).padStart(2, '0')

export function habitDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** XP base de una tarea normal; los combos lo multiplican. */
export const HABIT_BASE_XP = 20

/**
 * Escalera de combos: el color cambia con CADA cumplimiento consecutivo
 * y el multiplicador de XP sube medio punto por eslabón, hasta ×4.
 */
export const COMBO_TIERS: { combo: number; mult: number; color: string; name: string }[] = [
  { combo: 1, mult: 1, color: '#ef4444', name: 'rojo' },
  { combo: 2, mult: 1.5, color: '#f97316', name: 'naranja' },
  { combo: 3, mult: 2, color: '#eab308', name: 'amarillo' },
  { combo: 4, mult: 2.5, color: '#22c55e', name: 'verde' },
  { combo: 5, mult: 3, color: '#3b82f6', name: 'azul' },
  { combo: 6, mult: 3.5, color: '#a855f7', name: 'morado' },
  { combo: 7, mult: 4, color: '#ef4444', name: 'arcoíris' },
]

export const RAINBOW_GRADIENT =
  'linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7)'

export function comboTier(combo: number) {
  const idx = Math.min(Math.max(combo, 1), COMBO_TIERS.length) - 1
  return COMBO_TIERS[idx]
}

/** ¿El combo alcanzó el nivel arcoíris (7 o más)? */
export function comboIsRainbow(combo: number): boolean {
  return combo >= 7
}

/** XP por cumplir el hábito: 20 base × multiplicador del combo (20…80). */
export function xpForCombo(combo: number): number {
  if (combo <= 0) return HABIT_BASE_XP
  return Math.round(HABIT_BASE_XP * comboTier(combo).mult)
}

/** Color sólido representativo del combo (para bordes y tintes). */
export function comboColor(combo: number): string {
  if (combo <= 0) return '#94a3b8' // sin combo: gris neutro
  return comboTier(combo).color
}

/** Fondo CSS del combo: color sólido, o el degradado arcoíris a partir de 7. */
export function comboBackground(combo: number): string {
  if (comboIsRainbow(combo)) return RAINBOW_GRADIENT
  return comboColor(combo)
}

/**
 * COMBO actual: días programados consecutivos cumplidos, contando hacia atrás.
 * El día de hoy programado pero aún sin cumplir no rompe el combo (queda tiempo);
 * cualquier otro día programado sin cumplir lo corta.
 */
export function computeCombo(habit: Habit, doneKeys: Set<string>, now = new Date()): number {
  if (habit.daysOfWeek.length === 0) return 0
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const todayKey = habitDayKey(d)
  let combo = 0
  for (let i = 0; i < 400; i++) {
    if (d.getTime() < habit.startDate) break
    if ((habit.endDate === null || d.getTime() <= habit.endDate) && habit.daysOfWeek.includes(d.getDay())) {
      const key = habitDayKey(d)
      if (doneKeys.has(key)) combo++
      else if (key !== todayKey) break
    }
    d.setDate(d.getDate() - 1)
  }
  return combo
}

/**
 * Total de ocurrencias programadas entre inicio y fin (para la barra de progreso).
 * Los hábitos indefinidos no tienen total: devuelve null.
 */
export function countScheduled(habit: Habit): number | null {
  if (habit.endDate === null) return null
  if (habit.daysOfWeek.length === 0) return 0
  const d = new Date(habit.startDate)
  let count = 0
  for (let i = 0; i < 800 && d.getTime() <= habit.endDate; i++) {
    if (habit.daysOfWeek.includes(d.getDay())) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

export function isScheduledToday(habit: Habit, now = new Date()): boolean {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return (
    d.getTime() >= habit.startDate &&
    (habit.endDate === null || d.getTime() <= habit.endDate) &&
    habit.daysOfWeek.includes(d.getDay())
  )
}

export function habitEnded(habit: Habit, now = new Date()): boolean {
  if (habit.endDate === null) return false
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return habit.endDate < d.getTime()
}
