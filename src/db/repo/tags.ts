import { uid } from '../../lib/uid'
import { db } from '../db'
import type { Tag } from '../types'
import { PALETTE } from '../../lib/colors'
import { recordDeletion } from './tombstones'

export async function createTag(name: string, color: string): Promise<string> {
  const now = Date.now()
  const tag: Tag = {
    id: uid(),
    name: name.trim(),
    color,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.tags.add(tag)
  return tag.id
}

/** Reutiliza una etiqueta por nombre (sin distinguir mayúsculas) o la crea. */
export async function getOrCreateTag(name: string): Promise<string> {
  const clean = name.trim()
  const existing = (await db.tags.toArray()).find(
    (t) => t.name.toLowerCase() === clean.toLowerCase(),
  )
  if (existing) return existing.id
  const count = await db.tags.count()
  return createTag(clean, PALETTE[count % PALETTE.length])
}

export async function updateTag(
  id: string,
  patch: Partial<Omit<Tag, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>>,
): Promise<void> {
  await db.tags.update(id, { ...patch, updatedAt: Date.now(), syncStatus: 'pending' })
}

/** Elimina la etiqueta y la quita de todas las tareas que la usan. */
export async function deleteTag(id: string): Promise<void> {
  await db.transaction('rw', db.tags, db.tasks, db.tombstones, async () => {
    await db.tasks
      .where('tagIds')
      .equals(id)
      .modify((t) => {
        t.tagIds = t.tagIds.filter((tid) => tid !== id)
        t.updatedAt = Date.now()
        t.syncStatus = 'pending'
      })
    await db.tags.delete(id)
    await recordDeletion('tags', id)
  })
}
