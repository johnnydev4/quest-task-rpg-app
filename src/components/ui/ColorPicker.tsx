import { PALETTE } from '../../lib/colors'

interface ColorPickerProps {
  value: string | null
  onChange: (color: string | null) => void
  /** Permite la opción "sin color" (para tareas; las listas siempre tienen color). */
  allowNone?: boolean
  /** Añade un pozal arcoíris para elegir cualquier color fuera de la paleta. */
  allowCustom?: boolean
}

export function ColorPicker({ value, onChange, allowNone = false, allowCustom = false }: ColorPickerProps) {
  const isCustom = value !== null && !PALETTE.includes(value)
  return (
    <div className="flex flex-wrap gap-2">
      {allowNone && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Sin color"
          aria-pressed={value === null}
          className={`flex size-8 items-center justify-center rounded-full border-2 text-ink-faint transition-all ${
            value === null ? 'border-ink' : 'border-line/15 hover:border-line/40'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M5.6 5.6l12.8 12.8" />
          </svg>
        </button>
      )}
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={`Color ${color}`}
          aria-pressed={value === color}
          className={`size-8 rounded-full border-2 transition-all ${
            value === color ? 'scale-110 border-ink' : 'border-transparent hover:scale-105'
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
      {allowCustom && (
        <label className="relative cursor-pointer" title="Cualquier color">
          <span
            aria-hidden="true"
            className={`block size-8 rounded-full border-2 transition-all ${
              isCustom ? 'scale-110 border-ink' : 'border-transparent hover:scale-105'
            }`}
            style={
              isCustom
                ? { backgroundColor: value! }
                : {
                    background:
                      'conic-gradient(from 0deg, #ef4444, #f59e0b, #facc15, #22c55e, #0ea5e9, #6366f1, #a855f7, #ec4899, #ef4444)',
                  }
            }
          />
          <input
            type="color"
            value={isCustom ? value! : '#8b5cf6'}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Color personalizado"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      )}
    </div>
  )
}
