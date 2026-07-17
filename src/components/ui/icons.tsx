import type { ReactNode } from 'react'

/**
 * Iconografía de la app (estilo Liquid Glass): iconos de LÍNEA minimalistas,
 * trazo 2 con puntas redondeadas, sin relleno, heredan color con currentColor.
 * Sustituyen a los emojis en cualquier uso de icono (los emojis quedan solo
 * como contenido expresivo: criaturas del mes, toasts, textos).
 */
function Icon({ className = 'size-4', children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

/** Destello de 4 puntas (insignias "reto del mes", detalles mágicos). */
export function SparkleIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3l1.9 5.6a2 2 0 0 0 1.3 1.3L21 12l-5.8 2.1a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.6a2 2 0 0 0-1.3-1.3L3 12l5.8-2.1a2 2 0 0 0 1.3-1.3L12 3z" />
    </Icon>
  )
}

/** Corona: la gran misión del mes. */
export function CrownIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5 18L3 7l5.5 4L12 5l3.5 6L21 7l-2 11H5z" />
      <path d="M5 21h14" />
    </Icon>
  )
}

/** Espada: misiones y retos. */
export function SwordIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l6-6" />
      <path d="M16 16l4 4" />
      <path d="M19 21l2-2" />
    </Icon>
  )
}

/** Trofeo: misión conquistada. */
export function TrophyIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </Icon>
  )
}

/** Gema: recompensas y experiencia. */
export function GemIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M6 3h12l4 6-10 13L2 9z" />
      <path d="M11 3L8 9l4 13 4-13-3-6" />
      <path d="M2 9h20" />
    </Icon>
  )
}

/** Gráfico de barras: progreso y estado. */
export function ChartIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </Icon>
  )
}

/** Calendario: fechas y días restantes. */
export function CalendarIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 10h18" />
    </Icon>
  )
}

/** Reloj hacia atrás: historial, retos anteriores. */
export function HistoryIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </Icon>
  )
}

/** Temporizador: objetivo de pomodoro. */
export function TimerIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M10 2h4" />
      <circle cx="12" cy="14" r="8" />
      <path d="M12 14l3-3" />
    </Icon>
  )
}

/** Diana: fase de foco. */
export function TargetIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </Icon>
  )
}

/** Taza: fase de descanso. */
export function CoffeeIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
      <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z" />
      <path d="M6 2v2M10 2v2M14 2v2" />
    </Icon>
  )
}

/** Doble flecha: saltar a la siguiente ocurrencia. */
export function ForwardIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M6 17l5-5-5-5" />
      <path d="M13 17l5-5-5-5" />
    </Icon>
  )
}

/** Sol: la vista/acción "Hoy". */
export function SunIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  )
}

/** Check en círculo: completar. */
export function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  )
}

/** Carpeta: listas. */
export function FolderIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Icon>
  )
}

/** Candado: bloqueado / aún no disponible. */
export function LockIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Icon>
  )
}

/** Bandera: meta alcanzada / hábito finalizado. */
export function FlagIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </Icon>
  )
}

/** Burbuja de comentario. */
export function CommentIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z" />
    </Icon>
  )
}

/** Clip: archivos adjuntos. */
export function PaperclipIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Icon>
  )
}
