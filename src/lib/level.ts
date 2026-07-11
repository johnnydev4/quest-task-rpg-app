/** Curva creciente de la spec §7: xpNecesario = base * nivel^1.5 */
export const PLAYER_XP_BASE = 100
/** Los stats por lista usan una base menor para que suban de nivel más seguido. */
export const STAT_XP_BASE = 60

export function xpForLevel(level: number, base: number = PLAYER_XP_BASE): number {
  return Math.round(base * Math.pow(level, 1.5))
}

export interface LevelInfo {
  level: number
  /** XP acumulado dentro del nivel actual. */
  intoLevel: number
  /** XP total que pide el nivel actual para subir. */
  needed: number
}

export function levelFromXp(totalXp: number, base: number = PLAYER_XP_BASE): LevelInfo {
  let level = 1
  let rest = Math.max(0, totalXp)
  while (rest >= xpForLevel(level, base)) {
    rest -= xpForLevel(level, base)
    level++
  }
  return { level, intoLevel: rest, needed: xpForLevel(level, base) }
}
