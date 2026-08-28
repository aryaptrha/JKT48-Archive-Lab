import type { Metadata } from 'next'
import Link from 'next/link'

import { AuditTrail, FormBanner } from '@/components/admin/admin-chrome'
import { EmptyState } from '@/components/archive/empty-state'
import { Pagination } from '@/components/archive/pagination'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { AUDIT_ACTION_LABELS } from '@/domain/labels'
import { AuditAction, EntityType } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { getAuditPage } from '@/server/queries/admin'

export const metadata: Metadata = {
  title: 'Audit log',
}

/**
 * `/admin/audit` (PRD §17, §35).
 *
 * Read-only append-only log of all administrative and system mutations across the archive.
 * There is no delete, edit or prune action: a log that curators could alter answers no
 * question worth asking of it.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const AUDIT_ACTIONS = Object.values(AuditAction)
const ENTITY_TYPES = Object.values(EntityType)

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams

  const entityType = first(query.entityType)?.trim() || undefined
  const action = first(query.action)?.trim() || undefined
  const pageParam = first(query.page)
  const pageNumber = Number.parseInt(pageParam ?? '1', 10)

  const page = await getAuditPage({
    page: Number.isFinite(pageNumber) ? pageNumber : 1,
    entityType,
    action,
  })

  const carried = new URLSearchParams()
  if (entityType) carried.set('entityType', entityType)
  if (action) carried.set('action', action)

  const isFiltered = Boolean(entityType || action)

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow={`${page.entries.total.toLocaleString()} logged operations`}
        title="Audit log"
        lead="An append-only historical record of all administrative changes and system runs (§17, §35). Every write records its actor, field diffs and timestamp."
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* ------------------------------------------------------------- filters */}
      <form
        method="GET"
        action="/admin/audit"
        className="flex flex-wrap items-end gap-3 rounded-sm border border-rule bg-surface p-4"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="audit-action"
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            Mutation action
          </label>
          <Select
            id="audit-action"
            name="action"
            defaultValue={action ?? ''}
            className="w-full sm:w-52"
          >
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((act) => (
              <option key={act} value={act}>
                {AUDIT_ACTION_LABELS[act] ?? act}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="audit-entity-type"
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            Target entity / domain
          </label>
          <Select
            id="audit-entity-type"
            name="entityType"
            defaultValue={entityType ?? ''}
            className="w-full sm:w-52"
          >
            <option value="">All domains</option>
            <optgroup label="Entities">
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </optgroup>
            <optgroup label="Configuration & System">
              <option value="Relationship">Relationship</option>
              <option value="RelationshipType">Relationship Type</option>
              <option value="Source">Source</option>
              <option value="MasteryStatus">Mastery Status</option>
              <option value="DimensionWeight">Dimension Weight</option>
              <option value="GameDefinition">Game Definition</option>
              <option value="Era">Era</option>
              <option value="Setting">Setting</option>
              <option value="UserRole">User Role</option>
              <option value="DataHealthRun">Data Health Run</option>
            </optgroup>
          </Select>
        </div>

        <Button type="submit" variant="outline" size="sm">
          Filter log
        </Button>

        {isFiltered ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/audit">Clear filters</Link>
          </Button>
        ) : null}
      </form>

      {/* ----------------------------------------------------------- entries */}
      {page.entries.items.length > 0 ? (
        <div className="space-y-6">
          <div className="rounded-sm border border-rule bg-surface px-6 py-2">
            <AuditTrail entries={page.entries.items} />
          </div>

          <Pagination
            page={page.entries}
            params={carried}
            basePath="/admin/audit"
          />
        </div>
      ) : (
        <EmptyState
          title={isFiltered ? 'No matching audit entries' : 'Audit log is empty'}
          body={
            isFiltered
              ? 'No audit records matched the filter criteria.'
              : 'No administrative actions have been recorded yet.'
          }
          action={
            isFiltered ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/audit">Reset filters</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </PageShell>
  )
}
