import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/db'
import type { List, Tag } from './db/types'
import type { View } from './lib/view'
import { startOfDayOffset, startOfToday } from './lib/dates'
import { sortCompleted, sortPending } from './lib/taskSort'
import { createTask } from './db/repo/tasks'
import { getOrCreateTag } from './db/repo/tags'
import { onCompletion } from './lib/events'
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
import { SettingsModal } from './components/settings/SettingsModal'
import { AccountModal } from './components/account/AccountModal'
import { ToastStack } from './components/ui/ToastStack'
import { StudyView } from './components/study/StudyView'
import { MiniTimer } from './components/study/MiniTimer'
import { CalendarView } from './components/calendar/CalendarView'
import { QuestsView } from './components/quests/QuestsView'
import { WeeklyQuestBanner } from './components/quests/WeeklyQuestBanner'
import { HabitsView } from './components/habits/HabitsView'
import { HabitsToday } from './components/habits/HabitsToday'
import { pomodoro } from './services/pomodoro'

// Recharts es pesado: se carga solo al entrar a Estadísticas.
const StatsView = lazy(() => import('./components/stats/StatsView'))

type ListModalState = { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; listId: string }

export default function App() {
  const [view, setView] = useState<View>({ kind: 'today' })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [listModal, setListModal] = useState<ListModalState>({ mode: 'closed' })
  const [editTagId, setEditTagId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [levelUp, setLevelUp] = useState<number | null>(null)

  const settings = useSettings()
  const { level, intoLevel, needed, streak } = useProfile()
  const isDesktop = useIsDesktop()

  // Servicios de fondo: recordatorios y sincronización (si está configurada).
  useEffect(() => {
    startReminderScheduler()
    startAutoSync()
  }, [])

  // Al cambiar de pestaña, volver al inicio (no quedar a media página, sobre todo en móvil).
  useEffect(() => {
    window.scrollTo(0, 0)
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
  const bgUrl = useBlurredBackground(settings.bgImage, settings.bgBlur)

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

  const counts = useMemo(() => {
    const byList: Record<string, number> = {}
    const byTag: Record<string, number> = {}
    for (const t of pending) {
      if (t.listId) byList[t.listId] = (byList[t.listId] ?? 0) + 1
      for (const tagId of t.tagIds) byTag[tagId] = (byTag[tagId] ?? 0) + 1
    }
    return {
      today: pending.filter((t) => t.dueAt !== null && t.dueAt < tomorrow).length,
      upcoming: pending.filter((t) => t.dueAt !== null && t.dueAt >= tomorrow).length,
      all: pending.length,
      byList,
      byTag,
    }
  }, [pending, tomorrow])

  const currentList: List | undefined = view.kind === 'list' ? listsById.get(view.listId) : undefined
  const currentTag: Tag | undefined = view.kind === 'tag' ? tagsById.get(view.tagId) : undefined
  const isTaskView = ['today', 'upcoming', 'all', 'list', 'tag'].includes(view.kind)
  // Calendario y estadísticas aprovechan más ancho.
  const contentMax = view.kind === 'calendar' || view.kind === 'stats' ? 'max-w-5xl' : 'max-w-2xl'

  async function handleQuickAdd(parsed: QuickParseResult) {
    // Etiquetas detectadas en el texto (#tag) + la de la vista actual.
    const tagIds = view.kind === 'tag' ? [view.tagId] : []
    for (const name of parsed.tagNames) tagIds.push(await getOrCreateTag(name))
    await createTask({
      title: parsed.title,
      listId: view.kind === 'list' ? view.listId : null,
      tagIds: [...new Set(tagIds)],
      // Lo detectado en el texto manda; si no hay nada, aplica el default de la vista.
      dueAt: parsed.dueAt ?? (view.kind === 'today' ? sod : view.kind === 'upcoming' ? tomorrow : null),
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
  }[] = []

  if (view.kind === 'today') {
    sections = [
      {
        key: 'overdue',
        title: 'De días anteriores',
        tasks: sortPending(pending.filter((t) => t.dueAt !== null && t.dueAt < sod)),
        showMoveToToday: true,
      },
      {
        key: 'today',
        title: 'Hoy',
        tasks: sortPending(pending.filter((t) => t.dueAt !== null && t.dueAt >= sod && t.dueAt < tomorrow)),
      },
      {
        key: 'done',
        title: 'Completadas hoy',
        tasks: sortCompleted(tasks.filter((t) => t.completed && (t.completedAt ?? 0) >= sod)),
        collapsible: true,
      },
    ]
  } else if (view.kind === 'upcoming') {
    sections = [
      {
        key: 'future',
        title: 'Programadas',
        tasks: sortPending(pending.filter((t) => t.dueAt !== null && t.dueAt >= tomorrow)),
      },
      {
        key: 'nodate',
        title: 'Sin fecha',
        tasks: sortPending(pending.filter((t) => t.dueAt === null)),
        collapsible: true,
      },
    ]
  } else if (view.kind === 'all') {
    sections = [
      { key: 'pending', tasks: sortPending(pending) },
      {
        key: 'done',
        title: 'Completadas',
        tasks: sortCompleted(tasks.filter((t) => t.completed)).slice(0, 100),
        collapsible: true,
      },
    ]
  } else if (view.kind === 'list') {
    sections = [
      { key: 'pending', tasks: sortPending(pending.filter((t) => t.listId === view.listId)) },
      {
        key: 'done',
        title: 'Completadas',
        tasks: sortCompleted(tasks.filter((t) => t.completed && t.listId === view.listId)).slice(0, 100),
        collapsible: true,
      },
    ]
  } else if (view.kind === 'tag') {
    sections = [
      { key: 'pending', tasks: sortPending(pending.filter((t) => t.tagIds.includes(view.tagId))) },
      {
        key: 'done',
        title: 'Completadas',
        tasks: sortCompleted(tasks.filter((t) => t.completed && t.tagIds.includes(view.tagId))).slice(0, 100),
        collapsible: true,
      },
    ]
  }

  const isEmpty = sections.every((s) => s.tasks.length === 0)
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

      {/* Drawer móvil */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line/5 glass-strong p-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl">
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
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {currentList && (
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: currentList.color }} aria-hidden="true" />
              )}
              {currentTag && (
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: currentTag.color }} aria-hidden="true" />
              )}
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-ink">{viewTitle}</h1>
                {isTaskView && (
                  <p className="text-xs text-ink-faint">
                    {pendingInView === 0 ? 'Sin pendientes' : `${pendingInView} pendiente${pendingInView === 1 ? '' : 's'}`}
                    {currentList && currentList.statLevel > 1 && ` · Nv ${currentList.statLevel}`}
                  </p>
                )}
              </div>
            </div>
            {currentList && (
              <button
                onClick={() => setListModal({ mode: 'edit', listId: currentList.id })}
                aria-label="Editar lista"
                className="flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4.5" aria-hidden="true">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
            )}
          </div>
          {/* Barra de XP compacta en móvil (en escritorio vive en la sidebar) */}
          <div className={`mx-auto w-full ${contentMax} px-4 pb-3 sm:px-6 lg:hidden`}>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-accent-500/15 px-1.5 py-0.5 text-[11px] font-bold text-accent-300">
                Nv {level}
              </span>
              <div
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/5"
                role="progressbar"
                aria-valuenow={intoLevel}
                aria-valuemax={needed}
                aria-label={`Progreso al nivel ${level + 1}`}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-600 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.round((intoLevel / needed) * 100))}%` }}
                />
              </div>
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
              {/* Hábitos que tocan hoy, con su barra de progreso y COMBO */}
              <HabitsToday onManage={() => setView({ kind: 'habits' })} />
              {isEmpty ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl glass-panel text-3xl">☀️</div>
                  <p className="font-medium text-ink-dim">Nada para hoy</p>
                  <p className="max-w-xs text-sm text-ink-faint">
                    Añade una tarea abajo y empieza a ganar terreno, una a la vez.
                  </p>
                </div>
              ) : (
                sections.map((s) => (
                  <TaskSection
                    key={`${JSON.stringify(view)}-${s.key}`}
                    title={s.title}
                    tasks={s.tasks}
                    listsById={listsById}
                    tagsById={tagsById}
                    onOpen={setDetailId}
                    collapsible={s.collapsible}
                    showMoveToToday={s.showMoveToToday}
                  />
                ))
              )}
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
            sections.map((s) => (
              <TaskSection
                key={`${JSON.stringify(view)}-${s.key}`}
                title={s.title}
                tasks={s.tasks}
                listsById={listsById}
                tagsById={tagsById}
                onOpen={setDetailId}
                collapsible={s.collapsible}
                showMoveToToday={s.showMoveToToday}
              />
            ))
          )}
        </main>

        {isTaskView && (
          <div className="sticky bottom-0 z-10">
            <div className="mx-auto w-full max-w-2xl px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
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
          className="sticky top-0 hidden h-dvh w-[400px] shrink-0 overflow-y-auto border-l border-line/10 glass-bar lg:block"
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
