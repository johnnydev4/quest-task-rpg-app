import { useState } from 'react'
import type { Reminder } from '../../../db/types'
import { createReminder, deleteReminder, updateReminder } from '../../../db/repo/reminders'
import { dateTimeInputToMs, msToDateTimeInput } from '../../../lib/dates'
import { notificationService } from '../../../services/notifications'

interface ReminderSectionProps {
  taskId: string
  reminders: Reminder[]
}

const selectClass =
  'rounded-md border border-line/10 glass-input px-2 py-1 text-xs text-ink outline-none focus:border-accent-500/60'

export function ReminderSection({ taskId, reminders }: ReminderSectionProps) {
  const [permission, setPermission] = useState(notificationService.permission())

  async function askPermission() {
    await notificationService.requestPermission()
    setPermission(notificationService.permission())
  }

  function add() {
    const inOneHour = Date.now() + 60 * 60_000
    createReminder({ taskId, remindAt: inOneHour })
  }

  return (
    <div className="space-y-2">
      {reminders.map((r) => (
        <div key={r.id} className="group space-y-1.5 rounded-lg border border-line/5 glass-input px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <input
              type="datetime-local"
              value={msToDateTimeInput(r.remindAt)}
              onChange={(e) => {
                const ms = dateTimeInputToMs(e.target.value)
                if (ms !== null) updateReminder(r.id, { remindAt: ms, dismissed: false, firedCount: 0 })
              }}
              aria-label="Fecha y hora del recordatorio"
              className={`${selectClass}`}
            />
            <button
              onClick={() => deleteReminder(r.id)}
              aria-label="Eliminar recordatorio"
              className="text-ink-faint transition-colors hover:text-danger"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <span>Repetir aviso</span>
            <select
              value={r.repeatCount}
              onChange={(e) => updateReminder(r.id, { repeatCount: Number(e.target.value) })}
              aria-label="Veces que se repite el aviso"
              className={selectClass}
            >
              {[0, 1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'no' : `${n} ${n === 1 ? 'vez' : 'veces'}`}
                </option>
              ))}
            </select>
            {r.repeatCount > 0 && (
              <>
                <span>cada</span>
                <select
                  value={r.repeatEveryMin}
                  onChange={(e) => updateReminder(r.id, { repeatEveryMin: Number(e.target.value) })}
                  aria-label="Minutos entre avisos"
                  className={selectClass}
                >
                  {[5, 10, 15, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} min
                    </option>
                  ))}
                </select>
              </>
            )}
            {r.dismissed && <span className="text-ink-faint">· ya avisado</span>}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-line/15 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-line/30 hover:text-ink-dim"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          Añadir recordatorio
        </button>
        {permission === 'default' && (
          <button
            type="button"
            onClick={askPermission}
            className="rounded-lg border border-line/10 px-3 py-1.5 text-xs text-ink-dim transition-colors hover:bg-ink/5"
          >
            Permitir notificaciones del sistema
          </button>
        )}
        {permission === 'denied' && (
          <span className="text-[11px] text-ink-faint">Notificaciones del sistema bloqueadas; los avisos saldrán dentro de la app.</span>
        )}
      </div>
    </div>
  )
}
