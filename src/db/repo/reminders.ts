import { uid } from '../../lib/uid'
import { db } from '../db'
import type { Reminder } from '../types'
import { recordDeletion } from './tombstones'

export interface NewReminderInput {
  taskId: string
  remindAt: number
  repeatCount?: number
  repeatEveryMin?: number
}

export async function createReminder(input: NewReminderInput): Promise<string> {
  const now = Date.now()
  const reminder: Reminder = {
    id: uid(),
    taskId: input.taskId,
    remindAt: input.remindAt,
    repeatCount: input.repeatCount ?? 0,
    repeatEveryMin: input.repeatEveryMin ?? 10,
    firedCount: 0,
    dismissed: false,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.reminders.add(reminder)
  return reminder.id
}

export async function updateReminder(
  id: string,
  patch: Partial<Omit<Reminder, 'id' | 'taskId' | 'createdAt' | 'updatedAt' | 'syncStatus'>>,
): Promise<void> {
  await db.reminders.update(id, { ...patch, updatedAt: Date.now(), syncStatus: 'pending' })
}

export async function deleteReminder(id: string): Promise<void> {
  await db.reminders.delete(id)
  await recordDeletion('reminders', id)
}
