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

/**
 * XP por cumplir el hábito hoy, escalado por el combo alcanzado:
 * combo 1 → 10 XP, y +2 por cada eslabón extra, hasta 50 XP.
 */
export function xpForCombo(combo: number): number {
  return Math.min(50, 8 + Math.max(1, combo) * 2)
}

/** Colores del combo en orden del arcoíris: a más combo, más alto el color. */
export const COMBO_TIERS: { min: number; color: string; name: string }[] = [
  { min: 30, color: '#8b5cf6', name: 'violeta' },
  { min: 21, color: '#6366f1', name: 'índigo' },
  { min: 15, color: '#3b82f6', name: 'azul' },
  { min: 10, color: '#22c55e', name: 'verde' },
  { min: 6, color: '#eab308', name: 'amarillo' },
  { min: 3, color: '#f97316', name: 'naranja' },
  { min: 1, color: '#ef4444', name: 'rojo' },
]

export function comboColor(combo: number): string {
  for (const tier of COMBO_TIERS) {
    if (combo >= tier.min) return tier.color
  }
  return '#94a3b8' // sin combo: gris neutro
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
    if (d.getTime() <= habit.endDate && habit.daysOfWeek.includes(d.getDay())) {
      const key = habitDayKey(d)
      if (doneKeys.has(key)) combo++
      else if (key !== todayKey) break
    }
    d.setDate(d.getDate() - 1)
  }
  return combo
}

/** Total de ocurrencias programadas entre inicio y fin (para la barra de progreso). */
export function countScheduled(habit: Habit): number {
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
    d.getTime() <= habit.endDate &&
    habit.daysOfWeek.includes(d.getDay())
  )
}

export function habitEnded(habit: Habit, now = new Date()): boolean {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return habit.endDate < d.getTime()
}
