import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { hierarchy, tree, type HierarchyPointNode } from 'd3-hierarchy'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { db } from '../../db/db'
import type { IdeaNode } from '../../db/types'
import { addChild, setNodePosition, setNodeText, toggleCollapsed } from '../../db/repo/ideas'
import { resolveDark } from '../../lib/theme'
import { useSettings } from '../../lib/useSettings'
import { PlusIcon, SwordIcon } from '../ui/icons'
import { findRoot, groupByParent } from './tree'

// Dimensiones del nodo y separaciones que alimentan el layout de d3.
const NODE_W = 176
const NODE_H = 46
const GAP_X = 26
const GAP_Y = 62
/** Distancia entre anillos concéntricos en la vista radial. */
const RADIAL_RING = 200

// El texto no se recorta: envuelve en varias líneas y el nodo crece. Estas
// medidas replican la caja real (px-3, gap-1.5, botón de añadir y, si lo hay,
// el icono de misión) para poder calcular la altura antes de pintar.
const TEXT_LINE_H = 20
const NODE_PAD_Y = 8
/** Ancho útil del texto dentro de la tarjeta (sin icono de misión). */
const TEXT_W = NODE_W - 24 - 20 - 6
/** Lo que roba el icono de "vinculado a una misión". */
const ICON_W = 20

let measureCtx: CanvasRenderingContext2D | null = null

/** Ancho en píxeles de un texto con la tipografía del nodo (aprox. por canvas). */
function textWidth(s: string): number {
  if (!measureCtx && typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx) {
      ctx.font = "500 14px 'Inter Variable', ui-sans-serif, system-ui, sans-serif"
      measureCtx = ctx
    }
  }
  if (measureCtx) return measureCtx.measureText(s).width
  return s.length * 7 // fallback sin DOM (SSR/tests)
}

/** Parte el texto en las líneas que ocuparía dentro de `width` píxeles. */
export function wrapLines(text: string, width: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && textWidth(next) > width) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
      // Palabra suelta más ancha que la caja: se corta por caracteres.
      while (textWidth(line) > width && line.length > 1) {
        let cut = line.length
        while (cut > 1 && textWidth(line.slice(0, cut)) > width) cut--
        lines.push(line.slice(0, cut))
        line = line.slice(cut)
      }
    }
    lines.push(line)
  }
  return lines.length ? lines : ['']
}

/** Altura que necesita un nodo para mostrar todo su texto. */
function nodeHeight(text: string, linked: boolean): number {
  const lines = wrapLines(text || 'Sin texto', TEXT_W - (linked ? ICON_W : 0)).length
  return Math.max(NODE_H, NODE_PAD_Y * 2 + lines * TEXT_LINE_H)
}

export type GraphLayout = 'tree' | 'radial'

interface GraphViewProps {
  mapId: string
  rootId: string
  layout: GraphLayout
}

/** Datos que viajan a cada nodo de React Flow para pintarlo e interactuar. */
interface FlowData extends Record<string, unknown> {
  text: string
  collapsed: boolean
  hasChildren: boolean
  linked: boolean
  layout: GraphLayout
  mapId: string
}

type FlowNode = Node<FlowData, 'idea'>

/** Coordenada cartesiana de un punto polar (ángulo en rad, radio). Raíz al centro. */
function pointRadial(angle: number, radius: number): [number, number] {
  const a = angle - Math.PI / 2
  return [radius * Math.cos(a), radius * Math.sin(a)]
}

/**
 * Construye nodos y aristas de React Flow desde el árbol con d3-hierarchy:
 * `tree` para el layout top-down (raíz arriba, ramas hacia abajo) y el mismo
 * layout en coordenadas polares para el radial (raíz al centro, ramas alrededor).
 * Si un nodo tiene posición manual guardada (arrastrado antes), esa manda. Las
 * ramas plegadas no aportan descendientes.
 */
