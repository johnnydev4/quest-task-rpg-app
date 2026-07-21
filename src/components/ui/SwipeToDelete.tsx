import { useEffect, useRef, type ReactNode } from 'react'
import { TrashIcon } from './icons'
import { isDragActive } from './Sortable'

/**
 * Deslizar a la IZQUIERDA para eliminar (gesto iOS): el contenido sigue al
 * dedo y detrás se revela la papelera sobre fondo rojo, que crece a medida
 * que el gesto se acerca al umbral. Al soltar: pasado el umbral, la fila sale
 * deslizándose y se elimina; si no, vuelve con un muelle.
 * Solo táctil (en escritorio ya hay menú contextual y botones de borrar).
 * Listeners NATIVOS no-pasivos: los de React son pasivos y Safari convertiría
 * el arrastre horizontal en scroll.
 */
export function SwipeToDelete({
  onDelete,
  children,
  className = 'rounded-xl',
}: {
  onDelete: () => void
  children: ReactNode
  /** Redondeo del contenedor: debe casar con el del contenido (fila/tarjeta). */
  className?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const onDeleteRef = useRef(onDelete)
  onDeleteRef.current = onDelete

  useEffect(() => {
    const wrap = wrapRef.current
    const content = contentRef.current
    const bg = bgRef.current
    if (!wrap || !content || !bg) return

    let startX = 0
    let startY = 0
    let dx = 0
    let tracking = false
    let engaged = false
    const threshold = () => Math.min(140, wrap.clientWidth * 0.4)

    const paint = () => {
      content.style.transition = 'none'
      content.style.transform = `translateX(${dx}px)`
      const p = Math.min(1, -dx / threshold())
      bg.style.opacity = String(Math.min(1, p * 1.25))
      const icon = bg.firstElementChild as HTMLElement | null
      // La papelera crece según se confirma el gesto; al 100% queda "armada".
      if (icon) icon.style.transform = `scale(${0.7 + 0.45 * p})`
    }

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      tracking = true
      engaged = false
    }

    const onMove = (e: TouchEvent) => {
      // Si la pulsación larga arrancó un arrastre de reordenación, este gesto no es un swipe.
      if (isDragActive()) {
        tracking = false
        engaged = false
        return
      }
      if (!tracking) return
      const t = e.touches[0]
      const mx = t.clientX - startX
      const my = t.clientY - startY
      if (!engaged) {
        // Gesto claramente vertical = scroll normal; lo soltamos.
        if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
          tracking = false
          return
        }
        // Solo hacia la izquierda y con intención horizontal clara.
        if (mx < -10 && Math.abs(mx) > Math.abs(my)) engaged = true
        else return
      }
      e.preventDefault()
      // Solo izquierda; hacia la derecha, banda elástica nula.
      dx = Math.min(0, mx)
      paint()
    }

    const onEnd = () => {
      if (!tracking) return
      tracking = false
      if (!engaged) return
      engaged = false
      if (-dx >= threshold()) {
        // Confirmado: sale por la izquierda y ENTONCES se elimina.
        content.style.transition = 'transform 0.2s ease-in'
        content.style.transform = 'translateX(-110%)'
        bg.style.opacity = '1'
        setTimeout(() => onDeleteRef.current(), 180)
      } else {
        content.style.transition = 'transform 0.2s ease-out'
        content.style.transform = ''
        bg.style.opacity = '0'
      }
      dx = 0
    }

    wrap.addEventListener('touchstart', onStart, { passive: true })
    wrap.addEventListener('touchmove', onMove, { passive: false })
    wrap.addEventListener('touchend', onEnd)
    wrap.addEventListener('touchcancel', onEnd)
    return () => {
      wrap.removeEventListener('touchstart', onStart)
      wrap.removeEventListener('touchmove', onMove)
      wrap.removeEventListener('touchend', onEnd)
      wrap.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className}`}>
      <div
        ref={bgRef}
        className="pointer-events-none absolute inset-0 flex items-center justify-end bg-danger/90 pr-5 opacity-0"
        aria-hidden="true"
      >
        <TrashIcon className="size-5 text-white" />
      </div>
      <div ref={contentRef}>{children}</div>
    </div>
  )
}
