import {
  EXPLORE_COLLECTIONS,
  collectionForEntityType,
  entityTypeLabel,
} from '@/domain/entity-taxonomy'
import type { EntityType } from '@/generated/prisma/client'
import { formatDateRange } from '@/lib/date'
import { normalizeAnswer } from '@/lib/utils'
import type { EntityRef } from '@/types/graph'

import { searchEntityRefs } from '../repositories/entity-repository'
import { findEdgesForEntities } from '../repositories/relationship-repository'

import { toEntityRef } from './entity-mapper'

/**
 * Search (PRD §21 `/api/v1/search`, §20 `/search`).
 *
 * Search matches names, aliases and summaries. Aliases carry most of the weight
 * in practice — fans type "Zee", "Ve", "Freya" far more often than a full
 * registered name — which is why aliases are a first-class column rather than
 * something to be derived from a name at query time.
 *
 * Results are grouped by explore collection rather than by raw entity type, so
 * the shape of the result list matches the shape of the archive's navigation.
 * A result is never a bare name: each one carries a line of context so a player
 * can tell two similarly named records apart before clicking.
 */

const MIN_QUERY_LENGTH = 2

export type SearchHit = EntityRef & {
  /** Why this row matched: an alias, the name, or the summary. */
  matchedOn: 'name' | 'alias' | 'summary'
  /** One line of disambiguating context, e.g. "Team J · 2013–2018". */
  context: string | null
}

export type SearchGroup = {
  slug: string
  label: string
  hits: SearchHit[]
}

export type SearchResults = {
  query: string
  total: number
  groups: SearchGroup[]
  /** Flat, relevance-ordered list for the command palette. */
  flat: SearchHit[]
  /** True when the query was too short to run. */
  tooShort: boolean
}

/**
 * Why a row matched, by elimination.
 *
 * The query already restricted rows to a name, alias or summary match, so a hit
 * whose name and summary do not contain the term matched on an alias. Deriving
 * it this way keeps aliases out of the list projection — they can be a long
 * array, and search results do not render them.
 */
function matchedOn(
  row: { canonicalName: string; summary: string | null },
  query: string,
): SearchHit['matchedOn'] {
  const needle = normalizeAnswer(query)
  if (normalizeAnswer(row.canonicalName).includes(needle)) return 'name'
  if (row.summary && normalizeAnswer(row.summary).includes(needle)) return 'summary'
  return 'alias'
}

/**
 * Context lines come from the graph, not from a text column.
 *
 * A member's most useful disambiguator is her team and dates — facts that live
 * on relationships. One batched edge query for the whole result set keeps this
 * from becoming a query per hit.
 */
async function contextFor(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()

  const wanted = new Set(ids)
  const edges = await findEdgesForEntities(ids, { quizzableOnly: false })
  const context = new Map<string, string>()

  for (const edge of edges) {
    for (const [entityId, other] of [
      [edge.sourceEntityId, edge.target],
      [edge.targetEntityId, edge.source],
    ] as const) {
      if (!wanted.has(entityId)) continue
      if (context.has(entityId)) continue

      const window = edge.relationshipType.isTemporal
        ? formatDateRange(edge.validFrom, edge.validTo)
        : null
      context.set(entityId, [other.canonicalName, window].filter(Boolean).join(' · '))
    }
  }

  return context
}

export async function searchArchive(
  rawQuery: string,
  options: { entityTypes?: EntityType[]; limit?: number } = {},
): Promise<SearchResults> {
  const query = rawQuery.trim()

  if (query.length < MIN_QUERY_LENGTH) {
    return { query, total: 0, groups: [], flat: [], tooShort: true }
  }

  const rows = await searchEntityRefs(query, options.limit ?? 30, options.entityTypes)
  const context = await contextFor(rows.map((row) => row.id))

  const flat: SearchHit[] = rows.map((row) => ({
    ...toEntityRef(row),
    matchedOn: matchedOn(row, query),
    context: context.get(row.id) ?? row.summary ?? entityTypeLabel(row.entityType),
  }))

  const byCollection = new Map<string, SearchHit[]>()
  for (const hit of flat) {
    const collection = collectionForEntityType(hit.entityType)
    const slug = collection?.slug ?? 'other'
    const list = byCollection.get(slug)
    if (list) list.push(hit)
    else byCollection.set(slug, [hit])
  }

  // Collection order follows the archive's own navigation order, so search
  // results and the explore index read the same way.
  const groups: SearchGroup[] = []
  for (const collection of EXPLORE_COLLECTIONS) {
    const hits = byCollection.get(collection.slug)
    if (!hits?.length) continue
    groups.push({ slug: collection.slug, label: collection.label, hits })
  }
  const other = byCollection.get('other')
  if (other?.length) groups.push({ slug: 'other', label: 'Other records', hits: other })

  return { query, total: flat.length, groups, flat, tooShort: false }
}

/** Compact variant for the header command palette and the API. */
export async function quickSearch(rawQuery: string, limit = 8): Promise<SearchHit[]> {
  const results = await searchArchive(rawQuery, { limit })
  return results.flat.slice(0, limit)
}
