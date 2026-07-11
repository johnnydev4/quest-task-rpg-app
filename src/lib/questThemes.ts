/**
 * Temática RPG mensual: cada mes está regido por una criatura mítica.
 * La misión principal del mes lleva su nombre épico; las misiones semanales
 * heredan sus colores para destacar entre las tareas normales.
 */

export interface MonthTheme {
  creature: string
  emoji: string
  /** Título épico del mes (frase variada, no siempre "El reto de…"). */
  epicTitle: string
  /** Lema motivacional corto. */
  motto: string
  colorA: string
  colorB: string
  /** Ilustración opcional de la criatura (archivo en public/); si falta, se usa el emoji. */
  image?: string
}

export const MONTH_THEMES: MonthTheme[] = [
  {
    creature: 'Fénix',
    emoji: '🐦‍🔥',
    epicTitle: 'El Despertar del Fénix',
    motto: 'Renace de tus cenizas: cada comienzo te pertenece.',
    colorA: '#f97316',
    colorB: '#dc2626',
  },
  {
    creature: 'Unicornio',
    emoji: '🦄',
    epicTitle: 'La Promesa del Unicornio',
    motto: 'Persigue lo imposible con el corazón por delante.',
    colorA: '#ec4899',
    colorB: '#a855f7',
  },
  {
    creature: 'Grifo',
    emoji: '🦅',
    epicTitle: 'El Vuelo del Grifo',
    motto: 'Coraje y vigilia: una nueva etapa despierta.',
    colorA: '#f59e0b',
    colorB: '#92400e',
  },
  {
    creature: 'Pegaso',
    emoji: '🪽',
    epicTitle: 'La Cabalgata del Pegaso',
    motto: 'Despliega las alas: crea y crece sin límites.',
    colorA: '#38bdf8',
    colorB: '#818cf8',
  },
  {
    creature: 'Kirin',
    emoji: '🦌',
    epicTitle: 'La Bendición del Kirin',
    motto: 'Paz y fortuna acompañan cada paso firme.',
    colorA: '#10b981',
    colorB: '#0d9488',
  },
  {
    creature: 'Sirena',
    emoji: '🧜‍♀️',
    epicTitle: 'El Canto de la Sirena',
    motto: 'Sumérgete en el misterio y emerge con tu verdad.',
    colorA: '#06b6d4',
    colorB: '#3b82f6',
  },
  {
    creature: 'Dragón',
    emoji: '🐉',
    epicTitle: 'El Reto del Dragón',
    motto: 'Poder, fuego y liderazgo: este mes se conquista.',
    colorA: '#dc2626',
    colorB: '#f59e0b',
    image: '/creatures/dragon.svg',
  },
  {
    creature: 'Mantícora',
    emoji: '🦁',
    epicTitle: 'La Prueba de la Mantícora',
    motto: 'Fuerza y determinación: resiste y vence.',
    colorA: '#e11d48',
    colorB: '#7f1d1d',
  },
  {
    creature: 'Hipogrifo',
    emoji: '🪶',
    epicTitle: 'La Senda del Hipogrifo',
    motto: 'Sabiduría y equilibrio para cruzar la transición.',
    colorA: '#6366f1',
    colorB: '#14b8a6',
  },
  {
    creature: 'Cerbero',
    emoji: '🐺',
    epicTitle: 'Los Portales del Cerbero',
    motto: 'Transfórmate: cruza el umbral de lo desconocido.',
    colorA: '#7c3aed',
    colorB: '#312e81',
  },
  {
    creature: 'Kraken',
    emoji: '🐙',
    epicTitle: 'Las Profundidades del Kraken',
    motto: 'Desciende a lo profundo y vuelve más fuerte.',
    colorA: '#0ea5e9',
    colorB: '#1e3a8a',
  },
  {
    creature: 'Cabra de Yule',
    emoji: '🐐',
    epicTitle: 'El Festín de la Cabra de Yule',
    motto: 'Celebra, protege y cierra el ciclo con abundancia.',
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
  const monthShort = new Intl.DateTimeFormat('es', { month: 'short' }).format(new Date(y, m - 1, 1))
  return `${from} – ${to} ${monthShort}`
}

export function monthLabelOf(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const label = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}
