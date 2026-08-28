import { MasteryDimension, MasteryScope } from '@/generated/prisma/enums'

/**
 * Mastery model (PRD §8).
 *
 * V1 measures mastery per Generation across five dimensions. Two rules from the
 * PRD constrain everything here:
 *
 *   1. Status names are NOT hard-coded. The bands below are *seed data* for the
 *      `mastery_statuses` table, which admins may rename, re-band, recolour or
 *      extend. Application code resolves a label by reading rows from the
 *      database — never by comparing a score against a literal name.
 *   2. Dimension weights are configuration too (`mastery_dimension_weights`),
 *      so the weighted roll-up takes its weights as an argument.
 */

/** Dimensions scored independently in V1 (OVERALL is the roll-up). */
export const MASTERY_DIMENSIONS_V1: MasteryDimension[] = [
  MasteryDimension.MEMBERS,
  MasteryDimension.HISTORY,
  MasteryDimension.TEAMS,
  MasteryDimension.SONGS,
  MasteryDimension.RELATIONSHIPS,
]

export const MASTERY_DIMENSION_LABELS: Record<MasteryDimension, string> = {
  [MasteryDimension.OVERALL]: 'Overall',
  [MasteryDimension.MEMBERS]: 'Members',
  [MasteryDimension.HISTORY]: 'History',
  [MasteryDimension.TEAMS]: 'Teams',
  [MasteryDimension.SONGS]: 'Songs',
  [MasteryDimension.RELATIONSHIPS]: 'Relationships',
}

export const MASTERY_DIMENSION_DESCRIPTIONS: Record<MasteryDimension, string> = {
  [MasteryDimension.OVERALL]: 'Weighted roll-up of every dimension in this scope.',
  [MasteryDimension.MEMBERS]: 'Recognising who belongs to this cohort and what defines them.',
  [MasteryDimension.HISTORY]: 'Dates, events, and the order things happened in.',
  [MasteryDimension.TEAMS]: 'Team rosters and how they shifted over time.',
  [MasteryDimension.SONGS]: 'Songs, centers, and senbatsu lineups.',
  [MasteryDimension.RELATIONSHIPS]: 'Reading the graph: indirect and multi-hop connections.',
}

export const MASTERY_SCOPE_LABELS: Record<MasteryScope, string> = {
  [MasteryScope.GENERATION]: 'Generation',
  [MasteryScope.MEMBER]: 'Member',
  [MasteryScope.TEAM]: 'Team',
  [MasteryScope.SONG]: 'Song',
  [MasteryScope.ALBUM]: 'Album',
  [MasteryScope.EVENT]: 'Event',
  [MasteryScope.HISTORY]: 'History',
  [MasteryScope.GLOBAL]: 'Archive',
}

/** Scopes V1 actually tracks. The rest of the enum is reserved for V1.1+. */
export const MASTERY_SCOPES_V1: MasteryScope[] = [MasteryScope.GENERATION, MasteryScope.GLOBAL]

/* -------------------------------------------------------------------------- */
/* Status bands — seed data only                                              */
/* -------------------------------------------------------------------------- */

export type MasteryStatusSeed = {
  name: string
  slug: string
  minScore: number
  maxScore: number
  colorHex: string
  description: string
  displayOrder: number
}

/** PRD §8.3 defaults. Admin-editable once seeded. */
export const MASTERY_STATUS_SEEDS: MasteryStatusSeed[] = [
  {
    name: 'Unknown',
    slug: 'unknown',
    minScore: 0,
    maxScore: 19,
    colorHex: '#8A8579',
    description: 'Not explored yet. Play a round to open this up.',
    displayOrder: 10,
  },
  {
    name: 'Familiar',
    slug: 'familiar',
    minScore: 20,
    maxScore: 39,
    colorHex: '#9C8B5E',
    description: 'You recognise the names, but the connections are still loose.',
    displayOrder: 20,
  },
  {
    name: 'Recognized',
    slug: 'recognized',
    minScore: 40,
    maxScore: 59,
    colorHex: '#7C8B5E',
    description: 'Direct facts are reliable. Relationship questions still catch you out.',
    displayOrder: 30,
  },
  {
    name: 'Knowledgeable',
    slug: 'knowledgeable',
    minScore: 60,
    maxScore: 79,
    colorHex: '#4F7A63',
    description: 'You can trace most relationships without help.',
    displayOrder: 40,
  },
  {
    name: 'Mastered',
    slug: 'mastered',
    minScore: 80,
    maxScore: 94,
    colorHex: '#3E6E8E',
    description: 'Indirect relationships hold up under pressure.',
    displayOrder: 50,
  },
  {
    name: 'Expert',
    slug: 'expert',
    minScore: 95,
    maxScore: 100,
    colorHex: '#7A3E52',
    description: 'Multi-hop historical reasoning, consistently correct.',
    displayOrder: 60,
  },
]

