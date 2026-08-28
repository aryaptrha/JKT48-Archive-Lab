'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/auth/session'
import { actorFromProfile } from '@/server/services/audit'
import { removeEra, saveEra } from '@/server/services/admin-config'

/**
 * Server Actions for Historical Eras (PRD §4, §19, §35).
 */

function withQuery(path: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams({ [key]: value })
  return `${path}?${params.toString()}`
}

export async function saveEraAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  const name = formData.get('name')
  const slug = formData.get('slug')
  const startDate = formData.get('startDate')
  const endDate = formData.get('endDate')
  const description = formData.get('description')
  const displayOrder = formData.get('displayOrder')

  const input = {
    name: typeof name === 'string' ? name : '',
    slug: typeof slug === 'string' ? slug : '',
    startDate: typeof startDate === 'string' ? startDate : '',
    endDate: typeof endDate === 'string' && endDate ? endDate : undefined,
    description: typeof description === 'string' && description ? description : undefined,
    displayOrder: typeof displayOrder === 'string' ? Number(displayOrder) : 0,
  }

  const eraId = typeof id === 'string' && id.length > 0 ? id : null
  const result = await saveEra(eraId, input, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/settings/eras', 'error', result.message))
  }

  revalidatePath('/admin/settings/eras')
  revalidatePath('/history/timeline')
  revalidatePath('/history/time-machine')

  const notice = eraId ? `Saved era “${result.data.name}”.` : `Added era “${result.data.name}”.`
  redirect(withQuery('/admin/settings/eras', 'notice', notice))
}

export async function deleteEraAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const id = formData.get('id')
  if (typeof id !== 'string' || !id) {
    redirect(withQuery('/admin/settings/eras', 'error', 'Missing era id.'))
  }

  const result = await removeEra(id, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/settings/eras', 'error', result.message))
  }

  revalidatePath('/admin/settings/eras')
  revalidatePath('/history/timeline')
  revalidatePath('/history/time-machine')

  redirect(withQuery('/admin/settings/eras', 'notice', 'Deleted historical era.'))
}
