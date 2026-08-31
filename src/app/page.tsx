import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowRight } from 'lucide-react'

import { EmptyState } from '@/components/archive/empty-state'
import { EdgeSentence } from '@/components/archive/edges'
import { Portrait, RecordCard, RecordGrid } from '@/components/archive/record'
import { MoreLink, PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Stat, StatRow } from '@/components/archive/stat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { getHomePage, getTodayPanel } from '@/server/queries/home'

/**
 * `/` — the archive's front page (PRD §20).
 *
 * Deliberately not a hero with a gradient and a call to action. The front page of
 * a reference work states what the work contains, shows a little of it, and gets
 * out of the way. So: the scale of the graph in counted figures, what was true
 * today, the most recent changes, a few rails of records, and the practice modes
 * the database actually has definitions for.
 *
 * Every figure here is a read, not a claim (PRD §28) — which means an empty
 * archive renders an honest, small page rather than a broken one.
 *
 * The masthead is static copy, so it is not made to wait for the graph: the
 * headline, lead and calls to action render synchronously and everything counted
 * streams in behind a `<Suspense>` boundary. The whole read still happens as one
 * `Promise.all` inside `HomeBody`, so nothing here trades a fast frame for a
 * waterfall.
 */
export const revalidate = 300

/**
 * The era named in the masthead eyebrow.
 *
 * The one line above the fold that is a read rather than copy. Its fallback is
 * the same text an archive with no era covering today already shows, so the
 * eyebrow reads correctly either way.
 */
async function EraEyebrow() {
  const today = await getTodayPanel()
  return <>Knowledge graph · {today.eraName ?? 'JKT48 history'}</>
}

/** The shape of what is loading: a row of figures, then two panels. */
function HomeBodyFallback() {
  return (
    <div className="space-y-14" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the archive</span>

      <div className="grid grid-cols-2 gap-6 border-t border-rule pt-6 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <div className="h-2.5 w-16 animate-pulse rounded-xs bg-ground-sunk" />
            <div className="h-7 w-12 animate-pulse rounded-xs bg-ground-sunk" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        {[0, 1].map((index) => (
          <div
            key={index}
            className="h-64 animate-pulse rounded-sm border border-rule bg-ground-sunk"
          />
        ))}
      </div>
    </div>
  )
}

