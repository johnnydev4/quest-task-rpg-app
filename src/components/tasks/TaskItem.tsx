import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { List, Tag, Task } from '../../db/types'
import { deleteTask, setTaskCompleted, skipOverdueToNearest, updateTask } from '../../db/repo/tasks'
import { formatDue, formatDueTime, isOverdue, startOfDayOffset, startOfToday } from '../../lib/dates'
import { PRIORITY_CHIP_CLASS, PRIORITY_LABEL } from '../../lib/priority'
import { playHoverTick } from '../../lib/sound'
import { useSettings } from '../../lib/useSettings'
import { usePomodoroProgress } from '../../lib/usePomodoroProgress'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { SwipeToDelete } from '../ui/SwipeToDelete'
import {
  CalendarIcon,
  CheckCircleIcon,
  CommentIcon,
  FlagIcon,
  FolderIcon,
  ForwardIcon,
  PaperclipIcon,
  SunIcon,
  TimerIcon,
  TrashIcon,
} from '../ui/icons'

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

// Chips compactos: la fila de configuración bajo el título ocupa lo mínimo.
const chipBase = 'inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium'

/** Menú contextual (clic derecho) de una tarea: Hoy, prioridad, completar, fecha y lista. */
function TaskContextMenu({ task, x, y, onClose }: { task: Task; x: number; y: number; onClose: () => void }) {
  const lists = useLiveQuery(() => db.lists.orderBy('order').toArray(), []) ?? []
  const inToday = task.dueAt !== null && task.dueAt < startOfDayOffset(1)
  // Recurrente atrasada: puede saltar a su ocurrencia más cercana desde hoy.
  const overdueRecurring =
    task.recurrenceRule !== null && task.dueAt !== null && task.dueAt < startOfToday() && !task.completed

  const entries: MenuEntry[] = [
    ...(overdueRecurring
      ? [
          {
            label: 'Saltar a hoy',
            icon: <ForwardIcon className="size-4" />,
            onClick: () => void skipOverdueToNearest(task.id),
          },
        ]
      : []),
    inToday
      ? {
          label: 'Quitar de Hoy',
          icon: <SunIcon className="size-4" />,
          onClick: () => void updateTask(task.id, { dueAt: null }),
        }
      : {
          label: 'Agregar a Hoy',
          icon: <SunIcon className="size-4" />,
          onClick: () => void updateTask(task.id, { dueAt: startOfToday(), dueHasTime: false }),
        },
    {
      label: task.completed ? 'Marcar como pendiente' : 'Marcar como completada',
      icon: <CheckCircleIcon className="size-4" />,
      onClick: () => void setTaskCompleted(task.id, !task.completed),
    },
    {
      label: 'Definir prioridad',
      icon: <FlagIcon className="size-4" />,
      submenu: [
        ...(['low', 'medium', 'high'] as const).map((p) => ({
          label: PRIORITY_LABEL[p],
          selected: task.priority === p,
          onClick: () => void updateTask(task.id, { priority: p }),
        })),
        {
          label: 'Sin prioridad',
          selected: task.priority === null,
          onClick: () => void updateTask(task.id, { priority: null }),
        },
      ],
    },
    {
      label: 'Fecha de vencimiento',
      icon: <CalendarIcon className="size-4" />,
      submenu: [
        { label: 'Hoy', onClick: () => void updateTask(task.id, { dueAt: startOfToday(), dueHasTime: false }) },
        { label: 'Mañana', onClick: () => void updateTask(task.id, { dueAt: startOfDayOffset(1), dueHasTime: false }) },
        {
          label: 'En una semana',
          onClick: () => void updateTask(task.id, { dueAt: startOfDayOffset(7), dueHasTime: false }),
        },
        { label: 'Sin fecha', selected: task.dueAt === null, onClick: () => void updateTask(task.id, { dueAt: null }) },
      ],
    },
    {
      label: 'Mover a lista…',
      icon: <FolderIcon className="size-4" />,
      submenu: [
        ...lists.map((l) => ({
          label: l.emoji ? `${l.emoji} ${l.name}` : l.name,
          selected: task.listId === l.id,
          onClick: () => void updateTask(task.id, { listId: l.id }),
        })),
        { label: 'Sin lista', selected: task.listId === null, onClick: () => void updateTask(task.id, { listId: null }) },
      ],
    },
    {
      label: 'Eliminar tarea',
      icon: <TrashIcon className="size-4" />,
      danger: true,
      onClick: () => void deleteTask(task.id),
    },
  ]

  return <ContextMenu x={x} y={y} entries={entries} onClose={onClose} />
}

