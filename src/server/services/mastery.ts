import {
  MASTERY_DIMENSIONS_V1,
  MASTERY_DIMENSION_DESCRIPTIONS,
  MASTERY_DIMENSION_LABELS,
  MASTERY_SCOPE_LABELS,
  computeDimensionScore,
  computeOverallScore,
  resolveMasteryStatus,
} from '@/domain/mastery'
import type { MasteryScope } from '@/generated/prisma/enums';
import { MasteryDimension } from '@/generated/prisma/enums'
import type { EntityRef } from '@/types/graph'

import {
  bumpMasteryCounters,
  findMasteryRecords,
  listDimensionWeights,
  listMasteryStatuses,
  setMasteryScore,
  upsertMasteryScore,
  type MasteryRecordRow,
} from '../repositories/mastery-repository'

import { toEntityRef } from './entity-mapper'

/**
 * Mastery service — PRD §8.
 *
 * Three rules from the PRD are load-bearing here:
 *
 *   1. Status names are configuration. Every label in the output is resolved by
 *      matching a score against `mastery_statuses` rows. There is no string
 *      literal for a band name anywhere in this file, and adding a band is an
 *      admin action, not a deploy.
 *   2. Weights are configuration. The OVERALL roll-up reads
 *      `mastery_dimension_weights` for the scope it is rolling up.
 *   3. Scores are derived from lifetime counters, never accumulated in place.
 *      Counters are incremented atomically in the repository and the score is
 *      recomputed from the result, so two answers landing at once cannot make a
 *      score drift away from the attempts that produced it.
 */

export type MasteryStatusView = {
  name: string
  slug: string
  colorHex: string | null
  description: string | null
}

export type MasteryDimensionView = {
  dimension: MasteryDimension
  label: string
  description: string
  score: number
  attempts: number
  correctCount: number
  accuracy: number
  status: MasteryStatusView | null
  lastPracticedAt: Date | null
}

export type MasteryScopeView = {
  scope: MasteryScope
  scopeLabel: string
  target: EntityRef | null
  overall: number
  status: MasteryStatusView | null
  dimensions: MasteryDimensionView[]
  /** The dimension worth practising next: lowest score among those attempted. */
  weakest: MasteryDimensionView | null
  attempts: number
  lastPracticedAt: Date | null
}

