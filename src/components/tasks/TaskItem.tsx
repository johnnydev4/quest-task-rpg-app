import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { List, Tag, Task } from '../../db/types'
import { setTaskCompleted, updateTask } from '../../db/repo/tasks'
import { formatDue, formatDueTime, isOverdue, startOfToday } from '../../lib/dates'
import { PRIORITY_CHIP_CLASS, PRIORITY_LABEL } from '../../lib/priority'
import { playHoverTick } from '../../lib/sound'
import { useSettings } from '../../lib/useSettings'

interface TaskItemProps {
  task: Task
  list?: List
  tagsById?: Map<string, Tag>
  onOpen: (id: string) => void
  /** Muestra el botón "Hoy" para reprogramar tareas vencidas sin fricción (spec §2: no punitivo). */
  showMoveToToday?: boolean
  /** En la pestaña Hoy la etiqueta "Hoy" es redundante: se omite (queda solo la hora si tiene). */
  hideTodayChip?: boolean
}

const chipBase = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium'

export function TaskItem({
  task,
  list,
  tagsById,
  onOpen,
  showMoveToToday = false,
  hideTodayChip = false,
}: TaskItemProps) {
  const settings = useSettings()
  const subtasks = useLiveQuery(() => db.subtasks.where('taskId').equals(task.id).toArray(), [task.id])
  const commentCount = useLiveQuery(() => db.comments.where('taskId').equals(task.id).count(), [task.id]) ?? 0
  const attachmentCount =
    useLiveQuery(() => db.attachments.where('taskId').equals(task.id).count(), [task.id]) ?? 0
  const subTotal = subtasks?.length ?? 0
  const subDone = subtasks?.filter((s) => s.completed).length ?? 0

  const overdue = task.dueAt !== null && !task.completed && isOverdue(task.dueAt)
  const taskTags = (tagsById ? task.tagIds.map((id) => tagsById.get(id)).filter(Boolean) : []) as Tag[]
  // Color efectivo: el propio de la tarea manda; si no tiene, hereda el de su lista.
  const barColor = task.color ?? list?.color ?? null

  return (
    <div
      className="group flex items-center gap-3 rounded-xl border border-line/5 glass-panel px-3 py-2.5 transition-colors hover:border-line/15"
      onMouseEnter={() => {
        // Tic ASMR sutil solo en dispositivos con puntero (escritorio).
        if (settings.soundEnabled && window.matchMedia('(hover: hover)').matches) {
          playHoverTick(settings.soundVolume)
        }
      }}
    >
      {barColor && (
        <span className="w-1 self-stretch rounded-full" style={{ backgroundColor: barColor }} aria-hidden="true" />
      )}
      <button
        onClick={() => setTaskCompleted(task.id, !task.completed)}
        aria-label={task.completed ? 'Marcar como pendiente' : 'Completar tarea'}
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 ${
          task.completed
            ? 'check-pop border-accent-500 bg-accent-500'
            : 'border-ink-muted hover:scale-110 hover:border-accent-400'
        }`}
      >
        {task.completed && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <button onClick={() => onOpen(task.id)} className="min-w-0 flex-1 py-0.5 text-left">
        <p className={`truncate text-sm font-medium transition-colors ${task.completed ? 'text-ink-faint line-through' : 'text-ink'}`}>
          {task.title}
        </p>
        {!task.completed && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {task.dueAt !== null &&
              (hideTodayChip && formatDue(task.dueAt) === 'Hoy' ? (
                // En la pestaña Hoy: sin etiqueta redundante; solo la hora si la tiene.
                task.dueHasTime && (
                  <span className={`${chipBase} border-line/10 text-ink-muted`}>{formatDueTime(task.dueAt)}</span>
                )
              ) : (
                <span className={`${chipBase} ${overdue ? 'border-warn/30 bg-warn/10 text-warn' : 'border-line/10 text-ink-muted'}`}>
                  {formatDue(task.dueAt)}
                  {task.dueHasTime && ` · ${formatDueTime(task.dueAt)}`}
                </span>
              ))}
            {task.recurrenceRule && (
              <span className={`${chipBase} border-line/10 text-ink-muted`} aria-label="Se repite">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
                  <path d="m17 2 4 4-4 4" />
                  <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="m7 22-4-4 4-4" />
                  <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
              </span>
            )}
            {list && (
              <span className={`${chipBase} border-line/10 text-ink-muted`}>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: list.color }} aria-hidden="true" />
                {list.name}
                {list.emoji && ` ${list.emoji}`}
              </span>
            )}
            {taskTags.map((tag) => (
              <span
                key={tag.id}
                className={chipBase}
                style={{ backgroundColor: `${tag.color}22`, borderColor: `${tag.color}55`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {subTotal > 0 && (
              <span className={`${chipBase} border-line/10 text-ink-muted`}>
                {subDone}/{subTotal}
              </span>
            )}
            {commentCount > 0 && (
              <span className={`${chipBase} border-line/10 text-ink-muted`}>💬 {commentCount}</span>
            )}
            {attachmentCount > 0 && (
              <span className={`${chipBase} border-line/10 text-ink-muted`}>📎 {attachmentCount}</span>
            )}
            {/* La prioridad se muestra siempre (baja, media o alta) */}
            <span className={`${chipBase} ${PRIORITY_CHIP_CLASS[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>
          </span>
        )}
      </button>
      {showMoveToToday && !task.completed && (
        <button
          onClick={() => updateTask(task.id, { dueAt: startOfToday(), dueHasTime: false })}
          className="shrink-0 rounded-lg border border-line/10 px-2.5 py-1 text-xs font-medium text-ink-dim opacity-90 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          Hoy
        </button>
      )}
    </div>
  )
}
