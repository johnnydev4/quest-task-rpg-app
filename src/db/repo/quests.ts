import { uid } from '../../lib/uid'
import { db } from '../db'
import type { Quest, QuestStep } from '../types'
import { emitCompletion } from '../../lib/events'
import { applyXp } from './progress'
import { recordDeletion } from './tombstones'

/** XP épico: la main quest mensual es la recompensa más grande del juego. */
export const MONTHLY_QUEST_XP = 500
export const WEEKLY_QUEST_XP = 150
export const QUEST_STEP_XP = 10

export async function createQuest(monthKey: string, week: number, title: string): Promise<string> {
  const now = Date.now()
  const quest: Quest = {
    id: uid(),
    monthKey,
    week,
    title: title.trim(),
    completed: false,
    completedAt: null,
    xpValue: week === 0 ? MONTHLY_QUEST_XP : WEEKLY_QUEST_XP,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.quests.add(quest)
  return quest.id
}

export async function updateQuest(
  id: string,
  patch: Partial<Omit<Quest, 'id' | 'monthKey' | 'week' | 'createdAt' | 'updatedAt' | 'syncStatus'>>,
): Promise<void> {
  await db.quests.update(id, { ...patch, updatedAt: Date.now(), syncStatus: 'pending' })
}

export async function setQuestCompleted(id: string, completed: boolean): Promise<void> {
  const quest = await db.quests.get(id)
  if (!quest || quest.completed === completed) return
  await updateQuest(id, { completed, completedAt: completed ? Date.now() : null })
  const result = await applyXp(completed ? quest.xpValue : -quest.xpValue, null, {
    touchStreak: completed,
  })
  if (completed) emitCompletion({ ...result, kind: 'quest' })
}

export async function deleteQuest(id: string): Promise<void> {
  await db.transaction('rw', [db.quests, db.questSteps, db.tombstones], async () => {
    const stepIds = await db.questSteps.where('questId').equals(id).primaryKeys()
    for (const stepId of stepIds) await recordDeletion('questSteps', stepId as string)
    await db.questSteps.where('questId').equals(id).delete()
    await db.quests.delete(id)
    await recordDeletion('quests', id)
  })
}

export async function createQuestStep(questId: string, title: string): Promise<string> {
  const now = Date.now()
  const last = await db.questSteps.where('questId').equals(questId).sortBy('order')
  const step: QuestStep = {
    id: uid(),
    questId,
    title: title.trim(),
    completed: false,
    order: (last.at(-1)?.order ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
  }
  await db.questSteps.add(step)
  return step.id
}

export async function updateQuestStep(
  id: string,
  patch: Partial<Omit<QuestStep, 'id' | 'questId' | 'createdAt' | 'updatedAt' | 'syncStatus'>>,
): Promise<void> {
  await db.questSteps.update(id, { ...patch, updatedAt: Date.now(), syncStatus: 'pending' })
}

export async function setQuestStepCompleted(id: string, completed: boolean): Promise<void> {
  const step = await db.questSteps.get(id)
  if (!step || step.completed === completed) return
  await db.questSteps.update(id, {
    completed,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  })
  const result = await applyXp(completed ? QUEST_STEP_XP : -QUEST_STEP_XP, null, {
    touchStreak: false,
  })
  if (completed) emitCompletion({ ...result, kind: 'quest' })
}

export async function deleteQuestStep(id: string): Promise<void> {
  await db.questSteps.delete(id)
  await recordDeletion('questSteps', id)
}
