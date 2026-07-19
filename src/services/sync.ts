import { db } from '../db/db'
import { supabase } from './supabase'

/**
 * Sincronización local-first (spec §4): Dexie es la fuente de verdad inmediata;
 * Supabase es respaldo/multi-dispositivo. Conflictos: "última escritura gana"
 * por `updatedAt`. Todo viaja por una única tabla `sync_items` (jsonb) con RLS.
 * Los ajustes de personalización (tema, colores, sonidos…) SÍ se sincronizan;
 * la imagen de fondo vive en `appMedia` y no viaja (blob pesado, por dispositivo).
 */

const TABLES = [
  'lists',
  'tasks',
  'subtasks',
  'comments',
  'tags',
  'reminders',
  'studySessions',
  'attachments',
  'profile',
  'quests',
  'questSteps',
  'habits',
  'habitLogs',
  'settings',
] as const

type TableName = (typeof TABLES)[number]

interface SyncRow {
  user_id: string
  table_name: string
  id: string
  updated_at: number
  deleted: boolean
  data: Record<string, unknown> | null
}

export type SyncState = 'syncing' | 'done' | 'error'

function emitSync(state: SyncState): void {
  window.dispatchEvent(new CustomEvent('quest:sync', { detail: { state } }))
}

export function onSync(handler: (state: SyncState) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<{ state: SyncState }>).detail.state)
  window.addEventListener('quest:sync', listener)
  return () => window.removeEventListener('quest:sync', listener)
}

function stripLocal(item: Record<string, unknown>): Record<string, unknown> {
  // bgImage: campo heredado de ajustes antiguos (ya migrado); nunca se sube.
  const { syncStatus: _sync, blob: _blob, bgImage: _bg, ...rest } = item
  return rest
}

export async function countPending(): Promise<number> {
  let total = await db.tombstones.count()
  for (const t of TABLES) {
    total += await db
      .table(t)
      .filter((x) => (x as { syncStatus?: string }).syncStatus === 'pending')
      .count()
  }
  return total
}

async function push(userId: string): Promise<void> {
  const rows: SyncRow[] = []
  const pushed: { table: TableName; id: string }[] = []

  for (const table of TABLES) {
    const items = (await db
      .table(table)
      .filter((x) => (x as { syncStatus?: string }).syncStatus === 'pending')
      .toArray()) as Record<string, unknown>[]
    for (const item of items) {
      const id = item.id as string
      const updatedAt = (item.updatedAt as number) ?? Date.now()
      if (table === 'attachments') {
        const path = `${userId}/${id}`
        const { error } = await supabase!.storage
          .from('attachments')
          .upload(path, item.blob as Blob, {
            upsert: true,
            contentType: (item.mimeType as string) || 'application/octet-stream',
          })
        if (error) throw new Error(`Storage: ${error.message}`)
        await db.attachments.update(id, { cloudPath: path })
        rows.push({
          user_id: userId,
          table_name: table,
          id,
          updated_at: updatedAt,
          deleted: false,
          data: { ...stripLocal(item), cloudPath: path },
        })
      } else {
        rows.push({
          user_id: userId,
          table_name: table,
          id,
          updated_at: updatedAt,
          deleted: false,
          data: stripLocal(item),
        })
      }
      pushed.push({ table, id })
    }
  }

  const tombstones = await db.tombstones.toArray()
  for (const t of tombstones) {
    rows.push({
      user_id: userId,
      table_name: t.table,
      id: t.id,
      updated_at: t.deletedAt,
      deleted: true,
      data: null,
    })
  }

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase!.from('sync_items').upsert(rows.slice(i, i + 200))
    if (error) throw new Error(error.message)
  }

  // Todo subido: marca como sincronizado y limpia lápidas.
  for (const p of pushed) {
    await db.table(p.table).update(p.id, { syncStatus: 'synced' })
  }
  await db.tombstones.clear()
}

async function pull(userId: string): Promise<void> {
  const since = Number(localStorage.getItem('quest-last-pull') ?? 0)
  const { data, error } = await supabase!
    .from('sync_items')
    .select('*')
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(2000)
  if (error) throw new Error(error.message)

  let maxTs = since
  for (const row of (data ?? []) as SyncRow[]) {
    maxTs = Math.max(maxTs, row.updated_at)
    const table = row.table_name as TableName
    if (!TABLES.includes(table)) continue
    const local = (await db.table(table).get(row.id)) as { updatedAt?: number } | undefined

    if (row.deleted) {
      if (!local || (local.updatedAt ?? 0) <= row.updated_at) await db.table(table).delete(row.id)
      continue
    }
    // LWW: lo local más nuevo gana y se re-subirá en el próximo push.
    if (local && (local.updatedAt ?? 0) >= row.updated_at) continue
    if (!row.data) continue

    const entity: Record<string, unknown> = { ...row.data, syncStatus: 'synced' }
    if (table === 'attachments') {
      const path = (row.data.cloudPath as string) ?? `${userId}/${row.id}`
      const { data: blob, error: dlError } = await supabase!.storage.from('attachments').download(path)
      if (dlError || !blob) continue
      entity.blob = blob
    }
    await db.table(table).put(entity)
  }
  localStorage.setItem('quest-last-pull', String(maxTs))
}

let syncing = false

export async function syncNow(): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase no está configurado' }
  if (syncing) return { ok: true }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { ok: false, error: 'Inicia sesión para sincronizar' }

  syncing = true
  emitSync('syncing')
  try {
    await push(session.user.id)
    await pull(session.user.id)
    localStorage.setItem('quest-last-sync', String(Date.now()))
    emitSync('done')
    return { ok: true }
  } catch (e) {
    emitSync('error')
    return { ok: false, error: e instanceof Error ? e.message : 'Error de sincronización' }
  } finally {
    syncing = false
  }
}

export function lastSyncAt(): number | null {
  const v = localStorage.getItem('quest-last-sync')
  return v ? Number(v) : null
}

let autoStarted = false

/** Sincroniza al iniciar sesión, al recuperar conexión y periódicamente si hay cambios pendientes. */
export function startAutoSync(): void {
  if (autoStarted || !supabase) return
  autoStarted = true
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') void syncNow()
  })
  window.addEventListener('online', () => void syncNow())
  setInterval(() => {
    if (!navigator.onLine) return
    void countPending().then((n) => {
      if (n > 0) void syncNow()
    })
  }, 45_000)
}
