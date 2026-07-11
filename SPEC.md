# Prompt maestro: App de gestión de tareas con progresión tipo RPG (enfoque TDAH)

> **Cómo usar este prompt:** Es una especificación completa. No pidas todo de golpe. Dáselo a la IA como contexto general y luego construye **fase por fase** siguiendo el orden de construcción del final. En cada fase, pídele el código completo de esa fase y pruébalo antes de seguir.

---

## 1. Rol y objetivo

Actúa como un ingeniero full-stack senior especializado en aplicaciones web modernas, offline-first y con excelente diseño de producto. Vamos a construir, paso a paso, una **aplicación de gestión de tareas con temática de progresión tipo videojuego RPG**.

La app debe funcionar como **PWA (Progressive Web App)**: instalable y usable como app nativa tanto en **Windows** (Edge/Chrome) como en **móvil** (iPhone y Android), desde una única base de código.

Prioriza: código limpio, componentes reutilizables, tipado estricto, rendimiento y una experiencia offline-first. Explica tus decisiones de arquitectura de forma breve cuando sean relevantes.

---

## 2. Usuario objetivo y principios de diseño (TDAH)

La app está diseñada para personas con TDAH. Aplica estos principios en **todas** las decisiones de UX:

- **Fricción mínima para capturar:** añadir una tarea debe tomar 1–2 toques. Botón de "añadir rápido" siempre visible.
- **Reducir el abrumamiento:** por defecto mostrar solo lo relevante (vista "Hoy" / foco). Nada de pantallas saturadas.
- **Memoria externalizada:** recordatorios y progreso siempre visibles.
- **Recompensa inmediata:** feedback visual y sonoro satisfactorio al completar cada tarea (el bucle de dopamina del RPG).
- **No punitivo:** las tareas vencidas o no hechas **no** generan culpa ni penalizaciones agresivas. Reprogramar debe ser trivial.
- **Chunking:** fomentar dividir tareas grandes en subtareas.
- **Codificación por color** para reconocimiento rápido.
- **Modo foco / estudio** opcional (una sola cosa a la vez, sin distracciones).

---

## 3. Plataformas y arquitectura de compatibilidad

- **Formato:** PWA instalable (con `manifest.json` y `service worker`).
- **Windows:** debe instalarse y funcionar desde Edge/Chrome como app de escritorio.
- **Móvil (iOS/Android):** instalable en la pantalla de inicio, comportándose como app nativa (pantalla completa, ícono, splash).
- **Offline-first:** la app debe ser totalmente funcional sin conexión. Los cambios se guardan localmente al instante y se sincronizan con la nube cuando hay conexión.
- **Responsive:** layout adaptable de móvil a escritorio (mobile-first, luego breakpoints).

---

## 4. Stack técnico

- **Frontend:** React + TypeScript + Vite.
- **Estilos:** Tailwind CSS.
- **Almacenamiento local:** Dexie.js sobre IndexedDB (datos estructurados + imágenes/adjuntos como blobs).
- **Nube (auth, base de datos, storage, sync):** Supabase (Postgres + Auth + Storage).
- **PWA:** service worker (usa `vite-plugin-pwa` o Workbox) + Web App Manifest.
- **Gráficas:** Recharts (o Chart.js) para el reporte de productividad.
- **Audio:** Web Audio API / HTML5 Audio para efectos de sonido (feedback ASMR al completar tareas, sonidos del temporizador Pomodoro, sonidos ambientales). Todos los sonidos deben ser **opcionales**, con toggle y control de volumen.
- **Notificaciones:** implementa una capa de notificaciones abstraída (`NotificationService`) que use recordatorios in-app + Web Push/Notifications API donde esté disponible. Estructúrala para poder cambiar a notificaciones nativas (Capacitor) en el futuro sin reescribir la lógica de negocio.

