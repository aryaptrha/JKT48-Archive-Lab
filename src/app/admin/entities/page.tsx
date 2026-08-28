import type { Metadata } from 'next'
import Link from 'next/link'

import { FormBanner, PublishBadge } from '@/components/admin/admin-chrome'
import { EmptyState } from '@/components/archive/empty-state'
import { Pagination } from '@/components/archive/pagination'
import { SearchField } from '@/components/archive/search-field'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EntityType } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminEntityList } from '@/server/queries/admin'

export const metadata: Metadata = {
  title: 'Records',
}

/**
 * `/admin/entities` — the record work queue (PRD §15, §19, §25).
 *
 * Ordered newest-edited first because the list is a curation queue rather than
 * a catalogue: the row someone just saved or imported is the one they are most
 * likely to need next.
 *
 * All filter state is preserved in the URL (`q`, `type`, `page`).
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const ENTITY_TYPES = Object.values(EntityType)

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseEntityType(value: string | undefined): EntityType | null {
  return value && (ENTITY_TYPES as string[]).includes(value)
    ? (value as EntityType)
    : null
}

export default async function AdminEntitiesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams

  const search = first(query.q)?.trim() || undefined
  const entityType = parseEntityType(first(query.type))
  const pageParam = first(query.page)
  const pageNumber = Number.parseInt(pageParam ?? '1', 10)

  const list = await getAdminEntityList({
    page: Number.isFinite(pageNumber) ? pageNumber : 1,
    search,
    entityType,
  })

  const carried = new URLSearchParams()
  if (search) carried.set('q', search)
  if (entityType) carried.set('type', entityType)

  const isFiltered = Boolean(search || entityType)

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow={`${list.rows.total.toLocaleString()} records`}
        title="Records"
        lead="The canonical entities of the archive. Every record holds its own attributes; memberships, credits and eras are relationships (§10)."
        action={
          <Button asChild variant="accent" size="sm">
            <Link href="/admin/entities/new">New record</Link>
          </Button>
        }
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* ------------------------------------------------------------- filters */}
      <SearchField
        action="/admin/entities"
        defaultValue={search}
        placeholder="Search records by name, slug or alias"
        label="Search records"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="type-select"
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            Entity type
          </label>
          <Select
            id="type-select"
            name="type"
            defaultValue={entityType ?? ''}
            className="w-full sm:w-56"
          >
            <option value="">All types ({list.rows.total})</option>
            {list.typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </Select>
        </div>

        {isFiltered ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/entities">Clear filters</Link>
          </Button>
        ) : null}
      </SearchField>

      {/* --------------------------------------------------------------- table */}
      {list.rows.items.length > 0 ? (
        <div className="space-y-6">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Record</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Active dates</TableHeader>
                <TableHeader>Source</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Updated</TableHeader>
                <TableHeader className="text-right">Action</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.rows.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <Link
                        href={row.editHref}
                        className="font-medium text-ink-strong transition-colors hover:text-accent"
                      >
                        {row.canonicalName}
                      </Link>
                      <p className="font-mono text-catalog text-ink-faint">
                        {row.slug}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-ink-muted">
                      {row.typeLabel}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs tabular-nums text-ink-muted">
                      {row.dateline || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-ink-muted">
                      {row.sourceName ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <PublishBadge isPublished={row.isPublished} />
                  </TableCell>
                  <TableCell>
                    <time className="font-mono text-catalog tabular-nums text-ink-faint">
                      {row.updatedLabel}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={row.editHref}>Edit</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            page={list.rows}
            params={carried}
            basePath="/admin/entities"
          />
        </div>
      ) : (
        <EmptyState
          title={isFiltered ? 'No matching records' : 'No records catalogued'}
          body={
            isFiltered
              ? 'No archive records matched the search filters. Try clearing the filters or searching for a different name.'
              : 'The archive contains no catalogued entities yet. Click “New record” to create the first one.'
          }
          action={
            isFiltered ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/entities">Reset filters</Link>
              </Button>
            ) : (
              <Button asChild variant="accent" size="sm">
                <Link href="/admin/entities/new">Create first record</Link>
              </Button>
            )
          }
        />
      )}
    </PageShell>
  )
}
