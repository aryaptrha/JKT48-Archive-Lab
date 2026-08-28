import { DIFFICULTY_ORDER } from '@/domain/difficulty'
import {
  GAME_CATALOG,
  GAME_TYPE_LABELS,
  GAME_TYPE_SLUGS,
  gameTypeFromSlug,
} from '@/domain/game-definitions'
import type { Difficulty, GameType } from '@/generated/prisma/enums'
import { toISODate } from '@/lib/date'
import type { EntityRef } from '@/types/graph'

import { findEntityRefsByIds } from '../repositories/entity-repository'
import { toEntityRef } from '../services/entity-mapper'
import { getGameCatalogue } from '../services/game-engine'

/**
 * Read models for the games surface (PRD §5, §20).
 *
 * Two sources are joined here, and the split matters. What a game *is* — its
 * rungs, their round counts, their answer modes, whether it reads a date — comes
 * from `GameDefinition` rows, so seeding a new rung makes it playable without a
 * code change (PRD §6). What a game *reads like* — the tagline, what it trains —
 * is editorial copy that belongs in the repository next to the design brief, not
 * in a database column no one will ever edit.
 *
 * A game listed in the copy with no rows is shown as unavailable rather than
 * hidden: "Daily Challenge — V1.1" is information, and a silently missing card
 * is not (PRD §5.5).
 */

export type GameRung = {
  definitionId: string
  difficulty: Difficulty
  label: string
  /** What the rung asks of the player, never how fast (PRD §P4). */
  cognition: string
  rounds: number
  answerMode: string
}

export type GameView = {
  gameType: GameType
  slug: string
  href: string
  label: string
  tagline: string
  description: string
  trains: string
  /** Editorial availability: false for games the PRD defers to V1.1. */
  isPlanned: boolean
  /** Whether the database actually has active rungs for it. */
  hasRungs: boolean
  /** Whether any rung resolves against a date, so the UI offers one. */
  acceptsDate: boolean
  rungs: GameRung[]
}

export type GamesIndex = {
  games: GameView[]
  /** Set when the player arrived from a mastery suggestion or a record page. */
  scope: EntityRef | null
  scopeDate: string | null
}

function rungOrder(a: GameRung, b: GameRung): number {
  return DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty)
}

async function resolveScope(scopeEntityId?: string | null): Promise<EntityRef | null> {
  if (!scopeEntityId) return null
  const [row] = await findEntityRefsByIds([scopeEntityId])
  return row ? toEntityRef(row) : null
}

/**
 * Merge definition rows into the editorial catalogue.
 *
 * Rows without matching copy still appear — a curator who seeds a game type this
 * file has never heard of should see it on the page rather than lose it.
 */
async function buildViews(): Promise<GameView[]> {
  const catalogue = await getGameCatalogue()
  const byType = new Map(catalogue.map((entry) => [entry.gameType, entry]))

  const views: GameView[] = GAME_CATALOG.map((copy) => {
    const rows = byType.get(copy.gameType)
    byType.delete(copy.gameType)

    const rungs = (rows?.difficulties ?? []).slice().sort(rungOrder)

    return {
      gameType: copy.gameType,
      slug: copy.slug,
      href: `/games/${copy.slug}`,
      label: copy.label,
      tagline: copy.tagline,
      description: copy.description,
      trains: copy.trains,
      isPlanned: !copy.isAvailable,
      hasRungs: rungs.length > 0,
      acceptsDate: rows?.acceptsDate ?? false,
      rungs,
    }
  })

  for (const orphan of byType.values()) {
    const slug = GAME_TYPE_SLUGS[orphan.gameType]
    views.push({
      gameType: orphan.gameType,
      slug,
      href: `/games/${slug}`,
      label: GAME_TYPE_LABELS[orphan.gameType],
      tagline: orphan.description ?? 'Seeded from the database.',
      description: orphan.description ?? '',
      trains: 'Recall from the knowledge graph.',
      isPlanned: false,
      hasRungs: orphan.difficulties.length > 0,
      acceptsDate: orphan.acceptsDate,
      rungs: orphan.difficulties.slice().sort(rungOrder),
    })
  }

  return views
}

export async function getGamesIndex(
  options: { scopeEntityId?: string | null; scopeDate?: Date | string | null } = {},
): Promise<GamesIndex> {
  const [games, scope] = await Promise.all([buildViews(), resolveScope(options.scopeEntityId)])
  return { games, scope, scopeDate: toISODate(options.scopeDate) ?? null }
}

export type GamePage = {
  game: GameView
  /** The other games, for the "or try" rail at the bottom. */
  others: GameView[]
  scope: EntityRef | null
  scopeDate: string | null
}

export async function getGamePage(
  slug: string,
  options: { scopeEntityId?: string | null; scopeDate?: Date | string | null } = {},
): Promise<GamePage | null> {
  const gameType = gameTypeFromSlug(slug)
  if (!gameType) return null

  const [views, scope] = await Promise.all([buildViews(), resolveScope(options.scopeEntityId)])
  const game = views.find((view) => view.gameType === gameType)
  if (!game) return null

  return {
    game,
    others: views.filter((view) => view.gameType !== gameType && view.hasRungs),
    scope,
    scopeDate: toISODate(options.scopeDate) ?? null,
  }
}
