import { uid } from '../../lib/uid'
import { db } from '../db'
import type { Subtask } from '../types'
import { SUBTASK_XP } from '../../lib/xp'
import { emitCompletion } from '../../lib/events'
import { applyXp } from './progress'
import { recordDeletion } from './tombstones'

export async function createSubtask(taskId: string, title: string): Promise<string> {
  const now = Date.now()
  const last = await db.subtasks.where('taskId').equals(taskId).sortBy('order')
  const subtask: Subtask = {
    id: uid(),
    taskId,
    title: title.trim(),
    completed: false,
    order: (last.at(-1)?.order ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.subtasks.add(subtask)
  return subtask.id
}

export async function updateSubtask(
  id: string,
  patch: Partial<Omit<Subtask, 'id' | 'taskId' | 'createdAt' | 'updatedAt' | 'syncStatus'>>,
): Promise<void> {
  await db.subtasks.update(id, { ...patch, updatedAt: Date.now(), syncStatus: 'pending' })
}

export async function setSubtaskCompleted(id: string, completed: boolean): Promise<void> {
  const subtask = await db.subtasks.get(id)
  if (!subtask || subtask.completed === completed) return
  await updateSubtask(id, { completed })
  const task = await db.tasks.get(subtask.taskId)
  const result = await applyXp(completed ? SUBTASK_XP : -SUBTASK_XP, task?.listId ?? null, {
    touchStreak: false,
  })
  if (completed) emitCompletion({ ...result, kind: 'subtask' })
}

export async function deleteSubtask(id: string): Promise<void> {
  await db.subtasks.delete(id)
  await recordDeletion('subtasks', id)
}
