import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma/client'

import { entityRefSelect } from './entity-repository'

/**
 * Relationship (edge) persistence.
 *
 * Every read that is meant to reflect a point in time goes through
 * `temporalFilter`. There is exactly one implementation of that predicate in the
 * codebase on purpose — a second copy is how the Time Machine and the game
 * engine end up disagreeing about history.
 */

/**
 * PRD §11: an edge is valid on a date when it started on or before it and has
 * not yet ended.
 *
 * A null `validFrom` is treated as "start unknown, assume always" rather than
 * excluded, so a partially-sourced edge still renders. That leniency is exactly
 * what the RELATIONSHIP_MISSING_VALID_FROM health check exists to surface, so
 * the gap gets fixed in the data instead of hidden by the query.
 */
export function temporalFilter(asOf?: Date | null): Prisma.RelationshipWhereInput {
  if (!asOf) return {}

  return {
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: asOf } }] },
      { OR: [{ validTo: null }, { validTo: { gte: asOf } }] },
    ],
  }
}

export const edgeInclude = {
  relationshipType: true,
  provenance: true,
  source: { select: entityRefSelect },
  target: { select: entityRefSelect },
} satisfies Prisma.RelationshipInclude

export type EdgeRow = Prisma.RelationshipGetPayload<{ include: typeof edgeInclude }>

export type EdgeQuery = {
  /** Resolve the graph as it stood on this date. Omit for "all of history". */
  asOf?: Date | null
  relationshipCodes?: string[]
  relationshipTypeIds?: string[]
  /** Only edges the game engine is allowed to use as clues. */
  quizzableOnly?: boolean
  /** Hide edges pointing at unpublished entities from public views. */
  publishedOnly?: boolean
}

function buildEdgeWhere(query: EdgeQuery): Prisma.RelationshipWhereInput {
  const clauses: Prisma.RelationshipWhereInput[] = [temporalFilter(query.asOf)]

  const typeFilter: Prisma.RelationshipTypeWhereInput = { isActive: true }
  if (query.relationshipCodes?.length) typeFilter.code = { in: query.relationshipCodes }
  if (query.quizzableOnly) typeFilter.isQuizzable = true
  clauses.push({ relationshipType: typeFilter })

  if (query.relationshipTypeIds?.length) {
    clauses.push({ relationshipTypeId: { in: query.relationshipTypeIds } })
  }

  if (query.publishedOnly !== false) {
    clauses.push({ source: { isPublished: true }, target: { isPublished: true } })
  }

  return { AND: clauses }
}

const edgeOrderBy: Prisma.RelationshipOrderByWithRelationInput[] = [
  { relationshipType: { displayOrder: 'asc' } },
  { weight: 'desc' },
  { validFrom: { sort: 'asc', nulls: 'last' } },
]

/** Every edge touching an entity, in both directions. */
export async function findEdgesForEntity(
  entityId: string,
  query: EdgeQuery = {},
): Promise<EdgeRow[]> {
  return prisma.relationship.findMany({
    where: {
      AND: [buildEdgeWhere(query), { OR: [{ sourceEntityId: entityId }, { targetEntityId: entityId }] }],
    },
    include: edgeInclude,
    orderBy: edgeOrderBy,
  })
}

/**
 * Batched variant for traversal: one query per BFS level rather than one per
 * node. Multi-hop question generation would otherwise fan out badly.
 */
export async function findEdgesForEntities(
  entityIds: readonly string[],
  query: EdgeQuery = {},
): Promise<EdgeRow[]> {
  if (entityIds.length === 0) return []
  const ids = [...entityIds]

  return prisma.relationship.findMany({
    where: {
      AND: [
        buildEdgeWhere(query),
        { OR: [{ sourceEntityId: { in: ids } }, { targetEntityId: { in: ids } }] },
      ],
    },
    include: edgeInclude,
    orderBy: edgeOrderBy,
  })
}

/** All edges of one type — the roster of a team, the tracklist of an album. */
export async function findEdgesByType(code: string, query: EdgeQuery = {}): Promise<EdgeRow[]> {
  return prisma.relationship.findMany({
    where: { AND: [buildEdgeWhere({ ...query, relationshipCodes: [code] })] },
    include: edgeInclude,
    orderBy: edgeOrderBy,
  })
}

export type RelationshipListOptions = {
  page?: number
  pageSize?: number
  relationshipCodes?: string[]
  entityId?: string
  search?: string
}

