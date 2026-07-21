import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react'

/**
 * Arrastrar y soltar con Pointer Events (mismo código para ratón y táctil).
 *
 * - Ratón: el arrastre engancha tras mover ~8px, así los clics normales siguen
 *   funcionando (completar, abrir detalle…).
 * - Táctil: hace falta una pulsación mantenida; si el dedo se mueve antes, el
 *   gesto se devuelve al navegador y la página hace scroll con normalidad.
 *
 * Reordenar es puramente visual mientras dura el gesto (se traslada el elemento
 * arrastrado y se desplazan sus vecinos); al soltar se avisa con el nuevo orden
 * de ids y quien lo use lo persiste.
 *
 * Además, si se pasa `onDropOnList`, soltar encima de un elemento marcado con
 * `data-drop-list="<id>"` (las listas del menú lateral, solo visibles en
 * escritorio) mueve el elemento a esa lista en vez de reordenarlo.
 */

let dragActive = false

/** ¿Hay un arrastre en curso? (SwipeToDelete lo consulta para no interferir). */
export const isDragActive = () => dragActive

const LONG_PRESS_MS = 300
const DRAG_THRESHOLD = 8

interface SortableCtx {
  register: (id: string, el: HTMLElement | null) => void
  begin: (id: string, e: React.PointerEvent) => void
}

const Ctx = createContext<SortableCtx | null>(null)

interface SortableListProps {
  /** Ids en el mismo orden en que se renderizan los hijos. */
  ids: string[]
  onReorder: (ids: string[]) => void
  /** Soltar sobre una lista del menú lateral: mueve el elemento a esa lista. */
  onDropOnList?: (listId: string, itemId: string) => void
  disabled?: boolean
  className?: string
  children: ReactNode
}

