import type { Metadata } from 'next'
import Link from 'next/link'

import { PageShell, SectionHeading } from '@/components/archive/section'
import { SearchField } from '@/components/archive/search-field'
import { getExploreIndex } from '@/server/queries/explore'

export const metadata: Metadata = {
  title: 'Explore',
  description:
    'Browse the JKT48 Archive Lab knowledge graph by collection: members, generations, teams, songs, albums, events, setlists, media and organizations.',
}

export const revalidate = 300

/**
 * `/explore` — the collection index (PRD §20).
 *
 * The collections are the graph's entity types grouped for browsing, and the
 * grouping lives in `EXPLORE_COLLECTIONS`. That is why this page has no list of
 * links in it: adding a collection is a domain change, and this route picks it up.
 *
 * Empty collections are shown rather than hidden, greyed and unlinked. A reader
 * deserves to know the archive *has* a notion of setlists even before one has been
 * catalogued — hiding it would misrepresent the shape of the archive as its
 * current contents.
 */
export default async function ExplorePage() {
  const index = await getExploreIndex()

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow={`${index.total.toLocaleString()} records`}
        title="Explore the archive"
        lead="Nine collections, one graph. Every record links to the relationships it takes part in, and every relationship carries the dates it was true."
        action={<SearchField action="/search" className="w-full sm:w-72" />}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {index.collections.map((collection, index_) => {
          const isEmpty = collection.count === 0

          const inner = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="catalog-number">{collection.catalogPrefix}</span>
                <span className="font-mono text-catalog tabular-nums text-ink-faint">
                  {collection.count.toLocaleString()}
                </span>
              </div>
              <h2 className="text-lg font-semibold transition-colors group-hover:text-accent">
                {collection.label}
              </h2>
              <p className="text-sm leading-relaxed text-ink-muted">{collection.description}</p>
            </>
          )

          const shared =
            'animate-rise stagger flex flex-col gap-2 rounded-sm border p-4 transition-[border-color,background-color] duration-(--duration-base)'

          if (isEmpty) {
            return (
              <div
                key={collection.slug}
                style={{ '--index': index_ } as React.CSSProperties}
                className={`${shared} border-dashed border-rule bg-ground-sunk opacity-70`}
              >
                {inner}
                <p className="mt-auto pt-1 font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
                  Nothing catalogued yet
                </p>
              </div>
            )
          }

          return (
            <Link
              key={collection.slug}
              href={`/explore/${collection.slug}`}
              style={{ '--index': index_ } as React.CSSProperties}
              className={`${shared} group border-rule bg-surface hover:border-ink-faint hover:bg-surface-raised`}
            >
              {inner}
            </Link>
          )
        })}
      </div>
    </PageShell>
  )
}
