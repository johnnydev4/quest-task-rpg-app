import type { Habit, HabitLog, List, StudySession, Tag, Task } from '../db/types'
import { PRIORITY_LABEL } from './priority'

export type StatsRange = '7d' | '30d' | '12m' | 'custom'

export interface Bucket {
  key: string
  label: string
  from: number
  to: number
}

const pad = (n: number) => String(n).padStart(2, '0')

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Genera cubetas diarias o mensuales para el rango elegido. */
export function makeBuckets(range: StatsRange, customFrom?: number, customTo?: number): Bucket[] {
  const buckets: Bucket[] = []
  const dayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
  // En vista Semana el eje muestra el nombre del día (p. ej. "lun 3").
  const weekFmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric' })
  const monthFmt = new Intl.DateTimeFormat('es', { month: 'short' })

  if (range === '12m') {
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      buckets.push({
        key: `${from.getFullYear()}-${pad(from.getMonth() + 1)}`,
        label: monthFmt.format(from),
        from: from.getTime(),
        to: to.getTime(),
      })
    }
    return buckets
  }

  let start: Date
  let end: Date
  if (range === 'custom' && customFrom !== undefined && customTo !== undefined) {
    start = new Date(customFrom)
    end = new Date(customTo)
  } else {
    end = new Date()
    start = new Date()
    start.setDate(start.getDate() - (range === '30d' ? 29 : 6))
  }
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  const cursor = new Date(start)
  // Máximo 92 días para que el eje siga siendo legible.
  for (let i = 0; cursor <= end && i < 92; i++) {
    const from = cursor.getTime()
    const next = new Date(cursor)
    next.setDate(next.getDate() + 1)
    const fmt = range === '7d' ? weekFmt : dayFmt
    buckets.push({ key: dayKey(cursor), label: fmt.format(cursor), from, to: next.getTime() })
    cursor.setDate(cursor.getDate() + 1)
  }
  return buckets
}

export type FocusEntityKind = 'task' | 'habit'

export interface FocusEntityOption {
  /** Clave compuesta `task:<id>` o `habit:<id>` para distinguir tarea de hábito. */
  key: string
  kind: FocusEntityKind
  title: string
  minutes: number
}

/** Tareas y hábitos con sesiones de foco registradas en el rango, ordenados por minutos. */
export function focusEntityOptions(
  sessions: StudySession[],
  tasks: Task[],
  habits: Habit[],
  from: number,
  to: number,
): FocusEntityOption[] {
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]))
  const habitTitle = new Map(habits.map((h) => [h.id, h.title]))
  const totals = new Map<string, number>()
  for (const s of sessions) {
    if (s.kind !== 'focus') continue
    if (s.startedAt < from || s.startedAt >= to) continue
    let key: string | null = null
    if (s.taskId && taskTitle.has(s.taskId)) key = `task:${s.taskId}`
    else if (s.habitId && habitTitle.has(s.habitId)) key = `habit:${s.habitId}`
    if (!key) continue
    totals.set(key, (totals.get(key) ?? 0) + s.focusMinutes)
  }
  return [...totals.entries()]
    .map(([key, minutes]) => {
      const [kind, id] = key.split(':') as [FocusEntityKind, string]
      const title = (kind === 'task' ? taskTitle.get(id) : habitTitle.get(id)) ?? 'Sin nombre'
      return { key, kind, title, minutes }
    })
    .sort((a, b) => b.minutes - a.minutes)
}

/** Minutos de foco de una tarea o hábito concreto, desglosados por cubeta (fecha). */
export function focusForEntityPerBucket(
  buckets: Bucket[],
  sessions: StudySession[],
  entityKey: string,
): { label: string; minutos: number }[] {
  const [kind, id] = entityKey.split(':') as [FocusEntityKind, string]
  const focus = sessions.filter(
    (s) => s.kind === 'focus' && (kind === 'task' ? s.taskId === id : s.habitId === id),
  )
  return buckets.map((b) => ({
    label: b.label,
    minutos: focus
      .filter((s) => s.startedAt >= b.from && s.startedAt < b.to)
      .reduce((sum, s) => sum + s.focusMinutes, 0),
  }))
}

export interface StatsData {
  tasksPerBucket: { label: string; tareas: number }[]
  focusPerBucket: { label: string; minutos: number }[]
  xpLine: { label: string; xp: number }[]
  byPriority: { name: string; value: number }[]
  byTag: { name: string; value: number; color: string }[]
  byList: { name: string; xp: number; color: string; nivel: number }[]
  streakHistory: { start: string; end: string; days: number }[]
  totals: { completed: number; focusMinutes: number }
}

