import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { ChallengeView } from '@/components/game/challenge-view'
import { RoundReveal, Scorecard, SessionProgress } from '@/components/game/session-chrome'
import { PageShell } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { gameHref } from '@/domain/game-definitions'
import { GameSessionStatus } from '@/generated/prisma/enums'
import { getCurrentProfile } from '@/lib/auth/session'
import { formatDate } from '@/lib/date'
import { getSessionReview, getSessionState } from '@/server/services/game-engine'

import { abandonSessionAction, answerRoundAction } from './actions'

export const metadata: Metadata = {
  title: 'Playing',
  /** A live session is nobody's search result. */
  robots: { index: false, follow: false },
}

/**
 * `/games/play/[sessionId]` (PRD §5, §7, §20).
 *
 * The whole play loop is server-rendered and URL-addressed:
 *
 *   ask  → POST the answer → `?reveal=<challengeId>` → ask the next round → …
 *
 * There is no client-side game state, which buys three things. A reload never
 * loses a reveal. The back button walks back through the rounds you have already
 * seen instead of breaking. And the answer never passes through the browser as
 * data, because it is only ever read from the database on the server — a player
 * cannot open devtools and find the next answer sitting in a payload.
 *
 * A session id is unguessable but not secret, so an *owned* session is refused to
 * anyone else: answering it would write into a stranger's mastery record. An
 * anonymous session stays open to whoever holds the link, which is what makes
 * playing without an account work at all (PRD §35).
 */
export default async function PlaySessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ sessionId }, query] = await Promise.all([params, searchParams])
  const revealId = Array.isArray(query.reveal) ? query.reveal[0] : query.reveal
  const error = Array.isArray(query.error) ? query.error[0] : query.error

  const state = await getSessionState(sessionId)
  if (!state) notFound()

  const { session } = state
  if (session.userId !== null) {
    const profile = await getCurrentProfile()
    if (profile?.id !== session.userId) redirect('/forbidden')
  }

  const isLive = session.status === GameSessionStatus.IN_PROGRESS
  const playAgainHref = gameHref(session.gameType)

  // The reveal reads the answered round back out of the database rather than
  // being handed down from the action, which is why it survives a reload.
  const review = revealId || !isLive ? await getSessionReview(sessionId) : null
  const revealed = revealId
    ? (review?.rounds.find((round) => round.challengeId === revealId) ?? null)
    : null

  return (
    <PageShell className="max-w-[52rem] space-y-6">
      {/* ------------------------------------------------------------- header */}
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={playAgainHref}
            className="font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted transition-colors hover:text-accent"
          >
            {session.definitionName}
          </Link>
          {session.scopeDate ? (
            <Badge tone="indigo">as of {formatDate(session.scopeDate)}</Badge>
          ) : null}
          {session.scope ? <Badge tone="neutral">{session.scope.canonicalName}</Badge> : null}
          {!isLive ? <Badge tone="quiet">session closed</Badge> : null}
        </div>
      </header>

      <SessionProgress session={session} />

      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      {/* --------------------------------------------------------------- body */}
      {revealed ? (
        <RoundReveal
          round={revealed}
          nextHref={`/games/play/${sessionId}`}
          nextLabel={isLive ? 'Next round' : 'See your scorecard'}
        />
      ) : !isLive || !state.challenge ? (
        review ? (
          <Scorecard review={review} playAgainHref={playAgainHref} />
        ) : (
          <p className="text-sm text-ink-muted">This session has no rounds on record.</p>
        )
      ) : (
        <form action={answerRoundAction} className="space-y-6">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="challengeId" value={state.challenge.id} />

          <ChallengeView challenge={state.challenge} />

          <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
            <Button type="submit" variant="accent" size="lg">
              Submit answer
            </Button>
            <p className="text-xs text-ink-faint">
              One shot per round. The answer and its source appear next.
            </p>
          </div>
        </form>
      )}

      {/* --------------------------------------------------------------- foot */}
      {isLive ? (
        <form
          action={abandonSessionAction}
          className="flex items-baseline justify-between gap-3 border-t border-rule pt-4"
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <p className="text-xs text-ink-faint">
            Leaving keeps the session open; you can come back to this URL. Abandoning closes it and
            records it in your history as unfinished.
          </p>
          <Button type="submit" variant="ghost" size="sm">
            Abandon
          </Button>
        </form>
      ) : null}
    </PageShell>
  )
}
