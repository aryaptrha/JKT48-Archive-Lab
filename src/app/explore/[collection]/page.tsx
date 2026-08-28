import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { EmptyState } from '@/components/archive/empty-state'
import { Pagination } from '@/components/archive/pagination'
import { RecordCard, RecordGrid } from '@/components/archive/record'
import { SearchField } from '@/components/archive/search-field'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import { getCollection } from '@/domain/entity-taxonomy'
import { getCollectionPage, type CollectionSort } from '@/server/queries/explore'

/**
 * `/explore/[collection]` — one browse page (PRD §20).
 *
 * All state is in the URL: search text, sort and page. That is what makes a
 * filtered view of the archive a citable address, and it is why the controls are a
 * GET form rather than a client component holding state.
 *
 * `searchParams` is a promise in Next 16, so it is awaited alongside nothing else —
 * the collection read needs its values first.
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

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ collection: string }>
  searchParams: SearchParams
}) {
  const [{ collection: slug }, query] = await Promise.all([params, searchParams])

  const search = first(query.q)
  const sort = parseSort(first(query.sort))
  const pageNumber = Number.parseInt(first(query.page) ?? '1', 10)

  const page = await getCollectionPage(slug, {
    search,
    sort,
    page: Number.isFinite(pageNumber) ? pageNumber : 1,
  })

  // An unknown slug is a 404, not an empty list. The archive has a fixed set of
  // collections and pretending otherwise would make typos look like empty data.
  if (!page) notFound()

  // Rebuilt rather than forwarded, so only the params this page understands
  // survive into its own links.
  const carried = new URLSearchParams()
  if (search) carried.set('q', search)
  if (sort) carried.set('sort', sort)

  const isFiltered = page.applied.search !== null

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow={`${page.collection.catalogPrefix} · ${page.results.total.toLocaleString()} records`}
        title={page.collection.label}
        lead={page.collection.description}
      />

      <SearchField
        action={`/explore/${page.collection.slug}`}
        defaultValue={page.applied.search ?? undefined}
        placeholder={`Search ${page.collection.label.toLowerCase()}`}
        label={`Search ${page.collection.label}`}
      >
        <div className="space-y-1.5">
          <label
            htmlFor="sort"
            className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
          >
            Sort
          </label>
          <Select id="sort" name="sort" defaultValue={page.applied.sort} className="w-44">
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </SearchField>

      {page.results.items.length === 0 ? (
        isFiltered ? (
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
      ) : (
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
      )}
    </PageShell>
  )
}
