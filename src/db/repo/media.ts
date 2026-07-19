import { db } from '../db'

const BG_ID = 'bg'

/** Imagen de fondo actual (local, por dispositivo); null si no hay. */
export async function getBgImage(): Promise<Blob | null> {
  return (await db.appMedia.get(BG_ID))?.blob ?? null
}

/** Guarda o quita la imagen de fondo sin tocar la fila de ajustes. */
export async function setBgImage(blob: Blob | null): Promise<void> {
  if (blob) await db.appMedia.put({ id: BG_ID, blob })
  else await db.appMedia.delete(BG_ID)
}
