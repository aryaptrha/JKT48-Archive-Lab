import type { Difficulty, GameType, Prisma } from '@/generated/prisma/client'
import { GameSessionStatus } from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma/client'

import { entityRefSelect } from './entity-repository'

/**
 * Game persistence — PRD §6.
 *
 * Definitions, sessions and challenges. Nothing in here knows how a question is
 * generated; that is the engine's job. This file only stores what it produced,
 * which is what makes a session replayable from its seed.
 */

export const gameDefinitionInclude = {
  requiredRelationshipTypes: { include: { relationshipType: true } },
} satisfies Prisma.GameDefinitionInclude

export type GameDefinitionRow = Prisma.GameDefinitionGetPayload<{
  include: typeof gameDefinitionInclude
}>

export async function listGameDefinitions(includeInactive = false): Promise<GameDefinitionRow[]> {
  return prisma.gameDefinition.findMany({
    where: includeInactive ? undefined : { isActive: true },
    include: gameDefinitionInclude,
    orderBy: [{ gameType: 'asc' }, { displayOrder: 'asc' }],
  })
}

export async function findGameDefinitionByCode(code: string): Promise<GameDefinitionRow | null> {
  return prisma.gameDefinition.findUnique({ where: { code }, include: gameDefinitionInclude })
}

export async function findGameDefinitionById(id: string): Promise<GameDefinitionRow | null> {
  return prisma.gameDefinition.findUnique({ where: { id }, include: gameDefinitionInclude })
}

export async function findGameDefinition(
  gameType: GameType,
  difficulty: Difficulty,
): Promise<GameDefinitionRow | null> {
  return prisma.gameDefinition.findFirst({
    where: { gameType, difficulty, isActive: true },
    include: gameDefinitionInclude,
  })
}

export async function listDifficultiesFor(gameType: GameType): Promise<Difficulty[]> {
  const rows = await prisma.gameDefinition.findMany({
    where: { gameType, isActive: true },
    select: { difficulty: true },
    distinct: ['difficulty'],
  })
  return rows.map((row) => row.difficulty)
}

export async function createGameDefinition(data: Prisma.GameDefinitionCreateInput) {
  return prisma.gameDefinition.create({ data, include: gameDefinitionInclude })
}

export async function updateGameDefinition(id: string, data: Prisma.GameDefinitionUpdateInput) {
  return prisma.gameDefinition.update({ where: { id }, data, include: gameDefinitionInclude })
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export const sessionInclude = {
  gameDefinition: true,
  scopeEntity: { select: entityRefSelect },
  challenges: {
    orderBy: { ordinal: 'asc' },
    include: { subjectEntity: { select: entityRefSelect } },
  },
} satisfies Prisma.GameSessionInclude

export type GameSessionRow = Prisma.GameSessionGetPayload<{ include: typeof sessionInclude }>

export async function createGameSession(data: Prisma.GameSessionCreateInput) {
  return prisma.gameSession.create({ data, include: sessionInclude })
}

export async function findGameSession(id: string): Promise<GameSessionRow | null> {
  return prisma.gameSession.findUnique({ where: { id }, include: sessionInclude })
}

export async function updateGameSession(id: string, data: Prisma.GameSessionUpdateInput) {
  return prisma.gameSession.update({ where: { id }, data, include: sessionInclude })
}

export async function abandonStaleSessions(userId: string, olderThan: Date) {
  return prisma.gameSession.updateMany({
    where: { userId, status: GameSessionStatus.IN_PROGRESS, startedAt: { lt: olderThan } },
    data: { status: GameSessionStatus.ABANDONED },
  })
}

export async function listRecentSessions(userId: string, limit = 10) {
  return prisma.gameSession.findMany({
    where: { userId },
    include: {
      gameDefinition: { select: { name: true, gameType: true, difficulty: true } },
      scopeEntity: { select: entityRefSelect },
    },
    orderBy: { startedAt: 'desc' },
    take: limit,
  })
}

export async function countSessions(userId: string) {
  const [completed, correct] = await Promise.all([
    prisma.gameSession.count({ where: { userId, status: GameSessionStatus.COMPLETED } }),
    prisma.gameChallenge.count({ where: { session: { userId }, isCorrect: true } }),
  ])
  return { completed, correct }
}

/* -------------------------------------------------------------------------- */
/* Challenges                                                                 */
/* -------------------------------------------------------------------------- */

export async function createChallenges(data: Prisma.GameChallengeCreateManyInput[]) {
  if (data.length === 0) return { count: 0 }
  return prisma.gameChallenge.createMany({ data })
}

export async function findChallenge(sessionId: string, ordinal: number) {
  return prisma.gameChallenge.findUnique({
    where: { sessionId_ordinal: { sessionId, ordinal } },
    include: { subjectEntity: { select: entityRefSelect }, session: true },
  })
}

export async function findChallengeById(id: string) {
  return prisma.gameChallenge.findUnique({
    where: { id },
    include: { subjectEntity: { select: entityRefSelect }, session: true },
  })
}

export async function recordChallengeAnswer(
  id: string,
  data: {
    submittedAnswer: Prisma.InputJsonValue
    isCorrect: boolean
    pointsAwarded: number
    elapsedMs: number | null
  },
) {
  return prisma.gameChallenge.update({
    where: { id },
    data: {
      submittedAnswer: data.submittedAnswer,
      isCorrect: data.isCorrect,
      pointsAwarded: data.pointsAwarded,
      elapsedMs: data.elapsedMs,
      answeredAt: new Date(),
    },
  })
}

/** The next unanswered round, or null when the session is finished. */
export async function findNextUnansweredChallenge(sessionId: string) {
  return prisma.gameChallenge.findFirst({
    where: { sessionId, answeredAt: null },
    include: { subjectEntity: { select: entityRefSelect } },
    orderBy: { ordinal: 'asc' },
  })
}
