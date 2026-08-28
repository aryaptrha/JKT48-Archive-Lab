import { difficultyProfile, type DifficultyProfile } from '@/domain/difficulty'
import { GAME_TYPE_LABELS } from '@/domain/game-definitions'
import type { Difficulty } from '@/generated/prisma/client'
import { GameSessionStatus, GameType } from '@/generated/prisma/enums'
import { toDateOnly } from '@/lib/date'
import { createSeededRandom } from '@/lib/utils'
import type { EntityRef } from '@/types/graph'

import {
  createChallenges,
  createGameSession,
  findChallengeById,
  findGameDefinition,
  findGameDefinitionByCode,
  findGameDefinitionById,
  findGameSession,
  findNextUnansweredChallenge,
  listGameDefinitions,
  recordChallengeAnswer,
  updateGameSession,
  type GameDefinitionRow,
  type GameSessionRow,
} from '../../repositories/game-repository'
import { toEntityRef } from '../entity-mapper'
import { recordMasteryAnswer } from '../mastery'

import { generateConnectTheDots } from './connect-the-dots'
import { describeExpected, evaluateAnswer } from './evaluator'
import { generateMemoryReconstruction } from './memory-reconstruction'
import { generateMysteryMember } from './mystery-member'
import { scoreRound } from './scoring'
import { generateTimeMachineQuiz } from './time-machine-quiz'
import {
  InsufficientDataError,
  type ChallengePrompt,
  type ChallengeSolution,
  type ChoiceOption,
  type GeneratorContext,
  type PlayableChallenge,
  type QuestionGenerator,
  type RoundResult,
  type SubmittedAnswer,
} from './types'

/**
 * The game engine's public surface (PRD §6).
 *
 * Everything above this file — route handlers, server actions, pages — speaks in
 * sessions and rounds and never in generators, slices or seeds. Adding a game
 * means writing a generator and seeding a `GameDefinition` row; it does not mean
 * touching this file's callers.
 *
 * The dispatch table below is the only place a `GameType` maps to code. It is
 * deliberately small: the definition row carries difficulty, strategy, answer
 * mode, round count, option count and scoring, so two rows of the same type
 * behave differently without a second generator.
 */

const GENERATORS: Record<GameType, QuestionGenerator> = {
  [GameType.MYSTERY_MEMBER]: generateMysteryMember,
  [GameType.CONNECT_THE_DOTS]: generateConnectTheDots,
  [GameType.MEMORY_RECONSTRUCTION]: generateMemoryReconstruction,
  [GameType.TIME_MACHINE_QUIZ]: generateTimeMachineQuiz,
  // Daily Challenge (V1.1) reuses Mystery Member until it has its own rotation.
  [GameType.DAILY_CHALLENGE]: generateMysteryMember,
}

/**
 * Difficulty defaults, overridden by the row.
 *
 * `DIFFICULTY_PROFILES` is the code-first default for each rung; the admin row
 * is what actually runs. The seed writes the profile numbers into the rows, so
 * the two agree until someone deliberately retunes a game — at which point the
 * row wins, which is the point of it being editable.
 */
export function effectiveProfile(definition: GameDefinitionRow): DifficultyProfile {
  const base = difficultyProfile(definition.difficulty)
  return {
    ...base,
    strategy: definition.questionStrategy,
    clueCount: definition.clueCount > 0 ? definition.clueCount : base.clueCount,
    hopCount: definition.hopCount > 0 ? definition.hopCount : base.hopCount,
  }
}

/* -------------------------------------------------------------------------- */
/* JSON boundaries                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Prisma types these columns as `JsonValue`, which no amount of narrowing turns
 * back into a discriminated union. The values were written by this module in the
 * same deploy that reads them, so the casts are safe; keeping them in one place
 * means nothing else in the codebase has to make that argument.
 */
function asPrompt(value: unknown): ChallengePrompt {
  return value as ChallengePrompt
}

function asOptions(value: unknown): ChoiceOption[] | null {
  return (value as ChoiceOption[] | null) ?? null
}

function asSolution(value: unknown): ChallengeSolution {
  return value as ChallengeSolution
}

/* -------------------------------------------------------------------------- */
/* Views                                                                      */
/* -------------------------------------------------------------------------- */

