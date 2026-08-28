import type { EntityType } from '@/generated/prisma/client'
import type {
  EntityDetail,
  EntityRef,
  GraphEdge,
  GraphPath,
  GraphPathStep,
  Subgraph,
  SubgraphEdge,
} from '@/types/graph'

import {
  findEntityById,
  findEntityBySlug,
  type EntityWithAttributes,
} from '../repositories/entity-repository'
import {
  findEdgesForEntities,
  findEdgesForEntity,
  type EdgeRow,
} from '../repositories/relationship-repository'

import { toEntityDetail, toEntityRef, toGraphEdge } from './entity-mapper'

/**
 * The Knowledge Graph service — the core of the product (PRD §28).
 *
 * Encyclopedia, Time Machine, Mastery and the Game Engine are all *consumers* of
 * this module. None of them queries relationships directly, and none of them
 * implements its own temporal logic. If a game and the archive ever disagree
 * about who was on Team J in 2015, the bug is in here and only here.
 */

export type GraphContext = {
  /**
   * Resolve the graph as it stood on this date. Omit (or pass null) to see all
   * of history at once, which is what an entity page wants.
   */
  asOf?: Date | null
  /** Admin previews only. Public reads must leave this false. */
  includeUnpublished?: boolean
}

export type EdgeFilter = {
  codes?: string[]
  relationshipTypeIds?: string[]
  quizzableOnly?: boolean
}

export type Direction = 'OUTGOING' | 'INCOMING' | 'ANY'

function edgeQuery(context: GraphContext, filter: EdgeFilter = {}) {
  return {
    asOf: context.asOf,
    relationshipCodes: filter.codes,
    relationshipTypeIds: filter.relationshipTypeIds,
    quizzableOnly: filter.quizzableOnly,
    publishedOnly: !context.includeUnpublished,
  }
}

/* -------------------------------------------------------------------------- */
/* Entity reads                                                               */
/* -------------------------------------------------------------------------- */

export async function getEntityDetailBySlug(
  slug: string,
  context: GraphContext = {},
): Promise<EntityDetail | null> {
  const entity = await findEntityBySlug(slug, context.includeUnpublished ?? false)
  if (!entity) return null
  return withEdges(entity, context)
}

export async function getEntityDetailById(
  id: string,
  context: GraphContext = {},
): Promise<EntityDetail | null> {
  const entity = await findEntityById(id, context.includeUnpublished ?? false)
  if (!entity) return null
  return withEdges(entity, context)
}

async function withEdges(
  entity: EntityWithAttributes,
  context: GraphContext,
): Promise<EntityDetail> {
  const rows = await findEdgesForEntity(entity.id, edgeQuery(context))
  const edges = rows.map((row) => toGraphEdge(row, entity.id))
  return toEntityDetail(entity, edges)
}

/** Every edge touching an entity, oriented from its point of view. */
export async function getEdges(
  entityId: string,
  context: GraphContext = {},
  filter: EdgeFilter = {},
): Promise<GraphEdge[]> {
  const rows = await findEdgesForEntity(entityId, edgeQuery(context, filter))
  return rows.map((row) => toGraphEdge(row, entityId))
}

/**
 * Entities one step away along a relationship code.
 *
 * `direction` is from the subject's perspective: OUTGOING follows the edge as
 * stored (member → team), INCOMING follows it backwards (team → members).
 */
export async function getNeighbors(
  entityId: string,
  code: string,
  context: GraphContext = {},
  direction: Direction = 'ANY',
): Promise<EntityRef[]> {
  const edges = await getEdges(entityId, context, { codes: [code] })
  return edges
    .filter((edge) => direction === 'ANY' || edge.direction === direction)
    .map((edge) => edge.other)
}

/** Convenience for the common "one expected neighbour" case (a generation). */
export async function getSingleNeighbor(
  entityId: string,
  code: string,
  context: GraphContext = {},
  direction: Direction = 'OUTGOING',
): Promise<EntityRef | undefined> {
  const neighbors = await getNeighbors(entityId, code, context, direction)
  return neighbors[0]
}

