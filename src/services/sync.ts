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
  'daySections',
  'settings',
  'ideaMaps',
  'ideaNodes',
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

/**
 * Sellos de tiempo que el respaldo ya tiene para las filas que se van a subir.
 * Se consultan en bloques por `id` (son únicos) y se indexan por tabla+id.
 */
async function remoteStamps(
  userId: string,
  ids: string[],
): Promise<Map<string, number>> {
  const stamps = new Map<string, number>()
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase!
      .from('sync_items')
      .select('table_name,id,updated_at')
      .eq('user_id', userId)
      .in('id', unique.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as { table_name: string; id: string; updated_at: number }[]) {
      stamps.set(`${row.table_name}|${row.id}`, Number(row.updated_at))
    }
  }
  return stamps
}

/**
 * Sube lo pendiente aplicando "última escritura gana" TAMBIÉN de subida: una
 * fila local más vieja que la del respaldo NO se sube.
 *
 * Sin esto, abrir el portátil con cambios pendientes de ayer pisaba en el
 * respaldo lo hecho esa mañana en el móvil: las vencidas ya organizadas volvían
 * a salir y las borradas resucitaban. Lo que se deja sin subir se queda
 * `pending` y la bajada posterior lo reemplaza por la versión buena (que ya
 * llega marcada como `synced`).
 */
