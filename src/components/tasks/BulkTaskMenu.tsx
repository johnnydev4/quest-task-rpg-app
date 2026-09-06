import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { deleteTask, setTaskCompleted, updateTask } from '../../db/repo/tasks'
import { startOfDayOffset, startOfToday } from '../../lib/dates'
import { PRIORITY_LABEL } from '../../lib/priority'
import { emitToast } from '../../lib/events'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { CalendarIcon, CheckCircleIcon, FlagIcon, FolderIcon, PencilIcon, TrashIcon } from '../ui/icons'

/**
 * Menú "Modificar…" de la selección múltiple: aplica una misma acción a todas
 * las tareas marcadas (completar, prioridad, fecha, lista o eliminar). Reutiliza
 * las funciones del repo para respetar recurrencias, XP y sincronización.
 */
export function BulkTaskMenu({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const lists = useLiveQuery(() => db.lists.orderBy('order').toArray(), []) ?? []

  const n = ids.length
  const plural = n === 1 ? '' : 's'

  // Cada acción corre sobre todos los ids marcados y luego cierra la selección.
  const run = (fn: (id: string) => Promise<unknown> | void, done: string) => {
    for (const id of ids) void fn(id)
    emitToast({ title: done })
    onDone()
  }

  const entries: MenuEntry[] = [
    {
      label: 'Marcar como completadas',
      icon: <CheckCircleIcon className="size-4" />,
      onClick: () => run((id) => setTaskCompleted(id, true), `${n} tarea${plural} completada${plural}`),
    },
    {
      label: 'Marcar como pendientes',
      icon: <CheckCircleIcon className="size-4" />,
      onClick: () => run((id) => setTaskCompleted(id, false), `${n} tarea${plural} pendiente${plural}`),
    },
    {
      label: 'Definir prioridad',
      icon: <FlagIcon className="size-4" />,
      submenu: [
        ...(['high', 'medium', 'low'] as const).map((p) => ({
          label: PRIORITY_LABEL[p],
          onClick: () => run((id) => updateTask(id, { priority: p }), 'Prioridad actualizada'),
        })),
        { label: 'Sin prioridad', onClick: () => run((id) => updateTask(id, { priority: null }), 'Prioridad actualizada') },
      ],
    },
    {
      label: 'Fecha de vencimiento',
      icon: <CalendarIcon className="size-4" />,
      submenu: [
        { label: 'Hoy', onClick: () => run((id) => updateTask(id, { dueAt: startOfToday(), dueHasTime: false }), 'Fecha actualizada') },
        { label: 'Mañana', onClick: () => run((id) => updateTask(id, { dueAt: startOfDayOffset(1), dueHasTime: false }), 'Fecha actualizada') },
        { label: 'En una semana', onClick: () => run((id) => updateTask(id, { dueAt: startOfDayOffset(7), dueHasTime: false }), 'Fecha actualizada') },
        { label: 'Sin fecha', onClick: () => run((id) => updateTask(id, { dueAt: null }), 'Fecha actualizada') },
      ],
    },
    {
      label: 'Mover a lista…',
      icon: <FolderIcon className="size-4" />,
      submenu: [
        ...lists.map((l) => ({
          label: l.emoji ? `${l.emoji} ${l.name}` : l.name,
          onClick: () => run((id) => updateTask(id, { listId: l.id }), 'Tareas movidas'),
        })),
        { label: 'Sin lista', onClick: () => run((id) => updateTask(id, { listId: null }), 'Tareas movidas') },
      ],
    },
    {
      label: `Eliminar ${n} tarea${plural}`,
      icon: <TrashIcon className="size-4" />,
      danger: true,
      onClick: () => run((id) => deleteTask(id), `${n} tarea${plural} eliminada${plural}`),
    },
  ]

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          // Ancla el menú a la esquina inferior derecha del botón (se recoloca
          // solo para no salirse de la pantalla).
          setMenu({ x: r.right, y: r.bottom + 4 })
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent-500/40 bg-accent-500/10 px-2.5 py-1.5 text-xs font-medium text-accent-300 transition-colors hover:bg-accent-500/20"
      >
        <PencilIcon className="size-3.5" />
        <span className="hidden sm:inline">Modificar</span>
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={entries} onClose={() => setMenu(null)} />}
    </>
  )
}
