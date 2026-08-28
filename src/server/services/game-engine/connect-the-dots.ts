import { entityHref, entityTypeLabel } from '@/domain/entity-taxonomy'
import { toISODate } from '@/lib/date'
import { clamp, shuffle } from '@/lib/utils'

import type { EntityRefRow } from '../../repositories/entity-repository'
import type { EdgeRow } from '../../repositories/relationship-repository'

import { attributionFor } from './attribution'
import { acceptedNames } from './options'
import { edgesOf, loadGraphSlice, type GraphSlice } from './pool'
import {
  InsufficientDataError,
  type ChoiceOption,
  type GeneratedChallenge,
  type GeneratorContext,
  type GraphEdgeSlot,
  type GraphNodeSlot,
  type QuestionGenerator,
} from './types'

/**
 * Connect the Dots (PRD §5.2).
 *
 * The player is shown a fragment of the real graph with pieces removed and has
 * to restore it. Relationships are worth more than entities (+20 vs +10) because
 * naming the edge is the harder recall — so difficulty spends its blanks on
 * relationships first.
 *
 * Every blank must be answerable from what is left on screen. Two rules enforce
 * that, and both are checked at generation time rather than hoped for:
 *
 *   - Two adjacent nodes are never hidden together. A hidden node is identified
 *     by its visible neighbours; hide both ends and the slot is a guess.
 *   - An edge is only blanked when both of its endpoints are visible.
 */

/** Smallest fragment worth calling a map. */
const MIN_MAP_EDGES = 2

/** Upper bound so a hub with sixty members does not become an unreadable wall. */
const MAX_MAP_EDGES = 8

const MAX_BLANKS = 5
const MIN_BLANKS = 2

/** Extra wrong choices offered alongside the correct pieces. */
const EXTRA_CHOICES = 4

const SHORTLIST_MULTIPLIER = 3

type GraphMap = {
  hub: EntityRefRow
  edges: EdgeRow[]
  nodes: EntityRefRow[]
  /** Node ids adjacent to each node, within the map only. */
  neighbours: Map<string, Set<string>>
}

/**
 * Grow a readable fragment outwards from a hub.
 *
 * Depth follows the difficulty's hop count, so a NIGHTMARE map is wide and an
 * EASY map is a simple star around one entity.
 */
function buildMap(
  slice: GraphSlice,
  hub: EntityRefRow,
  hops: number,
  random: () => number,
): GraphMap | null {
  const collected = new Map<string, EdgeRow>()
  const nodes = new Map<string, EntityRefRow>([[hub.id, hub]])
  const visited = new Set<string>([hub.id])
  let frontier = [hub.id]

  for (let level = 0; level < Math.max(1, hops); level += 1) {
    const discovered: string[] = []

    for (const nodeId of shuffle(frontier, random)) {
      for (const oriented of shuffle(edgesOf(slice, nodeId), random)) {
        if (collected.size >= MAX_MAP_EDGES) break
        if (collected.has(oriented.edge.id)) continue

        collected.set(oriented.edge.id, oriented.edge)
        nodes.set(oriented.self.id, oriented.self)
        nodes.set(oriented.other.id, oriented.other)

        if (!visited.has(oriented.other.id)) {
          visited.add(oriented.other.id)
          discovered.push(oriented.other.id)
        }
      }
      if (collected.size >= MAX_MAP_EDGES) break
    }

    if (collected.size >= MAX_MAP_EDGES || discovered.length === 0) break
    frontier = discovered
  }

  if (collected.size < MIN_MAP_EDGES) return null

  const edges = [...collected.values()]
  const neighbours = new Map<string, Set<string>>()

  for (const edge of edges) {
    for (const [from, to] of [
      [edge.sourceEntityId, edge.targetEntityId],
      [edge.targetEntityId, edge.sourceEntityId],
    ] as const) {
      const set = neighbours.get(from)
      if (set) set.add(to)
      else neighbours.set(from, new Set([to]))
    }
  }

  return { hub, edges, nodes: [...nodes.values()], neighbours }
}

