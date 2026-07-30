import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { levelFromXp, type LevelInfo } from './level'
import { dailyXpCap } from './xp'
import { localDateKey } from './dates'
import type { PlayerProfile } from '../db/types'

export interface ProfileInfo extends LevelInfo {
  profile: PlayerProfile | undefined
  totalXp: number
  /** Racha "viva": si el último día activo no es hoy ni ayer, se muestra 0 (sin culpa, solo reinicio). */
  streak: number
  /** Tope de XP del día, o `null` si el nivel actual todavía no tiene tope. */
  dailyCap: number | null
  /** XP ganado hoy (0 si el contador es de un día anterior). */
  xpToday: number
}

export function useProfile(): ProfileInfo {
  const profile = useLiveQuery(() => db.profile.get('me'), [])
  const totalXp = profile?.totalXp ?? 0
  const info = levelFromXp(totalXp)
  const today = localDateKey()
  const alive = profile?.lastActiveDate === today || profile?.lastActiveDate === localDateKey(-1)
  return {
    profile,
    totalXp,
    streak: alive ? (profile?.streakCount ?? 0) : 0,
    dailyCap: dailyXpCap(info.level),
    xpToday: profile?.xpDay === today ? (profile.xpToday ?? 0) : 0,
    ...info,
  }
}