export function SortableList({
  ids,
  onReorder,
  onDropOnList,
  disabled = false,
  className,
  children,
}: SortableListProps) {
  const els = useRef(new Map<string, HTMLElement>())
  // Refs para que el contexto sea estable y no remonte a los hijos en cada render.
  const idsRef = useRef(ids)
  idsRef.current = ids
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const reorderRef = useRef(onReorder)
  reorderRef.current = onReorder
  const dropRef = useRef(onDropOnList)
  dropRef.current = onDropOnList

  const ctx = useMemo<SortableCtx>(() => {
    const register = (id: string, el: HTMLElement | null) => {
      if (el) els.current.set(id, el)
      else els.current.delete(id)
    }

    const begin = (id: string, e: React.PointerEvent) => {
      if (disabledRef.current || dragActive) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const from0 = e.target as HTMLElement | null
      // Campos de formulario y zonas marcadas nunca inician un arrastre.
      if (from0?.closest('input, textarea, select, [data-no-drag]')) return
      if (!els.current.has(id)) return

      const touch = e.pointerType !== 'mouse'
      const canDropOnList = !touch && typeof dropRef.current === 'function'
      const startX = e.clientX
      const startY = e.clientY
      const startPageY = startY + window.scrollY

      let started = false
      let pressTimer: number | undefined
      let raf = 0
      let lastX = startX
      let lastY = startY
      let layout: { id: string; el: HTMLElement; top: number; h: number }[] = []
      let from = 0
      let step = 0
      let newIndex = 0
      let dropEl: HTMLElement | null = null

      const preventScroll = (ev: TouchEvent) => ev.preventDefault()
      const swallowClick = (ev: MouseEvent) => {
        ev.stopPropagation()
        ev.preventDefault()
      }

      const measure = () => {
        layout = idsRef.current
          .map((k) => {
            const el = els.current.get(k)
            if (!el) return null
            const r = el.getBoundingClientRect()
            return { id: k, el, top: r.top + window.scrollY, h: r.height }
          })
          .filter((l): l is NonNullable<typeof l> => l !== null)
        from = layout.findIndex((l) => l.id === id)
        newIndex = from
        const self = layout[from]
        const next = layout[from + 1]
        // Paso = alto de la fila + hueco entre filas (space-y del contenedor).
        step = self.h + (next ? Math.max(0, next.top - (self.top + self.h)) : 6)
      }

      const paint = () => {
        const self = layout[from]
        if (!self) return
        const dy = lastY + window.scrollY - startPageY
        const dx = touch ? 0 : lastX - startX
        self.el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.02)`

        // ¿El puntero está sobre una lista del menú lateral?
        let over: HTMLElement | null = null
        if (canDropOnList) {
          const under = document.elementFromPoint(lastX, lastY) as HTMLElement | null
          over = (under?.closest('[data-drop-list]') as HTMLElement | null) ?? null
        }
        if (over !== dropEl) {
          dropEl?.removeAttribute('data-drop-over')
          dropEl = over
          dropEl?.setAttribute('data-drop-over', 'true')
        }
        if (dropEl) {
          // Mientras se apunta a una lista no tiene sentido reordenar.
          for (const l of layout) if (l.id !== id) l.el.style.transform = ''
          newIndex = from
          return
        }

        const center = self.top + self.h / 2 + dy
        let idx = 0
        for (let i = 0; i < layout.length; i++) {
          if (i === from) continue
          if (center > layout[i].top + layout[i].h / 2) idx++
        }
        newIndex = idx
        for (let i = 0; i < layout.length; i++) {
          if (i === from) continue
          let t = 0
          if (from < newIndex && i > from && i <= newIndex) t = -step
          else if (from > newIndex && i >= newIndex && i < from) t = step
          layout[i].el.style.transform = t ? `translate3d(0, ${t}px, 0)` : ''
        }
      }

      // Auto-scroll al arrastrar cerca de los bordes de la pantalla.
      const tick = () => {
        const margin = 90
        const vh = window.innerHeight
        let d = 0
        if (lastY < margin) d = -Math.ceil((margin - lastY) / 6)
        else if (lastY > vh - margin) d = Math.ceil((lastY - (vh - margin)) / 6)
        if (d !== 0) {
          window.scrollBy(0, d)
          paint()
        }
        raf = requestAnimationFrame(tick)
      }

      const startDrag = () => {
        started = true
        dragActive = true
        measure()
        const self = layout[from]
        if (!self) {
          started = false
          dragActive = false
          return
        }
        document.body.style.userSelect = 'none'
        document.addEventListener('touchmove', preventScroll, { passive: false })
        self.el.style.transition = 'none'
        self.el.style.position = 'relative'
        self.el.style.zIndex = '30'
        self.el.style.opacity = '0.95'
        self.el.style.filter = 'drop-shadow(0 10px 22px rgba(0,0,0,0.35))'
        // Sin eventos: así elementFromPoint ve lo que hay debajo del puntero.
        self.el.style.pointerEvents = 'none'
        for (const l of layout) if (l.id !== id) l.el.style.transition = 'transform 0.18s ease'
        navigator.vibrate?.(15)
        paint()
        raf = requestAnimationFrame(tick)
      }

      const finish = (commit: boolean) => {
        window.clearTimeout(pressTimer)
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        document.removeEventListener('pointercancel', onCancel)
        if (!started) return
        started = false
        dragActive = false
        cancelAnimationFrame(raf)
        document.body.style.userSelect = ''
        document.removeEventListener('touchmove', preventScroll)

        for (const l of layout) {
          l.el.style.transition = ''
          l.el.style.transform = ''
          l.el.style.position = ''
          l.el.style.zIndex = ''
          l.el.style.opacity = ''
          l.el.style.filter = ''
          l.el.style.pointerEvents = ''
        }
        const listId = dropEl?.getAttribute('data-drop-list') ?? null
        dropEl?.removeAttribute('data-drop-over')
        dropEl = null

        // El click que sigue al arrastre no debe abrir la tarea.
        window.addEventListener('click', swallowClick, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallowClick, { capture: true }), 0)

        if (!commit) return
        if (listId !== null && dropRef.current) {
          dropRef.current(listId, id)
        } else if (newIndex !== from) {
          const next = layout.map((l) => l.id)
          next.splice(from, 1)
          next.splice(newIndex, 0, id)
          reorderRef.current(next)
        }
      }

      function onMove(ev: PointerEvent) {
        lastX = ev.clientX
        lastY = ev.clientY
        if (!started) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= DRAG_THRESHOLD) return
          // Táctil: moverse antes de la pulsación larga = scroll normal.
          if (touch) {
            finish(false)
            return
          }
          startDrag()
          if (!started) return
        }
        ev.preventDefault()
        paint()
      }
      const onUp = () => finish(true)
      const onCancel = () => finish(false)

      document.addEventListener('pointermove', onMove, { passive: false })
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onCancel)
      if (touch) pressTimer = window.setTimeout(startDrag, LONG_PRESS_MS)
    }

    return { register, begin }
  }, [])

  return (
    <Ctx.Provider value={ctx}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  )
}

/** Envoltorio de cada fila arrastrable dentro de un `SortableList`. */
export function SortableItem({ id, children }: { id: string; children: ReactNode }) {
  const ctx = useContext(Ctx)
  return (
    <div
      ref={(el) => {
        ctx?.register(id, el)
      }}
      onPointerDown={(e) => ctx?.begin(id, e)}
      // pan-y: el navegador conserva el scroll vertical hasta que el arrastre engancha.
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </div>
  )
}
