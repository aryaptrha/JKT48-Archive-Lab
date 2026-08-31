'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/auth/session'
import { actorFromProfile } from '@/server/services/audit'
import { revalidateArchiveGraph } from '@/server/cache/tags'
import { removeSource, saveSource } from '@/server/services/admin-config'

import type { SourceType } from '@/generated/prisma/client'

/**
 * Server Actions for Sources (PRD §13, §19, §35).
 */

function withQuery(path: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams({ [key]: value })
  return `${path}?${params.toString()}`
}

export async function saveSourceAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  const name = formData.get('name')
  const url = formData.get('url')
  const sourceType = formData.get('sourceType') as SourceType
  const retrievedAt = formData.get('retrievedAt')
  const notes = formData.get('notes')

  const input = {
    name: typeof name === 'string' ? name : '',
    url: typeof url === 'string' && url ? url : undefined,
    sourceType: typeof sourceType === 'string' ? sourceType : 'FANDOM',
    retrievedAt: typeof retrievedAt === 'string' && retrievedAt ? retrievedAt : undefined,
    notes: typeof notes === 'string' && notes ? notes : undefined,
  }

  const sourceId = typeof id === 'string' && id.length > 0 ? id : null
  const result = await saveSource(sourceId, input, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/sources', 'error', result.message))
  }

  revalidateArchiveGraph()
  revalidatePath('/admin/sources')
  revalidatePath('/admin/entities')
  revalidatePath('/admin/relationships')

  const notice = sourceId
    ? `Saved changes to source “${result.data.name}”.`
    : `Added source “${result.data.name}”.`

  redirect(withQuery('/admin/sources', 'notice', notice))
}

export async function deleteSourceAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  if (typeof id !== 'string' || !id) {
    redirect(withQuery('/admin/sources', 'error', 'Missing source id.'))
  }

  const result = await removeSource(id, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/sources', 'error', result.message))
  }

  revalidateArchiveGraph()
  revalidatePath('/admin/sources')
  revalidatePath('/admin/entities')
  revalidatePath('/admin/relationships')

  const notice = `Deleted source; ${result.data.unlinked} record${result.data.unlinked === 1 ? '' : 's'} left without provenance citation.`

  redirect(withQuery('/admin/sources', 'notice', notice))
}
