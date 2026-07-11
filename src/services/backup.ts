import { db } from '../db/db'
import { localDateKey } from '../lib/dates'

/** Respaldo manual (spec §5): exporta/importa todos los datos como JSON. */

const TABLES = [
  'lists',
  'tasks',
  'subtasks',
  'comments',
  'tags',
  'reminders',
  'studySessions',
  'profile',
  'settings',
  'quests',
  'questSteps',
  'habits',
  'habitLogs',
] as const

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('No se pudo leer el adjunto'))
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}

export async function exportData(): Promise<void> {
  const payload: Record<string, unknown> = {
    app: 'quest',
    version: 1,
    exportedAt: new Date().toISOString(),
  }
  for (const table of TABLES) {
    payload[table] = await db.table(table).toArray()
  }
  payload.attachments = await Promise.all(
    (await db.attachments.toArray()).map(async (a) => ({
      ...a,
      blob: undefined,
      blobBase64: await blobToBase64(a.blob),
    })),
  )

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `quest-backup-${localDateKey()}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function importData(file: File): Promise<number> {
  const json = JSON.parse(await file.text()) as Record<string, unknown>
  if (json.app !== 'quest') throw new Error('El archivo no es un respaldo de Quest')

  let count = 0
  await db.transaction('rw', db.tables, async () => {
    for (const table of TABLES) {
      const rows = json[table]
      if (Array.isArray(rows) && rows.length) {
        await db.table(table).bulkPut(rows)
        count += rows.length
      }
    }
    const attachments = json.attachments
    if (Array.isArray(attachments)) {
      for (const a of attachments as Record<string, unknown>[]) {
        if (typeof a.blobBase64 !== 'string') continue
        const { blobBase64, ...rest } = a
        await db.attachments.put({
          ...(rest as Omit<import('../db/types').Attachment, 'blob'>),
          blob: base64ToBlob(blobBase64, (a.mimeType as string) || 'application/octet-stream'),
        })
        count++
      }
    }
  })
  return count
}
