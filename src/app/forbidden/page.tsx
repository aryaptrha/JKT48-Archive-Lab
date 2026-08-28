import type { Metadata } from 'next'
import Link from 'next/link'

import { PageShell, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { getCurrentProfile } from '@/lib/auth/session'
import { UserRole } from '@/generated/prisma/enums'

import { signOutAction } from '../login/actions'

export const metadata: Metadata = {
  title: 'Not your record',
  robots: { index: false, follow: false },
}

/**
 * `/forbidden` (PRD §19, §35).
 *
 * Where `requireAdmin()` and the game engine's ownership checks send someone who
 * is signed in but not entitled — a curator page without the curator role, or a
 * game session belonging to another player.
 *
 * Two things this page is careful about:
 *
 *   - It does not say what was behind the door. Naming the entity or session
 *     turns a refusal into a disclosure, and a 403 that describes its own target
 *     is a slower way of leaking it.
 *   - It offers to sign out. Almost everyone who lands here is signed in as the
 *     wrong account, and "sign in as someone else" is the action they actually
 *     want. The alternative — a dead end with a link home — makes the reader guess
 *     that clearing a cookie is their problem.
 *
 * The role is read live rather than trusted from the redirect, so the page cannot
 * be made to claim someone is an administrator by linking to it.
 */
export default async function ForbiddenPage() {
  const profile = await getCurrentProfile()
  const isCurator = profile?.role === UserRole.ADMIN

  return (
    <PageShell className="max-w-[46rem] space-y-8">
      <SectionHeading
        as="h1"
        eyebrow="403 · not permitted"
        title="That record is not yours to open"
        lead="You are signed in, but this part of the archive is granted by role rather than by link. Nothing was changed and nothing was recorded against your account."
      />

      <div className="space-y-3 border-y border-rule py-6 text-sm leading-relaxed text-ink-muted">
        <p>
          Two things land here. A curator page asked for the administrator role and your profile does
          not carry it. Or a game session belongs to another player — sessions write into one
          person&rsquo;s mastery, so they are answerable by that person alone.
        </p>
        <p>
          Access is decided by the role on your profile. It is never decided by which address you
          signed in with, which is why asking for it is a request to a curator rather than a matter
          of using the right email.
        </p>
      </div>

      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
        <div className="space-y-1">
          <dt className="eyebrow">Signed in as</dt>
          <dd className="text-sm text-ink">{profile?.displayName ?? profile?.email ?? 'nobody'}</dd>
        </div>
        <div className="space-y-1">
          <dt className="eyebrow">Role</dt>
          <dd className="font-mono text-sm text-ink">{profile?.role ?? '—'}</dd>
        </div>
        {isCurator ? (
          <div className="space-y-1">
            <dt className="eyebrow">Note</dt>
            <dd className="text-sm text-ink-muted">
              You do hold the curator role, so this was a session belonging to another player.
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-6">
        <Button asChild variant="accent">
          <Link href="/explore">Back to the archive</Link>
        </Button>
        {profile ? (
          <Button asChild variant="outline">
            <Link href="/me">Your account</Link>
          </Button>
        ) : null}
        {isCurator ? (
          <Button asChild variant="outline">
            <Link href="/admin">Curator tools</Link>
          </Button>
        ) : null}

        {profile ? (
          <form action={signOutAction} className="contents">
            <Button type="submit" variant="ghost">
              Sign out and switch account
            </Button>
          </form>
        ) : (
          <Button asChild variant="ghost">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </div>
    </PageShell>
  )
}
