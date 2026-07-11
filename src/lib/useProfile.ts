import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { levelFromXp, type LevelInfo } from './level'
import { localDateKey } from './dates'
import type { PlayerProfile } from '../db/types'

export interface ProfileInfo extends LevelInfo {
  profile: PlayerProfile | undefined
  totalXp: number
  /** Racha "viva": si el último día activo no es hoy ni ayer, se muestra 0 (sin culpa, solo reinicio). */
  streak: number
}

export function useProfile(): ProfileInfo {
  const profile = useLiveQuery(() => db.profile.get('me'), [])
  const totalXp = profile?.totalXp ?? 0
  const info = levelFromXp(totalXp)
  const alive =
    profile?.lastActiveDate === localDateKey() || profile?.lastActiveDate === localDateKey(-1)
  return { profile, totalXp, streak: alive ? (profile?.streakCount ?? 0) : 0, ...info }
}
