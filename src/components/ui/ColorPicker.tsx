import { PALETTE } from '../../lib/colors'

interface ColorPickerProps {
  value: string | null
  onChange: (color: string | null) => void
  /** Permite la opción "sin color" (para tareas; las listas siempre tienen color). */
  allowNone?: boolean
}

export function ColorPicker({ value, onChange, allowNone = false }: ColorPickerProps) {
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
    </div>
  )
}
