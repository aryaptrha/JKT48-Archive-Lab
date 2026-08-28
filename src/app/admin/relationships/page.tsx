import type { Metadata } from 'next'
import Link from 'next/link'

import { FormBanner } from '@/components/admin/admin-chrome'
import { EmptyState } from '@/components/archive/empty-state'
import { Pagination } from '@/components/archive/pagination'
import { SearchField } from '@/components/archive/search-field'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
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
import { requireAdmin } from '@/lib/auth/session'
import { getAdminRelationshipList } from '@/server/queries/admin'

export const metadata: Metadata = {
  title: 'Relationships',
}

/**
 * `/admin/relationships` — the graph relationship browser (PRD §10, §16, §25).
 *
 * Relationships are the core domain objects of the archive. Every edge connects
 * two canonical entities with a typed predicate, a temporal validity window,
 * a graph weight and a provenance attribution source.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminRelationshipsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams

  const search = first(query.q)?.trim() || undefined
  const code = first(query.code)?.trim() || undefined
  const entityId = first(query.entityId)?.trim() || undefined
  const pageParam = first(query.page)
  const pageNumber = Number.parseInt(pageParam ?? '1', 10)

  const list = await getAdminRelationshipList({
    page: Number.isFinite(pageNumber) ? pageNumber : 1,
    search,
    code,
    entityId,
  })

  const carried = new URLSearchParams()
  if (search) carried.set('q', search)
  if (code) carried.set('code', code)
  if (entityId) carried.set('entityId', entityId)

  const isFiltered = Boolean(search || code || entityId)

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow={
          list.scope
            ? `Edges touching ${list.scope.canonicalName} · ${list.rows.total.toLocaleString()} total`
            : `${list.rows.total.toLocaleString()} relationships`
        }
        title="Relationships"
        lead="The edges that turn facts into a knowledge graph (§10). Relationships carry dates, direction and provenance, and serve as the source of truth for games, timeline and profiles."
        action={
          <Button asChild variant="accent" size="sm">
            <Link
              href={
                entityId
                  ? `/admin/relationships/new?sourceEntityId=${entityId}`
                  : '/admin/relationships/new'
              }
            >
              + New relationship
            </Link>
          </Button>
        }
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {list.scope ? (
        <div className="flex items-center justify-between rounded-sm border border-rule bg-surface p-3 text-xs">
          <p className="text-ink">
            Showing relationships connected to{' '}
            <strong className="text-ink-strong">{list.scope.canonicalName}</strong>.
          </p>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/relationships">Show all relationships</Link>
          </Button>
        </div>
      ) : null}

      {/* ------------------------------------------------------------- filters */}
      <SearchField
        action="/admin/relationships"
        defaultValue={search}
        placeholder="Search entities connected by relationships"
        label="Search relationships"
      >
        {entityId ? <input type="hidden" name="entityId" value={entityId} /> : null}

        <div className="space-y-1.5">
          <label
            htmlFor="code-select"
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            Relationship type
          </label>
          <Select
            id="code-select"
            name="code"
            defaultValue={code ?? ''}
            className="w-full sm:w-60"
          >
            <option value="">All relationship types</option>
            {list.typeOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.name} ({opt.count})
              </option>
            ))}
          </Select>
        </div>

        {isFiltered ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/relationships">Clear filters</Link>
          </Button>
        ) : null}
      </SearchField>

      {/* --------------------------------------------------------------- table */}
      {list.rows.items.length > 0 ? (
        <div className="space-y-6">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Source (Subject)</TableHeader>
                <TableHeader>Relationship</TableHeader>
                <TableHeader>Target (Object)</TableHeader>
                <TableHeader>Temporal validity</TableHeader>
                <TableHeader>Source</TableHeader>
                <TableHeader className="text-right">Action</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.rows.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <Link
                        href={`/admin/entities/${row.source.id}`}
                        className="font-medium text-ink-strong transition-colors hover:text-accent"
                      >
                        {row.source.canonicalName}
                      </Link>
                      <p className="font-mono text-catalog text-ink-faint">
                        {row.source.slug}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-0.5">
                      <Badge tone="indigo">{row.typeName}</Badge>
                      <p className="font-mono text-catalog text-ink-faint">
                        {row.code}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-0.5">
                      <Link
                        href={`/admin/entities/${row.target.id}`}
                        className="font-medium text-ink-strong transition-colors hover:text-accent"
                      >
                        {row.target.canonicalName}
                      </Link>
                      <p className="font-mono text-catalog text-ink-faint">
                        {row.target.slug}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-0.5">
                      <span className="font-mono text-xs tabular-nums text-ink-muted">
                        {row.validity || (row.isTemporal ? '—' : 'Permanent / Non-temporal')}
                      </span>
                      {row.isOpen ? (
                        <p className="font-mono text-catalog text-sage font-medium">
                          Active / Open
                        </p>
                      ) : null}
                    </div>
                  </TableCell>

                  <TableCell>
                    <span className="text-xs text-ink-muted">
                      {row.sourceName ?? '—'}
                    </span>
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
            basePath="/admin/relationships"
          />
        </div>
      ) : (
        <EmptyState
          title={isFiltered ? 'No matching relationships' : 'No relationships linked'}
          body={
            isFiltered
              ? 'No relationships in the knowledge graph match the selected filters.'
              : 'No relationships have been linked in the knowledge graph yet.'
          }
          action={
            isFiltered ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/relationships">Reset filters</Link>
              </Button>
            ) : (
              <Button asChild variant="accent" size="sm">
                <Link href="/admin/relationships/new">Create first relationship</Link>
              </Button>
            )
          }
        />
      )}
    </PageShell>
  )
}
