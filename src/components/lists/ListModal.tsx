import { useState, type FormEvent } from 'react'
import type { List } from '../../db/types'
import { createList, deleteList, moveList, updateList } from '../../db/repo/lists'
import { DEFAULT_LIST_COLOR } from '../../lib/colors'
import { Modal } from '../ui/Modal'
import { ColorPicker } from '../ui/ColorPicker'
import { ConfirmButton } from '../ui/ConfirmButton'

interface ListModalProps {
  /** null → crear lista nueva. */
  list: List | null
  onClose: () => void
}

export function ListModal({ list, onClose }: ListModalProps) {
  const [name, setName] = useState(list?.name ?? '')
  const [color, setColor] = useState(list?.color ?? DEFAULT_LIST_COLOR)
  const [emoji, setEmoji] = useState(list?.emoji ?? '')

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const em = emoji.trim() || null
    if (list) await updateList(list.id, { name: n, color, emoji: em })
    else await createList(n, color, em)
    onClose()
  }

  return (
    <Modal title={list ? 'Editar lista' : 'Nueva lista'} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">Nombre</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Hogar, Finanzas, Trabajo…"
            aria-label="Nombre de la lista"
            autoFocus
            className="w-full rounded-lg border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60"
          />
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">Color</span>
          <ColorPicker value={color} onChange={(c) => c && setColor(c)} allowCustom />
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">
            Emoji (opcional)
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {['🏠', '💼', '📚', '💪', '🛒', '💰', '🎮', '✈️', '❤️', '⭐'].map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(emoji === e ? '' : e)}
                aria-label={`Emoji ${e}`}
                aria-pressed={emoji === e}
                className={`flex size-9 items-center justify-center rounded-lg border text-lg transition-all ${
                  emoji === e ? 'scale-110 border-accent-500/60 bg-accent-500/10' : 'border-line/10 hover:bg-ink/5'
                }`}
              >
                {e}
              </button>
            ))}
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="Otro…"
              maxLength={4}
              aria-label="Emoji personalizado de la lista"
              className="w-20 rounded-lg border border-line/10 glass-input px-2 py-2 text-center text-sm text-ink placeholder-ink-faint outline-none focus:border-accent-500/60"
            />
          </div>
        </div>

        {list && (
          <div className="space-y-1.5">
            <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">Posición</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => moveList(list.id, -1)}
                className="flex items-center gap-1.5 rounded-lg border border-line/10 px-3 py-2 text-sm text-ink-dim transition-colors hover:bg-ink/5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
                Subir
              </button>
              <button
                type="button"
                onClick={() => moveList(list.id, 1)}
                className="flex items-center gap-1.5 rounded-lg border border-line/10 px-3 py-2 text-sm text-ink-dim transition-colors hover:bg-ink/5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
                Bajar
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-line/5 pt-4">
          {list ? (
            <ConfirmButton
              label="Eliminar lista"
              confirmLabel="¿Seguro? Toca de nuevo"
              onConfirm={async () => {
                await deleteList(list.id)
                onClose()
              }}
            />
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-500"
          >
            {list ? 'Guardar' : 'Crear lista'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
