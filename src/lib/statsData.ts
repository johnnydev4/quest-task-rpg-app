import type { Habit, List, StudySession, Tag, Task } from '../db/types'
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
    buckets.push({ key: dayKey(cursor), label: dayFmt.format(cursor), from, to: next.getTime() })
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
