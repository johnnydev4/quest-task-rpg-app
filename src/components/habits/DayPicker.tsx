import { WEEKDAY_ORDER, WEEKDAY_SHORT } from '../../lib/habits'

interface DayPickerProps {
  value: number[]
  onChange: (days: number[]) => void
  /** Color de resaltado; por defecto el acento. */
  color?: string
}

/** Selector de días de la semana (L…D) para hábitos. */
export function DayPicker({ value, onChange, color }: DayPickerProps) {
  function toggle(day: number) {
    onChange(value.includes(day) ? value.filter((d) => d !== day) : [...value, day])
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de la semana">
      {WEEKDAY_ORDER.map((day) => {
        const active = value.includes(day)
        return (
          <button
            key={day}
            type="button"
            onClick={() => toggle(day)}
            aria-pressed={active}
            aria-label={`Día ${WEEKDAY_SHORT[day]}`}
            className={`flex size-8 items-center justify-center rounded-full border text-xs font-bold transition-all ${
              active ? 'scale-105 text-white' : 'border-line/15 text-ink-muted hover:bg-ink/5'
            }`}
            style={
              active
                ? { backgroundColor: color ?? 'var(--t-accent-600)', borderColor: 'transparent' }
                : undefined
            }
          >
            {WEEKDAY_SHORT[day]}
          </button>
        )
      })}
    </div>
  )
}
