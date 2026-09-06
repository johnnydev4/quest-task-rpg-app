import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { IdeaMap, IdeaView } from '../../db/types'
import { createMap, deleteMap, renameMap, setMapView, setNodeText } from '../../db/repo/ideas'
import { ConfirmButton } from '../ui/ConfirmButton'
import { HierarchyIcon, PlusIcon } from '../ui/icons'
import { OutlineView } from './OutlineView'
import { findRoot } from './tree'

// React Flow + d3-hierarchy son pesados: se cargan solo al abrir una vista
// gráfica (mismo criterio que StatsView con Recharts), así la lista arranca ligera.
const GraphView = lazy(() => import('./GraphView').then((m) => ({ default: m.GraphView })))

/** Opciones del conmutador de vistas (misma estructura, distinta forma). */
const VIEW_OPTIONS: { id: IdeaView; label: string; soon?: boolean }[] = [
  { id: 'outline', label: 'Lista' },
  { id: 'tree', label: 'Árbol' },
  { id: 'radial', label: 'Radial' },
]

/**
 * Organizador de ideas jerárquico: una galería de mapas y, al abrir uno, el
 * árbol en la vista elegida (lista / árbol / radial). Pensado para TDAH: sacar
 * una idea o tarea compleja de la cabeza y trocearla en piezas manejables.
 */
export function IdeasView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const maps = useLiveQuery(() => db.ideaMaps.orderBy('order').toArray(), [])
  const selected = useMemo(() => maps?.find((m) => m.id === selectedId) ?? null, [maps, selectedId])

  // Si el mapa abierto se borra (aquí o en otro dispositivo), volver a la galería.
  // El ref evita la carrera al crear: `useLiveQuery` aún no trae el mapa nuevo,
  // así que solo se sale cuando el mapa estuvo presente y luego desapareció.
  const wasPresent = useRef(false)
  useEffect(() => {
    if (!selectedId || maps === undefined) return
    if (maps.some((m) => m.id === selectedId)) {
      wasPresent.current = true
    } else if (wasPresent.current) {
      wasPresent.current = false
      setSelectedId(null)
    }
  }, [selectedId, maps])

  if (selectedId && (selected || !wasPresent.current)) {
    // Mientras la consulta alcanza al mapa recién creado, `selected` puede ser
    // null un instante; se muestra igual el espacio de trabajo (carga su propio
    // mapa) en vez de parpadear a la galería.
    return <MapWorkspace mapId={selectedId} onBack={() => setSelectedId(null)} />
  }
  return <Gallery maps={maps ?? []} onOpen={setSelectedId} />
}

// ── Galería de mapas ───────────────────────────────────────────────────────

