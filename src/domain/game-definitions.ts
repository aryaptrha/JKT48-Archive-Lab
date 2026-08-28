import type {
  QuestionStrategy} from '@/generated/prisma/enums';
import {
  AnswerMode,
  Difficulty,
  EntityType,
  GameType
} from '@/generated/prisma/enums'

import { DIFFICULTY_ORDER, difficultyProfile } from './difficulty'
import { REL, type RelationshipCode } from './relationship-types'

/**
 * Game definitions (PRD §6).
 *
 * A game is a row, not a code path. The engine reads a `GameDefinition` and
 * generates questions from the knowledge graph; adding a game or a difficulty
 * rung is a data change. This file seeds the table and documents the intent of
 * each configuration.
 *
 * Note what is *absent*: no definition sets a time limit. Difficulty in this
 * product is cognitive complexity, never a faster clock (PRD §P4).
 */

export type GameDefinitionSeed = {
  code: string
  name: string
  description: string
  gameType: GameType
  difficulty: Difficulty
  targetEntityType: EntityType
  questionStrategy: QuestionStrategy
  answerMode: AnswerMode
  clueCount: number
  optionCount: number
  hopCount: number
  roundCount: number
  timeLimitSec: number | null
  pointsCorrect: number
  pointsRelationshipCorrect: number
  pointsIncorrect: number
  /** Edges the subject MUST have — these gate subject selection. */
  requiredRelationshipCodes: RelationshipCode[]
  /** Edges that enrich clues when present, but are not required. */
  optionalRelationshipCodes: RelationshipCode[]
  config?: Record<string, unknown>
  isActive: boolean
  displayOrder: number
}

export const GAME_TYPE_LABELS: Record<GameType, string> = {
  [GameType.MYSTERY_MEMBER]: 'Mystery Member',
  [GameType.CONNECT_THE_DOTS]: 'Connect the Dots',
  [GameType.MEMORY_RECONSTRUCTION]: 'Memory Reconstruction',
  [GameType.TIME_MACHINE_QUIZ]: 'Time Machine',
  [GameType.DAILY_CHALLENGE]: 'Daily Challenge',
}

export const GAME_TYPE_SLUGS: Record<GameType, string> = {
  [GameType.MYSTERY_MEMBER]: 'mystery-member',
  [GameType.CONNECT_THE_DOTS]: 'connect-the-dots',
  [GameType.MEMORY_RECONSTRUCTION]: 'memory-reconstruction',
  [GameType.TIME_MACHINE_QUIZ]: 'time-machine',
  [GameType.DAILY_CHALLENGE]: 'daily-challenge',
}

const SLUG_TO_GAME_TYPE = new Map(
  (Object.keys(GAME_TYPE_SLUGS) as GameType[]).map((type) => [GAME_TYPE_SLUGS[type], type]),
)

export function gameTypeFromSlug(slug: string): GameType | undefined {
  return SLUG_TO_GAME_TYPE.get(slug)
}

export function gameHref(gameType: GameType): string {
  return `/games/${GAME_TYPE_SLUGS[gameType]}`
}

/** Catalogue copy for the /games index (PRD §5). */
export type GameCatalogEntry = {
  gameType: GameType
  slug: string
  label: string
  tagline: string
  description: string
  /** What the player is actually being trained to do. */
  trains: string
  isAvailable: boolean
}

export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    gameType: GameType.MYSTERY_MEMBER,
    slug: GAME_TYPE_SLUGS[GameType.MYSTERY_MEMBER],
    label: GAME_TYPE_LABELS[GameType.MYSTERY_MEMBER],
    tagline: 'Clues in, name out.',
    description:
      'A member is described only through their relationships. Read the clues, narrow the field, and name them.',
    trains: 'Turning scattered facts into a single identification.',
    isAvailable: true,
  },
  {
    gameType: GameType.CONNECT_THE_DOTS,
    slug: GAME_TYPE_SLUGS[GameType.CONNECT_THE_DOTS],
    label: GAME_TYPE_LABELS[GameType.CONNECT_THE_DOTS],
    tagline: 'Rebuild the missing edges.',
    description:
      'You are given a fragment of the graph with pieces removed. Restore the entities and the relationships between them.',
    trains: 'Seeing the archive as a network rather than a list.',
    isAvailable: true,
  },
  {
    gameType: GameType.MEMORY_RECONSTRUCTION,
    slug: GAME_TYPE_SLUGS[GameType.MEMORY_RECONSTRUCTION],
    label: GAME_TYPE_LABELS[GameType.MEMORY_RECONSTRUCTION],
    tagline: 'Fill in the redactions.',
    description:
      'A record from the archive is shown with fields blanked out. Reconstruct it from what you remember.',
    trains: 'Recall under partial information.',
    isAvailable: true,
  },
  {
    gameType: GameType.TIME_MACHINE_QUIZ,
    slug: GAME_TYPE_SLUGS[GameType.TIME_MACHINE_QUIZ],
    label: GAME_TYPE_LABELS[GameType.TIME_MACHINE_QUIZ],
    tagline: 'What was true on this date?',
    description:
      'Pick a date. Answer questions about the state of the group at that exact moment in its history.',
    trains: 'Temporal reasoning — who was where, and when.',
    isAvailable: true,
  },
  {
    gameType: GameType.DAILY_CHALLENGE,
    slug: GAME_TYPE_SLUGS[GameType.DAILY_CHALLENGE],
    label: GAME_TYPE_LABELS[GameType.DAILY_CHALLENGE],
    tagline: 'One set, everyone, every day.',
    description: 'A fixed daily seed so every player gets the same questions. Planned for V1.1.',
    trains: 'Consistency, and a reason to come back.',
    isAvailable: false,
  },
]

