import { unstable_cache } from 'next/cache'

import { entityTypeLabel } from '@/domain/entity-taxonomy'
import { GAME_CATALOG, GAME_TYPE_SLUGS } from '@/domain/game-definitions'
import { formatDate, toDateOnly, today, toISODate } from '@/lib/date'
import type { EntityRef } from '@/types/graph'

import { ARCHIVE_CACHE_SECONDS, ARCHIVE_TAGS } from '../cache/tags'
import { listEntities } from '../repositories/entity-repository'
import {
  countRelationships,
  findRecentTransitions,
} from '../repositories/relationship-repository'
import { toEntityRef } from '../services/entity-mapper'
import { getGameCatalogue, type GameCatalogueEntry } from '../services/game-engine'
import { getSnapshot } from '../services/time-machine'

import { getExploreIndex, getCollectionHighlights, type CollectionMeta, type ExploreCard } from './explore'
import type { TransitionKind } from './timeline'

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
 *
 * Every panel is identical for every visitor, so each is cached across requests
 * and dropped by tag the moment a curator edits (`server/cache/tags.ts`). The
 * panels that depend on the current date are keyed by it, which is what makes them
 * roll over at midnight rather than at the end of a fixed window. Every cached
 * view model here is deliberately free of `Date` values — `unstable_cache`
 * serializes its results, and a `Date` would come back as a string.
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

/**
 * One line in the "latest changes" panel.
 *
 * A trimmed relative of `TimelineEvent`, carrying only what the panel renders and
 * — the point — no raw `Date`, so the panel can be cached. The full timeline keeps
 * its dates because it groups and sorts by them.
 */
export type RecentChange = {
  id: string
  kind: TransitionKind
  dateLabel: string
  /** The relationship's own name from the editable vocabulary (PRD §19). */
  relationship: string
  subject: EntityRef
  object: EntityRef
}

export type HomePage = {
  scale: ArchiveScale
  collections: CollectionMeta[]
  rails: HomeRail[]
  today: TodayPanel
  /** The most recent transitions, as a teaser for the full timeline. */
  recentChanges: RecentChange[]
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

const getGameTeasers = unstable_cache(
  async (): Promise<GameTeaser[]> => toGameTeasers(await getGameCatalogue()),
  ['home:games'],
  { tags: [ARCHIVE_TAGS.games], revalidate: ARCHIVE_CACHE_SECONDS },
)

/**
 * A `count(*)` over the largest table in the archive, which every visitor asks
 * for and which only a curator can change.
 */
const getRelationshipCount = unstable_cache(countRelationships, ['home:relationship-count'], {
  tags: [ARCHIVE_TAGS.graph],
  revalidate: ARCHIVE_CACHE_SECONDS,
})

const getRecentlyUpdated = unstable_cache(
  async (): Promise<ExploreCard[]> => {
    const { rows } = await listEntities({
      pageSize: RAIL_SIZE,
      orderBy: 'recent',
      withTotal: false,
    })

    return rows.map((row) => ({
      ...toEntityRef(row),
      // Deliberately unenriched: this strip answers "what changed", and a
      // subtitle would cost a graph lookup per row for a line nobody reads here.
      meta: entityTypeLabel(row.entityType),
      dateline: null,
      prominence: row.prominence,
    }))
  },
  ['home:recently-updated'],
  { tags: [ARCHIVE_TAGS.graph], revalidate: ARCHIVE_CACHE_SECONDS },
)

/**
 * Today's temporal read, keyed by the date it describes.
 *
 * `getSnapshot` is left untouched and still backs the Time Machine page and game,
 * where the date is a parameter the reader chooses. Here the date is always today,
 * so the answer is the same for everyone until midnight — and the ISO date in the
 * key is what ends the entry then, without a shorter revalidate window.
 */
const getCachedTodayPanel = unstable_cache(
  async (isoDate: string): Promise<TodayPanel> => {
    const snapshot = await getSnapshot(isoDate)

    return {
      asOf: toISODate(snapshot.asOf) ?? '',
      asOfLabel: formatDate(snapshot.asOf),
      eraName: snapshot.era?.name ?? null,
      eraDescription: snapshot.era?.description ?? null,
      activeMembers: snapshot.totals.members,
      teams: snapshot.totals.teams,
      generations: snapshot.totals.generations,
      faces: snapshot.activeMembers.slice(0, FACE_COUNT),
    }
  },
  ['home:today'],
  { tags: [ARCHIVE_TAGS.graph], revalidate: ARCHIVE_CACHE_SECONDS },
)

/**
 * The "today" panel on its own.
 *
 * The masthead names the current era, and the masthead is the part of the page
 * that streams first — so it needs this one panel without waiting for the batch
 * `getHomePage` assembles. Both callers resolve the same cache key, so asking
 * twice in one render costs one read.
 */
export async function getTodayPanel(): Promise<TodayPanel> {
  return getCachedTodayPanel(toISODate(today()) ?? '')
}

/**
 * The latest transitions in the graph.
 *
 * This used to be `getTimeline()` sliced to six: every dated edge since 2011,
 * four joins per row, read in full so that six lines could be rendered. Now the
 * repository answers the question the panel asks. `getTimeline()` is unchanged and
 * still serves `/history/timeline`, which genuinely wants the whole column.
 */
const getCachedRecentChanges = unstable_cache(
  async (isoDate: string, limit: number): Promise<RecentChange[]> => {
    const transitions = await findRecentTransitions(limit, toDateOnly(isoDate) ?? today())

    return transitions.map(({ row, kind, date }) => ({
      id: `${row.id}:${kind}`,
      kind,
      dateLabel: formatDate(date),
      relationship: row.relationshipType.name,
      // The stored orientation, which is the direction the relationship's own
      // name is phrased for — same convention as the timeline.
      subject: toEntityRef(row.source),
      object: toEntityRef(row.target),
    }))
  },
  ['home:recent-changes'],
  { tags: [ARCHIVE_TAGS.graph], revalidate: ARCHIVE_CACHE_SECONDS },
)

/**
 * One read for the whole landing page.
 *
 * The panels are independent, so they run together. The alternative — a component
 * per panel, each with its own await — is the waterfall that makes a
 * server-rendered home page feel slower than a client-rendered one.
 */
export async function getHomePage(): Promise<HomePage> {
  const isoToday = toISODate(today()) ?? ''

  const [index, relationships, todayPanel, recentChanges, recentlyUpdated, games, ...rails] =
    await Promise.all([
      getExploreIndex(),
      getRelationshipCount(),
      getCachedTodayPanel(isoToday),
      getCachedRecentChanges(isoToday, RECENT_CHANGE_COUNT),
      getRecentlyUpdated(),
      getGameTeasers(),
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
    today: todayPanel,
    recentChanges,
    recentlyUpdated,
    games,
  }
}
