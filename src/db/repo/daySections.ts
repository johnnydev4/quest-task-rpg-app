import { uid } from '../../lib/uid'
import { db } from '../db'
import type { DaySection } from '../types'
import { recordDeletion } from './tombstones'

/**
 * Momentos del día de la pestaña Hoy. La pertenencia vive en el campo
 * `daySectionId` de tareas y hábitos; aquí solo se guardan nombre, posición y
 * si están plegados.
 */

/** Id de zona del bloque "Hoy" (lo que no pertenece a ningún momento). */
export const NO_DAY_SECTION = 'none'

/** Traduce el id de zona de un arrastre al valor que se guarda en la tarea/hábito. */
export function zoneToSectionId(zoneId: string): string | null {
  return zoneId === NO_DAY_SECTION ? null : zoneId
}

export async function createDaySection(name: string): Promise<string> {
  const now = Date.now()
  const section: DaySection = {
    id: uid(),
    name: name.trim(),
    // Las nuevas van al final; `now` es único y creciente, como en tareas.
    order: now,
    collapsed: false,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.daySections.add(section)
  return section.id
}

export async function updateDaySection(
  id: string,
  patch: Partial<Omit<DaySection, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>>,
): Promise<void> {
  await db.daySections.update(id, { ...patch, updatedAt: Date.now(), syncStatus: 'pending' })
}

/** Sube (-1) o baja (+1) el momento intercambiando su posición con la vecina. */
export async function moveDaySection(id: string, dir: -1 | 1): Promise<void> {
  const all = await db.daySections.orderBy('order').toArray()
  const i = all.findIndex((s) => s.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= all.length) return
  const now = Date.now()
  await db.transaction('rw', db.daySections, async () => {
    await db.daySections.update(all[i].id, { order: all[j].order, updatedAt: now, syncStatus: 'pending' })
    await db.daySections.update(all[j].id, { order: all[i].order, updatedAt: now, syncStatus: 'pending' })
  })
}

/** Al eliminar el momento, sus tareas y hábitos vuelven al bloque "Hoy". */
export async function deleteDaySection(id: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', [db.daySections, db.tasks, db.habits, db.tombstones], async () => {
    await db.tasks
      .filter((t) => t.daySectionId === id)
      .modify({ daySectionId: null, updatedAt: now, syncStatus: 'pending' })
    await db.habits
      .filter((h) => h.daySectionId === id)
      .modify({ daySectionId: null, updatedAt: now, syncStatus: 'pending' })
    await db.daySections.delete(id)
    await recordDeletion('daySections', id)
  })
}