function build(
  nodes: IdeaNode[],
  rootNode: IdeaNode,
  layout: GraphLayout,
): { nodes: FlowNode[]; edges: Edge[] } {
  const byParent = groupByParent(nodes)
  const root = hierarchy<IdeaNode>(rootNode, (n) => (n.collapsed ? [] : (byParent.get(n.id) ?? [])))

  let positioned: HierarchyPointNode<IdeaNode>
  const auto = new Map<string, { x: number; y: number }>()

  if (layout === 'radial') {
    // Ángulo repartido en toda la circunferencia; el radio crece con la
    // profundidad. La separación se estrecha en anillos externos para que las
    // hojas no se amontonen.
    positioned = tree<IdeaNode>()
      .size([2 * Math.PI, Math.max(1, root.height) * RADIAL_RING])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth || 1)(root)
    for (const d of positioned.descendants()) {
      const [x, y] = pointRadial(d.x, d.y)
      auto.set(d.data.id, { x, y })
    }
  } else {
    positioned = tree<IdeaNode>().nodeSize([NODE_W + GAP_X, NODE_H + GAP_Y])(root)
    // d3 separa las filas con una altura fija; como los nodos crecen según su
    // texto, recolocamos cada nivel apilando la altura real más alta de la fila
    // anterior para que nunca se solapen.
    const rowTop = new Map<number, number>()
    const rowH = new Map<number, number>()
    for (const d of positioned.descendants()) {
      const h = nodeHeight(d.data.text, !!d.data.linkedQuestId)
      rowH.set(d.depth, Math.max(rowH.get(d.depth) ?? 0, h))
    }
    let y = 0
    for (let depth = 0; depth <= positioned.height; depth++) {
      rowTop.set(depth, y)
      y += (rowH.get(depth) ?? NODE_H) + GAP_Y
    }
    for (const d of positioned.descendants()) auto.set(d.data.id, { x: d.x, y: rowTop.get(d.depth) ?? d.y })
  }

  const flowNodes: FlowNode[] = positioned.descendants().map((d) => {
    const n = d.data
    const a = auto.get(n.id)!
    const hasChildren = (byParent.get(n.id) ?? []).length > 0
    return {
      id: n.id,
      type: 'idea',
      // Posición manual si existe; si no, la automática de d3.
      position: { x: n.x ?? a.x, y: n.y ?? a.y },
      data: {
        text: n.text,
        collapsed: n.collapsed,
        hasChildren,
        linked: !!n.linkedQuestId,
        layout,
        mapId: n.mapId,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }
  })

  const edges: Edge[] = positioned.links().map((l) => ({
    id: `${l.source.data.id}-${l.target.data.id}`,
    source: l.source.data.id,
    target: l.target.data.id,
    // Top-down: escalón suave. Radial: recta centro-a-centro (radios limpios).
    type: layout === 'radial' ? 'straight' : 'smoothstep',
    style: { stroke: 'var(--color-accent-500)', strokeWidth: 1.5 },
  }))

  return { nodes: flowNodes, edges }
}

/** Firma estructural: rehace el grafo solo cuando cambia algo relevante. */
function signature(nodes: IdeaNode[]): string {
  return nodes
    .map(
      (n) =>
        `${n.id}:${n.parentId}:${n.order}:${n.collapsed ? 1 : 0}:${n.x ?? ''}:${n.y ?? ''}:${n.linkedQuestId ?? ''}:${n.text}`,
    )
    .sort()
    .join('|')
}

const nodeTypes = { idea: IdeaFlowNode }

