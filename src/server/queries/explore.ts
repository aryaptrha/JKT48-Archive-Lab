import { unstable_cache } from 'next/cache'

import {
  EXPLORE_COLLECTIONS,
  entityTypeLabel,
  getCollection,
  type ExploreCollection,
} from '@/domain/entity-taxonomy'
import {
  ALBUM_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  MEDIA_TYPE_LABELS,
  MEMBER_STATUS_LABELS,
  ORGANIZATION_TYPE_LABELS,
  SONG_TYPE_LABELS,
} from '@/domain/labels'
import { REL } from '@/domain/relationship-types'
import { formatDateRange, yearOf } from '@/lib/date'
import { emptyPage, type EntityRef, type Paginated } from '@/types/graph'

import {
  countEntitiesByType,
  listEntities,
  type EntityListOptions,
  type EntityWithAttributes,
} from '../repositories/entity-repository'
import { findEdgesForEntities } from '../repositories/relationship-repository'
import { toEntityRef } from '../services/entity-mapper'
import { ARCHIVE_CACHE_SECONDS, ARCHIVE_TAGS } from '../cache/tags'

/**
 * Read models for the explore section (PRD §20 `/explore`, §4.1).
 *
 * Queries are the read half of the layering in §26: a Server Component calls one
 * function here and gets exactly the shape it renders. No component assembles a
 * route, formats a date range or decides what a member's subtitle should say.
 *
 * Nothing in this file writes, and nothing in it takes an actor — every read is
 * public, which is enforced the only way that holds: `includeUnpublished` is
 * never passed, so the repository's default filter applies. An admin preview is a
 * different function in `queries/admin.ts`, not a flag threaded through here.
 *
 * Because every read here is public and identical for every visitor, the view
 * models are cached across requests and invalidated by tag when a curator edits
 * (see `server/cache/tags.ts`). Two constraints come with that, and both are the
 * reason the cached functions are the ones they are:
 *
 * - `unstable_cache` round-trips its result through serialization, so a cached
 *   function may only return JSON. `ExploreCard` and `CollectionMeta` qualify —
 *   they carry no `Date`, which is why datelines are pre-formatted strings.
 * - Nothing inside a cache scope may read `cookies()`. Nothing here does; the
 *   whole file is anonymous by construction.
 */

export type ExploreCard = EntityRef & {
  /** One line of type-specific context: "Generasi 1 · Graduated". */
  meta: string | null
  /** The record's own dates, when it has any: "2013–2018". */
  dateline: string | null
  prominence: number
}

export type CollectionMeta = {
  slug: string
  label: string
  singular: string
  description: string
  catalogPrefix: string
  count: number
}

export type ExploreIndex = {
  collections: CollectionMeta[]
  total: number
}

/**
 * The explore landing page.
 *
 * Counts come from one grouped query rather than one count per collection,
 * because a collection is a set of entity types and the mapping is in the domain
 * layer, not in SQL.
 */
export const getExploreIndex = unstable_cache(
  async (): Promise<ExploreIndex> => {
    const counts = await countEntitiesByType()

    const collections = EXPLORE_COLLECTIONS.map((collection) => ({
      slug: collection.slug,
      label: collection.label,
      singular: collection.singular,
      description: collection.description,
      catalogPrefix: collection.catalogPrefix,
      count: collection.entityTypes.reduce((sum, type) => sum + (counts.get(type) ?? 0), 0),
    }))

    return {
      collections,
      total: collections.reduce((sum, collection) => sum + collection.count, 0),
    }
  },
  ['explore:index'],
  { tags: [ARCHIVE_TAGS.graph], revalidate: ARCHIVE_CACHE_SECONDS },
)

/**
 * The subtitle under a card, drawn from the specialized row.
 *
 * Deliberately not drawn from the graph: this runs once per card, and a card is
 * not the place to answer "which team". The one exception is a member's
 * generation, which is batched in separately below because it is the fact fans
 * identify a member by.
 */
function attributeMeta(row: EntityWithAttributes): string | null {
  if (row.member) return MEMBER_STATUS_LABELS[row.member.status]
  if (row.generation) {
    const size = row.generation.initialMemberCount
    return size === null ? null : `${size} members at debut`
  }
  if (row.team) return row.team.code
  if (row.song) return SONG_TYPE_LABELS[row.song.songType]
  if (row.album) return ALBUM_TYPE_LABELS[row.album.albumType]
  if (row.event) return EVENT_TYPE_LABELS[row.event.eventType]
  if (row.concert) return row.concert.venue ?? row.concert.city
  if (row.setlist) return row.setlist.revision ?? row.setlist.theater
  if (row.mediaItem) return MEDIA_TYPE_LABELS[row.mediaItem.mediaType]
  if (row.organization) return ORGANIZATION_TYPE_LABELS[row.organization.orgType]
  return entityTypeLabel(row.entityType)
}

/**
 * The dateline, preferring the record's own dates over the entity's window.
 *
 * A single release date reads as a year; a span reads as a range. Both come from
 * one formatter so a card and a detail page never disagree about how 2013–present
 * is written.
 */
function dateline(row: EntityWithAttributes): string | null {
  const releaseYear =
    yearOf(row.song?.releasedAt) ??
    yearOf(row.album?.releasedAt) ??
    yearOf(row.mediaItem?.releasedAt) ??
    yearOf(row.concert?.heldAt) ??
    yearOf(row.setlist?.premieredAt)

  if (releaseYear !== undefined) return String(releaseYear)

  const from = row.event?.startDate ?? row.team?.formedAt ?? row.activeFrom
  const to = row.event?.endDate ?? row.team?.disbandedAt ?? row.activeTo
  if (!from && !to) return null

  return formatDateRange(from, to)
}

