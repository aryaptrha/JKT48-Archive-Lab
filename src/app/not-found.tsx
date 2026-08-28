import type { Metadata } from 'next'
import Link from 'next/link'

import { PageShell, SectionHeading } from '@/components/archive/section'
import { SearchField } from '@/components/archive/search-field'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'No such record',
  robots: { index: false, follow: false },
}

/**
 * 404.
 *
 * A missing record in an archive is a more interesting event than a missing page
 * on a website: it usually means the thing exists but has not been catalogued, or
 * that it is filed under a name the reader did not guess. So the page offers a
 * search box and the collections rather than an apology and a home button.
 *
 * It does not guess what was meant. A "did you mean…" built from a slug would be
 * fabrication, and this project would rather say it has no record (PRD §P3).
 */
export default function NotFound() {
  return (
    <PageShell className="max-w-[52rem] space-y-8">
      <SectionHeading
        as="h1"
        eyebrow="404 · not in the catalogue"
        title="There is no record at this address"
        lead="Either it was never catalogued, or it is filed under a different name. Both are worth searching for — the archive is deliberately incomplete rather than pretending otherwise."
      />

      <div className="space-y-2">
        <h2 className="eyebrow">Search the archive</h2>
        <SearchField action="/search" placeholder="A member, song, team, generation…" />
      </div>

      <div className="space-y-3 border-t border-rule pt-6">
        <h2 className="eyebrow">Or start from a collection</h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {[
            { href: '/explore', label: 'All collections' },
            { href: '/explore/members', label: 'Members' },
            { href: '/explore/generations', label: 'Generations' },
            { href: '/explore/teams', label: 'Teams' },
            { href: '/explore/songs', label: 'Songs' },
            { href: '/history/timeline', label: 'Timeline' },
          ].map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm text-ink underline decoration-rule-strong decoration-1 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-rule pt-6">
        <Button asChild variant="accent">
          <Link href="/">Front page</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/history/time-machine">Try a date instead</Link>
        </Button>
      </div>
    </PageShell>
  )
}
