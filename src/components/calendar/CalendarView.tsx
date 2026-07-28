import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Task } from '../../db/types'
import { createTask } from '../../db/repo/tasks'
import { formatDueTime } from '../../lib/dates'
import { playScrollTick } from '../../lib/sound'
import { useSettings } from '../../lib/useSettings'
import { Modal } from '../ui/Modal'

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

const pad = (n: number) => String(n).padStart(2, '0')

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
  const lists = useLiveQuery(() => db.lists.toArray(), [])
  const settings = useSettings()

  useEffect(() => {
    localStorage.setItem('calendar-view-mode', mode)
  }, [mode])

  // Color efectivo de la tarea, igual que en la lista de tareas: el suyo manda
  // y, si no tiene, hereda el de su lista.
  const colorOf = useMemo(() => {
    const byId = new Map((lists ?? []).map((l) => [l.id, l.color]))
    return (t: Task) => t.color ?? (t.listId ? (byId.get(t.listId) ?? null) : null)
  }, [lists])

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

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (t.dueAt === null) continue
      const key = dayKeyOf(new Date(t.dueAt))
      const arr = map.get(key) ?? []
      arr.push(t)
      map.set(key, arr)
    }
    for (const arr of map.values()) {
      // Pendientes primero, luego por hora.
      arr.sort((a, b) => Number(a.completed) - Number(b.completed) || (a.dueAt ?? 0) - (b.dueAt ?? 0))
    }
    return map
  }, [tasks])

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

  // Tic ASMR suave mientras se desplaza el calendario.
  useEffect(() => {
    if (!settings.soundEnabled) return
    const onScroll = () => playScrollTick(settings.soundVolume)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [settings.soundEnabled, settings.soundVolume])

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
          tasksByDay={tasksByDay}
          todayKey={todayKey}
          colorOf={colorOf}
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
              tasksByDay={tasksByDay}
              todayKey={todayKey}
              colorOf={colorOf}
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
          tasks={tasksByDay.get(dayKeyOf(new Date(selectedDay))) ?? []}
          colorOf={colorOf}
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
  tasksByDay,
  todayKey,
  colorOf,
  onSelectDay,
  todayRef,
}: {
  days: number[]
  tasksByDay: Map<string, Task[]>
  todayKey: string
  colorOf: (t: Task) => string | null
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
              tasks={tasksByDay.get(key) ?? []}
              isToday={key === todayKey}
              colorOf={colorOf}
              onSelect={onSelectDay}
            />
          </Fragment>
        )
      })}
    </div>
  )
}

function AgendaDayRow({
  dayMs,
  tasks,
  isToday,
  colorOf,
  onSelect,
  ref,
}: {
  dayMs: number
  tasks: Task[]
  isToday: boolean
  colorOf: (t: Task) => string | null
  onSelect: (ms: number) => void
  ref?: React.Ref<HTMLDivElement>
}) {
  const d = new Date(dayMs)
  const weekday = WEEKDAYS[(d.getDay() + 6) % 7]
  const pending = tasks.filter((t) => !t.completed).length
  return (
    <div ref={ref} className="scroll-mt-24">
      <button
        onClick={() => onSelect(dayMs)}
        aria-label={`${weekday} ${d.getDate()} — ${pending} pendientes. Toca para ver o crear`}
        className={`flex w-full items-stretch gap-3 rounded-xl border glass-habit p-2 text-left transition-colors hover:border-accent-500/40 ${
          isToday ? 'border-accent-500/50' : 'border-line/10'
        }`}
      >
        <span
          className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-full ${
            isToday ? 'bg-accent-600 text-on-accent' : 'bg-ink/5 text-ink-dim'
          }`}
        >
          <span className="text-[10px] font-medium uppercase leading-none">{weekday}</span>
          <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          {tasks.length === 0 ? (
            <>
              <span className="text-sm text-ink-dim">No hay nada planeado</span>
              <span className="text-xs text-ink-faint">Tocar para crear</span>
            </>
          ) : (
            tasks.map((t) => {
              const c = colorOf(t)
              return (
                <span
                  key={t.id}
                  className={`truncate rounded-md px-2 py-1 text-sm leading-tight ${
                    t.completed ? 'line-through opacity-50' : ''
                  } ${c ? '' : 'bg-accent-500/15 text-accent-300'}`}
                  style={c ? { backgroundColor: `color-mix(in srgb, ${c} 18%, transparent)`, color: c } : undefined}
                >
                  {t.dueHasTime && `${formatDueTime(t.dueAt!)} `}
                  {t.title}
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
  tasksByDay,
  todayKey,
  colorOf,
  onSelectDay,
  ref,
}: {
  monthStart: number
  tasksByDay: Map<string, Task[]>
  todayKey: string
  colorOf: (t: Task) => string | null
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
          <span key={w} className="pb-0.5 text-center text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
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
          const dayTasks = tasksByDay.get(key) ?? []
          const isToday = key === todayKey
          const pendingCount = dayTasks.filter((t) => !t.completed).length
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
                className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isToday ? 'bg-accent-600 font-bold text-on-accent' : 'text-ink-dim'
                }`}
              >
                {d.getDate()}
              </span>
              {/* Escritorio: mini-chips con título; móvil: puntos */}
              <span className="hidden min-w-0 flex-col gap-0.5 md:flex">
                {dayTasks.slice(0, 3).map((t) => {
                  const c = colorOf(t)
                  return (
                    <span
                      key={t.id}
                      className={`truncate rounded px-1 py-px text-[10px] leading-tight ${
                        t.completed ? 'line-through opacity-50' : ''
                      } ${c ? '' : 'bg-accent-500/15 text-accent-300'}`}
                      style={c ? { backgroundColor: `color-mix(in srgb, ${c} 18%, transparent)`, color: c } : undefined}
                    >
                      {t.dueHasTime && `${formatDueTime(t.dueAt!)} `}
                      {t.title}
                    </span>
                  )
                })}
                {dayTasks.length > 3 && (
                  <span className="px-1 text-[10px] text-ink-faint">+{dayTasks.length - 3} más</span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-0.5 md:hidden">
                {dayTasks.slice(0, 4).map((t) => {
                  const c = colorOf(t)
                  return (
                    <span
                      key={t.id}
                      className={`size-1.5 rounded-full ${t.completed ? 'opacity-40' : ''} ${c ? '' : 'bg-accent-500'}`}
                      style={c ? { backgroundColor: c } : undefined}
                    />
                  )
                })}
                {dayTasks.length > 4 && <span className="text-[9px] text-ink-faint">+{dayTasks.length - 4}</span>}
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
  tasks,
  colorOf,
  onClose,
  onOpenTask,
}: {
  dayMs: number
  tasks: Task[]
  colorOf: (t: Task) => string | null
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

        {tasks.length === 0 ? (
          <p className="py-2 text-center text-sm text-ink-faint">Sin tareas programadas este día.</p>
        ) : (
          <div className="space-y-1">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => onOpenTask(t.id)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-line/5 glass-input px-3 py-2 text-left transition-colors hover:border-line/15"
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${colorOf(t) ? '' : 'bg-accent-500'}`}
                  style={colorOf(t) ? { backgroundColor: colorOf(t)! } : undefined}
                  aria-hidden="true"
                />
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${
                    t.completed ? 'text-ink-faint line-through' : 'text-ink-dim'
                  }`}
                >
                  {t.title}
                </span>
                {t.dueHasTime && (
                  <span className="shrink-0 text-xs text-ink-faint">{formatDueTime(t.dueAt!)}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
