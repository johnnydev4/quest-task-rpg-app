import { uid } from '../../lib/uid'
import { db } from '../db'
import type { Habit } from '../types'
import { emitCompletion } from '../../lib/events'
import { localDateKey } from '../../lib/dates'
import { computeCombo, xpForCombo } from '../../lib/habits'
import { applyXp } from './progress'
import { recordDeletion } from './tombstones'

export interface NewHabitInput {
  title: string
  daysOfWeek: number[]
  startDate: number
  /** null = hábito indefinido (sin fecha límite). */
  endDate: number | null
}

export async function createHabit(input: NewHabitInput): Promise<string> {
  const now = Date.now()
  const habit: Habit = {
    id: uid(),
    title: input.title.trim(),
    daysOfWeek: [...input.daysOfWeek].sort(),
    startDate: input.startDate,
    endDate: input.endDate,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.habits.add(habit)
  return habit.id
}

export async function updateHabit(
  id: string,
  patch: Partial<Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>>,
): Promise<void> {
  await db.habits.update(id, { ...patch, updatedAt: Date.now(), syncStatus: 'pending' })
}

export async function deleteHabit(id: string): Promise<void> {
  await db.transaction('rw', [db.habits, db.habitLogs, db.tombstones], async () => {
    const logIds = await db.habitLogs.where('habitId').equals(id).primaryKeys()
    for (const logId of logIds) await recordDeletion('habitLogs', logId as string)
    await db.habitLogs.where('habitId').equals(id).delete()
    await db.habits.delete(id)
    await recordDeletion('habits', id)
  })
}

/** Marca/desmarca el cumplimiento de hoy. El XP escala con el COMBO alcanzado. */
export async function toggleHabitToday(habitId: string): Promise<void> {
  const habit = await db.habits.get(habitId)
  if (!habit) return
  const todayKey = localDateKey()
  const existing = await db.habitLogs
    .where('habitId')
    .equals(habitId)
    .and((l) => l.dateKey === todayKey)
    .first()

  if (existing) {
    // Desmarcar: resta exactamente el XP que otorgó (sin farmeo).
    await db.habitLogs.delete(existing.id)
    await recordDeletion('habitLogs', existing.id)
    await applyXp(-existing.xp, null, { touchStreak: false })
    return
  }

  const logs = await db.habitLogs.where('habitId').equals(habitId).toArray()
  const doneKeys = new Set(logs.map((l) => l.dateKey))
  const comboAfter = computeCombo(habit, doneKeys) + 1
  const xp = xpForCombo(comboAfter)
  const now = Date.now()
  await db.habitLogs.add({
    id: uid(),
    habitId,
    dateKey: todayKey,
    xp,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  })
  const result = await applyXp(xp, null, { touchStreak: true })
  emitCompletion({ ...result, kind: 'habit' })
}
