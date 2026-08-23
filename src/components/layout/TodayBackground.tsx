import { useEffect, useRef } from 'react'
import { useMediaQuery } from '../../lib/useMediaQuery'

const BASE = import.meta.env.BASE_URL
const POSTER = `${BASE}backgrounds/nebula-default.jpg`
const WEBM = `${BASE}backgrounds/nebula-default.webm`
const MP4 = `${BASE}backgrounds/nebula-default.mp4`

// Mismo velo adaptativo al tema que usa el fondo de imagen en App.tsx: mantiene
// el texto legible sobre el nebula tanto en claro como en oscuro.
const SCRIM = 'var(--t-bg-scrim, color-mix(in srgb, var(--t-surface-900) 50%, transparent))'

/**
 * Fondo por defecto de la pestaña Hoy: un video del nebula YA difuminado (el
 * blur va horneado al codificar, ver public/backgrounds/), en bucle, sin sonido
 * y sin capturar toques. Solo se muestra cuando el usuario no ha puesto su
 * propia imagen de fondo. Con "reduce motion" cae al póster estático.
 */
export function TodayBackground() {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const videoRef = useRef<HTMLVideoElement>(null)

  // React no siempre refleja `muted` como propiedad (solo como atributo) y las
  // políticas de autoplay de iOS/Android exigen mute real + play() explícito.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.play().catch(() => {
      // Autoplay bloqueado (raro con muted): queda el póster de fondo.
    })
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
      {reduceMotion ? (
        <img src={POSTER} alt="" className="h-full w-full object-cover" />
      ) : (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster={POSTER}
        >
          {/* WebM primero (más liviano, Chrome/Firefox/Android); Safari cae al MP4. */}
          <source src={WEBM} type="video/webm" />
          <source src={MP4} type="video/mp4" />
        </video>
      )}
      <div
        className="absolute inset-0 transition-[background-color] duration-300"
        style={{ background: SCRIM }}
      />
    </div>
  )
}
