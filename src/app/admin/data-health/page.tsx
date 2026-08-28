import type { Metadata } from 'next'
import Link from 'next/link'

import { runScanAction, setIssueStatusAction } from './actions'

import { FormBanner, severityTone } from '@/components/admin/admin-chrome'
import { EmptyState } from '@/components/archive/empty-state'
import { Pagination } from '@/components/archive/pagination'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { Panel, PanelBody } from '@/components/ui/panel'
import { CHECK_DEFINITIONS } from '@/domain/data-health'
import { entityTypeLabel } from '@/domain/entity-taxonomy'
import { ISSUE_SEVERITY_LABELS, ISSUE_STATUS_LABELS } from '@/domain/labels'
import { IssueSeverity, IssueStatus } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { formatDate } from '@/lib/date'
import { getHealthIssues, getHealthReport } from '@/server/services/data-health'

import type { HealthCheckSummary, HealthIssueView } from '@/server/services/data-health'

export const metadata: Metadata = {
  title: 'Data health',
}

/**
 * `/admin/data-health` — the full report behind the dashboard's health panel
 * (PRD §16, §25).
 *
 * A check here is a report on where the archive is thin, not a rule the
 * archive failed. The copy throughout says what a check looks for and, where
 * `affectsGameQuality` is true, what actually breaks for a player if it stays
 * open — that is the reason to fix those first (§12), not because a red badge
 * is embarrassing.
 *
 * `severity`, `check`, `status` and `page` are the query params the dashboard
 * already links here with (`?severity=` from the totals, `?check=` from the
 * blocking-checks list), so their names are fixed by that contract rather than
 * chosen fresh here.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const SEVERITY_VALUES = Object.values(IssueSeverity)
const STATUS_VALUES = Object.values(IssueStatus)

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseSeverity(value: string | undefined): IssueSeverity | undefined {
  return value && (SEVERITY_VALUES as string[]).includes(value) ? (value as IssueSeverity) : undefined
}

function parseStatus(value: string | undefined): IssueStatus | undefined {
  return value && (STATUS_VALUES as string[]).includes(value) ? (value as IssueStatus) : undefined
}

/**
 * All fourteen checks, blocking ones first.
 *
 * `getHealthReport` already sorts by severity then open count, which is the
 * right order *within* the two groups — this only partitions blocking from
 * non-blocking on top of that, and `Array.prototype.sort` is stable, so the
 * severity/count order survives inside each half.
 */
function withBlockingFirst(checks: HealthCheckSummary[]): HealthCheckSummary[] {
  return [...checks].sort(
    (a, b) => Number(b.check.affectsGameQuality) - Number(a.check.affectsGameQuality),
  )
}

/** Hidden inputs that carry the current filter through a mutation and back. */
function FilterCarry({
  severity,
  check,
  status,
  page,
}: {
  severity?: string
  check?: string
  status?: string
  page?: string
}) {
  return (
    <>
      {severity ? <input type="hidden" name="filterSeverity" value={severity} /> : null}
      {check ? <input type="hidden" name="filterCheck" value={check} /> : null}
      {status ? <input type="hidden" name="filterStatus" value={status} /> : null}
      {page ? <input type="hidden" name="filterPage" value={page} /> : null}
    </>
  )
}

function IssueSubject({ issue }: { issue: HealthIssueView }) {
  if (issue.entity) {
    return (
      <p className="text-sm text-ink">
        <span className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
          {entityTypeLabel(issue.entity.entityType)}
        </span>{' '}
        {issue.entity.canonicalName}
      </p>
    )
  }

  if (issue.relationship) {
    return (
      <p className="text-sm text-ink">
        {issue.relationship.from.canonicalName}{' '}
        <span className="text-ink-faint">— {issue.relationship.label} —</span>{' '}
        {issue.relationship.to.canonicalName}{' '}
        <span className="font-mono text-xs tabular-nums text-ink-faint">
          ({issue.relationship.window})
        </span>
      </p>
    )
  }

  return null
}

