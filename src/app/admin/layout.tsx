import type { Metadata } from 'next'
import Link from 'next/link'

import { NavLink } from '@/components/archive/nav-link'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: { default: 'Curator tools', template: '%s · Curator tools' },
  robots: { index: false, follow: false },
}

/**
 * `/admin` (PRD §19, §20, §25).
 *
 * `requireAdmin()` runs here, at the boundary, and again inside every page and
 * every Server Action beneath it. That repetition is the design, not an oversight:
 *
 *   - middleware cannot make this check, because deciding it needs the `role`
 *     column and Prisma does not run on the Edge — middleware only sees whether a
 *     Supabase session cookie exists;
 *   - a layout does not re-run on every navigation the way a page does, so a page
 *     that trusted its layout for identity would be one refactor from serving a
 *     curator screen to a reader;
 *   - a Server Action is a POST endpoint with its own URL. Nothing about being
 *     rendered inside this layout protects it, so each one authorizes itself
 *     ("administrative write operations must never be exposed to unauthenticated
 *     users", §35).
 *
 * The role comes from the profile row and only from there. There is no email
 * allowlist anywhere in this tree (§19).
 */

const SECTIONS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/entities', label: 'Records' },
  { href: '/admin/relationships', label: 'Relationships' },
  { href: '/admin/import', label: 'Bulk import' },
  { href: '/admin/sources', label: 'Sources' },
  { href: '/admin/data-health', label: 'Data health' },
  { href: '/admin/games', label: 'Games' },
  { href: '/admin/mastery', label: 'Mastery' },
  { href: '/admin/audit', label: 'Audit log' },
  { href: '/admin/settings', label: 'Settings' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin()

  return (
    <div className="min-h-full">
      {/*
        A second masthead under the site's own, so it is always obvious that these
        screens write to the archive. The signed-in address is printed rather than
        shown as an avatar: on a curator screen, *which account is editing* is
        information, not decoration.
      */}
      <div className="border-b border-rule-strong bg-ground-sunk">
        <div className="mx-auto w-full max-w-[76rem] px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-2.5">
              <Link
                href="/admin"
                className="font-display text-base font-semibold text-ink-strong transition-colors hover:text-accent"
              >
                Curator tools
              </Link>
              <Badge tone="accent">Writes to the archive</Badge>
            </div>
            <p className="font-mono text-catalog uppercase tracking-[0.09em] text-ink-faint">
              {profile.email}
            </p>
          </div>

          <nav
            className="-mx-1 mt-2 flex items-center gap-0.5 overflow-x-auto"
            aria-label="Curator sections"
          >
            {SECTIONS.map((section) => (
              <NavLink key={section.href} href={section.href} exact={section.exact ?? false}>
                {section.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {children}
    </div>
  )
}
