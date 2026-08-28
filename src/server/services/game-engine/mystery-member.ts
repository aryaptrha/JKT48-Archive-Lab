import { entityHref, entityTypeLabel } from '@/domain/entity-taxonomy'
import { AnswerMode, QuestionStrategy } from '@/generated/prisma/enums'
import { toISODate } from '@/lib/date'
import { shuffle } from '@/lib/utils'

import type { EntityRefRow, EntityWithAttributes } from '../../repositories/entity-repository'

import { attributionFor } from './attribution'
import {
  attributeClues,
  buildChain,
  chainSentence,
  describeChain,
  relationshipClue,
  resolveChainHeads,
} from './clues'
import { acceptedNames, buildOptions, pickDistractors } from './options'
import {
  edgesOf,
  entitiesSharingEdge,
  loadGraphSlice,
  loadSubjectDetails,
  type GraphSlice,
  type OrientedEdge,
} from './pool'
import {
  InsufficientDataError,
  type Clue,
  type ExpectedAnswer,
  type GeneratedChallenge,
  type GeneratorContext,
  type QuestionGenerator,
} from './types'

/**
 * Mystery Member (PRD §5.1).
 *
 * One generator, five rungs. Up to HARD the player intersects a set of direct
 * clues; from EXPERT the subject is never described directly at all and must be
 * reached by walking a chain backwards. Nothing about the game is hard-coded per
 * difficulty — the `GameDefinition` row and its difficulty profile decide how
 * many clues, which relationships and how many hops.
 */

/** At and above this hop count the subject is reached indirectly, not described. */
const CHAIN_MODE_HOPS = 3

/** Chains often come out ambiguous; try a few before giving up on a subject. */
const CHAIN_ATTEMPTS = 5

/** Look at more subjects than rounds, since not every subject yields a question. */
const SHORTLIST_MULTIPLIER = 3

function requiredCodes(context: GeneratorContext): Set<string> {
  return new Set(
    context.definition.requiredRelationshipTypes
      .filter((link) => link.isRequired)
      .map((link) => link.relationshipType.code),
  )
}

/**
 * One clue per relationship type.
 *
 * Without this, three clues about a member with three team spells are three
 * variations of "member of a team", which reads as padding rather than as an
 * intersection to solve.
 */
function distinctRelationshipEdges(
  slice: GraphSlice,
  subjectId: string,
  preferred: Set<string>,
  random: () => number,
  limit: number,
): OrientedEdge[] {
  const all = shuffle(edgesOf(slice, subjectId), random)
  const ordered = [
    ...all.filter((oriented) => preferred.has(oriented.edge.relationshipType.code)),
    ...all.filter((oriented) => !preferred.has(oriented.edge.relationshipType.code)),
  ]

  const seen = new Set<string>()
  const chosen: OrientedEdge[] = []

  for (const oriented of ordered) {
    const code = oriented.edge.relationshipType.code
    if (seen.has(code)) continue
    seen.add(code)
    chosen.push(oriented)
    if (chosen.length >= limit) break
  }

  return chosen
}

/**
 * Compose the clue list for a difficulty.
 *
 * EASY leans on a single relationship, MEDIUM mixes a relationship with a
 * remembered attribute, HARD stacks relationships. The composition follows the
 * question strategy, so a new rung is a profile change rather than a branch.
 */
function composeClues(
  strategy: QuestionStrategy,
  clueCount: number,
  relationshipClues: Clue[],
  attributes: Clue[],
): Clue[] {
  const wantedRelationships =
    strategy === QuestionStrategy.DIRECT_FACT
      ? 1
      : strategy === QuestionStrategy.MULTIPLE_FACTS
        ? 1
        : clueCount

  const clues: Clue[] = relationshipClues.slice(0, wantedRelationships)
  const remaining = [
    ...attributes,
    ...relationshipClues.slice(wantedRelationships),
  ]

  for (const clue of remaining) {
    if (clues.length >= clueCount) break
    clues.push(clue)
  }

  return clues.slice(0, clueCount)
}

function answerFor(
  context: RoundContext,
  subject: EntityRefRow,
  detail: EntityWithAttributes | undefined,
  excludedIds: Set<string>,
): { expected: ExpectedAnswer; options: ReturnType<typeof buildOptions> | null } {
  if (context.definition.answerMode !== AnswerMode.MULTIPLE_CHOICE) {
    return { expected: { kind: 'TEXT', ...acceptedNames(subject, detail) }, options: null }
  }

  const { distractors } = pickDistractors(
    context.slice,
    subject,
    excludedIds,
    Math.max(1, context.definition.optionCount - 1),
    context.random,
  )

  return {
    expected: { kind: 'OPTION', optionId: subject.id },
    options: buildOptions(subject, distractors, context.random),
  }
}

/** `answerFor` needs the slice; carrying it on the context keeps call sites short. */
type RoundContext = GeneratorContext & { slice: GraphSlice }

