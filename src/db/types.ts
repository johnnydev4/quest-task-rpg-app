export type Priority = 'low' | 'medium' | 'high'

/** Estado de sincronización local-first: todo cambio local queda 'pending' hasta subir a la nube (Fase 9). */
export type SyncStatus = 'pending' | 'synced'

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'

export type RecurrenceEnd =
  | { type: 'never' }
  | { type: 'count'; remaining: number }
  | { type: 'until'; date: number }

export interface RecurrenceRule {
  every: number
  unit: RecurrenceUnit
  end: RecurrenceEnd
  /**
   * Días de la semana concretos (0=domingo … 6=sábado). Si está presente y no
   * vacío, la siguiente ocurrencia es el próximo día del conjunto (p. ej.
   * [1,2,3,4,5] = días laborales) y `every`/`unit` no se usan.
   */
  daysOfWeek?: number[] | null
}

export interface List {
  id: string
  name: string
  /** Color de la lista; null = sin color (punto hueco, sin tinte en tareas). */
  color: string | null
  /** Emoji decorativo mostrado a la izquierda del nombre; null/ausente = sin emoji. */
  emoji?: string | null
  order: number
  /** Nivel/XP del "atributo" RPG de esta categoría. */
  statLevel: number
  statXp: number
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

export interface Task {
  id: string
  listId: string | null
  title: string
  notes: string
  color: string | null
  /** Prioridad opcional; null = sin prioridad (no se muestra chip y da XP base). */
  priority: Priority | null
  /** Fecha programada en ms. Si dueHasTime es false, es medianoche local (solo fecha). */
  dueAt: number | null
  dueHasTime: boolean
  completed: boolean
  completedAt: number | null
  recurrenceRule: RecurrenceRule | null
  /**
   * Si esta tarea nació como siguiente ocurrencia de una recurrente, el id de
   * la tarea completada que la generó: al deshacer aquella, esta se anula.
   */
  spawnedFromTaskId?: string | null
  tagIds: string[]
  /** Minutos de pomodoro asignados a la tarea; null/ausente = sin pomodoro. */
  pomodoroMinutes?: number | null
  xpValue: number
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  completed: boolean
  order: number
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

export interface Comment {
  id: string
  taskId: string
  text: string
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

export interface Attachment {
  id: string
  taskId: string
  name: string
  mimeType: string
  size: number
  /** Contenido local (offline-first). En la nube vive en Supabase Storage (cloudPath). */
  blob: Blob
  cloudPath: string | null
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

export interface Tag {
  id: string
  name: string
  color: string
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

export interface Reminder {
  id: string
  taskId: string
  /** Próximo disparo (ms). */
  remindAt: number
  /** Repeticiones extra del aviso después del primero. */
  repeatCount: number
  /** Minutos entre repeticiones del aviso. */
  repeatEveryMin: number
  firedCount: number
  dismissed: boolean
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

export interface StudySession {
  id: string
  taskId: string | null
  /** Hábito vinculado a la sesión; alimenta su barra de objetivo pomodoro. */
  habitId?: string | null
  listId: string | null
  startedAt: number
  endedAt: number | null
  /** Minutos de foco reales (sin pausas ni descansos). */
  focusMinutes: number
  kind: 'focus' | 'break'
  completed: boolean
  /** Día local 'YYYY-MM-DD' para agregación en reportes. */
  dateKey: string
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

/**
 * Misión RPG (Fase extra): la "main quest" mensual (week 0) y las misiones
 * semanales (week 1..4) del mes temático. Las tareas normales son las side quests.
 */
export interface Quest {
  id: string
  /** Mes al que pertenece, 'YYYY-MM'. */
  monthKey: string
  /** 0 = misión principal del mes; 1..4 = semana N. */
  week: number
  title: string
  completed: boolean
  completedAt: number | null
  xpValue: number
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

/** Paso de una misión (checklist épica). */
export interface QuestStep {
  id: string
  questId: string
  title: string
  completed: boolean
  order: number
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

/**
 * Hábito: tarea repetitiva con días de la semana programados y fecha límite.
 * Se muestra como barra de progreso; las rachas de cumplimiento son COMBOS
 * (a más combo, más XP y color más alto en el arcoíris).
 */
export interface Habit {
  id: string
  title: string
  /** Días programados, 0=domingo … 6=sábado. */
  daysOfWeek: number[]
  /** Medianoche local del día de inicio. */
  startDate: number
  /** Medianoche local del último día; null = hábito indefinido (sin fecha límite). */
  endDate: number | null
  /** Hora del aviso diario 'HH:MM' (solo días programados sin cumplir); null/ausente = sin aviso. */
  reminderTime?: string | null
  /** Minutos de pomodoro vinculados al hábito; null/ausente = sin pomodoro. */
  pomodoroMinutes?: number | null
  /** Lista (atributo RPG) a la que pertenece; su XP va a esa lista. */
  listId?: string | null
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

/** Cumplimiento de un hábito en un día concreto. */
export interface HabitLog {
  id: string
  habitId: string
  /** Día local 'YYYY-MM-DD'. */
  dateKey: string
  /** XP otorgado (para restarlo exacto si se desmarca). */
  xp: number
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
}

/** Perfil del jugador: fila única con id 'me'. */
export interface PlayerProfile {
  id: string
  level: number
  totalXp: number
  streakCount: number
  /** Último día con al menos una tarea completada, como 'YYYY-MM-DD' local. */
  lastActiveDate: string | null
  achievements: string[]
  updatedAt: number
  syncStatus: SyncStatus
}

export type CompletionSoundId = 'pop' | 'chime' | 'click'
export type AmbientSoundId = 'none' | 'rain' | 'white' | 'brown'
export type ThemeMode = 'dark' | 'light' | 'system'

/** Ajustes de la app: fila única con id 'app'. */
export interface Settings {
  id: string
  soundEnabled: boolean
  /** 0..1 */
  soundVolume: number
  completionSound: CompletionSoundId
  theme: ThemeMode
  accentColor: string
  /** Tinte del efecto Liquid Glass; null = neutro (color de superficie). */
  glassTint: string | null
  /** Difusión (blur) del fondo en px. */
  bgBlur: number
  ambientSound: AmbientSoundId
  /** 0..1 */
  ambientVolume: number
  pomodoroFocusMin: number
  pomodoroShortBreakMin: number
  pomodoroLongBreakMin: number
  pomodoroLongBreakEvery: number
  updatedAt: number
  /** Los ajustes de personalización SÍ se sincronizan (tema, colores, sonidos…). */
  syncStatus?: SyncStatus
}

/**
 * Medios locales por dispositivo (id único). Hoy: la imagen de fondo ('bg').
 * Vive en su propia tabla para que cambiar la difusión no reescriba el blob
 * entero cada vez (en iPhone eso rompía el fondo) y para no sincronizarlo.
 */
export interface AppMedia {
  id: string
  blob: Blob
}

/** Lápida local para propagar eliminaciones a la nube (Fase 9). */
export interface Tombstone {
  id: string
  table: string
  deletedAt: number
}
