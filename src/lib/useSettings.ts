import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Settings } from '../db/types'
import { DEFAULT_SETTINGS } from '../db/repo/settings'

export function useSettings(): Settings {
  const stored = useLiveQuery(() => db.settings.get('app'), [])
  // Fusiona con los defaults: filas de versiones anteriores pueden no tener campos nuevos.
  return { ...DEFAULT_SETTINGS, ...stored }
}
