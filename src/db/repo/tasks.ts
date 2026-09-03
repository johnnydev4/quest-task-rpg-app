import { uid } from '../../lib/uid'
import { db } from '../db'
import type { Priority, Task } from '../types'
import { xpForPriority } from '../../lib/xp'
import { emitCompletion, emitToast } from '../../lib/events'
import { allowsNext, firstDayOfWeekOnOrAfter, nextOccurrence, ruleForNext } from '../../lib/recurrence'
import { startOfToday } from '../../lib/dates'
import { applyXp } from './progress'
import { recordDeletion } from './tombstones'

export interface NewTaskInput {
  title: string
  listId?: string | null
  dueAt?: number | null
  dueHasTime?: boolean
  priority?: Priority | null
  tagIds?: string[]
  recurrenceRule?: Task['recurrenceRule']
}

export async function createTask(input: NewTaskInput): Promise<string> {
  const now = Date.now()
  // Sin prioridad por defecto: el usuario la asigna si quiere.
  const priority = input.priority ?? null
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
    order: now,
    xpValue: xpForPriority(priority),
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
  // El XP siempre refleja la prioridad vigente (incluido quitarla → XP base).
  if (patch.priority !== undefined) full.xpValue = xpForPriority(patch.priority)

  // Al cambiar los días de una repetición semanal, la instancia pendiente se
  // realinea a la ocurrencia más cercana DESDE HOY: si hoy es lunes y añades
  // el lunes, la tarea baja a Hoy en vez de seguir apuntando a mañana.
  const days = patch.recurrenceRule?.daysOfWeek
  if (patch.recurrenceRule !== undefined && days && days.length > 0) {
    const task = await db.tasks.get(id)
    const dueAt = patch.dueAt !== undefined ? patch.dueAt : (task?.dueAt ?? null)
    const hasTime = patch.dueHasTime ?? task?.dueHasTime ?? false
    let aligned = firstDayOfWeekOnOrAfter(startOfToday(), days)
    if (hasTime && dueAt !== null) {
      const prev = new Date(dueAt)
      const withTime = new Date(aligned)
      withTime.setHours(prev.getHours(), prev.getMinutes(), 0, 0)
      aligned = withTime.getTime()
    }
    if (aligned !== dueAt) full.dueAt = aligned
  }

  await db.tasks.update(id, { ...full, updatedAt: Date.now(), syncStatus: 'pending' })
}

/**
 * Aplica el orden manual de un arrastre. Solo se reparten las posiciones que
 * ya ocupaban esas tareas, así reordenar dentro de una sección no altera la
 * posición relativa de las demás.
 */
export async function reorderTasks(ids: string[]): Promise<void> {
  const found = await db.tasks.bulkGet(ids)
  const present = found.filter((t): t is Task => !!t)
  if (present.length < 2) return
  const targets = ids.filter((_, i) => found[i] !== undefined)
  const slots = present.map((t) => t.order ?? t.createdAt).sort((a, b) => a - b)
  const now = Date.now()
  await db.transaction('rw', db.tasks, async () => {
    for (let i = 0; i < targets.length; i++) {
      await db.tasks.update(targets[i], { order: slots[i], updatedAt: now, syncStatus: 'pending' })
    }
  })
}

/**
 * Ids de todo el linaje de una recurrente: la cadena de tareas enlazadas por
 * `spawnedFromTaskId` (una completación engendra la siguiente). Sube hasta la
 * raíz y luego recoge todos sus descendientes. Para una tarea suelta (sin
 * linaje) devuelve solo su propio id.
 */
async function lineageIds(taskId: string): Promise<Set<string>> {
  const all = await db.tasks.toArray()
  const byId = new Map(all.map((t) => [t.id, t]))
  // Raíz del linaje (con guarda anticiclos por si un dato viejo se enlazó mal).
  let rootId = taskId
  const seen = new Set<string>()
  for (;;) {
    const t = byId.get(rootId)
    if (!t || !t.spawnedFromTaskId || !byId.has(t.spawnedFromTaskId) || seen.has(rootId)) break
    seen.add(rootId)
    rootId = t.spawnedFromTaskId
  }
  // Descendientes desde la raíz (punto fijo: el linaje es pequeño).
  const ids = new Set<string>([rootId])
  for (let added = true; added; ) {
    added = false
    for (const t of all) {
      if (t.spawnedFromTaskId && ids.has(t.spawnedFromTaskId) && !ids.has(t.id)) {
        ids.add(t.id)
        added = true
      }
    }
  }
  return ids
}

/**
 * Un linaje recurrente solo puede tener UNA ocurrencia pendiente a la vez.
 * Conserva `keepId` y elimina las demás ocurrencias pendientes del linaje, así
 * una misma tarea nunca queda duplicada. No toca las completadas (son historial)
 * ni las tareas sueltas (linaje de tamaño 1).
 */
async function dedupeLineagePending(keepId: string): Promise<void> {
  const ids = await lineageIds(keepId)
  if (ids.size <= 1) return
  const all = await db.tasks.toArray()
  for (const t of all) {
    if (t.id !== keepId && ids.has(t.id) && !t.completed) await deleteTask(t.id)
  }
}

