import { useMemo } from 'react'
import { updateHabit } from '../db/repo/habits'
import { updateTask } from '../db/repo/tasks'
import { zoneToSectionId } from '../db/repo/daySections'
import { useSelection, type SelectableKind } from './selection'

/**
 * Destino de un arrastre que puede traer varios elementos a la vez. Cada id se
 * dirige a su tabla según la selección; el que no esté seleccionado (arrastre
 * suelto de una sola fila) usa `fallback`, el tipo de la lista de origen.
 */
export function useBulkMove() {
  const { kindOf } = useSelection()
  return useMemo(
    () => ({
      /** Mueve todo lo arrastrado a una lista del menú lateral. */
      toList(listId: string, ids: string[], fallback: SelectableKind) {
        for (const id of ids) {
          if ((kindOf(id) ?? fallback) === 'habit') void updateHabit(id, { listId })
          else void updateTask(id, { listId })
        }
      },
      /** Mueve todo lo arrastrado a un momento del día de la pestaña Hoy. */
      toDayZone(zoneId: string, ids: string[], fallback: SelectableKind) {
        const daySectionId = zoneToSectionId(zoneId)
        for (const id of ids) {
          if ((kindOf(id) ?? fallback) === 'habit') void updateHabit(id, { daySectionId })
          else void updateTask(id, { daySectionId })
        }
      },
    }),
    [kindOf],
  )
}
