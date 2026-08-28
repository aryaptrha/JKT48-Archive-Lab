import { normalizeAnswer } from '@/lib/utils'

import type {
  AnswerPart,
  AnswerVerdict,
  ChoiceOption,
  ExpectedAnswer,
  SubmittedAnswer,
} from './types'

/**
 * Answer evaluation (PRD §7).
 *
 * V1 is binary. A round is correct or it is not — there is no confidence rating
 * and no partial verdict. `parts` records which pieces of a multi-part answer
 * were right, which is what scoring pays on, but the verdict itself stays a
 * boolean: `isCorrect` is true only when every part is.
 *
 * Text matching is normalised (case, accents, punctuation, spacing) against a
 * list of accepted spellings built at generation time. Evaluation never invents
 * new tolerance of its own — if a legitimate answer is rejected, the fix is an
 * alias in the archive, where it also improves search.
 *
 * A submitted answer whose shape does not match the expected one is treated as
 * incorrect rather than as an error. Shape validation belongs at the API
 * boundary; by the time an answer reaches here, the worst it can be is wrong.
 */

function matches(accepted: readonly string[], submitted: string | null | undefined): boolean {
  if (!submitted) return false
  const normalized = normalizeAnswer(submitted)
  if (normalized.length === 0) return false
  return accepted.includes(normalized)
}

function verdictOf(parts: AnswerPart[]): AnswerVerdict {
  return {
    isCorrect: parts.length > 0 && parts.every((part) => part.isCorrect),
    parts,
  }
}

export function evaluateAnswer(
  expected: ExpectedAnswer,
  submitted: SubmittedAnswer,
): AnswerVerdict {
  switch (expected.kind) {
    case 'OPTION': {
      const chosen = submitted.kind === 'OPTION' ? submitted.optionId : null
      return verdictOf([
        {
          key: 'answer',
          label: 'Answer',
          kind: 'ENTITY',
          isCorrect: chosen === expected.optionId,
          expected: expected.optionId,
          submitted: chosen,
        },
      ])
    }

    case 'TEXT': {
      const text = submitted.kind === 'TEXT' ? submitted.text : null
      return verdictOf([
        {
          key: 'answer',
          label: 'Answer',
          kind: 'ENTITY',
          isCorrect: matches(expected.accepted, text),
          expected: expected.display,
          submitted: text,
        },
      ])
    }

    case 'FIELDS': {
      const values = submitted.kind === 'FIELDS' ? submitted.values : {}
      return verdictOf(
        expected.fields.map((field) => {
          const value = values[field.key] ?? null
          return {
            key: field.key,
            label: field.label,
            kind: 'FIELD',
            isCorrect: matches(field.accepted, value),
            expected: field.display,
            submitted: value,
          }
        }),
      )
    }

    case 'GRAPH': {
      const nodes = submitted.kind === 'GRAPH' ? submitted.nodes : {}
      const edges = submitted.kind === 'GRAPH' ? submitted.edges : {}

      const nodeParts: AnswerPart[] = expected.nodes.map((node) => {
        const value = nodes[node.slotId] ?? null
        // The slot id *is* the correct entity id, so a picked option matches by
        // identity; typed answers fall back to the accepted spellings.
        const isCorrect = value === node.slotId || matches(node.accepted, value)
        return {
          key: node.slotId,
          label: 'Entity',
          kind: 'ENTITY',
          isCorrect,
          expected: node.label,
          submitted: value,
        }
      })

      const edgeParts: AnswerPart[] = expected.edges.map((edge) => {
        const value = edges[edge.slotId] ?? null
        return {
          key: edge.slotId,
          label: 'Relationship',
          kind: 'RELATIONSHIP',
          isCorrect: value === edge.code,
          expected: edge.label,
          submitted: value,
        }
      })

      return verdictOf([...nodeParts, ...edgeParts])
    }
  }
}

/** How the correct answer reads in the reveal panel. */
export function describeExpected(
  expected: ExpectedAnswer,
  options?: readonly ChoiceOption[] | null,
): string {
  switch (expected.kind) {
    case 'OPTION':
      // Ids are meaningless to a reader; recover the label from the round's options.
      return options?.find((option) => option.id === expected.optionId)?.label ?? expected.optionId
    case 'TEXT':
      return expected.display
    case 'FIELDS':
      return expected.fields.map((field) => `${field.label}: ${field.display}`).join('; ')
    case 'GRAPH':
      return [
        ...expected.nodes.map((node) => node.label),
        ...expected.edges.map((edge) => edge.label),
      ].join('; ')
  }
}
