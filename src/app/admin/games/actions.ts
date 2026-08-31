'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/auth/session'
import { actorFromProfile } from '@/server/services/audit'
import { revalidateArchiveGames } from '@/server/cache/tags'
import { saveGameDefinition, setGameDefinitionActive } from '@/server/services/admin-config'

import type { Difficulty, EntityType, GameType } from '@/generated/prisma/client'

/**
 * Server Actions for Game Definitions (PRD §6, §19, §35).
 */

function withQuery(path: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams({ [key]: value })
  return `${path}?${params.toString()}`
}

export async function saveGameDefinitionAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  const code = formData.get('code')
  const name = formData.get('name')
  const gameType = formData.get('gameType') as GameType
  const difficulty = formData.get('difficulty') as Difficulty
  const targetEntityType = formData.get('targetEntityType') as EntityType
  const isActive = formData.get('isActive') === 'true'
  const roundCount = formData.get('roundCount')
  const clueCount = formData.get('clueCount')
  const hopCount = formData.get('hopCount')
  const optionCount = formData.get('optionCount')
  const timeLimitSec = formData.get('timeLimitSec')
  const pointsCorrect = formData.get('pointsCorrect')
  const pointsRelationshipCorrect = formData.get('pointsRelationshipCorrect')
  const pointsIncorrect = formData.get('pointsIncorrect')
  const displayOrder = formData.get('displayOrder')

  const requiredRelationshipTypeIds = formData.getAll('requiredRelationshipTypeIds').map(String)
  const enrichingRelationshipTypeIds = formData.getAll('enrichingRelationshipTypeIds').map(String)

  const input = {
    code: typeof code === 'string' ? code : '',
    name: typeof name === 'string' ? name : '',
    gameType: typeof gameType === 'string' ? gameType : 'MYSTERY_MEMBER',
    difficulty: typeof difficulty === 'string' ? difficulty : 'EASY',
    targetEntityType: typeof targetEntityType === 'string' ? targetEntityType : 'MEMBER',
    isActive,
    roundCount: typeof roundCount === 'string' ? Number(roundCount) : 5,
    clueCount: typeof clueCount === 'string' ? Number(clueCount) : 3,
    hopCount: typeof hopCount === 'string' ? Number(hopCount) : 1,
    optionCount: typeof optionCount === 'string' ? Number(optionCount) : 4,
    timeLimitSec: typeof timeLimitSec === 'string' && timeLimitSec ? Number(timeLimitSec) : undefined,
    pointsCorrect: typeof pointsCorrect === 'string' ? Number(pointsCorrect) : 10,
    pointsRelationshipCorrect: typeof pointsRelationshipCorrect === 'string' ? Number(pointsRelationshipCorrect) : 0,
    pointsIncorrect: typeof pointsIncorrect === 'string' ? Number(pointsIncorrect) : 0,
    displayOrder: typeof displayOrder === 'string' ? Number(displayOrder) : 0,
    requiredRelationshipTypeIds,
    enrichingRelationshipTypeIds,
  }

  const defId = typeof id === 'string' && id.length > 0 ? id : null
  const result = await saveGameDefinition(defId, input, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/games', 'error', result.message))
  }

  revalidateArchiveGames()
  revalidatePath('/admin/games')
  revalidatePath('/games')

  const notice = `Saved game definition “${result.data.code}”.`
  redirect(withQuery('/admin/games', 'notice', notice))
}

export async function toggleGameActiveAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  if (typeof id !== 'string' || !id) {
    redirect(withQuery('/admin/games', 'error', 'Missing game definition id.'))
  }

  const isActive = formData.get('isActive') === 'true'
  const result = await setGameDefinitionActive(id, isActive, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/games', 'error', result.message))
  }

  revalidateArchiveGames()
  revalidatePath('/admin/games')
  revalidatePath('/games')

  const notice = isActive ? 'Game definition activated.' : 'Game definition deactivated.'
  redirect(withQuery('/admin/games', 'notice', notice))
}
