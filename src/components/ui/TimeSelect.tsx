/** Horas del día (00 … 23). */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
/** Minutos cada 5 (00, 05 … 55): grano fino sin una rueda interminable. */
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

const selectClass =
  'rounded-md border border-line/10 glass-input px-2 py-1 text-sm text-ink outline-none focus:border-accent-500/60'

/**
 * Selector de hora con dos <select> (hora y minutos): en iOS abren la rueda
 * nativa sin teclado y sin el bug del input de hora que se auto-rellena con la
 * hora actual al abrirse. Separarlos deja elegir cualquier hora en pasos de 5
 * min sin recorrer una lista de 288 opciones.
 */
export function TimeSelect({
  value,
  onChange,
  noneLabel,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  /** Si se define, incluye una opción vacía con este texto (p. ej. "Sin hora"). */
  noneLabel?: string
  ariaLabel: string
}) {
  const [hour = '', minute = ''] = value ? value.split(':') : []
  // Un minuto fuera de la rejilla de 5 (p. ej. 21:47) se añade como opción.
  const minutes = minute && !MINUTES.includes(minute) ? [minute, ...MINUTES].sort() : MINUTES

  return (
    <span className="flex items-center gap-1" role="group" aria-label={ariaLabel}>
      <select
        value={hour}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}:${minute || '00'}` : '')}
        aria-label={`${ariaLabel} (horas)`}
        className={selectClass}
      >
        {noneLabel !== undefined && <option value="">{noneLabel}</option>}
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      {hour !== '' && (
        <>
          <span className="text-sm text-ink-faint">:</span>
          <select
            value={minute}
            onChange={(e) => onChange(`${hour}:${e.target.value}`)}
            aria-label={`${ariaLabel} (minutos)`}
            className={selectClass}
          >
            {minutes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </>
      )}
    </span>
  )
}
