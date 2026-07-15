/** Opciones de hora cada 30 min (00:00 … 23:30) para el selector de hora. */
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  return `${h}:${i % 2 === 0 ? '00' : '30'}`
})

/**
 * Selector de hora con <select>: en iOS abre la rueda nativa sin teclado y sin
 * el bug del input de hora que se auto-rellena con la hora actual al abrirse.
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
  // Una hora fuera de la rejilla de 30 min (p. ej. 21:47) se añade como opción.
  const options = value && !TIME_OPTIONS.includes(value) ? [value, ...TIME_OPTIONS] : TIME_OPTIONS
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="rounded-md border border-line/10 bg-surface-700 px-2 py-1 text-sm text-ink outline-none focus:border-accent-500/60"
    >
      {noneLabel !== undefined && <option value="">{noneLabel}</option>}
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}
