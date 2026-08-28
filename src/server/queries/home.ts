import { entityTypeLabel } from '@/domain/entity-taxonomy'
import { GAME_CATALOG, GAME_TYPE_SLUGS } from '@/domain/game-definitions'
import { formatDate, toISODate } from '@/lib/date'
import type { EntityRef } from '@/types/graph'

import { listEntities } from '../repositories/entity-repository'
import { countRelationships } from '../repositories/relationship-repository'
import { toEntityRef } from '../services/entity-mapper'
import { getGameCatalogue, type GameCatalogueEntry } from '../services/game-engine'
import { getSnapshot } from '../services/time-machine'

import { getExploreIndex, getCollectionHighlights, type CollectionMeta, type ExploreCard } from './explore'
import { getTimeline, type TimelineEvent } from './timeline'

/**
 * The home page read model (PRD §20 `/`, §P5).
 *
 * The landing page has one job: make it obvious that this is an archive of a
 * connected history, not a list of pages. So every number on it is counted from
 * the graph, the "today" panel is a real temporal read rather than a marketing
 * figure, and the games shown are the ones the database actually has definitions
 * for.
 *
 * Nothing here is hand-curated. A record becomes a highlight by having a high
 * prominence, a game appears by having an active definition, and an era appears by
 * covering today's date. That way the page keeps telling the truth as the archive
 * grows, without an editor maintaining a copy of it.
 */

export type ArchiveScale = {
  entities: number
  relationships: number
  collections: number
}

export type HomeRail = {
  collection: CollectionMeta
  cards: ExploreCard[]
}

export type TodayPanel = {
  asOf: string
  asOfLabel: string
  eraName: string | null
  eraDescription: string | null
  activeMembers: number
  teams: number
  generations: number
  /** A few of the members on a roster today, for faces rather than a number. */
  faces: EntityRef[]
}

export type GameTeaser = {
  gameType: GameCatalogueEntry['gameType']
  label: string
  tagline: string
  trains: string
  href: string
  difficultyCount: number
}

export type HomePage = {
  scale: ArchiveScale
  collections: CollectionMeta[]
  rails: HomeRail[]
  today: TodayPanel
  /** The most recent transitions, as a teaser for the full timeline. */
  recentChanges: TimelineEvent[]
  /** Records touched most recently, which is what a returning reader wants. */
  recentlyUpdated: ExploreCard[]
  games: GameTeaser[]
}

/** Collections given a rail of their own, in the order they appear on the page. */
const RAIL_SLUGS = ['members', 'generations', 'songs'] as const

const RAIL_SIZE = 6
const RECENT_CHANGE_COUNT = 6
const FACE_COUNT = 5

/**
 * Games with at least one active definition, joined to their catalogue copy.
 *
 * The copy lives in the domain layer and the availability lives in the database,
 * which is the split that lets Daily Challenge ship as a seeded-inactive row: it
 * is described in `GAME_CATALOG` and simply never appears here until an admin
 * activates it (PRD §5.5, §6).
 */
function toGameTeasers(catalogue: GameCatalogueEntry[]): GameTeaser[] {
  const teasers: GameTeaser[] = []

  for (const entry of catalogue) {
    const copy = GAME_CATALOG.find((game) => game.gameType === entry.gameType)
    if (!copy) continue

    teasers.push({
      gameType: entry.gameType,
      label: copy.label,
      tagline: copy.tagline,
      trains: copy.trains,
      href: `/games/${GAME_TYPE_SLUGS[entry.gameType]}`,
      difficultyCount: entry.difficulties.length,
    })
  }

  return teasers
}

/**
 * One read for the whole landing page.
 *
 * The six queries are independent, so they run together. The alternative — a
 * component per panel, each with its own await — is the waterfall that makes a
 * server-rendered home page feel slower than a client-rendered one.
 */
export async function getHomePage(): Promise<HomePage> {
  const [index, relationships, snapshot, timeline, recent, catalogue, ...rails] = await Promise.all([
    getExploreIndex(),
    countRelationships(),
    getSnapshot(),
    getTimeline(),
    listEntities({ pageSize: RAIL_SIZE, orderBy: 'recent' }),
    getGameCatalogue(),
    ...RAIL_SLUGS.map((slug) => getCollectionHighlights(slug, RAIL_SIZE)),
  ])

  const collectionsBySlug = new Map(index.collections.map((entry) => [entry.slug, entry]))

  return {
    scale: {
      entities: index.total,
      relationships,
      collections: index.collections.filter((entry) => entry.count > 0).length,
    },
    collections: index.collections,
    rails: RAIL_SLUGS.flatMap((slug, position) => {
      const collection = collectionsBySlug.get(slug)
      const cards = rails[position] ?? []
      // A rail with nothing in it is left out rather than rendered empty: a young
      // archive should look small, not broken.
      if (!collection || cards.length === 0) return []
      return [{ collection, cards }]
    }),
    today: {
      asOf: toISODate(snapshot.asOf) ?? '',
      asOfLabel: formatDate(snapshot.asOf),
      eraName: snapshot.era?.name ?? null,
      eraDescription: snapshot.era?.description ?? null,
      activeMembers: snapshot.totals.members,
      teams: snapshot.totals.teams,
      generations: snapshot.totals.generations,
      faces: snapshot.activeMembers.slice(0, FACE_COUNT),
    },
    recentChanges: timeline.years.flatMap((year) => year.events).slice(0, RECENT_CHANGE_COUNT),
    recentlyUpdated: recent.rows.map((row) => ({
      ...toEntityRef(row),
      // Deliberately unenriched: this strip answers "what changed", and a
      // subtitle would cost a graph lookup per row for a line nobody reads here.
      meta: entityTypeLabel(row.entityType),
      dateline: null,
      prominence: row.prominence,
    })),
    games: toGameTeasers(catalogue),
  }
}