/**
 * Generation labels for a page of member cards.
 *
 * One batched edge query for the whole page. The alternative — resolving each
 * member's generation as the card renders — is the N+1 that a knowledge graph
 * makes easy to write and expensive to serve.
 */
async function generationLabels(rows: EntityWithAttributes[]): Promise<Map<string, string>> {
  const memberIds = rows.filter((row) => row.member !== null).map((row) => row.id)
  if (memberIds.length === 0) return new Map()

  const edges = await findEdgesForEntities(memberIds, {
    relationshipCodes: [REL.BELONGS_TO_GENERATION],
    quizzableOnly: false,
  })

  const labels = new Map<string, string>()
  for (const edge of edges) {
    // The edge is stored member → generation, so the member is the source.
    if (labels.has(edge.sourceEntityId)) continue
    labels.set(edge.sourceEntityId, edge.target.canonicalName)
  }

  return labels
}

async function toCards(rows: EntityWithAttributes[]): Promise<ExploreCard[]> {
  const generations = await generationLabels(rows)

  return rows.map((row) => {
    const generation = generations.get(row.id)
    const attribute = attributeMeta(row)

    return {
      ...toEntityRef(row),
      meta: [generation, attribute].filter(Boolean).join(' · ') || null,
      dateline: dateline(row),
      prominence: row.prominence,
    }
  })
}

export type CollectionSort = NonNullable<EntityListOptions['orderBy']>

export type CollectionPage = {
  collection: CollectionMeta
  results: Paginated<ExploreCard>
  /** Echoed back so the UI can render its own controls without re-deriving them. */
  applied: { search: string | null; sort: CollectionSort }
}

/**
 * Default sort per collection.
 *
 * People browse members by prominence and releases by date; sorting either the
 * other way produces a correct list nobody wants. Chronological puts undated
 * records last rather than first, which is the repository's doing.
 *
 * Exported because the browse page renders its sort control before the results
 * exist — the control needs the same default the query will apply, and deriving
 * it twice from two copies of this switch is how the two would drift apart.
 */
export function collectionDefaultSort(collection: ExploreCollection): CollectionSort {
  switch (collection.slug) {
    case 'members':
    case 'teams':
    case 'organizations':
      return 'prominence'
    case 'songs':
    case 'albums':
    case 'events':
    case 'setlists':
    case 'media':
      return 'chronological'
    default:
      return 'name'
  }
}

type CollectionPageOptions = {
  page?: number
  pageSize?: number
  search?: string
  sort?: CollectionSort
}

async function buildCollectionPage(
  slug: string,
  options: CollectionPageOptions,
): Promise<CollectionPage | null> {
  const collection = getCollection(slug)
  if (!collection) return null

  const sort = options.sort ?? collectionDefaultSort(collection)
  const search = options.search?.trim() || null

  const { rows, total, page, pageSize } = await listEntities({
    entityTypes: collection.entityTypes,
    search: search ?? undefined,
    page: options.page,
    pageSize: options.pageSize,
    orderBy: sort,
  })

  const meta: CollectionMeta = {
    slug: collection.slug,
    label: collection.label,
    singular: collection.singular,
    description: collection.description,
    catalogPrefix: collection.catalogPrefix,
    count: total,
  }

  if (rows.length === 0) {
    return {
      collection: meta,
      results: emptyPage<ExploreCard>(page, pageSize),
      applied: { search, sort },
    }
  }

  return {
    collection: meta,
    results: {
      items: await toCards(rows),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
    applied: { search, sort },
  }
}

const getCachedCollectionPage = unstable_cache(buildCollectionPage, ['explore:collection'], {
  tags: [ARCHIVE_TAGS.graph],
  revalidate: ARCHIVE_CACHE_SECONDS,
})

/**
 * One browse page. Returns null for an unknown slug so the route can 404.
 *
 * Browsing is cached; searching is not. A browse page is one of a bounded set —
 * collection × sort × page number — and every visitor asks for the same ones. A
 * search term is arbitrary text, so caching those would let anyone mint unbounded
 * cache entries by typing, and the hit rate on a term nobody else searched is
 * zero anyway.
 */
export async function getCollectionPage(
  slug: string,
  options: CollectionPageOptions = {},
): Promise<CollectionPage | null> {
  if (options.search?.trim()) return buildCollectionPage(slug, options)
  return getCachedCollectionPage(slug, options)
}

/**
 * A short, ordered strip of records for a rail or a related-records block.
 *
 * Used by the home page and by entity pages that want "more from this
 * collection". Prominence ordering is what keeps a rail from opening with the
 * most obscure record in the archive.
 */
export const getCollectionHighlights = unstable_cache(
  async (slug: string, limit = 6): Promise<ExploreCard[]> => {
    const collection = getCollection(slug)
    if (!collection) return []

    const { rows } = await listEntities({
      entityTypes: collection.entityTypes,
      pageSize: limit,
      orderBy: 'prominence',
      // No total is rendered above a rail, so there is nothing to count for.
      withTotal: false,
    })

    return toCards(rows)
  },
  ['explore:highlights'],
  { tags: [ARCHIVE_TAGS.graph], revalidate: ARCHIVE_CACHE_SECONDS },
)
