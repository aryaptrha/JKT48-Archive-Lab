'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/auth/session'
import { errorState } from '@/lib/form-state'
import { actorFromProfile } from '@/server/services/audit'
import { revalidateArchiveGraph } from '@/server/cache/tags'
import {
  closeRelationship,
  createRelationship,
  deleteRelationship,
  updateRelationship,
} from '@/server/services/entity-admin'

import type { AdminFormState } from '@/lib/form-state'

/**
 * Server Actions for the relationship CMS (PRD §10, §19, §35).
 *
 * Relationships ARE the knowledge graph (§10, §28). Every action authorizes
 * itself via `requireAdmin()`, passes an audited `Actor` to `entity-admin`,
 * and revalidates the affected routes.
 */

function withQuery(path: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams({ [key]: value })
  return `${path}?${params.toString()}`
}

function revalidateRelationshipPaths(sourceEntityId?: string, targetEntityId?: string) {
  // An edge is read from both of its endpoints, from the timeline, and from the
  // home page's counts and latest-changes panel. Naming those paths one by one
  // would mean maintaining a second copy of the graph's shape; the tag does not.
  revalidateArchiveGraph()
  revalidatePath('/admin/relationships')
  revalidatePath('/admin/entities')
  if (sourceEntityId) {
    revalidatePath(`/admin/entities/${sourceEntityId}`)
  }
  if (targetEntityId) {
    revalidatePath(`/admin/entities/${targetEntityId}`)
  }
  revalidatePath('/history/timeline')
  revalidatePath('/history/time-machine')
  revalidatePath('/explore')
}

export async function saveRelationshipAction(
  _state: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  const sourceEntityId = formData.get('sourceEntityId')
  const relationshipTypeId = formData.get('relationshipTypeId')
  const targetEntityId = formData.get('targetEntityId')
  const validFrom = formData.get('validFrom')
  const validTo = formData.get('validTo')
  const weight = formData.get('weight')
  const provenanceId = formData.get('provenanceId')
  const notes = formData.get('notes')

  const input = {
    sourceEntityId: typeof sourceEntityId === 'string' ? sourceEntityId : '',
    relationshipTypeId: typeof relationshipTypeId === 'string' ? relationshipTypeId : '',
    targetEntityId: typeof targetEntityId === 'string' ? targetEntityId : '',
    validFrom: typeof validFrom === 'string' ? validFrom : undefined,
    validTo: typeof validTo === 'string' ? validTo : undefined,
    weight: typeof weight === 'string' && weight ? Number(weight) : 1,
    provenanceId: typeof provenanceId === 'string' ? provenanceId : undefined,
    notes: typeof notes === 'string' ? notes : undefined,
  }

  const isEdit = typeof id === 'string' && id.length > 0
  const result = isEdit
    ? await updateRelationship(id, input, actor)
    : await createRelationship(input, actor)

  if (!result.ok) return errorState(result)

  revalidateRelationshipPaths(input.sourceEntityId, input.targetEntityId)

  const notice = isEdit
    ? 'Saved changes to relationship.'
    : 'Created relationship in the knowledge graph.'

  redirect(withQuery(`/admin/relationships/${result.data.id}`, 'notice', notice))
}

/**
 * Close an active relationship by setting its `valid_to` date.
 *
 * Closing a relationship is the canonical way the archive notes that a tenure,
 * membership or role has ended (§11).
 */
export async function closeRelationshipAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  if (typeof id !== 'string' || !id) {
    redirect(withQuery('/admin/relationships', 'error', 'Missing relationship id.'))
  }

  const validTo = formData.get('validTo')
  if (typeof validTo !== 'string' || !validTo) {
    redirect(withQuery(`/admin/relationships/${id}`, 'error', 'End date is required to close a relationship.'))
  }

  const result = await closeRelationship(id, validTo, actor)

  if (!result.ok) {
    redirect(withQuery(`/admin/relationships/${id}`, 'error', result.message))
  }

  revalidateRelationshipPaths()

  redirect(
    withQuery(
      `/admin/relationships/${id}`,
      'notice',
      `Closed relationship as of ${validTo}.`,
    ),
  )
}

/**
 * Delete a relationship permanently from the graph.
 */
export async function deleteRelationshipAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  if (typeof id !== 'string' || !id) {
    redirect(withQuery('/admin/relationships', 'error', 'Missing relationship id.'))
  }

  const sourceEntityId = formData.get('sourceEntityId')
  const targetEntityId = formData.get('targetEntityId')

  const result = await deleteRelationship(id, actor)

  if (!result.ok) {
    redirect(withQuery(`/admin/relationships/${id}`, 'error', result.message))
  }

  revalidateRelationshipPaths(
    typeof sourceEntityId === 'string' ? sourceEntityId : undefined,
    typeof targetEntityId === 'string' ? targetEntityId : undefined,
  )

  redirect(
    withQuery(
      '/admin/relationships',
      'notice',
      'Relationship was deleted from the knowledge graph.',
    ),
  )
}
