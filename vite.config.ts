import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Respeta el puerto que asigne el entorno (PORT); si no hay, Vite usa 5173.
const envPort = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  ?.env?.PORT

export default defineConfig({
  server: envPort ? { port: Number(envPort) } : undefined,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // NO activar el service worker en `npm run dev`: cacheaba la app y servía
      // versiones viejas al iterar (sobre todo en móvil por LAN). El SW solo
      // se genera en el build de producción, donde sí queremos offline.
      devOptions: {
        enabled: false,
      },
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Quest — Tareas RPG',
        short_name: 'Quest',
        description:
          'Gestor de tareas con progresión tipo RPG: XP, niveles y rachas. Offline-first.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
