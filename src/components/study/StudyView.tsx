import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { AmbientSoundId } from '../../db/types'
import { PHASE_LABEL, pomodoro, type PomodoroSnapshot } from '../../services/pomodoro'
import { AMBIENT_SOUNDS, setAmbientSuspended, startAmbient, stopAmbient } from '../../services/ambient'
import { getSettings, updateSettings } from '../../db/repo/settings'
import { useSettings } from '../../lib/useSettings'
import { localDateKey } from '../../lib/dates'

function useTimer(): PomodoroSnapshot {
  return useSyncExternalStore(pomodoro.subscribe, pomodoro.getSnapshot)
}

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const selectClass =
  'w-full rounded-lg border border-line/10 bg-surface-700 px-3 py-2 text-sm text-ink outline-none focus:border-accent-500/60'

function Ring({ progress, label, sub }: { progress: number; label: string; sub: string }) {
  const r = 110
  const c = 2 * Math.PI * r
  return (
    <div className="relative flex items-center justify-center">
      <svg width="260" height="260" viewBox="0 0 260 260" className="-rotate-90">
        <circle cx="130" cy="130" r={r} fill="none" strokeWidth="10" className="stroke-ink/10" />
        <circle
          cx="130"
          cy="130"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          className="stroke-accent-500 transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center gap-1">
        <span className="font-mono text-5xl font-bold text-ink tabular-nums">{label}</span>
        <span className="text-sm text-ink-muted">{sub}</span>
      </div>
    </div>
  )
}

type DurationKey = 'pomodoroFocusMin' | 'pomodoroShortBreakMin' | 'pomodoroLongBreakMin'

// Serializa los ajustes de duración: varios clics rápidos de +/− se aplican
// uno tras otro leyendo siempre el valor ya guardado (sin perder pasos).
let durationQueue: Promise<void> = Promise.resolve()

function adjustDuration(key: DurationKey, delta: number, min: number, max: number): void {
  durationQueue = durationQueue.then(async () => {
    const s = await getSettings()
    const next = Math.max(min, Math.min(max, s[key] + delta))
    if (next !== s[key]) await updateSettings({ [key]: next })
  })
}

function DurationStepper({
  label,
  settingKey,
  value,
  step,
  min,
  max,
}: {
  label: string
  settingKey: DurationKey
  value: number
  step: number
  min: number
  max: number
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  // Botones grandes (44px táctiles) sobre cristal líquido: fáciles de acertar.
  const stepBtn =
    'flex size-11 items-center justify-center rounded-xl border border-line/10 text-xl font-bold text-ink-dim transition-all hover:bg-ink/10 hover:text-ink active:scale-95'
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-line/10 glass-panel px-4 py-3">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => adjustDuration(settingKey, -step, min, max)} aria-label={`Reducir ${label}`} className={stepBtn}>
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => updateSettings({ [settingKey]: clamp(Number(e.target.value) || min) })}
          aria-label={`Minutos de ${label}`}
          className="w-14 [appearance:textfield] border-none bg-transparent text-center text-2xl font-bold text-ink outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => adjustDuration(settingKey, step, min, max)} aria-label={`Aumentar ${label}`} className={stepBtn}>
          +
        </button>
      </div>
      <span className="text-[11px] text-ink-faint">minutos</span>
    </div>
  )
}

function Controls({ timer }: { timer: PomodoroSnapshot }) {
  const btn =
    'rounded-xl border border-line/10 px-4 py-2.5 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5'
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {timer.status === 'running' ? (
        <button onClick={() => pomodoro.pause()} className={btn}>
          Pausar
        </button>
      ) : (
        <button
          onClick={() => pomodoro.resume()}
          className="rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-500"
        >
          Reanudar
        </button>
      )}
      <button onClick={() => pomodoro.skip()} className={btn}>
        Saltar fase
      </button>
      <button onClick={() => pomodoro.reset()} className={btn}>
        Terminar
      </button>
    </div>
  )
}

