import { supabase } from './supabase'

/**
 * Web Push (avisos con la app cerrada).
 *
 * El temporizador de `reminderScheduler` solo corre mientras la app está viva,
 * así que los recordatorios se perdían al cerrarla. Aquí el navegador se
 * suscribe una vez (service worker + clave VAPID), la suscripción se guarda en
 * Supabase y una Edge Function programada (`push-reminders`) es quien dispara
 * el aviso a la hora justa. El móvil no necesita tener Quest abierta.
 *
 * Requiere en `.env.local`:
 *   VITE_VAPID_PUBLIC_KEY=B...   (misma clave pública que usa la Edge Function)
 */

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()

/** ¿Está el proyecto configurado para push? (necesita nube + clave VAPID). */
export const webPushConfigured = Boolean(VAPID_PUBLIC_KEY) && supabase !== null

/** La clave VAPID viaja en base64url; PushManager la quiere en bytes. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

function keyToBase64(sub: PushSubscription, name: 'p256dh' | 'auth'): string {
  const key = sub.getKey(name)
  if (!key) throw new Error(`La suscripción no expone la clave ${name}`)
  return btoa(String.fromCharCode(...new Uint8Array(key)))
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  // `ready` no resuelve NUNCA si no hay service worker registrado (por ejemplo
  // en `npm run dev`, donde el PWA está desactivado a propósito), así que
  // primero se comprueba que exista uno.
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) return undefined
  return await navigator.serviceWorker.ready
}

export const webPush = {
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window
  },

  async current(): Promise<PushSubscription | null> {
    if (!this.isSupported()) return null
    const reg = await registration()
    return (await reg?.pushManager.getSubscription()) ?? null
  },

  async isActive(): Promise<boolean> {
    return (await this.current()) !== null
  },

  /**
   * Suscribe este dispositivo y guarda la suscripción en Supabase. Debe
   * llamarse desde un gesto del usuario (iOS exige que el permiso salga de un
   * toque) y con sesión iniciada, porque las filas van atadas al user_id.
   */
  async subscribe(): Promise<{ ok: boolean; error?: string }> {
    if (!this.isSupported()) return { ok: false, error: 'Este navegador no soporta Web Push' }
    if (!VAPID_PUBLIC_KEY) return { ok: false, error: 'Falta VITE_VAPID_PUBLIC_KEY' }
    if (!supabase) return { ok: false, error: 'Supabase no está configurado' }

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return { ok: false, error: 'Inicia sesión para recibir avisos con la app cerrada' }

    if (typeof Notification === 'undefined') {
      return { ok: false, error: 'Este navegador no soporta notificaciones' }
    }
    if (Notification.permission !== 'granted') {
      const result = await Notification.requestPermission()
      if (result !== 'granted') return { ok: false, error: 'Permiso de notificaciones denegado' }
    }

    const reg = await registration()
    if (!reg) return { ok: false, error: 'El service worker no está activo (solo en producción)' }

    try {
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }))

      const { error } = await supabase.from('push_subscriptions').upsert({
        endpoint: sub.endpoint,
        user_id: session.user.id,
        p256dh: keyToBase64(sub, 'p256dh'),
        auth: keyToBase64(sub, 'auth'),
        // El servidor necesita la zona horaria para saber qué hora local es
        // "las 08:00" de un hábito y qué día cuenta como hoy.
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        last_seen_at: new Date().toISOString(),
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'No se pudo suscribir' }
    }
  },

  async unsubscribe(): Promise<void> {
    const sub = await this.current()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await supabase?.from('push_subscriptions').delete().eq('endpoint', endpoint)
  },

  /**
   * Latido: marca el dispositivo como "con la app abierta". La Edge Function
   * ignora las suscripciones vistas hace menos de dos minutos, porque en ese
   * caso el propio `reminderScheduler` ya está dando el aviso y el push sería
   * un duplicado.
   */
  async touch(): Promise<void> {
    if (!supabase) return
    const sub = await this.current()
    if (!sub) return
    await supabase
      .from('push_subscriptions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('endpoint', sub.endpoint)
  },
}

const HEARTBEAT_MS = 60_000
let heartbeatStarted = false

/** Arranca el latido mientras la pestaña esté visible. */
export function startPushHeartbeat(): void {
  if (heartbeatStarted || !webPushConfigured) return
  heartbeatStarted = true

  const beat = () => {
    if (document.visibilityState !== 'visible') return
    void webPush.touch()
  }
  beat()
  setInterval(beat, HEARTBEAT_MS)
  document.addEventListener('visibilitychange', beat)
}
