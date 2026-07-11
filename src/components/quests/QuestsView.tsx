import { useMemo, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Quest, QuestStep } from '../../db/types'
import {
  createQuest,
  createQuestStep,
  deleteQuest,
  deleteQuestStep,
  MONTHLY_QUEST_XP,
  setQuestCompleted,
  setQuestStepCompleted,
  updateQuest,
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
  'w-full rounded-lg border border-line/10 bg-surface-700 px-3 py-2 text-sm text-ink placeholder-ink-faint outline-none transition-colors focus:border-accent-500/60'

export function QuestsView() {
  const [monthOffset, setMonthOffset] = useState(0)

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

  // Solo se pueden mirar: meses pasados, el actual y uno por delante.
  // A partir de +2 el mes queda sellado (sin revelar criatura ni tema).
  const sealed = monthOffset >= 2

  if (sealed) {
    const sealedNav =
      'flex size-8 items-center justify-center rounded-lg border border-line/15 text-ink-dim transition-colors hover:bg-ink/5 disabled:opacity-40 disabled:hover:bg-transparent'
    return (
      <div className="space-y-5">
        <section className="relative min-h-52 overflow-hidden rounded-3xl border border-line/10 glass-strong p-6 shadow-xl">
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
      {/* Héroe del mes */}
      <section
        className="relative min-h-44 overflow-hidden rounded-3xl border border-line/10 p-6 shadow-xl"
        style={{ background: `linear-gradient(135deg, ${theme.colorA}, ${theme.colorB})` }}
      >
        {theme.image ? (
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
        <div className="relative space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-widest text-white/80 uppercase">
              Main quest · {monthLabelOf(monthKey)}
            </p>
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
          <h2 className="text-3xl font-black tracking-tight text-white drop-shadow-sm">{theme.epicTitle}</h2>
          <p className="max-w-md text-sm text-white/85 italic">"{theme.motto}"</p>
          {totalUnits > 0 && !monthly?.completed && (
            <div className="max-w-md pt-2">
              <div className="h-2 overflow-hidden rounded-full bg-black/25">
                <div
                  className="h-full rounded-full bg-white/90 transition-all duration-500"
                  style={{ width: `${Math.round(monthProgress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-white/75">
                {doneUnits}/{totalUnits} gestas cumplidas este mes
              </p>
            </div>
          )}
          {monthly?.completed && (
            <p className="pt-1 text-sm font-bold text-white">🏆 ¡Misión del mes conquistada! +{MONTHLY_QUEST_XP} XP</p>
          )}
        </div>
      </section>

      {/* Main quest del mes */}
      <QuestCard
        quest={monthly}
        steps={monthlySteps}
        theme={theme}
        big
        heading={`La gran misión de ${monthLabelOf(monthKey).split(' ')[0].toLowerCase()}`}
        placeholder={`¿Cuál es tu gran gesta del mes? (p. ej. "Terminar el curso de…")`}
        locked={!isCurrentMonth}
        lockedReason={monthLockReason}
        onCreate={(title) => void createQuest(monthKey, 0, title)}
      />

      {/* Misiones semanales */}
      <div className="grid gap-4 sm:grid-cols-2">
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
            <QuestCard
              key={week}
              quest={quest}
              steps={stepsOf(quest)}
              theme={theme}
              heading={`Semana ${week} · ${weekRangeLabel(monthKey, week)}`}
              placeholder="Tu misión de esta semana…"
              highlight={currentWeek === week}
              locked={locked}
              lockedReason={lockedReason}
              onCreate={(title) => void createQuest(monthKey, week, title)}
            />
          )
        })}
      </div>

      <p className="text-xs text-ink-faint">
        Las tareas normales son tus side quests. Las misiones dan XP épico: +{WEEKLY_QUEST_XP} por semana
        conquistada, +{MONTHLY_QUEST_XP} por la gesta del mes.
      </p>
    </div>
  )
}

function QuestCard({
  quest,
  steps,
  theme,
  heading,
  placeholder,
  big = false,
  highlight = false,
  locked = false,
  lockedReason = null,
  onCreate,
}: {
  quest: Quest | undefined
  steps: QuestStep[]
  theme: MonthTheme
  heading: string
  placeholder: string
  big?: boolean
  highlight?: boolean
  locked?: boolean
  lockedReason?: string | null
  onCreate: (title: string) => void
}) {
  const [newTitle, setNewTitle] = useState('')
  const [newStep, setNewStep] = useState('')

  function submitCreate(e: FormEvent) {
    e.preventDefault()
    const t = newTitle.trim()
    if (!t) return
    onCreate(t)
    setNewTitle('')
  }

  function submitStep(e: FormEvent) {
    e.preventDefault()
    if (!quest) return
    const t = newStep.trim()
    if (!t) return
    void createQuestStep(quest.id, t)
    setNewStep('')
  }

  const doneSteps = steps.filter((s) => s.completed).length

  return (
    <section
      className={`relative overflow-hidden rounded-2xl border p-4 glass-panel ${
        highlight ? 'ring-2' : ''
      }`}
      style={{
        borderColor: `${theme.colorA}55`,
        background: `linear-gradient(125deg, ${theme.colorA}24, ${theme.colorB}14 65%, transparent)`,
        ...(highlight ? ({ '--tw-ring-color': `${theme.colorA}66` } as React.CSSProperties) : {}),
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: theme.colorA }}>
          {big ? '👑 ' : '⚔ '}
          {heading}
          {highlight && ' · esta semana'}
        </p>
        {quest && !quest.completed && (
          <ConfirmButton
            label="Eliminar"
            confirmLabel="¿Seguro?"
            onConfirm={() => void deleteQuest(quest.id)}
          />
        )}
      </div>

      {!quest ? (
        locked ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-line/15 px-3 py-2.5 text-xs text-ink-faint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{lockedReason ?? 'No disponible'}</span>
          </div>
        ) : (
          <form onSubmit={submitCreate} className="mt-3 flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={placeholder}
              aria-label={heading}
              className={inputClass}
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: `linear-gradient(135deg, ${theme.colorA}, ${theme.colorB})` }}
            >
              Forjar
            </button>
          </form>
        )
      ) : (
        <div className="mt-2 space-y-3">
          <EditableTitle quest={quest} big={big} />

          {steps.length > 0 && (
            <div className="space-y-1">
              {steps.map((s) => (
                <div key={s.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-0.5">
                  <button
                    onClick={() => void setQuestStepCompleted(s.id, !s.completed)}
                    aria-label={s.completed ? 'Marcar paso pendiente' : 'Completar paso'}
                    className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      s.completed ? 'border-transparent' : 'border-ink-muted hover:scale-110'
                    }`}
                    style={s.completed ? { backgroundColor: theme.colorA } : undefined}
                  >
                    {s.completed && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-2.5" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className={`min-w-0 flex-1 truncate text-sm ${s.completed ? 'text-ink-faint line-through' : 'text-ink-dim'}`}>
                    {s.title}
                  </span>
                  <button
                    onClick={() => void deleteQuestStep(s.id)}
                    aria-label="Eliminar paso"
                    className="flex size-5 shrink-0 items-center justify-center rounded text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden="true">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {!quest.completed && (
            <form onSubmit={submitStep}>
              <input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                placeholder="Añadir paso…"
                aria-label={`Añadir paso a ${quest.title}`}
                className={`${inputClass} text-xs`}
              />
            </form>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            {steps.length > 0 ? (
              <span className="text-[11px] text-ink-faint">
                {doneSteps}/{steps.length} pasos
              </span>
            ) : (
              <span />
            )}
            <button
              onClick={() => void setQuestCompleted(quest.id, !quest.completed)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all ${
                quest.completed ? 'border border-line/15 text-ink-muted hover:bg-ink/5' : 'text-white shadow-md hover:opacity-90 active:scale-95'
              }`}
              style={
                quest.completed
                  ? undefined
                  : { background: `linear-gradient(135deg, ${theme.colorA}, ${theme.colorB})` }
              }
            >
              {quest.completed
                ? '✓ Conquistada · desmarcar'
                : `${big ? '👑' : '⚔'} Completar +${quest.xpValue} XP`}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function EditableTitle({ quest, big }: { quest: Quest; big: boolean }) {
  const [title, setTitle] = useState(quest.title)

  function save() {
    const t = title.trim()
    if (t && t !== quest.title) void updateQuest(quest.id, { title: t })
    else setTitle(quest.title)
  }

  return (
    <input
      value={title}
      onChange={(e) => setTitle(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label="Título de la misión"
      className={`w-full border-none bg-transparent font-bold outline-none ${
        big ? 'text-xl' : 'text-base'
      } ${quest.completed ? 'text-ink-faint line-through' : 'text-ink'}`}
    />
  )
}
