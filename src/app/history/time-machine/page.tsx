import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/archive/empty-state'
import { EntityLink, Portrait } from '@/components/archive/record'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Stat, StatRow } from '@/components/archive/stat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { formatDate } from '@/lib/date'
import { getTimeMachinePage } from '@/server/queries/timeline'
import type { EntityRef } from '@/types/graph'

export const metadata: Metadata = {
  title: 'Time Machine',
  description:
    'Read the JKT48 archive as it stood on any date: rosters, captains, generations, and what changed since another date.',
}

/**
 * `/history/time-machine` (PRD §4.3, §20).
 *
 * One date in the URL, and every fact on the page is filtered by the temporal
 * predicate in §11 — `valid_from <= date AND (valid_to IS NULL OR valid_to >=
 * date)`. There is no snapshot table behind this, which is the whole point: the
 * archive can answer for a date nobody anticipated, including one in the middle of
 * a week when a single member moved teams.
 *
 * `?compare=` adds a second read and diffs the two rosters. The diff is a
 * derivation of the same edges, not a stored changelog, so it can never drift out
 * of agreement with the record pages.
 *
 * The date control is a plain GET form. `?date=1998-01-01` is a legitimate address
 * for "before the archive begins" and answers honestly with an empty roster rather
 * than an error — a reference work should be able to say "nothing yet".
 */
