/*
 * Handlers de Web Push. Workbox lo inyecta al principio del service worker
 * generado (vite.config.ts → workbox.importScripts), porque el SW es lo único
 * que sigue vivo con la app cerrada: quien decide el momento del aviso es el
 * servidor (Edge Function `push-reminders`), no el temporizador de la pestaña.
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Push sin cuerpo JSON: se muestra el aviso genérico igualmente.
  }

  // Siempre hay que mostrar algo: si el navegador recibe un push y no aparece
  // notificación, Chrome muestra su propio "el sitio se actualizó en segundo plano".
  const title = payload.title || 'Quest'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // El tag agrupa reintentos del mismo recordatorio en una sola notificación.
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Si ya hay una ventana de Quest abierta, se enfoca en vez de abrir otra.
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