/* -------------------------------------------------------------------------- */
/* Traversal                                                                  */
/* -------------------------------------------------------------------------- */

function toSubgraphEdge(row: EdgeRow): SubgraphEdge {
  const type = row.relationshipType
  return {
    id: row.id,
    code: type.code,
    label: type.name,
    isTemporal: type.isTemporal,
    isQuizzable: type.isQuizzable,
    validFrom: row.validFrom,
    validTo: row.validTo,
    weight: row.weight,
    from: toEntityRef(row.source),
    to: toEntityRef(row.target),
  }
}

export type TraversalStep = {
  code: string
  direction?: Direction
}

/**
 * Walk a fixed relationship path from a starting entity.
 *
 * This is what makes indirect questions possible without bespoke SQL per game:
 * "the team of the center of song X" is
 * `[{ CENTER_OF, INCOMING }, { MEMBER_OF, OUTGOING }]`.
 *
 * Every level is one batched query, so a four-hop path costs four round trips
 * regardless of how wide the frontier gets.
 */
export async function traverse(
  startEntityId: string,
  steps: readonly TraversalStep[],
  context: GraphContext = {},
): Promise<GraphPath[]> {
  type Frontier = { entityId: string; ref: EntityRef | null; steps: GraphPathStep[] }

  let frontier: Frontier[] = [{ entityId: startEntityId, ref: null, steps: [] }]
  let start: EntityRef | undefined

  for (const step of steps) {
    if (frontier.length === 0) return []

    const ids = frontier.map((node) => node.entityId)
    const rows = await findEdgesForEntities(ids, edgeQuery(context, { codes: [step.code] }))

    const next: Frontier[] = []
    const seen = new Set<string>()

    for (const node of frontier) {
      for (const row of rows) {
        const isOutgoing = row.sourceEntityId === node.entityId
        const isIncoming = row.targetEntityId === node.entityId
        if (!isOutgoing && !isIncoming) continue

        const wanted = step.direction ?? 'ANY'
        if (wanted === 'OUTGOING' && !isOutgoing) continue
        if (wanted === 'INCOMING' && !isIncoming) continue

        const arrived = toEntityRef(isOutgoing ? row.target : row.source)
        if (!start) start = toEntityRef(isOutgoing ? row.source : row.target)

        // A path must not revisit an entity: "the team of the center of the song
        // this member centered" would otherwise resolve back to the member.
        const visited = new Set([startEntityId, ...node.steps.map((s) => s.to.id)])
        if (visited.has(arrived.id)) continue

        const key = `${node.entityId}->${row.id}->${arrived.id}`
        if (seen.has(key)) continue
        seen.add(key)

        next.push({
          entityId: arrived.id,
          ref: arrived,
          steps: [
            ...node.steps,
            {
              edge: toSubgraphEdge(row),
              direction: isOutgoing ? 'OUTGOING' : 'INCOMING',
              to: arrived,
            },
          ],
        })
      }
    }

    frontier = next
  }

  if (!start) {
    const startEntity = await findEntityById(startEntityId, context.includeUnpublished ?? false)
    if (!startEntity) return []
    start = toEntityRef(startEntity)
  }

  const resolvedStart = start
  return frontier.flatMap((node) =>
    node.ref ? [{ start: resolvedStart, end: node.ref, steps: node.steps }] : [],
  )
}

export type SubgraphOptions = EdgeFilter & {
  depth?: number
  /** Stop expanding once this many nodes are collected. */
  maxNodes?: number
  /** Only expand through these entity types (keeps hub nodes from exploding). */
  entityTypes?: EntityType[]
}

/**
 * Breadth-first neighbourhood around an entity.
 *
 * Used by the relationship panel on entity pages and by Connect the Dots, which
 * removes edges from the result and asks the player to put them back.
 *
 * `maxNodes` matters more than it looks: a generation is connected to every one
 * of its members, so an unbounded depth-3 expansion from a member reaches most
 * of the archive.
 */