export function GraphView({ mapId, rootId, layout }: GraphViewProps) {
  const settings = useSettings()
  const dark = resolveDark(settings.theme)
  const data = useLiveQuery(() => db.ideaNodes.where('mapId').equals(mapId).toArray(), [mapId])

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const sig = useMemo(() => (data ? signature(data) : ''), [data])

  useEffect(() => {
    if (!data) return
    const rootNode = findRoot(data)
    if (!rootNode) return
    const built = build(data, rootNode, layout)
    setNodes(built.nodes)
    setEdges(built.edges)
    // Depende de la firma y del layout, no del array: no se rehace al arrastrar
    // (posición en vuelo) salvo que cambie la estructura, el texto o la vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, rootId, layout])

  if (data === undefined) {
    return (
      <div className="flex justify-center py-16">
        <div className="size-7 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" aria-label="Cargando" />
      </div>
    )
  }

  return (
    <div className="h-[68vh] min-h-[420px] overflow-hidden rounded-2xl border border-line/10 glass-panel">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_e, node) => void setNodePosition(node.id, node.position.x, node.position.y)}
        colorMode={dark ? 'dark' : 'light'}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elevateNodesOnSelect
        zoomOnDoubleClick={false}
      >
        <Background gap={22} size={1} color="var(--color-line)" style={{ opacity: 0.12 }} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

/** Nodo del mapa en las vistas gráficas: tarjeta con el texto, plegar y añadir. */
function IdeaFlowNode({ id, data }: NodeProps<FlowNode>) {
  const { text, collapsed, hasChildren, linked, layout, mapId } = data
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(text)

  useEffect(() => {
    if (!editing) setValue(text)
  }, [text, editing])

  function commit() {
    setEditing(false)
    const t = value.trim()
    if (t && t !== text) void setNodeText(id, t)
    else setValue(text)
  }

  // En radial las conexiones salen del centro en todas direcciones: un asa
  // centrada (source y target) da radios rectos y limpios. En top-down, arriba/abajo.
  const centered = layout === 'radial'
  const handleClass = centered
    ? '!size-1.5 !border-0 !bg-transparent !left-1/2 !top-1/2'
    : '!size-1.5 !border-0 !bg-transparent'

  return (
    <div
      className={`group relative flex items-center gap-1.5 rounded-xl border bg-surface-800 px-3 py-2 shadow-sm transition-colors ${
        linked ? 'border-accent-500/50' : 'border-line/15 hover:border-accent-500/40'
      }`}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Top} className={handleClass} />

      {linked && (
        <span className="shrink-0 text-accent-400" title="Vinculado a una misión" aria-hidden="true">
          <SwordIcon className="size-3.5" />
        </span>
      )}

      {editing ? (
        <textarea
          autoFocus
          value={value}
          // Crece con el texto, igual que la tarjeta: nunca recorta.
          rows={wrapLines(value, TEXT_W - (linked ? ICON_W : 0)).length}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
            if (e.key === 'Escape') {
              setValue(text)
              setEditing(false)
            }
          }}
          aria-label="Texto de la idea"
          className="nodrag nopan min-w-0 flex-1 resize-none overflow-hidden border-none bg-transparent p-0 text-sm leading-5 text-ink outline-none focus:shadow-none"
        />
      ) : (
        <button
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 whitespace-pre-wrap break-words text-left text-sm font-medium leading-5 text-ink"
          title="Doble clic para editar · arrastra para mover"
        >
          {text || <span className="text-ink-faint">Sin texto</span>}
        </button>
      )}

      {/* Añadir sub-idea (aparece al pasar el ratón). */}
      <button
        onClick={() => void addChild(mapId, id, '')}
        aria-label="Añadir sub-idea"
        className="nodrag nopan flex size-5 shrink-0 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity hover:bg-ink/10 hover:text-accent-300 group-hover:opacity-100"
      >
        <PlusIcon className="size-3.5" />
      </button>

      <Handle type="source" position={Position.Bottom} className={handleClass} />

      {/* Plegar / desplegar la rama: pastilla bajo el nodo con la flecha. */}
      {hasChildren && (
        <button
          onClick={() => void toggleCollapsed(id)}
          aria-label={collapsed ? 'Desplegar rama' : 'Plegar rama'}
          className="nodrag nopan absolute -bottom-2.5 left-1/2 flex h-5 -translate-x-1/2 items-center justify-center rounded-full border border-line/15 bg-surface-700 px-1.5 text-ink-dim shadow-sm transition-colors hover:text-accent-300"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`size-3 transition-transform ${collapsed ? '' : 'rotate-180'}`} aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  )
}
