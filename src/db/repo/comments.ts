import { uid } from '../../lib/uid'
import { db } from '../db'
import type { Comment } from '../types'
import { recordDeletion } from './tombstones'

export async function createComment(taskId: string, text: string): Promise<string> {
  const now = Date.now()
  const comment: Comment = {
    id: uid(),
    taskId,
    text: text.trim(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.comments.add(comment)
  return comment.id
}

export async function deleteComment(id: string): Promise<void> {
  await db.comments.delete(id)
  await recordDeletion('comments', id)
}
