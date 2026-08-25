import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Habit, Task } from '../../db/types'
import { createTask } from '../../db/repo/tasks'
import { formatDueTime } from '../../lib/dates'
import { isScheduledToday } from '../../lib/habits'
import { CheckCircleIcon } from '../ui/icons'
import { Modal } from '../ui/Modal'

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

const pad = (n: number) => String(n).padStart(2, '0')

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Entrada del calendario: unifica tareas y hábitos para pintarlos juntos en un
 * día. Los hábitos se expanden por sus días programados; `completed` sale de si
 * hay registro de cumplimiento ese día (con su hora en `completedAt`).
 */
export interface CalEntry {
  id: string
  kind: 'task' | 'habit'
  title: string
  color: string | null
  completed: boolean
  completedAt: number | null
  /** Hora programada (ms) para ordenar/mostrar pendientes; null = sin hora. */
  time: number | null
  hasTime: boolean
}

function monthLabel(ms: number): string {
  const label = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(ms)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

interface CalendarViewProps {
  onOpenTask: (id: string) => void
}

/** Calendario de scroll continuo: los meses se cargan al bajar; "Ir a hoy" flota siempre. */
export function CalendarView({ onOpenTask }: CalendarViewProps) {
  // Rango de meses renderizados alrededor del actual.
  const [range, setRange] = useState({ back: 0, forward: 5 })
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [mode, setMode] = useState<'month' | 'agenda'>(() =>
    localStorage.getItem('calendar-view-mode') === 'agenda' ? 'agenda' : 'month',
  )
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? []
  const habits = useLiveQuery(() => db.habits.toArray(), []) ?? []
  const habitLogs = useLiveQuery(() => db.habitLogs.toArray(), []) ?? []
  const lists = useLiveQuery(() => db.lists.toArray(), [])

  useEffect(() => {
    localStorage.setItem('calendar-view-mode', mode)
  }, [mode])

  // Color efectivo de la tarea, igual que en la lista de tareas: el suyo manda
  // y, si no tiene, hereda el de su lista.
  const colorOf = useMemo(() => {
    const byId = new Map((lists ?? []).map((l) => [l.id, l.color]))
    return (t: Task) => t.color ?? (t.listId ? (byId.get(t.listId) ?? null) : null)
  }, [lists])

  // Color del hábito: hereda el de su lista (atributo RPG), si tiene.
  const habitColorOf = useMemo(() => {
    const byId = new Map((lists ?? []).map((l) => [l.id, l.color]))
    return (h: Habit) => (h.listId ? (byId.get(h.listId) ?? null) : null)
  }, [lists])

  // Registro de cumplimiento por hábito+día: 'habitId|YYYY-MM-DD' → hora (ms|null).
  const habitLogByKey = useMemo(() => {
    const map = new Map<string, number | null>()
    for (const l of habitLogs) map.set(`${l.habitId}|${l.dateKey}`, l.completedAt ?? null)
    return map
  }, [habitLogs])

  const currentMonthRef = useRef<HTMLElement>(null)
  const todayRowRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef<number | null>(null)

  const months = useMemo(() => {
    const base = new Date()
    base.setHours(0, 0, 0, 0)
    base.setDate(1)
    return Array.from({ length: range.back + 1 + range.forward }, (_, i) => {
      const d = new Date(base)
      d.setMonth(d.getMonth() + (i - range.back))
      return d.getTime()
    })
  }, [range])

  const entriesByDay = useMemo(() => {
    const map = new Map<string, CalEntry[]>()
    const push = (key: string, e: CalEntry) => {
      const arr = map.get(key)
      if (arr) arr.push(e)
      else map.set(key, [e])
    }

    // Tareas: en el día de su vencimiento.
    for (const t of tasks) {
      if (t.dueAt === null) continue
      push(dayKeyOf(new Date(t.dueAt)), {
        id: t.id,
        kind: 'task',
        title: t.title,
        color: colorOf(t),
        completed: t.completed,
        completedAt: t.completedAt,
        time: t.dueHasTime ? t.dueAt : null,
        hasTime: t.dueHasTime,
      })
    }

    // Hábitos: se expanden por sus días programados dentro de la ventana
    // visible (los indefinidos no se pueden expandir hasta el infinito).
    if (habits.length > 0 && months.length > 0) {
      const day = new Date(months[0])
      day.setHours(0, 0, 0, 0)
      const lastFirst = new Date(months[months.length - 1])
      const end = new Date(lastFirst.getFullYear(), lastFirst.getMonth() + 1, 0).getTime()
      while (day.getTime() <= end) {
        for (const h of habits) {
          if (!isScheduledToday(h, day)) continue
          const key = dayKeyOf(day)
          const logKey = `${h.id}|${key}`
          const done = habitLogByKey.has(logKey)
          push(key, {
            id: h.id,
            kind: 'habit',
            title: h.title,
            color: habitColorOf(h),
            completed: done,
            completedAt: done ? (habitLogByKey.get(logKey) ?? null) : null,
            time: null,
            hasTime: false,
          })
        }
        day.setDate(day.getDate() + 1)
      }
    }

    for (const arr of map.values()) {
      // Completadas arriba, en orden de cumplimiento (la primera cumplida
      // primero); debajo, las que faltan por completar, con hora antes que sin.
      arr.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? -1 : 1
        if (a.completed) return (a.completedAt ?? 0) - (b.completedAt ?? 0)
        return (a.time ?? Infinity) - (b.time ?? Infinity)
      })
    }
    return map
  }, [tasks, habits, habitLogByKey, months, colorOf, habitColorOf])

  // Días aplanados para la vista de lista: desde hoy hacia adelante (o desde el
  // primer mes cargado si se pidieron días anteriores) hasta el final del rango.
  const agendaDays = useMemo(() => {
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const from = range.back === 0 ? midnight.getTime() : months[0]
    const list: number[] = []
    for (const ms of months) {
      const first = new Date(ms)
      const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
      for (let i = 1; i <= count; i++) {
        const d = new Date(first)
        d.setDate(i)
        if (d.getTime() >= from) list.push(d.getTime())
      }
    }
    return list
  }, [months, range.back])

  // Scroll infinito hacia abajo: al acercarse al final, añade más meses.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setRange((r) => ({ ...r, forward: r.forward + 4 }))
      },
      { rootMargin: '800px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Al prepender meses anteriores, compensa el scroll para que la vista no salte.
  useLayoutEffect(() => {
    if (prevHeightRef.current !== null) {
      window.scrollBy(0, document.documentElement.scrollHeight - prevHeightRef.current)
      prevHeightRef.current = null
    }
  }, [range.back])

  function loadPrevious() {
    prevHeightRef.current = document.documentElement.scrollHeight
    setRange((r) => ({ ...r, back: r.back + 3 }))
  }

  const now = new Date()
  const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`
  const todayKey = dayKeyOf(now)

  return (
    <div className="space-y-6">
      {/* Selector de vista: cuadrícula mensual o lista de días */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-line/10 glass-input p-0.5 text-xs font-medium">
          <button
            onClick={() => setMode('month')}
            aria-pressed={mode === 'month'}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors ${
              mode === 'month' ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink-dim'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4M9 14h.01M15 14h.01M9 18h.01M15 18h.01" />
            </svg>
            Mes
          </button>
          <button
            onClick={() => setMode('agenda')}
            aria-pressed={mode === 'agenda'}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors ${
              mode === 'agenda' ? 'bg-accent-600 text-on-accent' : 'text-ink-muted hover:text-ink-dim'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
              <path d="M8 6h13M8 12h13M8 18h13" />
              <path d="M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
            Lista
          </button>
        </div>
      </div>

      <button
        onClick={loadPrevious}
        className="mx-auto flex items-center gap-1.5 rounded-full border border-line/10 px-4 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink-dim"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
          <path d="M18 15l-6-6-6 6" />
        </svg>
        {mode === 'agenda' ? 'Días anteriores' : 'Meses anteriores'}
      </button>

      {mode === 'agenda' ? (
        <AgendaList
          days={agendaDays}
          entriesByDay={entriesByDay}
          todayKey={todayKey}
          onSelectDay={setSelectedDay}
          todayRef={todayRowRef}
        />
      ) : (
        months.map((ms) => {
          const d = new Date(ms)
          const isCurrent = `${d.getFullYear()}-${d.getMonth()}` === currentMonthKey
          return (
            <MonthGrid
              key={ms}
              ref={isCurrent ? currentMonthRef : undefined}
              monthStart={ms}
              entriesByDay={entriesByDay}
              todayKey={todayKey}
              onSelectDay={setSelectedDay}
            />
          )
        })
      )}

      {/* Centinela del scroll infinito */}
      <div ref={sentinelRef} className="h-2" aria-hidden="true" />

      {/* Botón flotante para volver a hoy */}
      <button
        onClick={() =>
          (mode === 'agenda' ? todayRowRef.current : currentMonthRef.current)?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          })
        }
        className="fixed bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line/10 glass-strong px-4 py-2 text-xs font-semibold text-accent-300 shadow-xl transition-colors hover:bg-ink/5"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
        Ir a hoy
      </button>

      {selectedDay !== null && (
        <DayModal
          dayMs={selectedDay}
          entries={entriesByDay.get(dayKeyOf(new Date(selectedDay))) ?? []}
          onClose={() => setSelectedDay(null)}
          onOpenTask={(id) => {
            setSelectedDay(null)
            onOpenTask(id)
          }}
        />
      )}
    </div>
  )
}

function AgendaList({
  days,
  entriesByDay,
  todayKey,
  onSelectDay,
  todayRef,
}: {
  days: number[]
  entriesByDay: Map<string, CalEntry[]>
  todayKey: string
  onSelectDay: (ms: number) => void
  todayRef: React.Ref<HTMLDivElement>
}) {
  let lastMonthKey = ''
  return (
    <div className="space-y-1.5">
      {days.map((ms) => {
        const d = new Date(ms)
        const key = dayKeyOf(d)
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`
        const showMonth = monthKey !== lastMonthKey
        lastMonthKey = monthKey
        return (
          <Fragment key={key}>
            {showMonth && (
              <h2 className="px-1 pt-3 pb-1 text-base font-semibold text-ink">{monthLabel(ms)}</h2>
            )}
            <AgendaDayRow
              ref={key === todayKey ? todayRef : undefined}
              dayMs={ms}
              entries={entriesByDay.get(key) ?? []}
              isToday={key === todayKey}
              onSelect={onSelectDay}
            />
          </Fragment>
        )
      })}
    </div>
  )
}

