'use server'

import { redirect } from 'next/navigation'

import { AnswerMode } from '@/generated/prisma/enums'
import { getCurrentProfile } from '@/lib/auth/session'
import { logger } from '@/lib/logger'
import {
  abandonSession,
  getSessionState,
  submitAnswer,
  type PlayableChallenge,
  type SubmittedAnswer,
} from '@/server/services/game-engine'

/**
 * Answering a round (PRD §7, §35).
 *
 * The rule that shapes this file: **the form describes an answer, never a
 * question.** Which round is live, what mode it is answered in and which slots
 * exist are all re-read from the database inside the action. The submission is
 * only allowed to fill those slots in.
 *
 * That is what makes a hand-crafted POST harmless. It cannot name a different
 * challenge (the id is checked against the session's own next unanswered round),
 * cannot switch answer modes (the mode comes from the stored challenge), cannot
 * invent slots (unknown keys are dropped), and cannot answer someone else's
 * session (ownership is checked against the resolved auth session).
 *
 * The reveal is a URL — `?reveal=<challengeId>` — rather than component state, so
 * the whole play loop works without JavaScript and a reload never loses the
 * explanation the player was reading.
 */

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Build a `SubmittedAnswer` from the form, in the shape the *stored* challenge
 * demands.
 *
 * Slot keys are enumerated from the prompt rather than scraped from the form, so
 * an extra `field.whatever` in a crafted POST is silently ignored instead of
 * reaching the evaluator.
 */
function readAnswer(challenge: PlayableChallenge, formData: FormData): SubmittedAnswer {
  switch (challenge.answerMode) {
    case AnswerMode.MULTIPLE_CHOICE:
      return { kind: 'OPTION', optionId: text(formData, 'option') }

    case AnswerMode.TEXT_INPUT:
      return { kind: 'TEXT', text: text(formData, 'text') }

    case AnswerMode.FORM_RECONSTRUCTION: {
      const values: Record<string, string> = {}
      if (challenge.prompt.kind === 'PROFILE') {
        for (const field of challenge.prompt.fields) {
          if (!field.isRedacted) continue
          values[field.key] = text(formData, `field.${field.key}`)
        }
      }
      return { kind: 'FIELDS', values }
    }

    case AnswerMode.GRAPH_BUILD: {
      const nodes: Record<string, string> = {}
      const edges: Record<string, string> = {}
      if (challenge.prompt.kind === 'GRAPH') {
        for (const node of challenge.prompt.nodes) {
          if (!node.isUnknown) continue
          nodes[node.id] = text(formData, `node.${node.id}`)
        }
        for (const edge of challenge.prompt.edges) {
          if (!edge.isMissing) continue
          edges[edge.id] = text(formData, `edge.${edge.id}`)
        }
      }
      return { kind: 'GRAPH', nodes, edges }
    }
  }
}

/**
 * Who may act on this session.
 *
 * An anonymous session (`userId === null`) is playable by whoever holds the link,
 * which is the documented V1 behaviour. An owned session is answerable by its
 * owner alone — otherwise a guessed id would write into a stranger's mastery
 * record.
 */
async function assertMayPlay(ownerId: string | null): Promise<void> {
  if (ownerId === null) return
  const profile = await getCurrentProfile()
  if (profile?.id === ownerId) return
  redirect('/forbidden')
}

export async function answerRoundAction(formData: FormData): Promise<void> {
  const sessionId = text(formData, 'sessionId')
  const challengeId = text(formData, 'challengeId')
  const base = `/games/play/${sessionId}`

  const state = await getSessionState(sessionId)
  if (!state) redirect('/games?error=' + encodeURIComponent('That session no longer exists.'))

  await assertMayPlay(state.session.userId)

  // A stale tab, a double submit, or a crafted id: all land here, and all are
  // answered by sending the player to the round the session is actually on.
  if (!state.challenge || state.challenge.id !== challengeId) {
    redirect(base)
  }

  const answer = readAnswer(state.challenge, formData)

  let outcome: string
  try {
    const submitted = await submitAnswer({
      sessionId,
      challengeId: state.challenge.id,
      answer,
      // Never timed. A duration reported by the client is unverifiable, and a
      // clock must not touch a result here: difficulty is how much thinking a
      // question needs, not how fast it is answered (PRD §6.3, §P4). Recording
      // it honestly would mean a `servedAt` stamp written when the round is
      // first read, not a hidden field the browser fills in.
      elapsedMs: null,
    })
    outcome = `${base}?reveal=${submitted.result.challengeId}`
  } catch (error) {
    logger.error('games.answerRoundAction failed', error, { sessionId, challengeId })
    const message = error instanceof Error ? error.message : 'The answer could not be recorded.'
    outcome = `${base}?error=${encodeURIComponent(message)}`
  }

  redirect(outcome)
}

/**
 * Give up on a session.
 *
 * The session is marked ABANDONED rather than deleted: an abandoned attempt is
 * part of a player's history, and the archive does not quietly rewrite history
 * (PRD §8).
 */
export async function abandonSessionAction(formData: FormData): Promise<void> {
  const sessionId = text(formData, 'sessionId')

  const state = await getSessionState(sessionId)
  if (!state) redirect('/games')

  await assertMayPlay(state.session.userId)
  await abandonSession(sessionId)

  redirect(`/games/play/${sessionId}`)
}
