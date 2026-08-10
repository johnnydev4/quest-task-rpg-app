import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/**
 * Selección múltiple de tareas y hábitos para arrastrarlos en bloque.
 *
 * Vive en un contexto (no en props) porque la consumen filas muy repartidas
 * por el árbol: TaskItem, HabitCard, cada SortableList… Al agarrar un elemento
 * marcado, `ui/Sortable` mueve todo el grupo de una vez.
 *
 * Se entra al modo con el botón "Seleccionar" de la barra de la vista o, en
 * escritorio, con Ctrl/⌘+clic sobre una fila. Escape lo cancela.
 */

export type SelectableKind = 'task' | 'habit'

export interface SelectionApi {
  /** Modo selección: las filas se marcan en vez de abrirse. */
  active: boolean
  /** Ids marcados, sin distinguir tareas de hábitos. */
  ids: string[]
  count: number
  has: (id: string) => boolean
  kindOf: (id: string) => SelectableKind | undefined
  toggle: (id: string, kind: SelectableKind) => void
  /** Activa el modo sin marcar nada todavía. */
  start: () => void
  /** Sale del modo y desmarca todo. */
  clear: () => void
}

// Sin proveedor (p. ej. en tests o vistas sueltas) la selección es inerte, y
// las filas se comportan como siempre. Constante: así no rompe memos.
const INERT: SelectionApi = {
  active: false,
  ids: [],
  count: 0,
  has: () => false,
  kindOf: () => undefined,
  toggle: () => {},
  start: () => {},
  clear: () => {},
}

const Ctx = createContext<SelectionApi>(INERT)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Map<string, SelectableKind>>(() => new Map())
  const [mode, setMode] = useState(false)

  const toggle = useCallback((id: string, kind: SelectableKind) => {
    setItems((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, kind)
      return next
    })
    setMode(true)
  }, [])
  const clear = useCallback(() => {
    setMode(false)
    setItems(new Map())
  }, [])
  const start = useCallback(() => setMode(true), [])

  const active = mode || items.size > 0

  // Escape cancela la selección, como en cualquier menú de la app.
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, clear])

  const api = useMemo<SelectionApi>(
    () => ({
      active,
      ids: [...items.keys()],
      count: items.size,
      has: (id) => items.has(id),
      kindOf: (id) => items.get(id),
      toggle,
      start,
      clear,
    }),
    [active, items, toggle, start, clear],
  )

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useSelection(): SelectionApi {
  return useContext(Ctx)
}
