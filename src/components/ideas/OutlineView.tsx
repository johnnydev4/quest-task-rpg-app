import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import {
  addChild,
  addSiblingAfter,
  deleteNode,
  indentNode,
  outdentNode,
  reorderChildren,
  setNodeText,
  toggleCollapsed,
} from '../../db/repo/ideas'
import { PlusIcon, TrashIcon } from '../ui/icons'
import { flattenOutline, groupByParent, type FlatRow } from './tree'

/** Ancho (px) de cada nivel de indentación en la lista. */
const INDENT = 22

interface OutlineViewProps {
  mapId: string
  rootId: string
}

/**
 * Vista lista / outline (estilo Workflowy / Obsidian outliner): render aplanado
 * del árbol con indentación, ramas colapsables y edición inline. El teclado hace
 * el trabajo pesado (pensado para TDAH: escribir sin levantar las manos):
 * Enter = idea hermana, Tab / Shift+Tab = anidar / desanidar, Alt+↑/↓ = reordenar,
 * ↑/↓ = moverse, Backspace en vacío = borrar.
 */
export function OutlineView({ mapId, rootId }: OutlineViewProps) {
  const nodes = useLiveQuery(() => db.ideaNodes.where('mapId').equals(mapId).toArray(), [mapId])
  // Nodo a enfocar tras una acción (crear, mover, borrar). Se "consume" al enfocar.
  const [focusId, setFocusId] = useState<string | null>(null)

  const byParent = useMemo(() => groupByParent(nodes ?? []), [nodes])
  const flat = useMemo(() => flattenOutline(rootId, byParent), [rootId, byParent])

  async function addFirst() {
    const id = await addChild(mapId, rootId, '')
    setFocusId(id)
  }

  if (nodes === undefined) {
    return (
      <div className="flex justify-center py-16">
        <div className="size-7 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" aria-label="Cargando" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-line/10 glass-panel p-3 sm:p-4">
      {flat.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-medium text-ink-dim">Empieza a descomponer tu idea</p>
          <p className="max-w-xs text-sm text-ink-faint">
            Añade la primera rama y ve troceándola. Usa <Kbd>Enter</Kbd> para seguir y <Kbd>Tab</Kbd> para anidar.
          </p>
          <button
            onClick={() => void addFirst()}
            className="flex items-center gap-1.5 rounded-lg bg-accent-500/15 px-3.5 py-2 text-sm font-semibold text-accent-300 transition-colors hover:bg-accent-500/25"
          >
            <PlusIcon className="size-4" /> Añadir primera rama
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {flat.map((row, i) => (
            <NodeRow
              key={row.node.id}
              row={row}
              index={i}
              flat={flat}
              siblings={byParent.get(row.node.parentId) ?? []}
              childCount={(byParent.get(row.node.id) ?? []).length}
              focusId={focusId}
              setFocusId={setFocusId}
              mapId={mapId}
            />
          ))}
          <button
            onClick={() => void addFirst()}
            className="mt-1 flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-xs font-medium text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink-dim"
          >
            <PlusIcon className="size-3.5" /> Añadir rama
          </button>
        </div>
      )}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line/15 bg-ink/5 px-1 py-0.5 text-[0.6875rem] font-semibold text-ink-dim">
      {children}
    </kbd>
  )
}

interface NodeRowProps {
  row: FlatRow
  index: number
  flat: FlatRow[]
  siblings: { id: string }[]
  childCount: number
  focusId: string | null
  setFocusId: (id: string | null) => void
  mapId: string
}

function NodeRow({ row, index, flat, siblings, childCount, focusId, setFocusId, mapId }: NodeRowProps) {
  const { node, depth, hasChildren } = row
  const [text, setText] = useState(node.text)
  const inputRef = useRef<HTMLInputElement>(null)

  // La edición local manda mientras el nodo está enfocado; cuando llega un texto
  // nuevo desde la base (sincronización, otra pestaña) y no lo estamos editando,
  // se refresca.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(node.text)
  }, [node.text])

  // Enfoca este nodo cuando una acción lo pide, con el cursor al final.
  useEffect(() => {
    if (focusId !== node.id) return
    const el = inputRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
    setFocusId(null)
  }, [focusId, node.id, setFocusId])

  function commit() {
    const t = text.trim()
    if (t !== node.text) void setNodeText(node.id, t)
  }

  function moveSibling(dir: -1 | 1) {
    const ids = siblings.map((s) => s.id)
    const i = ids.indexOf(node.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void reorderChildren(ids)
    setFocusId(node.id)
  }

  async function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      setFocusId(await addSiblingAfter(node.id, ''))
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      commit()
      await indentNode(node.id)
      setFocusId(node.id)
    } else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      commit()
      await outdentNode(node.id)
      setFocusId(node.id)
    } else if (e.key === 'ArrowUp' && e.altKey) {
      e.preventDefault()
      moveSibling(-1)
    } else if (e.key === 'ArrowDown' && e.altKey) {
      e.preventDefault()
      moveSibling(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = flat[index - 1]
      if (prev) setFocusId(prev.node.id)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = flat[index + 1]
      if (next) setFocusId(next.node.id)
    } else if (e.key === 'Backspace' && text === '') {
      e.preventDefault()
      const prev = flat[index - 1]?.node
      const removed = await deleteNode(node.id)
      if (removed && prev) setFocusId(prev.id)
    }
  }

  async function onAddChild() {
    setFocusId(await addChild(mapId, node.id, ''))
  }

  return (
    <div className="group flex items-stretch">
      {/* Guías verticales: una por nivel de ancestro, para seguir la jerarquía. */}
      {Array.from({ length: depth }).map((_, i) => (
        <span key={i} className="shrink-0 border-l border-line/10" style={{ width: INDENT }} aria-hidden="true" />
      ))}

      <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-1 pr-1 transition-colors group-focus-within:bg-ink/[0.03]">
        {/* Viñeta: pliega/despliega la rama si tiene hijos; si no, punto guía. */}
        {hasChildren ? (
          <button
            onClick={() => void toggleCollapsed(node.id)}
            aria-label={node.collapsed ? 'Desplegar rama' : 'Plegar rama'}
            aria-expanded={!node.collapsed}
            className="flex size-5 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:bg-ink/10 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`size-3.5 transition-transform ${node.collapsed ? '' : 'rotate-90'}`} aria-hidden="true">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ) : (
          <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
            <span className="size-1.5 rounded-full bg-ink-faint" />
          </span>
        )}

        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => void onKeyDown(e)}
          placeholder="Escribe una idea…"
          aria-label="Idea"
          className="min-w-0 flex-1 border-none bg-transparent py-0.5 text-sm text-ink placeholder-ink-faint outline-none focus:shadow-none"
        />

        {/* Cuántos hijos tiene, cuando está plegada: pista de lo que hay debajo. */}
        {hasChildren && node.collapsed && (
          <span className="shrink-0 rounded-full bg-ink/5 px-1.5 text-[0.625rem] font-semibold text-ink-faint">
            {childCount}
          </span>
        )}

        {/* Acciones (aparecen al pasar el ratón o al enfocar la fila). */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            onClick={() => void onAddChild()}
            aria-label="Añadir sub-idea"
            title="Añadir sub-idea"
            className="flex size-6 items-center justify-center rounded text-ink-faint transition-colors hover:bg-ink/10 hover:text-accent-300"
          >
            <PlusIcon className="size-3.5" />
          </button>
          <button
            onClick={() => void deleteNode(node.id)}
            aria-label="Eliminar idea"
            title="Eliminar (y su rama)"
            className="flex size-6 items-center justify-center rounded text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <TrashIcon className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
