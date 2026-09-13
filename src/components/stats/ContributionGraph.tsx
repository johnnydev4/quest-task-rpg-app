import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { StudySession, Task } from '../../db/types'
import { contributionCalendar, type ContributionDay } from '../../lib/statsData'

/** Tono del cuadrado por intensidad: mezcla del acento sobre el fondo. */
const LEVEL_BG = [
  'color-mix(in srgb, var(--t-ink) 7%, transparent)',
  'color-mix(in srgb, var(--t-accent-500) 26%, transparent)',
  'color-mix(in srgb, var(--t-accent-500) 48%, transparent)',
  'color-mix(in srgb, var(--t-accent-500) 72%, transparent)',
  'var(--t-accent-500)',
]

const CELL = 12
const GAP = 3
/** Filas de lunes a domingo; se etiquetan lunes, miércoles y viernes como en GitHub. */
const WEEKDAYS = ['lun', '', 'mié', '', 'vie', '', '']

const dayFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' })

function describe(day: ContributionDay): string {
  const parts: string[] = []
  if (day.tasks > 0) parts.push(`${day.tasks} ${day.tasks === 1 ? 'tarea' : 'tareas'}`)
  if (day.habits > 0) parts.push(`${day.habits} ${day.habits === 1 ? 'hábito' : 'hábitos'}`)
  if (day.focusMinutes > 0) parts.push(`${day.focusMinutes} min de foco`)
  return parts.length > 0 ? parts.join(' · ') : 'Sin actividad'
}

export default function ContributionGraph({
  tasks,
  sessions,
}: {
  tasks: Task[]
  sessions: StudySession[]
}) {
  const habitLogs = useLiveQuery(() => db.habitLogs.toArray(), []) ?? []
  const wrap = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ day: ContributionDay; x: number; y: number } | null>(null)

  const cal = useMemo(
    () => contributionCalendar(tasks, sessions, habitLogs),
    [tasks, sessions, habitLogs],
  )

  // El año completo no cabe en pantallas estrechas: se empieza por la fecha de hoy.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [cal])

  const monthAt = new Map(cal.monthLabels.map((m) => [m.column, m.label]))
  const todayKey = cal.weeks.flat().filter((d) => d !== null).at(-1)?.key

  // Coordenadas relativas al contenedor: `position: fixed` no sirve dentro de un
  // panel con backdrop-filter (crea bloque contenedor propio).
  function show(day: ContributionDay, el: HTMLElement) {
    const box = wrap.current?.getBoundingClientRect()
    if (!box) return
    const r = el.getBoundingClientRect()
    const half = 85
    const x = Math.min(Math.max(r.left + r.width / 2 - box.left, half), Math.max(box.width - half, half))
    setHover({ day, x, y: r.top - box.top })
  }

  return (
    <div ref={wrap} className="relative">
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div className="inline-flex gap-2">
          <div
            className="grid shrink-0 grid-rows-7 text-[9px] leading-none text-ink-faint"
            style={{ gap: GAP, paddingTop: 16 }}
          >
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="flex items-center" style={{ height: CELL }}>
                {d}
              </span>
            ))}
          </div>

          <div>
            <div
              className="mb-1 grid grid-flow-col text-[10px] leading-none text-ink-faint"
              style={{ gap: GAP, gridAutoColumns: `${CELL}px`, height: 12 }}
            >
              {cal.weeks.map((_, col) => (
                <div key={col} className="relative">
                  {monthAt.has(col) && (
                    <span className="absolute left-0 top-0 whitespace-nowrap">{monthAt.get(col)}</span>
                  )}
                </div>
              ))}
            </div>

            <div
              className="grid grid-flow-col grid-rows-7"
              style={{ gap: GAP, gridAutoColumns: `${CELL}px` }}
              role="img"
              aria-label={`Calendario de actividad: ${cal.totalActivity} acciones en ${cal.totalDays} días activos.`}
            >
              {cal.weeks.flatMap((week, col) =>
                week.map((day, row) =>
                  day === null ? (
                    <div key={`${col}-${row}`} style={{ width: CELL, height: CELL }} />
                  ) : (
                    <div
                      key={day.key}
                      onMouseEnter={(e) => show(day, e.currentTarget)}
                      onMouseLeave={() => setHover(null)}
                      className="rounded-[3px] transition-transform hover:scale-125"
                      style={{
                        width: CELL,
                        height: CELL,
                        backgroundColor: LEVEL_BG[day.level],
                        outline:
                          day.key === todayKey
                            ? '1px solid color-mix(in srgb, var(--t-ink) 45%, transparent)'
                            : undefined,
                        outlineOffset: day.key === todayKey ? 1 : undefined,
                      }}
                    />
                  ),
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
        <span>
          {cal.totalActivity} {cal.totalActivity === 1 ? 'acción' : 'acciones'} en {cal.totalDays}{' '}
          {cal.totalDays === 1 ? 'día activo' : 'días activos'}
          {cal.currentStreak > 0 && ` · racha de ${cal.currentStreak} ${cal.currentStreak === 1 ? 'día' : 'días'}`}
          {cal.bestStreak > 0 && ` · mejor: ${cal.bestStreak}`}
        </span>
        <span className="flex items-center gap-1">
          Menos
          {LEVEL_BG.map((bg, i) => (
            <span key={i} className="rounded-[3px]" style={{ width: CELL, height: CELL, backgroundColor: bg }} />
          ))}
          Más
        </span>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line/10 bg-surface-800 px-2.5 py-1.5 text-xs text-ink shadow-lg"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <p className="font-medium first-letter:uppercase">{dayFmt.format(hover.day.date)}</p>
          <p className="text-ink-faint">{describe(hover.day)}</p>
        </div>
      )}
    </div>
  )
}
