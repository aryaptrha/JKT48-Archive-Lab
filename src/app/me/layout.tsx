import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { NavLink } from '@/components/archive/nav-link'
import { requireUser } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: { default: 'Your account', template: '%s · Your account · JKT48 Archive Lab' },
  /** Nothing under /me belongs in a search index. */
  robots: { index: false, follow: false },
}

/**
 * The `/me` shell (PRD §20).
 *
 * `requireUser()` runs here, at the route boundary, and every page beneath it
 * calls it again for its own id. That looks redundant and is not: middleware only
 * checks that a Supabase session cookie exists (Prisma cannot run on the Edge), a
 * layout does not re-run for every navigation in the way a page does, and a page
 * that trusts its layout for identity is one refactor away from reading someone
 * else's mastery. The gate is cheap — `getCurrentProfile` is request-cached — so
 * it is repeated wherever a decision depends on it (PRD §35).
 */
export default async function MeLayout({ children }: { children: ReactNode }) {
  await requireUser()

  return (
    <div>
      <nav
        className="border-b border-rule px-4 sm:px-6 lg:px-8"
        aria-label="Your account"
      >
        <div className="mx-auto flex w-full max-w-[76rem] items-center gap-1 overflow-x-auto py-2">
          <NavLink href="/me" exact>
            Overview
          </NavLink>
          <NavLink href="/me/mastery">Mastery</NavLink>
          <NavLink href="/me/history">Game history</NavLink>
        </div>
      </nav>

      {children}
    </div>
  )
}
