import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import type { UserProfile } from '@/generated/prisma/client'
import { UserRole } from '@/generated/prisma/enums'
import { hasSupabaseAuthCookie, isSupabaseConfigured } from '@/lib/env'
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

/**
 * The signed-in Supabase user, or null. Deduplicated per request render.
 *
 * `getUser()` is a network round trip to Supabase Auth, and it sits in front of
 * every page in the archive because the masthead renders an account state. Most
 * readers of a public reference work are anonymous, so the cookie check comes
 * first: no auth cookie means there is no session to validate, and skipping the
 * call is exact rather than a guess. Anyone holding a cookie is still verified
 * against Supabase — this shortens the anonymous path, it does not weaken the
 * authenticated one.
 */
export const getAuthUser = cache(async () => {
  if (!isSupabaseConfigured()) return null

  try {
    const cookieStore = await cookies()
    if (!hasSupabaseAuthCookie(cookieStore.getAll())) return null

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
 * How stale `lastSeenAt` is allowed to get before it is worth a write.
 *
 * The field answers "roughly when was this person last here", and an hour's
 * resolution answers it. Writing it on every render answered it to the second at
 * the cost of a blocking round trip in front of every page in the archive.
 */
const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000

/**
 * Touch `lastSeenAt` without making the page wait for it.
 *
 * Deliberately not awaited: nothing rendered depends on the result, so awaiting
 * it only moves the write onto the reader's critical path. Failures are logged
 * and swallowed for the same reason — a missed activity timestamp must never turn
 * into a failed page.
 */
function touchLastSeen(profile: UserProfile): void {
  const seenAt = profile.lastSeenAt?.getTime() ?? 0
  if (Date.now() - seenAt < LAST_SEEN_THROTTLE_MS) return

  void prisma.userProfile
    .update({ where: { id: profile.id }, data: { lastSeenAt: new Date() } })
    .catch((error: unknown) => {
      logger.error('auth.touchLastSeen failed', error, { userId: profile.id })
    })
}

/**
 * Returns the application profile for the signed-in user, creating it on first
 * sight so a Supabase signup always has a corresponding archive profile.
 *
 * A read, not an upsert. The row exists for every returning user, so the common
 * case should be a `findUnique` — the create is the exception, and `lastSeenAt`
 * is a throttled background write rather than part of the render.
 */
export const getCurrentProfile = cache(async (): Promise<UserProfile | null> => {
  const user = await getAuthUser()
  if (!user?.email) return null

  try {
    const existing = await prisma.userProfile.findUnique({ where: { id: user.id } })
    if (existing) {
      touchLastSeen(existing)
      return existing
    }

    // Still an upsert on the miss path: two requests can arrive together on a
    // first sign-in, and one of them must not fail on the id unique constraint.
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
