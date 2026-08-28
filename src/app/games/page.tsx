import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState, InsufficientData } from '@/components/archive/empty-state'
import { EntityLink } from '@/components/archive/record'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { StartGameForm } from '@/components/game/start-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { getGamesIndex, type GameView } from '@/server/queries/games'
import type { EntityRef } from '@/types/graph'

export const metadata: Metadata = {
  title: 'Games',
  description:
    'Learn JKT48 history by being asked about it: Mystery Member, Connect the Dots, Memory Reconstruction and the Time Machine, all generated from the archive itself.',
}

/**
 * `/games` (PRD §5, §20).
 *
 * Every card on this page is assembled from `GameDefinition` rows. The rungs, the
 * round counts, the answer modes and whether a game reads a date are all read
 * from the database, which is what §28 means by the games being consumers of the
 * knowledge graph rather than features bolted onto it: activate a rung in the
 * admin and it appears here with no code change.
 *
 * A start is a form submission, not a link, because a session is a write. That
 * also means the query string carries the failures: `?thin=` when the graph
 * cannot support the rung the player chose, `?error=` for everything else. Both
 * are shown above the fold rather than swallowed into an error screen — "the
 * archive is too thin for this question" is a curation finding, and it belongs
 * where a curator will read it (PRD §16).
 */
export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const one = (key: string) => {
    const value = query[key]
    return Array.isArray(value) ? value[0] : value
  }

  const index = await getGamesIndex({ scopeEntityId: one('scope'), scopeDate: one('date') })

  const thin = one('thin')
  const error = one('error')
  const needed = Number(one('needed'))
  const found = Number(one('found'))

  const playable = index.games.filter((game) => game.hasRungs)
  const planned = index.games.filter((game) => !game.hasRungs)

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={`${playable.length} ${playable.length === 1 ? 'game' : 'games'} available`}
        title="Games"
        lead="Every question is generated from the archive at the moment you ask for it. Nothing here is a fixed quiz file, which is why a newly catalogued relationship can be asked about the same afternoon."
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

      {index.scope ? <ScopeNote scope={index.scope} /> : null}

      {/* -------------------------------------------------------- how it works */}
      <div className="grid gap-x-8 gap-y-4 border-y border-rule py-6 sm:grid-cols-3">
        <Explainer
          ordinal="01"
          title="Difficulty is cognitive, not chronometric"
          body="A harder rung asks you to combine more facts or walk further along a relationship chain. It never gives you less time to answer the same question."
        />
        <Explainer
          ordinal="02"
          title="Answers are graded against the graph"
          body="Correct or incorrect, with the right answer and a link to the record it came from. You can always go and read why."
        />
        <Explainer
          ordinal="03"
          title="Playing moves your mastery"
          body="Answered rounds roll up into per-generation mastery across members, history, teams, songs and relationships — if you are signed in."
        />
      </div>

      {/* -------------------------------------------------------------- games */}
      {playable.length === 0 ? (
        <EmptyState
          title="No games are active yet"
          body="Game definitions are database rows, so a fresh archive starts with none active. Seed or activate a definition and the cards appear here."
          action={
            <Button asChild variant="outline">
              <Link href="/admin/games">Open game settings</Link>
            </Button>
          }
        />
      ) : (
        <Section className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {playable.map((game) => (
              <GameCard
                key={game.gameType}
                game={game}
                scope={index.scope}
                scopeDate={index.scopeDate}
              />
            ))}
          </div>
        </Section>
      )}

      {planned.length > 0 ? (
        <Section>
          <SectionHeading
            as="h2"
            eyebrow="Not yet"
            title="Planned"
            lead="Listed because a roadmap the reader can see is more useful than a card that quietly disappeared (PRD §26)."
          />
          <ul className="ruled">
            {planned.map((game) => (
              <li
                key={game.gameType}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3"
              >
                <span className="text-sm font-medium text-ink-muted">{game.label}</span>
                <Badge tone={game.isPlanned ? 'ochre' : 'quiet'}>
                  {game.isPlanned ? 'V1.1' : 'no active rungs'}
                </Badge>
                <span className="w-full text-xs leading-relaxed text-ink-faint sm:w-auto sm:flex-1">
                  {game.tagline}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ------------------------------------------------------------ mastery */}
      <Section>
        <SectionHeading
          as="h2"
          eyebrow="Where this goes"
          title="Mastery is the scoreboard"
          lead="Sessions are not the point; what you can recall afterwards is. Mastery is tracked per generation and broken into dimensions, so it can tell you that you know the members of a generation but not its songs."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/me/mastery">Your mastery</Link>
            </Button>
          }
        />
      </Section>
    </PageShell>
  )
}

/** One game, with its start form inline so the common case is one click deep. */
function GameCard({
  game,
  scope,
  scopeDate,
}: {
  game: GameView
  scope: EntityRef | null
  scopeDate: string | null
}) {
  const returnTo = scope ? `/games?scope=${scope.id}` : '/games'

  return (
    <Panel className="flex flex-col">
      <PanelHeader>
        <div className="min-w-0 space-y-1">
          <p className="eyebrow">{game.tagline}</p>
          <PanelTitle className="text-lg">
            <Link href={game.href} className="transition-colors hover:text-accent">
              {game.label}
            </Link>
          </PanelTitle>
        </div>
        {game.acceptsDate ? <Badge tone="indigo">date-aware</Badge> : null}
      </PanelHeader>

      <PanelBody className="flex-1 space-y-3">
        <p className="text-sm leading-relaxed text-ink-muted">{game.description}</p>
        <p className="text-xs leading-relaxed text-ink-faint">
          <span className="font-mono uppercase tracking-[0.08em]">Trains</span> · {game.trains}
        </p>
      </PanelBody>

      <PanelBody className="border-t border-rule">
        <StartGameForm
          game={game}
          scope={scope}
          scopeDate={scopeDate}
          returnTo={returnTo}
          layout="compact"
        />
      </PanelBody>
    </Panel>
  )
}

/**
 * Shown when the player arrived from a mastery gap or a record page.
 *
 * The scope is carried in the URL rather than in a cookie, so "practise this
 * generation" is a link someone can send to a friend.
 */
function ScopeNote({ scope }: { scope: EntityRef }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-sm border border-indigo/30 bg-indigo-soft px-4 py-3 text-sm text-ink">
      <span className="font-mono text-catalog uppercase tracking-[0.08em] text-indigo">
        Scoped
      </span>
      <span>
        Questions will be drawn from <EntityLink entity={scope} /> where the rung allows it.
      </span>
      <Link href="/games" className="text-xs text-accent underline underline-offset-2">
        clear
      </Link>
    </p>
  )
}

/** A numbered note in the "how this works" band. */
function Explainer({
  ordinal,
  title,
  body,
}: {
  ordinal: string
  title: string
  body: string
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-catalog tabular-nums text-accent">{ordinal}</p>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="text-xs leading-relaxed text-ink-muted">{body}</p>
    </div>
  )
}
