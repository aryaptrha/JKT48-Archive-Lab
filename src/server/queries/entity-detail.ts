import { GAME_CATALOG, GAME_TYPE_LABELS, gameHref } from '@/domain/game-definitions'
import { collectionForEntityType, entityTypeLabel } from '@/domain/entity-taxonomy'
import { REL } from '@/domain/relationship-types'
import { EntityType, type GameType } from '@/generated/prisma/enums'
import { formatDateRange, toISODate } from '@/lib/date'
import type { EntityDetail, EntityRef, Subgraph } from '@/types/graph'

import { findCandidateEntities } from '../repositories/entity-repository'
import { listGameDefinitions } from '../repositories/game-repository'
import { getEntityDetailBySlug, getSingleNeighbor, getSubgraph } from '../services/knowledge-graph'
import { effectiveProfile } from '../services/game-engine'

import { getCollectionHighlights, type ExploreCard } from './explore'

/**
 * The entity page read model (PRD §20 `/explore/[type]/[slug]`, §4.1).
 *
 * An entity page is the archive's primary unit, so this is the busiest read in
 * the app: the record itself, its relationships grouped into sections, the
 * surrounding neighbourhood, the games it can be practised through, and enough
 * neighbouring records to keep browsing. All of it assembled here so the page
 * component receives one object and renders it.
 *
 * The whole page is one `asOf`-aware read. Passing a date resolves every
 * relationship as it stood then (PRD §11), which is what makes an entity page and
 * the Time Machine two views of one graph rather than two features that happen to
 * agree.
 */

/** One difficulty rung offered for a game, from the row that defines it. */
export type PracticeRung = {
  definitionId: string
  difficulty: string
  label: string
  /** The cognitive demand this rung asks for — never "less time" (PRD §P4). */
  cognition: string
  rounds: number
  href: string
}

export type PracticeOption = {
  gameType: GameType
  label: string
  tagline: string | null
  href: string
  rungs: PracticeRung[]
}

export type EntityPage = {
  entity: EntityDetail
  collection: { slug: string; label: string; singular: string } | null
  typeLabel: string
  /** Set when the page is being read as it stood on a past date. */
  asOf: string | null
  /**
   * The generation this record belongs to, resolved through the graph rather
   * than read off a column (PRD §10). V1 mastery is scoped per generation, so
   * this is both a navigation link and the target practice attaches to.
   */
  generation: EntityRef | null
  /** Relationships within one step, for the connections panel. */
  neighbourhood: Subgraph | null
  practice: PracticeOption[]
  related: ExploreCard[]
}

/**
 * Which generation a record sits under.
 *
 * A generation is its own; a member's is one edge away. Anything else has none,
 * and saying so is better than inferring one from a date.
 */
async function resolveGeneration(
  entity: EntityDetail,
  asOf: Date | null,
): Promise<EntityRef | null> {
  if (entity.entityType === EntityType.GENERATION) {
    return {
      id: entity.id,
      entityType: entity.entityType,
      category: entity.category,
      canonicalName: entity.canonicalName,
      slug: entity.slug,
      summary: entity.summary,
      imageUrl: entity.imageUrl,
      href: entity.href,
    }
  }

  if (entity.entityType !== EntityType.MEMBER) return null

  const generation = await getSingleNeighbor(
    entity.id,
    REL.BELONGS_TO_GENERATION,
    { asOf },
    'OUTGOING',
  )
  return generation ?? null
}

/**
 * Which entity a game round should be narrowed to when started from this page.
 *
 * The engine restricts subjects to entities connected to the scope, in either
 * direction. That makes a generation, a team or a song a usable scope, but not a
 * member: members are not connected to each other, so "Test this member" would
 * produce an empty pool. A member is practised through her generation instead —
 * which is also the unit mastery is measured in (PRD §8).
 */
function practiceScope(entity: EntityDetail, generation: EntityRef | null): string | null {
  if (entity.entityType === EntityType.MEMBER) return generation?.id ?? null
  return entity.id
}