async function HomeBody() {
  const home = await getHomePage()
  const isEmpty = home.scale.entities === 0

  return (
    <>
      {/* ---------------------------------------------------------------- scale */}
      <Section>
        <div className="border-t border-rule pt-6">
          <StatRow>
            <Stat
              label="Records"
              value={home.scale.entities.toLocaleString()}
              detail="Entities in the graph"
              href="/explore"
            />
            <Stat
              label="Relationships"
              value={home.scale.relationships.toLocaleString()}
              detail="First-class, dated edges"
            />
            <Stat
              label="Collections"
              value={home.scale.collections}
              detail="With at least one record"
              href="/explore"
            />
            <Stat
              label="Practice modes"
              value={home.games.length}
              detail="Generated from the graph"
              href="/games"
            />
          </StatRow>
        </div>
      </Section>

      {isEmpty ? (
        <EmptyState
          title="The archive is empty"
          body={
            <>
              No records have been seeded yet. Run <code className="font-mono">npm run db:seed</code>{' '}
              to load the relationship vocabulary, mastery bands, game definitions
              and a starter knowledge graph — then everything on this page fills in
              from the database.
            </>
          }
          action={
            <Button asChild variant="outline">
              <Link href="/admin">Open curator tools</Link>
            </Button>
          }
        />
      ) : null}

      {/* ------------------------------------------------------- today + changes */}
      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <Panel>
          <PanelHeader>
            <div className="space-y-1">
              <p className="eyebrow">As of {home.today.asOfLabel}</p>
              <PanelTitle>{home.today.eraName ?? 'Today in the archive'}</PanelTitle>
            </div>
            <MoreLink href={`/history/time-machine?date=${home.today.asOf}`}>
              Time Machine
            </MoreLink>
          </PanelHeader>
          <PanelBody className="space-y-5">
            {home.today.eraDescription ? (
              <p className="text-sm leading-relaxed text-ink-muted">
                {home.today.eraDescription}
              </p>
            ) : null}

            <dl className="grid grid-cols-3 gap-4">
              <div>
                <dt className="eyebrow">Active members</dt>
                <dd className="font-display text-2xl font-semibold tabular-nums text-ink-strong">
                  {home.today.activeMembers}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Teams</dt>
                <dd className="font-display text-2xl font-semibold tabular-nums text-ink-strong">
                  {home.today.teams}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Generations</dt>
                <dd className="font-display text-2xl font-semibold tabular-nums text-ink-strong">
                  {home.today.generations}
                </dd>
              </div>
            </dl>

            {home.today.faces.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-4">
                {home.today.faces.map((face) => (
                  <Link
                    key={face.id}
                    href={face.href}
                    title={face.canonicalName}
                    className="transition-opacity hover:opacity-75"
                  >
                    <Portrait entity={face} size="md" />
                  </Link>
                ))}
                <span className="ml-1 text-xs text-ink-faint">
                  on a roster today
                </span>
              </div>
            ) : null}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader>
            <PanelTitle>Latest changes</PanelTitle>
            <MoreLink href="/history/timeline">Full timeline</MoreLink>
          </PanelHeader>
          {home.recentChanges.length === 0 ? (
            <PanelBody>
              <p className="text-sm text-ink-muted">
                No dated relationships yet. The timeline is built from the moments
                relationships begin and end, so it fills in as the graph is curated.
              </p>
            </PanelBody>
          ) : (
            <div className="ruled">
              {home.recentChanges.map((event) => (
                <div key={event.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <time className="font-mono text-catalog tabular-nums text-ink-faint">
                      {event.dateLabel}
                    </time>
                    <Badge tone={event.kind === 'START' ? 'sage' : 'accent'}>
                      {event.kind === 'START' ? 'began' : 'ended'}
                    </Badge>
                  </div>
                  <EdgeSentence
                    subject={event.subject}
                    relationship={event.relationship}
                    object={event.object}
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ---------------------------------------------------------------- rails */}
      {home.rails.map((rail) => (
        <Section key={rail.collection.slug}>
          <SectionHeading
            eyebrow={`${rail.collection.count} records`}
            title={rail.collection.label}
            lead={rail.collection.description}
            action={
              <MoreLink href={`/explore/${rail.collection.slug}`}>
                All {rail.collection.label.toLowerCase()}
              </MoreLink>
            }
          />
          <RecordGrid>
            {rail.cards.map((card, index) => (
              <RecordCard
                key={card.id}
                entity={card}
                meta={card.meta}
                dateline={card.dateline}
                index={index}
              />
            ))}
          </RecordGrid>
        </Section>
      ))}

      {/* ---------------------------------------------------------------- games */}
      {home.games.length > 0 ? (
        <Section>
          <SectionHeading
            eyebrow="Practice"
            title="Test what you actually remember"
            lead="Every question is generated from the graph at play time — no question bank, no fixed answers. Harder rungs ask you to reason across more relationships, not to answer the same question faster."
            action={<MoreLink href="/games">All games</MoreLink>}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {home.games.map((game, index) => (
              <Link
                key={game.gameType}
                href={game.href}
                style={{ '--index': index } as React.CSSProperties}
                className="animate-rise stagger group flex flex-col gap-2 rounded-sm border border-rule bg-surface p-4 transition-[border-color,background-color] duration-(--duration-base) hover:border-ink-faint hover:bg-surface-raised"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold transition-colors group-hover:text-accent">
                    {game.label}
                  </h3>
                  <span className="font-mono text-catalog tabular-nums text-ink-faint">
                    {game.difficultyCount} rungs
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-ink-muted">{game.tagline}</p>
                <p className="mt-auto pt-1 font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                  Trains · {game.trains}
                </p>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* ------------------------------------------------------ recently updated */}
      {home.recentlyUpdated.length > 0 ? (
        <Section>
          <SectionHeading eyebrow="Curation" title="Recently updated" as="h3" />
          <div className="ruled rounded-sm border border-rule bg-surface">
            {home.recentlyUpdated.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-ground-sunk"
              >
                <span className="truncate text-sm font-medium text-ink">
                  {card.canonicalName}
                </span>
                <span className="shrink-0 font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                  {card.meta}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  )
}

export default function HomePage() {
  return (
    <PageShell className="space-y-14">
      {/* ------------------------------------------------------------- masthead */}
      <section className="space-y-6 pt-2">
        <p className="eyebrow animate-rise">
          <Suspense fallback="Knowledge graph · JKT48 history">
            <EraEyebrow />
          </Suspense>
        </p>

        <h1 className="animate-rise max-w-3xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
          Everything JKT48 has been, held as one connected record.
        </h1>

        <p className="animate-rise max-w-2xl text-base leading-relaxed text-ink-muted">
          Members, generations, teams, songs, albums and events — stored as
          relationships with the dates they were true, so the archive can answer
          not just <em>who</em> but <em>when</em>. Then it asks you to reconstruct
          it from memory.
        </p>

        <div className="animate-rise flex flex-wrap items-center gap-2.5">
          <Button asChild variant="accent" size="lg">
            <Link href="/explore">
              Browse the archive
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/history/time-machine">Open the Time Machine</Link>
          </Button>
        </div>
      </section>

      <Suspense fallback={<HomeBodyFallback />}>
        <HomeBody />
      </Suspense>
    </PageShell>
  )
}
