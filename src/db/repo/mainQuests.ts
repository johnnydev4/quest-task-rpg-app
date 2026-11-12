import { db } from '../db'
import type { MainQuest } from '../types'
import { levelFromXp, xpForLevel } from '../../lib/level'
import { localDateKey, sundayKeyOfWeek, weekKeyOf } from '../../lib/dates'
import { emitCompletion, emitToast } from '../../lib/events'
import { t } from '../../lib/i18n'
import { applyXp } from './progress'

/**
 * Main quest semanal: la tarea principal que el usuario elige cada semana en
 * la pestaña Hoy. La recompensa es un porcentaje del XP del nivel actual y se
 * entrega el domingo (cierre de la semana) si la main quest se completó.
 */

/** Porción del XP que pide el nivel actual que otorga completar la main quest (20%). */
export const MAIN_QUEST_XP_SHARE = 0.2

/** XP que daría la main quest para quien tiene `totalXp` acumulado (20% de su nivel). */
export function mainQuestXpFor(totalXp: number): number {
  const { level } = levelFromXp(totalXp)
  return Math.max(1, Math.round(xpForLevel(level) * MAIN_QUEST_XP_SHARE))
}

/** La semana `weekKey` ya cerró o está en su domingo: su recompensa puede entregarse. */
export function isRewardDue(weekKey: string, today: string = localDateKey()): boolean {
  return today >= sundayKeyOfWeek(weekKey)
}

async function upsert(weekKey: string, patch: Partial<MainQuest>): Promise<MainQuest> {
  const now = Date.now()
  const existing = await db.mainQuests.get(weekKey)
  const next: MainQuest = existing
    ? { ...existing, ...patch, updatedAt: now, syncStatus: 'pending' }
    : {
        id: weekKey,
        weekKey,
        title: '',
        completed: false,
        completedAt: null,
        dismissed: false,
        rewardedAt: null,
        rewardXp: 0,
        createdAt: now,
        ...patch,
        updatedAt: now,
        syncStatus: 'pending',
      }
  await db.mainQuests.put(next)
  return next
}

/** Elige (o renombra) la main quest de la semana. Un título vacío no hace nada. */
export async function setMainQuest(title: string, weekKey: string = weekKeyOf()): Promise<void> {
  const clean = title.trim()
  if (!clean) return
  await upsert(weekKey, { title: clean, dismissed: false })
}

/**
 * Descarta la main quest de la semana: desaparece de Hoy y no se vuelve a
 * preguntar hasta el lunes siguiente. Si ya se entregó la recompensa, se deja
 * tal cual (el XP ya está en el perfil; descartar no lo quita).
 */
export async function dismissMainQuest(weekKey: string = weekKeyOf()): Promise<void> {
  const existing = await db.mainQuests.get(weekKey)
  if (existing?.rewardedAt) return
  await upsert(weekKey, { dismissed: true, completed: false, completedAt: null })
}

/**
 * Marca o desmarca la main quest como cumplida. No otorga XP al instante: la
 * recompensa se entrega al cerrar la semana (ver `grantDueMainQuestRewards`).
 * Una vez entregada ya no se puede desmarcar.
 */
export async function setMainQuestCompleted(weekKey: string, completed: boolean): Promise<void> {
  const existing = await db.mainQuests.get(weekKey)
  if (!existing || !existing.title || existing.rewardedAt) return
  if (existing.completed === completed) return
  await upsert(weekKey, { completed, completedAt: completed ? Date.now() : null })
  // Si se completa el mismo domingo (o más tarde), la recompensa sale en el acto.
  await grantDueMainQuestRewards()
}

/**
 * Entrega las recompensas pendientes: toda main quest completada, no
 * descartada y aún sin premiar cuya semana ya llegó al domingo. Se llama al
 * abrir Hoy (tras asentar la sincronización) y al completar una main quest.
 * El XP se calcula con el nivel que el jugador tiene en ese momento.
 */
export async function grantDueMainQuestRewards(): Promise<void> {
  const today = localDateKey()
  const due = (await db.mainQuests.toArray()).filter(
    (q) => q.completed && !q.dismissed && !q.rewardedAt && q.title && isRewardDue(q.weekKey, today),
  )
  for (const quest of due) {
    const profile = await db.profile.get('me')
    const xp = mainQuestXpFor(profile?.totalXp ?? 0)
    // Primero se sella la fila: si otro dispositivo la trae ya premiada, el LWW
    // por `updatedAt` evita entregar dos veces la misma recompensa.
    await upsert(quest.weekKey, { rewardedAt: Date.now(), rewardXp: xp })
    const result = await applyXp(xp, null, { touchStreak: false })
    emitCompletion({ ...result, kind: 'quest' })
    emitToast({
      title: t('Main quest rewarded', 'Main quest recompensada'),
      body: t(
        `"${quest.title}" earned you +${result.xp} XP this week.`,
        `"${quest.title}" te dio +${result.xp} XP esta semana.`,
      ),
    })
  }
}
