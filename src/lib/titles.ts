import { t } from './i18n'
/** Títulos RPG por nivel: cuanto más alto el nivel, más elevado el rango. */
export const LEVEL_TITLES: { level: number; title: string }[] = [
  { level: 1, title: t('Novice', 'Novato') },
  { level: 3, title: t('Apprentice', 'Aprendiz') },
  { level: 5, title: t('Adventurer', 'Aventurero') },
  { level: 8, title: t('Explorer', 'Explorador') },
  { level: 12, title: t('Veteran', 'Veterano') },
  { level: 16, title: t('Hero', 'Héroe') },
  { level: 20, title: t('Champion', 'Campeón') },
  { level: 25, title: t('Master', 'Maestro') },
  { level: 30, title: t('Grandmaster', 'Gran Maestro') },
  { level: 40, title: t('Legend', 'Leyenda') },
  { level: 50, title: t('Mythic', 'Mítico') },
]

export function titleForLevel(level: number): string {
  let current = LEVEL_TITLES[0].title
  for (const t of LEVEL_TITLES) {
    if (level >= t.level) current = t.title
    else break
  }
  return current
}

/** ¿Este nivel estrena un título nuevo? (para celebrarlo en el level-up) */
export function isNewTitleAt(level: number): boolean {
  return LEVEL_TITLES.some((t) => t.level === level)
}

/** Próximo título por desbloquear, o null si ya es el máximo. */
export function nextTitle(level: number): { level: number; title: string } | null {
  return LEVEL_TITLES.find((t) => t.level > level) ?? null
}