/* -------------------------------------------------------------------------- */
/* Seeds                                                                      */
/* -------------------------------------------------------------------------- */

const POINTS = {
  correct: 10,
  /** Connect the Dots pays double for a correct edge (PRD §5.2). */
  relationship: 20,
  incorrect: -5,
} as const

type SeedOverrides = Partial<Omit<GameDefinitionSeed, 'gameType' | 'difficulty'>>

/**
 * Build one definition from a difficulty profile, so clue count, hop count and
 * question strategy stay derived from the difficulty ladder rather than
 * re-stated per row.
 */
function define(
  gameType: GameType,
  difficulty: Difficulty,
  overrides: SeedOverrides,
): GameDefinitionSeed {
  const profile = difficultyProfile(difficulty)
  const orderIndex = DIFFICULTY_ORDER.indexOf(difficulty)

  return {
    code: `${gameType}_${difficulty}`,
    name: `${GAME_TYPE_LABELS[gameType]} — ${profile.label}`,
    description: profile.description,
    gameType,
    difficulty,
    targetEntityType: EntityType.MEMBER,
    questionStrategy: profile.strategy,
    answerMode: AnswerMode.MULTIPLE_CHOICE,
    clueCount: profile.clueCount,
    optionCount: 4,
    hopCount: profile.hopCount,
    roundCount: 5,
    timeLimitSec: null,
    pointsCorrect: POINTS.correct,
    pointsRelationshipCorrect: POINTS.relationship,
    pointsIncorrect: POINTS.incorrect,
    requiredRelationshipCodes: [],
    optionalRelationshipCodes: [],
    isActive: true,
    displayOrder: orderIndex * 10,
    ...overrides,
  }
}

const MEMBER_CORE_EDGES: RelationshipCode[] = [REL.BELONGS_TO_GENERATION, REL.MEMBER_OF]

const MEMBER_ENRICHMENT_EDGES: RelationshipCode[] = [
  REL.CENTER_OF,
  REL.SENBATSU_IN,
  REL.CAPTAIN_OF,
  REL.PARTICIPATED_IN,
  REL.RANKED_IN,
  REL.APPEARED_IN,
  REL.GRADUATED_AT,
  REL.DEBUTED_AT,
]

/**
 * Mystery Member.
 *
 * The PRD's worked example is the HARD rung: identify a member from generation,
 * team and center relationships using an indirect chain. The other rungs move
 * the same generator up and down the cognitive ladder.
 */
const MYSTERY_MEMBER_SEEDS: GameDefinitionSeed[] = [
  define(GameType.MYSTERY_MEMBER, Difficulty.EASY, {
    answerMode: AnswerMode.MULTIPLE_CHOICE,
    requiredRelationshipCodes: [REL.BELONGS_TO_GENERATION],
    optionalRelationshipCodes: [REL.MEMBER_OF],
  }),
  define(GameType.MYSTERY_MEMBER, Difficulty.MEDIUM, {
    answerMode: AnswerMode.TEXT_INPUT,
    requiredRelationshipCodes: MEMBER_CORE_EDGES,
    optionalRelationshipCodes: [REL.CENTER_OF, REL.SENBATSU_IN],
  }),
  define(GameType.MYSTERY_MEMBER, Difficulty.HARD, {
    answerMode: AnswerMode.TEXT_INPUT,
    requiredRelationshipCodes: [REL.BELONGS_TO_GENERATION, REL.MEMBER_OF, REL.CENTER_OF],
    optionalRelationshipCodes: MEMBER_ENRICHMENT_EDGES,
  }),
  define(GameType.MYSTERY_MEMBER, Difficulty.EXPERT, {
    answerMode: AnswerMode.TEXT_INPUT,
    requiredRelationshipCodes: [REL.MEMBER_OF, REL.CENTER_OF],
    optionalRelationshipCodes: MEMBER_ENRICHMENT_EDGES,
    config: {
      /** The subject is reached only through a pivot entity, never named. */
      pivotThroughRelationship: REL.CENTER_OF,
    },
  }),
  define(GameType.MYSTERY_MEMBER, Difficulty.NIGHTMARE, {
    answerMode: AnswerMode.TEXT_INPUT,
    roundCount: 3,
    requiredRelationshipCodes: [REL.MEMBER_OF],
    optionalRelationshipCodes: MEMBER_ENRICHMENT_EDGES,
    config: {
      /** Clues are only valid on a given date, so the roster must be resolved first. */
      requireTemporalResolution: true,
    },
  }),
]

