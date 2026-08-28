import { entityHref } from '@/domain/entity-taxonomy'
import { clamp, normalizeAnswer, shuffle, unique } from '@/lib/utils'

import type { EntityRefRow, EntityWithAttributes } from '../../repositories/entity-repository'
import { toEntityAttributes } from '../entity-mapper'

import { attributionFor } from './attribution'
import { edgeLabel } from './clues'
import { acceptedNames } from './options'
import { edgesOf, loadGraphSlice, loadSubjectDetails, type GraphSlice } from './pool'
import {
  InsufficientDataError,
  type ExpectedAnswer,
  type GeneratedChallenge,
  type GeneratorContext,
  type ProfileField,
  type QuestionGenerator,
} from './types'

/**
 * Memory Reconstruction (PRD §5.3).
 *
 * The subject is named; the record is not. The player fills the profile back in
 * from memory, which is a different act of recall from identification — you are
 * not narrowing candidates, you are producing facts.
 *
 * Fields come from two places, both of them the graph: the specialized attribute
 * row, and the entity's own relationships. Including relationships matters —
 * "which team was she in" is exactly the sort of thing a fan reconstructs, and
 * leaving it out would make this game a quiz about flat columns.
 *
 * Only `isRecallTarget` fields may be blanked, and never an identity field: the
 * heading already names the subject, so asking for the stage name would be a
 * free point.
 */

const MIN_BLANKS = 1
const MAX_BLANKS = 5
const SHORTLIST_MULTIPLIER = 3

type Candidate = {
  field: ProfileField
  accepted: string[]
  display: string
  isRecallTarget: boolean
}

function attributeCandidates(detail: EntityWithAttributes): Candidate[] {
  return toEntityAttributes(detail).map((attr, index) => ({
    field: {
      key: `attr:${index}`,
      label: attr.label,
      value: attr.value,
      isRedacted: false,
    },
    accepted: unique([normalizeAnswer(attr.value)].filter((value) => value.length > 0)),
    display: attr.value,
    // Identity fields stay visible: the heading names the subject already.
    isRecallTarget: Boolean(attr.isRecallTarget) && !attr.isIdentity,
  }))
}

/**
 * One field per relationship type.
 *
 * A member with three team spells would otherwise produce three "Team" rows with
 * no way to tell which blank wants which answer.
 */
function relationshipCandidates(slice: GraphSlice, subjectId: string): Candidate[] {
  const seen = new Set<string>()
  const candidates: Candidate[] = []

  for (const oriented of edgesOf(slice, subjectId)) {
    const code = oriented.edge.relationshipType.code
    if (seen.has(code)) continue
    seen.add(code)

    const label = edgeLabel(oriented)
    const value = oriented.other.canonicalName

    candidates.push({
      field: { key: `rel:${code}`, label, value, isRedacted: false },
      accepted: acceptedNames(oriented.other).accepted,
      display: value,
      isRecallTarget: true,
    })
  }

  return candidates
}

function blankBudget(clueCount: number, hopCount: number, available: number): number {
  const wanted = clamp(clueCount + hopCount - 1, MIN_BLANKS, MAX_BLANKS)
  return Math.min(wanted, available)
}

function buildRound(
  context: GeneratorContext,
  slice: GraphSlice,
  subject: EntityRefRow,
  detail: EntityWithAttributes | undefined,
  ordinal: number,
): GeneratedChallenge | null {
  const { definition, profile } = context
  if (!detail) return null

  const candidates = [...attributeCandidates(detail), ...relationshipCandidates(slice, subject.id)]
  if (candidates.length === 0) return null

  const redactable = candidates.filter(
    (candidate) => candidate.isRecallTarget && candidate.accepted.length > 0,
  )
  if (redactable.length === 0) return null

  // Leave at least one field standing, so the record still reads as a record.
  const capacity = Math.max(1, Math.min(redactable.length, candidates.length - 1))
  const budget = blankBudget(profile.clueCount, profile.hopCount, capacity)

  const blanked = shuffle(redactable, context.random).slice(0, budget)
  const blankedKeys = new Set(blanked.map((candidate) => candidate.field.key))

  const fields: ProfileField[] = candidates.map((candidate) =>
    blankedKeys.has(candidate.field.key)
      ? { ...candidate.field, value: null, isRedacted: true }
      : candidate.field,
  )

  const expected: ExpectedAnswer = {
    kind: 'FIELDS',
    fields: blanked.map((candidate) => ({
      key: candidate.field.key,
      label: candidate.field.label,
      accepted: candidate.accepted,
      display: candidate.display,
    })),
  }

  const attribution = attributionFor(definition, slice, subject.id)

  return {
    ordinal,
    questionStrategy: definition.questionStrategy,
    answerMode: definition.answerMode,
    prompt: {
      kind: 'PROFILE',
      question: `Reconstruct the missing entries in this record.`,
      heading: subject.canonicalName,
      fields,
    },
    options: null,
    solution: {
      answer: expected,
      explanation: blanked
        .map((candidate) => `${candidate.field.label}: ${candidate.display}`)
        .join('; '),
      revealHref: entityHref(subject),
      revealLabel: `Open ${subject.canonicalName}`,
    },
    subjectEntityId: subject.id,
    masteryScope: attribution.scope,
    masteryTargetId: attribution.targetEntityId,
    masteryDimension: attribution.dimension,
  }
}

export const generateMemoryReconstruction: QuestionGenerator = async (context) => {
  const slice = await loadGraphSlice(context)

  const shortlist = shuffle(slice.subjects, context.random).slice(
    0,
    context.rounds * SHORTLIST_MULTIPLIER,
  )
  const details = await loadSubjectDetails(
    shortlist.map((subject) => subject.id),
    context.graph.includeUnpublished ?? false,
  )

  const challenges: GeneratedChallenge[] = []

  for (const subject of shortlist) {
    if (challenges.length >= context.rounds) break
    const built = buildRound(
      context,
      slice,
      subject,
      details.get(subject.id),
      challenges.length + 1,
    )
    if (built) challenges.push(built)
  }

  if (challenges.length === 0) {
    throw new InsufficientDataError(
      `Could not build a record to reconstruct for ${context.definition.name}.`,
      {
        needed: context.rounds,
        found: 0,
        hint: 'Subjects need recallable attributes (birth date, debut, catchphrase) or relationships before a profile can be blanked out.',
      },
    )
  }

  return challenges
}
