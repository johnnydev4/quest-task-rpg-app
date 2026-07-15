import { db } from '../db/db'
import { localDateKey } from '../lib/dates'
import { habitEnded, isScheduledToday } from '../lib/habits'
import { notificationService } from './notifications'

const CHECK_EVERY_MS = 15_000

let started = false

/** Revisa recordatorios vencidos mientras la app está abierta y los dispara. */
export function startReminderScheduler(): void {
  if (started) return
  started = true
  void check()
  void checkHabits()
  setInterval(() => {
    void check()
    void checkHabits()
  }, CHECK_EVERY_MS)
}

/**
 * Avisos de hábitos: a la hora elegida, si el hábito toca hoy y aún no se
 * cumplió, se notifica UNA vez al día (el disparo del día queda en localStorage,
 * es un dato local que no vale la pena sincronizar).
 */
async function checkHabits(): Promise<void> {
  const todayKey = localDateKey()
  const firedKey = `quest-habit-avisos-${todayKey}`
  let fired: string[]
  try {
    fired = JSON.parse(localStorage.getItem(firedKey) ?? '[]') as string[]
  } catch {
    fired = []
  }

  const now = new Date()
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const habits = await db.habits.toArray()
  const doneLogs = await db.habitLogs.where('dateKey').equals(todayKey).toArray()
  const doneIds = new Set(doneLogs.map((l) => l.habitId))

  for (const habit of habits) {
    if (!habit.reminderTime || fired.includes(habit.id)) continue
    if (!isScheduledToday(habit) || habitEnded(habit) || doneIds.has(habit.id)) continue
    if (nowHM < habit.reminderTime) continue
    await notificationService.notify('🔁 Hábito pendiente', habit.title)
    fired.push(habit.id)
  }

  try {
    localStorage.setItem(firedKey, JSON.stringify(fired))
  } catch {
    // sin espacio: se reintentará; el aviso puede repetirse, no es crítico
  }
}

async function check(): Promise<void> {
  const now = Date.now()
  const due = (await db.reminders.where('remindAt').belowOrEqual(now).toArray()).filter(
    (r) => !r.dismissed,
  )
  for (const reminder of due) {
    const task = await db.tasks.get(reminder.taskId)
    // Tarea borrada o ya completada: el recordatorio deja de tener sentido.
    if (!task || task.completed) {
      await db.reminders.update(reminder.id, { dismissed: true })
      continue
    }
    await notificationService.notify('⏰ Recordatorio', task.title)
    const fired = reminder.firedCount + 1
    if (fired <= reminder.repeatCount) {
      await db.reminders.update(reminder.id, {
        firedCount: fired,
        remindAt: now + reminder.repeatEveryMin * 60_000,
        updatedAt: Date.now(),
        syncStatus: 'pending',
      })
    } else {
      await db.reminders.update(reminder.id, {
        firedCount: fired,
        dismissed: true,
        updatedAt: Date.now(),
        syncStatus: 'pending',
      })
    }
  }
}
