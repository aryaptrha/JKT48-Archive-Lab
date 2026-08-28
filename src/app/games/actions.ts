'use server'

import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/lib/auth/session'
import { toISODate } from '@/lib/date'
import { logger } from '@/lib/logger'
import { InsufficientDataError, startSession } from '@/server/services/game-engine'

/**
 * Starting a session (PRD §6).
 *
 * A Server Action rather than a client fetch, for three reasons that all point
 * the same way: the definition id is validated against the database before
 * anything is created, the player id comes from the resolved auth session
 * instead of the form, and the whole thing works with JavaScript disabled
 * because the trigger is a plain submit button.
 *
 * The form may name a definition and a scope. It may not name a user — that is
 * read here, and a form field claiming otherwise is ignored (PRD §35).
 *
 * Every failure path ends in a redirect back to the page the player came from,
 * carrying the reason in the query string. An insufficient-data failure is not
 * an error page: it is a curation gap, and the games page says so with the
 * numbers attached (PRD §16).
 */

function field(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Where to send the player, computed entirely inside the try/catch. */
type Outcome = { href: string }

async function begin(formData: FormData): Promise<Outcome> {
  const definitionId = field(formData, 'definitionId')
  const returnTo = field(formData, 'returnTo') ?? '/games'

  if (!definitionId) {
    return { href: `${returnTo}?error=${encodeURIComponent('Choose a difficulty to begin.')}` }
  }

  // Anonymous play is supported: a session works without an account, mastery
  // does not (PRD §8). A missing profile is a normal case, not an error.
  const profile = await getCurrentProfile()

  try {
    const started = await startSession({
      userId: profile?.id ?? null,
      definitionId,
      scopeEntityId: field(formData, 'scopeEntityId') ?? null,
      scopeDate: field(formData, 'scopeDate') ?? null,
    })

    return { href: `/games/play/${started.session.id}` }
  } catch (error) {
    if (error instanceof InsufficientDataError) {
      const params = new URLSearchParams({
        thin: error.message,
        needed: String(error.detail.needed),
        found: String(error.detail.found),
        hint: error.detail.hint,
      })
      return { href: `${returnTo}?${params.toString()}` }
    }

    logger.error('games.startGameAction failed', error, { definitionId })
    const message =
      error instanceof Error ? error.message : 'The session could not be started.'
    return { href: `${returnTo}?error=${encodeURIComponent(message)}` }
  }
}

export async function startGameAction(formData: FormData): Promise<void> {
  // `redirect` throws to unwind the request, so it is called outside the
  // try/catch above rather than being caught by it.
  const outcome = await begin(formData)
  redirect(outcome.href)
}

/**
 * Start a game scoped to a date.
 *
 * The date arrives from `<input type="date">` as `YYYY-MM-DD`; it is normalised
 * through the same helper the rest of the archive uses so a malformed value is
 * dropped rather than passed to the temporal predicate (PRD §11).
 */
export async function startDatedGameAction(formData: FormData): Promise<void> {
  const normalised = toISODate(field(formData, 'scopeDate'))

  const rebuilt = new FormData()
  for (const [key, value] of formData.entries()) {
    if (key === 'scopeDate') continue
    rebuilt.append(key, value)
  }
  if (normalised) rebuilt.set('scopeDate', normalised)

  const outcome = await begin(rebuilt)
  redirect(outcome.href)
}
