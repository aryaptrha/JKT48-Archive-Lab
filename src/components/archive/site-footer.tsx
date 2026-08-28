import Link from 'next/link'

/**
 * The colophon.
 *
 * A footer in a reference work states what the work is, where its facts come from,
 * and what it is not. The last line is the one that matters: this is a fan-built
 * archive, not an official channel, and saying so is both honest and the thing
 * that keeps a citation trail meaningful (PRD §P2).
 */

const COLUMNS = [
  {
    heading: 'Explore',
    links: [
      { href: '/explore/members', label: 'Members' },
      { href: '/explore/generations', label: 'Generations' },
      { href: '/explore/teams', label: 'Teams' },
      { href: '/explore/songs', label: 'Songs' },
      { href: '/explore/albums', label: 'Albums' },
    ],
  },
  {
    heading: 'History',
    links: [
      { href: '/history/timeline', label: 'Timeline' },
      { href: '/history/time-machine', label: 'Time Machine' },
    ],
  },
  {
    heading: 'Practice',
    links: [
      { href: '/games', label: 'All games' },
      { href: '/me/mastery', label: 'Mastery' },
      { href: '/me/history', label: 'Game history' },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-rule bg-ground-sunk">
      <div className="mx-auto w-full max-w-[76rem] px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2.5">
            <p className="font-display text-base font-semibold text-ink-strong">
              JKT48 Archive Lab
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-ink-muted">
              A knowledge graph of members, generations, teams, songs and events —
              and a set of games that ask you to reconstruct it from memory.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} className="space-y-2.5" aria-label={column.heading}>
              <p className="eyebrow">{column.heading}</p>
              <ul className="space-y-1.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-muted transition-colors hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
          <p className="font-mono text-catalog uppercase tracking-[0.09em] text-ink-faint">
            Independent fan archive · Not affiliated with JKT48 or its management
          </p>
          <p className="font-mono text-catalog uppercase tracking-[0.09em] text-ink-faint">
            Every record cites its source
          </p>
        </div>
      </div>
    </footer>
  )
}
