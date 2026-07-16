import { useEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Quest, QuestStep } from '../../db/types'
import {
  createQuest,
  createQuestStep,
  deleteQuest,
  deleteQuestStep,
  MONTHLY_QUEST_XP,
  QUEST_STEP_XP,
  setQuestCompleted,
  setQuestStepCompleted,
  updateQuest,
  updateQuestStep,
  WEEKLY_QUEST_XP,
} from '../../db/repo/quests'
import {
  monthKeyOf,
  monthLabelOf,
  themeForMonthKey,
  weekOfMonth,
  weekRangeLabel,
  type MonthTheme,
} from '../../lib/questThemes'
import { ConfirmButton } from '../ui/ConfirmButton'

const inputClass =
  'w-full rounded-lg border border-line/10 glass-input px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60'

/** Chip de XP con los colores del mes. */
function XpChip({ xp, theme }: { xp: number; theme: MonthTheme }) {
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `${theme.colorA}1a`, borderColor: `${theme.colorA}40`, color: theme.colorA }}
    >
      +{xp} XP
    </span>
  )
}

function LockIcon({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${className} shrink-0`} aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export function QuestsView() {
  const [monthOffset, setMonthOffset] = useState(0)
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null)

  const monthKey = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + monthOffset)
    return monthKeyOf(d)
  }, [monthOffset])

  const theme = themeForMonthKey(monthKey)
  const quests = useLiveQuery(() => db.quests.where('monthKey').equals(monthKey).toArray(), [monthKey]) ?? []
  const allSteps = useLiveQuery(() => db.questSteps.toArray(), []) ?? []

  const monthly = quests.find((q) => q.week === 0)
  const weeklies = [1, 2, 3, 4].map((w) => quests.find((q) => q.week === w))
  const stepsOf = (quest: Quest | undefined) =>
    quest ? allSteps.filter((s) => s.questId === quest.id).sort((a, b) => a.order - b.order) : []

  // Progreso del mes: semanas completadas + pasos de la main quest.
  const monthlySteps = stepsOf(monthly)
  const definedWeeklies = weeklies.filter((q): q is Quest => q !== undefined)
  const doneUnits =
    definedWeeklies.filter((q) => q.completed).length + monthlySteps.filter((s) => s.completed).length
  const totalUnits = definedWeeklies.length + monthlySteps.length
  const monthProgress = monthly?.completed ? 1 : totalUnits > 0 ? doneUnits / totalUnits : 0
  const progressPct = Math.round(monthProgress * 100)

  // Reglas de forja (se respeta la fecha actual): solo el mes en curso permite
  // crear misiones, y dentro de él solo la semana actual o las futuras.
  const isCurrentMonth = monthOffset === 0
  const currentWeek = isCurrentMonth ? weekOfMonth(new Date()) : null
  const monthLockReason =
    monthOffset < 0
      ? 'Este mes ya terminó'
      : monthOffset > 0
        ? 'Disponible cuando llegue el mes'
        : null
  const navBtn =
    'flex size-8 items-center justify-center rounded-lg border border-white/20 text-white/90 transition-colors hover:bg-white/10'

  // Días que quedan del mes (incluye hoy): solo tiene sentido en el mes en curso.
  const daysLeft = useMemo(() => {
    if (!isCurrentMonth) return null
    const now = new Date()
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return Math.max(0, lastDay - now.getDate() + 1)
  }, [isCurrentMonth])

  // Retos de meses pasados (solo los que llegaron a forjarse).
  const realMonthKey = monthKeyOf(new Date())
  const pastMonthlies =
    useLiveQuery(async () => {
      const all = await db.quests.toArray()
      return all
        .filter((q) => q.week === 0 && q.monthKey < realMonthKey)
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
        .slice(0, 3)
    }, [realMonthKey]) ?? []

  // Solo se pueden mirar: meses pasados, el actual y uno por delante.
  // A partir de +2 el mes queda sellado (sin revelar criatura ni tema).
  const sealed = monthOffset >= 2

  // Cierre del mes anterior: la main quest solo se completa cuando el mes acaba,
  // así que al entrar al mes nuevo se pregunta si la del mes pasado se cumplió.
  const prevMonthKey = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return monthKeyOf(d)
  }, [])
  const prevQuests = useLiveQuery(() => db.quests.where('monthKey').equals(prevMonthKey).toArray(), [prevMonthKey])
  const prevMonthly = prevQuests?.find((q) => q.week === 0)
  const resolveKey = `quest-main-resuelta-${prevMonthKey}`
  const [prevResolved, setPrevResolved] = useState(() => localStorage.getItem(resolveKey) === '1')
  function resolvePrev(conquered: boolean) {
    if (conquered && prevMonthly) void setQuestCompleted(prevMonthly.id, true)
    localStorage.setItem(resolveKey, '1')
    setPrevResolved(true)
  }
  const prevTheme = themeForMonthKey(prevMonthKey)
  const showClosingPrompt =
    monthOffset === 0 && !!prevMonthly && !prevMonthly.completed && !prevResolved

  // Deslizar el banner (swipe) para cambiar de mes: izquierda = siguiente, derecha = anterior.
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  function onBannerTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }
  function onBannerTouchEnd(e: TouchEvent) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    // Solo cuenta como swipe si el gesto es claramente horizontal.
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) {
      if (!sealed) setMonthOffset((o) => o + 1) // desde el sellado no se avanza más
    } else {
      setMonthOffset((o) => o - 1)
    }
  }

  if (sealed) {
    const sealedNav =
      'flex size-8 items-center justify-center rounded-lg border border-line/15 text-ink-dim transition-colors hover:bg-ink/5 disabled:opacity-40 disabled:hover:bg-transparent'
    return (
      <div className="space-y-5">
        <section
          className="relative min-h-52 touch-pan-y overflow-hidden rounded-3xl border border-line/10 glass-strong p-6 shadow-xl"
          onTouchStart={onBannerTouchStart}
          onTouchEnd={onBannerTouchEnd}
        >
          <span className="pointer-events-none absolute -top-10 -right-3 text-[9rem] opacity-[0.08] select-none" aria-hidden="true">
            🔒
          </span>
          <div className="relative space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-widest text-ink-faint uppercase">
                Misión sellada · {monthLabelOf(monthKey)}
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setMonthOffset((o) => o - 1)} aria-label="Mes anterior" className={sealedNav}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <button onClick={() => setMonthOffset(0)} className="rounded-lg border border-line/15 px-2.5 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:bg-ink/5">
                  Hoy
                </button>
                <button disabled aria-label="Mes siguiente" className={sealedNav}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
            <h2 className="flex items-center gap-2 text-2xl font-black text-ink">
              <span aria-hidden="true">🔒</span> Aún sellada
            </h2>
            <p className="max-w-md text-sm text-ink-muted">
              El desafío de <span className="font-semibold text-ink-dim">{monthLabelOf(monthKey)}</span> todavía no se ha
              revelado. Vuelve cuando se acerque el mes para descubrir qué criatura mítica te aguarda.
            </p>
          </div>
        </section>
        <p className="text-center text-xs text-ink-faint">
          Solo puedes explorar hasta un mes por delante. El destino se desvela a su debido tiempo. ⚔
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Cierre del mes anterior: ¿se conquistó la main quest? */}
      {showClosingPrompt && prevMonthly && (
        <section
          className="space-y-3 rounded-2xl border p-4 glass-strong"
          style={{
            borderColor: `${prevTheme.colorA}55`,
            background: `linear-gradient(125deg, ${prevTheme.colorA}2e, ${prevTheme.colorB}18 70%)`,
          }}
        >
          <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: prevTheme.colorA }}>
            {prevTheme.emoji} {monthLabelOf(prevMonthKey)} terminó
          </p>
          <p className="text-sm text-ink-dim">
            ¿Conquistaste tu gran misión{' '}
            <span className="font-bold text-ink">"{prevMonthly.title}"</span>?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => resolvePrev(true)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-md transition-opacity hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${prevTheme.colorA}, ${prevTheme.colorB})` }}
            >
              👑 Sí, conquistada · +{MONTHLY_QUEST_XP} XP
            </button>
            <button
              onClick={() => resolvePrev(false)}
              className="rounded-lg border border-line/15 px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-ink/5"
            >
              No esta vez
            </button>
          </div>
        </section>
      )}

      {/* Héroe del mes: insignia RETO DEL MES, título épico, progreso y Aceptar reto */}
      <section
        className={`relative touch-pan-y overflow-hidden rounded-3xl border border-line/10 p-6 shadow-xl ${
          theme.bannerImage ? 'min-h-60' : 'min-h-48'
        }`}
        style={{ background: `linear-gradient(135deg, ${theme.colorA}, ${theme.colorB})` }}
        onTouchStart={onBannerTouchStart}
        onTouchEnd={onBannerTouchEnd}
      >
        {theme.bannerImage ? (
          <>
            {/* Paisaje a sangre completa; velo lateral para que el texto respire */}
            <img
              src={theme.bannerImage}
              alt={theme.creature}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center select-none"
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'linear-gradient(90deg, rgba(10,4,12,0.62), rgba(10,4,12,0.18) 55%, transparent 80%)' }}
              aria-hidden="true"
            />
          </>
        ) : theme.image ? (
          <>
            <img
              src={theme.image}
              alt={theme.creature}
              className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 object-cover object-right select-none sm:w-2/5"
            />
            {/* Velo para que el texto siga legible sobre la ilustración */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: `linear-gradient(90deg, ${theme.colorA} 35%, ${theme.colorA}00 75%)` }}
              aria-hidden="true"
            />
          </>
        ) : (
          <span className="pointer-events-none absolute -top-6 -right-4 text-[7rem] opacity-25 select-none" aria-hidden="true">
            {theme.emoji}
          </span>
        )}
        <div className="relative flex flex-col items-start gap-2">
          <div className="flex w-full items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[11px] font-bold tracking-widest text-white uppercase backdrop-blur-sm">
              ✦ Reto del mes
            </span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => setMonthOffset((o) => o - 1)} aria-label="Mes anterior" className={navBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              {monthOffset !== 0 && (
                <button onClick={() => setMonthOffset(0)} className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/10">
                  Hoy
                </button>
              )}
              <button onClick={() => setMonthOffset((o) => o + 1)} aria-label="Mes siguiente" className={navBtn}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-white drop-shadow-sm">{theme.epicTitle}</h2>
            <p className="text-sm font-medium text-white/80">{monthLabelOf(monthKey)}</p>
          </div>
          <p className="max-w-md text-sm text-white/85 italic">"{theme.motto}"</p>
          {totalUnits > 0 && !monthly?.completed && (
            <div className="w-full max-w-md pt-1">
              <p className="mb-1 text-[11px] font-medium text-white/80">
                {doneUnits} / {totalUnits} gestas completadas
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-black/25">
                <div
                  className="h-full rounded-full bg-white/90 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
          {monthly?.completed && (
            <p className="pt-1 text-sm font-bold text-white">🏆 ¡Misión del mes conquistada! +{MONTHLY_QUEST_XP} XP</p>
          )}
          {isCurrentMonth && !monthly && (
            <button
              onClick={() => void createQuest(monthKey, 0, theme.epicTitle)}
              className="mt-2 self-end rounded-full bg-white/95 px-6 py-2.5 text-sm font-bold shadow-lg transition-all hover:bg-white active:scale-95"
              style={{ color: theme.colorB }}
            >
              ⚔ Aceptar reto
            </button>
          )}
        </div>
      </section>

      {/* Tareas del reto + Recompensa */}
      {/* minmax(0,1fr) también en móvil: sin él, la columna auto deja crecer los paneles más que la pantalla */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* Tareas del reto: la gran misión del mes + las misiones semanales */}
        <section className="rounded-2xl border border-line/10 glass-panel p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-ink">Tareas del reto</h3>
            {totalUnits > 0 && (
              <span className="rounded-full border border-line/10 bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink-dim">
                {doneUnits} / {totalUnits}
              </span>
            )}
          </div>

          {/* La gran misión del mes (forjar o gestionar) */}
          <div className="mt-3">
            {monthly ? (
              <MonthlyQuestBlock
                quest={monthly}
                steps={monthlySteps}
                theme={theme}
                completeLocked={isCurrentMonth || monthOffset > 0}
              />
            ) : monthLockReason ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-line/15 px-3 py-2.5 text-xs text-ink-faint">
                <LockIcon className="size-4" />
                <span>👑 Gran misión del mes — {monthLockReason}</span>
              </div>
            ) : (
              <ForgeRow
                placeholder={`👑 ¿Cuál es tu gran gesta del mes? (p. ej. "Terminar el curso de…")`}
                ariaLabel="Gran misión del mes"
                theme={theme}
                onCreate={(title) => void createQuest(monthKey, 0, title)}
              />
            )}
          </div>

          {/* Misiones semanales */}
          <div className="mt-3 space-y-2">
            {weeklies.map((quest, i) => {
              const week = i + 1
              const weekPassed = currentWeek !== null && week < currentWeek
              const locked = !isCurrentMonth || weekPassed
              const lockedReason = !isCurrentMonth
                ? monthLockReason
                : weekPassed
                  ? 'Semana finalizada'
                  : null
              return (
                <WeeklyQuestRow
                  key={week}
                  quest={quest}
                  steps={stepsOf(quest)}
                  week={week}
                  rangeLabel={weekRangeLabel(monthKey, week)}
                  theme={theme}
                  highlight={currentWeek === week}
                  locked={locked}
                  lockedReason={lockedReason}
                  expanded={expandedWeek === week}
                  onToggleExpand={() => setExpandedWeek((w) => (w === week ? null : week))}
                  onCreate={(title) => void createQuest(monthKey, week, title)}
                />
              )
            })}
          </div>

          {/* Estado de la recompensa al pie, como en la referencia */}
          <div
            className={`mt-4 flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium ${
              monthly?.completed
                ? 'border-ok/30 bg-ok/10 text-ok'
                : 'border-line/10 bg-ink/5 text-ink-muted'
            }`}
          >
            {monthly?.completed ? (
              <span>🏆 ¡Reto del mes conquistado! Recompensa ganada: +{MONTHLY_QUEST_XP} XP</span>
            ) : (
              <>
                <LockIcon />
                <span>Conquista tus gestas para ganar la recompensa del mes</span>
              </>
            )}
          </div>
        </section>

        {/* Recompensa y estado del reto */}
        <aside className="rounded-2xl border border-line/10 glass-panel p-4 sm:p-5">
          <h3 className="flex items-center gap-1.5 text-base font-bold text-ink">💎 Recompensa</h3>
          <div className="mt-3 flex items-center gap-3">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-md"
              style={{ background: `linear-gradient(135deg, ${theme.colorA}, ${theme.colorB})` }}
              aria-hidden="true"
            >
              {theme.emoji}
            </span>
            <div>
              <p className="text-2xl font-black text-ink">+{MONTHLY_QUEST_XP} XP</p>
              <p className="text-xs text-ink-muted">Experiencia al conquistar la gesta del mes</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            Además: +{WEEKLY_QUEST_XP} XP por semana conquistada y +{QUEST_STEP_XP} XP por cada paso.
          </p>

          <div className="mt-4 space-y-2.5 rounded-xl border border-line/10 glass-input p-3.5">
            <p className="text-xs font-semibold tracking-wide text-ink-faint uppercase">Estado del reto</p>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-ink">
                📊 {doneUnits} / {totalUnits} gestas
              </span>
              <span className="text-xs font-bold" style={{ color: theme.colorA }}>
                {progressPct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: `linear-gradient(90deg, ${theme.colorA}, ${theme.colorB})`,
                }}
              />
            </div>
            <p className="text-xs text-ink-muted">
              {daysLeft !== null
                ? `📅 Quedan ${daysLeft} día${daysLeft === 1 ? '' : 's'}`
                : monthOffset < 0
                  ? '📅 Mes terminado'
                  : '📅 Aún no empieza'}
            </p>
          </div>
        </aside>
      </div>

      {/* Retos anteriores */}
      {pastMonthlies.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
            🕑 Retos anteriores
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pastMonthlies.map((q) => {
              const t = themeForMonthKey(q.monthKey)
              return (
                <div key={q.id} className="flex items-center gap-3 rounded-2xl border border-line/10 glass-panel p-3.5">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl"
                    style={{ background: `${t.colorA}22` }}
                    aria-hidden="true"
                  >
                    {t.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-ink-faint">{monthLabelOf(q.monthKey)}</p>
                    <p className="truncate text-sm font-bold text-ink">{t.epicTitle}</p>
                    <p className={`text-[11px] font-medium ${q.completed ? 'text-ok' : 'text-ink-faint'}`}>
                      {q.completed ? '✓ Completado' : 'No conquistado'}
                    </p>
                  </div>
                  {q.completed && <XpChip xp={q.xpValue} theme={t} />}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

/** Fila de entrada para forjar una misión (estilo "añadir tarea personalizada"). */
function ForgeRow({
  placeholder,
  ariaLabel,
  theme,
  onCreate,
}: {
  placeholder: string
  ariaLabel: string
  theme: MonthTheme
  onCreate: (title: string) => void
}) {
  const [title, setTitle] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    onCreate(t)
    setTitle('')
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 rounded-xl border border-dashed border-line/15 px-3 py-2">
      <span className="text-lg text-ink-faint" aria-hidden="true">
        +
      </span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="min-w-0 flex-1 border-none bg-transparent text-sm text-ink placeholder-ink-faint outline-none focus:shadow-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: `linear-gradient(135deg, ${theme.colorA}, ${theme.colorB})` }}
      >
        Forjar
      </button>
    </form>
  )
}

/** Paso de misión: checkbox + título editable + XP + eliminar. */
function StepRow({ step, theme }: { step: QuestStep; theme: MonthTheme }) {
  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-1 py-0.5">
      <button
        onClick={() => void setQuestStepCompleted(step.id, !step.completed)}
        aria-label={step.completed ? 'Marcar paso pendiente' : 'Completar paso'}
        className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          step.completed ? 'border-transparent' : 'border-ink-muted hover:scale-110'
        }`}
        style={step.completed ? { backgroundColor: theme.colorA } : undefined}
      >
        {step.completed && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-2.5" aria-hidden="true">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      <EditableStep step={step} />
      {!step.completed && <XpChip xp={QUEST_STEP_XP} theme={theme} />}
      <button
        onClick={() => void deleteQuestStep(step.id)}
        aria-label="Eliminar paso"
        className="flex size-6 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:text-danger"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

/** La gran misión del mes dentro de "Tareas del reto": título, pasos y candado de cierre. */
function MonthlyQuestBlock({
  quest,
  steps,
  theme,
  completeLocked,
}: {
  quest: Quest
  steps: QuestStep[]
  theme: MonthTheme
  /** En el mes en curso la main quest solo se completa cuando el mes termina. */
  completeLocked: boolean
}) {
  const [newStep, setNewStep] = useState('')

  function submitStep(e: FormEvent) {
    e.preventDefault()
    const t = newStep.trim()
    if (!t) return
    void createQuestStep(quest.id, t)
    setNewStep('')
  }

  return (
    <div
      className="rounded-xl border p-3"
      style={{
        borderColor: `${theme.colorA}55`,
        background: `linear-gradient(125deg, ${theme.colorA}24, ${theme.colorB}14 65%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: theme.colorA }}>
          👑 Gran misión del mes
        </p>
        <div className="flex items-center gap-2">
          <XpChip xp={quest.xpValue} theme={theme} />
          {!quest.completed && (
            <ConfirmButton label="Eliminar" confirmLabel="¿Seguro?" onConfirm={() => void deleteQuest(quest.id)} />
          )}
        </div>
      </div>
      <EditableTitle quest={quest} big />

      {steps.length > 0 && (
        <div className="mt-1 space-y-1">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} theme={theme} />
          ))}
        </div>
      )}

      {!quest.completed && (
        <form onSubmit={submitStep} className="mt-2">
          <input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            placeholder="+ Añadir tarea personalizada al reto…"
            aria-label={`Añadir paso a ${quest.title}`}
            className={`${inputClass} text-xs`}
          />
        </form>
      )}

      <div className="mt-2 flex items-center justify-end">
        {!quest.completed && completeLocked ? (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <LockIcon />
            Se conquista cuando termine el mes
          </span>
        ) : (
          <button
            onClick={() => void setQuestCompleted(quest.id, !quest.completed)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all ${
              quest.completed
                ? 'border border-line/15 text-ink-muted hover:bg-ink/5'
                : 'text-white shadow-md hover:opacity-90 active:scale-95'
            }`}
            style={
              quest.completed ? undefined : { background: `linear-gradient(135deg, ${theme.colorA}, ${theme.colorB})` }
            }
          >
            {quest.completed ? '✓ Conquistada · desmarcar' : `👑 Completar +${quest.xpValue} XP`}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Misión semanal como fila del reto: check para conquistarla, XP, y un
 * desplegable con sus pasos. Sin misión: forja inline o candado si no toca.
 */
function WeeklyQuestRow({
  quest,
  steps,
  week,
  rangeLabel,
  theme,
  highlight,
  locked,
  lockedReason,
  expanded,
  onToggleExpand,
  onCreate,
}: {
  quest: Quest | undefined
  steps: QuestStep[]
  week: number
  rangeLabel: string
  theme: MonthTheme
  highlight: boolean
  locked: boolean
  lockedReason: string | null
  expanded: boolean
  onToggleExpand: () => void
  onCreate: (title: string) => void
}) {
  const [newStep, setNewStep] = useState('')

  if (!quest) {
    if (locked) {
      return (
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-line/10 px-3 py-2.5 text-xs text-ink-faint opacity-75">
          <LockIcon className="size-4" />
          <span>
            ⚔ Semana {week} · {rangeLabel} — {lockedReason ?? 'No disponible'}
          </span>
        </div>
      )
    }
    return (
      <ForgeRow
        placeholder={`⚔ Forjar misión · Semana ${week} (${rangeLabel})…`}
        ariaLabel={`Misión de la semana ${week}`}
        theme={theme}
        onCreate={onCreate}
      />
    )
  }

  const doneSteps = steps.filter((s) => s.completed).length

  function submitStep(e: FormEvent) {
    e.preventDefault()
    if (!quest) return
    const t = newStep.trim()
    if (!t) return
    void createQuestStep(quest.id, t)
    setNewStep('')
  }

  return (
    <div
      className={`rounded-xl border transition-shadow ${highlight ? 'ring-2' : ''}`}
      style={{
        borderColor: `${theme.colorA}40`,
        background: `linear-gradient(125deg, ${theme.colorA}14, transparent 70%)`,
        ...(highlight ? ({ '--tw-ring-color': `${theme.colorA}55` } as React.CSSProperties) : {}),
      }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          onClick={() => void setQuestCompleted(quest.id, !quest.completed)}
          aria-label={quest.completed ? 'Desmarcar misión' : `Conquistar misión (+${quest.xpValue} XP)`}
          title={quest.completed ? 'Desmarcar' : `Conquistar · +${quest.xpValue} XP`}
          className={`flex size-5.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            quest.completed ? 'border-transparent' : 'border-ink-muted hover:scale-110'
          }`}
          style={quest.completed ? { backgroundColor: theme.colorA } : undefined}
        >
          {quest.completed && (
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <EditableTitle quest={quest} />
          <p className="text-[10px] text-ink-faint">
            ⚔ Semana {week} · {rangeLabel}
            {highlight && (
              <span className="font-semibold" style={{ color: theme.colorA }}>
                {' '}
                · esta semana
              </span>
            )}
            {steps.length > 0 && ` · ${doneSteps}/${steps.length} pasos`}
          </p>
        </div>
        {quest.completed ? (
          <span className="shrink-0 text-[11px] font-semibold text-ok">🏆 +{quest.xpValue} XP</span>
        ) : (
          <XpChip xp={quest.xpValue} theme={theme} />
        )}
        <button
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={expanded ? 'Ocultar pasos' : 'Ver pasos'}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`size-4 transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="space-y-1.5 border-t border-line/5 px-3 py-2.5">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} theme={theme} />
          ))}
          {!quest.completed && (
            <form onSubmit={submitStep}>
              <input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                placeholder="+ Añadir paso…"
                aria-label={`Añadir paso a ${quest.title}`}
                className={`${inputClass} text-xs`}
              />
            </form>
          )}
          {!quest.completed && (
            <div className="flex justify-end pt-0.5">
              <ConfirmButton label="Eliminar misión" confirmLabel="¿Seguro?" onConfirm={() => void deleteQuest(quest.id)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Paso de misión editable inline: toca el texto, corrige y sal (blur) para guardar. */
function EditableStep({ step }: { step: QuestStep }) {
  const [title, setTitle] = useState(step.title)

  function save() {
    const t = title.trim()
    if (t && t !== step.title) void updateQuestStep(step.id, { title: t })
    else setTitle(step.title)
  }

  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Título del paso"
      className={`min-w-0 flex-1 border-none bg-transparent text-sm outline-none focus:shadow-none ${
        step.completed ? 'text-ink-faint line-through' : 'text-ink-dim'
      }`}
    />
  )
}

function EditableTitle({ quest, big = false }: { quest: Quest; big?: boolean }) {
  const [title, setTitle] = useState(quest.title)
  const ref = useRef<HTMLTextAreaElement>(null)

  // Textarea auto-crecible: los títulos largos se muestran completos, sin cortar.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  function save() {
    const t = title.trim()
    if (t && t !== quest.title) void updateQuest(quest.id, { title: t })
    else setTitle(quest.title)
  }

  return (
    <textarea
      ref={ref}
      value={title}
      rows={1}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLTextAreaElement).blur()
        }
      }}
      aria-label="Título de la misión"
      className={`w-full resize-none overflow-hidden border-none bg-transparent font-bold outline-none focus:shadow-none ${
        big ? 'text-xl' : 'text-[15px]'
      } ${quest.completed ? 'text-ink-faint line-through' : 'text-ink'}`}
    />
  )
}