export async function getSubgraph(
  rootEntityId: string,
  options: SubgraphOptions = {},
  context: GraphContext = {},
): Promise<Subgraph | null> {
  const depth = Math.max(1, Math.min(4, options.depth ?? 1))
  const maxNodes = Math.max(2, options.maxNodes ?? 40)

  const root = await findEntityById(rootEntityId, context.includeUnpublished ?? false)
  if (!root) return null

  const nodes = new Map<string, EntityRef>([[root.id, toEntityRef(root)]])
  const edges = new Map<string, SubgraphEdge>()

  let frontier = [root.id]
  const expanded = new Set<string>()

  for (let level = 0; level < depth; level += 1) {
    const toExpand = frontier.filter((id) => !expanded.has(id))
    if (toExpand.length === 0) break
    for (const id of toExpand) expanded.add(id)

    const rows = await findEdgesForEntities(toExpand, edgeQuery(context, options))
    const nextFrontier: string[] = []

    for (const row of rows) {
      if (nodes.size >= maxNodes) break

      const edge = toSubgraphEdge(row)
      if (!edges.has(edge.id)) edges.set(edge.id, edge)

      for (const end of [edge.from, edge.to]) {
        if (nodes.has(end.id)) continue
        if (options.entityTypes && !options.entityTypes.includes(end.entityType)) continue
        if (nodes.size >= maxNodes) break

        nodes.set(end.id, end)
        nextFrontier.push(end.id)
      }
    }

    frontier = nextFrontier
  }

  // Drop edges whose far end was cut by maxNodes, so the result is a consistent
  // graph rather than one with dangling references.
  const consistentEdges = [...edges.values()].filter(
    (edge) => nodes.has(edge.from.id) && nodes.has(edge.to.id),
  )

  return {
    root: nodes.get(root.id) as EntityRef,
    nodes: [...nodes.values()],
    edges: consistentEdges,
  }
}

/**
 * Shortest path between two entities, if one exists within `maxDepth`.
 *
 * Powers the "how are these two connected?" answer, and gives NIGHTMARE
 * questions a verifiable chain to ask about.
 */
export async function findShortestPath(
  fromEntityId: string,
  toEntityId: string,
  maxDepth = 4,
  context: GraphContext = {},
): Promise<GraphPath | null> {
  if (fromEntityId === toEntityId) return null

  const startEntity = await findEntityById(fromEntityId, context.includeUnpublished ?? false)
  if (!startEntity) return null
  const start = toEntityRef(startEntity)

  type Node = { entityId: string; steps: GraphPathStep[] }
  let frontier: Node[] = [{ entityId: fromEntityId, steps: [] }]
  const visited = new Set([fromEntityId])

  for (let level = 0; level < Math.max(1, Math.min(5, maxDepth)); level += 1) {
    if (frontier.length === 0) return null

    const rows = await findEdgesForEntities(
      frontier.map((node) => node.entityId),
      edgeQuery(context),
    )
    const next: Node[] = []

    for (const node of frontier) {
      for (const row of rows) {
        const isOutgoing = row.sourceEntityId === node.entityId
        const isIncoming = row.targetEntityId === node.entityId
        if (!isOutgoing && !isIncoming) continue

        const arrived = toEntityRef(isOutgoing ? row.target : row.source)
        const steps: GraphPathStep[] = [
          ...node.steps,
          {
            edge: toSubgraphEdge(row),
            direction: isOutgoing ? 'OUTGOING' : 'INCOMING',
            to: arrived,
          },
        ]

        if (arrived.id === toEntityId) return { start, end: arrived, steps }
        if (visited.has(arrived.id)) continue

        visited.add(arrived.id)
        next.push({ entityId: arrived.id, steps })
      }
    }

    frontier = next
  }

  return null
}

/** Degree count, used for prominence heuristics and the orphan health check. */
export async function countEdges(entityId: string, context: GraphContext = {}): Promise<number> {
  const rows = await findEdgesForEntity(entityId, edgeQuery(context))
  return rows.length
}
