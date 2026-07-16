import { useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { pomodoro } from '../services/pomodoro'
import { localDateKey } from './dates'

export interface PomodoroProgress {
  /** Minutos de foco de hoy dedicados (recortado al objetivo para la barra). */
  doneMin: number
  goalMin: number
  /** 0..100 */
  pct: number
  completed: boolean
}

/**
 * Progreso de HOY hacia el objetivo pomodoro de una tarea o hábito: suma los
 * minutos de foco registrados y, si el temporizador está en marcha vinculado a
 * ese elemento, también los minutos ya transcurridos de la fase actual (en vivo).
 */
export function usePomodoroProgress(
  link: { taskId?: string; habitId?: string },
  goalMin: number | null | undefined,
): PomodoroProgress | null {
  const snap = useSyncExternalStore(pomodoro.subscribe, pomodoro.getSnapshot)
  const recorded =
    useLiveQuery(async () => {
      if (!link.taskId && !link.habitId) return 0
      const sessions = await db.studySessions.where('dateKey').equals(localDateKey()).toArray()
      return sessions
        .filter((s) => (link.taskId ? s.taskId === link.taskId : s.habitId === link.habitId))
        .reduce((sum, s) => sum + s.focusMinutes, 0)
    }, [link.taskId, link.habitId]) ?? 0

  if (goalMin == null || goalMin <= 0) return null

  const liveLinked =
    snap.phase === 'focus' &&
    snap.status !== 'idle' &&
    ((link.taskId != null && snap.linkTaskId === link.taskId) ||
      (link.habitId != null && snap.linkHabitId === link.habitId))
  const liveMin = liveLinked ? Math.floor((snap.totalMs - snap.remainingMs) / 60_000) : 0

  const total = recorded + liveMin
  return {
    doneMin: Math.min(goalMin, total),
    goalMin,
    pct: Math.min(100, Math.round((total / goalMin) * 100)),
    completed: total >= goalMin,
  }
}
