import { db } from '../db'

/** Registra una eliminación local para propagarla a la nube en la próxima sincronización. */
export async function recordDeletion(table: string, id: string): Promise<void> {
  await db.tombstones.put({ id, table, deletedAt: Date.now() })
}
