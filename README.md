# Quest — Tareas RPG (PWA)

Gestor de tareas con progresión tipo RPG, diseñado para personas con TDAH. Offline-first, instalable como app en Windows y móvil.

## Comandos

```bash
npm install       # dependencias
npm run dev       # servidor de desarrollo → http://localhost:5173
npm run build     # build de producción (dist/)
npm run preview   # sirve el build de producción
```

## Funcionalidades

- **Tareas y listas**: CRUD completo, subtareas, colores, prioridades, notas, comentarios, adjuntos de imágenes/archivos y etiquetas reutilizables. Vistas: Hoy, Próximas, Todas, por lista y por etiqueta.
- **Tiempo**: fecha y hora programadas, recurrencia (cada X días/semanas/meses/años con fin configurable) y recordatorios múltiples con repetición del aviso (in-app + notificaciones del sistema).
- **RPG**: XP por prioridad, niveles con curva creciente, stats por lista, rachas no punitivas, sonidos ASMR sintetizados y animación de level-up.
- **Modo estudio**: Pomodoro ajustable con sonidos ambientales (lluvia/ruido), registro de minutos de foco reales (timestamps, funciona en segundo plano) y XP por minuto.
- **Reportes**: gráficas de tareas, foco, XP, prioridades, etiquetas, atributos por lista y rachas, con rangos semana/mes/año/personalizado. Todo offline.
- **Temas**: claro/oscuro/sistema y color de acento personalizable al instante.
- **Datos**: exportar/importar respaldo JSON. Sin cuenta, todo vive en IndexedDB (Dexie).

## Sincronización en la nube (opcional)

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, ejecuta [`supabase/schema.sql`](supabase/schema.sql).
3. Copia `.env.example` a `.env.local` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Dashboard → Settings → API).
4. Reinicia `npm run dev`. Crea tu cuenta desde Ajustes → Cuenta y sincronización.

La sincronización es local-first: Dexie es la fuente de verdad, la nube es respaldo/multi-dispositivo, conflictos por "última escritura gana". Los ajustes (tema/sonido) no se sincronizan: son por dispositivo.

## Instalar como PWA

- **Windows (Edge/Chrome)**: abre la app → icono de instalación en la barra de direcciones → Instalar.
- **Android (Chrome)**: menú ⋮ → "Añadir a pantalla de inicio".
- **iPhone (Safari)**: Compartir → "Añadir a pantalla de inicio".

## Stack

Vite + React 19 + TypeScript estricto · Tailwind CSS v4 · Dexie (IndexedDB) · vite-plugin-pwa (Workbox) · Recharts · Web Audio API · Supabase (auth + Postgres + Storage).
