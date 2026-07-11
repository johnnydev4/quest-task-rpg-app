import { useEffect, useState } from 'react'

interface ConfirmButtonProps {
  label: string
  confirmLabel: string
  onConfirm: () => void
}

/** Botón destructivo de doble toque: el primero arma la confirmación (se desarma a los 3 s). */
export function ConfirmButton({ label, confirmLabel, onConfirm }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  return (
    <button
      type="button"
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        armed
          ? 'border-danger/60 bg-danger/20 text-danger'
          : 'border-danger/20 bg-transparent text-danger hover:bg-danger/10'
      }`}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}
