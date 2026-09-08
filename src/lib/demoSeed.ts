/**
 * Sembrador de la DEMO. Rellena la base local con una cuenta que parece llevar
 * semanas en uso —listas con nivel, hábitos con rachas, tareas hechas cada día,
 * sesiones de foco, un mapa de ideas y un perfil de nivel alto— para que quien
 * abra la demo vea la app "viva" en vez de vacía.
 *
 * Se dispara con `?demo` en la URL (ver main.tsx). No toca los ajustes ni el
 * fondo del usuario. Marca una versión en localStorage para no volver a sembrar
 * (y pisar lo que el visitante toque) en cada recarga; `?demo=reset` fuerza.
 */
import { db } from '../db/db'
import { uid } from './uid'
import { levelFromXp, xpForLevel, STAT_XP_BASE } from './level'
import type {
  DaySection,
  Habit,
  HabitLog,
  IdeaMap,
  IdeaNode,
  List,
  PlayerProfile,
  Reminder,
  StudySession,
  Subtask,
  Comment,
  Tag,
  Task,
} from '../db/types'

const DEMO_VERSION = 'demo-2'
const DEMO_KEY = 'quest-demo-seeded'
const pad = (n: number) => String(n).padStart(2, '0')

/** ¿Debe correr el sembrador? `?demo` presente y aún no sembrado (o reset). */
export function shouldSeedDemo(): boolean {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('demo')) return false
  if (params.get('demo') === 'reset') return true
  try {
    return localStorage.getItem(DEMO_KEY) !== DEMO_VERSION
  } catch {
    return true
  }
}

/** Quita `?demo` de la barra sin recargar (la demo ya quedó en la base local). */
export function cleanDemoParam(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('demo')) return
  url.searchParams.delete('demo')
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)
}

