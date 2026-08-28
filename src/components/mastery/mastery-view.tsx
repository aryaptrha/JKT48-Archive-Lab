import Link from 'next/link'

import { EntityLink } from '@/components/archive/record'
import { ScoreBar } from '@/components/archive/stat'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel'
import { formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { getMasteryBands } from '@/server/services/mastery'
import type {
  MasteryDimensionView,
  MasteryScopeView,
  MasteryStatusView,
} from '@/server/services/mastery'

/**
 * Mastery, rendered (PRD §8).
 *
 * One rule governs this whole file: **nothing here knows the name of a status.**
 * Bands are rows a curator edits — their names, their score ranges, their colours
 * and how many of them exist are all configuration (§8.3). So a band's colour
 * arrives as a hex string and is applied as an inline style, and a band's position
 * is never inferred from its name. Add a sixth band called anything at all and
 * these components render it without a change.
 *
 * The second commitment is that a dimension with no attempts is shown as
 * unattempted rather than as zero. "0" is a claim that someone tried and failed;
 * "—" is the truth, and it is what makes the difference between a gap and a
 * weakness visible on the page.
 */

export type MasteryBand = Awaited<ReturnType<typeof getMasteryBands>>[number]

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A band, as a swatch and a name.
 *
 * Not a `Badge`: the badge tones are design tokens chosen at build time, and a
 * band's colour is a value in the database. Reaching for the nearest token would
 * quietly override what a curator configured.
 */
export function StatusChip({
  status,
  className,
}: {
  status: MasteryStatusView | null
  className?: string
}) {
  if (!status) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint',
          className,
        )}
      >
        unranked
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-catalog uppercase tracking-[0.08em] text-ink',
        className,
      )}
      title={status.description ?? undefined}
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full border border-rule-strong"
        style={status.colorHex ? { backgroundColor: status.colorHex } : undefined}
      />
      {status.name}
    </span>
  )
}

/**
 * The configured bands, in order, as a legend.
 *
 * Worth the space because a score of 61 means nothing on its own. Reading the
 * ranges off the page is also the fastest way for a curator to notice that two
 * bands overlap or that a gap was left between them.
 */
export function BandLegend({ bands }: { bands: MasteryBand[] }) {
  if (bands.length === 0) {
    return (
      <p className="text-xs leading-relaxed text-ink-faint">
        No mastery bands are configured, so scores are shown as bare numbers. A curator can define
        them in the mastery settings.
      </p>
    )
  }

  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-2">
      {bands.map((band) => (
        <div key={band.slug} className="flex items-baseline gap-1.5">
          <dt className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full border border-rule-strong"
              style={band.colorHex ? { backgroundColor: band.colorHex } : undefined}
            />
            <span className="font-mono text-catalog uppercase tracking-[0.08em] text-ink">
              {band.name}
            </span>
          </dt>
          <dd className="font-mono text-catalog tabular-nums text-ink-faint">
            {band.minScore}–{band.maxScore}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* -------------------------------------------------------------------------- */
/* Dimensions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One dimension: score, band, bar, and what it was measured from.
 *
 * The attempt count sits next to the score on purpose. A score of 100 from two
 * attempts and a score of 100 from ninety are not the same claim about what
 * someone remembers, and hiding the denominator would let the page overstate the
 * first one.
 */
export function DimensionRow({
  dimension,
  className,
}: {
  dimension: MasteryDimensionView
  className?: string
}) {
  const attempted = dimension.attempts > 0

  return (
    <div className={cn('space-y-2 py-3.5', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-ink">{dimension.label}</p>
          <p className="text-xs leading-relaxed text-ink-faint">{dimension.description}</p>
        </div>
        <div className="flex shrink-0 items-baseline gap-3">
          <StatusChip status={dimension.status} />
          <p className="font-display text-xl leading-none tabular-nums text-ink-strong">
            {attempted ? dimension.score : '—'}
          </p>
        </div>
      </div>

      <ScoreBar value={attempted ? dimension.score : 0} color={dimension.status?.colorHex} />

      <p className="font-mono text-catalog tabular-nums text-ink-faint">
        {attempted ? (
          <>
            {dimension.correctCount} of {dimension.attempts} correct · {dimension.accuracy}% accuracy
            {dimension.lastPracticedAt ? ` · last ${formatDate(dimension.lastPracticedAt)}` : ''}
          </>
        ) : (
          'not practised yet'
        )}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Scope                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One scope — a generation in V1 — with its dimensions underneath.
 *
 * The overall figure is taken from the scope row rather than averaged here. The
 * weighted roll-up in §8.4 is the mastery service's business, and a second
 * implementation in a component would eventually disagree with it about the same
 * player.
 */
export function ScopeMastery({
  scope,
  practiseHref,
  className,
}: {
  scope: MasteryScopeView
  practiseHref?: string
  className?: string
}) {
  return (
    <Panel className={className}>
      <PanelHeader className="items-start">
        <div className="min-w-0 space-y-1">
          <p className="eyebrow">{scope.scopeLabel}</p>
          <h3 className="font-display text-lg font-semibold text-ink-strong">
            {scope.target ? <EntityLink entity={scope.target} /> : scope.scopeLabel}
          </h3>
        </div>
        <div className="shrink-0 space-y-1 text-right">
          <p className="font-display text-3xl leading-none tabular-nums text-ink-strong">
            {scope.attempts > 0 ? scope.overall : '—'}
          </p>
          <StatusChip status={scope.status} className="justify-end" />
        </div>
      </PanelHeader>

      <PanelBody className="space-y-3">
        <ScoreBar value={scope.attempts > 0 ? scope.overall : 0} color={scope.status?.colorHex} />
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-mono text-catalog tabular-nums text-ink-faint">
            {scope.attempts} {scope.attempts === 1 ? 'answer' : 'answers'} recorded
            {scope.lastPracticedAt ? ` · last ${formatDate(scope.lastPracticedAt)}` : ''}
          </p>
          {practiseHref ? (
            <Link
              href={practiseHref}
              className="font-mono text-catalog uppercase tracking-[0.09em] text-accent underline underline-offset-2"
            >
              practise this
            </Link>
          ) : null}
        </div>
      </PanelBody>

      <div className="ruled border-t border-rule px-4">
        {scope.dimensions.map((dimension) => (
          <DimensionRow key={dimension.dimension} dimension={dimension} />
        ))}
      </div>

      {scope.weakest ? (
        <div className="border-t border-rule bg-ground-sunk px-4 py-3">
          <p className="text-xs leading-relaxed text-ink-muted">
            <span className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
              Weakest
            </span>{' '}
            {scope.weakest.label} at {scope.weakest.score}. Chosen from the dimensions you have
            actually attempted — an untouched dimension has no score to improve.
          </p>
        </div>
      ) : null}
    </Panel>
  )
}