export default async function TimeMachinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const date = Array.isArray(query.date) ? query.date[0] : query.date
  const compare = Array.isArray(query.compare) ? query.compare[0] : query.compare

  const page = await getTimeMachinePage({ asOf: date ?? null, comparedTo: compare ?? null })
  const { snapshot, diff } = page
  const isEmpty = snapshot.totals.members === 0 && snapshot.totals.teams === 0

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={snapshot.era ? snapshot.era.name : 'Outside any recorded era'}
        title={
          <>
            The archive on <span className="text-accent">{formatDate(snapshot.asOf)}</span>
          </>
        }
        lead="Pick a date and the whole archive is re-read as it stood then. Same graph, same relationships — only the validity window moves."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/history/timeline">Timeline</Link>
          </Button>
        }
      />

      {/* -------------------------------------------------------------- controls */}
      <form
        method="get"
        action="/history/time-machine"
        className="flex flex-col gap-4 rounded-sm border border-rule bg-surface p-4 sm:flex-row sm:items-end"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="date"
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            As of
          </label>
          <Input id="date" name="date" type="date" defaultValue={page.asOf} className="w-44" />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="compare"
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            Compare with
          </label>
          <Input
            id="compare"
            name="compare"
            type="date"
            defaultValue={page.comparedTo ?? ''}
            className="w-44"
          />
        </div>

        <div className="flex gap-2 sm:ml-auto">
          <Button type="submit" variant="accent">
            Read the archive
          </Button>
          {date || compare ? (
            <Button asChild variant="ghost">
              <Link href="/history/time-machine">Today</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {page.presets.length > 0 ? (
        <nav aria-label="Jump to an era" className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Eras</span>
          {page.presets.map((preset) => (
            <Link
              key={preset.date}
              href={`/history/time-machine?date=${preset.date}`}
              className="rounded-xs border border-rule px-2 py-1 font-mono text-catalog uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-accent hover:text-accent"
            >
              {preset.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {isEmpty ? (
        <EmptyState
          title={`Nothing was on record on ${formatDate(snapshot.asOf)}`}
          body="Either the date falls outside what has been catalogued, or no relationship was valid then. Both are honest answers — the archive does not invent a roster for a date it has no edges for."
          action={
            <Button asChild variant="outline">
              <Link href="/history/timeline">See which dates the archive knows</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* ---------------------------------------------------------- totals */}
          <div className="border-t border-rule pt-6">
            <StatRow className="sm:grid-cols-3">
              <Stat
                label="Active members"
                value={snapshot.totals.members}
                detail="Valid on this date"
              />
              <Stat label="Teams" value={snapshot.totals.teams} detail="With a roster" />
              <Stat
                label="Generations"
                value={snapshot.totals.generations}
                detail="Announced by this date"
              />
            </StatRow>
          </div>

          {snapshot.era?.description ? (
            <p className="max-w-2xl border-l-2 border-accent pl-4 text-sm leading-relaxed text-ink-muted">
              {snapshot.era.description}
            </p>
          ) : null}

          {/* ------------------------------------------------------------ diff */}
          {diff ? (
            <Section>
              <SectionHeading
                as="h2"
                eyebrow={`${formatDate(diff.from)} → ${formatDate(diff.to)}`}
                title="What changed"
                lead={`${diff.joined.length} joined, ${diff.left.length} left, ${diff.unchanged} unchanged. Derived from the same edges as both snapshots.`}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <DiffColumn
                  title="Joined a roster"
                  tone="sage"
                  entries={diff.joined}
                  empty="No one joined a roster between these dates."
                />
                <DiffColumn
                  title="Left a roster"
                  tone="accent"
                  entries={diff.left}
                  empty="No one left a roster between these dates."
                />
              </div>
            </Section>
          ) : null}

          {/* --------------------------------------------------------- rosters */}
          <Section>
            <SectionHeading
              as="h2"
              eyebrow="Membership as it stood"
              title="Rosters"
              lead="A member appears under a team because a MEMBER_OF relationship was valid on this date, and the captain is marked by a separate CAPTAIN_OF edge — never by a column on the member (PRD §10)."
            />

            {snapshot.rosters.length === 0 ? (
              <p className="rounded-sm border border-dashed border-rule-strong bg-ground-sunk px-4 py-5 text-sm text-ink-muted">
                No team had a recorded roster on this date.
              </p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {snapshot.rosters.map((roster) => (
                  <Panel key={roster.team.id}>
                    <PanelHeader>
                      <div className="min-w-0 space-y-1">
                        <p className="eyebrow">
                          {roster.members.length}{' '}
                          {roster.members.length === 1 ? 'member' : 'members'}
                        </p>
                        <PanelTitle className="text-base">
                          <Link
                            href={`${roster.team.href}?asOf=${page.asOf}`}
                            className="transition-colors hover:text-accent"
                          >
                            {roster.team.canonicalName}
                          </Link>
                        </PanelTitle>
                      </div>
                      {roster.captain ? (
                        <Badge tone="ink">Captain · {roster.captain.canonicalName}</Badge>
                      ) : (
                        <Badge tone="quiet">No captain recorded</Badge>
                      )}
                    </PanelHeader>

                    {roster.members.length === 0 ? (
                      <PanelBody>
                        <p className="text-sm text-ink-muted">
                          The team existed but has no members recorded on this date.
                        </p>
                      </PanelBody>
                    ) : (
                      <PanelBody>
                        <ul className="flex flex-wrap gap-2">
                          {roster.members.map((member) => (
                            <li key={member.id}>
                              <Link
                                href={`${member.href}?asOf=${page.asOf}`}
                                className="flex items-center gap-2 rounded-sm border border-rule bg-ground px-2 py-1 text-xs text-ink transition-colors hover:border-accent hover:text-accent"
                              >
                                <Portrait entity={member} size="sm" className="size-6" />
                                <span className="truncate">{member.canonicalName}</span>
                                {roster.captain?.id === member.id ? (
                                  <span
                                    title="Captain"
                                    className="font-mono text-catalog text-accent"
                                  >
                                    C<span className="sr-only">aptain</span>
                                  </span>
                                ) : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </PanelBody>
                    )}
                  </Panel>
                ))}
              </div>
            )}
          </Section>

          {/* ----------------------------------------------------- generations */}
          {snapshot.generations.length > 0 ? (
            <Section>
              <SectionHeading
                as="h3"
                eyebrow={`${snapshot.generations.length} announced`}
                title="Generations on record by this date"
              />
              <ul className="flex flex-wrap gap-2">
                {snapshot.generations.map((generation) => (
                  <li key={generation.id}>
                    <Link
                      href={`${generation.href}?asOf=${page.asOf}`}
                      className="inline-block rounded-sm border border-rule bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:text-accent"
                    >
                      {generation.canonicalName}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {/* -------------------------------------------------------- practice */}
          <Section>
            <SectionHeading
              as="h3"
              eyebrow="Practice"
              title="Can you reconstruct this date from memory?"
              lead="The Time Machine game asks about a date the same way this page reads it — same snapshot service, questions instead of answers."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={`/games/time-machine?date=${page.asOf}`}>Play this date</Link>
                </Button>
              }
            />
          </Section>
        </>
      )}
    </PageShell>
  )
}

/**
 * One side of the roster diff.
 *
 * Both sides render even when empty, and each says so in words. A missing column
 * would leave the reader unable to tell "nobody left" from "the diff did not
 * check".
 */
function DiffColumn({
  title,
  tone,
  entries,
  empty,
}: {
  title: string
  tone: 'sage' | 'accent'
  entries: { member: EntityRef; team: EntityRef }[]
  empty: string
}) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="text-sm">{title}</PanelTitle>
        <Badge tone={tone}>{entries.length}</Badge>
      </PanelHeader>
      {entries.length === 0 ? (
        <PanelBody>
          <p className="text-sm text-ink-muted">{empty}</p>
        </PanelBody>
      ) : (
        <ul className="ruled">
          {entries.map((entry) => (
            <li key={`${entry.member.id}:${entry.team.id}`} className="px-4 py-2.5 text-sm">
              <EntityLink entity={entry.member} />
              <span className="text-ink-faint"> · </span>
              <EntityLink entity={entry.team} className="text-ink-muted" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
