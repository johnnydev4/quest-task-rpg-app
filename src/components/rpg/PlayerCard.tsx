import { useEffect, useState } from 'react'
import { onCompletion } from '../../lib/events'
import { useProfile } from '../../lib/useProfile'
import { titleForLevel } from '../../lib/titles'

/** Tarjeta del jugador en la sidebar: nivel, título, barra de XP y racha. */
export function PlayerCard() {
  const { level, intoLevel, needed, streak } = useProfile()
  const [gain, setGain] = useState<{ xp: number; key: number } | null>(null)

  useEffect(
    () =>
      onCompletion((d) => {
        if (d.xp > 0) setGain({ xp: d.xp, key: Date.now() })
      }),
    [],
  )

  useEffect(() => {
    if (!gain) return
    const t = setTimeout(() => setGain(null), 1400)
    return () => clearTimeout(t)
  }, [gain])

  const pct = Math.min(100, Math.round((intoLevel / needed) * 100))

  return (
    <div className="mb-4 rounded-xl border border-line/5 glass-panel p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-400 to-accent-600 text-xs font-bold text-on-accent">
            {level}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-ink">Nivel {level}</span>
            <span className="text-[11px] font-medium text-accent-300">{titleForLevel(level)}</span>
          </span>
        </span>
        {gain && (
          <span
            key={gain.key}
            className="text-xs font-bold text-accent-300"
            style={{ animation: 'xp-float 1.4s ease-out both' }}
          >
            +{gain.xp} XP
          </span>
        )}
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-ink/5"
        role="progressbar"
        aria-valuenow={intoLevel}
        aria-valuemax={needed}
        aria-label={`Progreso al nivel ${level + 1}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-400 to-accent-600 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-faint">
        <span>
          {intoLevel}/{needed} XP
        </span>
        <span className={streak > 0 ? 'font-medium text-warn' : ''}>
          {streak > 0 ? `🔥 ${streak} día${streak === 1 ? '' : 's'}` : '✨ Empieza tu racha hoy'}
        </span>
      </div>
    </div>
  )
}