/** How many pieces to remove: more reasoning, not more clicking. */
function blankBudget(clueCount: number, hopCount: number): number {
  return clamp(clueCount + hopCount - 1, MIN_BLANKS, MAX_BLANKS)
}

type Blanks = { hiddenNodes: EntityRefRow[]; missingEdges: EdgeRow[] }

function chooseBlanks(map: GraphMap, budget: number, random: () => number): Blanks {
  const wantEdges = Math.ceil(budget / 2)
  const wantNodes = budget - wantEdges

  const hiddenIds = new Set<string>()
  const hiddenNodes: EntityRefRow[] = []

  for (const node of shuffle(map.nodes, random)) {
    if (hiddenNodes.length >= wantNodes) break
    if (node.id === map.hub.id) continue

    const adjacent = map.neighbours.get(node.id) ?? new Set<string>()
    const touchesHidden = [...adjacent].some((id) => hiddenIds.has(id))
    if (touchesHidden) continue

    hiddenIds.add(node.id)
    hiddenNodes.push(node)
  }

  const missingEdges: EdgeRow[] = []

  for (const edge of shuffle(map.edges, random)) {
    if (missingEdges.length >= wantEdges) break
    if (hiddenIds.has(edge.sourceEntityId) || hiddenIds.has(edge.targetEntityId)) continue
    missingEdges.push(edge)
  }

  return { hiddenNodes, missingEdges }
}

/**
 * Wrong entities to offer alongside the hidden ones.
 *
 * Drawn from the same entity types as the hidden nodes so the choice is about
 * knowing the archive, not about spotting the one option of the right kind.
 */
function nodeDistractors(
  slice: GraphSlice,
  map: GraphMap,
  hidden: readonly EntityRefRow[],
  count: number,
  random: () => number,
): EntityRefRow[] {
  const inMap = new Set(map.nodes.map((node) => node.id))
  const wantedTypes = new Set(hidden.map((node) => node.entityType))

  const pool = [...slice.nodes.values()].filter((node) => !inMap.has(node.id))
  const sameType = pool.filter((node) => wantedTypes.has(node.entityType))
  const chosen = shuffle(sameType.length >= count ? sameType : pool, random)

  return chosen.slice(0, count)
}

/** Wrong relationship labels: other vocabulary actually in use nearby. */
function edgeDistractorCodes(
  slice: GraphSlice,
  correct: ReadonlySet<string>,
  count: number,
  random: () => number,
): { code: string; name: string; description: string | null }[] {
  const seen = new Map<string, { code: string; name: string; description: string | null }>()

  for (const edge of slice.edges) {
    const type = edge.relationshipType
    if (correct.has(type.code) || seen.has(type.code)) continue
    seen.set(type.code, { code: type.code, name: type.name, description: type.description })
  }

  return shuffle([...seen.values()], random).slice(0, count)
}

