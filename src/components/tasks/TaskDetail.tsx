import { useState, type FormEvent, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Attachment, Comment, List, Reminder, Subtask, Tag, Task } from '../../db/types'
import { deleteTask, setTaskCompleted, updateTask } from '../../db/repo/tasks'
import { createSubtask, deleteSubtask, setSubtaskCompleted, updateSubtask } from '../../db/repo/subtasks'
import { dateInputToMs, msToDateInput, startOfDayOffset, startOfToday } from '../../lib/dates'
import { PRIORITIES, PRIORITY_LABEL, PRIORITY_SELECTED_CLASS } from '../../lib/priority'
import { Modal } from '../ui/Modal'
import { ColorPicker } from '../ui/ColorPicker'
import { ConfirmButton } from '../ui/ConfirmButton'
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">{label}</span>
      {children}
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-line/10 bg-surface-700 px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60'

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

  const timeValue = task.dueAt !== null && task.dueHasTime
    ? new Date(task.dueAt).toTimeString().slice(0, 5)
    : ''

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setTaskCompleted(task.id, !task.completed)}
          aria-label={task.completed ? 'Marcar como pendiente' : 'Completar tarea'}
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            task.completed ? 'border-accent-500 bg-accent-500' : 'border-ink-muted hover:border-accent-400'
          }`}
        >
          {task.completed && (
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
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
          className={`flex-1 border-none bg-transparent text-lg font-semibold text-ink outline-none placeholder-ink-faint ${
            task.completed ? 'text-ink-faint line-through' : ''
          }`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Lista">
          <select
            value={task.listId ?? ''}
            onChange={(e) => updateTask(task.id, { listId: e.target.value || null })}
            className={inputClass}
          >
            <option value="">Sin lista</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha">
          <input
            type="date"
            value={msToDateInput(task.dueAt)}
            onChange={(e) => {
              const ms = dateInputToMs(e.target.value)
              updateTask(task.id, { dueAt: ms, dueHasTime: ms === null ? false : task.dueHasTime })
            }}
            className={`${inputClass}`}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => updateTask(task.id, { dueAt: startOfToday(), dueHasTime: false })} className="rounded-full border border-line/10 px-3 py-1 text-ink-dim transition-colors hover:bg-ink/5">
          Hoy
        </button>
        <button type="button" onClick={() => updateTask(task.id, { dueAt: startOfDayOffset(1), dueHasTime: false })} className="rounded-full border border-line/10 px-3 py-1 text-ink-dim transition-colors hover:bg-ink/5">
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
            <button type="button" onClick={() => updateTask(task.id, { dueAt: null, dueHasTime: false })} className="rounded-full border border-line/10 px-3 py-1 text-ink-muted transition-colors hover:bg-ink/5">
              Sin fecha
            </button>
          </>
        )}
      </div>

      <Field label="Repetir">
        <RecurrenceSection task={task} />
      </Field>

      <Field label="Hábito">
        <ConvertToHabit task={task} onClose={onClose} />
      </Field>

      <Field label="Prioridad">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Prioridad">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={task.priority === p}
              onClick={() => updateTask(task.id, { priority: p })}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                task.priority === p
                  ? PRIORITY_SELECTED_CLASS[p]
                  : 'border-line/10 text-ink-muted hover:bg-ink/5'
              }`}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Color">
        <ColorPicker value={task.color} onChange={(c) => updateTask(task.id, { color: c })} allowNone />
      </Field>

      <Field label="Etiquetas">
        <TagSection task={task} tags={tags} />
      </Field>

      <Field label="Notas">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          placeholder="Añade detalles…"
          className={`${inputClass} resize-y`}
        />
      </Field>

      <Field label={`Subtareas${subtasks.length ? ` · ${subtasks.filter((s) => s.completed).length}/${subtasks.length}` : ''}`}>
        <div className="space-y-1">
          {subtasks.map((s) => (
            <SubtaskRow key={s.id} subtask={s} />
          ))}
          <form onSubmit={addSubtask} className="flex gap-2 pt-1">
            <input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Añadir subtarea"
              aria-label="Añadir subtarea"
              className={inputClass}
            />
          </form>
        </div>
      </Field>

      <Field label={`Recordatorios${reminders.length ? ` · ${reminders.length}` : ''}`}>
        <ReminderSection taskId={task.id} reminders={reminders} />
      </Field>

      <Field label={`Adjuntos${attachments.length ? ` · ${attachments.length}` : ''}`}>
        <AttachmentSection taskId={task.id} attachments={attachments} />
      </Field>

      <Field label={`Comentarios${comments.length ? ` · ${comments.length}` : ''}`}>
        <CommentSection taskId={task.id} comments={comments} />
      </Field>

      <div className="flex items-center justify-between border-t border-line/5 pt-4">
        <ConfirmButton
          label="Eliminar tarea"
          confirmLabel="¿Seguro? Toca de nuevo"
          onConfirm={async () => {
            await deleteTask(task.id)
            onClose()
          }}
        />
        <button
          onClick={onClose}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-500"
        >
          Listo
        </button>
      </div>
    </div>
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
    <div className="group flex items-center gap-2.5 rounded-lg px-1 py-1">
      <button
        onClick={() => setSubtaskCompleted(subtask.id, !subtask.completed)}
        aria-label={subtask.completed ? 'Marcar pendiente' : 'Completar subtarea'}
        className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          subtask.completed ? 'border-accent-500 bg-accent-500' : 'border-ink-muted hover:border-accent-400'
        }`}
      >
        {subtask.completed && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-2.5" aria-hidden="true">
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
        className={`min-w-0 flex-1 border-none bg-transparent text-sm outline-none ${
          subtask.completed ? 'text-ink-faint line-through' : 'text-ink-dim'
        }`}
      />
      <button
        onClick={() => deleteSubtask(subtask.id)}
        aria-label="Eliminar subtarea"
        className="flex size-6 shrink-0 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
