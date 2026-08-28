import { entityHref, entityTypeLabel } from '@/domain/entity-taxonomy'
import { AnswerMode } from '@/generated/prisma/enums'
import { addDays, daysBetween, formatDate, formatDateRange, isValidOn, today, toISODate } from '@/lib/date'
import { clamp, shuffle } from '@/lib/utils'

import type { EntityRefRow } from '../../repositories/entity-repository'

import { attributionFor } from './attribution'
import { edgeLabel } from './clues'
import { acceptedNames, toChoiceOption } from './options'
import { edgesOf, loadGraphSlice, type GraphSlice, type OrientedEdge } from './pool'
import {
  InsufficientDataError,
  type ChoiceOption,
  type Clue,
  type ExpectedAnswer,
  type GeneratedChallenge,
  type GeneratorContext,
  type QuestionGenerator,
} from './types'

/**
 * Time Machine quiz (PRD §5.4).
 *
 * Every round is anchored to a date, and the answer depends on it: "which team
 * was she in on 12 August 2014" has a different answer from the same question
 * asked two years later. That is the skill being trained, so the whole generator
 * is built around temporal edges.
 *
 * Two consequences for how it loads data:
 *
 *   - The slice is loaded across all of history, not as of one date. Each round
 *     picks its own date, and the validity windows already on the edges are what
 *     decide the answer. Loading a single as-of slice would make every round ask
 *     about the same instant.
 *   - The date is always chosen from inside a real validity window, so a round
 *     can never ask about a moment the archive has no answer for.
 *
 * The best distractor for a temporal question is the same relationship at a
 * different time — Team J is a genuinely tempting wrong answer for a member who
 * transferred to Team KIII — so those are preferred over unrelated entities.
 */

/** How close to a transfer a harder round is allowed to land. */
const BOUNDARY_WINDOW_DAYS = 90

/** Keep easier rounds clear of transitions, where the answer is unambiguous. */
const SAFE_MARGIN_DAYS = 30

const SHORTLIST_MULTIPLIER = 4

type Anchored = {
  oriented: OrientedEdge
  asOf: Date
}

function windowOf(oriented: OrientedEdge): { from: Date; to: Date } | null {
  const { validFrom, validTo } = oriented.edge
  // An edge with no recorded start cannot anchor a date question — that gap is
  // what RELATIONSHIP_MISSING_VALID_FROM reports, and guessing a start here
  // would quietly invent history.
  if (!validFrom) return null
  return { from: validFrom, to: validTo ?? today() }
}

/**
 * Pick the date to ask about.
 *
 * Easier rungs sit in the middle of a window, where only one answer has ever
 * been true. Harder rungs move towards a boundary, where the player has to
 * remember *when* something changed rather than just that it did.
 */
function pickDate(
  oriented: OrientedEdge,
  hopCount: number,
  random: () => number,
): Date | null {
  const window = windowOf(oriented)
  if (!window) return null

  const span = daysBetween(window.from, window.to)
  if (span < 0) return null

  if (hopCount >= 2 && span > BOUNDARY_WINDOW_DAYS) {
    const offset = Math.floor(random() * BOUNDARY_WINDOW_DAYS)
    return random() < 0.5 ? addDays(window.from, offset) : addDays(window.to, -offset)
  }

  const margin = span > SAFE_MARGIN_DAYS * 3 ? SAFE_MARGIN_DAYS : 0
  const usable = Math.max(0, span - margin * 2)
  return addDays(window.from, margin + Math.floor(random() * (usable + 1)))
}

/** Temporal edges of the subject that can anchor a question, in random order. */
function anchorCandidates(
  slice: GraphSlice,
  subjectId: string,
  hopCount: number,
  random: () => number,
): Anchored[] {
  const anchored: Anchored[] = []

  for (const oriented of shuffle(edgesOf(slice, subjectId), random)) {
    if (!oriented.edge.relationshipType.isTemporal) continue
    const asOf = pickDate(oriented, hopCount, random)
    if (!asOf) continue
    anchored.push({ oriented, asOf })
  }

  return anchored
}

function coversDate(oriented: OrientedEdge, asOf: Date): boolean {
  return isValidOn(asOf, oriented.edge.validFrom, oriented.edge.validTo)
}

/**
 * Other ends of the same relationship that were *not* true on the date.
 *
 * These are the distractors worth having. Unrelated entities of the same type
 * pad the list out when a subject only ever had one spell.
 */
function temporalDistractors(
  slice: GraphSlice,
  subjectId: string,
  code: string,
  correct: EntityRefRow,
  asOf: Date,
  count: number,
  random: () => number,
): EntityRefRow[] {
  const nearMisses: EntityRefRow[] = []
  const excluded = new Set<string>([correct.id])

  for (const oriented of edgesOf(slice, subjectId)) {
    if (oriented.edge.relationshipType.code !== code) continue
    if (oriented.other.id === correct.id) continue
    if (coversDate(oriented, asOf)) {
      // True on the date as well: including it would make two options right.
      excluded.add(oriented.other.id)
      continue
    }
    if (excluded.has(oriented.other.id)) continue
    excluded.add(oriented.other.id)
    nearMisses.push(oriented.other)
  }

  if (nearMisses.length >= count) return shuffle(nearMisses, random).slice(0, count)

  const sameType = [...slice.nodes.values()].filter(
    (node) => node.entityType === correct.entityType && !excluded.has(node.id),
  )

  return [...nearMisses, ...shuffle(sameType, random)].slice(0, count)
}