Requisito de arquitectura: **local-first con sincronización**. La fuente de verdad inmediata es la base de datos local (Dexie); Supabase es la capa de sincronización y respaldo. Resuelve conflictos con "última escritura gana" basada en `updated_at`, y marca los registros con estado de sync (`pending`, `synced`).

---

## 5. Almacenamiento y datos

- **Local:** todo se guarda en IndexedDB vía Dexie para funcionamiento offline. Las imágenes adjuntas se guardan como blobs locales.
- **Nube:** al iniciar sesión (Supabase Auth, email/contraseña + opción magic link), los datos sincronizan a Postgres y los archivos a Supabase Storage, permitiendo usar la app en varios dispositivos.
- **Modo sin cuenta:** la app debe ser 100% usable **sin registrarse** (solo local). El login es opcional y solo activa la sincronización multi-dispositivo.
- **Exportar/Importar:** permite exportar todos los datos a un archivo JSON y reimportarlos (respaldo local manual).

---

## 6. Funcionalidades

### Tareas
- Crear, editar, completar, eliminar, renombrar.
- Título, descripción (notas), fecha/hora programada, prioridad.
- **Color propio** por tarea (selector de color).
- **Subtareas** (checklist anidada dentro de una tarea).
- **Comentarios** (registro con marca de tiempo).
- **Adjuntos:** subir imágenes/archivos a una tarea (con previsualización de imágenes).
- **Etiquetas** con color, renombrables, reutilizables entre tareas.
- **Programación** de tareas para fechas/horas futuras.

### Recurrencia
- Repetir tarea cada X **días / semanas / meses / años**, con intervalo configurable.
- Opción de fin de recurrencia (nunca / después de N veces / hasta fecha).

### Recordatorios
- Elegir **hora y día exactos** del recordatorio.
- Múltiples recordatorios por tarea y **cantidad de veces / repetición** del aviso.
- Recordatorios in-app garantizados; push/notificación del sistema donde la plataforma lo permita.

### Listas / categorías
- Crear **sublistas o categorías** (ej. Hogar, Finanzas, Trabajo) para organizar tareas.
- Renombrar, colorear y reordenar listas.
- Vistas: **Hoy**, **Próximas**, **Todas**, por lista, y por etiqueta.

---

## 7. Sistema de progresión RPG (gamificación)

Este es el corazón diferenciador. Implementa un sistema motivacional, no punitivo:

- **XP por tarea:** completar una tarea otorga puntos de experiencia. El XP se pondera por prioridad/dificultad (ej. baja = 10, media = 25, alta = 50). Las subtareas dan XP menor.
- **Niveles:** el XP acumulado sube de nivel. Usa una curva creciente (cada nivel requiere más XP que el anterior, ej. fórmula tipo `xpNecesario = base * nivel^1.5`).
- **Barra de progreso** prominente que se llena hacia el siguiente nivel.
- **Animación de "level up"** satisfactoria y refinada (no infantil): destello sutil, transición suave, feedback háptico en móvil si es posible.
- **Feedback de sonido (ASMR):** al completar una tarea, reproduce un sonido corto, satisfactorio y relajante tipo ASMR (ej. un "pop" orgánico, campanita suave, click nítido). Incluye **varios sonidos seleccionables**. Debe ser **opcional** (toggle) y con control de volumen, ya que algunas personas con TDAH lo encuentran muy motivador y otras distractor. Un sonido especial y más gratificante para el momento de subir de nivel.
- **Rachas (streaks):** días consecutivos completando al menos una tarea. Mostrar la racha, pero **sin castigar** al romperla (mensaje amable, no culpabilizador).
- **Atributos/Stats por categoría:** cada lista/categoría puede funcionar como un "atributo" RPG (ej. Hogar, Finanzas, Cuerpo) que sube de nivel independientemente según las tareas completadas en ella. Esto da la sensación de un personaje que crece en varias áreas de la vida.
- **Logros/insignias** opcionales por hitos (primera tarea, 7 días de racha, 100 tareas completadas, primera hora de estudio, etc.).

