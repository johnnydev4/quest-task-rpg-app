/**
 * Mantiene la pantalla encendida durante los descansos del Pomodoro usando la
 * Screen Wake Lock API: en el descanso el usuario se aleja del teclado y no
 * queremos que salte el protector de pantalla ni que el equipo se suspenda.
 *
 * El navegador suelta el bloqueo solo cuando la pestaña pasa a segundo plano
 * (o se minimiza), así que escuchamos `visibilitychange` para volver a pedirlo
 * al regresar al primer plano mientras el descanso siga en marcha.
 */

interface WakeLockSentinelLike {
  release: () => Promise<void>
  addEventListener: (type: 'release', cb: () => void) => void
}

let sentinel: WakeLockSentinelLike | null = null
/** Deseo actual: ¿queremos la pantalla despierta ahora mismo? */
let desired = false
let listening = false

function wakeLockApi(): { request: (type: 'screen') => Promise<WakeLockSentinelLike> } | null {
  if (typeof navigator === 'undefined') return null
  const api = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } })
    .wakeLock
  return api ?? null
}

async function request(): Promise<void> {
  if (!desired || sentinel) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const api = wakeLockApi()
  if (!api) return
  try {
    const s = await api.request('screen')
    // Entre el await y aquí el descanso pudo terminar: si ya no se quiere, suéltalo.
    if (!desired) {
      void s.release().catch(() => undefined)
      return
    }
    sentinel = s
    // El propio navegador lo libera al ocultar la pestaña: refléjalo para poder repedirlo.
    s.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    // Permiso denegado o API no disponible: el temporizador sigue igual.
    sentinel = null
  }
}

function ensureListening(): void {
  if (listening || typeof document === 'undefined') return
  listening = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void request()
  })
}

/**
 * Enciende o apaga el deseo de mantener la pantalla despierta. Idempotente:
 * puede llamarse en cada actualización del Pomodoro sin reabrir bloqueos.
 */
export function keepScreenAwake(on: boolean): void {
  if (on === desired) return
  desired = on
  if (on) {
    ensureListening()
    void request()
  } else {
    const current = sentinel
    sentinel = null
    void current?.release().catch(() => undefined)
  }
}
