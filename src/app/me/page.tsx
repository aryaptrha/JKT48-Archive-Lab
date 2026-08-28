import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/archive/empty-state'
import { MoreLink, PageShell, Section, SectionHeading } from '@/components/archive/section'
import { ScoreBar, Stat, StatRow } from '@/components/archive/stat'
import { SessionList } from '@/components/game/session-list'
import { BandLegend, StatusChip } from '@/components/mastery/mastery-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { humanizeEnum, USER_ROLE_LABELS } from '@/domain/labels'
import { UserRole } from '@/generated/prisma/enums'
import { requireUser } from '@/lib/auth/session'
import { getProfilePage, type PracticeSuggestion } from '@/server/queries/profile'

import { signOutAction } from '../login/actions'

export const metadata: Metadata = {
  title: 'Overview',
}

/**
 * `/me` (PRD §20, §8).
 *
 * The page answers three questions in order: how am I doing, what should I do
 * next, and what have I done. The order matters — a progress screen that opens
 * with a history list makes the reader do the summarising.
 *
 * Every figure here comes from `getProfilePage(userId)`, which takes an id and
 * never decides whose it is. This route makes that decision once, from a resolved
 * session, and passes it down. That is the whole of the authorization story for
 * this page, and keeping it in one visible line is deliberate (PRD §35).
 */