export type SessionView = {
  id: string
  /**
   * Who owns this session, or null for anonymous play.
   *
   * Exposed so a route boundary can refuse to render or answer someone else's
   * session: a session id is unguessable but not secret, and answering another
   * player's round would write to their mastery record (PRD §35).
   */
  userId: string | null
  gameType: GameType
  difficulty: Difficulty
  definitionName: string
  status: GameSessionStatus
  score: number
  totalRounds: number
  answeredRounds: number
  correctCount: number
  incorrectCount: number
  scope: EntityRef | null
  scopeDate: Date | null
  startedAt: Date
  completedAt: Date | null
}

export function toSessionView(session: GameSessionRow): SessionView {
  return {
    id: session.id,
    userId: session.userId,
    gameType: session.gameType,
    difficulty: session.difficulty,
    definitionName: session.gameDefinition.name,
    status: session.status,
    score: session.score,
    totalRounds: session.totalRounds,
    answeredRounds: session.challenges.filter((challenge) => challenge.answeredAt !== null).length,
    correctCount: session.correctCount,
    incorrectCount: session.incorrectCount,
    scope: session.scopeEntity ? toEntityRef(session.scopeEntity) : null,
    scopeDate: session.scopeDate,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
  }
}

type ChallengeRow = {
  id: string
  ordinal: number
  questionStrategy: PlayableChallenge['questionStrategy']
  answerMode: PlayableChallenge['answerMode']
  prompt: unknown
  options: unknown
}

/** Strip the solution before anything leaves the server. */
function toPlayable(challenge: ChallengeRow, totalRounds: number): PlayableChallenge {
  return {
    id: challenge.id,
    ordinal: challenge.ordinal,
    totalRounds,
    questionStrategy: challenge.questionStrategy,
    answerMode: challenge.answerMode,
    prompt: asPrompt(challenge.prompt),
    options: asOptions(challenge.options),
  }
}

/* -------------------------------------------------------------------------- */
/* Session lifecycle                                                          */
/* -------------------------------------------------------------------------- */

export type StartSessionInput = {
  /** Null for anonymous play: a session works without an account, mastery does not. */
  userId: string | null
  definitionId?: string
  definitionCode?: string
  gameType?: GameType
  difficulty?: Difficulty
  scopeEntityId?: string | null
  scopeDate?: Date | string | null
  /** Supply a seed to replay an existing session's questions exactly. */
  seed?: string
}

export type StartedSession = {
  session: SessionView
  challenge: PlayableChallenge
}

async function resolveDefinition(input: StartSessionInput): Promise<GameDefinitionRow> {
  if (input.definitionId) {
    const byId = await findGameDefinitionById(input.definitionId)
    if (byId) return byId
  }

  if (input.definitionCode) {
    const byCode = await findGameDefinitionByCode(input.definitionCode)
    if (byCode) return byCode
  }

  if (input.gameType && input.difficulty) {
    const byPair = await findGameDefinition(input.gameType, input.difficulty)
    if (byPair) return byPair
  }

  throw new Error('No matching game definition. Seed the game definitions first.')
}

function newSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Generate a whole session up front.
 *
 * All rounds are produced in one pass and stored, rather than generated as the
 * player advances. That is what makes `seed` meaningful — the same seed against
 * the same archive yields the same session — and it means a mid-session archive
 * edit cannot change a question the player is halfway through.
 */
export async function startSession(input: StartSessionInput): Promise<StartedSession> {
  const definition = await resolveDefinition(input)
  if (!definition.isActive) {
    throw new Error(`${definition.name} is not currently available.`)
  }

  const profile = effectiveProfile(definition)
  const seed = input.seed ?? newSeed()
  const scopeDate = toDateOnly(input.scopeDate) ?? null
  const scopeEntityId = input.scopeEntityId ?? null

  const context: GeneratorContext = {
    definition,
    profile,
    graph: { asOf: scopeDate, includeUnpublished: false },
    scopeEntityId,
    scopeDate,
    random: createSeededRandom(seed),
    rounds: Math.max(1, definition.roundCount),
  }

  const generated = await GENERATORS[definition.gameType](context)

  const session = await createGameSession({
    gameDefinition: { connect: { id: definition.id } },
    ...(input.userId ? { user: { connect: { id: input.userId } } } : {}),
    ...(scopeEntityId ? { scopeEntity: { connect: { id: scopeEntityId } } } : {}),
    gameType: definition.gameType,
    difficulty: definition.difficulty,
    scopeDate,
    seed,
    status: GameSessionStatus.IN_PROGRESS,
    totalRounds: generated.length,
  })

  await createChallenges(
    generated.map((challenge) => ({
      sessionId: session.id,
      ordinal: challenge.ordinal,
      questionStrategy: challenge.questionStrategy,
      answerMode: challenge.answerMode,
      prompt: challenge.prompt,
      options: challenge.options ?? undefined,
      expectedAnswer: challenge.solution,
      subjectEntityId: challenge.subjectEntityId,
      masteryScope: challenge.masteryScope,
      masteryTargetId: challenge.masteryTargetId,
      masteryDimension: challenge.masteryDimension,
    })),
  )

  const first = await findNextUnansweredChallenge(session.id)
  if (!first) {
    throw new InsufficientDataError('The session was created with no rounds.', {
      needed: context.rounds,
      found: 0,
      hint: 'This is a generator bug, not a data gap — check the data-health report and file it.',
    })
  }

  const stored = await findGameSession(session.id)

  return {
    session: toSessionView(stored ?? session),
    challenge: toPlayable(first, generated.length),
  }
}

