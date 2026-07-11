import { uid } from '../../lib/uid'
import { db } from '../db'
import type { Priority, Task } from '../types'
import { XP_BY_PRIORITY } from '../../lib/xp'
import { emitCompletion } from '../../lib/events'
import { allowsNext, nextOccurrence, ruleForNext } from '../../lib/recurrence'
import { startOfToday } from '../../lib/dates'
import { applyXp } from './progress'
import { recordDeletion } from './tombstones'

export interface NewTaskInput {
  title: string
  listId?: string | null
  dueAt?: number | null
  dueHasTime?: boolean
  priority?: Priority
  tagIds?: string[]
  recurrenceRule?: Task['recurrenceRule']
}

export async function createTask(input: NewTaskInput): Promise<string> {
  const now = Date.now()
  const priority = input.priority ?? 'medium'
  const task: Task = {
    id: uid(),
    listId: input.listId ?? null,
    title: input.title.trim(),
    notes: '',
    color: null,
    priority,
    dueAt: input.dueAt ?? null,
    dueHasTime: input.dueHasTime ?? false,
    completed: false,
    completedAt: null,
    recurrenceRule: input.recurrenceRule ?? null,
    tagIds: input.tagIds ?? [],
    xpValue: XP_BY_PRIORITY[priority],
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.tasks.add(task)
  return task.id
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>>,
): Promise<void> {
  const full: Partial<Task> = { ...patch }
  // El XP siempre refleja la prioridad vigente.
  if (patch.priority) full.xpValue = XP_BY_PRIORITY[patch.priority]
  await db.tasks.update(id, { ...full, updatedAt: Date.now(), syncStatus: 'pending' })
}

/** Al completar una tarea recurrente se crea la siguiente ocurrencia (con subtareas y recordatorios desplazados). */
async function spawnNextOccurrence(task: Task): Promise<void> {
  const rule = task.recurrenceRule
  if (!rule) return
  const base = task.dueAt ?? startOfToday()
  const next = nextOccurrence(base, rule)
  if (!allowsNext(rule, next)) return

  const now = Date.now()
  const delta = next - base
  const nextRule = ruleForNext(rule)
  const stillRecurs =
    nextRule.end.type !== 'count' || nextRule.end.remaining > 0 ? nextRule : null

  const newTaskId = uid()
  await db.transaction('rw', db.tasks, db.subtasks, db.reminders, async () => {
    await db.tasks.add({
      ...task,
      id: newTaskId,
      dueAt: next,
      completed: false,
      completedAt: null,
      recurrenceRule: stillRecurs,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    })
    const subtasks = await db.subtasks.where('taskId').equals(task.id).toArray()
    for (const s of subtasks) {
      await db.subtasks.add({
        ...s,
        id: uid(),
        taskId: newTaskId,
        completed: false,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      })
    }
    const reminders = await db.reminders.where('taskId').equals(task.id).toArray()
    for (const r of reminders) {
      await db.reminders.add({
        ...r,
        id: uid(),
        taskId: newTaskId,
        remindAt: r.remindAt + delta,
        firedCount: 0,
        dismissed: false,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      })
    }
  })
}

export async function setTaskCompleted(id: string, completed: boolean): Promise<void> {
  const task = await db.tasks.get(id)
  if (!task || task.completed === completed) return
  await updateTask(id, { completed, completedAt: completed ? Date.now() : null })
  if (completed) await spawnNextOccurrence(task)
  const result = await applyXp(completed ? task.xpValue : -task.xpValue, task.listId, {
    touchStreak: completed,
  })
  if (completed) emitCompletion({ ...result, kind: 'task' })
}

export async function deleteTask(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.tasks, db.subtasks, db.comments, db.attachments, db.reminders, db.tombstones],
    async () => {
      for (const table of ['subtasks', 'comments', 'attachments', 'reminders'] as const) {
        const children = await db[table].where('taskId').equals(id).primaryKeys()
        for (const childId of children) await recordDeletion(table, childId as string)
        await db[table].where('taskId').equals(id).delete()
      }
      await db.tasks.delete(id)
      await recordDeletion('tasks', id)
    },
  )
}
