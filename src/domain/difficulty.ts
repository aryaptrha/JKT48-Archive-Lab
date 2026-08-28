import { Difficulty, QuestionStrategy } from '@/generated/prisma/enums'

/**
 * Difficulty as cognitive complexity (PRD §P4).
 *
 * Difficulty is NOT a shorter timer or fewer options. It changes the *kind* of
 * reasoning required, which is why each rung maps to a question strategy.
 *
 *   Easy       direct fact
 *   Medium     multiple facts
 *   Hard       relationship
 *   Expert     indirect relationship
 *   Nightmare  multi-hop reasoning
 */

export const DIFFICULTY_ORDER: Difficulty[] = [
  Difficulty.EASY,
  Difficulty.MEDIUM,
  Difficulty.HARD,
  Difficulty.EXPERT,
  Difficulty.NIGHTMARE,
]

export type DifficultyProfile = {
  difficulty: Difficulty
  label: string
  /** The cognitive demand, in the PRD's own words. */
  cognition: string
  description: string
  strategy: QuestionStrategy
  /** Graph traversal depth the generator should use. */
  hopCount: number
  /** Number of clues revealed up front. */
  clueCount: number
  /** How prominent a subject may be: EASY sticks to well-known entities. */
  minProminence: number
  maxProminence: number
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  [Difficulty.EASY]: {
    difficulty: Difficulty.EASY,
    label: 'Easy',
    cognition: 'Direct fact',
    description: 'One attribute or one relationship, asked plainly. Recognition, not reasoning.',
    strategy: QuestionStrategy.DIRECT_FACT,
    hopCount: 1,
    clueCount: 1,
    minProminence: 55,
    maxProminence: 100,
  },
  [Difficulty.MEDIUM]: {
    difficulty: Difficulty.MEDIUM,
    label: 'Medium',
    cognition: 'Multiple facts',
    description:
      'Several facts must be intersected before one candidate remains. Free-text recall rather than recognition.',
    strategy: QuestionStrategy.MULTIPLE_FACTS,
    hopCount: 1,
    clueCount: 2,
    minProminence: 35,
    maxProminence: 100,
  },
  [Difficulty.HARD]: {
    difficulty: Difficulty.HARD,
    label: 'Hard',
    cognition: 'Relationship',
    description:
      'A relationship chain is given and must be read as a path: generation → team → song.',
    strategy: QuestionStrategy.RELATIONSHIP,
    hopCount: 2,
    clueCount: 3,
    minProminence: 20,
    maxProminence: 100,
  },
  [Difficulty.EXPERT]: {
    difficulty: Difficulty.EXPERT,
    label: 'Expert',
    cognition: 'Indirect relationship',
    description:
      'The subject is never named directly — "the same team as the center of Song X". You must resolve the pivot first.',
    strategy: QuestionStrategy.INDIRECT_RELATIONSHIP,
    hopCount: 3,
    clueCount: 2,
    minProminence: 10,
    maxProminence: 100,
  },
  [Difficulty.NIGHTMARE]: {
    difficulty: Difficulty.NIGHTMARE,
    label: 'Nightmare',
    cognition: 'Multi-hop reasoning',
    description:
      'Multi-hop historical reasoning across time: who was where, when, and what that implies.',
    strategy: QuestionStrategy.MULTI_HOP,
    hopCount: 4,
    clueCount: 2,
    minProminence: 0,
    maxProminence: 100,
  },
}

export function difficultyProfile(difficulty: Difficulty): DifficultyProfile {
  return DIFFICULTY_PROFILES[difficulty]
}

export function parseDifficulty(value: string | undefined | null): Difficulty | undefined {
  if (!value) return undefined
  const upper = value.toUpperCase()
  return DIFFICULTY_ORDER.find((d) => d === upper)
}
