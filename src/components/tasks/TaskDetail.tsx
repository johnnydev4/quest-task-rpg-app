import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Attachment, Comment, List, Reminder, Subtask, Tag, Task } from '../../db/types'
import { deleteTask, setTaskCompleted, updateTask } from '../../db/repo/tasks'
import { createSubtask, deleteSubtask, setSubtaskCompleted, updateSubtask } from '../../db/repo/subtasks'
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
import { PRIORITIES, PRIORITY_CHIP_CLASS, PRIORITY_LABEL, PRIORITY_SELECTED_CLASS } from '../../lib/priority'
import { Modal } from '../ui/Modal'
import { ColorPicker } from '../ui/ColorPicker'
import { TagSection } from './detail/TagSection'
import { CommentSection } from './detail/CommentSection'
import { AttachmentSection } from './detail/AttachmentSection'
import { ReminderSection } from './detail/ReminderSection'
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

const inputClass =
  'w-full rounded-lg border border-line/10 bg-surface-700 px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60'

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

/**
 * Fila táctil (icono + etiqueta + valor) que se expande para editar,
 * inspirada en Microsoft To Do y adaptada al Liquid Glass.
 */
function Row({
  icon,
  label,
  value,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode
  label: string
  value?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="border-b border-line/5 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-13 w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-ink/5"
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
          className={`size-4 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {open && <div className="px-4 pt-1 pb-4">{children}</div>}
    </div>
  )
}

type RowId =
  | 'fecha'
  | 'recordar'
  | 'repetir'
  | 'habito'
  | 'lista'
  | 'prioridad'
  | 'color'
  | 'etiquetas'
  | 'archivos'
  | 'comentarios'

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
  const [openRow, setOpenRow] = useState<RowId | null>(null)

  const toggle = (row: RowId) => setOpenRow((current) => (current === row ? null : row))

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
          icon={
            <RowIcon>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </RowIcon>
          }
          label={dueValue ? 'Fecha de vencimiento' : 'Añadir fecha de vencimiento'}
          value={dueValue}
          open={openRow === 'fecha'}
          onToggle={() => toggle('fecha')}
        >
          <div className="space-y-3">
            <input
              type="date"
              value={msToDateInput(task.dueAt)}
              onChange={(e) => {
                const ms = dateInputToMs(e.target.value)
                updateTask(task.id, { dueAt: ms, dueHasTime: ms === null ? false : task.dueHasTime })
              }}
              aria-label="Fecha"
              className={inputClass}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button type="button" onClick={() => updateTask(task.id, { dueAt: startOfToday(), dueHasTime: false })} className="rounded-full border border-line/10 px-3 py-1.5 text-ink-dim transition-colors hover:bg-ink/5">
                Hoy
              </button>
              <button type="button" onClick={() => updateTask(task.id, { dueAt: startOfDayOffset(1), dueHasTime: false })} className="rounded-full border border-line/10 px-3 py-1.5 text-ink-dim transition-colors hover:bg-ink/5">
                Mañana
              </button>
              {task.dueAt !== null && (
                <>
                  <label className="flex items-center gap-1.5 text-ink-muted">
                    Hora:
                    <input
                      type="time"
                      value={timeValue}
                      onChange={(e) => setTime(e.target.value)}
                      aria-label="Hora programada"
                      className="rounded-md border border-line/10 bg-surface-700 px-2 py-1 text-xs text-ink outline-none focus:border-accent-500/60"
                    />
                  </label>
                  <button type="button" onClick={() => updateTask(task.id, { dueAt: null, dueHasTime: false })} className="rounded-full border border-line/10 px-3 py-1.5 text-ink-muted transition-colors hover:bg-ink/5">
                    Sin fecha
                  </button>
                </>
              )}
            </div>
          </div>
        </Row>
        <Row
          icon={
            <RowIcon>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </RowIcon>
          }
          label={reminders.length > 0 ? 'Recordarme' : 'Añadir recordatorio'}
          value={reminders.length > 0 ? `${reminders.length}` : null}
          open={openRow === 'recordar'}
          onToggle={() => toggle('recordar')}
        >
          <ReminderSection taskId={task.id} reminders={reminders} />
        </Row>
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
          open={openRow === 'repetir'}
          onToggle={() => toggle('repetir')}
        >
          <RecurrenceSection task={task} />
        </Row>
        <Row
          icon={
            <RowIcon>
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </RowIcon>
          }
          label="Convertir en hábito"
          open={openRow === 'habito'}
          onToggle={() => toggle('habito')}
        >
          <ConvertToHabit task={task} onClose={onClose} />
        </Row>
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
          open={openRow === 'lista'}
          onToggle={() => toggle('lista')}
        >
          <select
            value={task.listId ?? ''}
            onChange={(e) => updateTask(task.id, { listId: e.target.value || null })}
            aria-label="Lista"
            className={inputClass}
          >
            <option value="">Sin lista</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Row>
        <Row
          icon={
            <RowIcon>
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <path d="M4 22v-7" />
            </RowIcon>
          }
          label="Prioridad"
          value={
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${PRIORITY_CHIP_CLASS[task.priority]}`}>
              {PRIORITY_LABEL[task.priority]}
            </span>
          }
          open={openRow === 'prioridad'}
          onToggle={() => toggle('prioridad')}
        >
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Prioridad">
            {PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={task.priority === p}
                onClick={() => updateTask(task.id, { priority: p })}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  task.priority === p ? PRIORITY_SELECTED_CLASS[p] : 'border-line/10 text-ink-muted hover:bg-ink/5'
                }`}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </Row>
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
          open={openRow === 'color'}
          onToggle={() => toggle('color')}
        >
          <ColorPicker value={task.color} onChange={(c) => updateTask(task.id, { color: c })} allowNone />
        </Row>
        <Row
          icon={
            <RowIcon>
              <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
              <path d="M7.5 7.5h.01" />
            </RowIcon>
          }
          label={taskTags.length > 0 ? 'Etiquetas' : 'Añadir etiquetas'}
          value={taskTags.length > 0 ? taskTags.map((t) => t.name).join(', ') : null}
          open={openRow === 'etiquetas'}
          onToggle={() => toggle('etiquetas')}
        >
          <TagSection task={task} tags={tags} />
        </Row>
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
          open={openRow === 'archivos'}
          onToggle={() => toggle('archivos')}
        >
          <AttachmentSection taskId={task.id} attachments={attachments} />
        </Row>
        <Row
          icon={
            <RowIcon>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </RowIcon>
          }
          label={comments.length > 0 ? 'Comentarios' : 'Añadir comentario'}
          value={comments.length > 0 ? `${comments.length}` : null}
          open={openRow === 'comentarios'}
          onToggle={() => toggle('comentarios')}
        >
          <CommentSection taskId={task.id} comments={comments} />
        </Row>
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