/** One issue: what was found, why it matters, and the two decisions available. */
function IssueRow({
  issue,
  filters,
}: {
  issue: HealthIssueView
  filters: { severity?: string; check?: string; status?: string; page?: string }
}) {
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-baseline gap-2">
            <Badge tone={severityTone(issue.severity)}>{ISSUE_SEVERITY_LABELS[issue.severity]}</Badge>
            <span className="font-medium text-ink">{issue.check?.label ?? issue.checkCode}</span>
            {issue.status !== IssueStatus.OPEN ? (
              <Badge tone="neutral">{ISSUE_STATUS_LABELS[issue.status]}</Badge>
            ) : null}
          </p>
          <p className="max-w-prose text-sm leading-relaxed text-ink">{issue.message}</p>
          {issue.check ? (
            <p className="max-w-prose text-xs leading-relaxed text-ink-muted">
              Why this matters: {issue.check.rationale}
            </p>
          ) : null}
          <IssueSubject issue={issue} />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
          <time className="font-mono text-catalog tabular-nums text-ink-faint">
            {formatDate(issue.detectedAt)}
          </time>
          {issue.fixHref ? (
            <Link
              href={issue.fixHref}
              className="font-mono text-xs uppercase tracking-[0.08em] text-accent underline underline-offset-2"
            >
              Fix this record →
            </Link>
          ) : null}
        </div>
      </div>

      <form action={setIssueStatusAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="issueId" value={issue.id} />
        <FilterCarry {...filters} />
        <div className="min-w-48 flex-1 space-y-1">
          <label
            htmlFor={`reason-${issue.id}`}
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-faint"
          >
            Reason (optional)
          </label>
          <Input
            id={`reason-${issue.id}`}
            name="reason"
            placeholder="e.g. this member genuinely predates team assignments"
          />
        </div>
        {issue.status !== IssueStatus.RESOLVED ? (
          <Button type="submit" name="status" value={IssueStatus.RESOLVED} variant="outline" size="sm">
            Resolve
          </Button>
        ) : null}
        {issue.status !== IssueStatus.IGNORED ? (
          <Button type="submit" name="status" value={IssueStatus.IGNORED} variant="ghost" size="sm">
            Ignore
          </Button>
        ) : null}
        {issue.status !== IssueStatus.OPEN ? (
          <Button type="submit" name="status" value={IssueStatus.OPEN} variant="ghost" size="sm">
            Reopen
          </Button>
        ) : null}
      </form>
    </li>
  )
}

