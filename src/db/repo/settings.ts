import { db } from '../db'
import type { Settings } from '../types'

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  soundEnabled: true,
  soundVolume: 0.7,
  completionSound: 'pop',
  theme: 'dark',
  accentColor: '#8b5cf6',
  glassTint: null,
  bgImage: null,
  bgBlur: 14,
  ambientSound: 'none',
  ambientVolume: 0.5,
  pomodoroFocusMin: 25,
  pomodoroShortBreakMin: 5,
  pomodoroLongBreakMin: 15,
  pomodoroLongBreakEvery: 4,
  updatedAt: 0,
}

export async function getSettings(): Promise<Settings> {
  // Fusiona con los defaults: filas guardadas por versiones anteriores
  // pueden no tener los campos nuevos.
  const stored = await db.settings.get('app')
  return { ...DEFAULT_SETTINGS, ...stored }
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, updatedAt: Date.now() })
}
