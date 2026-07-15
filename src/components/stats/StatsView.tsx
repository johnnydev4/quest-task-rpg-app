import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Bar,
  BarChart,
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
import { useProfile } from '../../lib/useProfile'
import { computeStats, makeBuckets, type StatsRange } from '../../lib/statsData'
import { dateInputToMs, msToDateInput, startOfDayOffset, startOfToday } from '../../lib/dates'

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
  { id: '7d', label: 'Semana' },
  { id: '30d', label: 'Mes' },
  { id: '12m', label: 'Año' },
  { id: 'custom', label: 'Personalizado' },
]

export default function StatsView() {
  const [range, setRange] = useState<StatsRange>('7d')
  const [customFrom, setCustomFrom] = useState(startOfDayOffset(-13))
  const [customTo, setCustomTo] = useState(startOfToday())

  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? []
  const sessions = useLiveQuery(() => db.studySessions.toArray(), []) ?? []
  const lists = useLiveQuery(() => db.lists.orderBy('order').toArray(), []) ?? []
  const tags = useLiveQuery(() => db.tags.toArray(), []) ?? []
  const { level, streak } = useProfile()

  const stats = useMemo(() => {
    const buckets = makeBuckets(range, customFrom, customTo)
    return computeStats(buckets, tasks, sessions, lists, tags)
  }, [range, customFrom, customTo, tasks, sessions, lists, tags])

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
  const productividad = stats.tasksPerBucket.map((t, i) => ({
    label: t.label,
    tareas: t.tareas,
    minutos: stats.focusPerBucket[i]?.minutos ?? 0,
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Tareas completadas" value={String(stats.totals.completed)} />
        <Summary label="Racha actual" value={streak > 0 ? `🔥 ${streak} días` : '—'} />
        <Summary label="Tiempo de foco" value={hours > 0 ? `${hours} h ${mins} m` : `${mins} min`} />
        <Summary label="Nivel" value={String(level)} />
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
              aria-label="Desde"
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
              aria-label="Hasta"
              className="rounded-md border border-line/10 glass-input px-2 py-1 text-xs text-ink"
            />
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Productividad · foco y tareas por fecha" className="lg:col-span-2">
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
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.08)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="minutos"
                dataKey="minutos"
                name="Minutos de foco"
                fill={accent}
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="tareas"
                type="monotone"
                dataKey="tareas"
                name="Tareas completadas"
                stroke={cssVar('--t-ok')}
                strokeWidth={2.5}
                dot={{ r: 2.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Tareas completadas">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.tasksPerBucket}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.08)' }} />
              <Bar dataKey="tareas" fill={accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Minutos de foco (modo estudio)">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.focusPerBucket}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.08)' }} />
              <Bar dataKey="minutos" fill={accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="XP acumulado en el periodo">
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

        <Card title="Distribución por prioridad">
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

        <Card title="Atributos por lista (XP de categoría)">
          {stats.byList.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">Crea listas para ver tus atributos RPG.</p>
          ) : (
            <div className="space-y-2.5 py-1">
              {stats.byList.map((l) => {
                const max = Math.max(...stats.byList.map((x) => x.xp), 1)
                return (
                  <div key={l.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink-dim">
                        {l.name} <span className="text-ink-faint">· Nv {l.nivel}</span>
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

        <Card title="Por etiqueta">
          {stats.byTag.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-faint">Completa tareas con etiquetas para ver su distribución.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.byTag} layout="vertical">
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} tickLine={false} axisLine={false} width={80} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(128,128,128,0.08)' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {stats.byTag.map((t) => (
                    <Cell key={t.name} fill={t.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card title="Mejores rachas">
        {stats.streakHistory.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Completa tareas en días seguidos para construir rachas.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {stats.streakHistory.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn/10 px-3 py-1 text-xs font-medium text-warn"
              >
                🔥 {s.days} {s.days === 1 ? 'día' : 'días'}
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
