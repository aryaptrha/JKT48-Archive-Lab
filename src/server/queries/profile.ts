import { GAME_TYPE_LABELS, GAME_TYPE_SLUGS } from '@/domain/game-definitions'
import { SESSION_STATUS_LABELS } from '@/domain/labels'
import { difficultyProfile } from '@/domain/difficulty'
import type { GameSessionStatus } from '@/generated/prisma/enums'
import { formatDate } from '@/lib/date'
import type { EntityRef } from '@/types/graph'

import { countSessions, listRecentSessions } from '../repositories/game-repository'
import { findProfileById } from '../repositories/user-repository'
import { toEntityRef } from '../services/entity-mapper'
import {
  getMasteryBands,
  getMasteryOverview,
  type MasteryDimensionView,
  type MasteryOverview,
  type MasteryScopeView,
  type MasteryStatusView,
} from '../services/mastery'

/**
 * Read models for the authenticated area (PRD §20 `/me`, §8).
 *
 * Everything here is scoped to one user id, which the caller must have obtained
 * from a resolved session — these functions take an id, never a request, and never
 * decide who is asking. A page that passes the wrong id is a bug in the page, and
 * keeping that decision at the route boundary is what makes it reviewable.
 *
 * Mastery itself is computed in `services/mastery`; this file adds the framing the
 * `/me` pages render: which band a score falls in (from data, never from a name
 * matched in code — PRD §8.3), what to practise next, and what has been played.
 */

export type ProfileSummary = {
  id: string
  email: string | null
  displayName: string | null
  role: string
  joinedAt: Date
  joinedLabel: string
}

export type SessionSummary = {
  id: string
  gameLabel: string
  gameHref: string
  difficultyLabel: string
  /** What the rung asked of the player, not how fast it asked (PRD §P4). */
  cognition: string
  status: GameSessionStatus
  statusLabel: string
  score: number
  correctCount: number
  totalRounds: number
  accuracy: number
  scope: EntityRef | null
  startedAt: Date
  startedLabel: string
  completedAt: Date | null
  /** Set while a session is resumable, so `/me` can offer to continue it. */
  resumeHref: string | null
}

export type ProgressStats = {
  sessionsCompleted: number
  answersCorrect: number
  totalAttempts: number
  practisedDimensions: number
  overall: number
  status: MasteryStatusView | null
}

/**
 * The next thing worth practising.
 *
 * Derived from the weakest attempted dimension in each scope rather than from an
 * unattempted one: a dimension with no attempts has no score to improve, and
 * telling someone their weakest area is the one they have never tried is not a
 * recommendation.
 */
export type PracticeSuggestion = {
  scopeLabel: string
  target: EntityRef | null
  dimension: MasteryDimensionView
  href: string
}

export type ProfilePage = {
  profile: ProfileSummary
  progress: ProgressStats
  mastery: MasteryOverview
  bands: Awaited<ReturnType<typeof getMasteryBands>>
  recentSessions: SessionSummary[]
  suggestions: PracticeSuggestion[]
}

type SessionRow = Awaited<ReturnType<typeof listRecentSessions>>[number]

function toSessionSummary(row: SessionRow): SessionSummary {
  const profile = difficultyProfile(row.difficulty)
  const answered = row.correctCount + row.incorrectCount

  return {
    id: row.id,
    gameLabel: GAME_TYPE_LABELS[row.gameType],
    gameHref: `/games/${GAME_TYPE_SLUGS[row.gameType]}`,
    difficultyLabel: profile.label,
    cognition: profile.cognition,
    status: row.status,
    statusLabel: SESSION_STATUS_LABELS[row.status],
    score: row.score,
    correctCount: row.correctCount,
    totalRounds: row.totalRounds,
    accuracy: answered === 0 ? 0 : Math.round((row.correctCount / answered) * 100),
    scope: row.scopeEntity ? toEntityRef(row.scopeEntity) : null,
    startedAt: row.startedAt,
    startedLabel: formatDate(row.startedAt),
    completedAt: row.completedAt,
    resumeHref: row.status === 'IN_PROGRESS' ? `/games/play/${row.id}` : null,
  }
}

