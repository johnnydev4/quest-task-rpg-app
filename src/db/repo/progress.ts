import { db } from '../db'
import type { PlayerProfile } from '../types'
import { levelFromXp, STAT_XP_BASE } from '../../lib/level'
import { dailyXpCap } from '../../lib/xp'
import { localDateKey } from '../../lib/dates'
import { emitToast } from '../../lib/events'

const PROFILE_ID = 'me'

async function ensureProfile(): Promise<PlayerProfile> {
  const existing = await db.profile.get(PROFILE_ID)
  if (existing) return existing
  const fresh: PlayerProfile = {
    id: PROFILE_ID,
    level: 1,
    totalXp: 0,
    streakCount: 0,
    lastActiveDate: null,
    xpDay: null,
    xpToday: 0,
    achievements: [],
    updatedAt: Date.now(),
    syncStatus: 'pending',
  }
  await db.profile.add(fresh)
  return fresh
}

/**
 * Marca que el aviso diario de vencidas ya se mostró en el día `day`. Al vivir
 * en el perfil sincronizado, otros dispositivos lo verán tras sincronizar y no
 * volverán a mostrarlo. Si ya estaba marcado ese día, no reescribe (no ensucia
 * el `updatedAt` ni dispara syncs de más).
 */
export async function markOverdueNoticeShown(day: string): Promise<void> {
  const profile = await ensureProfile()
  if (profile.overdueNoticeDay === day) return
  await db.profile.put({
    ...profile,
    overdueNoticeDay: day,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
}

export interface XpResult {
  xp: number
  leveledUp: boolean
  newLevel: number
  /** El tope diario recortó (total o parcialmente) el XP pedido. */
  capped: boolean
}

/**
 * Aplica un delta de XP al perfil y al stat de la lista (si aplica).
 * Deltas negativos (des-completar) restan lo mismo que se otorgó: no se puede
 * "cultivar" XP alternando el checkbox. La racha solo avanza con tareas (touchStreak).
 *
 * Desde el nivel 3 hay un tope diario (`dailyXpCap`): lo que exceda se descarta,
 * pero la acción sigue contando para la racha. Deshacer devuelve el margen del día.
 */
export async function applyXp(
  delta: number,
  listId: string | null,
  opts: { touchStreak: boolean },
): Promise<XpResult> {
  const result = await db.transaction('rw', db.profile, db.lists, async () => {
    const profile = await ensureProfile()
    const today = localDateKey()
    const before = levelFromXp(profile.totalXp).level

    // El contador del día se reinicia solo al cambiar de fecha local.
    const usedToday = profile.xpDay === today ? profile.xpToday : 0
    const cap = dailyXpCap(before)
    const granted =
      delta > 0 && cap !== null ? Math.max(0, Math.min(delta, cap - usedToday)) : delta

    const totalXp = Math.max(0, profile.totalXp + granted)
    const after = levelFromXp(totalXp).level

    let { streakCount, lastActiveDate } = profile
    if (opts.touchStreak && delta > 0) {
      if (lastActiveDate !== today) {
        streakCount = lastActiveDate === localDateKey(-1) ? streakCount + 1 : 1
        lastActiveDate = today
      }
    }

    await db.profile.put({
      ...profile,
      totalXp,
      level: after,
      streakCount,
      lastActiveDate,
      xpDay: today,
      xpToday: Math.max(0, usedToday + granted),
      updatedAt: Date.now(),
      syncStatus: 'pending',
    })

    if (listId && granted !== 0) {
      const list = await db.lists.get(listId)
      if (list) {
        const statXp = Math.max(0, list.statXp + granted)
        await db.lists.update(listId, {
          statXp,
          statLevel: levelFromXp(statXp, STAT_XP_BASE).level,
          updatedAt: Date.now(),
          syncStatus: 'pending',
        })
      }
    }

    return { xp: granted, leveledUp: after > before, newLevel: after, capped: granted < delta }
  })

  if (result.capped) {
    emitToast({
      title: 'Tope diario de XP',
      body: 'Ya alcanzaste el máximo de hoy. Vuelve mañana para seguir subiendo.',
    })
  }
  return result
}
