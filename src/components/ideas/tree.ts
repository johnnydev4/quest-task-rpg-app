import type { IdeaNode } from '../../db/types'

/** Nodos agrupados por su `parentId` y ordenados entre hermanos. */
export function groupByParent(nodes: IdeaNode[]): Map<string | null, IdeaNode[]> {
  const byParent = new Map<string | null, IdeaNode[]>()
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.order - b.order)
  return byParent
}

/** Nodo raíz del mapa (parentId = null). */
export function findRoot(nodes: IdeaNode[]): IdeaNode | undefined {
  return nodes.find((n) => n.parentId === null)
}

/** Fila aplanada de la vista lista: el nodo, su profundidad y si tiene hijos. */
export interface FlatRow {
  node: IdeaNode
  depth: number
  hasChildren: boolean
}

/**
 * Aplana el árbol en orden de lectura (DFS) para la vista lista, saltándose la
 * descendencia de las ramas plegadas. `startId` es el nodo cuyos hijos abren la
 * lista (normalmente la raíz, que se muestra aparte en la cabecera).
 */
export function flattenOutline(
  startId: string,
  byParent: Map<string | null, IdeaNode[]>,
  depth = 0,
  acc: FlatRow[] = [],
): FlatRow[] {
  for (const node of byParent.get(startId) ?? []) {
    const children = byParent.get(node.id) ?? []
    acc.push({ node, depth, hasChildren: children.length > 0 })
    if (!node.collapsed && children.length > 0) flattenOutline(node.id, byParent, depth + 1, acc)
  }
  return acc
}

/**
 * Color efectivo de cada nodo: el suyo propio si lo tiene y, si no, el heredado
 * del ancestro más cercano que sí lo tenga (y en última instancia el del mapa).
 * Así colorear una rama es tan simple como colorear su nodo de cabecera.
 * null = sin color: la vista usa el acento de la app.
 */
export function resolveNodeColors(nodes: IdeaNode[], mapColor: string | null): Map<string, string | null> {
  const byParent = groupByParent(nodes)
  const out = new Map<string, string | null>()
  const walk = (parentId: string | null, inherited: string | null): void => {
    for (const n of byParent.get(parentId) ?? []) {
      const color = n.color ?? inherited
      out.set(n.id, color)
      walk(n.id, color)
    }
  }
  walk(null, mapColor)
  return out
}
