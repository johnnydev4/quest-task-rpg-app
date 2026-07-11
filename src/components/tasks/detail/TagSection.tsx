import { useState, type FormEvent } from 'react'
import type { Tag, Task } from '../../../db/types'
import { updateTask } from '../../../db/repo/tasks'
import { createTag } from '../../../db/repo/tags'
import { PALETTE } from '../../../lib/colors'

interface TagSectionProps {
  task: Task
  tags: Tag[]
}

/** Etiquetas reutilizables: toca para poner/quitar; crea nuevas al vuelo. */
export function TagSection({ task, tags }: TagSectionProps) {
  const [newName, setNewName] = useState('')

  function toggle(tagId: string) {
    const tagIds = task.tagIds.includes(tagId)
      ? task.tagIds.filter((id) => id !== tagId)
      : [...task.tagIds, tagId]
    updateTask(task.id, { tagIds })
  }

  async function addTag(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    // Reutiliza si ya existe una con el mismo nombre.
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    const id = existing ? existing.id : await createTag(name, PALETTE[tags.length % PALETTE.length])
    if (!task.tagIds.includes(id)) updateTask(task.id, { tagIds: [...task.tagIds, id] })
    setNewName('')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const active = task.tagIds.includes(tag.id)
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active ? 'text-ink' : 'border-line/10 text-ink-muted hover:bg-ink/5'
              }`}
              style={active ? { backgroundColor: `${tag.color}33`, borderColor: `${tag.color}66`, color: tag.color } : undefined}
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />
              {tag.name}
            </button>
          )
        })}
        {tags.length === 0 && <span className="text-xs text-ink-faint">Aún no hay etiquetas.</span>}
      </div>
      <form onSubmit={addTag} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nueva etiqueta…"
          aria-label="Nueva etiqueta"
          className="w-full rounded-lg border border-line/10 bg-surface-700 px-3 py-1.5 text-xs text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60"
        />
      </form>
    </div>
  )
}