/** Al completar una tarea recurrente se crea la siguiente ocurrencia (con subtareas y recordatorios desplazados). */
async function spawnNextOccurrence(task: Task): Promise<void> {
  const rule = task.recurrenceRule
  if (!rule) return
  const base = task.dueAt ?? startOfToday()
  // Completar una ocurrencia ATRASADA no debe engendrar otra atrasada: se
  // avanza hasta la primera ocurrencia que caiga hoy o más adelante.
  let next = nextOccurrence(base, rule)
  const sod = startOfToday()
  while (next < sod) next = nextOccurrence(next, rule)
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
      // Linaje: si se deshace la tarea que la generó, esta ocurrencia se anula.
      spawnedFromTaskId: task.id,
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
      const remindAt = r.remindAt + delta
      await db.reminders.add({
        ...r,
        id: uid(),
        taskId: newTaskId,
        remindAt,
        firedCount: 0,
        // Si la hora del aviso ya pasó (p. ej. completar tarde una recurrente
        // atrasada deja la nueva ocurrencia hoy con su hora de aviso vencida),
        // nace descartado para no disparar una notificación inmediata sin sentido.
        dismissed: remindAt <= now,
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

  if (completed) {
    await spawnNextOccurrence(task)
  } else if (task.recurrenceRule !== null && task.dueAt !== null && task.dueAt < startOfToday()) {
    // Deshacer una recurrente vencida: se reprograma a su ocurrencia desde hoy
    // (queda visible en la lista en vez de esconderse en "Vencidas") y de paso
    // se descartan las demás ocurrencias pendientes del linaje —incluida la que
    // esta completación engendró—, de modo que solo quede una versión.
    await skipOverdueToNearest(id)
  } else {
    // Deshacer: el linaje solo puede tener UNA ocurrencia pendiente. Se anula la
    // ocurrencia que esta completación generó (y cualquier otra pendiente), así
    // la tarea vuelve a la lista sin duplicarse.
    await dedupeLineagePending(id)
  }

  // Una recurrente ATRASADA (de días anteriores) completada tarde no da XP;
  // simétricamente, deshacerla tampoco lo resta.
  const overdueRecurring =
    task.recurrenceRule !== null && task.dueAt !== null && task.dueAt < startOfToday()
  if (overdueRecurring) {
    if (completed) emitToast({ title: 'Completada sin XP', body: 'Repetición atrasada de días anteriores.' })
    return
  }

  const result = await applyXp(completed ? task.xpValue : -task.xpValue, task.listId, {
    touchStreak: completed,
  })
  if (completed) emitCompletion({ ...result, kind: 'task' })
}

/**
 * "Saltar a hoy" de una recurrente atrasada: reprograma la tarea a su
 * ocurrencia más cercana desde hoy (diaria → hoy; cada 2 días con 1 pasado →
 * mañana), desplazando también sus recordatorios.
 */
export async function skipOverdueToNearest(id: string): Promise<void> {
  const task = await db.tasks.get(id)
  if (!task || !task.recurrenceRule || task.dueAt === null) return
  const sod = startOfToday()
  if (task.dueAt >= sod) return

  let next = task.dueAt
  while (next < sod) next = nextOccurrence(next, task.recurrenceRule)

  const delta = next - task.dueAt
  const now = Date.now()
  await updateTask(id, { dueAt: next })
  const reminders = await db.reminders.where('taskId').equals(id).toArray()
  for (const r of reminders) {
    const remindAt = r.remindAt + delta
    await db.reminders.update(r.id, {
      remindAt,
      firedCount: 0,
      // Si la nueva hora del aviso ya pasó, se deja descartado para no saltar al instante.
      dismissed: remindAt <= now,
      updatedAt: now,
      syncStatus: 'pending',
    })
  }
  // Solo una ocurrencia pendiente del linaje: si ya había otra (p. ej. la de hoy
  // que se generó al completar), se descarta para no dejar la tarea duplicada.
  await dedupeLineagePending(id)
}

/**
 * "Saltar" una vencida (aviso diario): la recurrente pasa a su próxima
 * ocurrencia; la puntual pierde la fecha y baja a "Sin fecha", así deja de
 * arrastrarse por la lista de vencidas sin perderse.
 */
export async function skipOverdue(id: string): Promise<void> {
  const task = await db.tasks.get(id)
  if (!task || task.dueAt === null || task.dueAt >= startOfToday()) return
  if (task.recurrenceRule !== null) await skipOverdueToNearest(id)
  else await updateTask(id, { dueAt: null, dueHasTime: false })
}

/** Traer una vencida al día de hoy (sin hora). */
export async function moveOverdueToToday(id: string): Promise<void> {
  await updateTask(id, { dueAt: startOfToday(), dueHasTime: false })
  // Si el linaje ya tenía otra ocurrencia pendiente hoy (p. ej. la generada al
  // completar), traer la vencida a hoy la duplicaría: se deja una sola versión.
  await dedupeLineagePending(id)
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
