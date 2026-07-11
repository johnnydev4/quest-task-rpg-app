import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

if (import.meta.env.PROD) {
  // Solo en producción: SW para offline. `autoUpdate` activa nuevas versiones al recargar.
  registerSW({ immediate: true })
} else {
  // En desarrollo: elimina cualquier service worker/caché previo para que
  // siempre veas la versión fresca del servidor (sin quedarte con una vieja).
  void navigator.serviceWorker?.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
  void window.caches?.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
