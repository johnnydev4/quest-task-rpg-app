import { db } from '../db'
import type { PlayerProfile } from '../types'
import { levelFromXp, STAT_XP_BASE } from '../../lib/level'
import { localDateKey } from '../../lib/dates'

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
    achievements: [],
    updatedAt: Date.now(),
    syncStatus: 'pending',
  }
  await db.profile.add(fresh)
  return fresh
}

export interface XpResult {
  xp: number
  leveledUp: boolean
  newLevel: number
}

/**
 * Aplica un delta de XP al perfil y al stat de la lista (si aplica).
 * Deltas negativos (des-completar) restan lo mismo que se otorgó: no se puede
 * "cultivar" XP alternando el checkbox. La racha solo avanza con tareas (touchStreak).
 */
export async function applyXp(
  delta: number,
  listId: string | null,
  opts: { touchStreak: boolean },
): Promise<XpResult> {
  return db.transaction('rw', db.profile, db.lists, async () => {
    const profile = await ensureProfile()
    const before = levelFromXp(profile.totalXp).level
    const totalXp = Math.max(0, profile.totalXp + delta)
    const after = levelFromXp(totalXp).level

    let { streakCount, lastActiveDate } = profile
    if (opts.touchStreak && delta > 0) {
      const today = localDateKey()
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
      updatedAt: Date.now(),
      syncStatus: 'pending',
    })

    if (listId) {
      const list = await db.lists.get(listId)
      if (list) {
        const statXp = Math.max(0, list.statXp + delta)
        await db.lists.update(listId, {
          statXp,
          statLevel: levelFromXp(statXp, STAT_XP_BASE).level,
          updatedAt: Date.now(),
          syncStatus: 'pending',
        })
      }
    }

    return { xp: delta, leveledUp: after > before, newLevel: after }
  })
}
