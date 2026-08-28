import { normalizeAnswer, shuffle, unique } from '@/lib/utils'

import type { EntityRefRow, EntityWithAttributes } from '../../repositories/entity-repository'

import type { GraphSlice } from './pool'
import type { ChoiceOption } from './types'

/**
 * Answer shaping: what counts as the right text, and what the wrong options are.
 */

/**
 * Every spelling of an entity that should be accepted in a text round.
 *
 * Free-text answers are matched on the normalised form (case, accents and
 * punctuation removed) against the canonical name, the stored aliases and the
 * member's own name fields. A player who types "Shanju" for a member whose
 * nickname is recorded should not be told they are wrong — and if they are, the
 * fix is to add the alias to the archive, which is the behaviour we want.
 */
export function acceptedNames(
  subject: EntityRefRow,
  detail?: EntityWithAttributes | undefined,
): { accepted: string[]; display: string } {
  const raw: (string | null | undefined)[] = [subject.canonicalName, ...(detail?.aliases ?? [])]

  const member = detail?.member
  if (member) raw.push(member.stageName, member.fullName, member.nickname)
  if (detail?.song) raw.push(detail.song.title, detail.song.originalTitle)
  if (detail?.team) raw.push(detail.team.code)
  if (detail?.album) raw.push(detail.album.title)
  if (detail?.mediaItem) raw.push(detail.mediaItem.title)
  if (detail?.organization) raw.push(detail.organization.name)

  const accepted = unique(
    raw
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(normalizeAnswer)
      .filter((value) => value.length > 0),
  )

  return { accepted, display: subject.canonicalName }
}

export function toChoiceOption(entity: EntityRefRow): ChoiceOption {
  return { id: entity.id, label: entity.canonicalName, detail: entity.summary }
}

/**
 * Distractors that do not satisfy the clues.
 *
 * `excludedIds` holds every entity that shares a clue-defining edge with the
 * subject. Drawing options from outside that set is what keeps a multiple-choice
 * round from having two defensible answers.
 *
 * If the archive is too thin to supply clean distractors, the filter is relaxed
 * and the shortfall reported — a slightly soft round beats refusing to play, and
 * the data-health report is where the underlying gap gets fixed.
 */
export function pickDistractors(
  slice: GraphSlice,
  subject: EntityRefRow,
  excludedIds: ReadonlySet<string>,
  count: number,
  random: () => number,
): { distractors: EntityRefRow[]; wasRelaxed: boolean } {
  const clean = slice.subjects.filter(
    (candidate) => candidate.id !== subject.id && !excludedIds.has(candidate.id),
  )

  if (clean.length >= count) {
    return { distractors: shuffle(clean, random).slice(0, count), wasRelaxed: false }
  }

  const fallback = slice.subjects.filter((candidate) => candidate.id !== subject.id)
  const padding = shuffle(
    fallback.filter((candidate) => !clean.some((entity) => entity.id === candidate.id)),
    random,
  )

  return {
    distractors: [...clean, ...padding].slice(0, count),
    wasRelaxed: true,
  }
}

/** Subject plus distractors, shuffled by the session seed. */
export function buildOptions(
  subject: EntityRefRow,
  distractors: readonly EntityRefRow[],
  random: () => number,
): ChoiceOption[] {
  return shuffle([subject, ...distractors], random).map(toChoiceOption)
}
