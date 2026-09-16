import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { setNodeColor, setNodeNote, setNodeRating, setNodeText } from '../../db/repo/ideas'
import { ColorPicker } from '../ui/ColorPicker'
import { Modal } from '../ui/Modal'
import { StarRating } from '../ui/StarRating'

interface NodeDetailsModalProps {
  nodeId: string
  onClose: () => void
}

/**
 * Personalización de una idea: color propio, valoración de 1 a 5 estrellas y
 * nota interna. Es el mismo panel en la lista y en las vistas gráficas, para
 * que no haya dos sitios donde tocar lo mismo.
 *
 * El color y las estrellas se guardan al instante (un clic = una decisión); la
 * nota, al salir del campo o al cerrar, para no escribir en la base en cada tecla.
 */
export function NodeDetailsModal({ nodeId, onClose }: NodeDetailsModalProps) {
  const node = useLiveQuery(() => db.ideaNodes.get(nodeId), [nodeId])
  const map = useLiveQuery(
    async () => (node ? ((await db.ideaMaps.get(node.mapId)) ?? null) : null),
    [node?.mapId],
  )

  const [note, setNote] = useState('')
  const [text, setText] = useState('')
  const loaded = useRef(false)

  // Carga inicial: el contenido en edición no se pisa con lo que llegue después
  // (sincronización u otra pestaña) mientras el panel está abierto.
  useEffect(() => {
    if (!node || loaded.current) return
    loaded.current = true
    setNote(node.note ?? '')
    setText(node.text)
  }, [node])

  function commitNote() {
    if (node && note.trim() !== (node.note ?? '')) void setNodeNote(nodeId, note)
  }

  function commitText() {
    const t = text.trim()
    if (node && t && t !== node.text) void setNodeText(nodeId, t)
  }

  function close() {
    commitText()
    commitNote()
    onClose()
  }

  if (!node) return null

  const inherited = map?.color ?? null

  return (
    <Modal title="Personalizar idea" onClose={close}>
      <div className="space-y-5">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide text-ink-faint uppercase">Idea</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            placeholder="Escribe una idea…"
            className="w-full rounded-xl border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-accent-500/40"
          />
        </label>

        <div className="space-y-2">
          <span className="text-xs font-semibold tracking-wide text-ink-faint uppercase">Color de la idea</span>
          <ColorPicker
            value={node.color ?? null}
            onChange={(c) => void setNodeColor(nodeId, c)}
            allowNone
            allowCustom
          />
          <p className="text-xs text-ink-faint">
            {node.color
              ? 'Este nodo y la rama que lo cuelga usan este color.'
              : inherited
                ? 'Sin color propio: hereda el color del mapa.'
                : 'Sin color propio: usa el acento de la app.'}
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold tracking-wide text-ink-faint uppercase">Valoración</span>
          <div className="flex items-center gap-3">
            <StarRating
              value={node.rating ?? null}
              onChange={(v) => void setNodeRating(nodeId, v)}
              className="size-6"
            />
            <span className="text-xs text-ink-faint">
              {node.rating ? `${node.rating} de 5` : 'Sin valorar'}
            </span>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold tracking-wide text-ink-faint uppercase">Nota interna</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
            rows={5}
            placeholder="Contexto, dudas, enlaces… lo que no cabe en el título de la idea."
            className="w-full resize-y rounded-xl border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none focus:border-accent-500/40"
          />
        </label>

        <button
          onClick={close}
          className="w-full rounded-xl bg-accent-500/15 px-4 py-2.5 text-sm font-semibold text-accent-300 transition-colors hover:bg-accent-500/25"
        >
          Listo
        </button>
      </div>
    </Modal>
  )
}
