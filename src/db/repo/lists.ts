import { uid } from '../../lib/uid'
import { db } from '../db'
import type { List } from '../types'
import { recordDeletion } from './tombstones'

export async function createList(name: string, color: string, emoji?: string | null): Promise<string> {
  const now = Date.now()
  const last = await db.lists.orderBy('order').last()
  const list: List = {
    id: uid(),
    name: name.trim(),
    color,
    emoji: emoji ?? null,
    order: (last?.order ?? 0) + 1,
    statLevel: 1,
    statXp: 0,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.lists.add(list)
  return list.id
}

export async function updateList(
  id: string,
  patch: Partial<Omit<List, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>>,
): Promise<void> {
  await db.lists.update(id, { ...patch, updatedAt: Date.now(), syncStatus: 'pending' })
}

/** Elimina la lista; sus tareas no se borran, quedan sin lista (visibles en "Todas"). */
export async function deleteList(id: string): Promise<void> {
  await db.transaction('rw', db.lists, db.tasks, db.tombstones, async () => {
    await db.tasks
      .where('listId')
      .equals(id)
      .modify({ listId: null, updatedAt: Date.now(), syncStatus: 'pending' })
    await db.lists.delete(id)
    await recordDeletion('lists', id)
  })
}

/** Intercambia el orden con la lista vecina (dir -1 = subir, 1 = bajar). */
export async function moveList(id: string, dir: -1 | 1): Promise<void> {
  const lists = await db.lists.orderBy('order').toArray()
  const i = lists.findIndex((l) => l.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= lists.length) return
  const now = Date.now()
  await db.transaction('rw', db.lists, async () => {
    await db.lists.update(lists[i].id, { order: lists[j].order, updatedAt: now, syncStatus: 'pending' })
    await db.lists.update(lists[j].id, { order: lists[i].order, updatedAt: now, syncStatus: 'pending' })
  })
}
