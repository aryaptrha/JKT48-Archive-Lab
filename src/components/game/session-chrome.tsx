import Link from 'next/link'

import { EntityLink } from '@/components/archive/record'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GameSessionStatus } from '@/generated/prisma/enums'
import { formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { SESSION_STATUS_LABELS } from '@/domain/labels'
import type { RoundReview, SessionReview, SessionView } from '@/server/services/game-engine'

/**
 * The furniture around a round: where you are, what just happened, and how it
 * ended (PRD §5, §7).
 *
 * Two commitments run through all three components. First, correctness is binary
 * — there is no confidence dial and no partial verdict, because V1 says so
 * (PRD §7) and because "62% right" is not a thing a person can act on. Second,
 * every wrong answer ends in a link into the encyclopedia. A game that says
 * "incorrect" and stops is a quiz; a game that says "incorrect, here is the
 * record" is part of an archive (PRD §P2).
 */

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Round position and running score.
 *
 * Rendered as a row of marks rather than a percentage bar: a session is a small
 * countable number of rounds, and a player wants to know "two left", not "68%".
 */
export function SessionProgress({ session }: { session: SessionView }) {
  const rounds = Array.from({ length: session.totalRounds }, (_, index) => index)

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-rule py-3">
      <div className="flex items-center gap-3">
        <p className="eyebrow">
          Round {Math.min(session.answeredRounds + 1, session.totalRounds)} of{' '}
          {session.totalRounds}
        </p>
        <ol className="flex items-center gap-1" aria-hidden>
          {rounds.map((index) => (
            <li
              key={index}
              className={cn(
                'h-1.5 w-5 rounded-full',
                index < session.correctCount + session.incorrectCount
                  ? 'bg-ink-strong'
                  : 'bg-rule-strong',
              )}
            />
          ))}
        </ol>
      </div>

      <dl className="flex items-baseline gap-5">
        <div className="flex items-baseline gap-1.5">
          <dt className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
            Right
          </dt>
          <dd className="font-mono text-sm tabular-nums text-sage">{session.correctCount}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
            Wrong
          </dt>
          <dd className="font-mono text-sm tabular-nums text-accent">{session.incorrectCount}</dd>
        </div>
        <div className="flex items-baseline gap-1.5">
          <dt className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
            Score
          </dt>
          <dd className="font-mono text-sm tabular-nums text-ink-strong">{session.score}</dd>
        </div>
      </dl>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Reveal                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the answer was, and where it is written down.
 *
 * The verdict is stated plainly and once. Then the correct answer, then the
 * explanation, then the citation — in that order, because a player who got it
 * wrong wants the answer before the reasoning, and a player who got it right
 * wants the reasoning confirmed.
 */
export function RoundReveal({
  round,
  nextHref,
  nextLabel,
}: {
  round: RoundReview
  nextHref: string
  nextLabel: string
}) {
  return (
    <div
      className={cn(
        'space-y-4 rounded-sm border px-5 py-4',
        round.isCorrect ? 'border-sage/40 bg-sage-soft' : 'border-accent/40 bg-accent-soft',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p
          className={cn(
            'font-display text-lg font-semibold',
            round.isCorrect ? 'text-sage' : 'text-accent',
          )}
          role="status"
        >
          {round.isCorrect ? 'Correct' : 'Not this time'}
        </p>
        <p className="font-mono text-catalog uppercase tracking-[0.08em] tabular-nums text-ink-muted">
          {round.pointsAwarded >= 0 ? '+' : ''}
          {round.pointsAwarded} {Math.abs(round.pointsAwarded) === 1 ? 'point' : 'points'}
        </p>
      </div>

      <div className="space-y-1">
        <p className="eyebrow">The answer</p>
        <p className="text-base leading-snug font-medium text-ink-strong">
          {round.correctAnswerText}
        </p>
      </div>

      {round.explanation ? (
        <p className="max-w-prose text-sm leading-relaxed text-ink">{round.explanation}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button asChild variant="default">
          <Link href={nextHref}>{nextLabel}</Link>
        </Button>
        {round.revealHref ? (
          <Button asChild variant="ghost">
            <Link href={round.revealHref}>{round.revealLabel ?? 'Read the record'}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Scorecard                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The end of a session, round by round.
 *
 * Every round is listed with its answer and its citation, including the ones the
 * player got right — a session is a reading list as much as a score, and the
 * fastest route from "I did not know that" to "now I do" is the link at the end
 * of the row.
 */
export function Scorecard({
  review,
  playAgainHref,
}: {
  review: SessionReview
  playAgainHref: string
}) {
  const { session, rounds } = review
  const answered = rounds.length
  const accuracy = answered > 0 ? Math.round((session.correctCount / answered) * 100) : 0

  return (
    <div className="space-y-8">
      <div className="space-y-4 border-y border-rule py-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <Badge tone={session.status === GameSessionStatus.COMPLETED ? 'sage' : 'ochre'}>
            {SESSION_STATUS_LABELS[session.status]}
          </Badge>
          {session.scopeDate ? (
            <span className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
              as of {formatDate(session.scopeDate)}
            </span>
          ) : null}
          {session.scope ? (
            <span className="text-xs text-ink-muted">
              scoped to <EntityLink entity={session.scope} />
            </span>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <ScoreStat label="Score" value={String(session.score)} />
          <ScoreStat label="Correct" value={`${session.correctCount} / ${answered}`} />
          <ScoreStat label="Accuracy" value={`${accuracy}%`} />
          <ScoreStat
            label="Rounds answered"
            value={`${answered} / ${session.totalRounds}`}
            detail={
              answered < session.totalRounds ? 'Ended before the last round' : undefined
            }
          />
        </dl>
      </div>

      {answered === 0 ? (
        <p className="rounded-sm border border-dashed border-rule-strong bg-ground-sunk px-4 py-5 text-sm text-ink-muted">
          No round was answered in this session, so there is nothing to review.
        </p>
      ) : (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Every round</h2>
          <ul className="ruled">
            {rounds.map((round) => (
              <li key={round.challengeId} className="space-y-2 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-catalog tabular-nums text-ink-faint">
                    {String(round.ordinal).padStart(2, '0')}
                  </span>
                  <Badge tone={round.isCorrect ? 'sage' : 'accent'}>
                    {round.isCorrect ? 'correct' : 'wrong'}
                  </Badge>
                  <span className="font-mono text-catalog tabular-nums text-ink-faint">
                    {round.pointsAwarded >= 0 ? '+' : ''}
                    {round.pointsAwarded}
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-ink">{round.question}</p>

                <p className="text-sm text-ink-muted">
                  <span className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                    Answer
                  </span>{' '}
                  <span className="font-medium text-ink-strong">{round.correctAnswerText}</span>
                </p>

                {round.explanation ? (
                  <p className="max-w-prose text-xs leading-relaxed text-ink-faint">
                    {round.explanation}
                  </p>
                ) : null}

                {round.revealHref ? (
                  <Link
                    href={round.revealHref}
                    className="inline-block text-xs text-accent underline underline-offset-2"
                  >
                    {round.revealLabel ?? 'Read the record'}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2 border-t border-rule pt-6">
        <Button asChild variant="accent">
          <Link href={playAgainHref}>Play again</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/games">All games</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/me/mastery">Your mastery</Link>
        </Button>
      </div>
    </div>
  )
}

function ScoreStat({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="space-y-1">
      <dt className="font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted">
        {label}
      </dt>
      <dd className="font-display text-2xl leading-none tabular-nums text-ink-strong">{value}</dd>
      {detail ? <p className="text-xs text-ink-faint">{detail}</p> : null}
    </div>
  )
}