/** Pequeño distintivo (↻) para reconocer los hábitos entre las tareas. */
function HabitGlyph({ className = 'size-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`inline-block shrink-0 ${className}`} aria-hidden="true">
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function AgendaDayRow({
  dayMs,
  entries,
  isToday,
  onSelect,
  ref,
}: {
  dayMs: number
  entries: CalEntry[]
  isToday: boolean
  onSelect: (ms: number) => void
  ref?: React.Ref<HTMLDivElement>
}) {
  const d = new Date(dayMs)
  const weekday = WEEKDAYS[(d.getDay() + 6) % 7]
  const pending = entries.filter((e) => !e.completed).length
  return (
    <div ref={ref} className="scroll-mt-24">
      <button
        onClick={() => onSelect(dayMs)}
        aria-label={`${weekday} ${d.getDate()} — ${pending} pendientes. Toca para ver o crear`}
        className={`flex w-full items-stretch gap-3 rounded-xl border glass-panel p-2 text-left transition-colors hover:border-accent-500/40 ${
          isToday ? 'border-accent-500/50' : 'border-line/10'
        }`}
      >
        <span
          className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-full ${
            isToday ? 'bg-accent-600 text-on-accent' : 'bg-ink/5 text-ink-dim'
          }`}
        >
          <span className="text-[0.625rem] font-medium uppercase leading-none">{weekday}</span>
          <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          {entries.length === 0 ? (
            <>
              <span className="text-sm text-ink-dim">No hay nada planeado</span>
              <span className="text-xs text-ink-faint">Tocar para crear</span>
            </>
          ) : (
            entries.map((e) => {
              const c = e.color
              return (
                <span
                  key={`${e.kind}-${e.id}`}
                  className={`flex items-center gap-1 truncate rounded-md px-2 py-1 text-sm leading-tight ${
                    e.completed ? 'line-through opacity-50' : ''
                  } ${c ? '' : 'bg-accent-500/15 text-accent-300'}`}
                  style={c ? { backgroundColor: `color-mix(in srgb, ${c} 18%, transparent)`, color: c } : undefined}
                >
                  {e.kind === 'habit' && <HabitGlyph className="size-3" />}
                  <span className="truncate">
                    {e.hasTime && e.time !== null && `${formatDueTime(e.time)} `}
                    {e.title}
                  </span>
                </span>
              )
            })
          )}
        </span>
      </button>
    </div>
  )
}

function MonthGrid({
  monthStart,
  entriesByDay,
  todayKey,
  onSelectDay,
  ref,
}: {
  monthStart: number
  entriesByDay: Map<string, CalEntry[]>
  todayKey: string
  onSelectDay: (ms: number) => void
  ref?: React.Ref<HTMLElement>
}) {
  const first = new Date(monthStart)
  const offset = (first.getDay() + 6) % 7 // lunes = 0
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(first)
    d.setDate(i + 1)
    return d
  })

  return (
    <section ref={ref} className="scroll-mt-24 space-y-2">
      <h2 className="text-base font-semibold text-ink">{monthLabel(monthStart)}</h2>
      <div className="grid grid-cols-7 gap-1 px-0.5">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-0.5 text-center text-[0.6875rem] font-semibold tracking-wide text-ink-faint uppercase">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: offset }).map((_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}
        {days.map((d) => {
          const key = dayKeyOf(d)
          const dayEntries = entriesByDay.get(key) ?? []
          const isToday = key === todayKey
          const pendingCount = dayEntries.filter((e) => !e.completed).length
          return (
            <button
              key={key}
              onClick={() => onSelectDay(d.getTime())}
              aria-label={`${d.getDate()} de ${monthLabel(monthStart)} — ${pendingCount} pendientes. Toca para ver o crear`}
              className={`flex min-h-16 flex-col gap-1 rounded-xl border bg-surface-800/55 p-1.5 text-left transition-colors hover:border-accent-500/40 md:min-h-24 ${
                isToday ? 'border-accent-500/60' : 'border-line/5'
              }`}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[0.6875rem] font-semibold ${
                  isToday ? 'bg-accent-600 font-bold text-on-accent' : 'text-ink-dim'
                }`}
              >
                {d.getDate()}
              </span>
              {/* Escritorio: mini-chips con título; móvil: puntos */}
              <span className="hidden min-w-0 flex-col gap-0.5 md:flex">
                {dayEntries.slice(0, 3).map((e) => {
                  const c = e.color
                  return (
                    <span
                      key={`${e.kind}-${e.id}`}
                      className={`flex items-center gap-0.5 truncate rounded px-1 py-px text-[0.625rem] leading-tight ${
                        e.completed ? 'line-through opacity-50' : ''
                      } ${c ? '' : 'bg-accent-500/15 text-accent-300'}`}
                      style={c ? { backgroundColor: `color-mix(in srgb, ${c} 18%, transparent)`, color: c } : undefined}
                    >
                      {e.kind === 'habit' && <HabitGlyph className="size-2.5" />}
                      <span className="truncate">
                        {e.hasTime && e.time !== null && `${formatDueTime(e.time)} `}
                        {e.title}
                      </span>
                    </span>
                  )
                })}
                {dayEntries.length > 3 && (
                  <span className="px-1 text-[0.625rem] text-ink-faint">+{dayEntries.length - 3} más</span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-0.5 md:hidden">
                {dayEntries.slice(0, 4).map((e) => {
                  const c = e.color
                  return (
                    <span
                      key={`${e.kind}-${e.id}`}
                      className={`size-1.5 rounded-full ${e.completed ? 'opacity-40' : ''} ${c ? '' : 'bg-accent-500'}`}
                      style={c ? { backgroundColor: c } : undefined}
                    />
                  )
                })}
                {dayEntries.length > 4 && <span className="text-[0.5625rem] text-ink-faint">+{dayEntries.length - 4}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function DayModal({
  dayMs,
  entries,
  onClose,
  onOpenTask,
}: {
  dayMs: number
  entries: CalEntry[]
  onClose: () => void
  onOpenTask: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')

  const label = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(dayMs)

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    let dueAt = dayMs
    let dueHasTime = false
    if (time) {
      const [h, m] = time.split(':').map(Number)
      const d = new Date(dayMs)
      d.setHours(h, m)
      dueAt = d.getTime()
      dueHasTime = true
    }
    void createTask({ title: t, dueAt, dueHasTime })
    setTitle('')
    setTime('')
  }

  return (
    <Modal title={label.charAt(0).toUpperCase() + label.slice(1)} onClose={onClose}>
      <div className="space-y-4">
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nueva tarea para este día…"
            aria-label="Nueva tarea para este día"
            // Solo autoenfocar con ratón: en táctil abre el teclado y tapa la pantalla.
            autoFocus={!window.matchMedia('(pointer: coarse)').matches}
            className="min-w-0 flex-1 rounded-lg border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Hora (opcional)"
            title="Hora (opcional)"
            className="rounded-lg border border-line/10 glass-input px-2 py-2 text-sm text-ink outline-none focus:border-accent-500/60"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-500"
          >
            Crear
          </button>
        </form>

        {entries.length === 0 ? (
          <p className="py-2 text-center text-sm text-ink-faint">Sin tareas ni hábitos este día.</p>
        ) : (
          <div className="space-y-1">
            {entries.map((e) => {
              // Marca de la derecha: hora de cumplimiento si está hecho; si no,
              // la hora programada (solo las tareas con hora la tienen).
              const meta =
                e.completed && e.completedAt !== null ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-ink-faint" title="Hora de cumplimiento">
                    <CheckCircleIcon className="size-3" />
                    {formatDueTime(e.completedAt)}
                  </span>
                ) : (
                  e.hasTime && e.time !== null && (
                    <span className="shrink-0 text-xs text-ink-faint">{formatDueTime(e.time)}</span>
                  )
                )
              const dot = (
                <span
                  className={`size-2 shrink-0 rounded-full ${e.color ? '' : 'bg-accent-500'}`}
                  style={e.color ? { backgroundColor: e.color } : undefined}
                  aria-hidden="true"
                />
              )
              const titleEl = (
                <span
                  className={`flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm ${
                    e.completed ? 'text-ink-faint line-through' : 'text-ink-dim'
                  }`}
                >
                  {e.kind === 'habit' && <HabitGlyph className="size-3 opacity-70" />}
                  <span className="truncate">{e.title}</span>
                </span>
              )
              // Las tareas abren su detalle; los hábitos son informativos aquí.
              return e.kind === 'task' ? (
                <button
                  key={`task-${e.id}`}
                  onClick={() => onOpenTask(e.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-line/5 glass-input px-3 py-2 text-left transition-colors hover:border-line/15"
                >
                  {dot}
                  {titleEl}
                  {meta}
                </button>
              ) : (
                <div
                  key={`habit-${e.id}`}
                  className="flex w-full items-center gap-2.5 rounded-lg border border-line/5 glass-input px-3 py-2 text-left"
                >
                  {dot}
                  {titleEl}
                  {meta}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}
