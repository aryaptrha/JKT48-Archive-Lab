import type { AnswerPart, AnswerVerdict, ScoreBreakdownLine } from './types'

/**
 * Scoring (PRD §5.2).
 *
 * The three point values live on the `GameDefinition` row — `pointsCorrect`,
 * `pointsRelationshipCorrect`, `pointsIncorrect` — so a curator can retune a
 * game without a deploy. Nothing here hard-codes 10, 20 or −5.
 *
 * A relationship is worth more than an entity because naming the edge is the
 * harder recall: you can often guess *that* two people are connected, but not
 * *how*.
 *
 * Multi-part rounds are paid per piece. That is not a partial verdict — the
 * round is still binary (PRD §7) — it is the difference between a player who
 * rebuilt four of five slots and one who rebuilt none.
 *
 * The parameter is the three columns rather than the whole definition row: the
 * session record carries its own copy of the definition without the relation
 * includes, and scoring has no business needing them.
 */
export type ScoringRules = {
  pointsCorrect: number
  pointsRelationshipCorrect: number
  pointsIncorrect: number
}

function pointsFor(definition: ScoringRules, part: AnswerPart): number {
  if (!part.isCorrect) return definition.pointsIncorrect
  return part.kind === 'RELATIONSHIP'
    ? definition.pointsRelationshipCorrect
    : definition.pointsCorrect
}

function labelFor(part: AnswerPart): string {
  const subject = part.kind === 'RELATIONSHIP' ? 'Relationship' : part.label
  return part.isCorrect ? subject : `${subject} (missed)`
}

export type RoundScore = {
  points: number
  breakdown: ScoreBreakdownLine[]
}

/**
 * Score one answered round.
 *
 * Single-part games read as one line ("Correct" / "Incorrect"); reconstruction
 * games list every slot, so the player can see where the points came from.
 */
export function scoreRound(definition: ScoringRules, verdict: AnswerVerdict): RoundScore {
  if (verdict.parts.length === 0) {
    return { points: definition.pointsIncorrect, breakdown: [{ label: 'No answer', points: definition.pointsIncorrect }] }
  }

  if (verdict.parts.length === 1) {
    const part = verdict.parts[0]
    if (!part) {
      return {
        points: definition.pointsIncorrect,
        breakdown: [{ label: 'No answer', points: definition.pointsIncorrect }],
      }
    }

    const points = pointsFor(definition, part)
    return {
      points,
      breakdown: [{ label: part.isCorrect ? 'Correct' : 'Incorrect', points }],
    }
  }

  const breakdown = verdict.parts.map((part) => ({
    label: labelFor(part),
    points: pointsFor(definition, part),
  }))

  return {
    points: breakdown.reduce((total, line) => total + line.points, 0),
    breakdown,
  }
}

/**
 * Running session score.
 *
 * Kept unclamped on purpose: `pointsIncorrect` is negative by design, and a
 * session that went badly should show that rather than sit at zero looking like
 * it never happened.
 */
export function addRoundScore(sessionScore: number, roundPoints: number): number {
  return sessionScore + roundPoints
}

/** Maximum a session could have scored, for the accuracy read-out. */
export function bestPossibleScore(definition: ScoringRules, rounds: number): number {
  const perRound = Math.max(definition.pointsCorrect, definition.pointsRelationshipCorrect)
  return perRound * rounds
}