export function computeStats(
  buckets: Bucket[],
  tasks: Task[],
  sessions: StudySession[],
  lists: List[],
  tags: Tag[],
): StatsData {
  const completed = tasks.filter((t) => t.completed && t.completedAt !== null)
  const rangeFrom = buckets[0]?.from ?? 0
  const rangeTo = buckets.at(-1)?.to ?? Date.now()
  const inRange = completed.filter((t) => t.completedAt! >= rangeFrom && t.completedAt! < rangeTo)
  const focusInRange = sessions.filter(
    (s) => s.kind === 'focus' && s.startedAt >= rangeFrom && s.startedAt < rangeTo,
  )

  const tasksPerBucket = buckets.map((b) => ({
    label: b.label,
    tareas: inRange.filter((t) => t.completedAt! >= b.from && t.completedAt! < b.to).length,
  }))

  const focusPerBucket = buckets.map((b) => ({
    label: b.label,
    minutos: focusInRange
      .filter((s) => s.startedAt >= b.from && s.startedAt < b.to)
      .reduce((sum, s) => sum + s.focusMinutes, 0),
  }))

  // XP acumulado a lo largo del rango (tareas + minutos de foco).
  let acc = 0
  const xpLine = buckets.map((b) => {
    acc += inRange
      .filter((t) => t.completedAt! >= b.from && t.completedAt! < b.to)
      .reduce((s, t) => s + t.xpValue, 0)
    acc += focusInRange
      .filter((s) => s.startedAt >= b.from && s.startedAt < b.to)
      .reduce((sum, s) => sum + s.focusMinutes, 0)
    return { label: b.label, xp: acc }
  })

  const byPriority = (['high', 'medium', 'low'] as const).map((p) => ({
    name: PRIORITY_LABEL[p],
    value: inRange.filter((t) => t.priority === p).length,
  }))

  const byTag = tags
    .map((tag) => ({
      name: tag.name,
      color: tag.color,
      value: inRange.filter((t) => t.tagIds.includes(tag.id)).length,
    }))
    .filter((t) => t.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  const byList = lists
    .map((l) => ({ name: l.name, xp: l.statXp, color: l.color ?? '#8b5cf6', nivel: l.statLevel }))
    .sort((a, b) => b.xp - a.xp)

  // Historial de rachas: días activos consecutivos, de todas las tareas completadas.
  const activeDays = [...new Set(completed.map((t) => dayKey(new Date(t.completedAt!))))].sort()
  const fmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
  const streakHistory: { start: string; end: string; days: number }[] = []
  let runStart: string | null = null
  let prev: Date | null = null
  const flush = (endDay: Date) => {
    if (runStart === null || prev === null) return
    const days = Math.round((endDay.getTime() - new Date(runStart).getTime()) / 86_400_000) + 1
    streakHistory.push({ start: fmt.format(new Date(runStart)), end: fmt.format(endDay), days })
  }
  for (const key of activeDays) {
    const day = new Date(key)
    if (prev !== null && day.getTime() - prev.getTime() === 86_400_000) {
      prev = day
      continue
    }
    if (prev !== null) flush(prev)
    runStart = key
    prev = day
  }
  if (prev !== null) flush(prev)
  streakHistory.sort((a, b) => b.days - a.days)

  return {
    tasksPerBucket,
    focusPerBucket,
    xpLine,
    byPriority,
    byTag,
    byList,
    streakHistory: streakHistory.slice(0, 5),
    totals: {
      completed: completed.length,
      focusMinutes: sessions.filter((s) => s.kind === 'focus').reduce((s, x) => s + x.focusMinutes, 0),
    },
  }
}

/** Un día del calendario de actividad (estilo GitHub). */
export interface ContributionDay {
  /** Día local 'YYYY-MM-DD'. */
  key: string
  /** Medianoche local del día, en ms. */
  date: number
  tasks: number
  habits: number
  focusMinutes: number
  focusSessions: number
  /** Actividad total del día: tareas + hábitos + sesiones de foco. */
  total: number
  /** Intensidad 0–4 para el tono del cuadrado. */
  level: 0 | 1 | 2 | 3 | 4
}

export interface ContributionCalendar {
  /** Columnas de 7 días (lunes→domingo); `null` = hueco antes del inicio o después de hoy. */
  weeks: (ContributionDay | null)[][]
  /** Etiqueta de mes por índice de columna, solo donde empieza un mes nuevo. */
  monthLabels: { column: number; label: string }[]
  totalDays: number
  totalActivity: number
  /** Racha de días activos que llega hasta hoy (o ayer, si hoy aún no hay actividad). */
  currentStreak: number
  /** Racha de días activos más larga del periodo. */
  bestStreak: number
}

/**
 * Calendario de actividad diaria de las últimas `weeks` semanas: cada día suma
 * tareas completadas, hábitos cumplidos y sesiones de foco. Las columnas
 * empiezan en lunes, como el resto de la app (locale es).
 */
export function contributionCalendar(
  tasks: Task[],
  sessions: StudySession[],
  habitLogs: HabitLog[],
  weeks = 53,
): ContributionCalendar {
  const perDay = new Map<string, ContributionDay>()
  const touch = (key: string, date: number): ContributionDay => {
    let day = perDay.get(key)
    if (!day) {
      day = { key, date, tasks: 0, habits: 0, focusMinutes: 0, focusSessions: 0, total: 0, level: 0 }
      perDay.set(key, day)
    }
    return day
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Primera columna: el lunes de la semana en la que empieza el periodo.
  const start = new Date(today)
  start.setDate(start.getDate() - (weeks - 1) * 7)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const startMs = start.getTime()
  const endMs = today.getTime() + 86_400_000

  for (const t of tasks) {
    if (!t.completed || t.completedAt === null) continue
    if (t.completedAt < startMs || t.completedAt >= endMs) continue
    const d = new Date(t.completedAt)
    d.setHours(0, 0, 0, 0)
    touch(dayKey(d), d.getTime()).tasks++
  }

  for (const s of sessions) {
    if (s.kind !== 'focus') continue
    if (s.startedAt < startMs || s.startedAt >= endMs) continue
    const d = new Date(s.startedAt)
    d.setHours(0, 0, 0, 0)
    const day = touch(dayKey(d), d.getTime())
    day.focusSessions++
    day.focusMinutes += s.focusMinutes
  }

  for (const log of habitLogs) {
    const at = log.completedAt ?? log.createdAt
    if (at < startMs || at >= endMs) continue
    const d = new Date(at)
    d.setHours(0, 0, 0, 0)
    touch(dayKey(d), d.getTime()).habits++
  }

  let max = 0
  for (const day of perDay.values()) {
    day.total = day.tasks + day.habits + day.focusSessions
    if (day.total > max) max = day.total
  }
  // Cuatro tonos repartidos sobre el día más activo del periodo.
  for (const day of perDay.values()) {
    if (day.total <= 0) day.level = 0
    else if (max <= 4) day.level = Math.min(4, day.total) as 1 | 2 | 3 | 4
    else {
      const ratio = day.total / max
      day.level = ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4
    }
  }

  const grid: (ContributionDay | null)[][] = []
  const monthLabels: { column: number; label: string }[] = []
  const monthFmt = new Intl.DateTimeFormat('es', { month: 'short' })
  const cursor = new Date(start)
  let lastMonth = -1
  for (let col = 0; col < weeks; col++) {
    const column: (ContributionDay | null)[] = []
    for (let row = 0; row < 7; row++) {
      const ms = cursor.getTime()
      if (ms > today.getTime()) column.push(null)
      else column.push(perDay.get(dayKey(cursor)) ?? { key: dayKey(cursor), date: ms, tasks: 0, habits: 0, focusMinutes: 0, focusSessions: 0, total: 0, level: 0 })
      cursor.setDate(cursor.getDate() + 1)
    }
    grid.push(column)
    const first = column.find((d) => d !== null)
    if (first) {
      const month = new Date(first.date).getMonth()
      if (month !== lastMonth) {
        monthLabels.push({ column: col, label: monthFmt.format(first.date) })
        lastMonth = month
      }
    }
  }

  const days = grid.flat().filter((d): d is ContributionDay => d !== null)
  const totalActivity = days.reduce((sum, d) => sum + d.total, 0)
  const totalDays = days.filter((d) => d.total > 0).length

  let bestStreak = 0
  let run = 0
  for (const d of days) {
    run = d.total > 0 ? run + 1 : 0
    if (run > bestStreak) bestStreak = run
  }
  // Racha actual: se cuenta hacia atrás desde hoy; un hoy aún vacío no la rompe.
  let currentStreak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].total > 0) currentStreak++
    else if (i < days.length - 1) break
  }

  return { weeks: grid, monthLabels, totalDays, totalActivity, currentStreak, bestStreak }
}
