/**
 * Edge Function `push-reminders`: dispara los avisos de Quest con la app cerrada.
 *
 * pg_cron la invoca cada minuto (ver supabase/PUSH.md). Lee los recordatorios y
 * hábitos que ya venció su hora desde `sync_items` y manda un Web Push a los
 * dispositivos suscritos. Los datos viven en jsonb porque la sincronización de
 * la app usa una sola tabla genérica, así que el filtrado fino se hace aquí.
 *
 * Variables de entorno (Dashboard → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta la plataforma.
 */
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:quest@example.com'

/** Margen tras el cual se considera que la app NO está abierta en ese dispositivo. */
const IDLE_MS = 2 * 60_000
/** Un recordatorio muy viejo (app cerrada días) no se notifica al azar. */
const MAX_LATE_MS = 12 * 60 * 60_000
/** Los registros de deduplicación caducan; sin esto la tabla crece sin fin. */
const DEDUPE_TTL_DAYS = 30

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

interface Subscription {
  endpoint: string
  user_id: string
  p256dh: string
  auth: string
  time_zone: string
}

interface SyncRow {
  user_id: string
  table_name: string
  id: string
  data: Record<string, unknown> | null
}

interface Pending {
  userId: string
  dedupeKey: string
  title: string
  body: string
  tag: string
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Fecha/hora local del usuario: la app guarda horas locales ('08:00', '2026-07-28'). */
function localParts(now: Date, timeZone: string) {
  const opts = { timeZone } as const
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    ...opts,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const hm = new Intl.DateTimeFormat('en-GB', {
    ...opts,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now)
  const weekday = new Intl.DateTimeFormat('en-US', { ...opts, weekday: 'short' }).format(now)
  return { dateKey, hm, dayOfWeek: DOW[weekday] ?? 0 }
}

function dateKeyOf(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

/** Recordatorios de tareas vencidos y aún sin descartar. */
function dueReminders(
  userId: string,
  rows: SyncRow[],
  nowMs: number,
): Pending[] {
  const tasks = new Map(rows.filter((r) => r.table_name === 'tasks').map((r) => [r.id, r.data]))
  const out: Pending[] = []

  for (const row of rows) {
    if (row.table_name !== 'reminders' || !row.data) continue
    const r = row.data as { taskId?: string; remindAt?: number; dismissed?: boolean }
    if (r.dismissed || typeof r.remindAt !== 'number') continue
    if (r.remindAt > nowMs || nowMs - r.remindAt > MAX_LATE_MS) continue

    const task = tasks.get(String(r.taskId)) as { title?: string; completed?: boolean } | undefined
    if (!task || task.completed) continue

    out.push({
      userId,
      // `remindAt` cambia en cada repetición, así que cada disparo es único.
      dedupeKey: `r:${row.id}:${r.remindAt}`,
      title: '⏰ Recordatorio',
      body: task.title ?? 'Tarea pendiente',
      tag: `reminder-${row.id}`,
    })
  }
  return out
}

/** Hábitos programados hoy, pasada su hora de aviso y todavía sin cumplir. */
function dueHabits(
  userId: string,
  rows: SyncRow[],
  now: Date,
  timeZone: string,
): Pending[] {
  const { dateKey, hm, dayOfWeek } = localParts(now, timeZone)
  const doneToday = new Set(
    rows
      .filter((r) => r.table_name === 'habitLogs' && (r.data as { dateKey?: string })?.dateKey === dateKey)
      .map((r) => String((r.data as { habitId?: string }).habitId)),
  )
  const out: Pending[] = []

  for (const row of rows) {
    if (row.table_name !== 'habits' || !row.data) continue
    const h = row.data as {
      title?: string
      daysOfWeek?: number[]
      startDate?: number
      endDate?: number | null
      reminderTime?: string | null
    }
    if (!h.reminderTime || doneToday.has(row.id)) continue
    if (!h.daysOfWeek?.includes(dayOfWeek)) continue
    if (typeof h.startDate === 'number' && dateKey < dateKeyOf(h.startDate, timeZone)) continue
    if (typeof h.endDate === 'number' && dateKey > dateKeyOf(h.endDate, timeZone)) continue
    if (hm < h.reminderTime) continue

    out.push({
      userId,
      // Una sola vez al día por hábito.
      dedupeKey: `h:${row.id}:${dateKey}`,
      title: '🔁 Hábito pendiente',
      body: h.title ?? 'Tienes un hábito por cumplir',
      tag: `habit-${row.id}`,
    })
  }
  return out
}

async function send(sub: Subscription, payload: Pending): Promise<void> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        tag: payload.tag,
        url: '/',
      }),
    )
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    // 404/410: el navegador tiró la suscripción (app desinstalada, permiso
    // revocado). Se borra para no reintentar cada minuto contra un endpoint muerto.
    if (status === 404 || status === 410) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    } else {
      console.error('push falló', sub.endpoint.slice(-12), status, (e as Error).message)
    }
  }
}

