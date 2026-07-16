import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type {
  Attachment,
  Comment,
  List,
  RecurrenceUnit,
  Reminder,
  Subtask,
  Tag,
  Task,
} from '../../db/types'
import { deleteTask, setTaskCompleted, updateTask } from '../../db/repo/tasks'
import { createSubtask, deleteSubtask, setSubtaskCompleted, updateSubtask } from '../../db/repo/subtasks'
import { createReminder, deleteReminder, updateReminder } from '../../db/repo/reminders'
import { createList } from '../../db/repo/lists'
import { DEFAULT_LIST_COLOR } from '../../lib/colors'
import {
  dateInputToMs,
  formatDateTime,
  formatDue,
  formatDueTime,
  msToDateInput,
  startOfDayOffset,
  startOfToday,
} from '../../lib/dates'
import { describeRule } from '../../lib/recurrence'
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_SELECTED_CLASS } from '../../lib/priority'
import { notificationService } from '../../services/notifications'
import { pomodoro } from '../../services/pomodoro'
import { emitToast } from '../../lib/events'
import { Modal } from '../ui/Modal'
import { ColorPicker } from '../ui/ColorPicker'
import { MiniCalendar } from '../ui/MiniCalendar'
import { TimeSelect } from '../ui/TimeSelect'
import { Sheet } from '../ui/Sheet'
import { TagSection } from './detail/TagSection'
import { CommentSection } from './detail/CommentSection'
import { AttachmentSection } from './detail/AttachmentSection'
import { RecurrenceSection } from './detail/RecurrenceSection'
import { ConvertToHabit } from '../habits/ConvertToHabit'

interface TaskDetailProps {
  taskId: string
  onClose: () => void
}

/** Contenido del detalle sin contenedor: lo usa el modal (móvil) y el panel lateral (escritorio). */
export function TaskDetailContent({ taskId, onClose }: TaskDetailProps) {
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId])
  const subtasks =
    useLiveQuery(() => db.subtasks.where('taskId').equals(taskId).sortBy('order'), [taskId]) ?? []
  const lists = useLiveQuery(() => db.lists.orderBy('order').toArray(), []) ?? []
  const tags = useLiveQuery(() => db.tags.orderBy('name').toArray(), []) ?? []
  const comments =
    useLiveQuery(() => db.comments.where('taskId').equals(taskId).sortBy('createdAt'), [taskId]) ?? []
  const attachments =
    useLiveQuery(() => db.attachments.where('taskId').equals(taskId).toArray(), [taskId]) ?? []
  const reminders =
    useLiveQuery(() => db.reminders.where('taskId').equals(taskId).sortBy('remindAt'), [taskId]) ?? []

  if (!task) return null

  return (
    <TaskForm
      key={task.id}
      task={task}
      subtasks={subtasks}
      lists={lists}
      tags={tags}
      comments={comments}
      attachments={attachments}
      reminders={reminders}
      onClose={onClose}
    />
  )
}

export function TaskDetail({ taskId, onClose }: TaskDetailProps) {
  return (
    <Modal title="Editar tarea" onClose={onClose}>
      <TaskDetailContent taskId={taskId} onClose={onClose} />
    </Modal>
  )
}

/**
 * Panel de fecha + hora con calendario propio y botón explícito de aplicar:
 * nada se guarda hasta confirmar (el picker nativo de iOS marcaba "hoy"
 * con solo abrirse, aunque se cancelara).
 */
function DateTimePanel({
  initialMs,
  applyLabel,
  onApply,
}: {
  initialMs: number | null
  applyLabel: string
  onApply: (ms: number) => void
}) {
  const init = initialMs !== null ? new Date(initialMs) : null
  const [day, setDay] = useState<number | null>(
    init ? new Date(init.getFullYear(), init.getMonth(), init.getDate()).getTime() : null,
  )
  const [time, setTime] = useState(
    init
      ? `${String(init.getHours()).padStart(2, '0')}:${String(init.getMinutes()).padStart(2, '0')}`
      : '09:00',
  )

  return (
    <div className="space-y-2.5 pt-1">
      <MiniCalendar value={day} onSelect={setDay} />
      <div className="flex items-center justify-between gap-2 px-1">
        <label className="flex items-center gap-2 text-sm text-ink-dim">
          Hora
          <TimeSelect value={time} onChange={setTime} ariaLabel="Hora del aviso" />
        </label>
        <button
          type="button"
          disabled={day === null}
          onClick={() => {
            if (day === null) return
            const [h, m] = time.split(':').map(Number)
            const d = new Date(day)
            d.setHours(h, m, 0, 0)
            onApply(d.getTime())
          }}
          className="rounded-lg bg-accent-600 px-3.5 py-1.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-40"
        >
          {applyLabel}
        </button>
      </div>
    </div>
  )
}

