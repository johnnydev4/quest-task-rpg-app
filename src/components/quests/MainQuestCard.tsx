import { useEffect, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import {
  dismissMainQuest,
  isRewardDue,
  mainQuestXpFor,
  setMainQuest,
  setMainQuestCompleted,
} from '../../db/repo/mainQuests'
import { localDateKey, mondayOf, weekKeyOf } from '../../lib/dates'
import { LOCALE, t } from '../../lib/i18n'
import { useProfile } from '../../lib/useProfile'
import { CrownIcon, PencilIcon, TrophyIcon } from '../ui/icons'

/**
 * MAIN QUEST de la semana, encima de las tareas de Hoy. Cada lunes arranca una
 * semana nueva: el usuario escribe cuál es su tarea principal (o la descarta).
 * Completarla vale el 20% del XP de su nivel, que se entrega el domingo.
 */
export function MainQuestCard() {
  // El día se recalcula al volver a la app y cada minuto: así el cambio de
  // semana (medianoche del lunes) y la llegada del domingo se reflejan sin recargar.
  const [today, setToday] = useState(() => localDateKey())
  useEffect(() => {
    const tick = () => setToday((prev) => (prev === localDateKey() ? prev : localDateKey()))
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [])

  const weekKey = weekKeyOf()
  const quest = useLiveQuery(() => db.mainQuests.get(weekKey), [weekKey, today])
  const { totalXp } = useProfile()
  const xp = mainQuestXpFor(totalXp)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // El aviso de descarte se desarma solo (como ConfirmButton).
  useEffect(() => {
    if (!confirmDiscard) return
    const id = setTimeout(() => setConfirmDiscard(false), 4000)
    return () => clearTimeout(id)
  }, [confirmDiscard])

  if (quest === undefined) return null
  if (quest?.dismissed) return null

  const weekLabel = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(mondayOf())
  const isMonday = new Date().getDay() === 1
  const rewardDue = isRewardDue(weekKey, today)

  function submit(e: FormEvent) {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    void setMainQuest(title, weekKey)
    setDraft('')
    setEditing(false)
  }

  function startEdit() {
    setDraft(quest?.title ?? '')
    setEditing(true)
  }

  function discard() {
    if (!confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    setConfirmDiscard(false)
    void dismissMainQuest(weekKey)
  }

  const header = (
    <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-widest text-accent-300 uppercase">
      <CrownIcon className="size-3.5" /> Main quest
      <span className="font-medium tracking-normal text-ink-muted normal-case">
        · {t(`Week of ${weekLabel}`, `Semana del ${weekLabel}`)}
      </span>
    </p>
  )

  const shell =
    'relative w-full overflow-hidden rounded-2xl border border-accent-500/40 p-4 glass-strong'
  const shellStyle = {
    background:
      'linear-gradient(120deg, color-mix(in srgb, var(--t-accent-500) 26%, transparent), color-mix(in srgb, var(--t-accent-700) 10%, transparent) 70%)',
    boxShadow:
      'inset 0 1px 0 0 rgba(255,255,255,0.14), 0 10px 26px -12px color-mix(in srgb, var(--t-accent-500) 60%, transparent)',
  }

  // Sin main quest elegida (o editando la actual): formulario.
  if (!quest || !quest.title || editing) {
    return (
      <section className={shell} style={shellStyle} aria-label="Main quest">
        {header}
        <p className="mt-1 text-sm text-ink-dim">
          {editing
            ? t('Rename your main quest for this week.', 'Cambia el nombre de tu main quest de esta semana.')
            : isMonday
              ? t(
                  "New week. What's the one quest you must conquer before Sunday?",
                  'Semana nueva. ¿Cuál es la misión que debes conquistar antes del domingo?',
                )
              : t(
                  "What's the one quest you must conquer before Sunday?",
                  '¿Cuál es la misión que debes conquistar antes del domingo?',
                )}
        </p>
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            autoFocus={editing}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('Your main quest…', 'Tu main quest…')}
            maxLength={120}
            className="glass-input min-w-0 flex-1 rounded-xl border border-line/15 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent-500/60 focus:outline-none"
          />
          <div className="flex shrink-0 gap-2">
            <button
              type="submit"
              disabled={!draft.trim()}
              className="flex-1 rounded-xl bg-accent-600 px-3 py-2 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-500 disabled:opacity-50 sm:flex-none"
            >
              {editing ? t('Save', 'Guardar') : t('Set main quest', 'Elegir main quest')}
            </button>
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : discard())}
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                !editing && confirmDiscard
                  ? 'border-danger/60 bg-danger/20 text-danger'
                  : 'border-line/15 text-ink-muted hover:bg-ink/5'
              }`}
            >
              {editing
                ? t('Cancel', 'Cancelar')
                : confirmDiscard
                  ? t('Skip? Tap again', '¿Saltar? Toca otra vez')
                  : t('Skip this week', 'Saltar esta semana')}
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-ink-muted">
          {t(
            `Completing it earns 20% of your level (+${xp} XP), delivered on Sunday.`,
            `Completarla da el 20% de tu nivel (+${xp} XP), entregado el domingo.`,
          )}
        </p>
      </section>
    )
  }

  const rewarded = quest.rewardedAt !== null

  return (
    <section className={shell} style={shellStyle} aria-label="Main quest">
      <div className="flex items-center justify-between gap-2">
        {header}
        <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] font-medium text-ink-muted">
          {rewarded ? (
            <>
              <TrophyIcon className="size-3.5 text-accent-300" /> {t('Conquered', 'Conquistada')} · +{quest.rewardXp} XP
            </>
          ) : quest.completed ? (
            rewardDue ? (
              t('Reward on its way', 'Recompensa en camino')
            ) : (
              t(`+${xp} XP on Sunday`, `+${xp} XP el domingo`)
            )
          ) : (
            t(`20% of your level · +${xp} XP`, `20% de tu nivel · +${xp} XP`)
          )}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void setMainQuestCompleted(weekKey, !quest.completed)}
          disabled={rewarded}
          aria-pressed={quest.completed}
          aria-label={quest.completed ? t('Mark as not done', 'Marcar como no hecha') : t('Mark as done', 'Marcar como hecha')}
          className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            quest.completed
              ? 'border-accent-500 bg-accent-500 text-on-accent'
              : 'border-ink-muted text-transparent hover:border-accent-400'
          } disabled:cursor-default`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="m5 12 5 5L20 7" />
          </svg>
        </button>
        <p
          className={`min-w-0 flex-1 text-base font-bold break-words ${
            quest.completed ? 'text-ink-faint line-through' : 'text-ink'
          }`}
        >
          {quest.title}
        </p>
        {!rewarded && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={startEdit}
              aria-label={t('Rename main quest', 'Renombrar main quest')}
              className="flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink"
            >
              <PencilIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={discard}
              aria-label={t('Discard this week’s main quest', 'Descartar la main quest de esta semana')}
              className={`flex h-8 items-center justify-center rounded-lg transition-colors ${
                confirmDiscard
                  ? 'bg-danger/20 px-2 text-xs font-semibold text-danger'
                  : 'size-8 text-ink-muted hover:bg-ink/10 hover:text-ink'
              }`}
            >
              {confirmDiscard ? (
                t('Discard?', '¿Descartar?')
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {quest.completed && !rewarded && (
        <p className="mt-2 text-xs text-ink-muted">
          {rewardDue
            ? t('Week closed: your reward is being delivered.', 'Semana cerrada: tu recompensa se está entregando.')
            : t(
                'Done! Your XP lands on Sunday when the week closes.',
                '¡Hecha! Tu XP llega el domingo, al cerrar la semana.',
              )}
        </p>
      )}
    </section>
  )
}
