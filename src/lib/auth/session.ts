import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { UserProfile } from '@/generated/prisma/client'
import { UserRole } from '@/generated/prisma/enums'
import { isSupabaseConfigured } from '@/lib/env'
import { prisma } from '@/lib/prisma/client'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/**
 * Identity + authorization (PRD §19).
 *
 * Supabase Auth answers "who is this?"; the application `UserProfile.role`
 * answers "what may they do?". Admin access must NEVER depend on a hard-coded
 * username or email — only on the role column.
 */

/** Deduplicated per request render. */
export const getAuthUser = cache(async () => {
  if (!isSupabaseConfigured()) return null

  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  } catch (error) {
    logger.error('auth.getAuthUser failed', error)
    return null
  }
})

/**
 * Returns the application profile for the signed-in user, creating it on first
 * sight so a Supabase signup always has a corresponding archive profile.
 */
export const getCurrentProfile = cache(async (): Promise<UserProfile | null> => {
  const user = await getAuthUser()
  if (!user?.email) return null

  try {
    return await prisma.userProfile.upsert({
      where: { id: user.id },
      update: { lastSeenAt: new Date() },
      create: {
        id: user.id,
        email: user.email,
        displayName:
          (user.user_metadata?.display_name as string | undefined) ?? user.email.split('@')[0],
        lastSeenAt: new Date(),
      },
    })
  } catch (error) {
    logger.error('auth.getCurrentProfile failed', error, { userId: user.id })
    return null
  }
})

export async function isAdmin(): Promise<boolean> {
  const profile = await getCurrentProfile()
  return profile?.role === UserRole.ADMIN
}

/** Redirects to /login when there is no session. */
export async function requireUser(nextPath = '/me'): Promise<UserProfile> {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  }
  return profile
}

/**
 * The authoritative admin gate. Every /admin route and every admin mutation
 * must call this — middleware alone is not sufficient (PRD §35).
 */
export async function requireAdmin(nextPath = '/admin'): Promise<UserProfile> {
  const profile = await getCurrentProfile()
  if (!profile) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  }
  if (profile.role !== UserRole.ADMIN) {
    redirect('/forbidden')
  }
  return profile
}

/** Non-redirecting variant for Route Handlers, which return 401/403 instead. */
export async function authorizeAdmin(): Promise<
  { ok: true; profile: UserProfile } | { ok: false; status: 401 | 403; message: string }
> {
  const profile = await getCurrentProfile()
  if (!profile) {
    return { ok: false, status: 401, message: 'Authentication required.' }
  }
  if (profile.role !== UserRole.ADMIN) {
    return { ok: false, status: 403, message: 'Administrator role required.' }
  }
  return { ok: true, profile }
}