Deno.serve(async (req) => {
  // Solo la clave de servicio (la usa pg_cron); el anon key no debe poder disparar pushes.
  if (req.headers.get('Authorization') !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const nowMs = now.getTime()

  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, user_id, p256dh, auth, time_zone')
    // Dispositivo con la app abierta: su temporizador in-app ya avisa, se salta.
    .lt('last_seen_at', new Date(nowMs - IDLE_MS).toISOString())
  if (subsError) return new Response(subsError.message, { status: 500 })
  if (!subs?.length) return Response.json({ sent: 0, reason: 'sin dispositivos inactivos' })

  const byUser = new Map<string, Subscription[]>()
  for (const s of subs as Subscription[]) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }

  const { data: rows, error: rowsError } = await supabase
    .from('sync_items')
    .select('user_id, table_name, id, data')
    .in('user_id', [...byUser.keys()])
    .in('table_name', ['reminders', 'tasks', 'habits', 'habitLogs'])
    .eq('deleted', false)
    .limit(20000)
  if (rowsError) return new Response(rowsError.message, { status: 500 })

  const pending: Pending[] = []
  for (const [userId, userSubs] of byUser) {
    const userRows = (rows as SyncRow[]).filter((r) => r.user_id === userId)
    // La zona horaria es del dispositivo; con varios, manda el primero (misma persona).
    const timeZone = userSubs[0].time_zone || 'UTC'
    pending.push(...dueReminders(userId, userRows, nowMs))
    pending.push(...dueHabits(userId, userRows, now, timeZone))
  }
  if (!pending.length) return Response.json({ sent: 0 })

  // Deduplicación: lo ya enviado no se repite en el siguiente minuto.
  const { data: already } = await supabase
    .from('push_sent')
    .select('user_id, dedupe_key')
    .in('dedupe_key', pending.map((p) => p.dedupeKey))
  const sentKeys = new Set((already ?? []).map((r) => `${r.user_id}|${r.dedupe_key}`))
  const fresh = pending.filter((p) => !sentKeys.has(`${p.userId}|${p.dedupeKey}`))
  if (!fresh.length) return Response.json({ sent: 0 })

  // Se marca ANTES de enviar: si el envío falla a medias, es preferible perder
  // un aviso a repetirlo cada minuto hasta que el usuario abra la app.
  const { error: markError } = await supabase
    .from('push_sent')
    .insert(fresh.map((p) => ({ user_id: p.userId, dedupe_key: p.dedupeKey })))
  if (markError) return new Response(markError.message, { status: 500 })

  await Promise.all(
    fresh.flatMap((p) => (byUser.get(p.userId) ?? []).map((sub) => send(sub, p))),
  )

  await supabase
    .from('push_sent')
    .delete()
    .lt('sent_at', new Date(nowMs - DEDUPE_TTL_DAYS * 86_400_000).toISOString())

  return Response.json({ sent: fresh.length })
})