/** Supporting facts that were also true on the date, for the harder rungs. */
function contextClues(
  slice: GraphSlice,
  subjectId: string,
  skipCode: string,
  asOf: Date,
  limit: number,
  random: () => number,
): Clue[] {
  if (limit <= 0) return []

  const seen = new Set<string>([skipCode])
  const clues: Clue[] = []

  for (const oriented of shuffle(edgesOf(slice, subjectId), random)) {
    if (clues.length >= limit) break
    const code = oriented.edge.relationshipType.code
    if (seen.has(code)) continue
    if (!coversDate(oriented, asOf)) continue
    seen.add(code)
    clues.push({
      kind: 'TEMPORAL',
      label: entityTypeLabel(oriented.other.entityType),
      text: `${edgeLabel(oriented)} ${oriented.other.canonicalName}`,
    })
  }

  return clues
}

function buildRound(
  context: GeneratorContext,
  slice: GraphSlice,
  subject: EntityRefRow,
  ordinal: number,
): GeneratedChallenge | null {
  const { definition, profile } = context

  const candidates = anchorCandidates(slice, subject.id, profile.hopCount, context.random)

  for (const { oriented, asOf } of candidates) {
    const correct = oriented.other
    const code = oriented.edge.relationshipType.code

    // The question must have exactly one answer on that date.
    const sameCodeOnDate = edgesOf(slice, subject.id).filter(
      (candidate) =>
        candidate.edge.relationshipType.code === code &&
        candidate.direction === oriented.direction &&
        coversDate(candidate, asOf),
    )
    if (sameCodeOnDate.length !== 1) continue

    const isChoice = definition.answerMode === AnswerMode.MULTIPLE_CHOICE
    let options: ChoiceOption[] | null = null
    let expected: ExpectedAnswer = { kind: 'TEXT', ...acceptedNames(correct) }

    if (isChoice) {
      const distractors = temporalDistractors(
        slice,
        subject.id,
        code,
        correct,
        asOf,
        Math.max(1, definition.optionCount - 1),
        context.random,
      )
      if (distractors.length === 0) continue

      options = shuffle([correct, ...distractors], context.random).map(toChoiceOption)
      expected = { kind: 'OPTION', optionId: correct.id }
    }

    const targetLabel = entityTypeLabel(correct.entityType).toLowerCase()
    const clues: Clue[] = [
      { kind: 'TEMPORAL', label: 'Date', text: formatDate(asOf) },
      ...contextClues(
        slice,
        subject.id,
        code,
        asOf,
        clamp(profile.clueCount - 1, 0, 3),
        context.random,
      ),
    ]

    const attribution = attributionFor(definition, slice, subject.id)

    return {
      ordinal,
      questionStrategy: definition.questionStrategy,
      answerMode: definition.answerMode,
      prompt: {
        kind: 'CLUES',
        question: `On ${formatDate(asOf)}, which ${targetLabel} did ${subject.canonicalName} ${edgeLabel(oriented).toLowerCase()}?`,
        clues,
        asOf: toISODate(asOf) ?? null,
      },
      options,
      solution: {
        answer: expected,
        explanation: `${subject.canonicalName} ${edgeLabel(oriented).toLowerCase()} ${correct.canonicalName} — ${formatDateRange(oriented.edge.validFrom, oriented.edge.validTo)}.`,
        revealHref: entityHref(correct),
        revealLabel: `Open ${correct.canonicalName}`,
      },
      subjectEntityId: subject.id,
      masteryScope: attribution.scope,
      masteryTargetId: attribution.targetEntityId,
      masteryDimension: attribution.dimension,
    }
  }

  return null
}

export const generateTimeMachineQuiz: QuestionGenerator = async (context) => {
  // All of history, not one instant: each round chooses its own date.
  const slice = await loadGraphSlice({ ...context, scopeDate: null })

  const shortlist = shuffle(slice.subjects, context.random).slice(
    0,
    context.rounds * SHORTLIST_MULTIPLIER,
  )

  const challenges: GeneratedChallenge[] = []

  for (const subject of shortlist) {
    if (challenges.length >= context.rounds) break
    const built = buildRound(context, slice, subject, challenges.length + 1)
    if (built) challenges.push(built)
  }

  if (challenges.length === 0) {
    throw new InsufficientDataError(
      `Could not build a dated question for ${context.definition.name}.`,
      {
        needed: context.rounds,
        found: 0,
        hint: 'Temporal rounds need relationships with a recorded start date. Fill in valid_from on team memberships and captaincies.',
      },
    )
  }

  return challenges
}