/**
 * Connect the Dots.
 *
 * The player rebuilds a subgraph, so scoring distinguishes naming an entity
 * (+10) from correctly wiring a relationship (+20).
 */
const CONNECT_THE_DOTS_SEEDS: GameDefinitionSeed[] = [
  define(GameType.CONNECT_THE_DOTS, Difficulty.EASY, {
    answerMode: AnswerMode.GRAPH_BUILD,
    roundCount: 3,
    requiredRelationshipCodes: [REL.BELONGS_TO_GENERATION],
    optionalRelationshipCodes: [REL.MEMBER_OF],
    config: { missingEdgeCount: 1, missingNodeCount: 1 },
  }),
  define(GameType.CONNECT_THE_DOTS, Difficulty.MEDIUM, {
    answerMode: AnswerMode.GRAPH_BUILD,
    roundCount: 3,
    requiredRelationshipCodes: MEMBER_CORE_EDGES,
    optionalRelationshipCodes: [REL.CENTER_OF, REL.CAPTAIN_OF],
    config: { missingEdgeCount: 2, missingNodeCount: 1 },
  }),
  define(GameType.CONNECT_THE_DOTS, Difficulty.HARD, {
    answerMode: AnswerMode.GRAPH_BUILD,
    roundCount: 3,
    requiredRelationshipCodes: [REL.MEMBER_OF, REL.CENTER_OF, REL.TRACK_ON],
    optionalRelationshipCodes: [REL.SENBATSU_IN, REL.IN_SETLIST, REL.TITLE_TRACK_OF],
    config: { missingEdgeCount: 3, missingNodeCount: 2 },
  }),
  define(GameType.CONNECT_THE_DOTS, Difficulty.EXPERT, {
    answerMode: AnswerMode.GRAPH_BUILD,
    roundCount: 2,
    requiredRelationshipCodes: [REL.MEMBER_OF, REL.CENTER_OF],
    optionalRelationshipCodes: [REL.SENBATSU_IN, REL.PARTICIPATED_IN, REL.SUCCEEDED_BY],
    config: { missingEdgeCount: 4, missingNodeCount: 2, hideRelationshipLabels: true },
  }),
  define(GameType.CONNECT_THE_DOTS, Difficulty.NIGHTMARE, {
    answerMode: AnswerMode.GRAPH_BUILD,
    roundCount: 2,
    requiredRelationshipCodes: [REL.MEMBER_OF],
    optionalRelationshipCodes: MEMBER_ENRICHMENT_EDGES,
    config: {
      missingEdgeCount: 5,
      missingNodeCount: 3,
      hideRelationshipLabels: true,
      requireTemporalResolution: true,
    },
  }),
]

/**
 * Memory Reconstruction.
 *
 * A record is shown with fields redacted. Only three rungs in V1 — beyond
 * EXPERT the exercise stops discriminating.
 */
const MEMORY_RECONSTRUCTION_SEEDS: GameDefinitionSeed[] = [
  define(GameType.MEMORY_RECONSTRUCTION, Difficulty.EASY, {
    answerMode: AnswerMode.FORM_RECONSTRUCTION,
    roundCount: 3,
    requiredRelationshipCodes: [REL.BELONGS_TO_GENERATION],
    optionalRelationshipCodes: [REL.MEMBER_OF],
    config: { redactedFieldCount: 2, redactRelationships: false },
  }),
  define(GameType.MEMORY_RECONSTRUCTION, Difficulty.MEDIUM, {
    answerMode: AnswerMode.FORM_RECONSTRUCTION,
    roundCount: 3,
    requiredRelationshipCodes: MEMBER_CORE_EDGES,
    optionalRelationshipCodes: [REL.CENTER_OF, REL.SENBATSU_IN],
    config: { redactedFieldCount: 3, redactRelationships: true },
  }),
  define(GameType.MEMORY_RECONSTRUCTION, Difficulty.HARD, {
    answerMode: AnswerMode.FORM_RECONSTRUCTION,
    roundCount: 3,
    requiredRelationshipCodes: [REL.BELONGS_TO_GENERATION, REL.MEMBER_OF, REL.CENTER_OF],
    optionalRelationshipCodes: MEMBER_ENRICHMENT_EDGES,
    config: { redactedFieldCount: 4, redactRelationships: true, redactCanonicalName: true },
  }),
  define(GameType.MEMORY_RECONSTRUCTION, Difficulty.EXPERT, {
    answerMode: AnswerMode.FORM_RECONSTRUCTION,
    roundCount: 2,
    requiredRelationshipCodes: [REL.MEMBER_OF, REL.CENTER_OF],
    optionalRelationshipCodes: MEMBER_ENRICHMENT_EDGES,
    config: { redactedFieldCount: 6, redactRelationships: true, redactCanonicalName: true },
  }),
]