/** Admin relationship browser (PRD §19). Unfiltered by publication state. */
export async function listRelationships(options: RelationshipListOptions = {}) {
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25))

  const clauses: Prisma.RelationshipWhereInput[] = []
  if (options.relationshipCodes?.length) {
    clauses.push({ relationshipType: { code: { in: options.relationshipCodes } } })
  }
  if (options.entityId) {
    clauses.push({
      OR: [{ sourceEntityId: options.entityId }, { targetEntityId: options.entityId }],
    })
  }
  const search = options.search?.trim()
  if (search) {
    clauses.push({
      OR: [
        { source: { canonicalName: { contains: search, mode: 'insensitive' } } },
        { target: { canonicalName: { contains: search, mode: 'insensitive' } } },
      ],
    })
  }

  const where: Prisma.RelationshipWhereInput = clauses.length ? { AND: clauses } : {}

  const [rows, total] = await Promise.all([
    prisma.relationship.findMany({
      where,
      include: edgeInclude,
      orderBy: [{ updatedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.relationship.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function findRelationshipById(id: string): Promise<EdgeRow | null> {
  return prisma.relationship.findUnique({ where: { id }, include: edgeInclude })
}

/**
 * Every edge that starts at one of these records under one of these types.
 *
 * Used to match a batch of imported rows against the relationship identity
 * `@@unique([sourceEntityId, relationshipTypeId, targetEntityId, validFrom])`
 * without one round trip per row: a five-hundred-row sheet needs that answer
 * twice, once to preview and once to commit. The mutable fields come along so a
 * matched row can be merged over instead of overwriting what it omits.
 */
export async function findEdgesBySourceAndType(
  sourceEntityIds: readonly string[],
  relationshipTypeIds: readonly string[],
): Promise<
  {
    id: string
    sourceEntityId: string
    relationshipTypeId: string
    targetEntityId: string
    validFrom: Date | null
    validTo: Date | null
    weight: number
    notes: string | null
    provenanceId: string | null
  }[]
> {
  if (sourceEntityIds.length === 0 || relationshipTypeIds.length === 0) return []

  return prisma.relationship.findMany({
    where: {
      sourceEntityId: { in: [...new Set(sourceEntityIds)] },
      relationshipTypeId: { in: [...new Set(relationshipTypeIds)] },
    },
    select: {
      id: true,
      sourceEntityId: true,
      relationshipTypeId: true,
      targetEntityId: true,
      validFrom: true,
      validTo: true,
      weight: true,
      notes: true,
      provenanceId: true,
    },
  })
}

export async function countRelationships(): Promise<number> {
  return prisma.relationship.count()
}

export async function countRelationshipsByType() {
  const rows = await prisma.relationship.groupBy({
    by: ['relationshipTypeId'],
    _count: { _all: true },
  })
  return new Map(rows.map((row) => [row.relationshipTypeId, row._count._all]))
}

export async function createRelationship(data: Prisma.RelationshipCreateInput) {
  return prisma.relationship.create({ data, include: edgeInclude })
}

export async function updateRelationship(id: string, data: Prisma.RelationshipUpdateInput) {
  return prisma.relationship.update({ where: { id }, data, include: edgeInclude })
}

export async function deleteRelationship(id: string) {
  return prisma.relationship.delete({ where: { id } })
}

/** An edge that is temporal, active and visible — the timeline's raw material. */
const transitionWhere: Prisma.RelationshipWhereInput = {
  relationshipType: { isActive: true, isTemporal: true },
  source: { isPublished: true },
  target: { isPublished: true },
}

/**
 * Edges whose validity *begins or ends* inside a window.
 *
 * This is the timeline query: the interesting moments in the archive are the
 * transitions, not the steady states.
 */
export async function findEdgeTransitions(from: Date, to: Date): Promise<EdgeRow[]> {
  return prisma.relationship.findMany({
    where: {
      ...transitionWhere,
      OR: [
        { validFrom: { gte: from, lte: to } },
        { validTo: { gte: from, lte: to } },
      ],
    },
    include: edgeInclude,
    orderBy: [{ validFrom: { sort: 'asc', nulls: 'last' } }],
  })
}

/** One edge endpoint, tagged with which end of the edge it is. */
export type EdgeTransition = { row: EdgeRow; kind: 'START' | 'END'; date: Date }

/**
 * The most recent transitions, newest first.
 *
 * The home page shows six of these, and it used to get them by loading every
 * transition since 2011 — four joins per row, the whole history of the archive —
 * and then slicing. This asks the question the page is actually asking: two
 * `LIMIT n` scans down the indexes, merged in memory. That merge is why it cannot
 * be one query: a row's relevant date is `validFrom` for a start and `validTo`
 * for an end, and Postgres cannot order by "whichever of these two applies".
 *
 * Bounded by `asOf` so an announced-but-not-yet-effective graduation does not
 * head a list of things that have already happened.
 */
export async function findRecentTransitions(
  limit: number,
  asOf: Date,
): Promise<EdgeTransition[]> {
  const take = Math.min(50, Math.max(1, limit))

  const [started, ended] = await Promise.all([
    prisma.relationship.findMany({
      where: { ...transitionWhere, validFrom: { not: null, lte: asOf } },
      include: edgeInclude,
      orderBy: [{ validFrom: 'desc' }],
      take,
    }),
    prisma.relationship.findMany({
      where: { ...transitionWhere, validTo: { not: null, lte: asOf } },
      include: edgeInclude,
      orderBy: [{ validTo: 'desc' }],
      take,
    }),
  ])

  const transitions: EdgeTransition[] = [
    ...started.flatMap((row) =>
      row.validFrom ? [{ row, kind: 'START' as const, date: row.validFrom }] : [],
    ),
    ...ended.flatMap((row) => (row.validTo ? [{ row, kind: 'END' as const, date: row.validTo }] : [])),
  ]

  transitions.sort((a, b) => b.date.getTime() - a.date.getTime())
  return transitions.slice(0, take)
}

/**
 * Every edge touching an entity, ignoring publication state and type activity.
 *
 * Used before an entity delete: `onDelete: Cascade` on both endpoints means the
 * delete silently takes these rows with it, so the admin has to be told the count
 * first. A filtered count would understate the damage.
 */
export async function countEdgesTouching(entityId: string): Promise<number> {
  return prisma.relationship.count({
    where: { OR: [{ sourceEntityId: entityId }, { targetEntityId: entityId }] },
  })
}
