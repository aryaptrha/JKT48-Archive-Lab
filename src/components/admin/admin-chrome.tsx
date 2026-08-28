import Link from 'next/link'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { AUDIT_ACTION_LABELS, humanizeEnum } from '@/domain/labels'
import { AuditAction, IssueSeverity } from '@/generated/prisma/enums'
import { formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { AuditEntryView } from '@/server/services/audit'

/**
 * Shared furniture for the CMS (PRD §19, §25).
 *
 * Three things every admin screen needs and none of them should reinvent: the
 * result banner a Server Action redirects back into, the change history panel,
 * and the confirmation wrapper for a destructive submit.
 *
 * The banner reads its text from the query string because that is where a Server
 * Action can put it after `redirect()` — an action cannot return a value to a page
 * it navigated away from. Keeping the message in the URL also means a failed save
 * survives a reload and can be linked to a colleague. It is the right shape for
 * every short submit in the CMS; the two long editors return their errors in place
 * instead, for the reason set out in `lib/form-state.ts`.
 *
 * Nothing here decides what a curator may do. Authorization happens in the layout
 * and again in every action; this file only renders the outcome.
 */

/* -------------------------------------------------------------------------- */
/* Result banners                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The outcome of the last mutation, as `?error=` / `?notice=`.
 *
 * Both are announced — the failure as an alert, the success as a status — so a
 * screen reader is told a save happened without the reader having to go looking
 * for a green line they cannot see.
 */
export function FormBanner({
  error,
  notice,
  className,
}: {
  error?: string | undefined
  notice?: string | undefined
  className?: string
}) {
  if (!error && !notice) return null

  return (
    <div className={cn('space-y-2', className)}>
      {error ? (
        <p
          role="alert"
          className="border-l-2 border-accent bg-accent-soft px-4 py-2.5 text-sm leading-relaxed text-ink"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="border-l-2 border-sage bg-sage-soft px-4 py-2.5 text-sm leading-relaxed text-ink"
        >
          {notice}
        </p>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Change history                                                             */
/* -------------------------------------------------------------------------- */

const ACTION_TONE: Record<AuditAction, 'sage' | 'indigo' | 'accent' | 'ochre' | 'neutral'> = {
  [AuditAction.CREATE]: 'sage',
  [AuditAction.UPDATE]: 'indigo',
  [AuditAction.DELETE]: 'accent',
  [AuditAction.RESTORE]: 'sage',
  [AuditAction.BULK_IMPORT]: 'ochre',
  [AuditAction.CONFIG_CHANGE]: 'ochre',
  [AuditAction.DATA_HEALTH_RUN]: 'neutral',
}

export function actionTone(action: AuditAction) {
  return ACTION_TONE[action] ?? 'neutral'
}

export function actionLabel(action: AuditAction): string {
  return action in AUDIT_ACTION_LABELS ? AUDIT_ACTION_LABELS[action] : humanizeEnum(action)
}

/**
 * One audit entry with its field-level diff.
 *
 * The diff is shown as `before → after` per field rather than as two JSON blobs.
 * "Who changed what" is the question an audit log exists to answer, and a reader
 * should not have to diff two objects in their head to get it (PRD §17).
 */
export function AuditEntry({ entry, className }: { entry: AuditEntryView; className?: string }) {
  return (
    <li className={cn('space-y-1.5 py-3.5', className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Badge tone={actionTone(entry.action)}>{actionLabel(entry.action)}</Badge>
        <p className="min-w-0 flex-1 text-sm leading-snug text-ink">{entry.summary}</p>
        <time className="font-mono text-catalog tabular-nums text-ink-faint">
          {formatDate(entry.createdAt)}
        </time>
      </div>

      <p className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
        {entry.actorEmail ?? 'system'} · {entry.entityType}
      </p>

      {entry.changes.length > 0 ? (
        <ul className="space-y-0.5 pt-1">
          {entry.changes.map((change) => (
            <li key={change.field} className="font-mono text-xs leading-relaxed text-ink-muted">
              <span className="text-ink-faint">{change.field}</span>{' '}
              <span className="line-through decoration-rule-strong">{change.before ?? '—'}</span>{' '}
              <span aria-hidden>→</span> <span className="text-ink">{change.after ?? '—'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function AuditTrail({
  entries,
  emptyBody = 'Nothing recorded against this record yet. The log starts at its first edit through the CMS.',
  className,
}: {
  entries: AuditEntryView[]
  emptyBody?: string
  className?: string
}) {
  if (entries.length === 0) {
    return <p className={cn('text-xs leading-relaxed text-ink-faint', className)}>{emptyBody}</p>
  }

  return (
    <ul className={cn('ruled', className)}>
      {entries.map((entry) => (
        <AuditEntry key={entry.id} entry={entry} />
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/* Destructive actions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A delete, gated behind a checkbox the operator has to tick.
 *
 * The checkbox is `required`, so the browser refuses the submit until it is
 * ticked — a real confirmation that needs no JavaScript and no dialog. A
 * `window.confirm` would be neither: it is skippable, unstyled, and gone the
 * moment scripting is off.
 *
 * `consequence` states what will actually be lost, in numbers where there are
 * any. "Are you sure?" is not a warning; "this also deletes 14 relationships"
 * is (PRD §35).
 */
export function DangerZone({
  title,
  consequence,
  confirmLabel,
  confirmId,
  children,
  className,
}: {
  title: string
  consequence: ReactNode
  confirmLabel: string
  confirmId: string
  /** The form, including its submit button. */
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn('space-y-3 rounded-sm border border-accent/40 bg-accent-soft px-5 py-4', className)}
    >
      <h2 className="font-display text-base font-semibold text-ink-strong">{title}</h2>
      <div className="max-w-prose space-y-1.5 text-sm leading-relaxed text-ink">{consequence}</div>
      <div className="space-y-3 pt-1">
        {children}
        <p className="sr-only" id={`${confirmId}-hint`}>
          {confirmLabel}
        </p>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

/** Draft / published, the only entity state a curator sets by hand. */
export function PublishBadge({ isPublished }: { isPublished: boolean }) {
  return isPublished ? (
    <Badge tone="sage">Published</Badge>
  ) : (
    <Badge tone="ochre">Draft</Badge>
  )
}

const SEVERITY_TONE: Record<IssueSeverity, 'accent' | 'ochre' | 'indigo'> = {
  [IssueSeverity.ERROR]: 'accent',
  [IssueSeverity.WARNING]: 'ochre',
  [IssueSeverity.INFO]: 'indigo',
}

export function severityTone(severity: IssueSeverity) {
  return SEVERITY_TONE[severity] ?? 'indigo'
}

/**
 * A labelled count that links where the count can be acted on.
 *
 * Deliberately not a card: the CMS dashboard is a status line, and eight bordered
 * boxes in a grid is the generic-admin look the PRD rules out (§P5).
 */
export function AdminFigure({
  label,
  value,
  href,
  tone = 'default',
  detail,
}: {
  label: string
  value: number | string
  href?: string
  tone?: 'default' | 'warning' | 'critical'
  detail?: string
}) {
  const valueClass = cn(
    'font-display text-2xl font-semibold tabular-nums',
    tone === 'critical' ? 'text-accent' : tone === 'warning' ? 'text-ochre' : 'text-ink-strong',
  )

  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className={valueClass}>{value}</p>
      {detail ? <p className="text-xs text-ink-faint">{detail}</p> : null}
    </>
  )

  if (!href) return <div className="space-y-1">{body}</div>

  return (
    <Link
      href={href}
      className="group space-y-1 transition-colors [&_p:first-child]:group-hover:text-accent"
    >
      {body}
    </Link>
  )
}

/** A description-list row, for the read-only facts beside a form. */
export function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="font-mono text-catalog uppercase tracking-[0.09em] text-ink-faint">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  )
}