/**
 * Time Machine quiz.
 *
 * Every question resolves against a date, which makes temporal validity the
 * whole point rather than an implementation detail.
 */
const TIME_MACHINE_SEEDS: GameDefinitionSeed[] = [
  define(GameType.TIME_MACHINE_QUIZ, Difficulty.EASY, {
    answerMode: AnswerMode.MULTIPLE_CHOICE,
    requiredRelationshipCodes: [REL.MEMBER_OF],
    optionalRelationshipCodes: [REL.BELONGS_TO_GENERATION],
    config: { requireTemporalResolution: true },
  }),
  define(GameType.TIME_MACHINE_QUIZ, Difficulty.MEDIUM, {
    answerMode: AnswerMode.MULTIPLE_CHOICE,
    requiredRelationshipCodes: [REL.MEMBER_OF, REL.BELONGS_TO_GENERATION],
    optionalRelationshipCodes: [REL.CAPTAIN_OF, REL.CENTER_OF],
    config: { requireTemporalResolution: true },
  }),
  define(GameType.TIME_MACHINE_QUIZ, Difficulty.HARD, {
    answerMode: AnswerMode.TEXT_INPUT,
    requiredRelationshipCodes: [REL.MEMBER_OF, REL.CAPTAIN_OF],
    optionalRelationshipCodes: [REL.CENTER_OF, REL.PARTICIPATED_IN, REL.SENBATSU_IN],
    config: { requireTemporalResolution: true },
  }),
  define(GameType.TIME_MACHINE_QUIZ, Difficulty.EXPERT, {
    answerMode: AnswerMode.TEXT_INPUT,
    requiredRelationshipCodes: [REL.MEMBER_OF],
    optionalRelationshipCodes: MEMBER_ENRICHMENT_EDGES,
    config: { requireTemporalResolution: true, compareTwoDates: true },
  }),
  define(GameType.TIME_MACHINE_QUIZ, Difficulty.NIGHTMARE, {
    answerMode: AnswerMode.TEXT_INPUT,
    roundCount: 3,
    requiredRelationshipCodes: [REL.MEMBER_OF],
    optionalRelationshipCodes: MEMBER_ENRICHMENT_EDGES,
    config: { requireTemporalResolution: true, compareTwoDates: true },
  }),
]

/** Seeded but inactive: the daily set arrives in V1.1 (PRD §5.5). */
const DAILY_CHALLENGE_SEEDS: GameDefinitionSeed[] = [
  define(GameType.DAILY_CHALLENGE, Difficulty.MEDIUM, {
    answerMode: AnswerMode.MULTIPLE_CHOICE,
    roundCount: 5,
    requiredRelationshipCodes: MEMBER_CORE_EDGES,
    optionalRelationshipCodes: MEMBER_ENRICHMENT_EDGES,
    config: { seedStrategy: 'CALENDAR_DATE' },
    isActive: false,
  }),
]

export const GAME_DEFINITION_SEEDS: GameDefinitionSeed[] = [
  ...MYSTERY_MEMBER_SEEDS,
  ...CONNECT_THE_DOTS_SEEDS,
  ...MEMORY_RECONSTRUCTION_SEEDS,
  ...TIME_MACHINE_SEEDS,
  ...DAILY_CHALLENGE_SEEDS,
]

export function gameDefinitionCode(gameType: GameType, difficulty: Difficulty): string {
  return `${gameType}_${difficulty}`
}

/** Difficulties that actually have a seeded definition for a game. */
export function availableDifficulties(gameType: GameType): Difficulty[] {
  const present = new Set(
    GAME_DEFINITION_SEEDS.filter((s) => s.gameType === gameType && s.isActive).map(
      (s) => s.difficulty,
    ),
  )
  return DIFFICULTY_ORDER.filter((d) => present.has(d))
}
