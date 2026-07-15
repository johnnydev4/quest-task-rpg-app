import { useState, type FormEvent } from 'react'
import type { Tag } from '../../db/types'
import { deleteTag, updateTag } from '../../db/repo/tags'
import { Modal } from '../ui/Modal'
import { ColorPicker } from '../ui/ColorPicker'
import { ConfirmButton } from '../ui/ConfirmButton'

interface TagModalProps {
  tag: Tag
  onClose: () => void
}

export function TagModal({ tag, onClose }: TagModalProps) {
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color)

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    await updateTag(tag.id, { name: n, color })
    onClose()
  }

  return (
    <Modal title="Editar etiqueta" onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">Nombre</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Nombre de la etiqueta"
            className="w-full rounded-lg border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60"
          />
        </div>
        <div className="space-y-1.5">
          <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">Color</span>
          <ColorPicker value={color} onChange={(c) => c && setColor(c)} />
        </div>
        <div className="flex items-center justify-between border-t border-line/5 pt-4">
          <ConfirmButton
            label="Eliminar etiqueta"
            confirmLabel="¿Seguro? Toca de nuevo"
            onConfirm={async () => {
              await deleteTag(tag.id)
              onClose()
            }}
          />
          <button
            type="submit"
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-500"
          >
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}
