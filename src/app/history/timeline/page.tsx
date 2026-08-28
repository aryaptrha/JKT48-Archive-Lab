import type { Metadata } from 'next'
import Link from 'next/link'

import { EdgeSentence } from '@/components/archive/edges'
import { EmptyState } from '@/components/archive/empty-state'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { parseDateParam, toISODate } from '@/lib/date'
import { getTimeline } from '@/server/queries/timeline'

export const metadata: Metadata = {
  title: 'Timeline',
  description:
    'Every moment a relationship in the JKT48 archive began or ended, grouped by year and era.',
}

export const revalidate = 300

/**
 * `/history/timeline` (PRD §4.2, §20).
 *
 * The timeline reads down the page as a continuous column, sticky year headings on
 * the left. It is built from relationship *transitions* — an edge starting, an edge
 * ending — because that is where a knowledge graph records change. There is no
 * "events" table feeding this; the history is an emergent property of the edges.
 *
 * The density strip at the top is drawn from counts the same query already
 * returned, so a reader can see which years the archive knows most about — which is
 * also an honest picture of where curation is thin.
 */
export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const from = parseDateParam(query.from) ?? null
  const to = parseDateParam(query.to) ?? null

  const timeline = await getTimeline({ from, to })
  const peak = Math.max(1, ...timeline.density.map((entry) => entry.count))

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow={`${timeline.total.toLocaleString()} transitions`}
        title="Timeline"
        lead="Every moment the archive knows a relationship began or ended. A member joining a team, a captaincy changing hands, a graduation — each one is an edge with a date, not a row in a log."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/history/time-machine">Time Machine</Link>
          </Button>
        }
      />

      {timeline.total === 0 ? (
        <EmptyState
          title="No dated relationships yet"
          body="The timeline is derived from relationship validity windows. Once relationships in the graph carry start or end dates, they appear here automatically."
          action={
            <Button asChild variant="outline">
              <Link href="/admin/relationships/new">Record a relationship</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* ------------------------------------------------------- density strip */}
          <section aria-label="Transitions per year" className="space-y-2">
            <p className="eyebrow">Coverage by year</p>
            <ol className="flex items-end gap-1">
              {timeline.density.map((entry) => (
                <li key={entry.year} className="flex flex-1 flex-col items-center gap-1">
                  <a
                    href={`#year-${entry.year}`}
                    title={`${entry.year}: ${entry.count} transitions`}
                    className="w-full rounded-xs bg-rule-strong transition-colors hover:bg-accent"
                    style={{ height: `${Math.max(3, (entry.count / peak) * 56)}px` }}
                  >
                    <span className="sr-only">
                      {entry.year}: {entry.count} transitions
                    </span>
                  </a>
                  <span className="font-mono text-[0.5625rem] tabular-nums text-ink-faint">
                    {String(entry.year).slice(2)}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* -------------------------------------------------------------- column */}
          <div className="space-y-12 border-t border-rule pt-8">
            {timeline.years.map((year) => (
              <section
                key={year.year}
                id={`year-${year.year}`}
                className="grid gap-4 scroll-mt-20 sm:grid-cols-[8rem_1fr] sm:gap-8"
              >
                <div className="sm:sticky sm:top-20 sm:self-start">
                  <h2 className="font-display text-3xl font-semibold tabular-nums text-ink-strong">
                    {year.year}
                  </h2>
                  {year.era ? (
                    <p className="mt-1 font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                      {year.era.name}
                    </p>
                  ) : null}
                  <p className="mt-1 font-mono text-catalog tabular-nums text-ink-faint">
                    {year.events.length} changes
                  </p>
                </div>

                <ol className="ruled min-w-0 border-t border-rule">
                  {year.events.map((event) => (
                    <li key={event.id} className="space-y-1.5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <time
                          dateTime={toISODate(event.date)}
                          className="font-mono text-catalog tabular-nums text-ink-faint"
                        >
                          {event.dateLabel}
                        </time>
                        <Badge tone={event.kind === 'START' ? 'sage' : 'accent'}>
                          {/* The verb is the UI's, the relationship name is the
                              vocabulary's — never the other way round (PRD §19). */}
                          {event.kind === 'START' ? 'began' : 'ended'}
                        </Badge>
                        {event.sourceName ? (
                          <span className="text-xs text-ink-faint">{event.sourceName}</span>
                        ) : null}
                      </div>

                      <EdgeSentence
                        subject={event.subject}
                        relationship={event.relationship}
                        object={event.object}
                      />

                      <Link
                        href={`/history/time-machine?date=${toISODate(event.date)}`}
                        className="inline-block font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint transition-colors hover:text-accent"
                      >
                        See the archive on this date →
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </PageShell>
  )
}