export default async function MePage() {
  const user = await requireUser()
  const page = await getProfilePage(user.id)

  if (!page) {
    // The profile row is created on first sight by `getCurrentProfile`, so this is
    // a genuine inconsistency rather than a new account.
    return (
      <PageShell className="max-w-[60rem]">
        <EmptyState
          title="Your profile could not be read"
          body="You are signed in, but the archive has no profile record for this account. Signing out and back in recreates it."
          action={
            <form action={signOutAction}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          }
        />
      </PageShell>
    )
  }

  const { profile, progress, mastery, bands, recentSessions, suggestions } = page
  const isCurator = profile.role === UserRole.ADMIN
  // `role` arrives as a string from the read model, so the label lookup is guarded
  // rather than cast: a role added to the schema before this map is updated should
  // print as prose, not as `undefined`.
  const roleLabel =
    profile.role in USER_ROLE_LABELS
      ? USER_ROLE_LABELS[profile.role as UserRole]
      : humanizeEnum(profile.role)

  return (
    <PageShell className="space-y-10">
      {/* -------------------------------------------------------------- header */}
      <SectionHeading
        as="h1"
        eyebrow={`Reader since ${profile.joinedLabel}`}
        title={profile.displayName ?? profile.email ?? 'Your account'}
        lead="Mastery is the point of the games, and this is where it accumulates. Nothing on this page is visible to anyone else."
        action={
          <>
            {isCurator ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin">Curator tools</Link>
              </Button>
            ) : null}
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge tone={isCurator ? 'accent' : 'quiet'}>
          {roleLabel}
        </Badge>
        {profile.email ? (
          <span className="font-mono text-catalog text-ink-faint">{profile.email}</span>
        ) : null}
      </div>

      {/* ------------------------------------------------------------- figures */}
      <Section>
        <StatRow>
          <Stat
            label="Overall mastery"
            value={progress.totalAttempts > 0 ? progress.overall : '—'}
            detail={progress.status ? progress.status.name : 'no band reached yet'}
          />
          <Stat
            label="Sessions completed"
            value={progress.sessionsCompleted}
            detail="finished, not abandoned"
            href="/me/history"
          />
          <Stat
            label="Answers correct"
            value={`${progress.answersCorrect} / ${progress.totalAttempts}`}
            detail="every round you have graded"
          />
          <Stat
            label="Dimensions practised"
            value={progress.practisedDimensions}
            detail="of members, history, teams, songs, relationships"
            href="/me/mastery"
          />
        </StatRow>

        <div className="space-y-2 border-t border-rule pt-4">
          <ScoreBar
            value={progress.totalAttempts > 0 ? progress.overall : 0}
            color={progress.status?.colorHex}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <BandLegend bands={bands} />
            <StatusChip status={progress.status} />
          </div>
        </div>
      </Section>

      {/* --------------------------------------------------------- what's next */}
      <Section>
        <SectionHeading
          as="h2"
          eyebrow="What to do next"
          title="Your weakest dimensions"
          lead="Taken from the dimensions you have attempted, not the ones you have skipped: a dimension with no answers has no score to improve, and calling it your weakness would be a guess dressed as a finding."
          action={<MoreLink href="/me/mastery">Full mastery</MoreLink>}
        />

        {suggestions.length === 0 ? (
          <EmptyState
            title="Nothing to recommend yet"
            body="Play a round and the archive can tell you which dimension is lagging. Until then any recommendation would be invented."
            action={
              <Button asChild variant="accent">
                <Link href="/games">Choose a game</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.slice(0, 6).map((suggestion) => (
              <SuggestionCard
                key={`${suggestion.scopeLabel}:${suggestion.dimension.dimension}`}
                suggestion={suggestion}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ------------------------------------------------------------- mastery */}
      {mastery.scopes.length > 0 ? (
        <Section>
          <SectionHeading
            as="h2"
            eyebrow={`${mastery.scopes.length} ${mastery.scopes.length === 1 ? 'scope' : 'scopes'}`}
            title="Mastery at a glance"
            lead="Per generation in V1, because a generation is the unit fans actually think in — and because a single global number cannot tell you that you know the members but not the songs (PRD §8.1)."
            action={<MoreLink href="/me/mastery">Break it down</MoreLink>}
          />
          <ul className="ruled">
            {mastery.scopes.map((scope) => (
              <li
                key={`${scope.scope}:${scope.target?.id ?? 'global'}`}
                className="grid gap-2 py-3.5 sm:grid-cols-[1fr_10rem_auto] sm:items-center sm:gap-5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {scope.target?.canonicalName ?? scope.scopeLabel}
                  </p>
                  <p className="font-mono text-catalog tabular-nums text-ink-faint">
                    {scope.attempts} {scope.attempts === 1 ? 'answer' : 'answers'}
                  </p>
                </div>
                <ScoreBar
                  value={scope.attempts > 0 ? scope.overall : 0}
                  color={scope.status?.colorHex}
                />
                <div className="flex items-baseline justify-between gap-4 sm:justify-end">
                  <StatusChip status={scope.status} />
                  <p className="font-display text-lg leading-none tabular-nums text-ink-strong">
                    {scope.attempts > 0 ? scope.overall : '—'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ------------------------------------------------------------- history */}
      <Section>
        <SectionHeading
          as="h2"
          eyebrow="Recently"
          title="Your last sessions"
          action={<MoreLink href="/me/history">Full history</MoreLink>}
        />
        <SessionList sessions={recentSessions} />
      </Section>
    </PageShell>
  )
}

/**
 * One recommendation.
 *
 * The link carries the scope entity rather than a game name. Which game trains
 * which dimension is a property of the seeded definitions (§6), so `/games`
 * resolves it — writing "relationships → Connect the Dots" here would hard-code
 * the mapping the PRD deliberately keeps in data.
 */
function SuggestionCard({ suggestion }: { suggestion: PracticeSuggestion }) {
  const { dimension } = suggestion

  return (
    <Panel className="flex flex-col">
      <PanelHeader className="items-start">
        <div className="min-w-0 space-y-1">
          <p className="eyebrow">{suggestion.scopeLabel}</p>
          <PanelTitle className="text-base">{dimension.label}</PanelTitle>
        </div>
        <p className="font-display text-2xl leading-none tabular-nums text-ink-strong">
          {dimension.attempts > 0 ? dimension.score : '—'}
        </p>
      </PanelHeader>

      <PanelBody className="flex-1 space-y-2.5">
        <ScoreBar
          value={dimension.attempts > 0 ? dimension.score : 0}
          color={dimension.status?.colorHex}
        />
        <p className="text-xs leading-relaxed text-ink-muted">{dimension.description}</p>
        <p className="font-mono text-catalog tabular-nums text-ink-faint">
          {dimension.correctCount} of {dimension.attempts} correct
        </p>
      </PanelBody>

      <PanelBody className="border-t border-rule">
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href={suggestion.href}>Practise this</Link>
        </Button>
      </PanelBody>
    </Panel>
  )
}