/** Icono de fila con el trazo estándar de la app. */
function RowIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5.5 shrink-0 lg:size-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Grupo de filas estilo iOS sobre cristal líquido. */
function Group({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-line/5 glass-panel">{children}</div>
}

/** Opción de una hoja (fila táctil grande estilo To Do). */
function SheetOption({
  icon,
  label,
  hint,
  selected,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint?: string
  selected?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-13 w-full items-center gap-3.5 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink/5 ${
        selected ? 'text-accent-300' : 'text-ink'
      }`}
    >
      <span className={selected ? 'text-accent-300' : 'text-ink-muted'}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[15px] lg:text-sm">{label}</span>
      {hint && <span className="shrink-0 text-sm text-ink-faint lg:text-xs">{hint}</span>}
      {selected && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="size-4.5 shrink-0 text-accent-300" aria-hidden="true">
          <path d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}

/** Etiqueta corta de fecha+hora para las opciones rápidas (p. ej. "lun, 21:00"). */
function shortWhen(ms: number): string {
  return new Intl.DateTimeFormat('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(ms)
}

/**
 * Hoja "Recordarme" (Aviso): opciones rápidas que crean el aviso de un toque,
 * como Microsoft To Do. Debajo, la lista de avisos ya puestos para editar/borrar.
 */
function ReminderSheet({
  taskId,
  reminders,
  onDone,
}: {
  taskId: string
  reminders: Reminder[]
  onDone: () => void
}) {
  const [permission, setPermission] = useState(notificationService.permission())
  // Panel "Elegir una fecha y una hora" (crear) y aviso en edición (uno a la vez).
  const [customOpen, setCustomOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function askPermission() {
    await notificationService.requestPermission()
    setPermission(notificationService.permission())
  }

  function addAt(ms: number) {
    createReminder({ taskId, remindAt: ms })
    onDone()
  }

  // Más tarde hoy: a las 21:00 si aún no ha pasado; si no, dentro de 2 horas.
  const laterToday = (() => {
    const d = new Date()
    if (d.getHours() < 21) {
      d.setHours(21, 0, 0, 0)
      return d.getTime()
    }
    return Date.now() + 2 * 60 * 60_000
  })()
  const tomorrow9 = startOfDayOffset(1) + 9 * 60 * 60_000
  const nextWeek9 = startOfDayOffset(7) + 9 * 60 * 60_000

  return (
    <div className="space-y-1">
      <SheetOption
        icon={
          <RowIcon>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </RowIcon>
        }
        label="Más tarde hoy"
        hint={new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(laterToday)}
        onClick={() => addAt(laterToday)}
      />
      <SheetOption
        icon={
          <RowIcon>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <path d="m9 16 2 2 4-4" />
          </RowIcon>
        }
        label="Mañana"
        hint={shortWhen(tomorrow9)}
        onClick={() => addAt(tomorrow9)}
      />
      <SheetOption
        icon={
          <RowIcon>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <path d="m8 16 3 3 5-6" />
          </RowIcon>
        }
        label="Semana próxima"
        hint={shortWhen(nextWeek9)}
        onClick={() => addAt(nextWeek9)}
      />
      {/* Selector propio con confirmación explícita (el nativo de iOS se
          auto-rellenaba y hasta creaba avisos con solo abrirse) */}
      <button
        type="button"
        onClick={() => setCustomOpen((v) => !v)}
        aria-expanded={customOpen}
        className="flex min-h-13 w-full items-center gap-3.5 rounded-xl px-3 text-left transition-colors hover:bg-ink/5"
      >
        <span className="text-ink-muted">
          <RowIcon>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
            <circle cx="16.5" cy="16.5" r="3.5" />
            <path d="M16.5 15.2v1.3l.9.9" />
          </RowIcon>
        </span>
        <span className="min-w-0 flex-1 text-[15px] text-ink lg:text-sm">Elegir una fecha y una hora</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`size-4 shrink-0 text-ink-faint transition-transform ${customOpen ? 'rotate-90' : ''}`} aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {customOpen && (
        <DateTimePanel
          initialMs={null}
          applyLabel="Añadir aviso"
          onApply={(ms) => {
            createReminder({ taskId, remindAt: ms })
            setCustomOpen(false)
          }}
        />
      )}

      {reminders.length > 0 && (
        <>
          <div className="my-2 border-t border-line/5" />
          <p className="px-3 pb-1 text-xs font-medium text-ink-muted">Avisos programados</p>
          {reminders.map((r) => (
            <div key={r.id}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditingId((id) => (id === r.id ? null : r.id))}
                  aria-expanded={editingId === r.id}
                  className="flex min-h-12 flex-1 items-center gap-3.5 rounded-xl px-3 text-left transition-colors hover:bg-ink/5"
                >
                  <span className="text-accent-300">
                    <RowIcon>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </RowIcon>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink lg:text-sm">
                    {formatDateTime(r.remindAt)}
                  </span>
                </button>
                <button
                  onClick={() => deleteReminder(r.id)}
                  aria-label="Eliminar recordatorio"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-danger"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {editingId === r.id && (
                <DateTimePanel
                  initialMs={r.remindAt}
                  applyLabel="Guardar"
                  onApply={(ms) => {
                    updateReminder(r.id, { remindAt: ms, dismissed: false, firedCount: 0 })
                    setEditingId(null)
                  }}
                />
              )}
            </div>
          ))}
        </>
      )}

      {permission === 'default' && (
        <button
          type="button"
          onClick={askPermission}
          className="mt-2 w-full rounded-lg border border-line/10 px-3 py-2 text-sm text-ink-dim transition-colors hover:bg-ink/5"
        >
          Permitir notificaciones del sistema
        </button>
      )}
      {permission === 'denied' && (
        <p className="mt-2 px-3 text-[11px] text-ink-faint">
          Notificaciones del sistema bloqueadas; los avisos saldrán dentro de la app.
        </p>
      )}
    </div>
  )
}

const REPEAT_PRESETS: { unit: RecurrenceUnit; label: string }[] = [
  { unit: 'day', label: 'Diariamente' },
  { unit: 'week', label: 'Semanalmente' },
  { unit: 'month', label: 'Mensualmente' },
  { unit: 'year', label: 'Anualmente' },
]

/**
 * Hoja "Repetir": presets de un toque (Diariamente, Semanalmente…) como To Do,
 * más "Personalizado" que revela el editor detallado (cada N · fin).
 */
function RepeatSheet({ task, onDone }: { task: Task; onDone: () => void }) {
  const rule = task.recurrenceRule
  const isSimple = !!rule && rule.every === 1 && rule.end.type === 'never'
  const isCustom = !!rule && !isSimple
  const [showCustom, setShowCustom] = useState(isCustom)

  return (
    <div className="space-y-1">
      <SheetOption
        icon={
          <RowIcon>
            <path d="M18 6 6 18M6 6l12 12" />
          </RowIcon>
        }
        label="No repetir"
        selected={!rule}
        onClick={() => {
          updateTask(task.id, { recurrenceRule: null })
          onDone()
        }}
      />
      {REPEAT_PRESETS.map((p) => (
        <SheetOption
          key={p.unit}
          icon={
            <RowIcon>
              <path d="m17 2 4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="m7 22-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </RowIcon>
          }
          label={p.label}
          selected={isSimple && rule!.unit === p.unit}
          onClick={() => {
            updateTask(task.id, {
              recurrenceRule: { every: 1, unit: p.unit, end: { type: 'never' } },
              // Una repetición necesita fecha ancla; sin ella, la tarea no saldría en Hoy.
              ...(task.dueAt === null ? { dueAt: startOfToday(), dueHasTime: false } : {}),
            })
            onDone()
          }}
        />
      ))}
      <SheetOption
        icon={
          <RowIcon>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 3.6a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </RowIcon>
        }
        label="Personalizado"
        selected={isCustom}
        onClick={() => {
          if (!rule) {
            updateTask(task.id, {
              recurrenceRule: { every: 2, unit: 'day', end: { type: 'never' } },
              ...(task.dueAt === null ? { dueAt: startOfToday(), dueHasTime: false } : {}),
            })
          }
          setShowCustom(true)
        }}
      />
      {(showCustom || isCustom) && task.recurrenceRule && (
        <div className="mt-2">
          <RecurrenceSection task={task} />
        </div>
      )}
    </div>
  )
}

/**
 * Fila de opción de la tarea. Al tocarla NO se despliega en el sitio:
 * abre una hoja inferior con su configuración (como To Do).
 */
function Row({
  icon,
  label,
  value,
  onClick,
}: {
  icon: ReactNode
  label: string
  value?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-13 w-full items-center gap-3.5 border-b border-line/5 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-ink/5"
    >
      <span className={value ? 'text-accent-300' : 'text-ink-muted'}>{icon}</span>
      <span className={`min-w-0 flex-1 truncate text-[15px] lg:text-sm ${value ? 'text-ink' : 'text-ink-muted'}`}>
        {label}
      </span>
      {value != null && (
        <span className="max-w-[45%] shrink-0 truncate text-sm text-ink-faint lg:text-xs">{value}</span>
      )}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 shrink-0 text-ink-faint"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  )
}

type SheetId =
  | 'fecha'
  | 'recordar'
  | 'repetir'
  | 'pomodoro'
  | 'habito'
  | 'lista'
  | 'color'
  | 'etiquetas'
  | 'archivos'
  | 'comentarios'

const SHEET_TITLE: Record<SheetId, string> = {
  fecha: 'Vencimiento',
  recordar: 'Recordarme',
  repetir: 'Repetir',
  pomodoro: 'Pomodoro',
  habito: 'Convertir en hábito',
  lista: 'Mover a una lista',
  color: 'Color',
  etiquetas: 'Etiquetas',
  archivos: 'Archivos',
  comentarios: 'Comentarios',
}

/** Duraciones de pomodoro ofrecidas para tareas y hábitos. */
const POMODORO_PRESETS = [10, 15, 25, 45, 60, 90]

function TaskForm({
  task,
  subtasks,
  lists,
  tags,
  comments,
  attachments,
  reminders,
  onClose,
}: {
  task: Task
  subtasks: Subtask[]
  lists: List[]
  tags: Tag[]
  comments: Comment[]
  attachments: Attachment[]
  reminders: Reminder[]
  onClose: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [newSubtask, setNewSubtask] = useState('')
  const [sheet, setSheet] = useState<SheetId | null>(null)
  // Calendario desplegable dentro de la hoja de Vencimiento.
  const [pickerOpen, setPickerOpen] = useState(false)

  const closeSheet = () => {
    setSheet(null)
    setPickerOpen(false)
  }

  function saveTitle() {
    const t = title.trim()
    if (t && t !== task.title) updateTask(task.id, { title: t })
    else setTitle(task.title)
  }

  function saveNotes() {
    if (notes !== task.notes) updateTask(task.id, { notes })
  }

  function addSubtask(e: FormEvent) {
    e.preventDefault()
    const t = newSubtask.trim()
    if (!t) return
    createSubtask(task.id, t)
    setNewSubtask('')
  }

  /** Hora opcional: '' = solo fecha (medianoche local). */
  function setTime(value: string) {
    if (task.dueAt === null) return
    const base = new Date(task.dueAt)
    base.setHours(0, 0, 0, 0)
    if (!value) {
      updateTask(task.id, { dueAt: base.getTime(), dueHasTime: false })
    } else {
      const [h, m] = value.split(':').map(Number)
      base.setHours(h, m)
      updateTask(task.id, { dueAt: base.getTime(), dueHasTime: true })
    }
  }

  const timeValue =
    task.dueAt !== null && task.dueHasTime ? new Date(task.dueAt).toTimeString().slice(0, 5) : ''

  const dueValue =
    task.dueAt !== null
      ? `${formatDue(task.dueAt)}${task.dueHasTime ? ` · ${formatDueTime(task.dueAt)}` : ''}`
      : null
  const currentList = task.listId ? lists.find((l) => l.id === task.listId) : undefined
  const taskTags = tags.filter((t) => task.tagIds.includes(t.id))

  const calIcon = (
    <RowIcon>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </RowIcon>
  )

  return (
    <div className="space-y-4">
      {/* Título */}
      <div className="flex items-center gap-3 px-1">
        <button
          onClick={() => setTaskCompleted(task.id, !task.completed)}
          aria-label={task.completed ? 'Marcar como pendiente' : 'Completar tarea'}
          className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            task.completed ? 'border-accent-500 bg-accent-500' : 'border-ink-muted hover:border-accent-400'
          }`}
        >
          {task.completed && (
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Título"
          className={`min-w-0 flex-1 border-none bg-transparent text-xl font-semibold text-ink outline-none placeholder-ink-faint ${
            task.completed ? 'text-ink-faint line-through' : ''
          }`}
        />
      </div>

      {/* Subtareas (pasos) */}
      <Group>
        {subtasks.map((s) => (
          <div key={s.id} className="border-b border-line/5 px-4 last:border-b-0">
            <SubtaskRow subtask={s} />
          </div>
        ))}
        <form onSubmit={addSubtask} className="flex min-h-13 items-center gap-3.5 px-4 py-2">
          <span className="text-accent-300">
            <RowIcon>
              <path d="M12 5v14M5 12h14" />
            </RowIcon>
          </span>
          <input
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            placeholder="Añadir paso"
            aria-label="Añadir subtarea"
            className="min-w-0 flex-1 border-none bg-transparent text-[15px] text-ink outline-none placeholder-accent-300 lg:text-sm"
          />
        </form>
      </Group>

      {/* Tiempo: fecha, recordatorio, repetición, hábito */}
      <Group>
        <Row
          icon={calIcon}
          label={dueValue ? 'Fecha de vencimiento' : 'Añadir fecha de vencimiento'}
          value={dueValue}
          onClick={() => setSheet('fecha')}
        />
        <Row
          icon={
            <RowIcon>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </RowIcon>
          }
          label={reminders.length > 0 ? 'Recordarme' : 'Añadir recordatorio'}
          value={reminders.length > 0 ? `${reminders.length}` : null}
          onClick={() => setSheet('recordar')}
        />
        <Row
          icon={
            <RowIcon>
              <path d="m17 2 4 4-4 4" />
              <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
              <path d="m7 22-4-4 4-4" />
              <path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </RowIcon>
          }
          label="Repetir"
          value={task.recurrenceRule ? describeRule(task.recurrenceRule) : null}
          onClick={() => setSheet('repetir')}
        />
        <Row
          icon={
            <RowIcon>
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2.5" />
              <path d="M9 2h6" />
            </RowIcon>
          }
          label={task.pomodoroMinutes != null ? 'Pomodoro' : 'Añadir pomodoro'}
          value={task.pomodoroMinutes != null ? `${task.pomodoroMinutes} min` : null}
          onClick={() => setSheet('pomodoro')}
        />
        <Row
          icon={
            <RowIcon>
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </RowIcon>
          }
          label="Convertir en hábito"
          onClick={() => setSheet('habito')}
        />
      </Group>

      {/* Organización: lista, prioridad, color, etiquetas */}
      <Group>
        <Row
          icon={
            <RowIcon>
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </RowIcon>
          }
          label={currentList ? 'Lista' : 'Añadir a una lista'}
          value={
            currentList ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: currentList.color }} aria-hidden="true" />
                {currentList.name}
              </span>
            ) : null
          }
          onClick={() => setSheet('lista')}
        />
        <div className="border-b border-line/5 px-4 py-3">
          <div className="flex items-center gap-3.5">
            <span className="text-ink-muted">
              <RowIcon>
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <path d="M4 22v-7" />
              </RowIcon>
            </span>
            <span className="text-[15px] text-ink-muted lg:text-sm">Prioridad</span>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Prioridad">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={task.priority === p}
                // Tocar la prioridad ya elegida la desactiva (queda sin prioridad).
                onClick={() => updateTask(task.id, { priority: task.priority === p ? null : p })}
                className={`rounded-xl border px-2 py-2 text-sm font-medium transition-colors ${
                  task.priority === p
                    ? PRIORITY_SELECTED_CLASS[p]
                    : 'border-line/10 text-ink-muted hover:bg-ink/5'
                }`}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        <Row
          icon={
            <RowIcon>
              <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
            </RowIcon>
          }
          label={task.color ? 'Color' : 'Añadir color'}
          value={
            task.color ? (
              <span className="inline-block size-4 rounded-full border border-line/15" style={{ backgroundColor: task.color }} aria-hidden="true" />
            ) : null
          }
          onClick={() => setSheet('color')}
        />
        <Row
          icon={
            <RowIcon>
              <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
              <path d="M7.5 7.5h.01" />
            </RowIcon>
          }
          label={taskTags.length > 0 ? 'Etiquetas' : 'Añadir etiquetas'}
          value={taskTags.length > 0 ? taskTags.map((t) => t.name).join(', ') : null}
          onClick={() => setSheet('etiquetas')}
        />
      </Group>

      {/* Contenido: archivos y comentarios */}
      <Group>
        <Row
          icon={
            <RowIcon>
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </RowIcon>
          }
          label={attachments.length > 0 ? 'Archivos' : 'Añadir archivo'}
          value={attachments.length > 0 ? `${attachments.length}` : null}
          onClick={() => setSheet('archivos')}
        />
        <Row
          icon={
            <RowIcon>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </RowIcon>
          }
          label={comments.length > 0 ? 'Comentarios' : 'Añadir comentario'}
          value={comments.length > 0 ? `${comments.length}` : null}
          onClick={() => setSheet('comentarios')}
        />
      </Group>

      {/* Nota, sin bordes (como To Do) */}
      <Group>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={4}
          placeholder="Añadir nota"
          aria-label="Notas"
          className="w-full resize-y border-none bg-transparent px-4 py-3.5 text-[15px] text-ink outline-none placeholder-ink-muted focus:shadow-none lg:text-sm"
        />
      </Group>

      {/* Pie: creada + papelera */}
      <div className="flex items-center gap-2 px-1 pt-1">
        <span className="flex-1 text-center text-xs text-ink-faint">
          Creada el {formatDateTime(task.createdAt)}
        </span>
        <DeleteTaskButton
          onDelete={async () => {
            await deleteTask(task.id)
            onClose()
          }}
        />
      </div>

      {/* Hojas inferiores (una a la vez): abren la configuración directamente */}
      {sheet && (
        <Sheet title={SHEET_TITLE[sheet]} onClose={closeSheet}>
          {sheet === 'fecha' && (
            <div className="space-y-1">
              <SheetOption
                icon={calIcon}
                label="Hoy"
                selected={task.dueAt !== null && msToDateInput(task.dueAt) === msToDateInput(startOfToday())}
                onClick={() => updateTask(task.id, { dueAt: startOfToday(), dueHasTime: false })}
              />
              <SheetOption
                icon={
                  <RowIcon>
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                    <path d="m9 16 2 2 4-4" />
                  </RowIcon>
                }
                label="Mañana"
                selected={task.dueAt !== null && msToDateInput(task.dueAt) === msToDateInput(startOfDayOffset(1))}
                onClick={() => updateTask(task.id, { dueAt: startOfDayOffset(1), dueHasTime: false })}
              />
              <SheetOption
                icon={
                  <RowIcon>
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                    <path d="m8 16 3 3 5-6" />
                  </RowIcon>
                }
                label="En una semana"
                onClick={() => updateTask(task.id, { dueAt: startOfDayOffset(7), dueHasTime: false })}
              />
              <div className="my-2 border-t border-line/5" />
              {/* Calendario propio: el <input type="date"> de iOS marcaba "hoy"
                  con solo abrirse aunque se cancelara sin elegir nada. */}
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                className="flex min-h-13 w-full items-center gap-3.5 rounded-xl px-3 text-left transition-colors hover:bg-ink/5"
              >
                <span className="text-ink-muted">
                  <RowIcon>
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </RowIcon>
                </span>
                <span className="min-w-0 flex-1 text-[15px] text-ink lg:text-sm">Elegir una fecha</span>
                {task.dueAt !== null && (
                  <span className="shrink-0 text-sm text-ink-faint lg:text-xs">{formatDue(task.dueAt)}</span>
                )}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`size-4 shrink-0 text-ink-faint transition-transform ${pickerOpen ? 'rotate-90' : ''}`} aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
              {pickerOpen && (
                <MiniCalendar
                  value={task.dueAt !== null ? dateInputToMs(msToDateInput(task.dueAt)) : null}
                  onSelect={(dayMs) => {
                    // Conserva la hora elegida si la había.
                    if (task.dueAt !== null && task.dueHasTime) {
                      const prev = new Date(task.dueAt)
                      const d = new Date(dayMs)
                      d.setHours(prev.getHours(), prev.getMinutes())
                      updateTask(task.id, { dueAt: d.getTime(), dueHasTime: true })
                    } else {
                      updateTask(task.id, { dueAt: dayMs, dueHasTime: false })
                    }
                  }}
                />
              )}
              {task.dueAt !== null && (
                <>
                  <label className="flex min-h-13 items-center gap-3.5 rounded-xl px-3 transition-colors hover:bg-ink/5">
                    <span className="text-ink-muted">
                      <RowIcon>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                      </RowIcon>
                    </span>
                    <span className="min-w-0 flex-1 text-[15px] text-ink lg:text-sm">Hora</span>
                    <TimeSelect
                      value={timeValue}
                      onChange={setTime}
                      noneLabel="Sin hora"
                      ariaLabel="Hora programada"
                    />
                  </label>
                  <div className="my-2 border-t border-line/5" />
                  <SheetOption
                    icon={
                      <RowIcon>
                        <path d="M18 6 6 18M6 6l12 12" />
                      </RowIcon>
                    }
                    label="Quitar fecha"
                    onClick={() => {
                      updateTask(task.id, { dueAt: null, dueHasTime: false })
                      closeSheet()
                    }}
                  />
                </>
              )}
            </div>
          )}

          {sheet === 'recordar' && (
            <ReminderSheet taskId={task.id} reminders={reminders} onDone={closeSheet} />
          )}

          {sheet === 'repetir' && <RepeatSheet task={task} onDone={closeSheet} />}

          {sheet === 'pomodoro' && (
            <div className="space-y-1">
              {POMODORO_PRESETS.map((min) => (
                <SheetOption
                  key={min}
                  icon={
                    <RowIcon>
                      <circle cx="12" cy="13" r="8" />
                      <path d="M12 9v4l2.5 2.5" />
                      <path d="M9 2h6" />
                    </RowIcon>
                  }
                  label={`${min} minutos`}
                  selected={task.pomodoroMinutes === min}
                  onClick={() => updateTask(task.id, { pomodoroMinutes: min })}
                />
              ))}
              <CustomMinutesInput
                current={POMODORO_PRESETS.includes(task.pomodoroMinutes ?? -1) ? null : (task.pomodoroMinutes ?? null)}
                onApply={(min) => updateTask(task.id, { pomodoroMinutes: min })}
              />
              {task.pomodoroMinutes != null && (
                <>
                  <div className="my-2 border-t border-line/5" />
                  <button
                    type="button"
                    onClick={() => {
                      // Esperar el start: es async y reinicia el estado (pisaría el minimized).
                      void pomodoro.start({ taskId: task.id }).then(() => pomodoro.setMinimized(true))
                      emitToast({ title: '🍅 Pomodoro iniciado', body: `${task.title} · objetivo ${task.pomodoroMinutes} min` })
                      closeSheet()
                    }}
                    className="w-full rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-500"
                  >
                    ▶ Empezar ahora · objetivo {task.pomodoroMinutes} min
                  </button>
                  <SheetOption
                    icon={
                      <RowIcon>
                        <path d="M18 6 6 18M6 6l12 12" />
                      </RowIcon>
                    }
                    label="Quitar pomodoro"
                    onClick={() => {
                      updateTask(task.id, { pomodoroMinutes: null })
                      closeSheet()
                    }}
                  />
                </>
              )}
            </div>
          )}

          {sheet === 'habito' && <ConvertToHabit task={task} onClose={onClose} autoOpen />}

          {sheet === 'lista' && (
            <div className="space-y-1">
              <SheetOption
                icon={
                  <RowIcon>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </RowIcon>
                }
                label="Sin lista"
                selected={!task.listId}
                onClick={() => {
                  updateTask(task.id, { listId: null })
                  closeSheet()
                }}
              />
              {lists.map((l) => (
                <SheetOption
                  key={l.id}
                  icon={
                    <span className="flex size-5.5 items-center justify-center lg:size-5">
                      <span className="size-3 rounded-full" style={{ backgroundColor: l.color }} aria-hidden="true" />
                    </span>
                  }
                  label={l.emoji ? `${l.emoji} ${l.name}` : l.name}
                  selected={task.listId === l.id}
                  onClick={() => {
                    updateTask(task.id, { listId: l.id })
                    closeSheet()
                  }}
                />
              ))}
              <div className="my-2 border-t border-line/5" />
              {/* Crear una lista aquí mismo (con color) y asignarla a la tarea */}
              <CreateListInline
                onCreated={(id) => {
                  updateTask(task.id, { listId: id })
                  closeSheet()
                }}
              />
            </div>
          )}

          {sheet === 'color' && (
            <ColorPicker value={task.color} onChange={(c) => updateTask(task.id, { color: c })} allowNone />
          )}

          {sheet === 'etiquetas' && <TagSection task={task} tags={tags} />}

          {sheet === 'archivos' && <AttachmentSection taskId={task.id} attachments={attachments} />}

          {sheet === 'comentarios' && <CommentSection taskId={task.id} comments={comments} />}
        </Sheet>
      )}
    </div>
  )
}

