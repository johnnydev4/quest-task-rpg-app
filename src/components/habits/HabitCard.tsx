import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Habit } from '../../db/types'
import { deleteHabit, toggleHabitToday } from '../../db/repo/habits'
import { localDateKey } from '../../lib/dates'
import {
  comboBackground,
  comboColor,
  comboIsRainbow,
  computeCombo,
  countScheduled,
  habitEnded,
  isScheduledToday,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
  xpForCombo,
} from '../../lib/habits'
import { ConfirmButton } from '../ui/ConfirmButton'

interface HabitCardProps {
  habit: Habit
  /** Versión compacta para la pestaña Hoy (toca el cuerpo para gestionar). */
  compact?: boolean
  onManage?: () => void
}

/**
 * Tarjeta de hábito: cristal más opaco que el resto, teñida con el color del
 * COMBO actual (la escalera 1=rojo … 7+=arcoíris) y con barra de progreso.
 * La palabra "Combo" solo aparece unos segundos al completar, con animación.
 */
export function HabitCard({ habit, compact = false, onManage }: HabitCardProps) {
  const logs = useLiveQuery(() => db.habitLogs.where('habitId').equals(habit.id).toArray(), [habit.id]) ?? []
  const doneKeys = useMemo(() => new Set(logs.map((l) => l.dateKey)), [logs])

  const todayDone = doneKeys.has(localDateKey())
  const combo = computeCombo(habit, doneKeys)
  const color = comboColor(combo)
  const rainbow = comboIsRainbow(combo)
  const total = countScheduled(habit)
  const done = logs.length
  // Indefinido: la barra mide el avance del combo hacia el arcoíris (7).
  const pct =
    total === null
      ? Math.min(100, Math.round((combo / 7) * 100))
      : total > 0
        ? Math.min(100, Math.round((done / total) * 100))
        : 0
  const scheduledToday = isScheduledToday(habit)
  const ended = habitEnded(habit)
  const nextXp = xpForCombo(combo + 1)

  const endLabel =
    habit.endDate === null
      ? null
      : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(habit.endDate)

  // La insignia "Combo ×n" aparece solo al completar, unos segundos, y se va.
  const [showCombo, setShowCombo] = useState(false)
  const prevDone = useRef(todayDone)
  useEffect(() => {
    if (todayDone && !prevDone.current) {
      setShowCombo(true)
      const t = setTimeout(() => setShowCombo(false), 2400)
      return () => clearTimeout(t)
    }
    prevDone.current = todayDone
  }, [todayDone])
  useEffect(() => {
    prevDone.current = todayDone
  })

  return (
    <div
      className={`glass-strong relative overflow-hidden rounded-2xl border ${compact ? 'p-2.5' : 'p-4'} ${ended ? 'opacity-70' : ''}`}
      style={{
        borderColor: `${color}66`,
        background: rainbow
          ? `linear-gradient(125deg, #ef444430, #eab30820 35%, #22c55e18 60%, #a855f715)`
          : `linear-gradient(125deg, ${color}36, ${color}15 70%)`,
      }}
    >
      <div className={`flex items-center ${compact ? 'gap-2.5' : 'gap-3'}`}>
        {/* Check de hoy */}
        {scheduledToday && !ended ? (
          <button
            onClick={() => void toggleHabitToday(habit.id)}
            aria-label={todayDone ? 'Desmarcar hoy' : `Cumplir hoy (+${nextXp} XP)`}
            title={todayDone ? 'Desmarcar hoy' : `Cumplir hoy · +${nextXp} XP`}
            className={`flex shrink-0 items-center justify-center rounded-full border-2 transition-all ${
              compact ? 'size-7' : 'size-9'
            } ${todayDone ? 'border-transparent' : 'border-ink-muted hover:scale-110'}`}
            style={todayDone ? { background: comboBackground(combo) } : undefined}
          >
            {todayDone && (
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={compact ? 'size-3.5' : 'size-4'} aria-hidden="true">
                <path d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ) : (
          <span
            className={`flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-line/15 text-[10px] text-ink-faint ${
              compact ? 'size-7' : 'size-9'
            }`}
            title={ended ? 'Hábito finalizado' : 'Hoy no toca'}
          >
            {ended ? '🏁' : '—'}
          </span>
        )}

        {/* Cuerpo */}
        <button
          onClick={onManage}
          disabled={!onManage}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <div className="flex items-center justify-between gap-2">
            <p className={`truncate font-bold text-ink ${compact ? 'text-sm' : 'text-sm'}`}>{habit.title}</p>
            {showCombo && combo > 0 && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black tracking-wide text-white uppercase"
                style={{ background: comboBackground(combo), animation: 'combo-pop 2.4s ease-out both' }}
              >
                Combo ×{combo}
              </span>
            )}
          </div>
          <div className={`overflow-hidden rounded-full bg-ink/10 ${compact ? 'mt-1.5 h-1.5' : 'mt-2 h-2'}`}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: comboBackground(combo) }}
            />
          </div>
          <div className={`flex items-center justify-between text-ink-faint ${compact ? 'mt-1 text-[10px]' : 'mt-1 text-[11px]'}`}>
            <span>
              {total === null
                ? `${done} cumplido${done === 1 ? '' : 's'} · sin fecha límite`
                : `${done}/${total} · hasta el ${endLabel}`}
            </span>
            {!compact && !ended && !scheduledToday && <span>Hoy no toca 💤</span>}
            {ended && <span>Finalizado</span>}
          </div>
        </button>
      </div>

      {/* Extras solo en la vista Hábitos */}
      {!compact && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/5 pt-2.5">
          <div className="flex gap-1" aria-label="Días programados">
            {WEEKDAY_ORDER.map((day) => {
              const active = habit.daysOfWeek.includes(day)
              return (
                <span
                  key={day}
                  className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold ${
                    active ? 'text-white' : 'text-ink-faint opacity-50'
                  }`}
                  style={active ? { backgroundColor: `${color}cc` } : undefined}
                >
                  {WEEKDAY_SHORT[day]}
                </span>
              )
            })}
          </div>
          <ConfirmButton
            label="Eliminar"
            confirmLabel="¿Seguro?"
            onConfirm={() => void deleteHabit(habit.id)}
          />
        </div>
      )}
    </div>
  )
}