export type SessionState = {
  session: SessionView
  /** Null when every round has been answered. */
  challenge: PlayableChallenge | null
}

export async function getSessionState(sessionId: string): Promise<SessionState | null> {
  const session = await findGameSession(sessionId)
  if (!session) return null

  const next = await findNextUnansweredChallenge(sessionId)

  return {
    session: toSessionView(session),
    challenge: next ? toPlayable(next, session.totalRounds) : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Review                                                                     */
/* -------------------------------------------------------------------------- */

export type RoundReview = {
  challengeId: string
  ordinal: number
  question: string
  isCorrect: boolean
  pointsAwarded: number
  answeredAt: Date | null
  correctAnswerText: string
  explanation: string
  revealHref: string | null
  revealLabel: string | null
  subject: EntityRef | null
}

export type SessionReview = {
  session: SessionView
  /** Answered rounds only, in play order. */
  rounds: RoundReview[]
}

/**
 * A finished session, with the solutions attached.
 *
 * The solution column is readable here and nowhere else in the player-facing
 * flow, because a round that has been answered can no longer be spoiled — and a
 * scorecard that will not tell you what the right answer was is a worse teacher
 * than no scorecard (PRD §P2, §7).
 */
export async function getSessionReview(sessionId: string): Promise<SessionReview | null> {
  const session = await findGameSession(sessionId)
  if (!session) return null

  const rounds: RoundReview[] = session.challenges
    .filter((challenge) => challenge.answeredAt !== null)
    .map((challenge) => {
      const solution = asSolution(challenge.expectedAnswer)
      return {
        challengeId: challenge.id,
        ordinal: challenge.ordinal,
        question: asPrompt(challenge.prompt).question,
        isCorrect: challenge.isCorrect ?? false,
        pointsAwarded: challenge.pointsAwarded,
        answeredAt: challenge.answeredAt,
        correctAnswerText: describeExpected(solution.answer, asOptions(challenge.options)),
        explanation: solution.explanation,
        revealHref: solution.revealHref,
        revealLabel: solution.revealLabel,
        subject: challenge.subjectEntity ? toEntityRef(challenge.subjectEntity) : null,
      }
    })

  return { session: toSessionView(session), rounds }
}

export type SubmitAnswerInput = {
  sessionId: string
  challengeId: string
  answer: SubmittedAnswer
  elapsedMs?: number | null
}

export type SubmitAnswerResult = {
  result: RoundResult
  session: SessionView
  /** The next round, or null when the session just finished. */
  next: PlayableChallenge | null
  isComplete: boolean
}

/**
 * Evaluate one answer, score it, and advance the session.
 *
 * Ownership is checked against the session the caller names rather than trusted
 * from the challenge id, so a guessed id cannot be answered against someone
 * else's session.
 */
export async function submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
  const challenge = await findChallengeById(input.challengeId)
  if (!challenge || challenge.sessionId !== input.sessionId) {
    throw new Error('Round not found in this session.')
  }
  if (challenge.answeredAt) {
    throw new Error('This round has already been answered.')
  }

  const session = await findGameSession(input.sessionId)
  if (!session) throw new Error('Session not found.')
  if (session.status !== GameSessionStatus.IN_PROGRESS) {
    throw new Error('This session is no longer in progress.')
  }

  const solution = asSolution(challenge.expectedAnswer)
  const options = asOptions(challenge.options)

  const verdict = evaluateAnswer(solution.answer, input.answer)
  const { points, breakdown } = scoreRound(session.gameDefinition, verdict)

  await recordChallengeAnswer(challenge.id, {
    submittedAnswer: input.answer,
    isCorrect: verdict.isCorrect,
    pointsAwarded: points,
    elapsedMs: input.elapsedMs ?? null,
  })

  const answeredCount =
    session.challenges.filter((row) => row.answeredAt !== null).length + 1
  const isComplete = answeredCount >= session.totalRounds

  const updated = await updateGameSession(session.id, {
    score: { increment: points },
    correctCount: { increment: verdict.isCorrect ? 1 : 0 },
    incorrectCount: { increment: verdict.isCorrect ? 0 : 1 },
    ...(isComplete
      ? { status: GameSessionStatus.COMPLETED, completedAt: new Date() }
      : {}),
  })

  // Mastery only exists for a signed-in player; anonymous play still scores.
  if (session.userId && challenge.masteryScope && challenge.masteryDimension) {
    await recordMasteryAnswer({
      userId: session.userId,
      scope: challenge.masteryScope,
      dimension: challenge.masteryDimension,
      targetEntityId: challenge.masteryTargetId,
      isCorrect: verdict.isCorrect,
    })
  }

  const next = isComplete ? null : await findNextUnansweredChallenge(session.id)

  return {
    result: {
      challengeId: challenge.id,
      ordinal: challenge.ordinal,
      isCorrect: verdict.isCorrect,
      pointsAwarded: points,
      breakdown,
      parts: verdict.parts,
      explanation: solution.explanation,
      revealHref: solution.revealHref,
      revealLabel: solution.revealLabel,
      correctAnswerText: describeExpected(solution.answer, options),
    },
    session: toSessionView(updated),
    next: next ? toPlayable(next, session.totalRounds) : null,
    isComplete,
  }
}

export async function abandonSession(sessionId: string): Promise<SessionView | null> {
  const session = await findGameSession(sessionId)
  if (!session) return null
  if (session.status !== GameSessionStatus.IN_PROGRESS) return toSessionView(session)

  const updated = await updateGameSession(sessionId, {
    status: GameSessionStatus.ABANDONED,
    completedAt: new Date(),
  })

  return toSessionView(updated)
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

export type GameCatalogueEntry = {
  gameType: GameType
  name: string
  description: string | null
  /**
   * Whether any rung of this game resolves against a date, read from the
   * definition rows rather than from the game's name. A UI that decided "the
   * Time Machine gets a date picker" in code would stop being right the moment
   * a curator seeds a dated rung of another game (PRD §6).
   */
  acceptsDate: boolean
  difficulties: {
    definitionId: string
    difficulty: Difficulty
    label: string
    cognition: string
    rounds: number
    answerMode: string
  }[]
}

/** Does this definition's config ask the generator to resolve a date? */
function isDated(definition: GameDefinitionRow): boolean {
  const config = definition.config
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return false
  const record = config as Record<string, unknown>
  return record.requireTemporalResolution === true || record.compareTwoDates === true
}

/**
 * The games list, grouped by type.
 *
 * Built from definition rows, so a newly seeded difficulty appears on the games
 * page without a code change.
 */
export async function getGameCatalogue(): Promise<GameCatalogueEntry[]> {
  const definitions = await listGameDefinitions()
  const grouped = new Map<GameType, GameCatalogueEntry>()

  for (const definition of definitions) {
    const profile = effectiveProfile(definition)
    const existing = grouped.get(definition.gameType)

    const rung = {
      definitionId: definition.id,
      difficulty: definition.difficulty,
      label: profile.label,
      cognition: profile.cognition,
      rounds: definition.roundCount,
      answerMode: definition.answerMode,
    }

    if (existing) {
      existing.difficulties.push(rung)
      existing.acceptsDate = existing.acceptsDate || isDated(definition)
      continue
    }

    grouped.set(definition.gameType, {
      gameType: definition.gameType,
      // The row's name carries its difficulty ("Mystery Member — Nightmare");
      // the group heading is the game itself.
      name: GAME_TYPE_LABELS[definition.gameType],
      description: definition.description,
      acceptsDate: isDated(definition),
      difficulties: [rung],
    })
  }

  return [...grouped.values()]
}

export { InsufficientDataError } from './types'
// The player-facing half of `./types`. Re-exported here so the UI has one import
// path for the engine and never reaches past `index` into its internals.
export type {
  AnswerPart,
  ChainStep,
  ChallengePrompt,
  ChoiceOption,
  Clue,
  ClueKind,
  GraphEdgeSlot,
  GraphNodeSlot,
  PlayableChallenge,
  ProfileField,
  RoundResult,
  SubmittedAnswer,
} from './types'
