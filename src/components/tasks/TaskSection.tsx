import { useState, type ReactNode } from 'react'
import type { List, Tag, Task } from '../../db/types'
import { TaskItem } from './TaskItem'

interface TaskSectionProps {
  title?: string
  tasks: Task[]
  listsById: Map<string, List>
  tagsById?: Map<string, Tag>
  onOpen: (id: string) => void
  collapsible?: boolean
  showMoveToToday?: boolean
  /** Contenido extra al inicio de la lista (p. ej. los hábitos de hoy). */
  leading?: ReactNode
  /** Omite la etiqueta "Hoy" en cada tarea (redundante en la pestaña Hoy). */
  hideTodayChip?: boolean
  /** Control a la derecha de la fila del título (p. ej. el menú de orden). */
  action?: ReactNode
}

export function TaskSection({
  title,
  tasks,
  listsById,
  tagsById,
  onOpen,
  collapsible = false,
  showMoveToToday = false,
  leading,
  hideTodayChip = false,
  action,
}: TaskSectionProps) {
  const [open, setOpen] = useState(!collapsible)

  if (tasks.length === 0 && !leading) return null

  return (
    <section className="space-y-1.5">
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-1">
          {collapsible && title ? (
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink-dim"
              aria-expanded={open}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
              {title}
              <span className="text-xs font-normal text-ink-faint">{tasks.length}</span>
            </button>
          ) : title ? (
            <h2 className="text-sm font-semibold text-ink-muted">
              {title} <span className="text-xs font-normal text-ink-faint">{tasks.length}</span>
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}
      {(!collapsible || open) && (
        <div className="space-y-1.5">
          {leading}
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              list={task.listId ? listsById.get(task.listId) : undefined}
              tagsById={tagsById}
              onOpen={onOpen}
              showMoveToToday={showMoveToToday}
              hideTodayChip={hideTodayChip}
            />
          ))}
        </div>
      )}
    </section>
  )
}
