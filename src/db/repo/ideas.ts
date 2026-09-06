import { uid } from '../../lib/uid'
import { db } from '../db'
import type { IdeaMap, IdeaNode, IdeaView } from '../types'
import { recordDeletion } from './tombstones'

/**
 * Organizador de ideas jerárquico: un `IdeaMap` es un árbol con un nodo raíz,
 * y sus `IdeaNode` se enlazan por `parentId` (null = raíz) y se ordenan entre
 * hermanos con `order`. La misma estructura se pinta como lista, árbol top-down
 * o mapa radial; estas funciones son la única puerta de escritura (offline-first
 * en Dexie, con sincronización a Supabase por el patrón general).
 */

/** Texto por defecto de la idea central de un mapa recién creado. */
const DEFAULT_ROOT_TEXT = 'Idea central'

// ── Mapas ────────────────────────────────────────────────────────────────

/**
 * Crea un mapa nuevo con su nodo raíz. Devuelve ambos ids: el raíz es donde
 * cuelga todo el árbol y el que se enfoca al abrir el mapa por primera vez.
 */
export async function createMap(title?: string): Promise<{ mapId: string; rootId: string }> {
  const now = Date.now()
  const mapId = uid()
  const rootId = uid()
  const rootText = (title ?? '').trim() || DEFAULT_ROOT_TEXT

  const last = await db.ideaMaps.orderBy('order').last()
  const map: IdeaMap = {
    id: mapId,
    title: rootText,
    view: 'outline',
    order: (last?.order ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  const root: IdeaNode = {
    id: rootId,
    mapId,
    text: rootText,
    parentId: null,
    collapsed: false,
    order: 0,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.transaction('rw', [db.ideaMaps, db.ideaNodes], async () => {
    await db.ideaMaps.add(map)
    await db.ideaNodes.add(root)
  })
  return { mapId, rootId }
}

export async function renameMap(id: string, title: string): Promise<void> {
  const t = title.trim()
  if (!t) return
  await db.ideaMaps.update(id, { title: t, updatedAt: Date.now(), syncStatus: 'pending' })
}

/** Recuerda la última vista usada (lista / árbol / radial) para reabrir igual. */
export async function setMapView(id: string, view: IdeaView): Promise<void> {
  await db.ideaMaps.update(id, { view, updatedAt: Date.now(), syncStatus: 'pending' })
}

export async function reorderMaps(ids: string[]): Promise<void> {
  await db.transaction('rw', db.ideaMaps, async () => {
    for (let i = 0; i < ids.length; i++) {
      await db.ideaMaps.update(ids[i], { order: i, updatedAt: Date.now(), syncStatus: 'pending' })
    }
  })
}

/** Borra el mapa entero con todos sus nodos (y sus lápidas para la nube). */
export async function deleteMap(id: string): Promise<void> {
  await db.transaction('rw', [db.ideaMaps, db.ideaNodes, db.tombstones], async () => {
    const nodeIds = (await db.ideaNodes.where('mapId').equals(id).primaryKeys()) as string[]
    for (const nid of nodeIds) await recordDeletion('ideaNodes', nid)
    await db.ideaNodes.where('mapId').equals(id).delete()
    await db.ideaMaps.delete(id)
    await recordDeletion('ideaMaps', id)
  })
}

// ── Nodos ────────────────────────────────────────────────────────────────

/** Hijos directos de un nodo, ordenados entre hermanos. */
async function siblings(mapId: string, parentId: string | null): Promise<IdeaNode[]> {
  const rows = await db.ideaNodes.where('mapId').equals(mapId).toArray()
  return rows.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order)
}

function newNode(mapId: string, parentId: string | null, text: string, order: number): IdeaNode {
  const now = Date.now()
  return {
    id: uid(),
    mapId,
    text: text.trim(),
    parentId,
    collapsed: false,
    order,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
}

/** Añade un hijo al final de `parentId`. Devuelve el id del nodo creado. */
export async function addChild(mapId: string, parentId: string, text = ''): Promise<string> {
  const kids = await siblings(mapId, parentId)
  const node = newNode(mapId, parentId, text, (kids.at(-1)?.order ?? -1) + 1)
  await db.transaction('rw', db.ideaNodes, async () => {
    // Al añadir dentro de una rama plegada, se despliega para ver lo nuevo.
    await db.ideaNodes.update(parentId, { collapsed: false, updatedAt: Date.now(), syncStatus: 'pending' })
    await db.ideaNodes.add(node)
  })
  return node.id
}

/**
 * Inserta un hermano justo después de `nodeId` (misma rama). Si el nodo es la
 * raíz —que es única— añade un hijo en su lugar. Devuelve el id creado.
 */
export async function addSiblingAfter(nodeId: string, text = ''): Promise<string> {
  const node = await db.ideaNodes.get(nodeId)
  if (!node) throw new Error('Nodo no encontrado')
  if (node.parentId === null) return addChild(node.mapId, node.id, text)

  const kids = await siblings(node.mapId, node.parentId)
  const idx = kids.findIndex((n) => n.id === nodeId)
  const next = kids[idx + 1]
  // Orden a medio camino entre el nodo y el siguiente hermano (o +1 si es el
  // último). Fraccionar evita reescribir el resto de hermanos en cada inserción.
  const order = next ? (node.order + next.order) / 2 : node.order + 1
  const created = newNode(node.mapId, node.parentId, text, order)
  await db.ideaNodes.add(created)
  return created.id
}

export async function setNodeText(id: string, text: string): Promise<void> {
  await db.ideaNodes.update(id, { text: text.trim(), updatedAt: Date.now(), syncStatus: 'pending' })
}

export async function setCollapsed(id: string, collapsed: boolean): Promise<void> {
  await db.ideaNodes.update(id, { collapsed, updatedAt: Date.now(), syncStatus: 'pending' })
}

export async function toggleCollapsed(id: string): Promise<void> {
  const node = await db.ideaNodes.get(id)
  if (!node) return
  await setCollapsed(id, !node.collapsed)
}

/** Guarda la posición manual de un nodo (arrastre en las vistas gráficas). */
export async function setNodePosition(id: string, x: number, y: number): Promise<void> {
  await db.ideaNodes.update(id, { x, y, updatedAt: Date.now(), syncStatus: 'pending' })
}

/** Vincula (o desvincula con null) un nodo a una quest del sistema RPG. */
export async function linkNodeToQuest(id: string, questId: string | null): Promise<void> {
  await db.ideaNodes.update(id, { linkedQuestId: questId, updatedAt: Date.now(), syncStatus: 'pending' })
}

/**
 * Ids de un nodo y toda su descendencia (DFS). Se usa para borrar ramas enteras
 * en cascada sin dejar nodos huérfanos.
 */
function collectSubtree(rootId: string, byParent: Map<string | null, IdeaNode[]>): string[] {
  const out: string[] = [rootId]
  for (const child of byParent.get(rootId) ?? []) out.push(...collectSubtree(child.id, byParent))
  return out
}

/**
 * Borra un nodo y toda su rama. No borra la raíz (para eso está `deleteMap`):
 * devuelve false si se intenta, para que la UI no crea que desapareció.
 */
export async function deleteNode(id: string): Promise<boolean> {
  const node = await db.ideaNodes.get(id)
  if (!node || node.parentId === null) return false
  const all = await db.ideaNodes.where('mapId').equals(node.mapId).toArray()
  const byParent = new Map<string | null, IdeaNode[]>()
  for (const n of all) {
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  const ids = collectSubtree(id, byParent)
  await db.transaction('rw', [db.ideaNodes, db.tombstones], async () => {
    for (const nid of ids) await recordDeletion('ideaNodes', nid)
    await db.ideaNodes.bulkDelete(ids)
  })
  return true
}

/**
 * Indenta un nodo (Tab): pasa a ser hijo del hermano anterior, al final de sus
 * hijos. Sin hermano anterior no hay dónde indentar (no-op).
 */
export async function indentNode(id: string): Promise<void> {
  const node = await db.ideaNodes.get(id)
  if (!node || node.parentId === null) return
  const kids = await siblings(node.mapId, node.parentId)
  const idx = kids.findIndex((n) => n.id === id)
  const prev = kids[idx - 1]
  if (!prev) return
  const prevKids = await siblings(node.mapId, prev.id)
  await db.transaction('rw', db.ideaNodes, async () => {
    // El nuevo padre se despliega para que el nodo movido siga a la vista.
    await db.ideaNodes.update(prev.id, { collapsed: false, updatedAt: Date.now(), syncStatus: 'pending' })
    await db.ideaNodes.update(id, {
      parentId: prev.id,
      order: (prevKids.at(-1)?.order ?? -1) + 1,
      updatedAt: Date.now(),
      syncStatus: 'pending',
    })
  })
}

/**
 * Desindenta un nodo (Shift+Tab): pasa a ser hermano de su padre, justo después
 * de él. Si el padre es la raíz no se puede subir más (no-op).
 */
export async function outdentNode(id: string): Promise<void> {
  const node = await db.ideaNodes.get(id)
  if (!node || node.parentId === null) return
  const parent = await db.ideaNodes.get(node.parentId)
  if (!parent || parent.parentId === null) return // el padre es la raíz: ya no sube más
  const uncles = await siblings(parent.mapId, parent.parentId)
  const pIdx = uncles.findIndex((n) => n.id === parent.id)
  const after = uncles[pIdx + 1]
  const order = after ? (parent.order + after.order) / 2 : parent.order + 1
  await db.ideaNodes.update(id, {
    parentId: parent.parentId,
    order,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

/**
 * Reordena los hijos de un padre según `ids` (arrastrar y soltar en la lista o
 * reparentar en las vistas gráficas). Reasigna `order` = índice.
 */
export async function reorderChildren(ids: string[]): Promise<void> {
  await db.transaction('rw', db.ideaNodes, async () => {
    for (let i = 0; i < ids.length; i++) {
      await db.ideaNodes.update(ids[i], { order: i, updatedAt: Date.now(), syncStatus: 'pending' })
    }
  })
}

/**
 * Mueve un nodo bajo un nuevo padre (sin crear ciclos) y lo coloca al final.
 * Usado por el arrastre entre ramas en las vistas gráficas.
 */
export async function moveNode(id: string, newParentId: string): Promise<void> {
  if (id === newParentId) return
  const node = await db.ideaNodes.get(id)
  if (!node || node.parentId === null) return
  const all = await db.ideaNodes.where('mapId').equals(node.mapId).toArray()
  const byParent = new Map<string | null, IdeaNode[]>()
  for (const n of all) {
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  // No dejar caer un nodo dentro de su propia descendencia (rompería el árbol).
  if (collectSubtree(id, byParent).includes(newParentId)) return
  const kids = (byParent.get(newParentId) ?? []).sort((a, b) => a.order - b.order)
  await db.transaction('rw', db.ideaNodes, async () => {
    await db.ideaNodes.update(newParentId, { collapsed: false, updatedAt: Date.now(), syncStatus: 'pending' })
    await db.ideaNodes.update(id, {
      parentId: newParentId,
      order: (kids.at(-1)?.order ?? -1) + 1,
      updatedAt: Date.now(),
      syncStatus: 'pending',
    })
  })
}
