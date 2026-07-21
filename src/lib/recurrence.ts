import type { RecurrenceRule, RecurrenceUnit } from '../db/types'

export const RECURRENCE_UNITS: { id: RecurrenceUnit; label: string; plural: string }[] = [
  { id: 'day', label: 'día', plural: 'días' },
  { id: 'week', label: 'semana', plural: 'semanas' },
  { id: 'month', label: 'mes', plural: 'meses' },
  { id: 'year', label: 'año', plural: 'años' },
]

/** Lunes a viernes (0=domingo … 6=sábado). */
export const WORKDAYS = [1, 2, 3, 4, 5]

const DAY_SHORT: Record<number, string> = { 0: 'dom', 1: 'lun', 2: 'mar', 3: 'mié', 4: 'jue', 5: 'vie', 6: 'sáb' }

export function isWorkdaysRule(rule: RecurrenceRule): boolean {
  const days = rule.daysOfWeek ?? []
  return days.length === WORKDAYS.length && WORKDAYS.every((d) => days.includes(d))
}

/** Próxima ocurrencia a partir de una fecha base, usando la API de Date (respeta meses/años irregulares). */
export function nextOccurrence(fromMs: number, rule: RecurrenceRule): number {
  const d = new Date(fromMs)
  // Días concretos de la semana: avanza día a día hasta el próximo del conjunto.
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    do {
      d.setDate(d.getDate() + 1)
    } while (!rule.daysOfWeek.includes(d.getDay()))
    return d.getTime()
  }
  switch (rule.unit) {
    case 'day':
      d.setDate(d.getDate() + rule.every)
      break
    case 'week':
      d.setDate(d.getDate() + rule.every * 7)
      break
    case 'month':
      d.setMonth(d.getMonth() + rule.every)
      break
    case 'year':
      d.setFullYear(d.getFullYear() + rule.every)
      break
  }
  return d.getTime()
}

/**
 * Primer día (a partir de `fromMs` INCLUSIVE) que cae en `daysOfWeek`.
 * Devuelve medianoche local de ese día.
 */
export function firstDayOfWeekOnOrAfter(fromMs: number, daysOfWeek: number[]): number {
  const d = new Date(fromMs)
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 7 && !daysOfWeek.includes(d.getDay()); i++) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** ¿La recurrencia permite crear la siguiente ocurrencia en `nextMs`? */
export function allowsNext(rule: RecurrenceRule, nextMs: number): boolean {
  if (rule.end.type === 'count') return rule.end.remaining > 0
  if (rule.end.type === 'until') return nextMs <= rule.end.date
  return true
}

/** Regla para la siguiente instancia (descuenta el contador si aplica). */
export function ruleForNext(rule: RecurrenceRule): RecurrenceRule {
  if (rule.end.type === 'count') {
    return { ...rule, end: { type: 'count', remaining: rule.end.remaining - 1 } }
  }
  return rule
}

export function describeRule(rule: RecurrenceRule): string {
  let base: string
  if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    base = isWorkdaysRule(rule)
      ? 'Días laborales'
      : `Cada ${[...rule.daysOfWeek]
          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)) // lunes primero
          .map((d) => DAY_SHORT[d])
          .join(', ')}`
  } else {
    const unit = RECURRENCE_UNITS.find((u) => u.id === rule.unit)!
    base = rule.every === 1 ? `Cada ${unit.label}` : `Cada ${rule.every} ${unit.plural}`
  }
  if (rule.end.type === 'count') return `${base} · ${rule.end.remaining} veces más`
  if (rule.end.type === 'until') {
    const f = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(rule.end.date)
    return `${base} · hasta ${f}`
  }
  return base
}