// --- Helpers de tiempo (todo relativo a la medianoche local de hoy) ---
function midnight(daysAgo: number): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return d.getTime()
}
/** Timestamp de "hace `daysAgo` días" a la hora h:m local. */
function at(daysAgo: number, h: number, m = 0): number {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}
function keyOf(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const SYNC = 'synced' as const

/** Rellena la base con la cuenta de demostración (borra lo que hubiera antes). */
export async function seedDemo(): Promise<void> {
  // Tablas de contenido que se reemplazan (se dejan intactas settings y appMedia,
  // para respetar tema y fondo elegidos por quien mira la demo).
  const tables = [
    'tasks', 'subtasks', 'comments', 'attachments', 'reminders', 'tags', 'lists',
    'habits', 'habitLogs', 'daySections', 'studySessions', 'ideaMaps', 'ideaNodes',
    'quests', 'questSteps', 'profile', 'tombstones',
  ] as const
  for (const t of tables) await db.table(t).clear()

  const lists: List[] = []
  const list = (name: string, emoji: string, color: string, statXp: number, order: number): string => {
    const id = uid()
    lists.push({
      id, name, emoji, color, order,
      statXp,
      statLevel: levelFromXp(statXp, STAT_XP_BASE).level,
      createdAt: midnight(60), updatedAt: at(1, 20), syncStatus: SYNC,
    })
    return id
  }
  const L = {
    work: list('Trabajo', '💼', '#6366f1', 640, 1),
    personal: list('Personal', '🌱', '#10b981', 410, 2),
    health: list('Salud', '🏋️', '#f43f5e', 520, 3),
    home: list('Hogar', '🏠', '#f59e0b', 300, 4),
    study: list('Estudio', '📚', '#8b5cf6', 480, 5),
    finance: list('Finanzas', '💰', '#14b8a6', 180, 6),
  }
  await db.lists.bulkAdd(lists)

  const tags: Tag[] = []
  const tag = (name: string, color: string): string => {
    const id = uid()
    tags.push({ id, name, color, createdAt: midnight(55), updatedAt: midnight(55), syncStatus: SYNC })
    return id
  }
  const T = {
    urgente: tag('urgente', '#ef4444'),
    rapido: tag('rápido', '#22c55e'),
    llamada: tag('llamada', '#3b82f6'),
    email: tag('email', '#a855f7'),
    compras: tag('compras', '#f59e0b'),
    lectura: tag('lectura', '#14b8a6'),
  }
  await db.tags.bulkAdd(tags)

  // Momentos del día (secciones de "Hoy").
  const sections: DaySection[] = [
    { name: 'Mañana', order: 1 },
    { name: 'Mediodía', order: 2 },
    { name: 'Tarde', order: 3 },
    { name: 'Noche', order: 4 },
  ].map((s) => ({ id: uid(), ...s, collapsed: false, createdAt: midnight(50), updatedAt: midnight(50), syncStatus: SYNC }))
  await db.daySections.bulkAdd(sections)
  const S = { manana: sections[0].id, mediodia: sections[1].id, tarde: sections[2].id, noche: sections[3].id }

  // --- Tareas ---
  const tasks: Task[] = []
  const subtasks: Subtask[] = []
  const comments: Comment[] = []
  const reminders: Reminder[] = []
  const xpByPrio = (p: Task['priority']) => (p === 'high' ? 50 : p === 'medium' ? 25 : p === 'low' ? 10 : 20)

  interface T2 {
    title: string
    listId?: string | null
    priority?: Task['priority']
    dueDaysAgo?: number | null // negativo = futuro; null = sin fecha
    dueH?: number
    hasTime?: boolean
    completedDaysAgo?: number | null
    completedH?: number
    tagIds?: string[]
    pomodoroMinutes?: number | null
    section?: string | null
    notes?: string
    subs?: [string, boolean][]
    comment?: string
    remindDaysAgo?: number
    recur?: Task['recurrenceRule']
    order?: number
  }
  let ord = 1000
  const addTask = (t: T2) => {
    const id = uid()
    const prio = t.priority ?? null
    const due =
      t.dueDaysAgo === undefined || t.dueDaysAgo === null
        ? null
        : t.hasTime
          ? at(t.dueDaysAgo, t.dueH ?? 9)
          : midnight(t.dueDaysAgo)
    const completed = t.completedDaysAgo != null
    tasks.push({
      id,
      listId: t.listId ?? null,
      title: t.title,
      notes: t.notes ?? '',
      color: null,
      priority: prio,
      dueAt: due,
      dueHasTime: !!t.hasTime,
      completed,
      completedAt: completed ? at(t.completedDaysAgo!, t.completedH ?? 11, 20) : null,
      recurrenceRule: t.recur ?? null,
      tagIds: t.tagIds ?? [],
      pomodoroMinutes: t.pomodoroMinutes ?? null,
      daySectionId: t.section ?? null,
      order: t.order ?? ord++,
      xpValue: xpByPrio(prio),
      createdAt: midnight((t.completedDaysAgo ?? t.dueDaysAgo ?? 3) + 2),
      updatedAt: completed ? at(t.completedDaysAgo!, t.completedH ?? 11, 20) : at(0, 8),
      syncStatus: SYNC,
    })
    if (t.subs) {
      t.subs.forEach(([title, done], i) =>
        subtasks.push({
          id: uid(), taskId: id, title, completed: done, order: i,
          createdAt: midnight(5), updatedAt: midnight(2), syncStatus: SYNC,
        }),
      )
    }
    if (t.comment) {
      comments.push({
        id: uid(), taskId: id, text: t.comment,
        createdAt: at(t.completedDaysAgo ?? 1, 12), updatedAt: at(t.completedDaysAgo ?? 1, 12), syncStatus: SYNC,
      })
    }
    if (t.remindDaysAgo !== undefined && due !== null) {
      reminders.push({
        id: uid(), taskId: id, remindAt: due - 30 * 60_000,
        repeatCount: 0, repeatEveryMin: 10, firedCount: 0, dismissed: false,
        createdAt: midnight(4), updatedAt: midnight(4), syncStatus: SYNC,
      })
    }
    return id
  }

  // Pendientes de HOY (repartidas en momentos del día).
  addTask({ title: 'Preparar la reunión de equipo', listId: L.work, priority: 'high', dueDaysAgo: 0, hasTime: true, dueH: 10, tagIds: [T.urgente], pomodoroMinutes: 50, section: S.manana,
    notes: 'Repasar métricas del sprint y bloqueantes.', subs: [['Actualizar el tablero', true], ['Escribir la agenda', false], ['Compartir el enlace', false]], remindDaysAgo: 0 })
  addTask({ title: 'Responder correos pendientes', listId: L.work, priority: 'medium', dueDaysAgo: 0, tagIds: [T.email], section: S.manana })
  addTask({ title: 'Llamar al dentista', listId: L.health, priority: 'medium', dueDaysAgo: 0, hasTime: true, dueH: 12, tagIds: [T.llamada, T.rapido], section: S.mediodia })
  addTask({ title: 'Comprar víveres de la semana', listId: L.home, dueDaysAgo: 0, tagIds: [T.compras], section: S.tarde,
    subs: [['Verduras', false], ['Pollo', false], ['Arroz y pasta', false], ['Café', false]] })
  addTask({ title: 'Estudiar capítulo 4 de álgebra', listId: L.study, priority: 'high', dueDaysAgo: 0, tagIds: [T.lectura], pomodoroMinutes: 75, section: S.tarde })
  addTask({ title: 'Escribir en el diario', listId: L.personal, dueDaysAgo: 0, section: S.noche })
  addTask({ title: 'Revisar el presupuesto del mes', listId: L.finance, priority: 'medium', dueDaysAgo: 0, section: S.noche })

  // Vencidas (para mostrar el aviso diario y la sección "Vencidas").
  addTask({ title: 'Renovar el seguro del coche', listId: L.finance, priority: 'high', dueDaysAgo: 2, tagIds: [T.urgente] })
  addTask({ title: 'Devolver el libro a la biblioteca', listId: L.personal, dueDaysAgo: 4, tagIds: [T.lectura] })
  addTask({ title: 'Enviar la factura al cliente', listId: L.work, priority: 'high', dueDaysAgo: 1, tagIds: [T.email, T.urgente] })

  // Próximas (mañana y esta/próxima semana).
  addTask({ title: 'Cita médica anual', listId: L.health, priority: 'medium', dueDaysAgo: -1, hasTime: true, dueH: 9, remindDaysAgo: -1 })
  addTask({ title: 'Presentación trimestral', listId: L.work, priority: 'high', dueDaysAgo: -2, hasTime: true, dueH: 15, tagIds: [T.urgente],
    subs: [['Diseñar las diapositivas', true], ['Ensayar', false]] })
  addTask({ title: 'Cumpleaños de mamá — comprar regalo', listId: L.personal, dueDaysAgo: -3, tagIds: [T.compras] })
  addTask({ title: 'Pagar el alquiler', listId: L.finance, priority: 'high', dueDaysAgo: -5, hasTime: true, dueH: 10 })
  addTask({ title: 'Cambiar las sábanas', listId: L.home, dueDaysAgo: -1 })
  addTask({ title: 'Mantenimiento del coche', listId: L.home, priority: 'low', dueDaysAgo: -7 })

  // Sin fecha (backlog).
  addTask({ title: 'Ideas para las vacaciones de verano', listId: L.personal, dueDaysAgo: null, notes: 'Playa vs montaña. Mirar vuelos.' })
  addTask({ title: 'Ordenar el garaje', listId: L.home, dueDaysAgo: null, priority: 'low' })
  addTask({ title: 'Aprender un atajo nuevo de teclado', listId: L.study, dueDaysAgo: null, tagIds: [T.rapido] })

  // Recurrentes (diaria y semanal), pendientes hoy.
  addTask({ title: 'Standup diario', listId: L.work, dueDaysAgo: 0, hasTime: true, dueH: 9, section: S.manana,
    recur: { every: 1, unit: 'day', end: { type: 'never' }, daysOfWeek: [1, 2, 3, 4, 5] } })
  addTask({ title: 'Planificar la semana', listId: L.personal, dueDaysAgo: 0, hasTime: true, dueH: 18,
    recur: { every: 1, unit: 'week', end: { type: 'never' }, daysOfWeek: [0] } })

  // Completadas HOY (para la sección "Completadas" y el XP de hoy).
  addTask({ title: 'Hacer la cama', listId: L.home, completedDaysAgo: 0, completedH: 7, dueDaysAgo: 0 })
  addTask({ title: 'Meditar 10 minutos', listId: L.personal, completedDaysAgo: 0, completedH: 7, dueDaysAgo: 0, pomodoroMinutes: 10 })
  addTask({ title: 'Revisar el tablero del proyecto', listId: L.work, priority: 'medium', completedDaysAgo: 0, completedH: 9, dueDaysAgo: 0, comment: 'Todo en verde 🎉' })

  // Completadas en días anteriores (para Stats y el historial). ~ a diario.
  const doneHistory: [string, string, number, Task['priority']][] = [
    ['Salir a correr 5 km', L.health, 1, 'medium'],
    ['Leer 20 páginas', L.study, 1, 'low'],
    ['Cocinar para la semana', L.home, 1, 'low'],
    ['Terminar el informe mensual', L.work, 2, 'high'],
    ['Sesión de gimnasio', L.health, 2, 'medium'],
    ['Estudiar vocabulario de inglés', L.study, 2, 'low'],
    ['Pagar facturas', L.finance, 3, 'medium'],
    ['Videollamada con el cliente', L.work, 3, 'high'],
    ['Limpiar la cocina', L.home, 3, 'low'],
    ['Yoga por la mañana', L.health, 4, 'low'],
    ['Escribir el artículo del blog', L.personal, 4, 'medium'],
    ['Repasar apuntes de matemáticas', L.study, 5, 'medium'],
    ['Actualizar la hoja de gastos', L.finance, 5, 'low'],
    ['Reunión con el equipo de diseño', L.work, 6, 'medium'],
    ['Paseo largo', L.health, 6, 'low'],
    ['Ordenar el escritorio', L.home, 7, 'low'],
    ['Terminar el curso online', L.study, 8, 'high'],
    ['Preparar la propuesta', L.work, 9, 'high'],
    ['Comprar regalo de cumpleaños', L.personal, 10, 'low'],
    ['Entrenamiento de fuerza', L.health, 11, 'medium'],
  ]
  for (const [title, listId, d, prio] of doneHistory) {
    addTask({ title, listId, priority: prio, completedDaysAgo: d, completedH: 10 + (d % 8), dueDaysAgo: d })
  }

  await db.tasks.bulkAdd(tasks)
  if (subtasks.length) await db.subtasks.bulkAdd(subtasks)
  if (comments.length) await db.comments.bulkAdd(comments)
  if (reminders.length) await db.reminders.bulkAdd(reminders)

  // --- Hábitos + registros (rachas/combos) ---
  const habits: Habit[] = []
  const logs: HabitLog[] = []
  const habit = (
    title: string,
    days: number[],
    listId: string,
    opts: { reminderTime?: string; pomodoroMinutes?: number; section?: string; historyDays?: number; skip?: number[] } = {},
  ): string => {
    const id = uid()
    habits.push({
      id, title, daysOfWeek: [...days].sort(), startDate: midnight(45), endDate: null,
      reminderTime: opts.reminderTime ?? null, pomodoroMinutes: opts.pomodoroMinutes ?? null,
      listId, daySectionId: opts.section ?? null, order: habits.length + 1,
      createdAt: midnight(45), updatedAt: at(1, 21), syncStatus: SYNC,
    })
    // Registros de cumplimiento hacia atrás en los días programados.
    const span = opts.historyDays ?? 42
    const skip = new Set(opts.skip ?? [])
    for (let d = span; d >= 0; d--) {
      const dow = new Date(midnight(d)).getDay()
      if (!days.includes(dow)) continue
      if (skip.has(d)) continue // algún día saltado, para que las rachas se vean reales
      logs.push({
        id: uid(), habitId: id, dateKey: keyOf(d), xp: 20 + Math.min(30, (span - d)),
        completedAt: at(d, 8, 15), createdAt: at(d, 8, 15), updatedAt: at(d, 8, 15), syncStatus: SYNC,
      })
    }
    return id
  }
  habit('Beber 2 L de agua', [0, 1, 2, 3, 4, 5, 6], L.health, { section: S.manana, skip: [9, 23] })
  habit('Leer 20 min', [0, 1, 2, 3, 4, 5, 6], L.study, { reminderTime: '21:00', pomodoroMinutes: 20, section: S.noche, skip: [4, 12, 27] })
  habit('Ejercicio', [1, 3, 5], L.health, { pomodoroMinutes: 30, skip: [15] })
  habit('Meditar', [0, 1, 2, 3, 4, 5, 6], L.personal, { reminderTime: '07:00', pomodoroMinutes: 10, section: S.manana, skip: [6, 7, 20] })
  habit('Escribir el diario', [0, 1, 2, 3, 4, 5, 6], L.personal, { reminderTime: '22:00', section: S.noche, skip: [3, 11, 19, 28] })
  habit('Repaso de inglés', [2, 4, 6], L.study, { pomodoroMinutes: 25, skip: [8] })

  // Que HOY queden algunos hábitos ya cumplidos y otros pendientes: quita el
  // log de hoy de un par (si tocaba) para que se vean pendientes en "Hoy".
  const todayDow = new Date().getDay()
  await db.habits.bulkAdd(habits)
  // "Ejercicio" y "Repaso de inglés" se dejan pendientes hoy (sin log de hoy).
  const pendingTodayTitles = new Set(['Ejercicio', 'Repaso de inglés', 'Escribir el diario'])
  const pendingIds = new Set(habits.filter((h) => pendingTodayTitles.has(h.title)).map((h) => h.id))
  const filteredLogs = logs.filter((l) => !(l.dateKey === keyOf(0) && pendingIds.has(l.habitId)))
  void todayDow
  await db.habitLogs.bulkAdd(filteredLogs)

  // --- Sesiones de foco (Pomodoro) ---
  const sessions: StudySession[] = []
  const taskByTitle = new Map(tasks.map((t) => [t.title, t]))
  const focusPlan: [number, number, string | null][] = [
    // [díasAtrás, minutos, listId]
    [0, 50, L.work], [0, 25, L.study],
    [1, 50, L.study], [1, 30, L.work],
    [2, 75, L.work], [2, 20, L.study],
    [3, 25, L.study], [4, 50, L.work], [4, 30, L.health],
    [5, 45, L.study], [6, 25, L.work], [7, 50, L.study],
    [8, 30, L.work], [9, 60, L.study], [10, 25, L.study],
    [11, 50, L.work], [13, 40, L.study], [14, 25, L.work],
    [16, 30, L.study], [18, 50, L.work], [21, 45, L.study],
    [24, 25, L.study], [28, 50, L.work],
  ]
  for (const [d, min, listId] of focusPlan) {
    sessions.push({
      id: uid(), taskId: null, habitId: null, listId,
      startedAt: at(d, 16), endedAt: at(d, 16, min), focusMinutes: min,
      kind: 'focus', completed: true, dateKey: keyOf(d),
      createdAt: at(d, 16, min), updatedAt: at(d, 16, min), syncStatus: SYNC,
    })
  }
  // Un par de sesiones vinculadas a la tarea de estudio de hoy, para llenar su barra.
  const studyTask = taskByTitle.get('Estudiar capítulo 4 de álgebra')
  if (studyTask) {
    sessions.push({
      id: uid(), taskId: studyTask.id, habitId: null, listId: L.study,
      startedAt: at(0, 14), endedAt: at(0, 14, 25), focusMinutes: 25,
      kind: 'focus', completed: true, dateKey: keyOf(0),
      createdAt: at(0, 14, 25), updatedAt: at(0, 14, 25), syncStatus: SYNC,
    })
  }
  await db.studySessions.bulkAdd(sessions)

  // --- Mapa de ideas ---
  const map: IdeaMap = {
    id: uid(), title: 'Proyecto: lanzar mi portafolio', view: 'tree', order: 1,
    createdAt: midnight(20), updatedAt: at(2, 19), syncStatus: SYNC,
  }
  await db.ideaMaps.add(map)
  const nodes: IdeaNode[] = []
  const node = (text: string, parentId: string | null, order: number, collapsed = false): string => {
    const id = uid()
    nodes.push({
      id, mapId: map.id, text, parentId, collapsed, x: null, y: null, order,
      createdAt: midnight(20), updatedAt: midnight(3), syncStatus: SYNC,
    })
    return id
  }
  const root = node('Portafolio', null, 0)
  const nDesign = node('Diseño', root, 0)
  node('Elegir paleta de colores', nDesign, 0)
  node('Wireframes de las secciones', nDesign, 1)
  node('Logo y tipografía', nDesign, 2)
  const nContent = node('Contenido', root, 1)
  node('Escribir el "sobre mí"', nContent, 0)
  node('Seleccionar 4 proyectos', nContent, 1)
  node('Redactar casos de estudio', nContent, 2)
  const nDev = node('Desarrollo', root, 2)
  node('Montar el proyecto', nDev, 0)
  node('Página de inicio', nDev, 1)
  node('Formulario de contacto', nDev, 2)
  node('Desplegar', nDev, 3)
  await db.ideaNodes.bulkAdd(nodes)

  // --- Perfil del jugador (nivel alto + racha) ---
  const totalXp = xpForLevel(1) + xpForLevel(2) + xpForLevel(3) + xpForLevel(4) + xpForLevel(5) + xpForLevel(6) + 220
  const info = levelFromXp(totalXp)
  const profile: PlayerProfile = {
    id: 'me',
    level: info.level,
    totalXp,
    streakCount: 12,
    lastActiveDate: keyOf(0),
    xpDay: keyOf(0),
    xpToday: 90,
    achievements: [],
    overdueNoticeDay: null,
    updatedAt: at(0, 8), syncStatus: SYNC,
  }
  await db.profile.put(profile)

  try {
    localStorage.setItem(DEMO_KEY, DEMO_VERSION)
  } catch {
    // sin localStorage: la demo igual quedó sembrada en la base
  }
}
