import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { InsufficientData } from '@/components/archive/empty-state'
import { EntityLink } from '@/components/archive/record'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { StartGameForm } from '@/components/game/start-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { difficultyProfile } from '@/domain/difficulty'
import { getGamePage } from '@/server/queries/games'

/**
 * `/games/[game]` (PRD §5, §20).
 *
 * The rung picker lives here rather than on the index because choosing a
 * difficulty deserves the explanation next to it: each rung states the cognition
 * it demands, and none of them states a time limit, because difficulty in this
 * archive is how much thinking a question needs and never how fast the clock runs
 * (PRD §6.3, §P4).
 *
 * A date input appears only when a definition for this game actually resolves
 * against a date — read from the definition's config, not from the game's name,
 * so seeding a dated rung of any game gets the control for free.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string }>
}): Promise<Metadata> {
  const { game: slug } = await params
  const page = await getGamePage(slug)
  if (!page) return { title: 'Game not found' }

  return {
    title: page.game.label,
    description: page.game.description,
  }
}

export default async function GameDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ game: slug }, query] = await Promise.all([params, searchParams])
  const one = (key: string) => {
    const value = query[key]
    return Array.isArray(value) ? value[0] : value
  }

  const page = await getGamePage(slug, {
    scopeEntityId: one('scope'),
    scopeDate: one('date'),
  })
  if (!page) notFound()

  const { game, scope } = page
  const thin = one('thin')
  const error = one('error')
  const needed = Number(one('needed'))
  const found = Number(one('found'))

  const returnTo = scope ? `${game.href}?scope=${scope.id}` : game.href

  return (
    <PageShell className="max-w-[64rem] space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={game.tagline}
        title={game.label}
        lead={game.description}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/games">All games</Link>
          </Button>
        }
      />

      {thin ? (
        <InsufficientData
          message={thin}
          needed={Number.isFinite(needed) ? needed : undefined}
          found={Number.isFinite(found) ? found : undefined}
          hint={one('hint')}
        />
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
        {/* ------------------------------------------------------------ start */}
        <div className="space-y-8">
          <Panel>
            <PanelHeader>
              <PanelTitle className="text-base">Start a session</PanelTitle>
              {game.acceptsDate ? <Badge tone="indigo">date-aware</Badge> : null}
            </PanelHeader>
            <PanelBody>
              <StartGameForm
                game={game}
                scope={scope}
                scopeDate={page.scopeDate}
                returnTo={returnTo}
                layout="full"
              />
            </PanelBody>
          </Panel>

          {scope ? (
            <p className="text-sm text-ink-muted">
              Scoped to <EntityLink entity={scope} />.{' '}
              <Link href={game.href} className="text-accent underline underline-offset-2">
                Play the whole archive instead
              </Link>
              .
            </p>
          ) : null}

          {/* -------------------------------------------------------- rung table */}
          {game.rungs.length > 0 ? (
            <Section>
              <SectionHeading
                as="h2"
                eyebrow="What each rung asks"
                title="Difficulty is a shape of question"
                lead="Every rung below is a row in the database. Its round count, its answer mode and how far it walks through the graph are configured, not compiled."
              />
              <ul className="ruled">
                {game.rungs.map((rung) => {
                  const profile = difficultyProfile(rung.difficulty)
                  return (
                    <li key={rung.definitionId} className="space-y-1.5 py-4">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 className="text-sm font-semibold text-ink">{rung.label}</h3>
                        <Badge tone="accent">{rung.cognition}</Badge>
                        <span className="font-mono text-catalog uppercase tracking-[0.08em] tabular-nums text-ink-faint">
                          {rung.rounds} {rung.rounds === 1 ? 'round' : 'rounds'} ·{' '}
                          {profile.hopCount} {profile.hopCount === 1 ? 'hop' : 'hops'} ·{' '}
                          {profile.clueCount} {profile.clueCount === 1 ? 'clue' : 'clues'}
                        </span>
                      </div>
                      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
                        {profile.description}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </Section>
          ) : null}
        </div>

        {/* -------------------------------------------------------------- aside */}
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-2 rounded-sm border border-rule bg-ground-sunk px-4 py-3.5">
            <p className="eyebrow">Trains</p>
            <p className="text-sm leading-relaxed text-ink">{game.trains}</p>
          </div>

          <div className="space-y-2 border-l-2 border-rule-strong pl-4">
            <p className="eyebrow">How grading works</p>
            <p className="text-sm leading-relaxed text-ink-muted">
              Each answer is correct or incorrect — there is no partial credit and no confidence
              rating in V1. Afterwards the scorecard shows the right answer and links to the record
              it was read from, so a wrong answer sends you to the archive rather than to a dead
              end.
            </p>
          </div>

          {page.others.length > 0 ? (
            <div className="space-y-2">
              <p className="eyebrow">Or try</p>
              <ul className="ruled">
                {page.others.map((other) => (
                  <li key={other.gameType} className="py-2.5">
                    <Link
                      href={other.href}
                      className="group flex items-baseline justify-between gap-3"
                    >
                      <span className="text-sm text-ink transition-colors group-hover:text-accent">
                        {other.label}
                      </span>
                      <span aria-hidden className="text-ink-faint">
                        →
                      </span>
                    </Link>
                    <p className="text-xs text-ink-faint">{other.tagline}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </PageShell>
  )
}
