import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The empty state.
 *
 * This archive ships with a small graph, so empty states are a normal condition
 * rather than an edge case, and the honest version of one distinguishes "nothing
 * matched your filter" from "nothing has been recorded yet". The second is a
 * request for curation, and the copy should say so (PRD §16).
 */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-2 rounded-sm border border-dashed border-rule-strong bg-ground-sunk px-5 py-8',
        className,
      )}
    >
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {body ? <p className="max-w-prose text-sm leading-relaxed text-ink-muted">{body}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}

/**
 * Shown when the graph cannot support a game at the requested rung.
 *
 * `InsufficientDataError` carries what was needed and what was found, and both
 * are shown: "not enough data" alone tells a curator nothing about what to add
 * next (PRD §16).
 */
export function InsufficientData({
  message,
  needed,
  found,
  hint,
}: {
  message: string
  needed?: number
  found?: number
  hint?: string
}) {
  return (
    <div className="space-y-3 rounded-sm border border-ochre/40 bg-ochre-soft px-5 py-4">
      <p className="font-display text-base font-semibold text-ink-strong">
        The archive is too thin for this round
      </p>
      <p className="text-sm leading-relaxed text-ink">{message}</p>
      {needed !== undefined && found !== undefined ? (
        <p className="font-mono text-xs tabular-nums text-ink-muted">
          needed {needed} · found {found}
        </p>
      ) : null}
      {hint ? <p className="text-sm leading-relaxed text-ink-muted">{hint}</p> : null}
      <p className="text-xs text-ink-muted">
        Try an easier rung, widen the scope, or{' '}
        <Link href="/explore" className="text-accent underline underline-offset-2">
          browse the archive
        </Link>{' '}
        instead.
      </p>
    </div>
  )
}
