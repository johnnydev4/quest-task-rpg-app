/** Medianoche local de hoy. Se usa la API de Date (no aritmética de ms) para respetar cambios de horario. */
export function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function startOfDayOffset(days: number): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function isOverdue(dueAt: number): boolean {
  return dueAt < startOfToday()
}

export function formatDue(dueAt: number): string {
  if (dueAt >= startOfToday() && dueAt < startOfDayOffset(1)) return 'Hoy'
  if (dueAt >= startOfDayOffset(1) && dueAt < startOfDayOffset(2)) return 'Mañana'
  if (dueAt >= startOfDayOffset(-1) && dueAt < startOfToday()) return 'Ayer'
  if (dueAt >= startOfDayOffset(-2) && dueAt < startOfDayOffset(-1)) return 'Anteayer'
  const withYear = new Date(dueAt).getFullYear() !== new Date().getFullYear()
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(dueAt)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Clave de día local 'YYYY-MM-DD' (con desplazamiento opcional en días). Se usa para las rachas. */
export function localDateKey(offsetDays = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Convierte ms → valor de <input type="date"> en zona local. */
export function msToDateInput(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Convierte valor de <input type="date"> → ms a medianoche local. */
export function dateInputToMs(value: string): number | null {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** Convierte ms → valor de <input type="datetime-local"> en zona local. */
export function msToDateTimeInput(ms: number | null): string {
  if (ms === null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convierte valor de <input type="datetime-local"> → ms locales. */
export function dateTimeInputToMs(value: string): number | null {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

export function formatDueTime(ms: number): string {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(ms)
}

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms)
}
