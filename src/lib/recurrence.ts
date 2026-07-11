import type { RecurrenceRule, RecurrenceUnit } from '../db/types'

export const RECURRENCE_UNITS: { id: RecurrenceUnit; label: string; plural: string }[] = [
  { id: 'day', label: 'día', plural: 'días' },
  { id: 'week', label: 'semana', plural: 'semanas' },
  { id: 'month', label: 'mes', plural: 'meses' },
  { id: 'year', label: 'año', plural: 'años' },
]

/** Próxima ocurrencia a partir de una fecha base, usando la API de Date (respeta meses/años irregulares). */
export function nextOccurrence(fromMs: number, rule: RecurrenceRule): number {
  const d = new Date(fromMs)
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
  const unit = RECURRENCE_UNITS.find((u) => u.id === rule.unit)!
  const base = rule.every === 1 ? `Cada ${unit.label}` : `Cada ${rule.every} ${unit.plural}`
  if (rule.end.type === 'count') return `${base} · ${rule.end.remaining} veces más`
  if (rule.end.type === 'until') {
    const f = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(rule.end.date)
    return `${base} · hasta ${f}`
  }
  return base
}
