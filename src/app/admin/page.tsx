import type { Metadata } from 'next'
import Link from 'next/link'

import { AdminFigure, AuditTrail, severityTone } from '@/components/admin/admin-chrome'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableNumber, TableRow } from '@/components/ui/table'
import { ISSUE_SEVERITY_LABELS } from '@/domain/labels'
import { IssueSeverity } from '@/generated/prisma/enums'
import { formatDate } from '@/lib/date'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminDashboard } from '@/server/queries/admin'

export const metadata: Metadata = {
  title: 'Dashboard',
}

/**
 * `/admin` — the dashboard (PRD §25).
 *
 * Health first, size second. The question a curator opens this with is "is
 * anything wrong", and the answer that matters most is whether a data problem is
 * currently stopping a game from generating — a thin question pool is invisible on
 * the public site and immediately visible to a player (§12, §16).
 *
 * Composition is a table of counts, not a chart. The useful reading is "we have
 * four events and two hundred members", which a sorted column says faster than a
 * bar would, and the numbers are the thing a curator acts on.
 */
export default async function AdminDashboardPage() {
  await requireAdmin()
  const { metrics, composition, edgeComposition, health, config, recentActivity } =
    await getAdminDashboard()

  const populated = composition.filter((row) => row.count > 0)
  const emptyTypes = composition.filter((row) => row.count === 0)
  const thinEdgeTypes = edgeComposition.filter((row) => row.count === 0)

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow="Curator tools"
        title="Dashboard"
        lead="The state of the archive as data, not as a score. Every figure here links to the screen where it can be changed."
        action={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/import">Bulk import</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/entities/new">New record</Link>
            </Button>
            <Button asChild variant="accent" size="sm">
              <Link href="/admin/relationships/new">New relationship</Link>
            </Button>
          </>
        }
      />

      {/* -------------------------------------------------------------- figures */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        {metrics.map((metric) => (
          <AdminFigure
            key={metric.label}
            label={metric.label}
            value={metric.value}
            href={metric.href}
            tone={metric.tone ?? 'default'}
          />
        ))}
      </div>

      {/* --------------------------------------------------------------- health */}
      <Section>
        <SectionHeading
          as="h2"
          eyebrow={
            health.lastRun
              ? `last scanned ${formatDate(health.lastRun.startedAt)}`
              : 'never scanned'
          }
          title="Data health"
          lead="Checks are re-run on demand rather than continuously. A scan writes issue rows and resolves the ones that no longer reproduce, so the list is always about the archive as it is now."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/data-health">Open data health</Link>
            </Button>
          }
        />

        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          {(
            [IssueSeverity.ERROR, IssueSeverity.WARNING, IssueSeverity.INFO] as IssueSeverity[]
          ).map((severity) => (
            <AdminFigure
              key={severity}
              label={`${ISSUE_SEVERITY_LABELS[severity]} issues`}
              value={health.totals[severity] ?? 0}
              href={`/admin/data-health?severity=${severity}`}
              tone={
                severity === IssueSeverity.ERROR && (health.totals[severity] ?? 0) > 0
                  ? 'critical'
                  : severity === IssueSeverity.WARNING && (health.totals[severity] ?? 0) > 0
                    ? 'warning'
                    : 'default'
              }
            />
          ))}
        </div>

        {health.blockingGames.length > 0 ? (
          <Panel>
            <PanelHeader>
              <PanelTitle>Currently blocking a game</PanelTitle>
            </PanelHeader>
            <PanelBody className="space-y-3">
              <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
                These checks can make a generator fail or produce a question with no defensible
                answer. Fixing one of them is worth more than adding a new record.
              </p>
              <ul className="ruled">
                {health.blockingGames.map((row) => (
                  <li
                    key={row.check.code}
                    className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex flex-wrap items-baseline gap-2 text-sm text-ink">
                        <Badge tone={severityTone(row.check.severity)}>
                          {ISSUE_SEVERITY_LABELS[row.check.severity]}
                        </Badge>
                        <span className="font-medium">{row.check.label}</span>
                      </p>
                      <p className="max-w-prose text-xs leading-relaxed text-ink-muted">
                        {row.check.rationale}
                      </p>
                    </div>
                    <Link
                      href={`/admin/data-health?check=${row.check.code}`}
                      className="font-mono text-xs tabular-nums text-accent underline underline-offset-2"
                    >
                      {row.count} open
                    </Link>
                  </li>
                ))}
              </ul>
            </PanelBody>
          </Panel>
        ) : (
          <p className="border-y border-rule py-4 text-sm leading-relaxed text-ink-muted">
            No open issue is currently blocking a game.{' '}
            {health.lastRun
              ? 'That is only as fresh as the last scan — re-run it after a batch of edits.'
              : 'No scan has been run yet, so this is an absence of evidence rather than a clean bill of health.'}
          </p>
        )}
      </Section>

      {/* ---------------------------------------------------------- composition */}
      <Section>
        <SectionHeading
          as="h2"
          eyebrow={`${populated.length} of ${composition.length} types in use`}
          title="What the archive holds"
          lead="Records by type, and relationships by vocabulary. A relationship type with no edges is a game that cannot be generated, which is why the empty ones are listed rather than hidden."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="eyebrow">Records by type</h3>
            {populated.length > 0 ? (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Type</TableHeader>
                    <TableHeader className="text-right">Records</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {populated.map((row) => (
                    <TableRow key={row.entityType}>
                      <TableCell>
                        <Link
                          href={`/admin/entities?type=${row.entityType}`}
                          className="text-ink underline decoration-rule-strong decoration-1 underline-offset-2 hover:text-accent hover:decoration-accent"
                        >
                          {row.label}
                        </Link>
                      </TableCell>
                      <TableNumber>{row.count}</TableNumber>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm leading-relaxed text-ink-muted">
                Nothing catalogued yet. Start with a generation, then its members — the graph reads
                better built outwards from a hub than one member at a time.
              </p>
            )}

            {emptyTypes.length > 0 ? (
              <p className="text-xs leading-relaxed text-ink-faint">
                Not yet used: {emptyTypes.map((row) => row.label).join(', ')}.
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <h3 className="eyebrow">Relationships by type</h3>
            {edgeComposition.length > 0 ? (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Vocabulary</TableHeader>
                    <TableHeader className="text-right">Edges</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {edgeComposition.map((row) => (
                    <TableRow key={row.code}>
                      <TableCell>
                        <Link
                          href={`/admin/relationships?code=${row.code}`}
                          className="text-ink underline decoration-rule-strong decoration-1 underline-offset-2 hover:text-accent hover:decoration-accent"
                        >
                          {row.name}
                        </Link>
                        <span className="ml-2 font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                          {row.code}
                        </span>
                      </TableCell>
                      <TableNumber className={row.count === 0 ? 'text-ochre' : undefined}>
                        {row.count}
                      </TableNumber>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm leading-relaxed text-ink-muted">
                No relationship types are defined. The vocabulary is seeded — if this is empty, the
                seed has not been run.
              </p>
            )}

            {thinEdgeTypes.length > 0 ? (
              <p className="text-xs leading-relaxed text-ink-faint">
                {thinEdgeTypes.length} type{thinEdgeTypes.length === 1 ? '' : 's'} with no edges at
                all. Any game that requires one of them cannot generate a round.
              </p>
            ) : null}
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- config + log */}
      <Section>
        <SectionHeading
          as="h2"
          eyebrow="Configuration"
          title="What is tunable without a deploy"
          lead="The vocabulary, the mastery bands, the scoring numbers and the games themselves are all rows. Editing them is a configuration change and is audited as one."
        />

        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <AdminFigure
            label="Relationship types"
            value={`${config.relationshipTypes.active}/${config.relationshipTypes.total}`}
            href="/admin/settings/relationship-types"
            detail="active of total"
          />
          <AdminFigure label="Sources" value={config.sources} href="/admin/sources" />
          <AdminFigure label="Eras" value={config.eras} href="/admin/settings/eras" />
          <AdminFigure
            label="Mastery bands"
            value={`${config.masteryStatuses.active}/${config.masteryStatuses.total}`}
            href="/admin/mastery"
            detail="active of total"
          />
          <AdminFigure
            label="Games"
            value={`${config.gameDefinitions.active}/${config.gameDefinitions.total}`}
            href="/admin/games"
            detail="active of total"
          />
          <AdminFigure
            label="Administrators"
            value={config.admins}
            href="/admin/settings/users"
            tone={config.admins <= 1 ? 'warning' : 'default'}
            detail={config.admins <= 1 ? 'only one' : undefined}
          />
        </div>
      </Section>

      <Section>
        <SectionHeading
          as="h2"
          eyebrow="Recent activity"
          title="The last dozen changes"
          lead="Append-only, and there is no delete path anywhere in the codebase. An audit trail a curator can edit answers no question worth asking of it."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/audit">Full log</Link>
            </Button>
          }
        />
        <AuditTrail
          entries={recentActivity}
          emptyBody="Nothing has been changed through the CMS yet. Seeded data is recorded against the system actor and appears here once the seed has run."
        />
      </Section>
    </PageShell>
  )
}
