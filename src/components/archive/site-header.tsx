import Link from 'next/link'
import { Search, Shield, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getCurrentProfile } from '@/lib/auth/session'
import { UserRole } from '@/generated/prisma/enums'

import { NavLink } from './nav-link'
import { ThemeToggle } from './theme-toggle'

/**
 * The masthead (PRD §20).
 *
 * Set as a masthead rather than an app bar: wordmark on the left in the display
 * serif, a rule under everything, sections as text links. No logo in a coloured
 * rounded square, no avatar bubble.
 *
 * The admin link is rendered from the resolved profile's `role`, and only ever
 * from that — never from a username or email comparison (PRD §19). Hiding the link
 * is presentation, not protection: `/admin` and every admin mutation call
 * `requireAdmin` for themselves.
 */

/**
 * `match` is the prefix that lights the link up, for the sections whose landing
 * URL is not their root: History points at the Timeline but stays active across
 * the Time Machine too.
 */
type NavSection = { href: string; label: string; match?: string }

const SECTIONS: NavSection[] = [
  { href: '/explore', label: 'Explore' },
  { href: '/history/timeline', label: 'History', match: '/history' },
  { href: '/games', label: 'Games' },
]

export async function SiteHeader() {
  const profile = await getCurrentProfile()
  const isAdmin = profile?.role === UserRole.ADMIN

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-ground">
      <div className="mx-auto flex h-14 w-full max-w-[76rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex shrink-0 items-baseline gap-2">
          <span className="font-display text-lg font-semibold leading-none tracking-tight text-ink-strong">
            JKT48
          </span>
          <span className="font-mono text-catalog uppercase tracking-[0.14em] text-accent">
            Archive Lab
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex" aria-label="Sections">
          {SECTIONS.map((section) => (
            <NavLink key={section.href} href={section.href} match={section.match}>
              {section.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/search"
            className="inline-flex size-9 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-ground-sunk hover:text-ink"
            aria-label="Search"
          >
            <Search aria-hidden className="size-4" />
          </Link>

          <ThemeToggle />

          {isAdmin ? (
            <Link
              href="/admin"
              className="inline-flex size-9 items-center justify-center rounded-sm text-ink-muted transition-colors hover:bg-ground-sunk hover:text-accent"
              aria-label="Curator tools"
              title="Curator tools"
            >
              <Shield aria-hidden className="size-4" />
            </Link>
          ) : null}

          {profile ? (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/me">
                <User aria-hidden />
                <span className="hidden sm:inline">
                  {profile.displayName ?? 'Account'}
                </span>
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Sections again, for narrow screens — a hamburger for three links is worse. */}
      <nav
        className="flex items-center gap-1 overflow-x-auto border-t border-rule px-4 py-1.5 sm:hidden"
        aria-label="Sections"
      >
        {SECTIONS.map((section) => (
          <NavLink key={section.href} href={section.href} match={section.match}>
            {section.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}