Todo el sistema debe reforzar el progreso y el momentum, nunca generar ansiedad por lo pendiente.

---

## 8. Modo estudio (temporizador Pomodoro)

Un modo de estudio/foco concentrado basado en la técnica Pomodoro, pensado para sostener la atención:

- **Temporizador Pomodoro** con ciclos de foco y descanso.
- **Duraciones totalmente ajustables:** tiempo de foco (por defecto 25 min), descanso corto (por defecto 5 min), descanso largo (por defecto 15 min) y cada cuántos pomodoros ocurre un descanso largo (por defecto cada 4). El usuario puede cambiar todos estos valores.
- Controles: **iniciar / pausar / reanudar / reiniciar / saltar** fase.
- **Sonido y notificación** al terminar cada fase (foco → descanso y descanso → foco). Sonidos opcionales y con volumen ajustable.
- **Sonidos ambientales/ASMR de fondo** opcionales durante el foco (ej. lluvia, ruido blanco, cafetería), reproducibles en bucle.
- Vincular opcionalmente cada sesión a una **tarea o categoría** concreta, para saber en qué se estudió.
- **Registro de tiempo efectivo:** guarda automáticamente los **minutos de foco realmente completados cada día** (solo cuenta el tiempo de foco real; no cuenta descansos ni pausas). Este dato diario alimenta el reporte de productividad (sección 9).
- **Precisión en segundo plano:** el temporizador debe contar el tiempo correctamente aunque la pantalla se apague o la app pase a segundo plano. Usa marcas de tiempo (timestamps) reales, no solo `setInterval`, para calcular el tiempo transcurrido.
- **Integración RPG:** completar sesiones de estudio también otorga XP (ponderado por minutos de foco), alimentando el nivel y los stats.
- **Interfaz de foco minimalista:** durante la sesión, pantalla limpia y sin distracciones, mostrando solo el temporizador y la tarea en curso.

---

## 9. Reportes y gráficas de productividad

Un panel de estadísticas con **gráficas claras, atractivas y consistentes** con la estética de la app:

- **Resumen rápido** en la parte superior: total de tareas completadas, racha actual, tiempo total estudiado y nivel actual.
- **Métricas y gráficas:**
  - Tareas completadas por día / semana / mes (gráfica de barras).
  - **Tiempo efectivo de estudio** por día / semana (gráfica de barras), tomado del modo estudio.
  - XP ganado y evolución del nivel a lo largo del tiempo (gráfica de líneas).
  - Historial de rachas.
  - Productividad por lista/categoría — los "atributos" RPG (gráfica de radar o barras).
  - Distribución de tareas por prioridad o etiqueta.
- **Rangos de tiempo seleccionables:** día, semana, mes y rango personalizado.
- Todo se calcula desde los datos locales y debe **funcionar offline**.
- Usa el **color de acento** del tema actual en las gráficas para mantener coherencia visual.

---

## 10. Temas y personalización visual

- **Modo claro y oscuro.**
- **Color de acento** personalizable por el usuario.
- Varios **temas** predefinidos seleccionables (paletas), más la opción de color de acento libre.
- La personalización de tema debe aplicarse de forma global e instantánea (usa CSS variables / tokens de diseño).
- Persistir la preferencia de tema localmente.
- **Ajustes de sonido:** panel para activar/desactivar sonidos (completar tareas, Pomodoro, ambientales), elegir el sonido de completado y ajustar el volumen.

---

## 11. Dirección de diseño

Estética objetivo: **minimalista, limpia, moderna, refinada y creativa** — al nivel de pulido de un producto Apple de última generación.

- Mucho **espacio en blanco**, jerarquía visual clara.
- **Esquinas redondeadas** suaves, profundidad sutil (sombras ligeras, sin skeuomorfismo).
- **Tipografía** refinada y legible (usa una fuente moderna tipo Inter o similar).
- **Micro-animaciones** fluidas y con propósito (transiciones, feedback al completar, level-up, temporizador). Suaves, nunca chillonas.
- Considera acentos de **efecto glass/translúcido** modernos donde aporten.
- Paleta base restringida + un color de acento; nada de saturación excesiva.
- La interfaz debe sentirse ligera, rápida y agradable de usar a diario.

