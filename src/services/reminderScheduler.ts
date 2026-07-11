import { db } from '../db/db'
import { notificationService } from './notifications'

const CHECK_EVERY_MS = 15_000

let started = false

/** Revisa recordatorios vencidos mientras la app está abierta y los dispara. */
export function startReminderScheduler(): void {
  if (started) return
  started = true
  void check()
  setInterval(() => void check(), CHECK_EVERY_MS)
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
