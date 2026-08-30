import { cache } from 'react'

import type { EntityType, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma/client'

/**
 * Entity persistence.
 *
 * Repositories own the Prisma queries and nothing else — no HTTP concerns, no
 * authorization, no view mapping (PRD §26). Services compose them.
 */

/** Every specialized attribute row plus provenance, for detail views. */
export const entityAttributesInclude = {
  provenance: true,
  member: true,
  generation: true,
  team: true,
  song: true,
  album: true,
  event: true,
  concert: true,
  setlist: true,
  mediaItem: true,
  organization: true,
} satisfies Prisma.EntityInclude

export type EntityWithAttributes = Prisma.EntityGetPayload<{
  include: typeof entityAttributesInclude
}>

/** Just enough to render a link or an option. */
export const entityRefSelect = {
  id: true,
  entityType: true,
  category: true,
  canonicalName: true,
  slug: true,
  summary: true,
  imageUrl: true,
} satisfies Prisma.EntitySelect

export type EntityRefRow = Prisma.EntityGetPayload<{ select: typeof entityRefSelect }>

export type EntityListOptions = {
  entityTypes?: EntityType[]
  search?: string
  page?: number
  pageSize?: number
  /** Admin views pass true; public views must not. */
  includeUnpublished?: boolean
  orderBy?: 'name' | 'prominence' | 'recent' | 'chronological'
  /**
   * Whether the caller needs `total`. Defaults to true.
   *
   * A paginated view has to know how many pages there are, so it pays for a
   * `count(*)` over the whole filtered set. A rail of six cards does not render a
   * total at all, and for those the count was a second full scan bought for
   * nothing. Pass `false` and `total` reports the number of rows returned.
   */
  withTotal?: boolean
}

const DEFAULT_PAGE_SIZE = 24
const MAX_PAGE_SIZE = 100

function buildWhere(options: EntityListOptions): Prisma.EntityWhereInput {
  const where: Prisma.EntityWhereInput = {}

  if (!options.includeUnpublished) where.isPublished = true
  if (options.entityTypes?.length) where.entityType = { in: options.entityTypes }

  const search = options.search?.trim()
  if (search) {
    where.OR = [
      { canonicalName: { contains: search, mode: 'insensitive' } },
      { aliases: { has: search } },
      { summary: { contains: search, mode: 'insensitive' } },
    ]
  }

  return where
}

function buildOrderBy(
  orderBy: EntityListOptions['orderBy'],
): Prisma.EntityOrderByWithRelationInput[] {
  switch (orderBy) {
    case 'prominence':
      return [{ prominence: 'desc' }, { canonicalName: 'asc' }]
    case 'recent':
      return [{ updatedAt: 'desc' }]
    case 'chronological':
      // Nulls sort last so undated records do not head the list.
      return [{ activeFrom: { sort: 'asc', nulls: 'last' } }, { canonicalName: 'asc' }]
    case 'name':
    default:
      return [{ canonicalName: 'asc' }]
  }
}

export async function listEntities(options: EntityListOptions = {}) {
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, options.pageSize ?? DEFAULT_PAGE_SIZE))
  const where = buildWhere(options)

  const findRows = prisma.entity.findMany({
    where,
    include: entityAttributesInclude,
    orderBy: buildOrderBy(options.orderBy),
    skip: (page - 1) * pageSize,
    take: pageSize,
  })

  if (options.withTotal === false) {
    const rows = await findRows
    return { rows, total: rows.length, page, pageSize }
  }

  const [rows, total] = await Promise.all([findRows, prisma.entity.count({ where })])

  return { rows, total, page, pageSize }
}

/**
 * One entity by slug, deduplicated per request render.
 *
 * The record route reads the same entity twice — once in `generateMetadata` for
 * the title and description, once in the page component — and both run inside a
 * single request, so the second call can be answered from the first. Public reads
 * only: admin paths look entities up by id, so no mutation seeds this cache with
 * a row it then goes on to change.
 */
export const findEntityBySlug = cache(async (slug: string, includeUnpublished = false) => {
  const entity = await prisma.entity.findUnique({
    where: { slug },
    include: entityAttributesInclude,
  })

  if (!entity) return null
  if (!includeUnpublished && !entity.isPublished) return null
  return entity
})

export async function findEntityById(id: string, includeUnpublished = false) {
  const entity = await prisma.entity.findUnique({
    where: { id },
    include: entityAttributesInclude,
  })

  if (!entity) return null
  if (!includeUnpublished && !entity.isPublished) return null
  return entity
}

export async function findEntityRefsByIds(ids: readonly string[]): Promise<EntityRefRow[]> {
  if (ids.length === 0) return []
  return prisma.entity.findMany({
    where: { id: { in: [...ids] } },
    select: entityRefSelect,
  })
}

/**
 * Batch slug lookup, including unpublished rows.
 *
 * Bulk import resolves a whole sheet of `sourceRef` / `targetRef` cells in one
 * query rather than one per row, and it has to see drafts: a curator commonly
 * imports the members and the edges that connect them in the same sitting, and
 * a new record starts unpublished.
 */
export async function findEntityRefsBySlugs(slugs: readonly string[]): Promise<EntityRefRow[]> {
  if (slugs.length === 0) return []
  return prisma.entity.findMany({
    where: { slug: { in: [...new Set(slugs)] } },
    select: entityRefSelect,
  })
}

