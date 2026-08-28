import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/archive/empty-state'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { BandLegend, ScopeMastery } from '@/components/mastery/mastery-view'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/auth/session'
import { getMasteryPage } from '@/server/queries/profile'

export const metadata: Metadata = {
  title: 'Mastery',
}

/**
 * `/me/mastery` (PRD §8, §20).
 *
 * Mastery is per generation and broken into five dimensions — members, history,
 * teams, songs, relationships — because the useful finding is never "you are at
 * 64". It is "you know who was in Generation 2 but not what they sang", and a
 * single number cannot say that (§8.1, §8.2).
 *
 * The band names, ranges and colours on this page are all configuration. Nothing
 * in the rendering path matches a status name against a constant, so renaming a
 * band in the admin renames it here and nowhere else needs to know (§8.3).
 */
export default async function MasteryPage() {
  const user = await requireUser('/me/mastery')
  const { overview, bands, suggestions } = await getMasteryPage(user.id)

  const practised = overview.scopes.filter((scope) => scope.attempts > 0)
  const untouched = overview.scopes.filter((scope) => scope.attempts === 0)

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={
          overview.totalAttempts > 0
            ? `${overview.totalAttempts} graded ${overview.totalAttempts === 1 ? 'answer' : 'answers'}`
            : 'nothing graded yet'
        }
        title="Mastery"
        lead="Every answered round moves one dimension of one scope. The overall figure for a scope is a weighted roll-up of its dimensions, with the weights themselves configurable — so a curator can decide that relationships count for more than song titles without anyone editing code."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/games">Play a round</Link>
          </Button>
        }
      />

      {/* --------------------------------------------------------------- bands */}
      <section className="space-y-2 border-b border-rule pb-5">
        <h2 className="eyebrow">Bands as configured</h2>
        <BandLegend bands={bands} />
        <p className="max-w-prose text-xs leading-relaxed text-ink-faint">
          These come from the mastery settings, ranges included. There is no fixed ladder of names in
          the code, which is what lets the ladder change without a deployment.
        </p>
      </section>

      {/* -------------------------------------------------------------- scopes */}
      {overview.scopes.length === 0 ? (
        <EmptyState
          title="No mastery recorded yet"
          body="A scope appears here the first time you answer something inside it. Until then there is nothing to show and no score worth inventing."
          action={
            <Button asChild variant="accent">
              <Link href="/games">Choose a game</Link>
            </Button>
          }
        />
      ) : (
        <Section className="space-y-6">
          {practised.length > 0 ? (
            <div className="grid gap-5 xl:grid-cols-2">
              {practised.map((scope) => (
                <ScopeMastery
                  key={`${scope.scope}:${scope.target?.id ?? 'global'}`}
                  scope={scope}
                  practiseHref={scope.target ? `/games?scope=${scope.target.id}` : '/games'}
                />
              ))}
            </div>
          ) : null}

          {untouched.length > 0 ? (
            <div className="space-y-3 rounded-sm border border-dashed border-rule-strong bg-ground-sunk px-5 py-4">
              <h2 className="text-sm font-semibold text-ink">Not yet attempted</h2>
              <p className="max-w-prose text-xs leading-relaxed text-ink-muted">
                Listed separately rather than shown as zero. A scope you have never played is a gap,
                not a weakness, and scoring it 0 would be the archive putting words in your mouth.
              </p>
              <ul className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {untouched.map((scope) => (
                  <li key={`${scope.scope}:${scope.target?.id ?? 'global'}`}>
                    <Link
                      href={scope.target ? `/games?scope=${scope.target.id}` : '/games'}
                      className="text-sm text-ink underline decoration-rule-strong decoration-1 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent"
                    >
                      {scope.target?.canonicalName ?? scope.scopeLabel}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      )}

      {/* ---------------------------------------------------------- next steps */}
      {suggestions.length > 0 ? (
        <Section>
          <SectionHeading
            as="h2"
            eyebrow="Where the gaps are"
            title="Practise these next"
            lead="One suggestion per scope, drawn from its weakest attempted dimension."
          />
          <ul className="ruled">
            {suggestions.map((suggestion) => (
              <li
                key={`${suggestion.scopeLabel}:${suggestion.dimension.dimension}`}
                className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1.5 py-3.5"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{suggestion.dimension.label}</span> in{' '}
                    {suggestion.scopeLabel}
                  </p>
                  <p className="font-mono text-catalog tabular-nums text-ink-faint">
                    score {suggestion.dimension.score} · {suggestion.dimension.correctCount} of{' '}
                    {suggestion.dimension.attempts} correct
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={suggestion.href}>Practise</Link>
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* --------------------------------------------------------------- notes */}
      <section className="grid gap-x-8 gap-y-5 border-t border-rule pt-6 sm:grid-cols-3">
        <Note
          title="How a score moves"
          body="Each graded answer nudges the dimension it belongs to, and the scope's overall figure is recomputed from its dimensions by the configured weights."
        />
        <Note
          title="Why the denominator is shown"
          body="A score of 100 from two answers and a score of 100 from ninety are different claims. The attempt count is printed next to every figure so the page cannot overstate the first one."
        />
        <Note
          title="Scopes in V1"
          body="Generation-level, as the PRD specifies. Member, team, song and era scopes exist in the schema and are the natural next step once generations feel solid."
        />
      </section>
    </PageShell>
  )
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="text-xs leading-relaxed text-ink-muted">{body}</p>
    </div>
  )
}
