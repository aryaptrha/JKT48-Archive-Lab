import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Figures.
 *
 * Deliberately not "KPI cards": no icon in a tinted circle, no arrow, no
 * percentage-change chip. A number in an archive is a count of records, and the
 * display serif at a large size does the emphasis that a coloured badge would do
 * badly.
 */

export type StatProps = {
  label: string
  value: ReactNode
  detail?: ReactNode
  href?: string
  className?: string
}

export function Stat({ label, value, detail, href, className }: StatProps) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className="font-display text-3xl font-semibold tabular-nums text-ink-strong">{value}</p>
      {detail ? <p className="text-xs text-ink-faint">{detail}</p> : null}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          'block space-y-1 transition-colors hover:[&_p:nth-child(2)]:text-accent',
          className,
        )}
      >
        {body}
      </Link>
    )
  }

  return <div className={cn('space-y-1', className)}>{body}</div>
}

/**
 * A row of figures separated by vertical rules.
 *
 * Rules rather than gaps, because four numbers floating in whitespace read as
 * four unrelated facts.
 */
export function StatRow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4',
        '[&>*+*]:sm:border-l [&>*+*]:sm:border-rule [&>*+*]:sm:pl-6',
        className,
      )}
    >
      {children}
    </dl>
  )
}

/**
 * A labelled value in a definition list — the entity page's attribute table.
 *
 * Two columns on wide screens so labels form a scannable left edge, stacked on
 * narrow ones where a 30% label column leaves no room for the value.
 */
export function DataRow({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4',
        className,
      )}
    >
      <dt className="eyebrow pt-0.5">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  )
}

export function DataList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <dl className={cn('ruled', className)}>{children}</dl>
}

/**
 * A horizontal score bar.
 *
 * The colour is passed in by the caller from configured band data — this
 * component never maps a score or a status name to a colour, because the bands
 * are admin-editable and their names must not be hard-coded (PRD §8.3).
 */
export function ScoreBar({
  value,
  max = 100,
  tone = 'ink',
  color,
  className,
}: {
  value: number
  max?: number
  tone?: 'ink' | 'accent' | 'sage' | 'ochre' | 'indigo'
  /**
   * A colour from a configured mastery band, which wins over `tone`.
   *
   * It has to be an inline style rather than a class: the bands are rows a curator
   * edits, so the set of possible colours is not known when Tailwind compiles.
   */
  color?: string | null
  className?: string
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))
  const fill = {
    ink: 'bg-ink-strong',
    accent: 'bg-accent',
    sage: 'bg-sage',
    ochre: 'bg-ochre',
    indigo: 'bg-indigo',
  }[tone]

  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-xs bg-ground-sunk', className)}
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn(
          'h-full transition-[width] duration-(--duration-slow) ease-(--ease-editorial)',
          color ? undefined : fill,
        )}
        style={color ? { width: `${pct}%`, backgroundColor: color } : { width: `${pct}%` }}
      />
    </div>
  )
}