function buildRound(
  context: GeneratorContext,
  slice: GraphSlice,
  hub: EntityRefRow,
  ordinal: number,
): GeneratedChallenge | null {
  const { definition, profile } = context

  const map = buildMap(slice, hub, profile.hopCount, context.random)
  if (!map) return null

  const budget = blankBudget(profile.clueCount, profile.hopCount)
  const { hiddenNodes, missingEdges } = chooseBlanks(map, budget, context.random)
  if (hiddenNodes.length === 0 && missingEdges.length === 0) return null

  const hiddenIds = new Set(hiddenNodes.map((node) => node.id))
  const missingEdgeIds = new Set(missingEdges.map((edge) => edge.id))

  const nodes: GraphNodeSlot[] = map.nodes.map((node) => ({
    id: node.id,
    label: hiddenIds.has(node.id) ? null : node.canonicalName,
    entityTypeLabel: entityTypeLabel(node.entityType),
    isUnknown: hiddenIds.has(node.id),
  }))

  // Edges render in their stored orientation (source → target), so the label is
  // always the forward name and the player never has to guess which way an
  // inverse reads.
  const edges: GraphEdgeSlot[] = map.edges.map((edge) => ({
    id: edge.id,
    fromNodeId: edge.sourceEntityId,
    toNodeId: edge.targetEntityId,
    label: missingEdgeIds.has(edge.id) ? null : edge.relationshipType.name,
    isMissing: missingEdgeIds.has(edge.id),
  }))

  const distractors = nodeDistractors(
    slice,
    map,
    hiddenNodes,
    hiddenNodes.length === 0 ? 0 : EXTRA_CHOICES,
    context.random,
  )
  const nodeChoices: ChoiceOption[] = shuffle([...hiddenNodes, ...distractors], context.random).map(
    (node) => ({
      id: node.id,
      label: node.canonicalName,
      detail: entityTypeLabel(node.entityType),
    }),
  )

  const correctCodes = new Set(missingEdges.map((edge) => edge.relationshipType.code))
  const wrongCodes =
    missingEdges.length === 0
      ? []
      : edgeDistractorCodes(slice, correctCodes, EXTRA_CHOICES, context.random)
  const correctTypes = missingEdges.map((edge) => ({
    code: edge.relationshipType.code,
    name: edge.relationshipType.name,
    description: edge.relationshipType.description,
  }))
  const edgeChoices: ChoiceOption[] = shuffle(
    [...new Map([...correctTypes, ...wrongCodes].map((type) => [type.code, type])).values()],
    context.random,
  ).map((type) => ({ id: type.code, label: type.name, detail: type.description }))

  const attribution = attributionFor(definition, slice, hub.id)

  const filled = [
    ...missingEdges.map((edge) => {
      const source = map.nodes.find((node) => node.id === edge.sourceEntityId)
      const target = map.nodes.find((node) => node.id === edge.targetEntityId)
      return `${source?.canonicalName ?? '?'} ${edge.relationshipType.name} ${target?.canonicalName ?? '?'}`
    }),
    ...hiddenNodes.map((node) => `${node.canonicalName} (${entityTypeLabel(node.entityType)})`),
  ]

  return {
    ordinal,
    questionStrategy: definition.questionStrategy,
    answerMode: definition.answerMode,
    prompt: {
      kind: 'GRAPH',
      question: `Restore the missing pieces of the map around ${hub.canonicalName}.`,
      nodes,
      edges,
      nodeChoices,
      edgeChoices,
      asOf: toISODate(context.scopeDate) ?? null,
    },
    options: null,
    solution: {
      answer: {
        kind: 'GRAPH',
        nodes: hiddenNodes.map((node) => ({
          slotId: node.id,
          label: node.canonicalName,
          accepted: acceptedNames(node).accepted,
        })),
        edges: missingEdges.map((edge) => ({
          slotId: edge.id,
          code: edge.relationshipType.code,
          label: edge.relationshipType.name,
        })),
      },
      explanation: filled.join('; ') + '.',
      revealHref: entityHref(hub),
      revealLabel: `Open ${hub.canonicalName}`,
    },
    subjectEntityId: hub.id,
    masteryScope: attribution.scope,
    masteryTargetId: attribution.targetEntityId,
    masteryDimension: attribution.dimension,
  }
}

export const generateConnectTheDots: QuestionGenerator = async (context) => {
  const slice = await loadGraphSlice(context)

  const shortlist = shuffle(slice.subjects, context.random).slice(
    0,
    context.rounds * SHORTLIST_MULTIPLIER,
  )

  const challenges: GeneratedChallenge[] = []

  for (const hub of shortlist) {
    if (challenges.length >= context.rounds) break
    const built = buildRound(context, slice, hub, challenges.length + 1)
    if (built) challenges.push(built)
  }

  if (challenges.length === 0) {
    throw new InsufficientDataError(`Could not build a map for ${context.definition.name}.`, {
      needed: context.rounds,
      found: 0,
      hint: `A map needs at least ${MIN_MAP_EDGES} quizzable relationships around one entity. Add relationships to the subjects in scope.`,
    })
  }

  return challenges
}
