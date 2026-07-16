import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { monthKeyOf, themeForMonthKey, weekOfMonth } from '../../lib/questThemes'
import { SwordIcon, TrophyIcon } from '../ui/icons'

/**
 * La misión de la semana en curso, destacada entre las tareas normales (side
 * quests) con el fondo de la criatura mítica del mes. Toca para ir a Misiones.
 */
export function WeeklyQuestBanner({ onOpen }: { onOpen: () => void }) {
  const now = new Date()
  const monthKey = monthKeyOf(now)
  const week = weekOfMonth(now)
  const theme = themeForMonthKey(monthKey)

  // Respuesta al reto persistida por mes y por dispositivo.
  const declineKey = `quest-reto-rechazado-${monthKey}`
  const acceptKey = `quest-reto-aceptado-${monthKey}`
  const [declined, setDeclined] = useState(() => localStorage.getItem(declineKey) === '1')
  const [accepted, setAccepted] = useState(() => localStorage.getItem(acceptKey) === '1')
  function decline() {
    localStorage.setItem(declineKey, '1')
    setDeclined(true)
  }
  function accept() {
    localStorage.setItem(acceptKey, '1')
    setAccepted(true)
    onOpen()
  }

  const quests = useLiveQuery(() => db.quests.where('monthKey').equals(monthKey).toArray(), [monthKey])
  const quest = quests?.find((q) => q.week === week)
  const steps =
    useLiveQuery(
      async () => (quest ? await db.questSteps.where('questId').equals(quest.id).toArray() : []),
      [quest?.id],
    ) ?? []

  if (quests === undefined) return null

  // Sin misión esta semana: el reto pregunta si lo aceptas. Rechazarlo lo
  // oculta de Hoy durante el resto del mes (no punitivo: vuelve el mes siguiente,
  // y siempre puedes entrar a Misiones por tu cuenta). Aceptarlo (o tener ya
  // cualquier misión forjada este mes) también deja de preguntar.
  if (!quest) {
    if (declined || accepted || quests.length > 0) return null
    return (
      <div
        className="flex w-full flex-wrap items-center gap-2.5 rounded-2xl border border-dashed px-4 py-3 text-sm"
        style={{ borderColor: `${theme.colorA}66`, color: theme.colorA }}
      >
        <span className="text-lg" aria-hidden="true">
          {theme.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{theme.epicTitle}</span>
          <span className="block text-xs opacity-80">¿Aceptas el desafío de este mes?</span>
        </span>
        <span className="flex shrink-0 gap-2">
          <button
            onClick={accept}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${theme.colorA}, ${theme.colorB})` }}
          >
            <SwordIcon className="size-3.5" /> Aceptar el reto
          </button>
          <button
            onClick={decline}
            className="rounded-lg border border-line/15 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-ink/5"
          >
            Ahora no
          </button>
        </span>
      </div>
    )
  }

  const done = steps.filter((s) => s.completed).length

  return (
    <button
      onClick={onOpen}
      className="relative w-full overflow-hidden rounded-2xl border p-4 text-left transition-transform hover:scale-[1.01] active:scale-100"
      style={{
        borderColor: `${theme.colorA}80`,
        // Cristal líquido teñido con el color del mes: más opaco pero translúcido, con blur del fondo.
        background: `linear-gradient(120deg, ${theme.colorA}7a, ${theme.colorB}47 72%)`,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.18), 0 10px 26px -10px ${theme.colorA}80`,
      }}
    >
      <span className="pointer-events-none absolute -top-3 -right-2 text-5xl opacity-30 select-none" aria-hidden="true">
        {theme.emoji}
      </span>
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest uppercase" style={{ color: theme.colorA }}>
            <SwordIcon className="size-3.5" /> Misión de la semana {week} · {theme.creature}
          </p>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ink-muted">
            {quest.completed ? (
              <>
                <TrophyIcon className="size-3.5" /> Conquistada
              </>
            ) : steps.length > 0 ? (
              `${done}/${steps.length} pasos`
            ) : (
              `+${quest.xpValue} XP`
            )}
          </span>
        </div>
        <p className={`mt-1 truncate text-base font-bold ${quest.completed ? 'text-ink-faint line-through' : 'text-ink'}`}>
          {quest.title}
        </p>
        {steps.length > 0 && !quest.completed && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%`,
                background: `linear-gradient(90deg, ${theme.colorA}, ${theme.colorB})`,
              }}
            />
          </div>
        )}
      </div>
    </button>
  )
}