/**
 * The full rows, specialized attributes included, for a set of slugs.
 *
 * The heavier sibling of `findEntityRefsBySlugs`, and only worth its weight for
 * bulk *updates*: merging a partly-filled sheet over stored records needs every
 * column those records already hold, and reading them one row at a time would be
 * a query per line of the sheet.
 */
export async function findEntitiesBySlugs(
  slugs: readonly string[],
): Promise<EntityWithAttributes[]> {
  if (slugs.length === 0) return []
  return prisma.entity.findMany({
    where: { slug: { in: [...new Set(slugs)] } },
    include: entityAttributesInclude,
  })
}

export async function countEntitiesByType(includeUnpublished = false) {
  const rows = await prisma.entity.groupBy({
    by: ['entityType'],
    where: includeUnpublished ? undefined : { isPublished: true },
    _count: { _all: true },
  })

  const counts = new Map<EntityType, number>()
  for (const row of rows) counts.set(row.entityType, row._count._all)
  return counts
}

/** Free-text search across names and aliases (PRD §21 `/api/v1/search`). */
export async function searchEntityRefs(
  query: string,
  limit = 20,
  entityTypes?: EntityType[],
): Promise<EntityRefRow[]> {
  const term = query.trim()
  if (term.length < 2) return []

  return prisma.entity.findMany({
    where: {
      isPublished: true,
      ...(entityTypes?.length ? { entityType: { in: entityTypes } } : {}),
      OR: [
        { canonicalName: { contains: term, mode: 'insensitive' } },
        { aliases: { has: term } },
        { summary: { contains: term, mode: 'insensitive' } },
      ],
    },
    select: entityRefSelect,
    orderBy: [{ prominence: 'desc' }, { canonicalName: 'asc' }],
    take: Math.min(50, Math.max(1, limit)),
  })
}

export type CandidateQuery = {
  entityType: EntityType
  minProminence?: number
  maxProminence?: number
  /** Subject must have an edge of every one of these types, in either direction. */
  requiredRelationshipTypeIds?: string[]
  /**
   * Restrict to entities connected to this entity — "Test this Generation".
   * Matched in either direction so a generation finds its members.
   */
  connectedToEntityId?: string
  excludeEntityIds?: string[]
  limit?: number
}

/**
 * Eligible subjects for a game round.
 *
 * The required-relationship filter is what stops the engine asking about a
 * member with no team history: eligibility is a property of the graph, not
 * something the generator discovers halfway through and has to back out of.
 */
export async function findCandidateEntities(query: CandidateQuery): Promise<EntityRefRow[]> {
  const requiredTypeIds = query.requiredRelationshipTypeIds ?? []

  const where: Prisma.EntityWhereInput = {
    isPublished: true,
    entityType: query.entityType,
    prominence: {
      gte: query.minProminence ?? 0,
      lte: query.maxProminence ?? 100,
    },
    ...(query.excludeEntityIds?.length ? { id: { notIn: query.excludeEntityIds } } : {}),
    AND: [
      ...requiredTypeIds.map(
        (relationshipTypeId): Prisma.EntityWhereInput => ({
          OR: [
            { outgoingRelationships: { some: { relationshipTypeId } } },
            { incomingRelationships: { some: { relationshipTypeId } } },
          ],
        }),
      ),
      ...(query.connectedToEntityId
        ? [
            {
              OR: [
                { outgoingRelationships: { some: { targetEntityId: query.connectedToEntityId } } },
                { incomingRelationships: { some: { sourceEntityId: query.connectedToEntityId } } },
              ],
            } satisfies Prisma.EntityWhereInput,
          ]
        : []),
    ],
  }

  return prisma.entity.findMany({
    where,
    select: entityRefSelect,
    orderBy: [{ prominence: 'desc' }, { canonicalName: 'asc' }],
    take: Math.min(500, Math.max(1, query.limit ?? 200)),
  })
}

/** Entities whose own lifespan overlaps a date — used by the Time Machine. */
export async function findEntitiesActiveOn(
  asOf: Date,
  entityTypes: EntityType[],
): Promise<EntityRefRow[]> {
  return prisma.entity.findMany({
    where: {
      isPublished: true,
      entityType: { in: entityTypes },
      AND: [
        { OR: [{ activeFrom: null }, { activeFrom: { lte: asOf } }] },
        { OR: [{ activeTo: null }, { activeTo: { gte: asOf } }] },
      ],
    },
    select: entityRefSelect,
    orderBy: [{ canonicalName: 'asc' }],
  })
}

export async function slugExists(slug: string, exceptId?: string): Promise<boolean> {
  const found = await prisma.entity.findUnique({ where: { slug }, select: { id: true } })
  if (!found) return false
  return found.id !== exceptId
}

export async function createEntity(data: Prisma.EntityCreateInput) {
  return prisma.entity.create({ data, include: entityAttributesInclude })
}

export async function updateEntity(id: string, data: Prisma.EntityUpdateInput) {
  return prisma.entity.update({ where: { id }, data, include: entityAttributesInclude })
}

export async function deleteEntity(id: string) {
  return prisma.entity.delete({ where: { id } })
}

/** Newest edits first, for the admin dashboard and the public "recently updated" rail. */
export async function findRecentlyUpdated(limit = 8, includeUnpublished = false) {
  return prisma.entity.findMany({
    where: includeUnpublished ? undefined : { isPublished: true },
    select: { ...entityRefSelect, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
}
