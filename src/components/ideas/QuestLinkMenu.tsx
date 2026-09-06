import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { explodeQuestIntoNode, linkNodeToQuest } from '../../db/repo/ideas'
import { monthLabelOf } from '../../lib/questThemes'
import { SwordIcon } from '../ui/icons'

/**
 * Vincula un nodo a una misión existente y, al elegirla, la "explota": crea un
 * hijo por cada paso de la misión, convirtiéndola en un sub-árbol de subtareas.
 * Botón compacto (espada) que abre un desplegable con las misiones; en un nodo
 * ya vinculado se pinta en color de acento y ofrece desvincular.
 */
export function QuestLinkMenu({
  nodeId,
  linkedQuestId,
}: {
  nodeId: string
  linkedQuestId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const quests = useLiveQuery(() => db.quests.toArray(), [])
  const steps = useLiveQuery(() => db.questSteps.toArray(), [])

  const rows = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of steps ?? []) counts.set(s.questId, (counts.get(s.questId) ?? 0) + 1)
    return (quests ?? [])
      .map((q) => ({ id: q.id, title: q.title, monthKey: q.monthKey, week: q.week, steps: counts.get(q.id) ?? 0 }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.week - b.week)
  }, [quests, steps])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const linked = !!linkedQuestId

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={linked ? 'Misión vinculada' : 'Vincular a una misión'}
        title={linked ? 'Misión vinculada' : 'Vincular a una misión'}
        className={`flex size-6 items-center justify-center rounded transition-colors hover:bg-ink/10 ${
          linked ? 'text-accent-400' : 'text-ink-faint hover:text-accent-300'
        }`}
      >
        <SwordIcon className="size-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border border-line/10 glass-strong py-1 shadow-2xl"
          style={{ animation: 'menu-pop 0.14s ease-out both' }}
        >
          <p className="px-3 pt-1.5 pb-1 text-[0.625rem] font-semibold tracking-wide text-ink-faint uppercase">
            Explotar misión en subtareas
          </p>

          {linked && (
            <button
              onClick={() => {
                void linkNodeToQuest(nodeId, null)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-dim transition-colors hover:bg-ink/5 hover:text-danger"
            >
              <span className="text-danger">✕</span> Desvincular misión
            </button>
          )}

          {rows.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-faint">
              No hay misiones aún. Créalas en la pestaña Misiones.
            </p>
          ) : (
            rows.map((q) => (
              <button
                key={q.id}
                role="menuitem"
                onClick={() => {
                  void explodeQuestIntoNode(nodeId, q.id)
                  setOpen(false)
                }}
                className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-ink/5 ${
                  q.id === linkedQuestId ? 'bg-accent-500/10' : ''
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm text-ink">
                  <SwordIcon className="size-3 shrink-0 text-accent-400" />
                  <span className="min-w-0 flex-1 truncate">{q.title || 'Misión sin título'}</span>
                </span>
                <span className="pl-4.5 text-[0.6875rem] text-ink-faint">
                  {monthLabelOf(q.monthKey)} · {q.steps} paso{q.steps === 1 ? '' : 's'}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
