import type { Metadata } from 'next'
import Link from 'next/link'

import { EmptyState } from '@/components/archive/empty-state'
import { CatalogNumber, Portrait } from '@/components/archive/record'
import { SearchField } from '@/components/archive/search-field'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EXPLORE_COLLECTIONS } from '@/domain/entity-taxonomy'
import { searchArchive, type SearchHit } from '@/server/services/search'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search every record in the JKT48 Archive Lab by name, alias or summary.',
}

/**
 * `/search` (PRD §20, §21).
 *
 * Server-rendered results from a GET form, so a search is a URL: it can be
 * bookmarked, shared, cited in a forum post, and opened in a new tab. That is
 * worth more here than the keystroke saved by search-as-you-type.
 *
 * Results are grouped the way the archive is navigated, and each hit says *why*
 * it matched. "Zee" hitting an alias rather than a canonical name is useful
 * information — it tells a reader the archive knows the name they use.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const raw = Array.isArray(query.q) ? query.q[0] : query.q
  const term = raw?.trim() ?? ''

  const results = term.length > 0 ? await searchArchive(term) : null

  return (
    <PageShell className="max-w-[60rem] space-y-8">
      <SectionHeading
        as="h1"
        eyebrow={
          results && !results.tooShort
            ? `${results.total} ${results.total === 1 ? 'record' : 'records'}`
            : 'Every record, every alias'
        }
        title="Search the archive"
        lead="Names, aliases and summaries. Aliases matter most — the name a fan types is rarely the name a record is registered under."
      />

      <SearchField
        action="/search"
        defaultValue={term}
        placeholder="Member, song, team, event…"
        label="Search the archive"
      />

      {results === null ? (
        <section className="space-y-4">
          <p className="eyebrow">Or browse by collection</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {EXPLORE_COLLECTIONS.map((collection) => (
              <Link
                key={collection.slug}
                href={`/explore/${collection.slug}`}
                className="flex items-baseline justify-between gap-3 rounded-sm border border-rule bg-surface px-3 py-2 transition-colors hover:border-accent hover:text-accent"
              >
                <span className="text-sm font-medium">{collection.label}</span>
                <span className="catalog-number">{collection.catalogPrefix}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : results.tooShort ? (
        <EmptyState
          title="Two letters, at least"
          body="A one-character query matches most of the archive, which is the same as matching none of it."
        />
      ) : results.total === 0 ? (
        <EmptyState
          title={`Nothing matches “${results.query}”`}
          body="No name, alias or summary contains that. If the record should exist, it has not been catalogued yet — which is a gap worth filling rather than a failed search."
          action={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/explore">Browse collections</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/admin/entities/new">Add this record</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-10">
          {results.groups.map((group) => (
            <section key={group.slug} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
                <h2 className="text-base font-semibold">{group.label}</h2>
                <span className="font-mono text-catalog tabular-nums text-ink-faint">
                  {group.hits.length}
                </span>
              </div>
              <ul className="ruled">
                {group.hits.map((hit) => (
                  <li key={hit.id}>
                    <Hit hit={hit} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  )
}

/** One result row. */
function Hit({ hit }: { hit: SearchHit }) {
  return (
    <Link
      href={hit.href}
      className="group flex items-center gap-3 px-1 py-3 transition-colors hover:bg-ground-sunk"
    >
      <Portrait entity={hit} size="md" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <CatalogNumber entity={hit} />
          {/* Only surfaced for alias matches: on a name match the badge would
              restate what the reader can already see. */}
          {hit.matchedOn === 'alias' ? <Badge tone="indigo">alias match</Badge> : null}
          {hit.matchedOn === 'summary' ? <Badge tone="quiet">in summary</Badge> : null}
        </div>
        <p className="truncate text-sm font-medium text-ink transition-colors group-hover:text-accent">
          {hit.canonicalName}
        </p>
        {hit.context ? (
          <p className="truncate text-xs text-ink-faint">{hit.context}</p>
        ) : null}
      </div>
      <span aria-hidden className="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  )
}
