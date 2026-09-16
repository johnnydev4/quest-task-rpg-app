import { StarIcon } from './icons'

interface StarRatingProps {
  /** Estrellas ganadas (1-5) o null si el elemento aún no se ha valorado. */
  value: number | null
  /** Ausente = solo lectura (insignia); presente = se puede puntuar. */
  onChange?: (value: number | null) => void
  /** Tamaño de cada estrella (clase de Tailwind). */
  className?: string
  /** Descripción para lectores de pantalla del grupo de estrellas. */
  label?: string
}

const STARS = [1, 2, 3, 4, 5]

/**
 * Valoración de 1 a 5 estrellas. Pulsar la estrella ya marcada quita la
 * valoración, que es la forma natural de "deshacer" sin un botón extra.
 * Sin `onChange` se pinta como insignia de solo lectura.
 */
export function StarRating({ value, onChange, className = 'size-4', label = 'Valoración' }: StarRatingProps) {
  const filled = value ?? 0

  if (!onChange) {
    return (
      <span className="inline-flex items-center gap-px text-amber-400" title={`${filled} de 5`} aria-label={`${label}: ${filled} de 5`}>
        {STARS.map((n) => (
          <StarIcon key={n} className={className} filled={n <= filled} />
        ))}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-0.5" role="group" aria-label={label}>
      {STARS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          aria-label={`${n} estrella${n === 1 ? '' : 's'}`}
          aria-pressed={n <= filled}
          title={value === n ? 'Quitar valoración' : `${n} de 5`}
          className={`rounded p-0.5 transition-transform hover:scale-110 ${
            n <= filled ? 'text-amber-400' : 'text-ink-faint hover:text-amber-300'
          }`}
        >
          <StarIcon className={className} filled={n <= filled} />
        </button>
      ))}
    </span>
  )
}
