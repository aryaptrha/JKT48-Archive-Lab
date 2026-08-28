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

/**
 * Edges whose validity *begins or ends* inside a window.
 *
 * This is the timeline query: the interesting moments in the archive are the
 * transitions, not the steady states.
 */
export async function findEdgeTransitions(from: Date, to: Date): Promise<EdgeRow[]> {
  return prisma.relationship.findMany({
    where: {
      relationshipType: { isActive: true, isTemporal: true },
      source: { isPublished: true },
      target: { isPublished: true },
      OR: [
        { validFrom: { gte: from, lte: to } },
        { validTo: { gte: from, lte: to } },
      ],
    },
    include: edgeInclude,
    orderBy: [{ validFrom: { sort: 'asc', nulls: 'last' } }],
  })
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