function buildClueRound(
  context: RoundContext,
  subject: EntityRefRow,
  detail: EntityWithAttributes | undefined,
  ordinal: number,
): GeneratedChallenge | null {
  const { definition, profile, slice } = context

  const edges = distinctRelationshipEdges(
    slice,
    subject.id,
    requiredCodes(context),
    context.random,
    profile.clueCount,
  )
  const relationship = edges.map(relationshipClue)
  const attributes = detail ? shuffle(attributeClues(detail), context.random) : []

  const clues = composeClues(definition.questionStrategy, profile.clueCount, relationship, attributes)
  if (clues.length === 0) return null

  // Distractors must fail the clues, so exclude everyone who shares one.
  const excludedIds = new Set<string>()
  for (const oriented of edges.slice(0, clues.length)) {
    for (const id of entitiesSharingEdge(
      slice,
      oriented.edge.relationshipType.code,
      oriented.other.id,
    )) {
      excludedIds.add(id)
    }
  }

  const { expected, options } = answerFor(context, subject, detail, excludedIds)
  const label = entityTypeLabel(definition.targetEntityType).toLowerCase()
  const attribution = attributionFor(definition, slice, subject.id)

  return {
    ordinal,
    questionStrategy: definition.questionStrategy,
    answerMode: definition.answerMode,
    prompt: {
      kind: 'CLUES',
      question:
        definition.answerMode === AnswerMode.MULTIPLE_CHOICE
          ? `Which ${label} do these clues describe?`
          : `Name the ${label} these clues describe.`,
      clues,
      asOf: toISODate(context.scopeDate) ?? null,
    },
    options,
    solution: {
      answer: expected,
      explanation: `${subject.canonicalName} — ${clues.map((clue) => clue.text).join('; ')}.`,
      revealHref: entityHref(subject),
      revealLabel: `Open ${subject.canonicalName}`,
    },
    subjectEntityId: subject.id,
    masteryScope: attribution.scope,
    masteryTargetId: attribution.targetEntityId,
    masteryDimension: attribution.dimension,
  }
}

function buildChainRound(
  context: RoundContext,
  subject: EntityRefRow,
  detail: EntityWithAttributes | undefined,
  ordinal: number,
): GeneratedChallenge | null {
  const { definition, profile, slice } = context

  for (let attempt = 0; attempt < CHAIN_ATTEMPTS; attempt += 1) {
    const chain = buildChain(slice, subject.id, profile.hopCount, context.random)
    if (!chain) return null

    // The chain has to identify exactly one entity, or the question has more than
    // one defensible answer and is not worth asking.
    const heads = resolveChainHeads(slice, chain.links)
    if (heads.size !== 1 || !heads.has(subject.id)) continue

    const firstLink = chain.links[0]
    const excludedIds = firstLink
      ? entitiesSharingEdge(slice, firstLink.code, firstLink.toEntityId)
      : new Set<string>()

    const { expected, options } = answerFor(context, subject, detail, excludedIds)
    const supporting = detail
      ? shuffle(attributeClues(detail), context.random).slice(0, Math.max(0, profile.clueCount - 1))
      : []
    const label = entityTypeLabel(definition.targetEntityType).toLowerCase()
    const attribution = attributionFor(definition, slice, subject.id)

    return {
      ordinal,
      questionStrategy: definition.questionStrategy,
      answerMode: definition.answerMode,
      prompt: {
        kind: 'CHAIN',
        question:
          definition.answerMode === AnswerMode.MULTIPLE_CHOICE
            ? `Which ${label} sits at the start of this chain?`
            : `Name the ${label} at the start of this chain.`,
        chain: describeChain(chain),
        clues: supporting,
        asOf: toISODate(context.scopeDate) ?? null,
      },
      options,
      solution: {
        answer: expected,
        explanation: chainSentence(chain, subject.canonicalName),
        revealHref: entityHref(subject),
        revealLabel: `Open ${subject.canonicalName}`,
      },
      subjectEntityId: subject.id,
      masteryScope: attribution.scope,
      masteryTargetId: attribution.targetEntityId,
      masteryDimension: attribution.dimension,
    }
  }

  return null
}

export const generateMysteryMember: QuestionGenerator = async (context) => {
  const slice = await loadGraphSlice(context)
  const roundContext: RoundContext = { ...context, slice }

  const shortlist = shuffle(slice.subjects, context.random).slice(
    0,
    context.rounds * SHORTLIST_MULTIPLIER,
  )
  const details = await loadSubjectDetails(
    shortlist.map((subject) => subject.id),
    context.graph.includeUnpublished ?? false,
  )

  const isChainMode = context.profile.hopCount >= CHAIN_MODE_HOPS
  const challenges: GeneratedChallenge[] = []

  for (const subject of shortlist) {
    if (challenges.length >= context.rounds) break

    const detail = details.get(subject.id)
    const built = isChainMode
      ? buildChainRound(roundContext, subject, detail, challenges.length + 1)
      : buildClueRound(roundContext, subject, detail, challenges.length + 1)

    if (built) challenges.push(built)
  }

  if (challenges.length === 0) {
    throw new InsufficientDataError(`Could not build a question for ${context.definition.name}.`, {
      needed: context.rounds,
      found: 0,
      hint: isChainMode
        ? 'Multi-hop rounds need relationship chains that identify exactly one subject. Add more relationships, or play a lower difficulty.'
        : 'Subjects need at least one quizzable relationship or a described attribute.',
    })
  }

  return challenges
}