/** Minutos de pomodoro personalizados (1–180) con confirmación explícita. */
export function CustomMinutesInput({
  current,
  onApply,
}: {
  current: number | null
  onApply: (min: number) => void
}) {
  const [value, setValue] = useState(current !== null ? String(current) : '')
  const parsed = Math.round(Number(value))
  const valid = value !== '' && Number.isFinite(parsed) && parsed >= 1 && parsed <= 180

  return (
    <div className={`flex min-h-13 items-center gap-3 rounded-xl px-3 ${current !== null ? 'text-accent-300' : ''}`}>
      <span className={`min-w-0 flex-1 text-[15px] lg:text-sm ${current !== null ? 'text-accent-300' : 'text-ink'}`}>
        Personalizado{current !== null ? ` · ${current} min` : ''}
      </span>
      <input
        type="number"
        min={1}
        max={180}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="min"
        aria-label="Minutos personalizados de pomodoro"
        className="w-20 rounded-md border border-line/10 glass-input px-2 py-1.5 text-center text-sm text-ink placeholder-ink-faint outline-none focus:border-accent-500/60"
      />
      <button
        type="button"
        disabled={!valid}
        onClick={() => valid && onApply(parsed)}
        className="rounded-lg border border-line/10 px-3 py-1.5 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5 disabled:opacity-40"
      >
        OK
      </button>
    </div>
  )
}

