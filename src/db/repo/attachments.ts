import { uid } from '../../lib/uid'
import { db } from '../db'
import type { Attachment } from '../types'
import { recordDeletion } from './tombstones'

/** Límite defensivo para no llenar IndexedDB con archivos gigantes. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

export async function createAttachment(taskId: string, file: File): Promise<string> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`El archivo supera el máximo de ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`)
  }
  const now = Date.now()
  const attachment: Attachment = {
    id: uid(),
    taskId,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    blob: file,
    cloudPath: null,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.attachments.add(attachment)
  return attachment.id
}

export async function deleteAttachment(id: string): Promise<void> {
  await db.attachments.delete(id)
  await recordDeletion('attachments', id)
}