export default async function DataHealthPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams

  const severityFilter = parseSeverity(first(query.severity))
  const checkFilter = first(query.check)
  const statusFilter = parseStatus(first(query.status))
  const pageParam = first(query.page)
  const pageNumber = Number.parseInt(pageParam ?? '1', 10)

  const [report, issues] = await Promise.all([
    getHealthReport(),
    getHealthIssues({
      status: statusFilter,
      checkCode: checkFilter,
      page: Number.isFinite(pageNumber) ? pageNumber : 1,
    }),
  ])

  // getHealthIssues filters by status and checkCode at the database, but has no
  // severity column in its where-clause — severity lives on the issue row but
  // is not indexed for this query, and adding it would widen a service this
  // page only reads from. So severity is filtered here, on the page already
  // returned. That means `issues.total` / `issues.pageCount` describe the
  // status+check filter only: a severity filter can make a page show fewer
  // rows than its own pagination implies, which is an honest trade against
  // adding a query parameter for one admin screen.
  const visibleIssues = severityFilter
    ? issues.items.filter((issue) => issue.severity === severityFilter)
    : issues.items

  const carried = new URLSearchParams()
  if (severityFilter) carried.set('severity', severityFilter)
  if (checkFilter) carried.set('check', checkFilter)
  if (statusFilter) carried.set('status', statusFilter)

  const filters = {
    severity: severityFilter,
    check: checkFilter,
    status: statusFilter,
    page: pageParam,
  }

  const orderedChecks = withBlockingFirst(report.checks)

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={report.lastRun ? `last scanned ${formatDate(report.lastRun.startedAt)}` : 'never scanned'}
        title="Data health"
        lead="Fourteen checks report where the archive is thin, not rules it broke. Each one names what a curator can add or fix — the archive gets better by acting on the list, not by treating it as blame."
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* --------------------------------------------------------- last run */}
      <Section>
        <SectionHeading
          as="h2"
          eyebrow="On demand, not continuous"
          title="Last run"
          lead="A scan writes issue rows and resolves the ones that no longer reproduce, so this list is only ever as fresh as the last time it ran."
        />

        {report.lastRun ? (
          <Panel>
            <PanelBody className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
              <dl className="flex flex-wrap gap-x-8 gap-y-2">
                <div>
                  <dt className="eyebrow">Started</dt>
                  <dd className="font-mono text-sm tabular-nums text-ink">
                    {formatDate(report.lastRun.startedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Finished</dt>
                  <dd className="font-mono text-sm tabular-nums text-ink">
                    {report.lastRun.finishedAt ? formatDate(report.lastRun.finishedAt) : 'In progress'}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Issues found</dt>
                  <dd className="font-mono text-sm tabular-nums text-ink">
                    {report.lastRun.issuesFound}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Triggered by</dt>
                  <dd className="text-sm text-ink">{report.lastRun.triggeredBy ?? 'system'}</dd>
                </div>
              </dl>

              <form action={runScanAction}>
                <FilterCarry {...filters} />
                <Button type="submit" variant="accent">
                  Run the checks now
                </Button>
              </form>
            </PanelBody>
          </Panel>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 border-y border-rule py-4">
            <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
              No scan has ever been run. That is an absence of evidence, not a clean bill of
              health — the checks below have simply never looked at this archive.
            </p>
            <form action={runScanAction}>
              <FilterCarry {...filters} />
              <Button type="submit" variant="accent">
                Run the checks now
              </Button>
            </form>
          </div>
        )}

        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          {(
            [IssueSeverity.ERROR, IssueSeverity.WARNING, IssueSeverity.INFO] as IssueSeverity[]
          ).map((severity) => (
            <Link
              key={severity}
              href={`/admin/data-health?severity=${severity}`}
              className="group space-y-1"
            >
              <p className="eyebrow group-hover:text-accent">{ISSUE_SEVERITY_LABELS[severity]} issues</p>
              <p className="font-display text-2xl font-semibold tabular-nums text-ink-strong group-hover:text-accent">
                {report.totals[severity] ?? 0}
              </p>
            </Link>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------- per-check */}
      <Section>
        <SectionHeading
          as="h2"
          eyebrow={`${orderedChecks.filter((row) => row.check.affectsGameQuality).length} of ${orderedChecks.length} checks can block a game`}
          title="Every check, blocking ones first"
          lead="A check that affects game quality is listed first and says what breaks for a player — fixing one of those is worth more than adding a new record (PRD §12)."
        />

        <ul className="ruled">
          {orderedChecks.map((row) => (
            <li
              key={row.check.code}
              className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="flex flex-wrap items-baseline gap-2 text-sm text-ink">
                  <Badge tone={severityTone(row.check.severity)}>
                    {ISSUE_SEVERITY_LABELS[row.check.severity]}
                  </Badge>
                  {row.check.affectsGameQuality ? <Badge tone="accent">Blocks a game</Badge> : null}
                  <span className="font-medium">{row.check.label}</span>
                </p>
                <p className="max-w-prose text-xs leading-relaxed text-ink-muted">
                  {row.check.rationale}
                </p>
              </div>
              <Link
                href={`/admin/data-health?check=${row.check.code}`}
                className={
                  row.count > 0
                    ? 'font-mono text-xs tabular-nums text-accent underline underline-offset-2'
                    : 'font-mono text-xs tabular-nums text-ink-faint'
                }
              >
                {row.count} open
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------- issues */}
      <Section>
        <SectionHeading
          as="h2"
          eyebrow={`${issues.total} matching ${statusFilter ? ISSUE_STATUS_LABELS[statusFilter].toLowerCase() : 'open'} issue${issues.total === 1 ? '' : 's'}`}
          title="Issue list"
          lead="Filtered by the query string, so a filtered view is a link a colleague can open to the same list."
        />

        <form
          method="get"
          action="/admin/data-health"
          className="flex flex-wrap items-end gap-3 border-b border-rule pb-5"
        >
          <div className="space-y-1.5">
            <label htmlFor="severity" className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted">
              Severity
            </label>
            <Select id="severity" name="severity" defaultValue={severityFilter ?? ''} className="w-36">
              <option value="">All severities</option>
              {SEVERITY_VALUES.map((value) => (
                <option key={value} value={value}>
                  {ISSUE_SEVERITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="check" className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted">
              Check
            </label>
            <Select id="check" name="check" defaultValue={checkFilter ?? ''} className="w-64">
              <option value="">All checks</option>
              {Object.values(CHECK_DEFINITIONS).map((check) => (
                <option key={check.code} value={check.code}>
                  {check.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="status" className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted">
              Status
            </label>
            <Select id="status" name="status" defaultValue={statusFilter ?? IssueStatus.OPEN} className="w-36">
              {STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {ISSUE_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>

        {visibleIssues.length === 0 ? (
          issues.total === 0 ? (
            report.lastRun ? (
              <EmptyState
                title="No matching issues"
                body="Either nothing was found for this filter, or the last scan found nothing at all — try widening the filter or running the checks again."
              />
            ) : (
              <EmptyState
                title="No scan has been run yet"
                body="This is an absence of evidence rather than a clean bill of health. Run the checks above to find out where the archive is actually thin."
              />
            )
          ) : (
            <EmptyState
              title="Nothing on this page matches the severity filter"
              body="This page of results exists for the status and check filter chosen, but none of its rows are the severity selected — try another page or clear the severity filter."
            />
          )
        ) : (
          <ul className="ruled">
            {visibleIssues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} filters={filters} />
            ))}
          </ul>
        )}

        <Pagination page={issues} params={carried} basePath="/admin/data-health" />
      </Section>
    </PageShell>
  )
}
