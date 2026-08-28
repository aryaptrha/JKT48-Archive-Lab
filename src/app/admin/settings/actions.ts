'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/auth/session'
import { actorFromProfile } from '@/server/services/audit'
import { saveSetting } from '@/server/services/admin-config'

/**
 * Server Actions for Key-Value Application Settings (PRD §19, §35).
 */

function withQuery(path: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams({ [key]: value })
  return `${path}?${params.toString()}`
}

export async function saveSettingAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const key = formData.get('key')
  const rawValue = formData.get('value')
  const group = formData.get('group')
  const description = formData.get('description')

  if (typeof key !== 'string' || !key) {
    redirect(withQuery('/admin/settings', 'error', 'Missing setting key.'))
  }

  // Parse JSON value if string looks like JSON/bool/number, otherwise plain string
  let parsedValue: unknown = rawValue
  if (typeof rawValue === 'string') {
    if (rawValue === 'true') parsedValue = true
    else if (rawValue === 'false') parsedValue = false
    else if (!Number.isNaN(Number(rawValue)) && rawValue.trim() !== '') {
      parsedValue = Number(rawValue)
    } else {
      try {
        parsedValue = JSON.parse(rawValue)
      } catch {
        parsedValue = rawValue
      }
    }
  }

  const input = {
    key,
    value: parsedValue,
    group: typeof group === 'string' && group ? group : undefined,
    description: typeof description === 'string' && description ? description : undefined,
  }

  const result = await saveSetting(input, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/settings', 'error', result.message))
  }

  revalidatePath('/admin/settings')
  redirect(withQuery('/admin/settings', 'notice', `Updated setting ${result.data.key}.`))
}
