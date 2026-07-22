import Dexie, { type EntityTable } from 'dexie'
import type {
  AppMedia,
  Attachment,
  Comment,
  Habit,
  HabitLog,
  List,
  PlayerProfile,
  Quest,
  QuestStep,
  Reminder,
  Settings,
  StudySession,
  Subtask,
  Tag,
  Task,
  Tombstone,
} from './types'

const db = new Dexie('quest-db') as Dexie & {
  lists: EntityTable<List, 'id'>
  tasks: EntityTable<Task, 'id'>
  subtasks: EntityTable<Subtask, 'id'>
  profile: EntityTable<PlayerProfile, 'id'>
  settings: EntityTable<Settings, 'id'>
  comments: EntityTable<Comment, 'id'>
  attachments: EntityTable<Attachment, 'id'>
  tags: EntityTable<Tag, 'id'>
  reminders: EntityTable<Reminder, 'id'>
  studySessions: EntityTable<StudySession, 'id'>
  tombstones: EntityTable<Tombstone, 'id'>
  quests: EntityTable<Quest, 'id'>
  questSteps: EntityTable<QuestStep, 'id'>
  habits: EntityTable<Habit, 'id'>
  habitLogs: EntityTable<HabitLog, 'id'>
  appMedia: EntityTable<AppMedia, 'id'>
}

// IndexedDB no indexa booleanos, así que `completed` se filtra en memoria
// (escala local, sin problema de rendimiento).
db.version(1).stores({
  lists: 'id, order',
  tasks: 'id, listId, dueAt, updatedAt',
  subtasks: 'id, taskId, order',
})

// Fase 3: perfil RPG y ajustes (filas únicas).
db.version(2).stores({
  profile: 'id',
  settings: 'id',
})

// Fases 4-6: detalles de tarea, tiempo y estudio. *tagIds = índice multiEntry.
db.version(3)
  .stores({
    tasks: 'id, listId, dueAt, updatedAt, *tagIds',
    comments: 'id, taskId, createdAt',
    attachments: 'id, taskId',
    tags: 'id, name',
    reminders: 'id, taskId, remindAt',
    studySessions: 'id, dateKey, startedAt, listId, taskId',
    tombstones: 'id, table',
  })
  .upgrade((tx) =>
    tx
      .table('tasks')
      .toCollection()
      .modify((t) => {
        t.tagIds ??= []
        t.dueHasTime ??= false
      }),
  )

// Sistema de misiones RPG: main quest mensual + misiones semanales con pasos.
db.version(4).stores({
  quests: 'id, monthKey',
  questSteps: 'id, questId, order',
})

// Hábitos con COMBOS: días programados + registro de cumplimientos.
db.version(5).stores({
  habits: 'id, endDate',
  habitLogs: 'id, habitId, dateKey',
})

// Imagen de fondo movida a su propia tabla (antes vivía en la fila de ajustes,
// y cambiar la difusión reescribía el blob entero; en iPhone eso lo rompía).
db.version(6)
  .stores({ appMedia: 'id' })
  .upgrade(async (tx) => {
    const s = (await tx.table('settings').get('app')) as { bgImage?: Blob | null } | undefined
    if (s?.bgImage) {
      await tx.table('appMedia').put({ id: 'bg', blob: s.bgImage })
      await tx.table('settings').update('app', { bgImage: null })
    }
  })

// Orden manual (arrastrar y soltar) de tareas y hábitos. Los registros
// existentes heredan su fecha de creación como posición: así el orden manual
// arranca igual que "más antiguas primero" y cada valor es único.
db.version(7)
  .stores({
    tasks: 'id, listId, dueAt, updatedAt, order, *tagIds',
    habits: 'id, endDate, order',
  })
  .upgrade(async (tx) => {
    for (const table of ['tasks', 'habits'] as const) {
      await tx
        .table(table)
        .toCollection()
        .modify((r) => {
          r.order ??= r.createdAt
        })
    }
  })

// Corrige duraciones de pomodoro que quedaron desviadas (foco 27 / descanso 7)
// por pruebas previas: los valores correctos son 25 y 5 minutos.
db.version(8).upgrade(async (tx) => {
  const s = (await tx.table('settings').get('app')) as
    | { pomodoroFocusMin?: number; pomodoroShortBreakMin?: number }
    | undefined
  if (!s) return
  const patch: Record<string, number> = {}
  if (s.pomodoroFocusMin === 27) patch.pomodoroFocusMin = 25
  if (s.pomodoroShortBreakMin === 7) patch.pomodoroShortBreakMin = 5
  if (Object.keys(patch).length > 0) await tx.table('settings').update('app', patch)
})

// Disparo de sincronización con debounce: cualquier escritura en una tabla
// sincronizada emite `quest:changed` en window. sync.ts se suscribe y llama a
// scheduleSync(); el evento evita un ciclo de imports db<->sync.
const SYNCED_TABLES = [
  'lists',
  'tasks',
  'subtasks',
  'comments',
  'tags',
  'reminders',
  'studySessions',
  'attachments',
  'profile',
  'quests',
  'questSteps',
  'habits',
  'habitLogs',
  'settings',
] as const

if (typeof window !== 'undefined') {
  const notify = () => window.dispatchEvent(new CustomEvent('quest:changed'))
  for (const name of SYNCED_TABLES) {
    const hook = db.table(name).hook as (event: string, subscriber: () => void) => void
    hook('creating', notify)
    hook('updating', notify)
    hook('deleting', notify)
  }
}

export { db }