/**
 * The games that can be played about this record.
 *
 * Assembled from active `GameDefinition` rows, so seeding a new game or retiring
 * one changes this block without a code change, and no game name is written here
 * (PRD §6). Grouped by game type because five games times five rungs is a wall of
 * buttons; the rungs travel with the group so the UI can reveal them in place.
 *
 * Eligibility is checked once per distinct target type rather than per
 * definition: whether a scope yields subjects is a property of the graph, and
 * offering a link that lands on "not enough data" is worse than offering nothing.
 */
async function practiceOptions(
  entity: EntityDetail,
  generation: EntityRef | null,
): Promise<PracticeOption[]> {
  const scope = practiceScope(entity, generation)
  if (!scope) return []

  const definitions = await listGameDefinitions()
  if (definitions.length === 0) return []

  const targetTypes = [...new Set(definitions.map((definition) => definition.targetEntityType))]
  const eligibility = await Promise.all(
    targetTypes.map(async (entityType) => {
      const candidates = await findCandidateEntities({
        entityType,
        connectedToEntityId: scope,
        limit: 1,
      })
      return [entityType, candidates.length > 0] as const
    }),
  )
  const playable = new Map(eligibility)

  const grouped = new Map<GameType, PracticeOption>()

  for (const definition of definitions) {
    if (!playable.get(definition.targetEntityType)) continue

    const profile = effectiveProfile(definition)
    const base = `${gameHref(definition.gameType)}?scope=${scope}`

    let option = grouped.get(definition.gameType)
    if (!option) {
      const catalogue = GAME_CATALOG.find((entry) => entry.gameType === definition.gameType)
      option = {
        gameType: definition.gameType,
        label: GAME_TYPE_LABELS[definition.gameType],
        tagline: catalogue?.tagline ?? null,
        href: base,
        rungs: [],
      }
      grouped.set(definition.gameType, option)
    }

    option.rungs.push({
      definitionId: definition.id,
      difficulty: definition.difficulty,
      label: profile.label,
      cognition: profile.cognition,
      rounds: definition.roundCount,
      href: `${base}&definition=${definition.id}`,
    })
  }

  return [...grouped.values()]
}

/** Neighbouring records to keep browsing, minus the one being read. */
async function relatedRecords(entity: EntityDetail): Promise<ExploreCard[]> {
  const collection = collectionForEntityType(entity.entityType)
  if (!collection) return []

  const highlights = await getCollectionHighlights(collection.slug, 7)
  return highlights.filter((card) => card.id !== entity.id).slice(0, 6)
}

/**
 * One entity page. Returns null when the slug is unknown or the record is
 * unpublished, so the route calls `notFound()` rather than rendering a shell.
 */
export async function getEntityPage(
  slug: string,
  options: { asOf?: Date | null } = {},
): Promise<EntityPage | null> {
  const asOf = options.asOf ?? null

  const entity = await getEntityDetailBySlug(slug, { asOf })
  if (!entity) return null

  // Everything below depends on the generation, so this one await is sequential.
  const generation = await resolveGeneration(entity, asOf)

  const [neighbourhood, practice, related] = await Promise.all([
    getSubgraph(entity.id, { depth: 1, maxNodes: 24 }, { asOf }),
    practiceOptions(entity, generation),
    relatedRecords(entity),
  ])

  const collection = collectionForEntityType(entity.entityType)

  return {
    entity,
    collection: collection
      ? { slug: collection.slug, label: collection.label, singular: collection.singular }
      : null,
    typeLabel: entityTypeLabel(entity.entityType),
    asOf: asOf ? (toISODate(asOf) ?? null) : null,
    generation,
    neighbourhood,
    practice,
    related,
  }
}

/**
 * The byline under an entity's title: what it is, when it ran, where the record
 * came from.
 *
 * Here rather than in a component because "Member · 2013–2018 · Fandom" is a
 * formatting decision that should read the same on a page header and in an admin
 * list.
 */
export function entityByline(entity: EntityDetail): string {
  const parts = [
    entityTypeLabel(entity.entityType),
    entity.activeFrom || entity.activeTo ? formatDateRange(entity.activeFrom, entity.activeTo) : null,
    entity.source?.name ?? null,
  ]

  return parts.filter(Boolean).join(' · ')
}
