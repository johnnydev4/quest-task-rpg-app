/** Títulos RPG por nivel: cuanto más alto el nivel, más elevado el rango. */
export const LEVEL_TITLES: { level: number; title: string }[] = [
  { level: 1, title: 'Novato' },
  { level: 3, title: 'Aprendiz' },
  { level: 5, title: 'Aventurero' },
  { level: 8, title: 'Explorador' },
  { level: 12, title: 'Veterano' },
  { level: 16, title: 'Héroe' },
  { level: 20, title: 'Campeón' },
  { level: 25, title: 'Maestro' },
  { level: 30, title: 'Gran Maestro' },
  { level: 40, title: 'Leyenda' },
  { level: 50, title: 'Mítico' },
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
