'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/auth/session'
import { actorFromProfile } from '@/server/services/audit'
import {
  retireRelationshipType,
  saveRelationshipType,
} from '@/server/services/admin-config'

import type { EntityType } from '@/generated/prisma/client'

/**
 * Server Actions for Relationship Vocabulary Types (PRD §10, §19, §35).
 */

function withQuery(path: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams({ [key]: value })
  return `${path}?${params.toString()}`
}

export async function saveRelationshipTypeAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  const code = formData.get('code')
  const name = formData.get('name')
  const inverseName = formData.get('inverseName')
  const description = formData.get('description')
  const isDirectional = formData.get('isDirectional') === 'true'
  const isTemporal = formData.get('isTemporal') === 'true'
  const isQuizzable = formData.get('isQuizzable') === 'true'
  const isActive = formData.get('isActive') !== 'false'
  const displayOrder = formData.get('displayOrder')

  const allowedSourceTypes = formData.getAll('allowedSourceTypes').map((t) => String(t) as EntityType)
  const allowedTargetTypes = formData.getAll('allowedTargetTypes').map((t) => String(t) as EntityType)

  const input = {
    code: typeof code === 'string' ? code : '',
    name: typeof name === 'string' ? name : '',
    inverseName: typeof inverseName === 'string' && inverseName ? inverseName : undefined,
    description: typeof description === 'string' && description ? description : undefined,
    isDirectional,
    isTemporal,
    isQuizzable,
    isActive,
    displayOrder: typeof displayOrder === 'string' ? Number(displayOrder) : 0,
    allowedSourceTypes,
    allowedTargetTypes,
  }

  const typeId = typeof id === 'string' && id.length > 0 ? id : null
  const result = await saveRelationshipType(typeId, input, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/settings/relationship-types', 'error', result.message))
  }

  revalidatePath('/admin/settings/relationship-types')
  revalidatePath('/admin/relationships')

  const notice = typeId
    ? `Saved relationship type “${result.data.code}”.`
    : `Added relationship type “${result.data.code}”.`

  redirect(withQuery('/admin/settings/relationship-types', 'notice', notice))
}

export async function retireRelationshipTypeAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  if (typeof id !== 'string' || !id) {
    redirect(withQuery('/admin/settings/relationship-types', 'error', 'Missing relationship type id.'))
  }

  const result = await retireRelationshipType(id, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/settings/relationship-types', 'error', result.message))
  }

  revalidatePath('/admin/settings/relationship-types')
  revalidatePath('/admin/relationships')

  redirect(
    withQuery(
      '/admin/settings/relationship-types',
      'notice',
      'Retired relationship type. Existing edges remain intact and readable in the graph.',
    ),
  )
}
