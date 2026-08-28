'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/auth/session'
import { actorFromProfile } from '@/server/services/audit'
import { changeUserRole } from '@/server/services/admin-config'

import type { UserRole as UserRoleValue } from '@/generated/prisma/client'

/**
 * Server Actions for User Administration (PRD §19, §35).
 */

function withQuery(path: string, key: 'notice' | 'error', value: string): string {
  const params = new URLSearchParams({ [key]: value })
  return `${path}?${params.toString()}`
}

export async function changeUserRoleAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const actor = actorFromProfile(profile)

  const userId = formData.get('userId')
  const role = formData.get('role') as UserRoleValue

  if (typeof userId !== 'string' || !userId) {
    redirect(withQuery('/admin/settings/users', 'error', 'Missing user id.'))
  }

  const input = {
    userId,
    role: typeof role === 'string' ? role : 'USER',
  }

  const result = await changeUserRole(input, actor)

  if (!result.ok) {
    redirect(withQuery('/admin/settings/users', 'error', result.message))
  }

  revalidatePath('/admin/settings/users')
  revalidatePath('/admin')

  redirect(withQuery('/admin/settings/users', 'notice', `Updated user role to ${result.data.role}.`))
}
