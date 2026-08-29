import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { EmptyState } from '@/components/archive/empty-state'
import { Pagination } from '@/components/archive/pagination'
import { RecordCard, RecordGrid } from '@/components/archive/record'
import { SearchField } from '@/components/archive/search-field'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { getCollection } from '@/domain/entity-taxonomy'
import {
  collectionDefaultSort,
  getCollectionPage,
  type CollectionPage as CollectionPageModel,
  type CollectionSort,
} from '@/server/queries/explore'

/**
 * `/explore/[collection]` — one browse page (PRD §20).
 *
 * All state is in the URL: search text, sort and page. That is what makes a
 * filtered view of the archive a citable address, and it is why the controls are a
 * GET form rather than a client component holding state.
 *
 * `searchParams` is a promise in Next 16, so it is awaited alongside nothing else —
 * the collection read needs its values first.
 *
 * The frame does not wait for the records. A collection's name, description,
 * catalogue prefix and default sort are domain data (`domain/entity-taxonomy.ts`),
 * so the heading and both controls render with no database access at all; the grid,
 * its pagination and the one counted figure in the eyebrow stream in behind
 * `<Suspense>`. All three read the same promise, so there is still exactly one
 * query behind them.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const SORTS: { value: CollectionSort; label: string }[] = [
  { value: 'prominence', label: 'Most notable' },
  { value: 'name', label: 'A–Z' },
  { value: 'chronological', label: 'Chronological' },
  { value: 'recent', label: 'Recently updated' },
]

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseSort(value: string | undefined): CollectionSort | undefined {
  return SORTS.some((sort) => sort.value === value) ? (value as CollectionSort) : undefined
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ collection: string }>
}): Promise<Metadata> {
  const { collection: slug } = await params
  const collection = getCollection(slug)
  if (!collection) return { title: 'Not found' }

  return { title: collection.label, description: collection.description }
}

/** The record count in the heading's eyebrow, which only the query knows. */
async function ResultTotal({ results }: { results: Promise<CollectionPageModel | null> }) {
  const page = await results
  return <>{(page?.results.total ?? 0).toLocaleString()}</>
}

/** The shape of a grid of records, so the page does not jump when they land. */
function ResultsFallback() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading records</span>
      <RecordGrid>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <div
            key={index}
            className="flex gap-3.5 rounded-sm border border-rule bg-surface p-3.5"
          >
            <div className="size-[72px] shrink-0 animate-pulse rounded-sm bg-ground-sunk" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-2.5 w-20 animate-pulse rounded-xs bg-ground-sunk" />
              <div className="h-4 w-2/3 animate-pulse rounded-xs bg-ground-sunk" />
              <div className="h-2.5 w-1/2 animate-pulse rounded-xs bg-ground-sunk" />
            </div>
          </div>
        ))}
      </RecordGrid>
    </div>
  )
}

async function Results({
  results,
  search,
  sort,
}: {
  results: Promise<CollectionPageModel | null>
  search: string | undefined
  sort: CollectionSort | undefined
}) {
  const page = await results
  // The slug was validated before this promise was created, so a null here would
  // mean the collection vanished mid-render. Nothing sensible to render either way.
  if (!page) notFound()

  // Rebuilt from what the URL actually said rather than from what the query
  // resolved, so only the params this page understands survive into its own links
  // and an unstated sort stays unstated.
  const carried = new URLSearchParams()
  if (search) carried.set('q', search)
  if (sort) carried.set('sort', sort)

  const isFiltered = page.applied.search !== null

  if (page.results.items.length === 0) {
    return isFiltered ? (
      <EmptyState
        title={`No ${page.collection.label.toLowerCase()} match “${page.applied.search}”`}
        body="Try a shorter query, or search the whole archive instead of this one collection."
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/explore/${page.collection.slug}`}>Clear search</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/search?q=${encodeURIComponent(page.applied.search ?? '')}`}>
                Search everything
              </Link>
            </Button>
          </div>
        }
      />
    ) : (
      <EmptyState
        title={`No ${page.collection.label.toLowerCase()} catalogued yet`}
        body="This collection exists in the schema but has no published records. A curator can add the first one from the admin area."
        action={
          <Button asChild variant="outline">
            <Link href="/admin/entities/new">Add a record</Link>
          </Button>
        }
      />
    )
  }

  return (
    <>
      <RecordGrid>
        {page.results.items.map((card, index) => (
          <RecordCard
            key={card.id}
            entity={card}
            meta={card.meta}
            dateline={card.dateline}
            index={index}
          />
        ))}
      </RecordGrid>

      <Pagination
        page={page.results}
        params={carried}
        basePath={`/explore/${page.collection.slug}`}
      />
    </>
  )
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ collection: string }>
  searchParams: SearchParams
}) {
  const [{ collection: slug }, query] = await Promise.all([params, searchParams])

  const collection = getCollection(slug)
  // An unknown slug is a 404, not an empty list. The archive has a fixed set of
  // collections and pretending otherwise would make typos look like empty data.
  // Checked here against the domain rather than against a query result, so a typo
  // costs no database access.
  if (!collection) notFound()

  const search = first(query.q)
  const sort = parseSort(first(query.sort))
  const pageNumber = Number.parseInt(first(query.page) ?? '1', 10)

  // Started here and awaited in two places below, so the eyebrow's count and the
  // grid share one read. The empty `catch` is not error handling: it marks the
  // promise as observed for the window between this line and the children
  // awaiting it, so a failed query surfaces as a render error rather than as an
  // unhandled rejection. Whichever child awaits it still receives the rejection.
  const results = getCollectionPage(slug, {
    search,
    sort,
    page: Number.isFinite(pageNumber) ? pageNumber : 1,
  })
  results.catch(() => {})

  // A new query, sort or page is a new set of records, so the boundary remounts
  // and shows its skeleton again rather than holding the previous page's grid.
  const resultsKey = `${search ?? ''}:${sort ?? ''}:${pageNumber}`

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow={
          <>
            {collection.catalogPrefix} ·{' '}
            <Suspense fallback={<span className="text-ink-faint">…</span>}>
              <ResultTotal results={results} />
            </Suspense>{' '}
            records
          </>
        }
        title={collection.label}
        lead={collection.description}
      />

      <SearchField
        action={`/explore/${collection.slug}`}
        defaultValue={search?.trim() || undefined}
        placeholder={`Search ${collection.label.toLowerCase()}`}
        label={`Search ${collection.label}`}
      >
        <div className="space-y-1.5">
          <label
            htmlFor="sort"
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            Sort
          </label>
          <Select
            id="sort"
            name="sort"
            defaultValue={sort ?? collectionDefaultSort(collection)}
            className="w-44"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </SearchField>

      <Suspense key={resultsKey} fallback={<ResultsFallback />}>
        <Results results={results} search={search} sort={sort} />
      </Suspense>
    </PageShell>
  )
}
