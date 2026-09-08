import { uid } from '../lib/uid'
import { db } from '../db/db'
import type { StudySession } from '../db/types'
import { getSettings } from '../db/repo/settings'
import { applyXp } from '../db/repo/progress'
import { localDateKey } from '../lib/dates'
import { emitToast } from '../lib/events'
import { playBreakEnd, playPhaseChange } from '../lib/sound'
import { notificationService } from './notifications'
import { setAmbientSuspended, startAmbient, stopAmbient } from './ambient'

export type PomodoroPhase = 'focus' | 'short' | 'long'
export type PomodoroStatus = 'idle' | 'running' | 'paused'

export interface PomodoroSnapshot {
  phase: PomodoroPhase
  status: PomodoroStatus
  remainingMs: number
  totalMs: number
  pomodorosDone: number
  linkTaskId: string | null
  linkListId: string | null
  linkHabitId: string | null
  /** Sesión minimizada: se navega por la app con el mini-temporizador flotante. */
  minimized: boolean
  /**
   * Tiempo REAL ya transcurrido de la fase en curso (solo con el reloj en
   * marcha). Es lo que se acredita a la tarea/hábito, así que la barra en vivo
   * y lo que se guarda al terminar siempre dicen lo mismo.
   */
  elapsedMs: number
}

interface PersistedState extends Omit<PomodoroSnapshot, 'elapsedMs'> {
  /** Timestamp real de fin de fase: la fuente de verdad, inmune a pantalla apagada o segundo plano. */
  endsAt: number
  focusStartedAt: number | null
  /** Tramos ya cerrados de la fase (lo acumulado antes de la pausa actual). */
  pastElapsedMs: number
  /** Inicio del tramo en marcha; null en pausa o parado. */
  runStartedAt: number | null
  /**
   * El foco de ESTA fase ya se anotó. Impide contarlo dos veces cuando el fin
   * natural y "Terminar" caen en el mismo instante, y —si al guardar falla la
   * base de datos— deja la fase sin marcar para poder reintentarlo.
   */
  focusCounted: boolean
}

const STORAGE_KEY = 'quest-pomodoro-v1'
const TICK_MS = 500

export const PHASE_LABEL: Record<PomodoroPhase, string> = {
  focus: 'Foco',
  short: 'Descanso corto',
  long: 'Descanso largo',
}

/** Título original de la pestaña, para restaurarlo al parar el temporizador. */
const BASE_TITLE = typeof document !== 'undefined' ? document.title : 'Quest'

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fresh(totalMs: number): PersistedState {
  return {
    phase: 'focus',
    status: 'idle',
    remainingMs: totalMs,
    totalMs,
    pomodorosDone: 0,
    linkTaskId: null,
    linkListId: null,
    linkHabitId: null,
    minimized: false,
    endsAt: 0,
    focusStartedAt: null,
    pastElapsedMs: 0,
    runStartedAt: null,
    focusCounted: false,
  }
}

