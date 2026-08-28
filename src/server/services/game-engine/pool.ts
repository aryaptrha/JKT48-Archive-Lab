import { MIN_SUBJECTS_PER_DIFFICULTY } from '@/domain/data-health'
import type { EdgeDirection } from '@/types/graph'

import {
  findCandidateEntities,
  findEntityById,
  type EntityRefRow,
  type EntityWithAttributes,
} from '../../repositories/entity-repository'
import { findEdgesForEntities, type EdgeRow } from '../../repositories/relationship-repository'

import { InsufficientDataError, type GeneratorContext } from './types'

/**
 * The graph slice a session is generated from.
 *
 * Every generator works against this in-memory slice rather than querying per
 * round. Two reasons, both structural:
 *
 *   1. Determinism. A session is replayable from its seed only if generation is
 *      a pure function of (slice, seed). Interleaved queries make the output
 *      depend on query ordering and on data changing mid-session.
 *   2. Cost. A NIGHTMARE session needs four hops of neighbourhood; loading it as
 *      four batched queries up front beats hundreds of per-round round trips
 *      against a pooled serverless connection.
 */

/** Hard caps so a hub node (a generation with 60 members) cannot blow up a slice. */
const MAX_LEVEL_NODES = 300
const MAX_SLICE_NODES = 800
const CANDIDATE_LIMIT = 250

export type OrientedEdge = {
  edge: EdgeRow
  direction: EdgeDirection
  /** The far end, from the perspective of the entity asked about. */
  other: EntityRefRow
  self: EntityRefRow
}

export type GraphSlice = {
  /** Entities eligible to be the subject of a round. */
  subjects: EntityRefRow[]
  edges: EdgeRow[]
  /** Every edge touching an entity, oriented from its point of view. */
  byEntity: Map<string, OrientedEdge[]>
  nodes: Map<string, EntityRefRow>
}

function index(edges: EdgeRow[]): { byEntity: Map<string, OrientedEdge[]>; nodes: Map<string, EntityRefRow> } {
  const byEntity = new Map<string, OrientedEdge[]>()
  const nodes = new Map<string, EntityRefRow>()

  const push = (entityId: string, oriented: OrientedEdge) => {
    const list = byEntity.get(entityId)
    if (list) list.push(oriented)
    else byEntity.set(entityId, [oriented])
  }

  for (const edge of edges) {
    nodes.set(edge.source.id, edge.source)
    nodes.set(edge.target.id, edge.target)

    push(edge.sourceEntityId, {
      edge,
      direction: 'OUTGOING',
      self: edge.source,
      other: edge.target,
    })
    push(edge.targetEntityId, {
      edge,
      direction: 'INCOMING',
      self: edge.target,
      other: edge.source,
    })
  }

  return { byEntity, nodes }
}

function requiredTypeIds(context: GeneratorContext): string[] {
  return context.definition.requiredRelationshipTypes
    .filter((link) => link.isRequired)
    .map((link) => link.relationshipTypeId)
}

/**
 * Eligible subjects, with one deliberate relaxation.
 *
 * `minProminence` exists so EASY asks about well-known members. In a young
 * archive that filter can empty the pool, and refusing to start a game is worse
 * than asking about a less famous member — so the prominence floor is dropped
 * before the required-relationship gate is, because the gate is what guarantees
 * the question is answerable at all.
 */
async function loadSubjects(context: GeneratorContext, needed: number): Promise<EntityRefRow[]> {
  const { definition, profile } = context
  const base = {
    entityType: definition.targetEntityType,
    requiredRelationshipTypeIds: requiredTypeIds(context),
    connectedToEntityId: context.scopeEntityId ?? undefined,
    limit: CANDIDATE_LIMIT,
  }

  const preferred = await findCandidateEntities({
    ...base,
    minProminence: profile.minProminence,
    maxProminence: profile.maxProminence,
  })
  if (preferred.length >= needed) return preferred

  const relaxed = await findCandidateEntities({ ...base, minProminence: 0, maxProminence: 100 })
  if (relaxed.length >= needed) return relaxed

  throw new InsufficientDataError(
    `Not enough eligible subjects for ${definition.name}.`,
    {
      needed,
      found: relaxed.length,
      hint:
        relaxed.length === 0
          ? 'No published entity of the target type has the relationships this game requires.'
          : `Add relationships to at least ${MIN_SUBJECTS_PER_DIFFICULTY} subjects so questions can vary.`,
    },
  )
}

