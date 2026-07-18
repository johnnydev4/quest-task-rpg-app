import { useRef, useState, useSyncExternalStore } from 'react'
import { PHASE_LABEL, pomodoro } from '../../services/pomodoro'
import { CoffeeIcon, TargetIcon } from '../ui/icons'

function mmss(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const POS_KEY = 'quest-minitimer-pos'

/**
 * Mini-temporizador flotante: aparece al minimizar el modo estudio para poder
 * navegar por la app sin perder de vista la sesión. Tocar el tiempo vuelve
 * al modo estudio a pantalla completa. Se puede ARRASTRAR a cualquier esquina
 * si tapa contenido (la posición se recuerda por dispositivo).
 */
export function MiniTimer({ onExpand }: { onExpand: () => void }) {
  const timer = useSyncExternalStore(pomodoro.subscribe, pomodoro.getSnapshot)
  const ref = useRef<HTMLDivElement>(null)
  // Un arrastre no debe disparar el clic de los botones al soltar.
  const suppressClick = useRef(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY)
      return raw ? (JSON.parse(raw) as { x: number; y: number }) : null
    } catch {
      return null
    }
  })

  if (timer.status === 'idle' || !timer.minimized) return null

  const progress = timer.totalMs > 0 ? 1 - timer.remainingMs / timer.totalMs : 0
  const r = 14
  const c = 2 * Math.PI * r

  function clampToViewport(x: number, y: number) {
    const el = ref.current
    const w = el?.offsetWidth ?? 170
    const h = el?.offsetHeight ?? 48
    return {
      x: Math.min(Math.max(8, x), window.innerWidth - w - 8),
      y: Math.min(Math.max(8, y), window.innerHeight - h - 8),
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const d = { sx: e.clientX, sy: e.clientY, bx: rect.left, by: rect.top, moved: false }
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - d.sx
      const dy = ev.clientY - d.sy
      // Umbral de 6px: por debajo sigue siendo un toque/clic normal.
      if (!d.moved && Math.hypot(dx, dy) < 6) return
      d.moved = true
      setPos(clampToViewport(d.bx + dx, d.by + dy))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (d.moved) {
        suppressClick.current = true
        setTimeout(() => (suppressClick.current = false), 0)
        setPos((p) => {
          if (p) localStorage.setItem(POS_KEY, JSON.stringify(p))
          return p
        })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={ref}
      className={`fixed z-30 cursor-grab active:cursor-grabbing ${pos ? '' : 'right-4 bottom-24 lg:bottom-6'}`}
      style={{ touchAction: 'none', ...(pos ? { left: pos.x, top: pos.y } : {}) }}
      onPointerDown={onPointerDown}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <div
        className="flex items-center gap-2 rounded-full border border-line/10 glass-strong py-1.5 pr-1.5 pl-2 shadow-xl"
        style={{ animation: 'levelup-in 0.3s ease-out both' }}
      >
        <button
          onClick={onExpand}
          aria-label="Volver al modo estudio"
          title="Volver al modo estudio"
          className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80"
        >
          <span className="relative flex size-9 items-center justify-center">
            <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90" aria-hidden="true">
              <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3" className="stroke-ink/10" />
              <circle
                cx="18"
                cy="18"
                r={r}
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - progress)}
                className={timer.phase === 'focus' ? 'stroke-accent-500' : 'stroke-ok'}
              />
            </svg>
            <span className={`absolute ${timer.phase === 'focus' ? 'text-accent-400' : 'text-ok'}`} aria-hidden="true">
              {timer.phase === 'focus' ? <TargetIcon className="size-3" /> : <CoffeeIcon className="size-3" />}
            </span>
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="font-mono text-sm font-bold text-ink tabular-nums">
              {mmss(timer.remainingMs)}
            </span>
            <span className="text-[10px] text-ink-faint">
              {PHASE_LABEL[timer.phase]}
              {timer.status === 'paused' && ' · pausa'}
            </span>
          </span>
        </button>
        <button
          onClick={() => pomodoro.adjustCurrentPhase(timer.phase, 5)}
          aria-label="Añadir 5 minutos a la fase actual"
          title="Añadir 5 minutos a la fase actual"
          className="flex h-8 items-center justify-center rounded-full border border-line/10 px-2 text-xs font-bold text-ink-dim transition-colors hover:bg-ink/5 hover:text-ink"
        >
          +5
        </button>
        <button
          onClick={() => (timer.status === 'running' ? pomodoro.pause() : void pomodoro.resume())}
          aria-label={timer.status === 'running' ? 'Pausar temporizador' : 'Reanudar temporizador'}
          className="flex size-8 items-center justify-center rounded-full bg-accent-600 text-on-accent transition-colors hover:bg-accent-500"
        >
          {timer.status === 'running' ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5" aria-hidden="true">
              <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-3.5" aria-hidden="true">
              <path d="M8 5.14v13.72L19 12z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
