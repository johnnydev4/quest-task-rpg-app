import { useEffect, useRef, useState } from 'react'

/** Lunes primero, como el resto de la app. */
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

interface MiniCalendarProps {
  /** Día seleccionado (medianoche local) o null. */
  value: number | null
  onSelect: (ms: number) => void
}

/**
 * Calendario de mes compacto para elegir UNA fecha dentro de una hoja.
 * Sustituye al <input type="date"> nativo: en iOS ese input rellena "hoy"
 * con solo abrirse (imposible distinguir cancelar de elegir) y abre teclado.
 */
export function MiniCalendar({ value, onSelect }: MiniCalendarProps) {
  const initial = value !== null ? new Date(value) : new Date()
  const [year, setYear] = useState(initial.getFullYear())
  const [month, setMonth] = useState(initial.getMonth())

  const first = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Columna del día 1 (lunes=0 … domingo=6)
  const lead = (first.getDay() + 6) % 7
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const shiftRef = useRef(shift)
  shiftRef.current = shift

  /**
   * Deslizar en horizontal cambia de mes (izquierda = siguiente), como en el
   * calendario del móvil. Listener NATIVO no-pasivo: con los handlers de React
   * no se puede llamar a preventDefault y Safari se queda el gesto.
   */
  useEffect(() => {
    const root = rootRef.current
    const grid = gridRef.current
    if (!root || !grid) return

    let startX = 0
    let startY = 0
    let tracking = false
    let engaged = false

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      tracking = true
      engaged = false
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      if (!engaged) {
        // Vertical = scroll de la hoja (o su gesto de cierre): lo soltamos.
        if (Math.abs(dy) > Math.abs(dx)) {
          tracking = false
          return
        }
        if (Math.abs(dx) < 8) return
        engaged = true
      }
      e.preventDefault()
      grid.style.transition = 'none'
      grid.style.transform = `translateX(${dx * 0.5}px)`
      grid.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / 240))
    }

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      if (!engaged) return
      engaged = false
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX
      grid.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out'
      grid.style.transform = ''
      grid.style.opacity = ''
      if (Math.abs(dx) > 45) shiftRef.current(dx < 0 ? 1 : -1)
    }

    root.addEventListener('touchstart', onStart, { passive: true })
    root.addEventListener('touchmove', onMove, { passive: false })
    root.addEventListener('touchend', onEnd)
    root.addEventListener('touchcancel', onEnd)
    return () => {
      root.removeEventListener('touchstart', onStart)
      root.removeEventListener('touchmove', onMove)
      root.removeEventListener('touchend', onEnd)
      root.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const monthLabel = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(first)
  const navBtn =
    'flex size-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink'

  return (
    <div ref={rootRef} className="touch-pan-y rounded-xl border border-line/10 glass-input p-2.5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <button type="button" onClick={() => shift(-1)} aria-label="Mes anterior" className={navBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-ink capitalize">{monthLabel}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Mes siguiente" className={navBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div ref={gridRef} className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-[10px] font-semibold text-ink-faint">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const dayMs = new Date(year, month, i + 1).getTime()
          const selected = value !== null && dayMs === value
          const isToday = dayMs === todayMs
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(dayMs)}
              aria-label={`Día ${i + 1}`}
              aria-pressed={selected}
              className={`mx-auto flex size-8 items-center justify-center rounded-full text-sm transition-colors ${
                selected
                  ? 'bg-accent-500 font-bold text-on-accent'
                  : isToday
                    ? 'font-bold text-accent-300 hover:bg-ink/5'
                    : 'text-ink-dim hover:bg-ink/5'
              }`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </div>
  )
}