class PomodoroEngine {
  private state: PersistedState = fresh(25 * 60_000)
  private snapshot: PomodoroSnapshot = this.toSnapshot()
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  /** Cola de operaciones de cierre de fase (ver `run`). */
  private chain: Promise<unknown> = Promise.resolve()

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) this.state = { ...this.state, ...(JSON.parse(raw) as PersistedState) }
    } catch {
      // estado corrupto → se ignora
    }
    if (this.state.status === 'running') {
      // La app se cerró con el temporizador andando: recalcula desde el timestamp real.
      this.state.remainingMs = Math.max(0, this.state.endsAt - Date.now())
      // Estado escrito por una versión anterior (sin contabilidad por tramos):
      // se reconstruye lo ya trabajado desde el final previsto de la fase.
      if (this.state.runStartedAt === null) {
        this.state.pastElapsedMs = Math.max(
          this.state.pastElapsedMs,
          this.state.totalMs - this.state.remainingMs,
        )
        this.state.runStartedAt = Date.now()
      }
      if (this.state.remainingMs <= 0) void this.run(() => this.completePhase(true))
      else this.startTicking()
    }
    this.publish()
  }

  /**
   * Serializa todo lo que cierra una fase (fin natural, saltar, terminar,
   * empezar otra). Sin esto, pulsar "Terminar" justo cuando el reloj llega a
   * cero dejaba las dos rutas corriendo a la vez: el foco se anotaba dos veces
   * y la sesión seguía viva después de terminarla.
   */
  private run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.chain.then(op, op)
    this.chain = next.catch(() => undefined)
    return next
  }

  /**
   * Tiempo real transcurrido de la fase en curso: lo acumulado en tramos
   * anteriores más el tramo en marcha, sin pasar del final previsto (la app
   * pudo quedar horas cerrada o en segundo plano con la fase ya vencida).
   */
  private phaseElapsedMs(): number {
    const { status, pastElapsedMs, runStartedAt, endsAt } = this.state
    if (status !== 'running' || runStartedAt === null) return pastElapsedMs
    const until = endsAt > 0 ? Math.min(Date.now(), endsAt) : Date.now()
    return pastElapsedMs + Math.max(0, until - runStartedAt)
  }

  /** Cierra el tramo en marcha antes de mover el final de la fase. */
  private closeRunSegment(): void {
    this.state.pastElapsedMs = this.phaseElapsedMs()
    this.state.runStartedAt = this.state.status === 'running' ? Date.now() : null
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getSnapshot = (): PomodoroSnapshot => this.snapshot

  private toSnapshot(): PomodoroSnapshot {
    const { phase, status, remainingMs, totalMs, pomodorosDone, linkTaskId, linkListId, linkHabitId, minimized } =
      this.state
    return {
      phase,
      status,
      remainingMs,
      totalMs,
      pomodorosDone,
      linkTaskId,
      linkListId,
      linkHabitId,
      minimized,
      elapsedMs: this.phaseElapsedMs(),
    }
  }

  private publish(): void {
    this.snapshot = this.toSnapshot()
    this.syncDocumentTitle()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      // sin espacio: el timer sigue funcionando en memoria
    }
    this.listeners.forEach((cb) => cb())
  }

  /** Refleja el tiempo restante en la pestaña del navegador mientras corre. */
  private syncDocumentTitle(): void {
    if (typeof document === 'undefined') return
    if (this.state.status === 'running') {
      document.title = `${formatClock(this.state.remainingMs)} · ${PHASE_LABEL[this.state.phase]}`
    } else {
      document.title = BASE_TITLE
    }
  }

  private startTicking(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private stopTicking(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick(): void {
    if (this.state.status !== 'running') return
    this.state.remainingMs = Math.max(0, this.state.endsAt - Date.now())
    if (this.state.remainingMs <= 0) {
      // El intervalo se corta YA: el cierre de fase es asíncrono y no debe
      // encolarse otra vez mientras se resuelve.
      this.stopTicking()
      void this.run(() => this.completePhase(true))
    } else {
      this.snapshot = this.toSnapshot()
      this.syncDocumentTitle()
      this.listeners.forEach((cb) => cb())
    }
  }

  private async phaseDurationMs(phase: PomodoroPhase): Promise<number> {
    const s = await getSettings()
    const min =
      phase === 'focus'
        ? s.pomodoroFocusMin
        : phase === 'short'
          ? s.pomodoroShortBreakMin
          : s.pomodoroLongBreakMin
    return Math.max(1, min) * 60_000
  }

  async start(link?: {
    taskId?: string | null
    listId?: string | null
    habitId?: string | null
    /** Arranca la sesión ya minimizada (empezar desde una tarea/hábito, sin saltar a pantalla completa). */
    minimized?: boolean
  }): Promise<void> {
    await this.run(async () => {
      // Termina limpiamente cualquier sesión en curso (registra su foco) antes de empezar.
      await this.finalizeActive()
      const s = await getSettings()
      const totalMs = Math.max(1, s.pomodoroFocusMin) * 60_000
      // Sesión nueva: cualquier pausa manual del sonido ambiental queda olvidada.
      setAmbientSuspended(false)
      const now = Date.now()
      this.state = {
        ...fresh(totalMs),
        phase: 'focus',
        status: 'running',
        totalMs,
        remainingMs: totalMs,
        endsAt: now + totalMs,
        focusStartedAt: now,
        runStartedAt: now,
        linkTaskId: link?.taskId ?? null,
        linkListId: link?.listId ?? null,
        linkHabitId: link?.habitId ?? null,
        minimized: link?.minimized ?? false,
        pomodorosDone: 0,
      }
      if (s.soundEnabled) startAmbient(s.ambientSound, s.ambientVolume)
      this.startTicking()
      this.publish()
    })
  }

  /** Minimiza o restaura la pantalla de sesión (el temporizador no se toca). */
  setMinimized(minimized: boolean): void {
    this.state.minimized = minimized
    this.publish()
  }

  /**
   * Cambia el vínculo tarea/lista/hábito de la sesión (también en caliente).
   * No toca la duración del temporizador: el objetivo de pomodoro de la
   * tarea/hábito se cumple acumulando minutos de foco (su barra de progreso).
   */
  setLink(link: { taskId?: string | null; listId?: string | null; habitId?: string | null }): void {
    if (link.taskId !== undefined) this.state.linkTaskId = link.taskId
    if (link.listId !== undefined) this.state.linkListId = link.listId
    if (link.habitId !== undefined) this.state.linkHabitId = link.habitId
    this.publish()
  }

  /**
   * Suma (o resta) minutos a la fase EN CURSO si coincide con `phase`.
   * Funciona con el temporizador corriendo o en pausa; en marcha, el fin
   * real (endsAt) se recalcula para que el cambio aplique al instante.
   */
  adjustCurrentPhase(phase: PomodoroPhase, deltaMin: number): void {
    if (this.state.status === 'idle' || this.state.phase !== phase) return
    // Lo ya trabajado se cierra antes de mover el final: alargar o acortar la
    // fase cambia lo que queda, nunca lo que ya se hizo.
    this.closeRunSegment()
    const deltaMs = deltaMin * 60_000
    if (this.state.status === 'running') {
      this.state.remainingMs = Math.max(0, this.state.endsAt - Date.now())
    }
    this.state.remainingMs = Math.max(0, this.state.remainingMs + deltaMs)
    this.state.totalMs = Math.max(60_000, this.state.totalMs + deltaMs)
    if (this.state.status === 'running') {
      this.state.endsAt = Date.now() + this.state.remainingMs
      if (this.state.remainingMs <= 0) {
        this.stopTicking()
        void this.run(() => this.completePhase(true))
        return
      }
    }
    this.publish()
  }

  /**
   * Fija el tiempo restante de la fase en curso (editar el reloj a mano).
   * Solo con sesión activa; en marcha recalcula el fin real para que aplique ya.
   */
  setRemaining(ms: number): void {
    if (this.state.status === 'idle') return
    this.closeRunSegment()
    const clamped = Math.max(1000, Math.round(ms))
    this.state.remainingMs = clamped
    // El anillo mide progreso contra totalMs: nunca dejar el restante por encima.
    this.state.totalMs = Math.max(this.state.totalMs, clamped)
    if (this.state.status === 'running') this.state.endsAt = Date.now() + clamped
    this.publish()
  }

  pause(): void {
    if (this.state.status !== 'running') return
    // Cerrar el tramo ANTES de cambiar el estado: en pausa ya no corre nada.
    this.state.pastElapsedMs = this.phaseElapsedMs()
    this.state.runStartedAt = null
    this.state.status = 'paused'
    this.state.remainingMs = Math.max(0, this.state.endsAt - Date.now())
    stopAmbient()
    this.stopTicking()
    this.publish()
  }

  async resume(): Promise<void> {
    if (this.state.status !== 'paused') return
    this.state.status = 'running'
    this.state.runStartedAt = Date.now()
    this.state.endsAt = Date.now() + this.state.remainingMs
    if (this.state.phase === 'focus') {
      // Foco que arranca tras un descanso (quedó en pausa): marca el inicio real.
      this.state.focusStartedAt ??= Date.now()
      const s = await getSettings()
      if (s.soundEnabled) startAmbient(s.ambientSound, s.ambientVolume)
    }
    this.startTicking()
    this.publish()
  }

  /** Salta la fase actual. En foco, registra los minutos reales transcurridos. */
  async skip(): Promise<void> {
    await this.run(async () => {
      if (this.state.status === 'idle') return
      this.stopTicking()
      await this.completePhase(false)
    })
  }

  /** Detiene y descarta la fase actual (no registra nada). */
  reset(): void {
    stopAmbient()
    this.stopTicking()
    const totalMs = this.state.totalMs
    this.state = { ...fresh(totalMs), pomodorosDone: 0 }
    this.publish()
  }

  /**
   * Termina la sesión: si va en foco, registra los minutos reales transcurridos
   * (van a la barra pomodoro de la tarea/hábito vinculado) y vuelve al inicio.
   */
  async finish(): Promise<void> {
    await this.run(async () => {
      if (!(await this.finalizeActive())) {
        // El foco no llegó a guardarse: la sesión se deja en pausa a cero para
        // poder reintentarlo, en vez de tirar los minutos trabajados.
        this.state.status = 'paused'
        this.state.remainingMs = 0
        this.state.endsAt = 0
        this.publish()
        return
      }
      const totalMs = this.state.totalMs
      // El vínculo se conserva: tras terminar, la tarea/hábito sigue elegido en
      // Estudio, así el siguiente "Iniciar foco" no se anota en el vacío.
      this.state = {
        ...fresh(totalMs),
        pomodorosDone: 0,
        linkTaskId: this.state.linkTaskId,
        linkListId: this.state.linkListId,
        linkHabitId: this.state.linkHabitId,
      }
      this.publish()
    })
  }

  /**
   * Anota los minutos de foco reales de la fase: sesión guardada, XP y aviso.
   * Si algo falla (base de datos ocupada, app cerrándose…) la fase queda sin
   * marcar para poder reintentarlo con "Terminar" en vez de perder el rato en
   * silencio.
   */
  private async creditFocus(elapsedMs: number, completed: boolean): Promise<boolean> {
    const focusMinutes = Math.max(0, Math.round(elapsedMs / 60_000))
    if (focusMinutes < 1) return true
    try {
      await this.recordSession(focusMinutes, completed)
      // Integración RPG: 1 XP por minuto de foco real (spec §8).
      const listId = await this.resolveListId()
      await applyXp(focusMinutes, listId, { touchStreak: false })
      emitToast({
        title: `Sesión de foco: ${focusMinutes} min`,
        body: completed ? `+${focusMinutes} XP · ¡bien ahí!` : `+${focusMinutes} XP · guardado`,
      })
      return true
    } catch {
      this.state.focusCounted = false
      emitToast({
        title: 'No se pudo guardar el foco',
        body: 'Vuelve a intentarlo con "Terminar".',
      })
      return false
    }
  }

  /**
   * Cierra la sesión activa por interrupción (terminar o arrancar otra): si va
   * en foco, registra los minutos reales acumulados. No avanza de fase ni notifica.
   */
  private async finalizeActive(): Promise<boolean> {
    if (this.state.status === 'idle') return true
    const elapsedMs = this.phaseElapsedMs()
    const pending = this.state.phase === 'focus' && !this.state.focusCounted
    // Todo el cambio de estado va ANTES del primer await: un tick a punto de
    // saltar ve la sesión ya parada y la fase ya contabilizada.
    if (pending) this.state.focusCounted = true
    this.state.pastElapsedMs = elapsedMs
    this.state.runStartedAt = null
    this.state.status = 'idle'
    stopAmbient()
    this.stopTicking()
    return pending ? await this.creditFocus(elapsedMs, false) : true
  }

  private async completePhase(natural: boolean): Promise<void> {
    if (this.state.status === 'idle') return
    this.stopTicking()
    stopAmbient()
    const wasFocus = this.state.phase === 'focus'
    // El tiempo acreditado es el REALMENTE transcurrido en marcha, no la
    // duración nominal: así saltar en pausa, o retocar el reloj a mano, no
    // inflan ni recortan lo que llega a la tarea.
    const elapsedMs = this.phaseElapsedMs()
    const pending = wasFocus && !this.state.focusCounted
    if (pending) this.state.focusCounted = true
    this.state.pastElapsedMs = elapsedMs
    this.state.runStartedAt = null
    if (pending && !(await this.creditFocus(elapsedMs, natural))) {
      // Igual que en `finish`: la fase se queda donde está para reintentarlo.
      this.state.status = 'paused'
      this.state.remainingMs = 0
      this.state.endsAt = 0
      this.publish()
      return
    }
    if (wasFocus) this.state.pomodorosDone += 1
    const s = await getSettings()

    // Foco→descanso: aviso suave. Descanso→foco: alerta más marcada.
    if (s.soundEnabled) {
      if (wasFocus) playPhaseChange(s.soundVolume)
      else playBreakEnd(s.soundVolume)
    }
    const nextPhase: PomodoroPhase = wasFocus
      ? this.state.pomodorosDone % Math.max(1, s.pomodoroLongBreakEvery) === 0
        ? 'long'
        : 'short'
      : 'focus'
    await notificationService.notify(
      wasFocus ? '☕ Hora de descansar' : '🎯 De vuelta al foco',
      wasFocus ? PHASE_LABEL[nextPhase] : 'Empieza otra sesión de foco',
    )

    const totalMs = await this.phaseDurationMs(nextPhase)
    this.state.phase = nextPhase
    this.state.totalMs = totalMs
    this.state.remainingMs = totalMs
    // NINGUNA fase arranca sola (ni foco ni descanso): queda en pausa
    // esperando que el usuario pulse "Reanudar".
    this.state.status = 'paused'
    this.state.endsAt = 0
    this.state.focusStartedAt = null
    this.state.pastElapsedMs = 0
    this.state.runStartedAt = null
    this.state.focusCounted = false
    this.stopTicking()
    this.publish()
  }

  private async resolveListId(): Promise<string | null> {
    if (this.state.linkListId) return this.state.linkListId
    if (this.state.linkTaskId) {
      const task = await db.tasks.get(this.state.linkTaskId)
      return task?.listId ?? null
    }
    if (this.state.linkHabitId) {
      const habit = await db.habits.get(this.state.linkHabitId)
      return habit?.listId ?? null
    }
    return null
  }

  private async recordSession(focusMinutes: number, completed: boolean): Promise<void> {
    const now = Date.now()
    const session: StudySession = {
      id: uid(),
      taskId: this.state.linkTaskId,
      habitId: this.state.linkHabitId,
      listId: await this.resolveListId(),
      startedAt: this.state.focusStartedAt ?? now - focusMinutes * 60_000,
      endedAt: now,
      focusMinutes,
      kind: 'focus',
      completed,
      dateKey: localDateKey(),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    }
    await db.studySessions.add(session)
  }
}

export const pomodoro = new PomodoroEngine()
