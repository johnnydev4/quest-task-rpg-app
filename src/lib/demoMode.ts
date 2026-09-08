/**
 * Modo DEMO, decidido UNA vez al cargar (antes de abrir la base de datos).
 *
 * La demo debe estar totalmente aislada de la cuenta real: por eso usa una base
 * IndexedDB propia (`quest-db-demo`) y NO sincroniza con la nube. Así, sembrar
 * la demo no borra ni sube nada de la sesión personal de quien la abre.
 *
 * Se activa con `?demo` en la URL y se recuerda en `sessionStorage` para que, al
 * quitar el parámetro y recargar, la pestaña siga viendo la demo. Al ser
 * `sessionStorage` (por pestaña) no se filtra a las pestañas normales del dueño.
 */
function detect(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('demo')) {
      sessionStorage.setItem('quest-demo-active', '1')
      return true
    }
    return sessionStorage.getItem('quest-demo-active') === '1'
  } catch {
    // Sin sessionStorage: al menos respeta el parámetro de la URL.
    return new URLSearchParams(window.location.search).has('demo')
  }
}

/** ¿Esta pestaña corre en modo demo? */
export const DEMO_MODE = detect()

/** Nombre de la base local: aislada en demo para no tocar la cuenta real. */
export const DB_NAME = DEMO_MODE ? 'quest-db-demo' : 'quest-db'
