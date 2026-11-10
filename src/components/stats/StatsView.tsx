import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  ComposedChart,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { db } from '../../db/db'
import { FlameIcon, PinIcon, PinOffIcon } from '../ui/icons'
import { useProfile } from '../../lib/useProfile'
import { useSettings } from '../../lib/useSettings'
import { updateSettings } from '../../db/repo/settings'
import {
  computeStats,
  focusEntityOptions,
  focusForEntityPerBucket,
  makeBuckets,
  type StatsRange,
} from '../../lib/statsData'
import { dateInputToMs, msToDateInput, startOfDayOffset, startOfToday } from '../../lib/dates'
import ContributionGraph from './ContributionGraph'
import { t } from '../../lib/i18n'

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#8b5cf6'
}

function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line/5 glass-panel p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-ink-dim">{title}</h3>
      {children}
    </section>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line/5 glass-panel px-4 py-3">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-xs text-ink-faint">{label}</p>
    </div>
  )
}

const RANGES: { id: StatsRange; label: string }[] = [
  { id: '7d', label: t('Week', 'Semana') },
  { id: '30d', label: t('Month', 'Mes') },
  { id: '12m', label: t('Year', 'Año') },
  { id: 'custom', label: t('Custom', 'Personalizado') },
]

export default function StatsView() {
  const [range, setRange] = useState<StatsRange>('7d')
  const [customFrom, setCustomFrom] = useState(startOfDayOffset(-13))
  const [customTo, setCustomTo] = useState(startOfToday())
  // null = sin elección manual esta sesión → se usa el elemento fijado (si hay).
  const [focusOverride, setFocusOverride] = useState<string | null>(null)

  const settings = useSettings()
  const pinnedKey = settings.pinnedFocusEntityKey ?? ''

  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? []
  const habits = useLiveQuery(() => db.habits.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.studySessions.toArray(), []) ?? []
  const lists = useLiveQuery(() => db.lists.orderBy('order').toArray(), []) ?? []
  const tags = useLiveQuery(() => db.tags.toArray(), []) ?? []
  const { level, streak } = useProfile()

  const buckets = useMemo(() => makeBuckets(range, customFrom, customTo), [range, customFrom, customTo])

  const stats = useMemo(
    () => computeStats(buckets, tasks, sessions, lists, tags),
    [buckets, tasks, sessions, lists, tags],
  )

  // Tareas y hábitos con foco registrado en el rango, para el selector de pomodoro.
  const entityOptions = useMemo(() => {
    const from = buckets[0]?.from ?? 0
    const to = buckets.at(-1)?.to ?? Date.now()
    return focusEntityOptions(sessions, tasks, habits, from, to)
  }, [buckets, sessions, tasks, habits])

  // Elección manual de esta sesión, o el elemento fijado si no se tocó el selector.
  const effectiveKey = focusOverride ?? pinnedKey
  // El elemento elegido deja de tener datos al cambiar el rango: se limpia solo.
  const selectedKey = entityOptions.some((o) => o.key === effectiveKey) ? effectiveKey : ''
  const isPinned = selectedKey !== '' && selectedKey === pinnedKey

  function togglePin() {
    if (isPinned) {
      // Desfijar: sigue visible en esta sesión, pero deja de persistir.
      setFocusOverride(selectedKey)
      void updateSettings({ pinnedFocusEntityKey: null })
    } else if (selectedKey) {
      void updateSettings({ pinnedFocusEntityKey: selectedKey })
    }
  }

  const focusByEntity = useMemo(
    () => (selectedKey ? focusForEntityPerBucket(buckets, sessions, selectedKey) : []),
    [buckets, sessions, selectedKey],
  )
  const focusByEntityTotal = focusByEntity.reduce((sum, b) => sum + b.minutos, 0)
  const taskOpts = entityOptions.filter((o) => o.kind === 'task')
  const habitOpts = entityOptions.filter((o) => o.kind === 'habit')

  const accent = cssVar('--t-accent-500')
  const grid = 'color-mix(in srgb, currentColor 8%, transparent)'
  const axisTick = { fontSize: 11, fill: cssVar('--t-ink-faint') }
  const tooltipStyle = {
    backgroundColor: cssVar('--t-surface-800'),
    border: '1px solid color-mix(in srgb, currentColor 10%, transparent)',
    borderRadius: 12,
    fontSize: 12,
    color: cssVar('--t-ink'),
  }
  const hours = Math.floor(stats.totals.focusMinutes / 60)
  const mins = stats.totals.focusMinutes % 60

  // Productividad: minutos de foco + tareas completadas, desglosado por fecha.
  const productividad = stats.tasksPerBucket.map((b, i) => ({
    label: b.label,
    tareas: b.tareas,
    minutos: stats.focusPerBucket[i]?.minutos ?? 0,
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label={t('Completed tasks', 'Tareas completadas')} value={String(stats.totals.completed)} />
        <Summary
          label={t('Current streak', 'Racha actual')}
          value={streak > 0 ? `${streak} ${t(streak === 1 ? 'day' : 'days', 'días')}` : '—'}
        />
        <Summary label={t('Focus time', 'Tiempo de foco')} value={hours > 0 ? `${hours} h ${mins} m` : `${mins} min`} />
        <Summary label={t('Level', 'Nivel')} value={String(level)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            aria-pressed={range === r.id}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              range === r.id
                ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                : 'border-line/10 text-ink-muted hover:bg-ink/5'
            }`}
          >
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input
              type="date"
              value={msToDateInput(customFrom)}
              onChange={(e) => {
                const ms = dateInputToMs(e.target.value)
                if (ms !== null) setCustomFrom(ms)
              }}
              aria-label={t('From', 'Desde')}
              className="rounded-md border border-line/10 glass-input px-2 py-1 text-xs text-ink"
            />
            →
            <input
              type="date"
              value={msToDateInput(customTo)}
              onChange={(e) => {
                const ms = dateInputToMs(e.target.value)
                if (ms !== null) setCustomTo(ms)
              }}
              aria-label={t('To', 'Hasta')}
              className="rounded-md border border-line/10 glass-input px-2 py-1 text-xs text-ink"
            />
          </span>
        )}
      </div>

      <Card title={t('Daily activity · last year', 'Actividad diaria · último año')}>
        <ContributionGraph tasks={tasks} sessions={sessions} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('Productivity · focus and tasks by date', t('Productivity · focus and tasks by date', 'Productividad · foco y tareas por fecha'))} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={productividad}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis
                yAxisId="minutos"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={34}
              />
              <YAxis
                yAxisId="tareas"
                orientation="right"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(128,128,128,0.2)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                yAxisId="minutos"
                type="monotone"
                dataKey="minutos"
                name={t('Focus minutes', 'Minutos de foco')}
                stroke={accent}
                strokeWidth={2.5}
                dot={{ r: 2.5 }}
              />
              <Line
                yAxisId="tareas"
                type="monotone"
                dataKey="tareas"
                name={t('Completed tasks', 'Tareas completadas')}
                stroke={cssVar('--t-ok')}
                strokeWidth={2.5}
                dot={{ r: 2.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t('Pomodoro by task or habit', 'Pomodoro por tarea o hábito')} className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              value={selectedKey}
              onChange={(e) => setFocusOverride(e.target.value)}
              aria-label={t('Pick a task or habit', 'Elegir tarea o hábito')}
              className="max-w-full rounded-md border border-line/10 glass-input px-2 py-1 text-xs text-ink"
            >
              <option value="">{t('Pick a task or habit…', 'Elige una tarea o hábito…')}</option>
              {taskOpts.length > 0 && (
                <optgroup label={t('Tasks', 'Tareas')}>
                  {taskOpts.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.title} · {o.minutes} min
                    </option>
                  ))}
                </optgroup>
              )}
              {habitOpts.length > 0 && (
                <optgroup label={t('Habits', 'Hábitos')}>
                  {habitOpts.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.title} · {o.minutes} min
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {selectedKey && (
              <>
                <button
                  onClick={togglePin}
                  aria-pressed={isPinned}
                  title={
                    isPinned
                      ? t('Unpin: it will stop showing when you open Stats', 'Desfijar: dejará de aparecer al abrir Estadísticas')
                      : t('Pin: it will show when you open Stats', 'Fijar: aparecerá al abrir Estadísticas')
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isPinned
                      ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                      : 'border-line/10 text-ink-muted hover:bg-ink/5'
                  }`}
                >
                  {isPinned ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />}
                  {isPinned ? t('Unpin', 'Desfijar') : t('Pin', 'Fijar')}
                </button>
                <span className="text-xs text-ink-faint">
                  {t(
                    `${focusByEntityTotal} min of focus in this period`,
                    `${focusByEntityTotal} min de foco en el periodo`,
                  )}
                </span>
              </>
            )}
          </div>
          {entityOptions.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">
              {t(
                'Link a pomodoro to a task or habit to see its focus time by date here.',
                'Vincula un pomodoro a una tarea o hábito para ver aquí su tiempo de foco por fecha.',
              )}
            </p>
          ) : !selectedKey ? (
            <p className="py-8 text-center text-sm text-ink-faint">
              {t(
                'Pick a task or habit to see its pomodoro time by date.',
                'Elige una tarea o hábito para ver su tiempo de pomodoro por fecha.',
              )}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={focusByEntity}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(128,128,128,0.2)' }} />
                <Line type="monotone" dataKey="minutos" name={t('Focus minutes', 'Minutos de foco')} stroke={accent} strokeWidth={2.5} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title={t('Completed tasks', 'Tareas completadas')}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.tasksPerBucket}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(128,128,128,0.2)' }} />
              <Line type="monotone" dataKey="tareas" name={t('Tasks', 'Tareas')} stroke={accent} strokeWidth={2.5} dot={{ r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t('Focus minutes (study mode)', 'Minutos de foco (modo estudio)')}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.focusPerBucket}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(128,128,128,0.2)' }} />
              <Line type="monotone" dataKey="minutos" name={t('Focus minutes', 'Minutos de foco')} stroke={accent} strokeWidth={2.5} dot={{ r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t('XP earned in the period', 'XP acumulado en el periodo')}>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.xpLine}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="xp" stroke={accent} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t('Priority breakdown', 'Distribución por prioridad')}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={stats.byPriority.filter((p) => p.value > 0)}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={3}
                label={({ name, value }) => `${name} ${value}`}
                labelLine={false}
                fontSize={11}
              >
                <Cell fill={cssVar('--t-danger')} />
                <Cell fill={cssVar('--t-warn')} />
                <Cell fill={cssVar('--t-info')} />
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t('Attributes by list (category XP)', 'Atributos por lista (XP de categoría)')}>
          {stats.byList.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">{t('Create lists to see your RPG attributes.', 'Crea listas para ver tus atributos RPG.')}</p>
          ) : (
            <div className="space-y-2.5 py-1">
              {stats.byList.map((l) => {
                const max = Math.max(...stats.byList.map((x) => x.xp), 1)
                return (
                  <div key={l.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink-dim">
                        {l.name} <span className="text-ink-faint">· {t('Lv', 'Nv')} {l.nivel}</span>
                      </span>
                      <span className="text-ink-faint">{l.xp} XP</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-ink/5">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(2, (l.xp / max) * 100)}%`, backgroundColor: l.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card title={t('By tag', 'Por etiqueta')}>
          {stats.byTag.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">{t('Complete tagged tasks to see their breakdown.', 'Completa tareas con etiquetas para ver su distribución.')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={stats.byTag}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} interval={0} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(128,128,128,0.2)' }} />
                <Line type="monotone" dataKey="value" name={t('Tasks', 'Tareas')} stroke={accent} strokeWidth={2.5} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card title={t('Best streaks', 'Mejores rachas')}>
        {stats.streakHistory.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">{t('Complete tasks on consecutive days to build streaks.', 'Completa tareas en días seguidos para construir rachas.')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {stats.streakHistory.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn/10 px-3 py-1 text-xs font-medium text-warn"
              >
                <FlameIcon className="size-3" /> {s.days}{' '}
                {s.days === 1 ? t('day', 'día') : t('days', 'días')}
                <span className="text-warn/60">
                  {s.start}
                  {s.days > 1 && ` → ${s.end}`}
                </span>
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
