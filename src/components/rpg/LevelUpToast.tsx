import { useEffect } from 'react'
import { isNewTitleAt, titleForLevel } from '../../lib/titles'

interface LevelUpToastProps {
  level: number
  onDone: () => void
}

/** Celebración de subida de nivel: destello sutil y desvanecido, sin estridencias (spec §7). */
export function LevelUpToast({ level, onDone }: LevelUpToastProps) {
  const newTitle = isNewTitleAt(level)

  useEffect(() => {
    const t = setTimeout(onDone, newTitle ? 3200 : 2500)
    return () => clearTimeout(t)
  }, [onDone, newTitle])

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
      aria-live="polite"
    >
      <div
        className="absolute size-64 rounded-full bg-accent-500/40 blur-3xl"
        style={{ animation: 'glow-ring 1.8s ease-out forwards' }}
        aria-hidden="true"
      />
      <div
        className="relative flex flex-col items-center gap-2.5 rounded-2xl border border-accent-500/30 glass-strong px-10 py-7 shadow-2xl backdrop-blur-md"
        style={{
          animation: `levelup-in 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.15) both, levelup-out 0.4s ease-in ${newTitle ? '2.7s' : '2s'} both`,
        }}
      >
        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-xl font-bold text-on-accent shadow-lg shadow-accent-500/40">
          {level}
        </div>
        <p className="text-xl font-bold text-ink">¡Nivel {level}!</p>
        {newTitle ? (
          <p className="flex items-center gap-1.5 rounded-full border border-accent-500/40 bg-accent-500/10 px-3 py-1 text-sm font-semibold text-accent-300">
            ⚔ Nuevo título: {titleForLevel(level)}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Tu constancia está dando frutos</p>
        )}
      </div>
    </div>
  )
}
