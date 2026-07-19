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

export { db }