/** Formulario compacto para crear una lista (nombre + color) sin salir de la hoja. */
function CreateListInline({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_LIST_COLOR)

  async function create() {
    const n = name.trim()
    if (!n) return
    const id = await createList(n, color)
    setName('')
    onCreated(id)
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-line/10 glass-input p-3">
      <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">Nueva lista</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void create()}
        placeholder="Ej. Hogar, Trabajo…"
        aria-label="Nombre de la lista nueva"
        className="w-full rounded-lg border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60"
      />
      <ColorPicker value={color} onChange={(c) => c && setColor(c)} allowCustom />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => void create()}
        className="w-full rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-40"
      >
        Crear y asignar
      </button>
    </div>
  )
}

/** Papelera con confirmación de doble toque (se desarma sola a los 3 s). */
function DeleteTaskButton({ onDelete }: { onDelete: () => void }) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <button
      onClick={() => (armed ? onDelete() : setArmed(true))}
      aria-label={armed ? 'Confirmar eliminación' : 'Eliminar tarea'}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm transition-all ${
        armed ? 'bg-danger/15 font-semibold text-danger' : 'text-ink-muted hover:bg-ink/5 hover:text-danger'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M10 11v6M14 11v6" />
      </svg>
      {armed && '¿Seguro?'}
    </button>
  )
}

function SubtaskRow({ subtask }: { subtask: Subtask }) {
  const [title, setTitle] = useState(subtask.title)

  function saveTitle() {
    const t = title.trim()
    if (t && t !== subtask.title) updateSubtask(subtask.id, { title: t })
    else setTitle(subtask.title)
  }

  return (
    <div className="group flex min-h-12 items-center gap-3.5 py-1.5">
      <button
        onClick={() => setSubtaskCompleted(subtask.id, !subtask.completed)}
        aria-label={subtask.completed ? 'Marcar pendiente' : 'Completar subtarea'}
        className={`flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          subtask.completed ? 'border-accent-500 bg-accent-500' : 'border-ink-muted hover:border-accent-400'
        }`}
      >
        {subtask.completed && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label="Título de subtarea"
        className={`min-w-0 flex-1 border-none bg-transparent text-[15px] outline-none lg:text-sm ${
          subtask.completed ? 'text-ink-faint line-through' : 'text-ink-dim'
        }`}
      />
      <button
        onClick={() => deleteSubtask(subtask.id)}
        aria-label="Eliminar subtarea"
        className="flex size-7 shrink-0 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
