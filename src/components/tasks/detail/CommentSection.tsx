import { useState, type FormEvent } from 'react'
import type { Comment } from '../../../db/types'
import { createComment, deleteComment } from '../../../db/repo/comments'
import { formatDateTime } from '../../../lib/dates'

interface CommentSectionProps {
  taskId: string
  comments: Comment[]
}

export function CommentSection({ taskId, comments }: CommentSectionProps) {
  const [text, setText] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    createComment(taskId, t)
    setText('')
  }

  return (
    <div className="space-y-2">
      {comments.map((c) => (
        <div key={c.id} className="group rounded-lg border border-line/5 glass-input px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-ink-faint">{formatDateTime(c.createdAt)}</span>
            <button
              onClick={() => deleteComment(c.id)}
              aria-label="Eliminar comentario"
              className="text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink-dim">{c.text}</p>
        </div>
      ))}
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Añadir comentario…"
          aria-label="Añadir comentario"
          className="w-full rounded-lg border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60"
        />
      </form>
    </div>
  )
}
