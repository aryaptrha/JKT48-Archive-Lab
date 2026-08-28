import type { DifficultyProfile } from '@/domain/difficulty'
import type {
  AnswerMode,
  MasteryDimension,
  MasteryScope,
  QuestionStrategy,
} from '@/generated/prisma/enums'

import type { GameDefinitionRow } from '../../repositories/game-repository'
import type { GraphContext } from '../knowledge-graph'

/**
 * Game engine contracts (PRD §6).
 *
 * The engine is five separable pieces: a Game Definition (a database row), a
 * Question Generator, a Difficulty model, an Answer Evaluator and a Scoring
 * rule. These types are the seams between them, so a new game means a new
 * generator plus a row — not a new code path through the archive.
 *
 * One rule holds everywhere below: `ChallengePrompt` and `options` are what the
 * player is allowed to see, and `ChallengeSolution` is not. They are stored in
 * separate columns for that reason, and the mapper at the bottom of this file is
 * the only thing that builds a player-facing view.
 */

export type ClueKind = 'ATTRIBUTE' | 'RELATIONSHIP' | 'TEMPORAL'

export type Clue = {
  kind: ClueKind
  /** Short label — "Generation", "Team", "Born". */
  label: string
  text: string
}

export type ChoiceOption = {
  id: string
  label: string
  detail: string | null
}

/**
 * One link in a rendered chain, shown as a breadcrumb the player must walk.
 *
 * Indirect questions are presented as a chain rather than as a nested English
 * sentence ("the captain of the team of the center of…"), which stops being
 * readable at two hops and is where EXPERT starts.
 */
export type ChainStep = {
  relationshipLabel: string
  /** Null when this position is the unknown the player is solving for. */
  entityLabel: string | null
  isUnknown: boolean
}

export type ProfileField = {
  key: string
  label: string
  /** Null when redacted — the value lives in the solution, not here. */
  value: string | null
  isRedacted: boolean
}

export type GraphNodeSlot = {
  id: string
  /** Null when the player must name this node. */
  label: string | null
  entityTypeLabel: string
  isUnknown: boolean
}

export type GraphEdgeSlot = {
  id: string
  fromNodeId: string
  toNodeId: string
  /** Null when the player must choose the relationship. */
  label: string | null
  isMissing: boolean
}

export type ChallengePrompt =
  | { kind: 'CLUES'; question: string; clues: Clue[]; asOf: string | null }
  | {
      kind: 'CHAIN'
      question: string
      chain: ChainStep[]
      clues: Clue[]
      asOf: string | null
    }
  | { kind: 'PROFILE'; question: string; heading: string; fields: ProfileField[] }
  | {
      kind: 'GRAPH'
      question: string
      nodes: GraphNodeSlot[]
      edges: GraphEdgeSlot[]
      nodeChoices: ChoiceOption[]
      edgeChoices: ChoiceOption[]
      asOf: string | null
    }

/* -------------------------------------------------------------------------- */
/* Answers                                                                    */
/* -------------------------------------------------------------------------- */

export type ExpectedAnswer =
  | { kind: 'OPTION'; optionId: string }
  /** Any of `accepted` (already normalised) counts as right. */
  | { kind: 'TEXT'; accepted: string[]; display: string }
  | {
      kind: 'FIELDS'
      fields: { key: string; label: string; accepted: string[]; display: string }[]
    }
  | {
      kind: 'GRAPH'
      nodes: { slotId: string; label: string; accepted: string[] }[]
      edges: { slotId: string; code: string; label: string }[]
    }

export type SubmittedAnswer =
  | { kind: 'OPTION'; optionId: string }
  | { kind: 'TEXT'; text: string }
  | { kind: 'FIELDS'; values: Record<string, string> }
  | { kind: 'GRAPH'; nodes: Record<string, string>; edges: Record<string, string> }

/**
 * Everything withheld until the player answers: the expected answer plus the
 * archival citation that justifies it.
 *
 * The citation is the point. A quiz that says "wrong" without showing where the
 * truth lives is not an archive feature (PRD §P2).
 */
export type ChallengeSolution = {
  answer: ExpectedAnswer
  explanation: string
  /** Link back into the encyclopedia for the reveal. */
  revealHref: string | null
  revealLabel: string | null
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

export type GeneratedChallenge = {
  ordinal: number
  questionStrategy: QuestionStrategy
  answerMode: AnswerMode
  prompt: ChallengePrompt
  options: ChoiceOption[] | null
  solution: ChallengeSolution
  subjectEntityId: string | null
  masteryScope: MasteryScope | null
  masteryTargetId: string | null
  masteryDimension: MasteryDimension | null
}

export type GeneratorContext = {
  definition: GameDefinitionRow
  profile: DifficultyProfile
  /** Temporal context for every graph read this generator makes. */
  graph: GraphContext
  scopeEntityId: string | null
  scopeDate: Date | null
  /** Seeded RNG — the same seed must always produce the same session. */
  random: () => number
  rounds: number
}

export type QuestionGenerator = (context: GeneratorContext) => Promise<GeneratedChallenge[]>

/**
 * Thrown when the archive cannot support a game at this difficulty.
 *
 * Surfacing this as a typed error rather than generating a degenerate question
 * is deliberate: a thin archive should say "not enough data yet" and point the
 * admin at the data-health report, not quietly ask about the same three members
 * forever (PRD §16).
 */
export class InsufficientDataError extends Error {
  readonly code = 'INSUFFICIENT_DATA'

  constructor(
    message: string,
    readonly detail: { needed: number; found: number; hint: string },
  ) {
    super(message)
    this.name = 'InsufficientDataError'
  }
}

/* -------------------------------------------------------------------------- */
/* Player-facing views                                                        */
/* -------------------------------------------------------------------------- */

/** What the client receives for an unanswered round. Never carries the answer. */
export type PlayableChallenge = {
  id: string
  ordinal: number
  totalRounds: number
  questionStrategy: QuestionStrategy
  answerMode: AnswerMode
  prompt: ChallengePrompt
  options: ChoiceOption[] | null
}

export type AnswerPart = {
  key: string
  label: string
  kind: 'ENTITY' | 'RELATIONSHIP' | 'FIELD'
  isCorrect: boolean
  expected: string
  submitted: string | null
}

/**
 * The result of evaluating one answer.
 *
 * V1 is binary: `isCorrect` is a boolean and there is no confidence rating
 * (PRD §7). `parts` exists for the partially-scorable games — it records which
 * pieces were right so scoring can pay per piece, not so correctness becomes a
 * gradient.
 */
export type AnswerVerdict = {
  isCorrect: boolean
  parts: AnswerPart[]
}

export type ScoreBreakdownLine = {
  label: string
  points: number
}

export type RoundResult = {
  challengeId: string
  ordinal: number
  isCorrect: boolean
  pointsAwarded: number
  breakdown: ScoreBreakdownLine[]
  parts: AnswerPart[]
  explanation: string
  revealHref: string | null
  revealLabel: string | null
  /** The answer in prose, for the reveal panel. */
  correctAnswerText: string
}
