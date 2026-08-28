import Link from 'next/link'

import { EmptyState } from '@/components/archive/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GameSessionStatus } from '@/generated/prisma/enums'
import type { SessionSummary } from '@/server/queries/profile'

/**
 * The game log (PRD §20 `/me/history`).
 *
 * A session is listed with its rung and what that rung *asked of the player* —
 * "combine two facts", not "45 seconds". Difficulty in this archive is cognitive
 * complexity (§6.3), and a history screen is exactly where a leaderboard-shaped
 * product would quietly reintroduce the clock.
 *
 * Abandoned sessions stay in the list. An archive does not rewrite its own record
 * to make its reader look better, and a row of abandonments at one rung is the
 * most useful thing this page can tell someone.
 */

const STATUS_TONE = {
  [GameSessionStatus.COMPLETED]: 'sage',
  [GameSessionStatus.IN_PROGRESS]: 'indigo',
  [GameSessionStatus.ABANDONED]: 'quiet',
} as const

export function SessionList({
  sessions,
  emptyTitle = 'Nothing played yet',
  emptyBody = 'Sessions appear here as soon as you finish a round. Nothing is recorded until you answer something.',
}: {
  sessions: SessionSummary[]
  emptyTitle?: string
  emptyBody?: string
}) {
  if (sessions.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        body={emptyBody}
        action={
          <Button asChild variant="outline">
            <Link href="/games">Choose a game</Link>
          </Button>
        }
      />
    )
  }

  return (
    <ul className="ruled">
      {sessions.map((session) => (
        <li key={session.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:gap-6">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <Link
                href={session.gameHref}
                className="text-sm font-medium text-ink transition-colors hover:text-accent"
              >
                {session.gameLabel}
              </Link>
              <Badge tone="neutral">{session.difficultyLabel}</Badge>
              <Badge tone={STATUS_TONE[session.status]}>{session.statusLabel}</Badge>
            </div>

            <p className="text-xs leading-relaxed text-ink-faint">{session.cognition}</p>

            <p className="font-mono text-catalog tabular-nums text-ink-faint">
              {session.startedLabel}
              {session.scope ? ` · scoped to ${session.scope.canonicalName}` : ''}
            </p>
          </div>

          <div className="flex items-baseline gap-5 sm:justify-end">
            <div className="space-y-0.5 text-right">
              <p className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                Correct
              </p>
              <p className="font-mono text-sm tabular-nums text-ink">
                {session.correctCount}/{session.totalRounds}
              </p>
            </div>
            <div className="space-y-0.5 text-right">
              <p className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                Score
              </p>
              <p className="font-display text-xl leading-none tabular-nums text-ink-strong">
                {session.score}
              </p>
            </div>

            {/*
              An in-progress session is a URL, so "resume" is a link rather than a
              button that reconstructs anything. Finished sessions link to the same
              place, where the page renders the scorecard instead of a round.
            */}
            <Button asChild variant={session.resumeHref ? 'outline' : 'ghost'} size="sm">
              <Link href={`/games/play/${session.id}`}>
                {session.resumeHref ? 'Resume' : 'Scorecard'}
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )
}
