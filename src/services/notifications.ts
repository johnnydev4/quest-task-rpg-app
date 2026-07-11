import { emitToast } from '../lib/events'

/**
 * Capa de notificaciones abstraída (spec §4): recordatorios in-app garantizados
 * (toast) + Notifications API del sistema donde esté disponible. La lógica de
 * negocio solo habla con este servicio, así se puede cambiar a notificaciones
 * nativas (Capacitor) sin reescribir nada más.
 */
export const notificationService = {
  isSupported(): boolean {
    return typeof Notification !== 'undefined'
  },

  permission(): NotificationPermission | 'unsupported' {
    return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  },

  async requestPermission(): Promise<boolean> {
    if (typeof Notification === 'undefined') return false
    if (Notification.permission === 'granted') return true
    const result = await Notification.requestPermission()
    return result === 'granted'
  },

  async notify(title: string, body: string): Promise<void> {
    // In-app siempre (garantizado).
    emitToast({ title, body })
    // Sistema: solo con permiso, priorizando el service worker (funciona en PWA instalada).
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      if (registration) {
        await registration.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
        })
      } else {
        new Notification(title, { body, icon: '/pwa-192x192.png' })
      }
    } catch {
      // La notificación in-app ya salió; el fallo del sistema no es crítico.
    }
  },
}