function Gallery({ maps, onOpen }: { maps: IdeaMap[]; onOpen: (id: string) => void }) {
  const [title, setTitle] = useState('')
  // Recuento de nodos por mapa para la tarjeta (a escala personal, sin coste).
  const allNodes = useLiveQuery(() => db.ideaNodes.toArray(), [])
  const countByMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of allNodes ?? []) m.set(n.mapId, (m.get(n.mapId) ?? 0) + 1)
    return m
  }, [allNodes])

  async function create() {
    const t = title.trim()
    const { mapId } = await createMap(t)
    setTitle('')
    onOpen(mapId)
  }

  return (
    <div className="space-y-5">
      {/* Crear un mapa nuevo desde su idea central. */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
        className="flex items-center gap-2 rounded-2xl border border-line/10 glass-panel p-3"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-500/15 text-accent-300" aria-hidden="true">
          <HierarchyIcon className="size-5" />
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nueva idea a descomponer… (p. ej. «Organizar la mudanza»)"
          aria-label="Idea central del nuevo mapa"
          className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink placeholder-ink-faint outline-none focus:shadow-none"
        />
        <button
          type="submit"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-500/15 px-3.5 py-2 text-sm font-semibold text-accent-300 transition-colors hover:bg-accent-500/25"
        >
          <PlusIcon className="size-4" /> Crear mapa
        </button>
      </form>

      {maps.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl glass-panel text-accent-300">
            <HierarchyIcon className="size-7" />
          </div>
          <p className="font-medium text-ink-dim">Aún no tienes mapas de ideas</p>
          <p className="max-w-sm text-sm text-ink-faint">
            Cuando una idea o una tarea se sienta demasiado grande, créale un mapa y ve partiéndola en ramas hasta que
            cada pieza sea fácil de empezar.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((m) => {
            const count = countByMap.get(m.id) ?? 0
            const branches = Math.max(0, count - 1) // sin contar la raíz
            return (
              <button
                key={m.id}
                onClick={() => onOpen(m.id)}
                className="group flex flex-col gap-2 rounded-2xl border border-line/10 glass-panel p-4 text-left transition-colors hover:border-accent-500/30"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent-500/10 text-accent-300" aria-hidden="true">
                  <HierarchyIcon className="size-5" />
                </span>
                <p className="line-clamp-2 font-semibold text-ink group-hover:text-accent-300">{m.title}</p>
                <p className="text-xs text-ink-faint">
                  {branches === 0 ? 'Sin ramas todavía' : `${branches} rama${branches === 1 ? '' : 's'}`}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Espacio de trabajo de un mapa ────────────────────────────────────────────

function MapWorkspace({ mapId, onBack }: { mapId: string; onBack: () => void }) {
  const map = useLiveQuery(() => db.ideaMaps.get(mapId), [mapId])
  // La raíz es la idea central; su texto y el título del mapa van a la par.
  const root = useLiveQuery(
    () => db.ideaNodes.where('mapId').equals(mapId).toArray().then(findRoot),
    [mapId],
  )

  if (map === undefined || root === undefined) {
    return (
      <div className="flex justify-center py-16">
        <div className="size-7 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" aria-label="Cargando mapa" />
      </div>
    )
  }
  // El mapa ya no existe (borrado): la galería lo detecta y vuelve sola.
  if (!map) return null

  const mode: IdeaView = map.view

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Volver a los mapas"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line/10 glass-input text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <MapTitle map={map} rootId={root?.id ?? null} />
        <div className="flex items-center gap-2">
          <ViewSwitcher value={mode} onChange={(v) => void setMapView(map.id, v)} />
          <ConfirmButton
            label="Eliminar"
            confirmLabel="¿Seguro?"
            onConfirm={() => {
              void deleteMap(map.id)
              onBack()
            }}
          />
        </div>
      </div>

      {!root ? (
        <p className="py-10 text-center text-sm text-ink-faint">No se encontró la raíz de este mapa.</p>
      ) : mode === 'outline' ? (
        <OutlineView mapId={map.id} rootId={root.id} />
      ) : (
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <div className="size-7 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" aria-label="Cargando vista" />
            </div>
          }
        >
          <GraphView mapId={map.id} rootId={root.id} layout={mode === 'radial' ? 'radial' : 'tree'} />
        </Suspense>
      )}
    </div>
  )
}

/** Título del mapa = idea central: al editarlo se renombra el mapa y su raíz. */
function MapTitle({ map, rootId }: { map: IdeaMap; rootId: string | null }) {
  const [title, setTitle] = useState(map.title)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (document.activeElement !== ref.current) setTitle(map.title)
  }, [map.title])

  function commit() {
    const t = title.trim()
    if (!t || t === map.title) {
      setTitle(map.title)
      return
    }
    void renameMap(map.id, t)
    if (rootId) void setNodeText(rootId, t)
  }

  return (
    <input
      ref={ref}
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Idea central del mapa"
      className="min-w-0 flex-1 border-none bg-transparent text-lg font-bold text-ink placeholder-ink-faint outline-none focus:shadow-none"
      placeholder="Idea central"
    />
  )
}

function ViewSwitcher({ value, onChange }: { value: IdeaView; onChange: (v: IdeaView) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line/10 glass-input p-0.5" role="group" aria-label="Vista del mapa">
      {VIEW_OPTIONS.map((o) => {
        const active = value === o.id
        return (
          <button
            key={o.id}
            onClick={() => !o.soon && onChange(o.id)}
            disabled={o.soon}
            aria-pressed={active}
            title={o.soon ? 'Disponible pronto' : undefined}
            className={`relative rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? 'bg-accent-500/20 text-accent-300'
                : o.soon
                  ? 'cursor-not-allowed text-ink-faint/60'
                  : 'text-ink-dim hover:bg-ink/5 hover:text-ink'
            }`}
          >
            {o.label}
            {o.soon && <span className="ml-1 text-[0.5625rem] font-medium text-ink-faint">pronto</span>}
          </button>
        )
      })}
    </div>
  )
}
