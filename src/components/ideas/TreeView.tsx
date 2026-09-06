import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { hierarchy, tree } from 'd3-hierarchy'
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
import { PlusIcon } from '../ui/icons'
import { findRoot, groupByParent } from './tree'

// Dimensiones del nodo y separaciones que alimentan el layout de d3.
const NODE_W = 176
const NODE_H = 46
const GAP_X = 26
const GAP_Y = 62

interface TreeViewProps {
  mapId: string
  rootId: string
}

/** Datos que viajan a cada nodo de React Flow para pintarlo e interactuar. */
interface FlowData extends Record<string, unknown> {
  text: string
  collapsed: boolean
  hasChildren: boolean
  mapId: string
}

type FlowNode = Node<FlowData, 'idea'>

/**
 * Construye nodos y aristas de React Flow desde el árbol. d3-hierarchy calcula
 * el layout top-down automático (raíz arriba, ramas hacia abajo); si un nodo
 * tiene posición manual guardada (arrastrado antes), esa manda. Las ramas
 * plegadas no aportan descendientes.
 */
function build(nodes: IdeaNode[], rootNode: IdeaNode): { nodes: FlowNode[]; edges: Edge[] } {
  const byParent = groupByParent(nodes)
  const root = hierarchy<IdeaNode>(rootNode, (n) => (n.collapsed ? [] : (byParent.get(n.id) ?? [])))
  // `tree()` devuelve el árbol ya posicionado (x/y numéricos por nodo).
  const positioned = tree<IdeaNode>().nodeSize([NODE_W + GAP_X, NODE_H + GAP_Y])(root)

  const flowNodes: FlowNode[] = positioned.descendants().map((d) => {
    const n = d.data
    const hasChildren = (byParent.get(n.id) ?? []).length > 0
    return {
      id: n.id,
      type: 'idea',
      // Posición manual si existe; si no, la automática de d3.
      position: { x: n.x ?? d.x, y: n.y ?? d.y },
      data: { text: n.text, collapsed: n.collapsed, hasChildren, mapId: n.mapId },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }
  })

  const edges: Edge[] = positioned.links().map((l) => ({
    id: `${l.source.data.id}-${l.target.data.id}`,
    source: l.source.data.id,
    target: l.target.data.id,
    type: 'smoothstep',
    style: { stroke: 'var(--color-accent-500)', strokeWidth: 1.5 },
  }))

  return { nodes: flowNodes, edges }
}

/** Firma estructural: rehace el grafo solo cuando cambia algo relevante. */
function signature(nodes: IdeaNode[]): string {
  return nodes
    .map((n) => `${n.id}:${n.parentId}:${n.order}:${n.collapsed ? 1 : 0}:${n.x ?? ''}:${n.y ?? ''}:${n.text}`)
    .sort()
    .join('|')
}

const nodeTypes = { idea: IdeaFlowNode }

export function TreeView({ mapId, rootId }: TreeViewProps) {
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
    const built = build(data, rootNode)
    setNodes(built.nodes)
    setEdges(built.edges)
    // Depende de la firma, no del array: no se rehace al arrastrar (posición
    // en vuelo) salvo que cambie la estructura o el texto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, rootId])

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
  const { text, collapsed, hasChildren, mapId } = data
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

  return (
    <div
      className="group relative flex items-center gap-1.5 rounded-xl border border-line/15 bg-surface-800 px-3 py-2 shadow-sm transition-colors hover:border-accent-500/40"
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Top} className="!size-1.5 !border-0 !bg-transparent" />

      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setValue(text)
              setEditing(false)
            }
          }}
          aria-label="Texto de la idea"
          className="nodrag nopan min-w-0 flex-1 border-none bg-transparent text-sm text-ink outline-none focus:shadow-none"
        />
      ) : (
        <button
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink"
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

      <Handle type="source" position={Position.Bottom} className="!size-1.5 !border-0 !bg-transparent" />

      {/* Plegar / desplegar la rama: pastilla bajo el nodo con el nº de hijos. */}
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
