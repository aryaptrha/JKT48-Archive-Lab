import type { Metadata } from 'next'
import Link from 'next/link'

import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Stat, StatRow } from '@/components/archive/stat'
import { SessionList } from '@/components/game/session-list'
import { Button } from '@/components/ui/button'
import { GameSessionStatus } from '@/generated/prisma/enums'
import { requireUser } from '@/lib/auth/session'
import { getGameHistoryPage } from '@/server/queries/profile'

export const metadata: Metadata = {
  title: 'Game history',
}

const PAGE_LIMIT = 50

/**
 * `/me/history` (PRD §20).
 *
 * The log, capped at the most recent fifty rather than paginated. In V1 the list
 * answers "what have I played lately"; a session from four hundred games ago is a
 * question nobody has asked yet, and the repository takes a limit the day they do.
 *
 * Unfinished sessions are surfaced first, because a session left open is the one
 * thing on this page that is still actionable. Abandoned ones stay in the record
 * below: the archive does not tidy away the reader's own history to flatter them.
 */
export default async function GameHistoryPage() {
  const user = await requireUser('/me/history')
  const { sessions, stats } = await getGameHistoryPage(user.id, PAGE_LIMIT)

  const open = sessions.filter((session) => session.status === GameSessionStatus.IN_PROGRESS)
  const closed = sessions.filter((session) => session.status !== GameSessionStatus.IN_PROGRESS)
  const abandoned = closed.filter(
    (session) => session.status === GameSessionStatus.ABANDONED,
  ).length

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={`${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'} on record`}
        title="Game history"
        lead="Every session with the rung it was played at and what that rung asked of you. There are no times recorded anywhere on this page — difficulty here is how much thinking a question needs, never how fast it was answered."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/games">Play again</Link>
          </Button>
        }
      />

      <StatRow>
        <Stat label="Completed" value={stats.sessionsCompleted} detail="played to the last round" />
        <Stat label="Answers correct" value={stats.answersCorrect} detail="across all sessions" />
        <Stat label="Abandoned" value={abandoned} detail="closed before the last round" />
        <Stat
          label="Still open"
          value={open.length}
          detail={open.length > 0 ? 'resumable below' : 'nothing left hanging'}
        />
      </StatRow>

      {open.length > 0 ? (
        <Section>
          <SectionHeading
            as="h2"
            eyebrow="Unfinished"
            title="Pick up where you left off"
            lead="A session stays open until you finish or abandon it, and its URL keeps working. Nothing expires."
          />
          <SessionList sessions={open} />
        </Section>
      ) : null}

      <Section>
        <SectionHeading
          as="h2"
          eyebrow={sessions.length >= PAGE_LIMIT ? `most recent ${PAGE_LIMIT}` : 'all of it'}
          title="The record"
        />
        <SessionList
          sessions={closed}
          emptyTitle="No finished sessions yet"
          emptyBody="Completed and abandoned sessions both land here. Anything still in progress is listed above."
        />
      </Section>

      {sessions.length >= PAGE_LIMIT ? (
        <p className="border-t border-rule pt-5 text-xs leading-relaxed text-ink-faint">
          Showing the most recent {PAGE_LIMIT} sessions. Older ones are still recorded — V1 simply
          does not paginate this list yet.
        </p>
      ) : null}
    </PageShell>
  )
}
