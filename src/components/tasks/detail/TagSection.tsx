import { useEffect, useState, type FormEvent } from 'react'
import type { Tag, Task } from '../../../db/types'
import { updateTask } from '../../../db/repo/tasks'
import { createTag, deleteTag } from '../../../db/repo/tags'
import { PALETTE } from '../../../lib/colors'

interface TagSectionProps {
  task: Task
  tags: Tag[]
}

/** Etiquetas reutilizables: toca para poner/quitar; la × la borra de todas las tareas. */
export function TagSection({ task, tags }: TagSectionProps) {
  const [newName, setNewName] = useState('')
  // Doble toque en la ×: el primero arma el borrado, se desarma a los 3 s.
  const [armedId, setArmedId] = useState<string | null>(null)

  useEffect(() => {
    if (!armedId) return
    const t = setTimeout(() => setArmedId(null), 3000)
    return () => clearTimeout(t)
  }, [armedId])

  function toggle(tagId: string) {
    const tagIds = task.tagIds.includes(tagId)
      ? task.tagIds.filter((id) => id !== tagId)
      : [...task.tagIds, tagId]
    updateTask(task.id, { tagIds })
  }

  function remove(tagId: string) {
    if (armedId === tagId) {
      deleteTag(tagId)
      setArmedId(null)
    } else {
      setArmedId(tagId)
    }
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
          const armed = armedId === tag.id
          return (
            <span
              key={tag.id}
              className={`inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-1 text-xs font-medium transition-colors ${
                armed
                  ? 'border-danger/60 bg-danger/15 text-danger'
                  : active
                    ? 'text-ink'
                    : 'border-line/10 text-ink-muted'
              }`}
              style={!armed && active ? { backgroundColor: `${tag.color}33`, borderColor: `${tag.color}66`, color: tag.color } : undefined}
            >
              <button
                type="button"
                onClick={() => toggle(tag.id)}
                aria-pressed={active}
                className="inline-flex items-center gap-1.5 rounded-full hover:opacity-80"
              >
                {!armed && <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden="true" />}
                {armed ? '¿Borrar?' : tag.name}
              </button>
              <button
                type="button"
                onClick={() => remove(tag.id)}
                aria-label={armed ? `Confirmar borrar etiqueta ${tag.name}` : `Borrar etiqueta ${tag.name}`}
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-ink/10"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-3">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
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
          className="w-full rounded-lg border border-line/10 glass-input px-3 py-1.5 text-xs text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60"
        />
      </form>
    </div>
  )
}