export type MasteryOverview = {
  scopes: MasteryScopeView[]
  totalAttempts: number
  practisedDimensions: number
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export type MasteryUpdate = {
  scope: MasteryScope
  targetEntityId: string | null
  dimension: MasteryDimension
  dimensionScore: number
  overallScore: number
}

/**
 * Record one answered round and recompute the two scores it can change.
 *
 * Called after every answer, including wrong ones — an incorrect attempt is
 * information about knowledge, and hiding it would make mastery a record of
 * lucky guesses.
 */
export async function recordMasteryAnswer(params: {
  userId: string
  scope: MasteryScope
  dimension: MasteryDimension
  targetEntityId: string | null
  isCorrect: boolean
  practicedAt?: Date
}): Promise<MasteryUpdate> {
  const { userId, scope, dimension, targetEntityId, isCorrect } = params
  const practicedAt = params.practicedAt ?? new Date()

  const record = await bumpMasteryCounters({
    userId,
    scope,
    dimension,
    targetEntityId,
    isCorrect,
    practicedAt,
  })

  const dimensionScore = computeDimensionScore(record.correctCount, record.incorrectCount)
  await setMasteryScore(record.id, dimensionScore)

  const overallScore = await recomputeOverall(userId, scope, targetEntityId)

  return { scope, targetEntityId, dimension, dimensionScore, overallScore }
}

/**
 * Recompute the OVERALL dimension for one scope target.
 *
 * OVERALL is stored rather than computed on read so the mastery overview is a
 * single query, and because it is what "your progress" is ordered by.
 */
export async function recomputeOverall(
  userId: string,
  scope: MasteryScope,
  targetEntityId: string | null,
): Promise<number> {
  const [records, weights] = await Promise.all([
    findMasteryRecords(userId, { scope }),
    listDimensionWeights(scope),
  ])

  const forTarget = records.filter((record) => record.targetEntityId === targetEntityId)

  const overallScore = computeOverallScore(
    forTarget
      .filter((record) => record.dimension !== MasteryDimension.OVERALL)
      .map((record) => ({
        dimension: record.dimension,
        score: computeDimensionScore(record.correctCount, record.incorrectCount),
        attempts: record.attempts,
      })),
    weights,
  )

  await upsertMasteryScore({
    userId,
    scope,
    dimension: MasteryDimension.OVERALL,
    targetEntityId,
    score: overallScore,
  })

  return overallScore
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

function toStatusView(
  score: number,
  bands: Awaited<ReturnType<typeof listMasteryStatuses>>,
): MasteryStatusView | null {
  const band = resolveMasteryStatus(score, bands)
  if (!band) return null
  return {
    name: band.name,
    slug: band.slug,
    colorHex: band.colorHex,
    description: band.description,
  }
}

function groupKey(record: MasteryRecordRow): string {
  return `${record.scope}::${record.targetEntityId ?? 'GLOBAL'}`
}

/**
 * The full mastery grid for a user.
 *
 * Every V1 dimension appears for every practised scope, including ones with no
 * attempts. A grid with visible gaps tells the player where to go next; a list
 * of only what they have already done does not.
 */
export async function getMasteryOverview(userId: string): Promise<MasteryOverview> {
  const [records, statuses] = await Promise.all([
    findMasteryRecords(userId),
    listMasteryStatuses(),
  ])

  const groups = new Map<string, MasteryRecordRow[]>()
  for (const record of records) {
    const key = groupKey(record)
    const list = groups.get(key)
    if (list) list.push(record)
    else groups.set(key, [record])
  }

  const scopes: MasteryScopeView[] = []

  for (const group of groups.values()) {
    const first = group[0]
    if (!first) continue

    const dimensions: MasteryDimensionView[] = MASTERY_DIMENSIONS_V1.map((dimension) => {
      const record = group.find((row) => row.dimension === dimension)
      const attempts = record?.attempts ?? 0
      const correctCount = record?.correctCount ?? 0
      const score = record
        ? computeDimensionScore(record.correctCount, record.incorrectCount)
        : 0

      return {
        dimension,
        label: MASTERY_DIMENSION_LABELS[dimension],
        description: MASTERY_DIMENSION_DESCRIPTIONS[dimension],
        score,
        attempts,
        correctCount,
        accuracy: attempts > 0 ? Math.round((correctCount / attempts) * 1000) / 10 : 0,
        status: toStatusView(score, statuses),
        lastPracticedAt: record?.lastPracticedAt ?? null,
      }
    })

    const overallRecord = group.find((row) => row.dimension === MasteryDimension.OVERALL)
    const overall =
      overallRecord?.score ??
      computeOverallScore(
        dimensions.map((row) => ({
          dimension: row.dimension,
          score: row.score,
          attempts: row.attempts,
        })),
        [],
      )

    const attempted = dimensions.filter((row) => row.attempts > 0)
    const weakest =
      attempted.length > 0
        ? attempted.reduce((lowest, row) => (row.score < lowest.score ? row : lowest))
        : null

    const lastPracticedAt = group
      .map((row) => row.lastPracticedAt)
      .filter((value): value is Date => value !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0]

    scopes.push({
      scope: first.scope,
      scopeLabel: MASTERY_SCOPE_LABELS[first.scope],
      target: first.targetEntity ? toEntityRef(first.targetEntity) : null,
      overall,
      status: toStatusView(overall, statuses),
      dimensions,
      weakest,
      attempts: attempted.reduce((total, row) => total + row.attempts, 0),
      lastPracticedAt: lastPracticedAt ?? null,
    })
  }

  scopes.sort((a, b) => b.overall - a.overall)

  return {
    scopes,
    totalAttempts: scopes.reduce((total, scope) => total + scope.attempts, 0),
    practisedDimensions: records.filter(
      (record) => record.dimension !== MasteryDimension.OVERALL && record.attempts > 0,
    ).length,
  }
}

/** One scope's grid — the generation detail view in `/me/mastery`. */
export async function getMasteryForTarget(
  userId: string,
  scope: MasteryScope,
  targetEntityId: string | null,
): Promise<MasteryScopeView | null> {
  const overview = await getMasteryOverview(userId)
  return (
    overview.scopes.find(
      (view) => view.scope === scope && (view.target?.id ?? null) === targetEntityId,
    ) ?? null
  )
}

/** Status bands as configured, for legends and admin screens. */
export async function getMasteryBands(): Promise<
  (MasteryStatusView & { minScore: number; maxScore: number })[]
> {
  const bands = await listMasteryStatuses()
  return bands.map((band) => ({
    name: band.name,
    slug: band.slug,
    colorHex: band.colorHex,
    description: band.description,
    minScore: band.minScore,
    maxScore: band.maxScore,
  }))
}