/** The minimal shape `resolveMasteryStatus` needs — satisfied by a DB row. */
export type MasteryStatusBand = {
  name: string
  slug: string
  minScore: number
  maxScore: number
  colorHex?: string | null
}

/**
 * Resolve a 0–100 score to a status band.
 *
 * Bands come from the caller (i.e. from the database), which is what keeps
 * status names out of the code. Returns `undefined` when no band covers the
 * score, so the UI degrades instead of inventing a label.
 */
export function resolveMasteryStatus<T extends MasteryStatusBand>(
  score: number,
  bands: readonly T[],
): T | undefined {
  const rounded = Math.round(score)
  return bands.find((band) => rounded >= band.minScore && rounded <= band.maxScore)
}

/* -------------------------------------------------------------------------- */
/* Dimension weights — seed data only                                         */
/* -------------------------------------------------------------------------- */

export type MasteryDimensionWeightSeed = {
  scope: MasteryScope
  dimension: MasteryDimension
  weight: number
}

/**
 * Defaults for the V1 scopes. Members and Relationships carry more weight
 * because they are what "knowing a generation" actually means.
 */
export const MASTERY_DIMENSION_WEIGHT_SEEDS: MasteryDimensionWeightSeed[] = [
  { scope: MasteryScope.GENERATION, dimension: MasteryDimension.MEMBERS, weight: 3 },
  { scope: MasteryScope.GENERATION, dimension: MasteryDimension.RELATIONSHIPS, weight: 3 },
  { scope: MasteryScope.GENERATION, dimension: MasteryDimension.HISTORY, weight: 2 },
  { scope: MasteryScope.GENERATION, dimension: MasteryDimension.TEAMS, weight: 2 },
  { scope: MasteryScope.GENERATION, dimension: MasteryDimension.SONGS, weight: 1 },

  { scope: MasteryScope.GLOBAL, dimension: MasteryDimension.MEMBERS, weight: 2 },
  { scope: MasteryScope.GLOBAL, dimension: MasteryDimension.RELATIONSHIPS, weight: 3 },
  { scope: MasteryScope.GLOBAL, dimension: MasteryDimension.HISTORY, weight: 2 },
  { scope: MasteryScope.GLOBAL, dimension: MasteryDimension.TEAMS, weight: 1 },
  { scope: MasteryScope.GLOBAL, dimension: MasteryDimension.SONGS, weight: 1 },
]

/**
 * Weighted roll-up for the OVERALL dimension.
 *
 * Dimensions with no recorded attempts are excluded rather than counted as
 * zero — otherwise practising one dimension would appear to lower mastery.
 * A dimension missing from `weights` falls back to 1.
 */
export function computeOverallScore(
  dimensionScores: readonly { dimension: MasteryDimension; score: number; attempts: number }[],
  weights: readonly { dimension: MasteryDimension; weight: number }[],
): number {
  const weightFor = (dimension: MasteryDimension) =>
    weights.find((w) => w.dimension === dimension)?.weight ?? 1

  let weightedTotal = 0
  let weightSum = 0

  for (const row of dimensionScores) {
    if (row.dimension === MasteryDimension.OVERALL) continue
    if (row.attempts <= 0) continue
    const weight = weightFor(row.dimension)
    weightedTotal += row.score * weight
    weightSum += weight
  }

  if (weightSum === 0) return 0
  return Math.round((weightedTotal / weightSum) * 10) / 10
}

/**
 * Attempts needed before accuracy is trusted at face value.
 *
 * Mastery is accuracy *tempered by exposure*: three lucky answers should not
 * read as Expert. Below this threshold the score is scaled down proportionally,
 * which also gives the progress bar something honest to show early on.
 */
export const MASTERY_CONFIDENCE_ATTEMPTS = 20

/** Recompute a dimension score from its lifetime counters. Pure, so testable. */
export function computeDimensionScore(correctCount: number, incorrectCount: number): number {
  const attempts = correctCount + incorrectCount
  if (attempts <= 0) return 0

  const accuracy = correctCount / attempts
  const confidence = Math.min(1, attempts / MASTERY_CONFIDENCE_ATTEMPTS)
  return Math.round(accuracy * confidence * 1000) / 10
}