---

## 12. Modelo de datos sugerido

Define estas entidades (ajusta según convenga), tanto en Dexie como en Postgres:

- **User** (id, email, preferencias).
- **List/Category** (id, nombre, color, orden, statLevel, statXp).
- **Task** (id, listId, título, notas, color, prioridad, dueAt, completed, completedAt, recurrenceRule, xpValue, createdAt, updatedAt, syncStatus).
- **Subtask** (id, taskId, título, completed, orden).
- **Comment** (id, taskId, texto, createdAt).
- **Attachment** (id, taskId, tipo, blob/ruta local, urlNube).
- **Tag** (id, nombre, color) + relación Task↔Tag.
- **Reminder** (id, taskId, remindAt, repeat, count).
- **PlayerProfile** (id, level, totalXp, streakCount, lastActiveDate, achievements[]).
- **StudySession** (id, taskId?, listId?, startedAt, endedAt, focusMinutes, tipo: foco/descanso, completed) — base para el tiempo efectivo de estudio.
- **DailyStats** (fecha, tasksCompleted, xpEarned, focusMinutes, streakActive) — puede almacenarse o derivarse de las demás entidades para las gráficas.
- **Settings** (theme, accentColor, soundEnabled, soundVolume, completionSound, ambientSound, pomodoroFocusMin, pomodoroShortBreak, pomodoroLongBreak, longBreakInterval).

---

## 13. Requisitos no funcionales

- **Offline-first real:** cero dependencia de red para las operaciones básicas.
- **Rendimiento:** interacciones instantáneas; nada de esperas al añadir/completar tareas.
- **Accesibilidad:** contraste adecuado, tamaños táctiles cómodos, navegación por teclado en escritorio.
- **Código:** TypeScript estricto, componentes pequeños y reutilizables, lógica de negocio separada de la UI.

---

## 14. Orden de construcción (por fases)

Construye la app en este orden. Entrega el código funcional de cada fase antes de pasar a la siguiente:

1. **Fase 1 — Base:** proyecto Vite + React + TS + Tailwind + configuración PWA (manifest + service worker). App instalable vacía en Windows y móvil.
2. **Fase 2 — Tareas y listas (local):** CRUD de tareas y listas/categorías con Dexie. Vistas Hoy / Todas / por lista. Subtareas y colores de tarea.
3. **Fase 3 — RPG:** sistema de XP, niveles, barra de progreso, animación de level-up, stats por categoría, rachas y **sonido ASMR al completar** tareas.
4. **Fase 4 — Detalles de tarea:** comentarios, adjuntos de imágenes (local), etiquetas con color.
5. **Fase 5 — Tiempo:** programación, recurrencia y recordatorios (in-app + push donde aplique).
6. **Fase 6 — Modo estudio:** temporizador Pomodoro ajustable, descansos, sonidos/ambiente y registro de tiempo efectivo diario.
7. **Fase 7 — Reportes:** panel de gráficas de productividad (tareas, XP, rachas, tiempo de estudio, stats por categoría).
8. **Fase 8 — Temas y sonido:** modo claro/oscuro, color de acento, temas predefinidos y ajustes de sonido/volumen.
9. **Fase 9 — Nube y sync:** Supabase Auth + sincronización de datos y storage de archivos. Exportar/importar JSON.
10. **Fase 10 — Pulido:** micro-animaciones, modo foco, accesibilidad y optimización de rendimiento.

---

## 15. Formato de entrega esperado

- Entrega código completo y ejecutable por fase (no fragmentos sueltos).
- Indica los comandos de instalación y ejecución.
- Explica brevemente cómo probar cada funcionalidad al terminar cada fase.
- Señala cualquier configuración externa necesaria (ej. claves de Supabase) y dónde va.