/**
 * Where a suggestion should send the player.
 *
 * The link carries the scope entity, not a game name: which game trains a given
 * dimension is a property of the seeded definitions, so the games index resolves
 * it. Encoding "relationships → Connect the Dots" here would hard-code the
 * mapping §6 deliberately keeps in data.
 */
function suggestionHref(scope: MasteryScopeView): string {
  const target = scope.target
  return target ? `/games?scope=${target.id}` : '/games'
}

function toSuggestions(overview: MasteryOverview): PracticeSuggestion[] {
  return overview.scopes.flatMap((scope) => {
    const dimension = scope.weakest
    if (!dimension) return []
    return [
      {
        scopeLabel: scope.target?.canonicalName ?? scope.scopeLabel,
        target: scope.target,
        dimension,
        href: suggestionHref(scope),
      },
    ]
  })
}

/**
 * The overall figure shown at the top of `/me`.
 *
 * Taken from the GLOBAL scope row when one exists rather than averaged here,
 * because the weighted roll-up in §8.4 is the mastery service's business and two
 * implementations of it would eventually disagree about the same player.
 */
function overallFrom(overview: MasteryOverview): { overall: number; status: MasteryStatusView | null } {
  const global = overview.scopes.find((scope) => scope.scope === 'GLOBAL')
  if (global) return { overall: global.overall, status: global.status }

  const first = overview.scopes[0]
  return { overall: first?.overall ?? 0, status: first?.status ?? null }
}

const RECENT_SESSION_COUNT = 8

/** The `/me` overview: who you are, how you are doing, what to do next. */
export async function getProfilePage(userId: string): Promise<ProfilePage | null> {
  const profile = await findProfileById(userId)
  if (!profile) return null

  const [overview, bands, counts, sessions] = await Promise.all([
    getMasteryOverview(userId),
    getMasteryBands(),
    countSessions(userId),
    listRecentSessions(userId, RECENT_SESSION_COUNT),
  ])

  const { overall, status } = overallFrom(overview)

  return {
    profile: {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
      joinedAt: profile.createdAt,
      joinedLabel: formatDate(profile.createdAt),
    },
    progress: {
      sessionsCompleted: counts.completed,
      answersCorrect: counts.correct,
      totalAttempts: overview.totalAttempts,
      practisedDimensions: overview.practisedDimensions,
      overall,
      status,
    },
    mastery: overview,
    bands,
    recentSessions: sessions.map(toSessionSummary),
    suggestions: toSuggestions(overview),
  }
}

export type MasteryPage = {
  overview: MasteryOverview
  bands: Awaited<ReturnType<typeof getMasteryBands>>
  suggestions: PracticeSuggestion[]
}

/**
 * `/me/mastery` (PRD §8).
 *
 * The bands travel with the scores because the UI cannot colour a score without
 * them and must not infer a colour from a status name.
 */
export async function getMasteryPage(userId: string): Promise<MasteryPage> {
  const [overview, bands] = await Promise.all([getMasteryOverview(userId), getMasteryBands()])
  return { overview, bands, suggestions: toSuggestions(overview) }
}

export type GameHistoryPage = {
  sessions: SessionSummary[]
  stats: { sessionsCompleted: number; answersCorrect: number }
}

/**
 * `/me/history` — the game log.
 *
 * Capped rather than paginated in V1: the list answers "what have I played
 * lately", and a session from four hundred games ago is a question no one has
 * asked yet. Pagination is a repository option away when they do.
 */
export async function getGameHistoryPage(
  userId: string,
  limit = 50,
): Promise<GameHistoryPage> {
  const [sessions, counts] = await Promise.all([
    listRecentSessions(userId, Math.min(200, Math.max(1, limit))),
    countSessions(userId),
  ])

  return {
    sessions: sessions.map(toSessionSummary),
    stats: { sessionsCompleted: counts.completed, answersCorrect: counts.correct },
  }
}
