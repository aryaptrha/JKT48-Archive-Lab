'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/auth/session'
import { actorFromProfile } from '@/server/services/audit'
import {
  removeMasteryStatus,
  saveDimensionWeight,
  saveMasteryStatus,
} from '@/server/services/admin-config'

import type { MasteryDimension, MasteryScope } from '@/generated/prisma/client'

/**
 * Server Actions for Mastery Configuration (PRD §8, §19, §35).
 */

function withQuery(path: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams({ [key]: value })
  return `${path}?${params.toString()}`
}

export async function saveMasteryStatusAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  const name = formData.get('name')
  const slug = formData.get('slug')
  const minScore = formData.get('minScore')
  const maxScore = formData.get('maxScore')
  const colorHex = formData.get('colorHex')
  const description = formData.get('description')
  const displayOrder = formData.get('displayOrder')
  const isActive = formData.get('isActive') === 'true'

  const input = {
    name: typeof name === 'string' ? name : '',
    slug: typeof slug === 'string' ? slug : '',
    minScore: typeof minScore === 'string' ? Number(minScore) : 0,
    maxScore: typeof maxScore === 'string' ? Number(maxScore) : 100,
    colorHex: typeof colorHex === 'string' && colorHex ? colorHex : undefined,
    description: typeof description === 'string' && description ? description : undefined,
    displayOrder: typeof displayOrder === 'string' ? Number(displayOrder) : 0,
    isActive,
  }

  const statusId = typeof id === 'string' && id.length > 0 ? id : null
  const result = await saveMasteryStatus(statusId, input, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/mastery', 'error', result.message))
  }

  revalidatePath('/admin/mastery')
  revalidatePath('/me/mastery')

  const notice = statusId
    ? `Saved mastery band “${result.data.name}”.`
    : `Added mastery band “${result.data.name}”.`

  redirect(withQuery('/admin/mastery', 'notice', notice))
}

export async function deleteMasteryStatusAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  if (typeof id !== 'string' || !id) {
    redirect(withQuery('/admin/mastery', 'error', 'Missing mastery status id.'))
  }

  const result = await removeMasteryStatus(id, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/mastery', 'error', result.message))
  }

  revalidatePath('/admin/mastery')
  revalidatePath('/me/mastery')

  redirect(withQuery('/admin/mastery', 'notice', 'Deleted mastery band.'))
}

export async function saveDimensionWeightAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const scope = formData.get('scope') as MasteryScope
  const dimension = formData.get('dimension') as MasteryDimension
  const weight = formData.get('weight')

  const input = {
    scope: typeof scope === 'string' ? scope : 'GENERATION',
    dimension: typeof dimension === 'string' ? dimension : 'MEMBERS',
    weight: typeof weight === 'string' ? Number(weight) : 1,
  }

  const result = await saveDimensionWeight(input, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/mastery', 'error', result.message))
  }

  revalidatePath('/admin/mastery')
  revalidatePath('/me/mastery')

  redirect(withQuery('/admin/mastery', 'notice', `Updated weight for ${input.dimension} to ${input.weight}.`))
}
