import { useEffect, useRef, type RefObject } from 'react'

/**
 * Gesto de hoja iOS: arrastrar hacia abajo desde cualquier punto (con el
 * contenido arriba del todo) mueve el panel siguiendo al dedo, como un scroll.
 * Al soltar: si bajó lo suficiente (o fue un golpe rápido), el panel se
 * desliza hacia abajo con animación y ENTONCES se cierra; si no, vuelve con
 * un muelle suave.
 * Usa listeners NATIVOS no-pasivos: con los handlers de React (pasivos),
 * Safari se queda el gesto para hacer scroll/rebote y dispara touchcancel.
 */
export function useSwipeToClose(
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
): void {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !enabled) return

    let startY = 0
    let startT = 0
    let tracking = false
    let engaged = false

    const onStart = (e: TouchEvent) => {
      // Solo puede empezar el gesto con el contenido arriba del todo.
      if (panel.scrollTop > 0) return
      startY = e.touches[0].clientY
      startT = performance.now()
      tracking = true
      engaged = false
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const dy = e.touches[0].clientY - startY
      if (!engaged) {
        // Hacia arriba = scroll normal; hacia abajo unos px = tomamos el gesto.
        if (dy < -4 || panel.scrollTop > 0) {
          tracking = false
          return
        }
        if (dy > 8) {
          engaged = true
          // La animación de entrada (fill-mode "both") sigue aplicando su
          // último keyframe y pisa el transform inline: hay que apagarla.
          panel.style.animation = 'none'
        } else return
      }
      // Sin esto, Safari convierte el arrastre en scroll/rebote.
      e.preventDefault()
      panel.style.transition = 'none'
      panel.style.transform = `translateY(${Math.max(0, dy)}px)`
    }

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      if (!engaged) return
      engaged = false
      const dy = (e.changedTouches[0]?.clientY ?? startY) - startY
      const fastFlick = dy > 30 && performance.now() - startT < 250
      if (dy > 80 || fastFlick) {
        // Sale deslizándose hacia abajo y recién entonces se desmonta.
        panel.style.transition = 'transform 0.25s ease-in'
        panel.style.transform = 'translateY(110%)'
        setTimeout(() => closeRef.current(), 230)
      } else {
        panel.style.transition = 'transform 0.2s ease-out'
        panel.style.transform = ''
      }
    }

    panel.addEventListener('touchstart', onStart, { passive: true })
    panel.addEventListener('touchmove', onMove, { passive: false })
    panel.addEventListener('touchend', onEnd)
    panel.addEventListener('touchcancel', onEnd)
    return () => {
      panel.removeEventListener('touchstart', onStart)
      panel.removeEventListener('touchmove', onMove)
      panel.removeEventListener('touchend', onEnd)
      panel.removeEventListener('touchcancel', onEnd)
    }
  }, [panelRef, enabled])
}
