import type { Priority } from '../db/types'

export const PRIORITIES: Priority[] = ['low', 'medium', 'high']

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

export const PRIORITY_WEIGHT: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

/** Clases completas (no interpoladas) para que Tailwind las detecte al compilar. */
export const PRIORITY_CHIP_CLASS: Record<Priority, string> = {
  low: 'border-info/30 bg-info/10 text-info',
  medium: 'border-warn/30 bg-warn/10 text-warn',
  high: 'border-danger/30 bg-danger/10 text-danger',
}

export const PRIORITY_SELECTED_CLASS: Record<Priority, string> = {
  low: 'border-info/40 bg-info/15 text-info',
  medium: 'border-warn/40 bg-warn/15 text-warn',
  high: 'border-danger/40 bg-danger/15 text-danger',
}