async function push(userId: string): Promise<void> {
  const pending: { table: TableName; item: Record<string, unknown>; updatedAt: number }[] = []
  for (const table of TABLES) {
    const items = (await db
      .table(table)
      .filter((x) => (x as { syncStatus?: string }).syncStatus === 'pending')
      .toArray()) as Record<string, unknown>[]
    for (const item of items) {
      pending.push({ table, item, updatedAt: (item.updatedAt as number) ?? Date.now() })
    }
  }
  const tombstones = await db.tombstones.toArray()
  if (pending.length === 0 && tombstones.length === 0) return

  const stamps = await remoteStamps(userId, [
    ...pending.map((p) => p.item.id as string),
    ...tombstones.map((t) => t.id),
  ])
  const stale = (table: string, id: string, updatedAt: number) =>
    (stamps.get(`${table}|${id}`) ?? -1) > updatedAt

  const rows: SyncRow[] = []
  const pushed: { table: TableName; id: string }[] = []

  for (const { table, item, updatedAt } of pending) {
    const id = item.id as string
    if (stale(table, id, updatedAt)) continue
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

  for (const t of tombstones) {
    // Un borrado tampoco pisa una edición posterior de otro dispositivo.
    if (stale(t.table, t.id, t.deletedAt)) continue
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

  // Todo subido: marca como sincronizado y retira SOLO las lápidas de esta
  // pasada (una eliminación hecha mientras se subía no se pierde).
  for (const p of pushed) {
    await db.table(p.table).update(p.id, { syncStatus: 'synced' })
  }
  await db.tombstones.bulkDelete(tombstones.map((t) => t.id))
}

/** Filas por página; se pagina hasta agotar para no toparse con el tope del backend. */
const PULL_PAGE = 1000

/**
 * Caso simétrico del merge de `overdueNoticeDay`: cuando gana el perfil LOCAL
 * pero el respaldo traía un día de aviso posterior, ese día se adopta igual
 * (si no, este dispositivo volvería a enseñar un aviso ya despachado).
 */
async function keepLaterNoticeDay(
  table: TableName,
  local: { overdueNoticeDay?: string | null },
  row: SyncRow,
): Promise<void> {
  if (table !== 'profile' || !row.data) return
  const remoteDay = (row.data.overdueNoticeDay as string | null | undefined) ?? null
  const localDay = local.overdueNoticeDay ?? null
  if (remoteDay === null || (localDay !== null && localDay >= remoteDay)) return
  await db.profile.update(row.id, {
    overdueNoticeDay: remoteDay,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

/**
 * Trae del respaldo lo que cambió desde el último pull.
 *
 * El cursor (`quest-last-pull`) es el `updated_at` más alto ya visto, y con
 * modo incremental solo se piden filas por encima de él. El problema: ese sello
 * es el reloj del cliente, y una entidad que se toca poco (p. ej. los momentos
 * del día) queda con un `updatedAt` bajo mientras las ediciones frecuentes de
 * tareas —o una diferencia de reloj entre dispositivos— empujan el cursor por
 * encima. Esa fila cae bajo el cursor y con `.gt` no se vuelve a bajar nunca:
 * aparece en un dispositivo y no en el otro.
 *
 * Por eso `full` arranca desde cero y recorre TODO (paginando), reconciliando
 * lo que el cursor dejó atrás. Se usa al abrir/volver a la app, al iniciar
 * sesión y al reconectar; el latido en primer plano usa el modo incremental
 * (barato). El cursor nunca retrocede: se guarda el máximo visto.
 */
async function pull(userId: string, full = false): Promise<void> {
  const stored = Number(localStorage.getItem('quest-last-pull') ?? 0)
  let cursor = full ? 0 : stored
  let maxTs = stored

  for (;;) {
    const { data, error } = await supabase!
      .from('sync_items')
      .select('*')
      .gt('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .limit(PULL_PAGE)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as SyncRow[]

    for (const row of rows) {
      // Las filas llegan en orden ascendente: la última fija el cursor de la
      // siguiente página (y el máximo persistido al terminar).
      cursor = Math.max(cursor, row.updated_at)
      maxTs = Math.max(maxTs, row.updated_at)
      const table = row.table_name as TableName
      if (!TABLES.includes(table)) continue
      const local = (await db.table(table).get(row.id)) as
        | { updatedAt?: number; overdueNoticeDay?: string | null }
        | undefined

      if (row.deleted) {
        if (!local || (local.updatedAt ?? 0) <= row.updated_at) await db.table(table).delete(row.id)
        continue
      }
      // LWW: lo local más nuevo gana y se re-subirá en el próximo push.
      if (local && (local.updatedAt ?? 0) >= row.updated_at) {
        await keepLaterNoticeDay(table, local, row)
        continue
      }
      if (!row.data) continue

      const entity: Record<string, unknown> = { ...row.data, syncStatus: 'synced' }
      // El día del aviso de vencidas viaja dentro del perfil, que se resuelve
      // por "última escritura gana". Si la versión ganadora es más nueva pero
      // no traía el día ya marcado en el otro dispositivo, el aviso salía otra
      // vez ahí: se conserva siempre el día MÁS RECIENTE de los dos.
      if (table === 'profile') {
        const localDay = local?.overdueNoticeDay ?? null
        const remoteDay = (row.data.overdueNoticeDay as string | null | undefined) ?? null
        if (localDay !== null && (remoteDay === null || localDay > remoteDay)) {
          entity.overdueNoticeDay = localDay
          entity.syncStatus = 'pending'
        }
      }
      if (table === 'attachments') {
        const path = (row.data.cloudPath as string) ?? `${userId}/${row.id}`
        const { data: blob, error: dlError } = await supabase!.storage.from('attachments').download(path)
        if (dlError || !blob) continue
        entity.blob = blob
      }
      await db.table(table).put(entity)
    }

    // Página incompleta = no queda más por traer.
    if (rows.length < PULL_PAGE) break
  }

  localStorage.setItem('quest-last-pull', String(maxTs))
}

let syncing = false
let pendingRetry = false

/**
 * `full` fuerza una bajada completa reconciliadora (recorre todo el respaldo,
 * no solo lo posterior al cursor). Se usa al abrir/volver a la app, iniciar
 * sesión y reconectar, para recuperar entidades que el cursor por reloj de
 * cliente pudo dejar atrás (ver `pull`).
 */
export async function syncNow(full = false): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase no está configurado' }
  if (syncing) {
    // Ya hay una sync en curso: reintenta al terminar para no perder este disparo.
    pendingRetry = true
    return { ok: true }
  }
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return { ok: false, error: 'Inicia sesión para sincronizar' }

  syncing = true
  emitSync('syncing')
  try {
    await push(session.user.id)
    await pull(session.user.id, full)
    localStorage.setItem('quest-last-sync', String(Date.now()))
    emitSync('done')
    return { ok: true }
  } catch (e) {
    emitSync('error')
    return { ok: false, error: e instanceof Error ? e.message : 'Error de sincronización' }
  } finally {
    syncing = false
    if (pendingRetry) {
      pendingRetry = false
      scheduleSync(0)
    }
  }
}

let syncTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Sincroniza poco después de la última escritura (debounce): cada llamada
 * reinicia el temporizador para agrupar ráfagas de cambios en una sola sync.
 */
export function scheduleSync(delay = 3000): void {
  if (!supabase) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    if (!navigator.onLine) return
    void syncNow()
  }, delay)
}

export function lastSyncAt(): number | null {
  const v = localStorage.getItem('quest-last-sync')
  return v ? Number(v) : null
}

/**
 * Sincroniza solo si la última pasó hace más de `maxAge`. Evita repetir la misma
 * consulta cuando varios disparos (volver a la app, foco, latido) coinciden.
 */
async function syncIfStale(maxAge: number, full = false): Promise<void> {
  if (!navigator.onLine || syncing) return
  const last = lastSyncAt()
  if (last && Date.now() - last < maxAge) return
  await syncNow(full)
}

/** Ritmo del latido mientras la app está a la vista: trae cambios de otros dispositivos. */
const FOREGROUND_POLL = 30_000

let autoStarted = false

/**
 * Sincroniza al abrir la app, al volver a ella, al recuperar conexión y con un
 * latido en primer plano, de modo que los cambios hechos en otro dispositivo
 * aparecen sin esperar a escribir algo aquí.
 */
export function startAutoSync(): void {
  if (autoStarted || !supabase) return
  autoStarted = true

  // Al arrancar: bajada completa reconciliadora (recupera lo que el cursor dejó atrás).
  void syncNow(true)
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
      void syncIfStale(5_000, true)
    }
  })
  window.addEventListener('online', () => void syncNow(true))
  // Cualquier escritura local (hooks de Dexie en db.ts) dispara un sync con debounce.
  window.addEventListener('quest:changed', () => scheduleSync())
  document.addEventListener('visibilitychange', () => {
    // Al ocultar: flush para no perder cambios recientes.
    if (document.visibilityState === 'hidden') void syncNow()
    // Al volver (pestaña o app en el móvil): reconcilia todo por si falta algo.
    else void syncIfStale(10_000, true)
  })
  window.addEventListener('focus', () => void syncIfStale(10_000))
  window.addEventListener('pagehide', () => void syncNow())
  setInterval(() => {
    if (!navigator.onLine) return
    // En primer plano se sincroniza siempre (aunque no haya cambios locales),
    // que es lo único que trae lo escrito en el otro dispositivo. De fondo,
    // solo si queda algo por subir.
    if (document.visibilityState === 'visible') {
      void syncIfStale(FOREGROUND_POLL - 5_000)
      return
    }
    void countPending().then((n) => {
      if (n > 0) void syncNow()
    })
  }, FOREGROUND_POLL)
}
