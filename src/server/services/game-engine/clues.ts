import { entityTypeLabel } from '@/domain/entity-taxonomy'
import type { EdgeDirection } from '@/types/graph'
import { formatDateRange } from '@/lib/date'
import { pickOne, shuffle } from '@/lib/utils'

import type { EntityRefRow, EntityWithAttributes } from '../../repositories/entity-repository'
import { toEntityAttributes } from '../entity-mapper'

import { edgesOf, type GraphSlice, type OrientedEdge } from './pool'
import type { ChainStep, Clue } from './types'

/**
 * Turning graph facts into clues.
 *
 * Two rules the generators depend on:
 *
 *   1. A clue never names the thing being asked about. Identity attributes are
 *      filtered out here rather than in each generator, because forgetting that
 *      filter once produces a question that answers itself.
 *   2. A chain of clues must resolve to exactly one subject. `resolveChainHeads`
 *      checks that against the loaded slice, so an ambiguous chain is discarded
 *      at generation time instead of being argued about after the answer.
 */

export function edgeLabel(oriented: OrientedEdge): string {
  const type = oriented.edge.relationshipType
  return oriented.direction === 'OUTGOING' ? type.name : (type.inverseName ?? type.name)
}

function temporalSuffix(oriented: OrientedEdge): string {
  const { edge } = oriented
  if (!edge.relationshipType.isTemporal) return ''
  if (!edge.validFrom && !edge.validTo) return ''
  return ` (${formatDateRange(edge.validFrom, edge.validTo)})`
}

/** "Team — member of Team J (May 2013 — present)" */
export function relationshipClue(oriented: OrientedEdge): Clue {
  return {
    kind: oriented.edge.relationshipType.isTemporal ? 'TEMPORAL' : 'RELATIONSHIP',
    label: entityTypeLabel(oriented.other.entityType),
    text: `${edgeLabel(oriented)} ${oriented.other.canonicalName}${temporalSuffix(oriented)}`,
  }
}

/**
 * Attribute clues from the specialized row.
 *
 * Identity fields are excluded — a stage name or a title *is* the answer. Recall
 * targets come first because they are the facts a fan actually holds in memory;
 * bookkeeping fields make for dull clues.
 */
export function attributeClues(entity: EntityWithAttributes): Clue[] {
  const attributes = toEntityAttributes(entity).filter((attr) => !attr.isIdentity)
  const ordered = [
    ...attributes.filter((attr) => attr.isRecallTarget),
    ...attributes.filter((attr) => !attr.isRecallTarget),
  ]

  return ordered.map((attr) => ({
    kind: 'ATTRIBUTE' as const,
    label: attr.label,
    text: attr.value,
  }))
}

/* -------------------------------------------------------------------------- */
/* Chains                                                                     */
/* -------------------------------------------------------------------------- */

export type ChainLink = {
  code: string
  /** Direction relative to the *earlier* node in the chain. */
  direction: EdgeDirection
  toEntityId: string
}

export type Chain = {
  path: OrientedEdge[]
  links: ChainLink[]
  end: EntityRefRow
}

function reverse(direction: EdgeDirection): EdgeDirection {
  return direction === 'OUTGOING' ? 'INCOMING' : 'OUTGOING'
}

/**
 * Walk `hops` edges away from an entity, without revisiting a node.
 *
 * Returns undefined when the neighbourhood runs out, which is normal in a young
 * archive — the caller tries another subject rather than shortening the chain,
 * because a shortened chain is a different difficulty.
 */
export function buildChain(
  slice: GraphSlice,
  startEntityId: string,
  hops: number,
  random: () => number,
): Chain | undefined {
  const visited = new Set<string>([startEntityId])
  const path: OrientedEdge[] = []
  const links: ChainLink[] = []
  let current = startEntityId

  for (let hop = 0; hop < hops; hop += 1) {
    const options = edgesOf(slice, current).filter((oriented) => !visited.has(oriented.other.id))
    const chosen = pickOne(shuffle(options, random), random)
    if (!chosen) return undefined

    visited.add(chosen.other.id)
    path.push(chosen)
    links.push({
      code: chosen.edge.relationshipType.code,
      direction: chosen.direction,
      toEntityId: chosen.other.id,
    })
    current = chosen.other.id
  }

  const last = path[path.length - 1]
  if (!last) return undefined

  return { path, links, end: last.other }
}

/**
 * Every entity the chain could describe, walked backwards from its far end.
 *
 * Uniqueness is judged against the loaded slice, which covers the candidate pool
 * completely. An entity outside the pool could in principle also satisfy the
 * chain; that is why free-text rounds accept the canonical answer *and* its
 * aliases rather than treating the pool as the whole world.
 */
export function resolveChainHeads(slice: GraphSlice, links: readonly ChainLink[]): Set<string> {
  if (links.length === 0) return new Set()

  const lastLink = links[links.length - 1]
  if (!lastLink) return new Set()

  let frontier = new Set<string>([lastLink.toEntityId])

  for (let i = links.length - 1; i >= 0; i -= 1) {
    const link = links[i]
    if (!link) return new Set()

    const previous = new Set<string>()
    const wanted = reverse(link.direction)

    for (const nodeId of frontier) {
      for (const oriented of edgesOf(slice, nodeId)) {
        if (oriented.edge.relationshipType.code !== link.code) continue
        if (oriented.direction !== wanted) continue
        previous.add(oriented.other.id)
      }
    }

    if (previous.size === 0) return new Set()
    frontier = previous
  }

  return frontier
}

/** The chain as the player sees it: an unknown head followed by named hops. */
export function describeChain(chain: Chain): ChainStep[] {
  const head: ChainStep = { relationshipLabel: '', entityLabel: null, isUnknown: true }

  return [
    head,
    ...chain.path.map((oriented) => ({
      relationshipLabel: edgeLabel(oriented),
      entityLabel: oriented.other.canonicalName,
      isUnknown: false,
    })),
  ]
}

/** Prose version of a chain, for the reveal panel and audit-friendly logs. */
export function chainSentence(chain: Chain, subjectName: string): string {
  const hops = chain.path
    .map((oriented) => `${edgeLabel(oriented)} ${oriented.other.canonicalName}`)
    .join(', which is ')
  return `${subjectName} ${hops}.`
}
