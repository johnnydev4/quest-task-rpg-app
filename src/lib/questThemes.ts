import { LOCALE, t } from './i18n'
/**
 * Temática RPG mensual: cada mes lleva un título épico basado en su propio
 * nombre (p. ej. "La Gran Misión de Agosto"). La misión principal del mes usa
 * ese título; las misiones semanales heredan sus colores para destacar entre
 * las tareas normales.
 */

export interface MonthTheme {
  creature: string
  emoji: string
  /** Título épico del mes, tejido con el nombre del mes (frase variada). */
  epicTitle: string
  /** Lema motivacional corto. */
  motto: string
  colorA: string
  colorB: string
  /** Ilustración opcional de la criatura (archivo en public/); si falta, se usa el emoji. */
  image?: string
  /** Paisaje opcional que cubre TODO el banner del mes (con velo para el texto). */
  bannerImage?: string
}

export const MONTH_THEMES: MonthTheme[] = [
  {
    creature: t('Phoenix', 'Fénix'),
    emoji: '🐦‍🔥',
    epicTitle: t('The January Path', 'El Sendero de Enero'),
    motto: t('Rise from your ashes: every beginning is yours.', 'Renace de tus cenizas: cada comienzo te pertenece.'),
    colorA: '#f97316',
    colorB: '#dc2626',
  },
  {
    creature: t('Unicorn', 'Unicornio'),
    emoji: '🦄',
    epicTitle: t('The February Spark', 'La Chispa de Febrero'),
    motto: t('Chase the impossible, heart first.', 'Persigue lo imposible con el corazón por delante.'),
    colorA: '#ec4899',
    colorB: '#a855f7',
  },
  {
    creature: t('Griffin', 'Grifo'),
    emoji: '🦅',
    epicTitle: t('The March Awakening', 'El Despertar de Marzo'),
    motto: t('Courage and vigilance: a new chapter awakens.', 'Coraje y vigilia: una nueva etapa despierta.'),
    colorA: '#f59e0b',
    colorB: '#92400e',
  },
  {
    creature: t('Pegasus', 'Pegaso'),
    emoji: '🪽',
    epicTitle: t('The April Conquest', 'La Conquista de Abril'),
    motto: t('Spread your wings: create and grow without limits.', 'Despliega las alas: crea y crece sin límites.'),
    colorA: '#38bdf8',
    colorB: '#818cf8',
  },
  {
    creature: 'Kirin',
    emoji: '🦌',
    epicTitle: t('The May Ascent', 'El Ascenso de Mayo'),
    motto: t('Peace and fortune follow every steady step.', 'Paz y fortuna acompañan cada paso firme.'),
    colorA: '#10b981',
    colorB: '#0d9488',
  },
  {
    creature: t('Mermaid', 'Sirena'),
    emoji: '🧜‍♀️',
    epicTitle: t('The June Challenge', 'El Desafío de Junio'),
    motto: t('Dive into the mystery and emerge with your truth.', 'Sumérgete en el misterio y emerge con tu verdad.'),
    colorA: '#06b6d4',
    colorB: '#3b82f6',
  },
  {
    creature: t('Dragon', 'Dragón'),
    emoji: '🐉',
    epicTitle: t('The July Summit', 'La Cima de Julio'),
    motto: t('Power, fire and leadership: this month is yours to conquer.', 'Poder, fuego y liderazgo: este mes se conquista.'),
    colorA: '#dc2626',
    colorB: '#f59e0b',
    image: '/creatures/dragon.svg',
    bannerImage: '/creatures/dragon-banner.png',
  },
  {
    creature: t('Manticore', 'Mantícora'),
    emoji: '🦁',
    epicTitle: t('The Great August Quest', 'La Gran Misión de Agosto'),
    motto: t('Strength and determination: endure and prevail.', 'Fuerza y determinación: resiste y vence.'),
    colorA: '#e11d48',
    colorB: '#7f1d1d',
    bannerImage: '/creatures/manticore-banner.jpg',
  },
  {
    creature: t('Hippogriff', 'Hipogrifo'),
    emoji: '🪶',
    epicTitle: t('The September Crossing', 'La Travesía de Septiembre'),
    motto: t('Wisdom and balance to cross the transition.', 'Sabiduría y equilibrio para cruzar la transición.'),
    colorA: '#6366f1',
    colorB: '#14b8a6',
  },
  {
    creature: t('Cerberus', 'Cerbero'),
    emoji: '🐺',
    epicTitle: t('The October Trial', 'El Reto de Octubre'),
    motto: t('Transform: cross the threshold of the unknown.', 'Transfórmate: cruza el umbral de lo desconocido.'),
    colorA: '#7c3aed',
    colorB: '#312e81',
  },
  {
    creature: 'Kraken',
    emoji: '🐙',
    epicTitle: t('The November Forge', 'La Forja de Noviembre'),
    motto: t('Descend into the depths and return stronger.', 'Desciende a lo profundo y vuelve más fuerte.'),
    colorA: '#0ea5e9',
    colorB: '#1e3a8a',
  },
  {
    creature: t('Yule Goat', 'Cabra de Yule'),
    emoji: '🐐',
    epicTitle: t('The Grand December Finale', 'El Gran Cierre de Diciembre'),
    motto: t('Celebrate, protect and close the cycle with abundance.', 'Celebra, protege y cierra el ciclo con abundancia.'),
    colorA: '#ca8a04',
    colorB: '#166534',
  },
]

const pad = (n: number) => String(n).padStart(2, '0')

/** Clave de mes 'YYYY-MM'. */
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function themeForMonthKey(monthKey: string): MonthTheme {
  const month = Number(monthKey.split('-')[1]) - 1
  return MONTH_THEMES[Math.max(0, Math.min(11, month))]
}

/** Semana del mes 1..4 (días 1-7, 8-14, 15-21, 22-fin). */
export function weekOfMonth(d: Date): number {
  return Math.min(4, Math.ceil(d.getDate() / 7))
}

/** Rango legible de una semana: "1 – 7 jul". */
export function weekRangeLabel(monthKey: string, week: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const from = (week - 1) * 7 + 1
  const to = week === 4 ? lastDay : Math.min(week * 7, lastDay)
  const monthShort = new Intl.DateTimeFormat(LOCALE, { month: 'short' }).format(new Date(y, m - 1, 1))
  return `${from} – ${to} ${monthShort}`
}

export function monthLabelOf(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const label = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}
