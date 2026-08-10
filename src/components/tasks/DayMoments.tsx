import { useEffect, useRef, useState } from 'react'
import type { DaySection, Habit, List, Tag, Task } from '../../db/types'
import {
  createDaySection,
  deleteDaySection,
  moveDaySection,
  updateDaySection,
  zoneToSectionId,
} from '../../db/repo/daySections'
import { updateTask } from '../../db/repo/tasks'
import { PendingHabits } from '../habits/HabitsToday'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { SortableItem, SortableList } from '../ui/Sortable'
import { ArrowDownIcon, ArrowUpIcon, ClockIcon, MoreIcon, PencilIcon, PlusIcon, TrashIcon } from '../ui/icons'
import { TaskItem } from './TaskItem'

/**
 * Momentos del día de la pestaña Hoy ("Mediodía", "9pm", "Más tarde"…).
 *
 * Cada momento es una sección plegable y, a la vez, una zona de soltado: al
 * arrastrar una tarea o un hábito encima, este pasa a pertenecer al momento
 * (`daySectionId`). Funciona igual con ratón y con el dedo, porque las zonas
 * están en la propia pantalla (ver `ui/Sortable`).
 */

interface DayMomentsProps {
  sections: DaySection[]
  /** Tareas de hoy pendientes, ya agrupadas y ordenadas por momento. */
  tasksBySection: Map<string, Task[]>
  /** Hábitos de hoy pendientes, agrupados por momento. */
  habitsBySection: Map<string, Habit[]>
  listsById: Map<string, List>
  tagsById: Map<string, Tag>
  onOpen: (id: string) => void
  onReorder: (ids: string[]) => void
  onMoveToList: (listId: string, taskId: string) => void
}

export function DayMoments({
  sections,
  tasksBySection,
  habitsBySection,
  listsById,
  tagsById,
  onOpen,
  onReorder,
  onMoveToList,
}: DayMomentsProps) {
  const [adding, setAdding] = useState(false)

  return (
    <>
      {sections.map((section, i) => (
        <DayMomentSection
          key={section.id}
          section={section}
          isFirst={i === 0}
          isLast={i === sections.length - 1}
          tasks={tasksBySection.get(section.id) ?? []}
          habits={habitsBySection.get(section.id) ?? []}
          listsById={listsById}
          tagsById={tagsById}
          onOpen={onOpen}
          onReorder={onReorder}
          onMoveToList={onMoveToList}
        />
      ))}
      {adding ? (
        <NameForm
          placeholder="Mediodía, 9pm, Más tarde…"
          onSubmit={(name) => {
            void createDaySection(name)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line/15 px-3 py-2 text-xs font-medium text-ink-faint transition-colors hover:border-accent-400/40 hover:text-accent-300"
        >
          <PlusIcon className="size-3.5" />
          Nuevo momento del día
        </button>
      )}
    </>
  )
}

/** Campo de una línea para crear o renombrar un momento (Enter confirma, Esc cancela). */
function NameForm({
  initial = '',
  placeholder,
  onSubmit,
  onCancel,
}: {
  initial?: string
  placeholder?: string
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.select(), [])

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const name = value.trim()
        if (name) onSubmit(name)
        else onCancel()
      }}
      className="flex items-center gap-2"
    >
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const name = value.trim()
          if (name && name !== initial) onSubmit(name)
          else onCancel()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={placeholder}
        maxLength={40}
        autoFocus
        className="min-w-0 flex-1 rounded-xl border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-400/50 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-xs font-semibold text-accent-300 transition-colors hover:bg-accent-500/20"
      >
        Guardar
      </button>
    </form>
  )
}

interface DayMomentSectionProps {
  section: DaySection
  isFirst: boolean
  isLast: boolean
  tasks: Task[]
  habits: Habit[]
  listsById: Map<string, List>
  tagsById: Map<string, Tag>
  onOpen: (id: string) => void
  onReorder: (ids: string[]) => void
  onMoveToList: (listId: string, taskId: string) => void
}

function DayMomentSection({
  section,
  isFirst,
  isLast,
  tasks,
  habits,
  listsById,
  tagsById,
  onOpen,
  onReorder,
  onMoveToList,
}: DayMomentSectionProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState(false)
  // El plegado se guarda en la propia sección: se recuerda entre sesiones.
  const open = !section.collapsed
  const count = tasks.length + habits.length

  const entries: MenuEntry[] = [
    { label: 'Renombrar', icon: <PencilIcon className="size-4" />, onClick: () => setRenaming(true) },
    ...(isFirst
      ? []
      : [{ label: 'Subir', icon: <ArrowUpIcon className="size-4" />, onClick: () => void moveDaySection(section.id, -1) }]),
    ...(isLast
      ? []
      : [{ label: 'Bajar', icon: <ArrowDownIcon className="size-4" />, onClick: () => void moveDaySection(section.id, 1) }]),
    {
      label: 'Eliminar momento',
      icon: <TrashIcon className="size-4" />,
      danger: true,
      // Lo de dentro no se pierde: vuelve al bloque "Hoy".
      onClick: () => void deleteDaySection(section.id),
    },
  ]

  return (
    <section
      data-drop-zone={section.id}
      className="space-y-1.5 rounded-2xl transition-shadow data-[drop-over=true]:bg-accent-500/5 data-[drop-over=true]:ring-2 data-[drop-over=true]:ring-accent-400 data-[drop-over=true]:ring-inset"
      onContextMenu={(e) => {
        // Solo el clic derecho sobre la cabecera: las tareas tienen su propio menú.
        if ((e.target as HTMLElement).closest('[data-moment-body]')) return
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {renaming ? (
        <NameForm
          initial={section.name}
          onSubmit={(name) => {
            void updateDaySection(section.id, { name })
            setRenaming(false)
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            onClick={() => void updateDaySection(section.id, { collapsed: open })}
            aria-expanded={open}
            className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink-dim"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            <ClockIcon className="size-3.5 text-accent-400" />
            <span className="truncate">{section.name}</span>
            <span className="text-xs font-normal text-ink-faint">{count}</span>
          </button>
          <button
            onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}
            aria-label={`Opciones de ${section.name}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <MoreIcon className="size-4" />
          </button>
        </div>
      )}
      {open && (
        <div className="space-y-1.5" data-moment-body>
          <PendingHabits habits={habits} zoneId={section.id} />
          <SortableList
            ids={tasks.map((t) => t.id)}
            onReorder={onReorder}
            onDropOnList={onMoveToList}
            onDropOnZone={(zone, taskId) => void updateTask(taskId, { daySectionId: zoneToSectionId(zone) })}
            zoneId={section.id}
            className="space-y-1.5"
          >
            {tasks.map((task) => (
              <SortableItem key={task.id} id={task.id}>
                <TaskItem
                  task={task}
                  list={task.listId ? listsById.get(task.listId) : undefined}
                  tagsById={tagsById}
                  onOpen={onOpen}
                  hideTodayChip
                />
              </SortableItem>
            ))}
          </SortableList>
          {count === 0 && (
            <p className="rounded-xl border border-dashed border-line/15 px-3 py-3 text-center text-xs text-ink-faint">
              Arrastra aquí tus tareas y hábitos
            </p>
          )}
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} />}
    </section>
  )
}
