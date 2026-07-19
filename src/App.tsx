import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import type { List, Tag } from './db/types'
import type { View } from './lib/view'
import { startOfDayOffset, startOfToday } from './lib/dates'
import { sortCompleted, sortPending, TASK_SORT_OPTIONS, type TaskSortMode } from './lib/taskSort'
import { levelFromXp, STAT_XP_BASE } from './lib/level'
import { SortMenu } from './components/ui/SortMenu'
import { createTask, rollOverdueRecurringTasks } from './db/repo/tasks'
import { getOrCreateTag } from './db/repo/tags'
import { emitConfigOpened, onCompletion, onConfigOpened } from './lib/events'
import type { QuickParseResult } from './lib/quickParse'
import { playCompletion, playLevelUp } from './lib/sound'
import { applyTheme } from './lib/theme'
import { useProfile } from './lib/useProfile'
import { useSettings } from './lib/useSettings'
import { startReminderScheduler } from './services/reminderScheduler'
import { startAutoSync } from './services/sync'
import { Sidebar } from './components/layout/Sidebar'
import { QuickAdd } from './components/tasks/QuickAdd'
import { TaskSection } from './components/tasks/TaskSection'
import { TaskDetail, TaskDetailContent } from './components/tasks/TaskDetail'
import { useIsDesktop } from './lib/useMediaQuery'
import { useBlurredBackground } from './lib/useBlurredBackground'
import { ListModal } from './components/lists/ListModal'
import { TagModal } from './components/tags/TagModal'
import { LevelUpToast } from './components/rpg/LevelUpToast'
import { LiquidSun } from './components/rpg/LiquidSun'
import { useXpGain } from './components/rpg/PlayerCard'
import { SettingsModal } from './components/settings/SettingsModal'
import { AccountModal } from './components/account/AccountModal'
import { ToastStack } from './components/ui/ToastStack'
import { StudyView } from './components/study/StudyView'
import { MiniTimer } from './components/study/MiniTimer'
import { CalendarView } from './components/calendar/CalendarView'
import { QuestsView } from './components/quests/QuestsView'
import { WeeklyQuestBanner } from './components/quests/WeeklyQuestBanner'
import { HabitsView } from './components/habits/HabitsView'
import { HabitsToday, useTodayHabits } from './components/habits/HabitsToday'
import { pomodoro } from './services/pomodoro'

// Recharts es pesado: se carga solo al entrar a Estadísticas.
const StatsView = lazy(() => import('./components/stats/StatsView'))

type ListModalState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; listId: string }

// Trazos de cada vista (mismos que en el sidebar) para el icono del header.
const HEADER_ICON_PATHS: Partial<Record<View['kind'], React.ReactNode>> = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  quests: (
    <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3-.8V14a6 6 0 0 1-3 .8c-3 0-5-2-8-2a6 6 0 0 0-4 1.2" />
  ),
  habits: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  upcoming: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  all: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" />
    </>
  ),
  study: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </>
  ),
  stats: <path d="M3 3v18h18M8 17V9m5 8V5m5 12v-6" />,
}

/** Icono de la vista actual en el header (mismo lenguaje visual que el sidebar). */
function HeaderViewIcon({ kind }: { kind: View['kind'] }) {
  const paths = HEADER_ICON_PATHS[kind]
  if (!paths) return null
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-7 shrink-0 text-accent-400" aria-hidden="true">
      {paths}
    </svg>
  )
}