/**
 * Load subjects plus a neighbourhood deep enough for the difficulty's hop count.
 *
 * Depth is `hopCount` levels of expansion from the subject pool: EASY needs the
 * subject's own edges, NIGHTMARE needs to be able to walk four of them.
 */
export async function loadGraphSlice(context: GeneratorContext): Promise<GraphSlice> {
  const optionCount = context.definition.answerMode === 'MULTIPLE_CHOICE' ? context.definition.optionCount : 1
  const needed = Math.max(context.rounds, optionCount)

  const subjects = await loadSubjects(context, needed)

  const edgeQuery = {
    asOf: context.scopeDate,
    quizzableOnly: true,
    publishedOnly: !context.graph.includeUnpublished,
  }

  const collected = new Map<string, EdgeRow>()
  const visited = new Set<string>(subjects.map((subject) => subject.id))
  let frontier = subjects.map((subject) => subject.id)

  const depth = Math.max(1, Math.min(4, context.profile.hopCount))

  for (let level = 0; level < depth; level += 1) {
    if (frontier.length === 0) break

    const rows = await findEdgesForEntities(frontier, edgeQuery)
    const discovered: string[] = []

    for (const row of rows) {
      collected.set(row.id, row)

      for (const end of [row.source, row.target]) {
        if (visited.has(end.id)) continue
        if (visited.size >= MAX_SLICE_NODES) continue
        visited.add(end.id)
        if (discovered.length < MAX_LEVEL_NODES) discovered.push(end.id)
      }
    }

    frontier = discovered
  }

  const edges = [...collected.values()]
  const { byEntity, nodes } = index(edges)

  for (const subject of subjects) {
    if (!nodes.has(subject.id)) nodes.set(subject.id, subject)
  }

  return { subjects, edges, byEntity, nodes }
}

/* -------------------------------------------------------------------------- */
/* In-memory graph reads                                                      */
/* -------------------------------------------------------------------------- */

export function edgesOf(slice: GraphSlice, entityId: string): OrientedEdge[] {
  return slice.byEntity.get(entityId) ?? []
}

export function edgesOfCode(
  slice: GraphSlice,
  entityId: string,
  code: string,
  direction?: EdgeDirection,
): OrientedEdge[] {
  return edgesOf(slice, entityId).filter(
    (oriented) =>
      oriented.edge.relationshipType.code === code &&
      (direction === undefined || oriented.direction === direction),
  )
}

export function firstEdgeOfCode(
  slice: GraphSlice,
  entityId: string,
  code: string,
  direction?: EdgeDirection,
): OrientedEdge | undefined {
  return edgesOfCode(slice, entityId, code, direction)[0]
}

/**
 * Every entity that shares a specific edge — "everyone else who was in Team J".
 *
 * This is what makes a multiple-choice round honest: distractors must be drawn
 * from entities that do *not* satisfy the clue, or two options are both right
 * and the question is broken.
 */
export function entitiesSharingEdge(
  slice: GraphSlice,
  code: string,
  farEndEntityId: string,
): Set<string> {
  const ids = new Set<string>()

  for (const edge of slice.edges) {
    if (edge.relationshipType.code !== code) continue
    if (edge.sourceEntityId === farEndEntityId) ids.add(edge.targetEntityId)
    if (edge.targetEntityId === farEndEntityId) ids.add(edge.sourceEntityId)
  }

  return ids
}

/** Load the specialized attribute rows for the subjects a session will use. */
export async function loadSubjectDetails(
  ids: readonly string[],
  includeUnpublished = false,
): Promise<Map<string, EntityWithAttributes>> {
  const rows = await Promise.all(ids.map((id) => findEntityById(id, includeUnpublished)))
  const map = new Map<string, EntityWithAttributes>()

  for (const row of rows) {
    if (row) map.set(row.id, row)
  }

  return map
}
