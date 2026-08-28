import type {
  MasteryDimension,
  MasteryDimensionWeight,
  MasteryRecord,
  MasteryScope,
  MasteryStatus,
  Prisma,
} from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma/client'

import { entityRefSelect } from './entity-repository'

/**
 * Mastery persistence — PRD §8.
 *
 * Status bands and dimension weights are configuration rows, read at request
 * time. No status name and no weight appears as a literal in application code.
 */

export async function listMasteryStatuses(includeInactive = false): Promise<MasteryStatus[]> {
  return prisma.masteryStatus.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { minScore: 'asc' }],
  })
}

export async function findMasteryStatusById(id: string): Promise<MasteryStatus | null> {
  return prisma.masteryStatus.findUnique({ where: { id } })
}

export async function createMasteryStatus(data: Prisma.MasteryStatusCreateInput) {
  return prisma.masteryStatus.create({ data })
}

export async function updateMasteryStatus(id: string, data: Prisma.MasteryStatusUpdateInput) {
  return prisma.masteryStatus.update({ where: { id }, data })
}

export async function deleteMasteryStatus(id: string) {
  return prisma.masteryStatus.delete({ where: { id } })
}

export async function listDimensionWeights(scope?: MasteryScope): Promise<MasteryDimensionWeight[]> {
  return prisma.masteryDimensionWeight.findMany({
    where: scope ? { scope } : undefined,
    orderBy: [{ scope: 'asc' }, { dimension: 'asc' }],
  })
}

export async function upsertDimensionWeight(
  scope: MasteryScope,
  dimension: MasteryDimension,
  weight: number,
) {
  return prisma.masteryDimensionWeight.upsert({
    where: { scope_dimension: { scope, dimension } },
    create: { scope, dimension, weight },
    update: { weight },
  })
}

export const masteryRecordInclude = {
  targetEntity: { select: entityRefSelect },
} satisfies Prisma.MasteryRecordInclude

export type MasteryRecordRow = Prisma.MasteryRecordGetPayload<{
  include: typeof masteryRecordInclude
}>

export async function findMasteryRecords(
  userId: string,
  filter: { scope?: MasteryScope; targetEntityId?: string } = {},
): Promise<MasteryRecordRow[]> {
  return prisma.masteryRecord.findMany({
    where: {
      userId,
      ...(filter.scope ? { scope: filter.scope } : {}),
      ...(filter.targetEntityId ? { targetEntityId: filter.targetEntityId } : {}),
    },
    include: masteryRecordInclude,
    orderBy: [{ scope: 'asc' }, { dimension: 'asc' }],
  })
}

/**
 * The stand-in target for scope-wide records.
 *
 * See `MasteryRecord.targetKey` in the schema: a null column cannot identify a
 * row in a Postgres unique index, so "no target" needs a value.
 */
export const GLOBAL_TARGET_KEY = 'GLOBAL'

function targetKeyFor(targetEntityId: string | null): string {
  return targetEntityId ?? GLOBAL_TARGET_KEY
}

/**
 * Record one answer against a dimension.
 *
 * Counters are incremented atomically and the score is recomputed by the caller
 * from the new totals, so a concurrent second answer cannot lose a count.
 */
export async function bumpMasteryCounters(params: {
  userId: string
  scope: MasteryScope
  dimension: MasteryDimension
  targetEntityId: string | null
  isCorrect: boolean
  practicedAt: Date
}): Promise<MasteryRecord> {
  const { userId, scope, dimension, targetEntityId, isCorrect, practicedAt } = params

  return prisma.masteryRecord.upsert({
    where: {
      mastery_identity: { userId, scope, dimension, targetKey: targetKeyFor(targetEntityId) },
    },
    create: {
      userId,
      scope,
      dimension,
      targetEntityId,
      targetKey: targetKeyFor(targetEntityId),
      attempts: 1,
      correctCount: isCorrect ? 1 : 0,
      incorrectCount: isCorrect ? 0 : 1,
      lastPracticedAt: practicedAt,
    },
    update: {
      attempts: { increment: 1 },
      correctCount: { increment: isCorrect ? 1 : 0 },
      incorrectCount: { increment: isCorrect ? 0 : 1 },
      lastPracticedAt: practicedAt,
    },
  })
}

export async function setMasteryScore(id: string, score: number) {
  return prisma.masteryRecord.update({ where: { id }, data: { score } })
}

export async function upsertMasteryScore(params: {
  userId: string
  scope: MasteryScope
  dimension: MasteryDimension
  targetEntityId: string | null
  score: number
}) {
  const { userId, scope, dimension, targetEntityId, score } = params

  return prisma.masteryRecord.upsert({
    where: { mastery_identity: { userId, scope, dimension, targetKey: targetKeyFor(targetEntityId) } },
    create: { userId, scope, dimension, targetEntityId, targetKey: targetKeyFor(targetEntityId), score },
    update: { score },
  })
}

/** Distinct targets a user has practised, for the "your progress" list. */
export async function findPractisedTargets(userId: string, scope: MasteryScope) {
  const rows = await prisma.masteryRecord.findMany({
    where: { userId, scope, targetEntityId: { not: null } },
    select: { targetEntityId: true },
    distinct: ['targetEntityId'],
  })
  return rows.flatMap((row) => (row.targetEntityId ? [row.targetEntityId] : []))
}