export default function App() {
  const [view, setView] = useState<View>({ kind: 'today' })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  // Criterio de orden de las tareas, recordado entre sesiones.
  const [taskSort, setTaskSort] = useState<TaskSortMode>(
    () => (localStorage.getItem('quest-task-sort') as TaskSortMode) || 'agenda',
  )
  function changeTaskSort(mode: TaskSortMode) {
    setTaskSort(mode)
    localStorage.setItem('quest-task-sort', mode)
  }

  // Solo un panel de configuración a la vez: al abrir el detalle de tarea se
  // avisa (cierra hojas de hábito) y viceversa.
  useEffect(() => {
    if (detailId) emitConfigOpened('task-detail')
  }, [detailId])
  useEffect(
    () =>
      onConfigOpened((d) => {
        if (d.source !== 'task-detail') setDetailId(null)
      }),
    [],
  )
  const [listModal, setListModal] = useState<ListModalState>({ mode: 'closed' })
  const [editTagId, setEditTagId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [levelUp, setLevelUp] = useState<number | null>(null)

  const settings = useSettings()
  const { level, intoLevel, needed, streak } = useProfile()
  const isDesktop = useIsDesktop()
  // Destello del XP recién ganado en la mini-barra del encabezado (móvil).
  const xpGain = useXpGain()
  // Hábitos que tocan hoy sin cumplir (incluye los que "lingerean" tras
  // completarse): cuentan para que la sección "Hoy" no se vea vacía.
  const pendingHabits = useTodayHabits().pendingHabits.length
  const headerPct = Math.min(100, Math.round((intoLevel / needed) * 100))
  const headerGainPct = xpGain ? Math.min(headerPct, Math.round((xpGain.xp / needed) * 100)) : 0

  // Servicios de fondo: recordatorios y sincronización (si está configurada).
  useEffect(() => {
    startReminderScheduler()
    startAutoSync()
  }, [])

  // Recurrentes atrasadas → saltan solas a su próxima ocurrencia desde hoy
  // (así las diarias siempre están en Hoy). Al abrir y cada 10 min por si la
  // app queda abierta cruzando la medianoche.
  useEffect(() => {
    void rollOverdueRecurringTasks()
    const t = setInterval(() => void rollOverdueRecurringTasks(), 10 * 60_000)
    return () => clearInterval(t)
  }, [])

  // Al cambiar de pestaña: volver al inicio y cerrar el detalle de tarea que
  // hubiera quedado abierto (en escritorio persistía entre pestañas).
  useEffect(() => {
    window.scrollTo(0, 0)
    setDetailId(null)
  }, [view])

  // Tema, acento y tinte del cristal globales e instantáneos (spec §10).
  useEffect(() => {
    applyTheme(settings.theme, settings.accentColor, settings.glassTint)
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => applyTheme(settings.theme, settings.accentColor, settings.glassTint)
    mq.addEventListener('change', listener)
    return () => mq.removeEventListener('change', listener)
  }, [settings.theme, settings.accentColor, settings.glassTint])

  // Fondo personalizado pre-difuminado (bitmap estático: no cuesta nada componerlo).
  const bgBlob = useLiveQuery(async () => (await db.appMedia.get('bg'))?.blob ?? null, []) ?? null
  const bgUrl = useBlurredBackground(bgBlob, settings.bgBlur)

  // Recompensa inmediata: sonido, vibración y celebración de level-up (spec §7).
  useEffect(
    () =>
      onCompletion((d) => {
        if (settings.soundEnabled) {
          if (d.leveledUp) playLevelUp(settings.soundVolume)
          else playCompletion(settings.completionSound, settings.soundVolume)
        }
        if (d.leveledUp) {
          setLevelUp(d.newLevel)
          navigator.vibrate?.([30, 40, 80])
        }
      }),
    [settings],
  )

  const listsRaw = useLiveQuery(() => db.lists.orderBy('order').toArray(), [])
  const tasksRaw = useLiveQuery(() => db.tasks.toArray(), [])
  const tagsRaw = useLiveQuery(() => db.tags.orderBy('name').toArray(), [])
  const lists = useMemo(() => listsRaw ?? [], [listsRaw])
  const tasks = useMemo(() => tasksRaw ?? [], [tasksRaw])
  const tags = useMemo(() => tagsRaw ?? [], [tagsRaw])

  const listsById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists])
  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags])

  // Si la lista/etiqueta activa se elimina, vuelve a "Hoy".
  useEffect(() => {
    if (view.kind === 'list' && listsRaw !== undefined && !listsById.has(view.listId)) {
      setView({ kind: 'today' })
    }
    if (view.kind === 'tag' && tagsRaw !== undefined && !tagsById.has(view.tagId)) {
      setView({ kind: 'today' })
    }
  }, [view, listsRaw, tagsRaw, listsById, tagsById])

  const sod = startOfToday()
  const tomorrow = startOfDayOffset(1)
  const pending = tasks.filter((t) => !t.completed)

  // Las tareas recién completadas se quedan unos segundos visibles en su lista
  // antes de bajar a Completadas (derivado en render, como los hábitos: un
  // efecto desmontaría la fila un frame y cortaría la transición).
  const [taskLinger, setTaskLinger] = useState<Set<string>>(new Set())
  const prevCompletedIds = useRef<Set<string> | null>(null)
  if (tasksRaw !== undefined) {
    const completedIds = new Set(tasks.filter((t) => t.completed).map((t) => t.id))
    if (prevCompletedIds.current === null) {
      prevCompletedIds.current = completedIds
    } else {
      const newly = [...completedIds].filter((id) => !prevCompletedIds.current!.has(id))
      prevCompletedIds.current = completedIds
      if (newly.length > 0) setTaskLinger((s) => new Set([...s, ...newly]))
    }
  }
  useEffect(() => {
    if (taskLinger.size === 0) return
    const t = setTimeout(() => setTaskLinger(new Set()), 2600)
    return () => clearTimeout(t)
  }, [taskLinger])
  // Para las listas en pantalla: las que "lingerean" siguen entre las pendientes.
  const displayPending = tasks.filter((t) => !t.completed || taskLinger.has(t.id))

  const counts = useMemo(() => {
    const byList: Record<string, number> = {}
    const byTag: Record<string, number> = {}
    for (const t of pending) {
      if (t.listId) byList[t.listId] = (byList[t.listId] ?? 0) + 1
      for (const tagId of t.tagIds) byTag[tagId] = (byTag[tagId] ?? 0) + 1
    }
    return {
      today: pending.filter((t) => t.dueAt !== null && t.dueAt >= sod && t.dueAt < tomorrow).length,
      upcoming: pending.filter((t) => t.dueAt !== null && t.dueAt >= tomorrow).length,
      all: pending.length,
      byList,
      byTag,
    }
  }, [pending, sod, tomorrow])

  const currentList: List | undefined = view.kind === 'list' ? listsById.get(view.listId) : undefined
  const currentTag: Tag | undefined = view.kind === 'tag' ? tagsById.get(view.tagId) : undefined
  const isTaskView = ['today', 'upcoming', 'all', 'list', 'tag'].includes(view.kind)
  // Escritorio: el área principal se centra (mx-auto en los contenedores) con un
  // tope de ~1280px, de modo que el espacio libre queda repartido a ambos lados
  // en vez de acumularse a la derecha. En móvil/tablet el w-full manda igual.
  const contentMax = 'max-w-7xl'

  async function handleQuickAdd(parsed: QuickParseResult) {
    // Etiquetas detectadas en el texto (#tag) + la de la vista actual.
    const tagIds = view.kind === 'tag' ? [view.tagId] : []
    for (const name of parsed.tagNames) tagIds.push(await getOrCreateTag(name))
    await createTask({
      title: parsed.title,
      listId: view.kind === 'list' ? view.listId : null,
      tagIds: [...new Set(tagIds)],
      // Lo detectado en el texto manda; si no hay nada, aplica el default de la
      // vista. Una tarea recurrente sin fecha no aparecería nunca en Hoy: se ancla a hoy.
      dueAt:
        parsed.dueAt ??
        (view.kind === 'today' || parsed.recurrenceRule !== null
          ? sod
          : view.kind === 'upcoming'
            ? tomorrow
            : null),
      dueHasTime: parsed.dueHasTime,
      recurrenceRule: parsed.recurrenceRule,
    })
  }

  let sections: {
    key: string
    title?: string
    tasks: ReturnType<typeof sortPending>
    collapsible?: boolean
    showMoveToToday?: boolean
    hideTodayChip?: boolean
  }[] = []

  // Una tarea completada que aún "lingerea" no cuenta como completada en pantalla.
  const settled = (t: (typeof tasks)[number]) => t.completed && !taskLinger.has(t.id)

  if (view.kind === 'today') {
    sections = [
      {
        // Hoy muestra SOLO lo de hoy: las tareas vencidas de días anteriores
        // no aparecen aquí (viven en "Todas", donde se pueden reprogramar).
        key: 'today',
        title: 'Hoy',
        tasks: sortPending(displayPending.filter((t) => t.dueAt !== null && t.dueAt >= sod && t.dueAt < tomorrow), taskSort),
        hideTodayChip: true,
      },
      {
        key: 'done',
        title: 'Completadas hoy',
        tasks: sortCompleted(tasks.filter((t) => settled(t) && (t.completedAt ?? 0) >= sod)),
        collapsible: true,
      },
    ]
  } else if (view.kind === 'upcoming') {
    sections = [
      {
        key: 'future',
        title: 'Programadas',
        tasks: sortPending(displayPending.filter((t) => t.dueAt !== null && t.dueAt >= tomorrow), taskSort),
      },
      {
        key: 'nodate',
        title: 'Sin fecha',
        tasks: sortPending(displayPending.filter((t) => t.dueAt === null), taskSort),
        collapsible: true,
      },
    ]
  } else if (view.kind === 'all') {
    const isOverdue = (t: (typeof displayPending)[number]) => t.dueAt !== null && t.dueAt < sod
    sections = [
      {
        // Categoría desplegable para las tareas atrasadas.
        key: 'overdue',
        title: 'Vencidas',
        tasks: sortPending(displayPending.filter(isOverdue), taskSort),
        collapsible: true,
        showMoveToToday: true,
      },
      { key: 'pending', tasks: sortPending(displayPending.filter((t) => !isOverdue(t)), taskSort) },
      {
        key: 'done',
        title: 'Completadas',
        tasks: sortCompleted(tasks.filter(settled)).slice(0, 100),
        collapsible: true,
      },
    ]
  } else if (view.kind === 'list') {
    sections = [
      { key: 'pending', tasks: sortPending(displayPending.filter((t) => t.listId === view.listId), taskSort) },
      {
        key: 'done',
        title: 'Completadas',
        tasks: sortCompleted(tasks.filter((t) => settled(t) && t.listId === view.listId)).slice(0, 100),
        collapsible: true,
      },
    ]
  } else if (view.kind === 'tag') {
    sections = [
      { key: 'pending', tasks: sortPending(displayPending.filter((t) => t.tagIds.includes(view.tagId)), taskSort) },
      {
        key: 'done',
        title: 'Completadas',
        tasks: sortCompleted(tasks.filter((t) => settled(t) && t.tagIds.includes(view.tagId))).slice(0, 100),
        collapsible: true,
      },
    ]
  }

  const isEmpty = sections.every((s) => s.tasks.length === 0)
  // El menú de orden se ancla a la fila del título de la primera sección con
  // tareas (p. ej. "Hoy"), como el de la vista de hábitos junto a "Activos".
  const firstSectionWithTasks = sections.findIndex((s) => s.tasks.length > 0)
  const taskSortMenu = (
    <SortMenu value={taskSort} options={TASK_SORT_OPTIONS} onChange={changeTaskSort} label="Ordenar tareas" />
  )
  const viewTitle =
    view.kind === 'today'
      ? 'Hoy'
      : view.kind === 'upcoming'
        ? 'Próximas'
        : view.kind === 'quests'
          ? 'Misiones'
          : view.kind === 'habits'
            ? 'Hábitos'
            : view.kind === 'calendar'
            ? 'Calendario'
            : view.kind === 'all'
              ? 'Todas'
              : view.kind === 'study'
                ? 'Pomodoro'
                : view.kind === 'stats'
                  ? 'Estadísticas'
                  : view.kind === 'list'
                    ? (currentList?.name ?? '')
                    : (currentTag?.name ?? '')

  // Descripción corta bajo el título (vistas RPG/herramienta que no llevan
  // contador de pendientes). Las vistas de tareas muestran su contador.
  const viewDescription =
    view.kind === 'quests'
      ? 'Acepta retos, completa tareas y gana experiencia.'
      : view.kind === 'habits'
        ? 'Construye rutinas y encadena tus combos.'
        : view.kind === 'calendar'
          ? 'Tus tareas organizadas por fecha.'
          : view.kind === 'study'
            ? 'Enfócate con sesiones de pomodoro.'
            : view.kind === 'stats'
              ? 'Tu progreso, tus rachas y tus récords.'
              : null

  const pendingInView =
    view.kind === 'today'
      ? counts.today
      : view.kind === 'upcoming'
        ? counts.upcoming
        : view.kind === 'all'
          ? counts.all
          : view.kind === 'list'
            ? (counts.byList[view.listId] ?? 0)
            : view.kind === 'tag'
              ? (counts.byTag[view.tagId] ?? 0)
              : 0

  const sidebar = (
    <Sidebar
      lists={lists}
      tags={tags}
      view={view}
      counts={counts}
      onSelect={(v) => {
        setView(v)
        setDrawerOpen(false)
      }}
      onNewList={() => {
        setListModal({ mode: 'new' })
        setDrawerOpen(false)
      }}
      onEditList={(id) => {
        setListModal({ mode: 'edit', listId: id })
        setDrawerOpen(false)
      }}
      onEditTag={(id) => {
        setEditTagId(id)
        setDrawerOpen(false)
      }}
      onOpenSettings={() => {
        setSettingsOpen(true)
        setDrawerOpen(false)
      }}
    />
  )

  return (
    <div className="flex min-h-dvh">
      {/* Fondo personalizado con difusión, detrás de todo. Sin imagen: manchas de
          color suaves con el acento/tinte, para que el cristal siempre se note. */}
      {!bgUrl && (
        // Manchas de luz con gradientes radiales (sin filter: blur, que iOS Safari
        // renderiza mal en áreas grandes y "rompía" el fondo al cambiar el tinte).
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-40 -left-40 size-[560px]"
            style={{
              background:
                'radial-gradient(circle closest-side, color-mix(in srgb, var(--t-accent-500) 26%, transparent), transparent)',
            }}
          />
          <div
            className="absolute top-1/3 -right-48 size-[600px]"
            style={{
              background:
                'radial-gradient(circle closest-side, color-mix(in srgb, var(--t-glass-tint) 30%, transparent), transparent)',
            }}
          />
          <div
            className="absolute bottom-[-200px] left-1/4 size-[540px]"
            style={{
              background:
                'radial-gradient(circle closest-side, color-mix(in srgb, var(--t-accent-400) 16%, transparent), transparent)',
            }}
          />
        </div>
      )}
      {bgUrl && (
        <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
          <img src={bgUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-surface-900/50" />
        </div>
      )}
      {/* Sidebar fija en escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-line/5 glass-bar p-3 lg:block">
        {sidebar}
      </aside>

      {/* Drawer móvil: ocupa toda la pantalla para máxima accesibilidad */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 h-dvh w-full glass-strong px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Cerrar menú"
              className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 flex size-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-6" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-line/5 glass-bar pt-[env(safe-area-inset-top)]">
          <div className={`mx-auto flex w-full ${contentMax} items-center gap-3 px-4 py-4 sm:px-6`}>
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menú"
              className="flex size-9 items-center justify-center rounded-lg text-ink-dim transition-colors hover:bg-ink/5 lg:hidden"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {currentList ? (
                <span
                  className={`size-3.5 shrink-0 rounded-full ${currentList.color ? '' : 'border-2 border-ink-muted'}`}
                  style={currentList.color ? { backgroundColor: currentList.color } : undefined}
                  aria-hidden="true"
                />
              ) : currentTag ? (
                <span className="size-3.5 shrink-0 rounded-full" style={{ backgroundColor: currentTag.color }} aria-hidden="true" />
              ) : (
                <HeaderViewIcon kind={view.kind} />
              )}
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-ink">{viewTitle}</h1>
                {isTaskView ? (
                  <p className="text-xs text-ink-faint">
                    {pendingInView === 0 ? 'Sin pendientes' : `${pendingInView} pendiente${pendingInView === 1 ? '' : 's'}`}
                  </p>
                ) : (
                  viewDescription && <p className="truncate text-xs text-ink-faint">{viewDescription}</p>
                )}
              </div>
            </div>
            {currentList && (
              <button
                onClick={() => setListModal({ mode: 'edit', listId: currentList.id })}
                aria-label="Editar lista"
                className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink lg:size-9"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 lg:size-4.5" aria-hidden="true">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
            )}
          </div>
          {/* Barra de nivel PROPIA de la lista: sube cuando cumples sus tareas/hábitos */}
          {currentList &&
            (() => {
              const stat = levelFromXp(currentList.statXp, STAT_XP_BASE)
              const color = currentList.color ?? 'var(--color-accent-500)'
              const pct = Math.min(100, Math.round((stat.intoLevel / stat.needed) * 100))
              return (
                <div className={`mx-auto w-full ${contentMax} px-4 pb-3 sm:px-6`}>
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` }}
                    >
                      Nv {stat.level}
                    </span>
                    <div
                      className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/5"
                      role="progressbar"
                      aria-valuenow={stat.intoLevel}
                      aria-valuemax={stat.needed}
                      aria-label={`Nivel de la lista ${currentList.name}`}
                    >
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                    <span className="shrink-0 text-[11px] text-ink-faint">
                      {stat.intoLevel}/{stat.needed} XP
                    </span>
                  </div>
                </div>
              )
            })()}
          {/* Barra de XP compacta en móvil (en escritorio vive en la sidebar) */}
          <div className={`mx-auto w-full ${contentMax} px-4 pb-3 sm:px-6 lg:hidden`}>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-accent-500/15 px-1.5 py-0.5 text-[11px] font-bold text-accent-300">
                Nv {level}
              </span>
              <div
                className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/5"
                role="progressbar"
                aria-valuenow={intoLevel}
                aria-valuemax={needed}
                aria-label={`Progreso al nivel ${level + 1}`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-600 transition-all duration-500"
                  style={{ width: `${headerPct}%` }}
                />
                {xpGain && headerGainPct > 0 && (
                  <div
                    key={xpGain.key}
                    className="absolute top-0 h-full rounded-full bg-white/80"
                    style={{
                      left: `${headerPct - headerGainPct}%`,
                      width: `${headerGainPct}%`,
                      animation: 'gain-flash 1.4s ease-out both',
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>
              {xpGain && (
                <span key={xpGain.key} className="text-[11px] font-bold text-accent-300" style={{ animation: 'xp-float 1.4s ease-out both' }}>
                  +{xpGain.xp}
                </span>
              )}
              {streak > 0 && <span className="text-[11px] font-medium text-warn">🔥 {streak}</span>}
            </div>
          </div>
        </header>

        <main className={`mx-auto w-full ${contentMax} flex-1 space-y-6 px-4 py-5 sm:px-6`}>
          {view.kind === 'quests' ? (
            <QuestsView />
          ) : view.kind === 'habits' ? (
            <HabitsView />
          ) : view.kind === 'calendar' ? (
            <CalendarView onOpenTask={setDetailId} />
          ) : view.kind === 'study' ? (
            <StudyView />
          ) : view.kind === 'stats' ? (
            <Suspense
              fallback={
                <div className="flex justify-center py-16">
                  <div className="size-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" aria-label="Cargando estadísticas" />
                </div>
              }
            >
              <StatsView />
            </Suspense>
          ) : view.kind === 'today' ? (
            <>
              {/* La misión de la semana destaca sobre las side quests (tareas normales) */}
              <WeeklyQuestBanner onOpen={() => setView({ kind: 'quests' })} />
              {isEmpty && pendingHabits === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  {/* El sol flota sobre una base de cristal líquido. El resplandor es un
                      gradiente radial (iOS rasteriza mal drop-shadow sobre SVG animado). */}
                  <div className="relative grid place-items-center py-1">
                    <div
                      className="absolute size-36 rounded-full"
                      style={{ background: 'radial-gradient(circle, rgba(255,132,0,0.30), transparent 65%)' }}
                      aria-hidden="true"
                    />
                    {/* Translucidez simple (sin backdrop-filter: en iOS lo pinta cuadrado) */}
                    <div
                      className="size-20 rounded-full"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--t-glass) 60%, transparent)',
                        boxShadow: 'inset 0 1px 0 0 color-mix(in srgb, #ffffff 8%, transparent)',
                      }}
                    />
                    <LiquidSun className="absolute size-32" />
                  </div>
                  <p className="font-medium text-ink-dim">Nada para hoy</p>
                  <p className="max-w-xs text-sm text-ink-faint">
                    Añade una tarea abajo y empieza a ganar terreno, una a la vez.
                  </p>
                </div>
              ) : (
                sections.map((s, i) => (
                  <TaskSection
                    key={`${JSON.stringify(view)}-${s.key}`}
                    title={s.title}
                    tasks={s.tasks}
                    listsById={listsById}
                    tagsById={tagsById}
                    onOpen={setDetailId}
                    collapsible={s.collapsible}
                    showMoveToToday={s.showMoveToToday}
                    hideTodayChip={s.hideTodayChip}
                    action={i === firstSectionWithTasks ? taskSortMenu : undefined}
                    // Los hábitos de hoy viven dentro de la propia sección "Hoy"
                    leading={
                      s.key === 'today' && pendingHabits > 0 ? <HabitsToday section="pending" /> : undefined
                    }
                  />
                ))
              )}
              {/* Los hábitos ya cumplidos bajan al fondo de la pestaña */}
              <HabitsToday section="completed" />
            </>
          ) : isEmpty ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl glass-panel text-3xl">✨</div>
              <p className="font-medium text-ink-dim">Sin tareas aún</p>
              <p className="max-w-xs text-sm text-ink-faint">
                Añade una tarea abajo y empieza a ganar terreno, una a la vez.
              </p>
            </div>
          ) : (
            sections.map((s, i) => (
              <TaskSection
                key={`${JSON.stringify(view)}-${s.key}`}
                title={s.title}
                tasks={s.tasks}
                listsById={listsById}
                tagsById={tagsById}
                onOpen={setDetailId}
                collapsible={s.collapsible}
                showMoveToToday={s.showMoveToToday}
                action={i === firstSectionWithTasks ? taskSortMenu : undefined}
              />
            ))
          )}
        </main>

        {isTaskView && (
          <div className="sticky bottom-0 z-10">
            <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              <QuickAdd
                placeholder={
                  view.kind === 'today'
                    ? 'Añadir tarea para hoy…'
                    : view.kind === 'upcoming'
                      ? 'Añadir tarea para mañana…'
                      : view.kind === 'list'
                        ? `Añadir a ${currentList?.name ?? 'la lista'}…`
                        : view.kind === 'tag'
                          ? `Añadir con #${currentTag?.name ?? 'etiqueta'}…`
                          : 'Añadir tarea…'
                }
                onAdd={handleQuickAdd}
              />
            </div>
          </div>
        )}
      </div>

      {/* Detalle de tarea en escritorio: panel lateral fijo (estilo To Do), todo queda visible */}
      {detailId && isDesktop && (
        <aside
          key={detailId}
          className="sticky top-0 hidden h-dvh w-[400px] shrink-0 overflow-y-auto border-l border-line/10 glass-bar lg:block"
          style={{ animation: 'slide-in-right 0.28s ease-out both' }}
          aria-label="Detalle de la tarea"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line/5 glass-strong px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">Detalles</h2>
            <button
              onClick={() => setDetailId(null)}
              aria-label="Cerrar detalle"
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-5" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-5">
            <TaskDetailContent taskId={detailId} onClose={() => setDetailId(null)} />
          </div>
        </aside>
      )}

      <ToastStack />
      {/* Mini-temporizador flotante mientras la sesión está minimizada (en Estudio ya se ve la tarjeta) */}
      {view.kind !== 'study' && (
        <MiniTimer
          onExpand={() => {
            pomodoro.setMinimized(false)
            setView({ kind: 'study' })
          }}
        />
      )}
      {detailId && !isDesktop && <TaskDetail taskId={detailId} onClose={() => setDetailId(null)} />}
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onOpenAccount={() => setAccountOpen(true)} />
      )}
      {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
      {levelUp !== null && <LevelUpToast level={levelUp} onDone={() => setLevelUp(null)} />}
      {editTagId && tagsById.get(editTagId) && (
        <TagModal tag={tagsById.get(editTagId)!} onClose={() => setEditTagId(null)} />
      )}
      {listModal.mode !== 'closed' && (
        <ListModal
          key={listModal.mode === 'edit' ? listModal.listId : 'new'}
          list={listModal.mode === 'edit' ? (listsById.get(listModal.listId) ?? null) : null}
          onClose={() => setListModal({ mode: 'closed' })}
        />
      )}
    </div>
  )
}
