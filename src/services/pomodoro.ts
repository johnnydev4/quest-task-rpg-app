import { uid } from '../lib/uid'
import { db } from '../db/db'
import type { StudySession } from '../db/types'
import { getSettings } from '../db/repo/settings'
import { applyXp } from '../db/repo/progress'
import { localDateKey } from '../lib/dates'
import { emitToast } from '../lib/events'
import { playPhaseChange } from '../lib/sound'
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
  /** Sesión minimizada: se navega por la app con el mini-temporizador flotante. */
  minimized: boolean
}

interface PersistedState extends PomodoroSnapshot {
  /** Timestamp real de fin de fase: la fuente de verdad, inmune a pantalla apagada o segundo plano. */
  endsAt: number
  focusStartedAt: number | null
  /** Duración de foco propia de esta sesión (pomodoro de tarea/hábito); null = la de Ajustes. */
  customFocusMin: number | null
}

const STORAGE_KEY = 'quest-pomodoro-v1'
const TICK_MS = 500

export const PHASE_LABEL: Record<PomodoroPhase, string> = {
  focus: 'Foco',
  short: 'Descanso corto',
  long: 'Descanso largo',
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
    minimized: false,
    endsAt: 0,
    focusStartedAt: null,
    customFocusMin: null,
  }
}

class PomodoroEngine {
  private state: PersistedState = fresh(25 * 60_000)
  private snapshot: PomodoroSnapshot = this.toSnapshot()
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | null = null

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
      if (this.state.remainingMs <= 0) void this.completePhase(true)
      else this.startTicking()
    }
    this.publish()
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  getSnapshot = (): PomodoroSnapshot => this.snapshot

  private toSnapshot(): PomodoroSnapshot {
    const { phase, status, remainingMs, totalMs, pomodorosDone, linkTaskId, linkListId, minimized } =
      this.state
    return { phase, status, remainingMs, totalMs, pomodorosDone, linkTaskId, linkListId, minimized }
  }

  private publish(): void {
    this.snapshot = this.toSnapshot()
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
    } catch {
      // sin espacio: el timer sigue funcionando en memoria
    }
    this.listeners.forEach((cb) => cb())
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
      void this.completePhase(true)
    } else {
      this.snapshot = this.toSnapshot()
      this.listeners.forEach((cb) => cb())
    }
  }

  private async phaseDurationMs(phase: PomodoroPhase): Promise<number> {
    const s = await getSettings()
    const min =
      phase === 'focus'
        ? (this.state.customFocusMin ?? s.pomodoroFocusMin)
        : phase === 'short'
          ? s.pomodoroShortBreakMin
          : s.pomodoroLongBreakMin
    return Math.max(1, min) * 60_000
  }

  async start(
    link?: { taskId?: string | null; listId?: string | null },
    opts?: { focusMinutes?: number | null },
  ): Promise<void> {
    const customFocusMin = opts?.focusMinutes ?? null
    const s = await getSettings()
    const totalMs = Math.max(1, customFocusMin ?? s.pomodoroFocusMin) * 60_000
    // Sesión nueva: cualquier pausa manual del sonido ambiental queda olvidada.
    setAmbientSuspended(false)
    this.state = {
      ...fresh(totalMs),
      phase: 'focus',
      status: 'running',
      totalMs,
      remainingMs: totalMs,
      endsAt: Date.now() + totalMs,
      focusStartedAt: Date.now(),
      linkTaskId: link?.taskId ?? null,
      linkListId: link?.listId ?? null,
      customFocusMin,
      pomodorosDone: this.state.status === 'idle' ? this.state.pomodorosDone : 0,
    }
    if (s.soundEnabled) startAmbient(s.ambientSound, s.ambientVolume)
    this.startTicking()
    this.publish()
  }

  /** Minimiza o restaura la pantalla de sesión (el temporizador no se toca). */
  setMinimized(minimized: boolean): void {
    this.state.minimized = minimized
    this.publish()
  }

  /** Cambia el vínculo tarea/lista de la sesión (también en caliente). */
  setLink(link: { taskId?: string | null; listId?: string | null }): void {
    if (link.taskId !== undefined) this.state.linkTaskId = link.taskId
    if (link.listId !== undefined) this.state.linkListId = link.listId
    this.publish()
  }

  pause(): void {
    if (this.state.status !== 'running') return
    this.state.status = 'paused'
    this.state.remainingMs = Math.max(0, this.state.endsAt - Date.now())
    stopAmbient()
    this.stopTicking()
    this.publish()
  }

  async resume(): Promise<void> {
    if (this.state.status !== 'paused') return
    this.state.status = 'running'
    this.state.endsAt = Date.now() + this.state.remainingMs
    if (this.state.phase === 'focus') {
      const s = await getSettings()
      if (s.soundEnabled) startAmbient(s.ambientSound, s.ambientVolume)
    }
    this.startTicking()
    this.publish()
  }

  /** Salta la fase actual. En foco, registra los minutos reales transcurridos. */
  async skip(): Promise<void> {
    if (this.state.status === 'idle') return
    await this.completePhase(false)
  }

  /** Detiene y descarta la fase actual (no registra nada). */
  reset(): void {
    stopAmbient()
    this.stopTicking()
    const totalMs = this.state.totalMs
    this.state = { ...fresh(totalMs), pomodorosDone: 0 }
    this.publish()
  }

  private async completePhase(natural: boolean): Promise<void> {
    this.stopTicking()
    stopAmbient()
    const s = await getSettings()
    const wasFocus = this.state.phase === 'focus'

    if (wasFocus) {
      const elapsedMs = natural
        ? this.state.totalMs
        : this.state.totalMs - Math.max(0, this.state.endsAt - Date.now())
      const focusMinutes = Math.max(0, Math.round(elapsedMs / 60_000))
      if (focusMinutes >= 1) {
        await this.recordSession(focusMinutes, natural)
        // Integración RPG: 1 XP por minuto de foco real (spec §8).
        const listId = await this.resolveListId()
        await applyXp(focusMinutes, listId, { touchStreak: false })
        emitToast({
          title: `Sesión de foco: ${focusMinutes} min`,
          body: `+${focusMinutes} XP · ¡bien ahí!`,
        })
      }
      this.state.pomodorosDone += 1
    }

    if (s.soundEnabled) playPhaseChange(s.soundVolume)
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
    this.state.status = 'running'
    this.state.endsAt = Date.now() + totalMs
    this.state.focusStartedAt = nextPhase === 'focus' ? Date.now() : null
    if (nextPhase === 'focus' && s.soundEnabled) startAmbient(s.ambientSound, s.ambientVolume)
    this.startTicking()
    this.publish()
  }

  private async resolveListId(): Promise<string | null> {
    if (this.state.linkListId) return this.state.linkListId
    if (this.state.linkTaskId) {
      const task = await db.tasks.get(this.state.linkTaskId)
      return task?.listId ?? null
    }
    return null
  }

  private async recordSession(focusMinutes: number, completed: boolean): Promise<void> {
    const now = Date.now()
    const session: StudySession = {
      id: uid(),
      taskId: this.state.linkTaskId,
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
