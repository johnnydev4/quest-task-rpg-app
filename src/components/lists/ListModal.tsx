import { useState, type FormEvent } from 'react'
import type { List } from '../../db/types'
import { createList, deleteList, moveList, updateList } from '../../db/repo/lists'
import { Modal } from '../ui/Modal'
import { ColorPicker } from '../ui/ColorPicker'
import { ConfirmButton } from '../ui/ConfirmButton'

/**
 * Un emoji completo: pictograma base + sus modificadores (tono de piel,
 * variación VS16, secuencias ZWJ como 👨‍👩‍👧) o un keycap (1️⃣). Se usa para
 * quedarse SOLO con el primer emoji de lo que escriba el usuario: letras,
 * números y símbolos sueltos no valen como icono de lista.
 */
const EMOJI_RE = new RegExp(
  [
    // Banderas (dos indicadores regionales) y keycaps (1️⃣, #️⃣).
    '\\p{Regional_Indicator}{2}',
    '[#*0-9]\\uFE0F?\\u20E3',
    // Pictograma + modificadores + posibles uniones ZWJ.
    '\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)*(?:\\u200D\\p{Extended_Pictographic}(?:\\p{Emoji_Modifier}|\\uFE0F)*)*',
  ].join('|'),
  'u',
)

/** Primer emoji del texto; cadena vacía si no hay ninguno. */
function firstEmoji(value: string): string {
  return value.match(EMOJI_RE)?.[0] ?? ''
}

interface ListModalProps {
  /** null → crear lista nueva. */
  list: List | null
  onClose: () => void
}

export function ListModal({ list, onClose }: ListModalProps) {
  const [name, setName] = useState(list?.name ?? '')
  // Las listas nuevas empiezan sin color; represionar el color elegido lo quita.
  const [color, setColor] = useState<string | null>(list?.color ?? null)
  const [emoji, setEmoji] = useState(list?.emoji ?? '')
  // Aviso cuando lo tecleado no contiene ningún emoji (texto o números sueltos).
  const [emojiError, setEmojiError] = useState(false)

  /** El icono personalizado solo admite emojis: se queda con el primero y descarta el resto. */
  function handleCustomEmoji(value: string) {
    const only = firstEmoji(value)
    setEmoji(only)
    setEmojiError(value.length > 0 && only === '')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const em = firstEmoji(emoji) || null
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
          <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">Color (opcional)</span>
          <ColorPicker value={color} onChange={setColor} allowCustom />
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
                onClick={() => {
                  setEmoji(emoji === e ? '' : e)
                  setEmojiError(false)
                }}
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
              onChange={(e) => handleCustomEmoji(e.target.value)}
              placeholder="Otro…"
              maxLength={12}
              aria-label="Emoji personalizado de la lista"
              aria-invalid={emojiError}
              className={`w-20 rounded-lg border glass-input px-2 py-2 text-center text-sm text-ink placeholder-ink-faint outline-none ${
                emojiError ? 'border-danger/60' : 'border-line/10 focus:border-accent-500/60'
              }`}
            />
          </div>
          {emojiError && <p className="text-[11px] text-danger">Solo se admiten emojis (ni texto ni números).</p>}
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