export function TaskItem({
  task,
  list,
  tagsById,
  onOpen,
  showMoveToToday = false,
  hideTodayChip = false,
}: TaskItemProps) {
  const settings = useSettings()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const subtasks = useLiveQuery(() => db.subtasks.where('taskId').equals(task.id).toArray(), [task.id])
  const commentCount = useLiveQuery(() => db.comments.where('taskId').equals(task.id).count(), [task.id]) ?? 0
  const attachmentCount =
    useLiveQuery(() => db.attachments.where('taskId').equals(task.id).count(), [task.id]) ?? 0
  const subTotal = subtasks?.length ?? 0
  const subDone = subtasks?.filter((s) => s.completed).length ?? 0

  const overdue = task.dueAt !== null && !task.completed && isOverdue(task.dueAt)
  const taskTags = (tagsById ? task.tagIds.map((id) => tagsById.get(id)).filter(Boolean) : []) as Tag[]
  // Barra de objetivo pomodoro: minutos de foco de hoy vinculados a esta tarea.
  const pomo = usePomodoroProgress({ taskId: task.id }, task.pomodoroMinutes)
  // Color efectivo: el propio de la tarea manda; si no tiene, hereda el de su lista.
  const barColor = task.color ?? list?.color ?? null

  return (
    <SwipeToDelete onDelete={() => void deleteTask(task.id)}>
    <div
      className="group flex items-center gap-3 rounded-xl border border-line/5 glass-panel px-3 py-1.5 transition-colors hover:border-line/15"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
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
          <span className="mt-0.5 flex flex-wrap items-center gap-1">
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
                {list.color && (
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: list.color }} aria-hidden="true" />
                )}
                {list.emoji && `${list.emoji} `}
                {list.name}
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
              <span className={`${chipBase} border-line/10 text-ink-muted`}>
                <CommentIcon className="size-2.5" /> {commentCount}
              </span>
            )}
            {attachmentCount > 0 && (
              <span className={`${chipBase} border-line/10 text-ink-muted`}>
                <PaperclipIcon className="size-2.5" /> {attachmentCount}
              </span>
            )}
            {/* La prioridad solo se muestra si está asignada */}
            {task.priority && (
              <span className={`${chipBase} ${PRIORITY_CHIP_CLASS[task.priority]}`}>{PRIORITY_LABEL[task.priority]}</span>
            )}
          </span>
        )}
        {!task.completed && pomo && (
          <span className="mt-1.5 block max-w-56">
            <span className="flex items-center gap-1 text-[10px] text-ink-faint">
              <TimerIcon className="size-3" />
              {pomo.completed ? '¡Pomodoro completado!' : `${pomo.doneMin}/${pomo.goalMin} min de foco`}
            </span>
            <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-ink/10">
              <span
                className={`block h-full rounded-full transition-all duration-500 ${pomo.completed ? 'bg-ok' : 'bg-accent-500'}`}
                style={{ width: `${pomo.pct}%` }}
              />
            </span>
          </span>
        )}
      </button>
      {showMoveToToday && overdue && !task.completed && (
        <button
          onClick={() => updateTask(task.id, { dueAt: startOfToday(), dueHasTime: false })}
          className="shrink-0 rounded-lg border border-line/10 px-2.5 py-1 text-xs font-medium text-ink-dim opacity-90 transition-colors hover:bg-ink/5 hover:text-ink"
        >
          Hoy
        </button>
      )}
      {menu && <TaskContextMenu task={task} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
    </SwipeToDelete>
  )
}