export function StudyView() {
  const timer = useTimer()
  const settings = useSettings()
  const lists = useLiveQuery(() => db.lists.orderBy('order').toArray(), []) ?? []
  const pendingTasks =
    useLiveQuery(async () => (await db.tasks.toArray()).filter((t) => !t.completed), []) ?? []
  const todayMinutes =
    useLiveQuery(async () => {
      const sessions = await db.studySessions.where('dateKey').equals(localDateKey()).toArray()
      return sessions.reduce((sum, s) => sum + s.focusMinutes, 0)
    }, []) ?? 0

  const linkedTask = useLiveQuery(
    async () => (timer.linkTaskId ? await db.tasks.get(timer.linkTaskId) : undefined),
    [timer.linkTaskId],
  )
  const linkedHabit = useLiveQuery(
    async () => (timer.linkHabitId ? await db.habits.get(timer.linkHabitId) : undefined),
    [timer.linkHabitId],
  )
  const activeHabits =
    useLiveQuery(async () => {
      const all = await db.habits.toArray()
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return all.filter((h) => h.endDate === null || h.endDate >= today.getTime())
    }, []) ?? []

  const progress = timer.totalMs > 0 ? 1 - timer.remainingMs / timer.totalMs : 0
  const running = timer.status !== 'idle'

  // Pausa manual del sonido ambiental durante la sesión.
  const [soundPaused, setSoundPaused] = useState(false)
  useEffect(() => {
    if (timer.status === 'idle') setSoundPaused(false)
  }, [timer.status])

  function selectAmbient(id: AmbientSoundId) {
    void updateSettings({ ambientSound: id })
    setSoundPaused(false)
    setAmbientSuspended(false)
    if (id === 'none') {
      stopAmbient()
    } else if (timer.phase === 'focus' && timer.status === 'running' && settings.soundEnabled) {
      startAmbient(id, settings.ambientVolume)
    }
  }

  function toggleSoundPause() {
    if (soundPaused) {
      setAmbientSuspended(false)
      if (timer.phase === 'focus' && timer.status === 'running') {
        startAmbient(settings.ambientSound, settings.ambientVolume)
      }
    } else {
      setAmbientSuspended(true)
    }
    setSoundPaused(!soundPaused)
  }

  // Selectores de vínculo (tarea/hábito/lista): disponibles antes de la sesión
  // y también durante la sesión minimizada (vincular en caliente ajusta el tiempo).
  const linkSelectors = (
    <div className="grid w-full gap-4 sm:grid-cols-3">
      <label className="space-y-1.5">
        <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">Vincular a tarea</span>
        <select
          value={timer.linkTaskId ?? ''}
          onChange={(e) => void pomodoro.setLink({ taskId: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Sin tarea</option>
          {pendingTasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.pomodoroMinutes != null ? ` · ${t.pomodoroMinutes} min` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">Vincular a hábito</span>
        <select
          value={timer.linkHabitId ?? ''}
          onChange={(e) => void pomodoro.setLink({ habitId: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Sin hábito</option>
          {activeHabits.map((h) => (
            <option key={h.id} value={h.id}>
              {h.title}
              {h.pomodoroMinutes != null ? ` · ${h.pomodoroMinutes} min` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">Vincular a lista</span>
        <select
          value={timer.linkListId ?? ''}
          onChange={(e) => void pomodoro.setLink({ listId: e.target.value || null })}
          className={selectClass}
        >
          <option value="">Sin lista</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )

  // Modo foco: sesión activa → pantalla limpia sin distracciones (spec §8).
  // Minimizada: tarjeta normal aquí + mini-temporizador flotante en el resto de la app.
  if (running) {
    const sessionContent = (
      <>
        <span
          className={`rounded-full border px-4 py-1 text-sm font-medium ${
            timer.phase === 'focus'
              ? 'border-accent-500/40 bg-accent-500/10 text-accent-300'
              : 'border-ok/40 bg-ok/10 text-ok'
          }`}
        >
          {PHASE_LABEL[timer.phase]}
          {timer.status === 'paused' && ' · en pausa'}
        </span>
        <Ring
          progress={progress}
          label={mmss(timer.remainingMs)}
          sub={linkedTask?.title ?? linkedHabit?.title ?? 'Sesión de estudio'}
        />
        <div className="flex items-center gap-1.5" aria-label={`${timer.pomodorosDone} pomodoros completados`}>
          {Array.from({ length: Math.max(4, timer.pomodorosDone) }).map((_, i) => (
            <span
              key={i}
              className={`size-2 rounded-full ${i < timer.pomodorosDone ? 'bg-accent-500' : 'bg-ink/10'}`}
            />
          ))}
        </div>
        <Controls timer={timer} />
        {/* Sonido ambiental en plena sesión: cambiar, pausar o reanudar sin salir */}
        {timer.phase === 'focus' && settings.soundEnabled && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {AMBIENT_SOUNDS.map((s) => (
              <button
                key={s.id}
                onClick={() => selectAmbient(s.id)}
                aria-pressed={settings.ambientSound === s.id}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  settings.ambientSound === s.id
                    ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                    : 'border-line/10 text-ink-faint hover:bg-ink/5 hover:text-ink-dim'
                }`}
              >
                {s.label}
              </button>
            ))}
            {settings.ambientSound !== 'none' && (
              <button
                onClick={toggleSoundPause}
                aria-label={soundPaused ? 'Reanudar sonido ambiental' : 'Pausar sonido ambiental'}
                className="flex size-7 items-center justify-center rounded-full border border-line/10 text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink"
              >
                {soundPaused ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5" aria-hidden="true">
                    <path d="M8 5.14v13.72L19 12z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5" aria-hidden="true">
                    <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
                  </svg>
                )}
              </button>
            )}
          </div>
        )}
      </>
    )

    // Minimizada: tarjeta dentro de la vista Estudio; el resto de la app queda usable.
    if (timer.minimized) {
      return (
        <div className="flex flex-col items-center gap-8 rounded-2xl border border-line/5 glass-panel px-6 py-8">
          {sessionContent}
          {linkSelectors}
          <button
            onClick={() => pomodoro.setMinimized(false)}
            className="flex items-center gap-1.5 rounded-xl border border-line/10 px-4 py-2 text-sm font-medium text-ink-dim transition-colors hover:bg-ink/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="m21 3-7 7" />
              <path d="m3 21 7-7" />
            </svg>
            Pantalla completa
          </button>
        </div>
      )
    }

    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-surface-900/85 px-6 backdrop-blur-xl">
        <button
          onClick={() => pomodoro.setMinimized(true)}
          aria-label="Minimizar modo estudio"
          title="Minimizar: el temporizador sigue mientras usas la app"
          className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex size-10 items-center justify-center rounded-xl border border-line/10 text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <path d="M4 14h6v6" />
            <path d="M20 10h-6V4" />
            <path d="m14 10 7-7" />
            <path d="m3 21 7-7" />
          </svg>
        </button>
        {sessionContent}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-line/5 glass-panel px-6 py-8">
        <Ring progress={0} label={mmss(settings.pomodoroFocusMin * 60_000)} sub="Listo para enfocar" />
        <button
          onClick={() => pomodoro.start({ taskId: timer.linkTaskId, listId: timer.linkListId })}
          className="rounded-xl bg-accent-600 px-8 py-3 text-base font-semibold text-on-accent shadow-lg shadow-accent-600/25 transition-all hover:bg-accent-500 active:scale-95"
        >
          Iniciar foco
        </button>
        {/* Duraciones de la sesión de hoy, editables aquí mismo (también viven en Ajustes) */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <DurationStepper
            label="Foco"
            settingKey="pomodoroFocusMin"
            value={settings.pomodoroFocusMin}
            step={5}
            min={1}
            max={180}
          />
          <DurationStepper
            label="Descanso"
            settingKey="pomodoroShortBreakMin"
            value={settings.pomodoroShortBreakMin}
            step={1}
            min={1}
            max={60}
          />
          <DurationStepper
            label="D. largo"
            settingKey="pomodoroLongBreakMin"
            value={settings.pomodoroLongBreakMin}
            step={5}
            min={1}
            max={90}
          />
        </div>
        <p className="text-xs text-ink-faint">
          Hoy llevas <span className="font-semibold text-accent-300">{todayMinutes} min</span> de foco
        </p>
      </div>

      {linkSelectors}
      <p className="text-[11px] text-ink-faint">
        Si la tarea o el hábito vinculado tiene un pomodoro asignado, el temporizador pasa a ese tiempo
        restando lo ya transcurrido.
      </p>

      <div className="space-y-1.5">
        <span className="block text-xs font-medium tracking-wide text-ink-faint uppercase">
          Sonido ambiental durante el foco
        </span>
        <div className="flex flex-wrap gap-2">
          {AMBIENT_SOUNDS.map((s) => (
            <button
              key={s.id}
              onClick={() => updateSettings({ ambientSound: s.id })}
              aria-pressed={settings.ambientSound === s.id}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                settings.ambientSound === s.id
                  ? 'border-accent-500/50 bg-accent-500/15 text-accent-300'
                  : 'border-line/10 text-ink-muted hover:bg-ink/5'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {settings.ambientSound !== 'none' && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.ambientVolume}
            onChange={(e) => updateSettings({ ambientVolume: Number(e.target.value) })}
            aria-label="Volumen ambiental"
            className="mt-2 w-full max-w-xs"
            style={{ accentColor: 'var(--color-accent-500)' }}
          />
        )}
      </div>

      <p className="text-xs text-ink-faint">
        Cada minuto de foco real suma 1 XP. Los cambios de duración aplican a la próxima fase.
      </p>
    </div>
  )
}
