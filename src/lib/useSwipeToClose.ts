import { useEffect, useRef, type RefObject } from 'react'

/**
 * Deslizar hacia abajo desde la cabecera cierra la hoja/modal (gesto iOS).
 * Usa listeners NATIVOS no-pasivos: con los handlers de React (pasivos) Safari
 * convierte el arrastre en scroll/rebote y dispara touchcancel, así que el
 * gesto nunca llegaba a completarse en iPhone. Mientras se arrastra, el panel
 * sigue al dedo; al soltar, si bajó lo suficiente se cierra, si no vuelve.
 */
export function useSwipeToClose(
  panelRef: RefObject<HTMLElement | null>,
  handleRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
): void {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const handle = handleRef.current
    if (!handle || !enabled) return

    let startY = 0
    let dragging = false

    const onStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
      dragging = true
    }
    const onMove = (e: TouchEvent) => {
      if (!dragging) return
      const dy = e.touches[0].clientY - startY
      if (dy > 0) {
        // Sin esto, Safari se queda el gesto para hacer scroll/rebote.
        e.preventDefault()
        const panel = panelRef.current
        if (panel) {
          panel.style.transform = `translateY(${dy}px)`
          panel.style.transition = 'none'
        }
      }
    }
    const onEnd = (e: TouchEvent) => {
      if (!dragging) return
      dragging = false
      const dy = (e.changedTouches[0]?.clientY ?? startY) - startY
      const panel = panelRef.current
      if (panel) {
        panel.style.transition = 'transform 0.2s ease-out'
        panel.style.transform = ''
      }
      if (dy > 80) closeRef.current()
    }

    handle.addEventListener('touchstart', onStart, { passive: true })
    handle.addEventListener('touchmove', onMove, { passive: false })
    handle.addEventListener('touchend', onEnd)
    handle.addEventListener('touchcancel', onEnd)
    return () => {
      handle.removeEventListener('touchstart', onStart)
      handle.removeEventListener('touchmove', onMove)
      handle.removeEventListener('touchend', onEnd)
      handle.removeEventListener('touchcancel', onEnd)
    }
  }, [panelRef, handleRef, enabled])
}
