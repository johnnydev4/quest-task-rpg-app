import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Habit } from '../../db/types'
import { deleteHabit, toggleHabitToday, updateHabit } from '../../db/repo/habits'
import { pomodoro } from '../../services/pomodoro'
import { emitToast } from '../../lib/events'
import { localDateKey } from '../../lib/dates'
import { usePomodoroProgress } from '../../lib/usePomodoroProgress'
import { ContextMenu, type MenuEntry } from '../ui/ContextMenu'
import { CheckCircleIcon, FlagIcon, FolderIcon, TimerIcon } from '../ui/icons'
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

/** Menú contextual (clic derecho) de un hábito: completar hoy y mover a lista. */
function HabitContextMenu({
  habit,
  canToggleToday,
  todayDone,
  x,
  y,
  onClose,
}: {
  habit: Habit
  canToggleToday: boolean
  todayDone: boolean
  x: number
  y: number
  onClose: () => void
}) {
  const lists = useLiveQuery(() => db.lists.orderBy('order').toArray(), []) ?? []

  const entries: MenuEntry[] = [
    ...(canToggleToday
      ? [
          {
            label: todayDone ? 'Desmarcar hoy' : 'Completar hoy',
            icon: <CheckCircleIcon className="size-4" />,
            onClick: () => void toggleHabitToday(habit.id),
          },
        ]
      : []),
    {
      label: 'Mover a lista…',
      icon: <FolderIcon className="size-4" />,
      submenu: [
        ...lists.map((l) => ({
          label: l.emoji ? `${l.emoji} ${l.name}` : l.name,
          selected: habit.listId === l.id,
          onClick: () => void updateHabit(habit.id, { listId: l.id }),
        })),
        {
          label: 'Sin lista',
          selected: habit.listId == null,
          onClick: () => void updateHabit(habit.id, { listId: null }),
        },
      ],
    },
  ]

  return <ContextMenu x={x} y={y} entries={entries} onClose={onClose} />
}

/**
 * Tarjeta de hábito: cristal más opaco que el resto, teñida con el color del
 * COMBO actual (la escalera 1=rojo … 7+=arcoíris) y con barra de progreso.
 * La palabra "Combo" solo aparece unos segundos al completar, con animación.
 */
export function HabitCard({ habit, compact = false, onManage }: HabitCardProps) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const logsRaw = useLiveQuery(() => db.habitLogs.where('habitId').equals(habit.id).toArray(), [habit.id])
  const logsLoaded = logsRaw !== undefined
  const logs = logsRaw ?? []
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
  // Barra de objetivo pomodoro: minutos de foco de hoy vinculados a este hábito.
  const pomo = usePomodoroProgress({ habitId: habit.id }, habit.pomodoroMinutes)

  const endLabel =
    habit.endDate === null
      ? null
      : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(habit.endDate)

  // La insignia "Combo ×n" aparece solo al completar, unos segundos, y se va.
  // prevDone parte en null: el primer valor CARGADO fija la línea base, así un
  // remontaje de la tarjeta (p. ej. al moverse a Completados) no re-dispara la animación.
  const [showCombo, setShowCombo] = useState(false)
  const prevDone = useRef<boolean | null>(null)
  useEffect(() => {
    if (!logsLoaded) return
    if (prevDone.current === null) {
      prevDone.current = todayDone
      return
    }
    if (todayDone && !prevDone.current) {
      prevDone.current = todayDone
      setShowCombo(true)
      const t = setTimeout(() => setShowCombo(false), 2400)
      return () => clearTimeout(t)
    }
    prevDone.current = todayDone
  }, [todayDone, logsLoaded])

  return (
    <div
      className={`glass-strong relative overflow-hidden rounded-2xl border ${compact ? 'p-2' : 'p-3'} ${ended ? 'opacity-70' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
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
            {ended ? <FlagIcon className="size-3.5" /> : '—'}
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
          {pomo && (
            <div className={compact ? 'mt-1.5' : 'mt-2'}>
              <div className="flex items-center justify-between text-[10px] text-ink-faint">
                <span className="flex items-center gap-1">
                  <TimerIcon className="size-3" />
                  {pomo.completed
                    ? '¡Pomodoro completado!'
                    : `${pomo.doneMin}/${pomo.goalMin} min de foco`}
                </span>
              </div>
              <div className={`mt-0.5 overflow-hidden rounded-full bg-ink/10 ${compact ? 'h-1' : 'h-1.5'}`}>
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pomo.completed ? 'bg-ok' : 'bg-accent-500'}`}
                  style={{ width: `${pomo.pct}%` }}
                />
              </div>
            </div>
          )}
        </button>

        {/* Pomodoro vinculado: arranca un foco con los minutos del hábito */}
        {habit.pomodoroMinutes != null && scheduledToday && !ended && !todayDone && (
          <button
            onClick={() => {
              // Esperar el start: es async y reinicia el estado (pisaría el minimized).
              void pomodoro.start({ habitId: habit.id }).then(() => pomodoro.setMinimized(true))
              emitToast({ title: '🍅 Pomodoro iniciado', body: `${habit.title} · objetivo ${habit.pomodoroMinutes} min` })
            }}
            aria-label={`Empezar pomodoro de ${habit.pomodoroMinutes} minutos`}
            title={`Pomodoro · ${habit.pomodoroMinutes} min`}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-line/10 px-2 py-1.5 text-[11px] font-semibold text-ink-dim transition-colors hover:bg-ink/5"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="size-3" aria-hidden="true">
              <path d="M8 5.14v13.72L19 12z" />
            </svg>
            {habit.pomodoroMinutes}m
          </button>
        )}
      </div>

      {/* Extras solo en la vista Hábitos */}
      {!compact && (
        <>
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
        </>
      )}
      {menu && (
        <HabitContextMenu
          habit={habit}
          canToggleToday={scheduledToday && !ended}
          todayDone={todayDone}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
