'use server'

import { redirect } from 'next/navigation'

import { getCurrentProfile } from '@/lib/auth/session'
import { isSupabaseConfigured, publicEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Sign in, sign up, sign out (PRD §19, §35).
 *
 * All three run on the server. The browser never holds a Supabase client, never
 * sees a key beyond the anon key it does not need, and never posts credentials
 * anywhere but this application — which is also why the whole flow works with
 * JavaScript switched off.
 *
 * Two rules are load-bearing here:
 *
 *   - **Identity only.** These actions establish *who* someone is. What they may
 *     do is `UserProfile.role`, read by `requireAdmin()` at every protected
 *     boundary. Nothing in this file grants a privilege, and no email address is
 *     ever compared against a constant (§19: admin must never depend on a
 *     hard-coded username).
 *   - **The failure message never distinguishes cases.** A wrong password and an
 *     unknown address produce the same sentence, so the form cannot be used to
 *     enumerate who has an account.
 */

const MIN_PASSWORD_LENGTH = 8

const NOT_CONFIGURED =
  'Accounts are not enabled on this deployment. The archive is fully readable and playable without one.'

/**
 * Only for the case it describes: a confirmation link really was just sent.
 *
 * It used to double as the answer for an address that was already registered,
 * which read as neutral but told that person to wait for mail that was never
 * going to arrive. Wrong instructions are not a safer kind of vagueness.
 */
const CONFIRM_NOTICE = 'Check your email for a confirmation link, then sign in.'

/**
 * A duplicate address. Not phrased as a failure — nothing went wrong, the person
 * already has the account they were trying to make and is two fields away from
 * using it.
 */
const ALREADY_REGISTERED = 'That address already has an account. Sign in with it below.'

const GENERIC_SIGNUP_FAILURE = 'The account could not be created. Try again in a moment.'

/**
 * What the provider said, translated into something worth reading.
 *
 * Supabase's `message` is written for whoever is reading the logs: it names
 * internal services and carries wording no player can act on — a real report from
 * this form read `Invalid path specified in request URL`, which tells the person
 * holding it nothing at all. Worse, on a project that does not require email
 * confirmation the raw message is `User already registered`, and echoing that
 * turns this form into the address-enumeration oracle the rest of this file is
 * careful not to be.
 *
 * So the provider's text is logged, never displayed, and only the codes we have
 * a useful sentence for are distinguished. `code` is the stable identifier;
 * `message` is prose the provider may reword at any time, so it is never matched
 * against.
 */
function signUpFailureMessage(code: string | undefined): string {
  switch (code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      // The common one in practice: the built-in mailer allows only a couple of
      // sends an hour, so a few attempts in a row look like a broken form.
      return 'Too many attempts from this address just now. Wait a few minutes, then try again.'
    case 'email_address_invalid':
      return 'That email address was not accepted. Check it for a typo.'
    case 'weak_password':
      return `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'New accounts are not being created on this deployment right now.'
    case 'validation_failed':
      return 'Enter an email address and a password.'
    default:
      return GENERIC_SIGNUP_FAILURE
  }
}

/** Trimmed text field. Passwords are read separately — trimming one is data loss. */
function field(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function secret(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

/**
 * Where to land after signing in.
 *
 * Only a path inside this application is accepted. `next` arrives from a query
 * string, so an unchecked value would turn the login form into an open redirect:
 * a link to our own domain that lands somewhere else entirely, with the
 * credibility of having just authenticated. A protocol-relative `//evil.example`
 * is rejected for the same reason as `https://evil.example`.
 */
function safeNext(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/me'
  // Bouncing back to the form on success would look like a silent failure.
  if (raw.startsWith('/login')) return '/me'
  return raw
}

/** Back to the form, carrying the state the page needs to redraw itself. */
function back(params: {
  next: string
  mode?: 'signin' | 'signup'
  error?: string
  notice?: string
  email?: string
}): string {
  const query = new URLSearchParams()
  if (params.next !== '/me') query.set('next', params.next)
  if (params.mode) query.set('mode', params.mode)
  if (params.error) query.set('error', params.error)
  if (params.notice) query.set('notice', params.notice)
  // Echoed so a mistyped password does not cost the address as well. Never the
  // password itself: a query string is history, logs and referrers.
  if (params.email) query.set('email', params.email)
  return `/login?${query.toString()}`
}

export async function signInAction(formData: FormData): Promise<void> {
  const next = safeNext(field(formData, 'next'))
  const email = field(formData, 'email')
  const password = secret(formData, 'password')

  if (!isSupabaseConfigured()) {
    redirect(back({ next, error: NOT_CONFIGURED }))
  }
  if (!email || !password) {
    redirect(back({ next, error: 'Enter your email address and password.', email }))
  }

  let outcome: string
  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Logged as a warning with the provider's reason, so an operator can tell a
      // wrong password from a rate limit. The player is told neither.
      logger.warn('auth.signIn rejected', { reason: error.message })
      outcome = back({ next, error: 'That email address and password combination was not accepted.', email })
    } else {
      // First sign-in creates the archive-side profile row. Doing it here means a
      // signed-in user always has one by the time a page renders.
      await getCurrentProfile()
      outcome = next
    }
  } catch (error) {
    logger.error('auth.signIn failed', error)
    outcome = back({ next, error: 'Sign-in could not be completed. Try again in a moment.', email })
  }

  // Outside the try: `redirect` unwinds by throwing, so calling it inside would
  // be caught by our own catch and reported as a sign-in failure.
  redirect(outcome)
}

export async function signUpAction(formData: FormData): Promise<void> {
  const next = safeNext(field(formData, 'next'))
  const email = field(formData, 'email')
  const password = secret(formData, 'password')
  const displayName = field(formData, 'displayName')

  if (!isSupabaseConfigured()) {
    redirect(back({ next, error: NOT_CONFIGURED }))
  }
  if (!email || !password) {
    redirect(back({ next, mode: 'signup', error: 'Enter an email address and a password.', email }))
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    redirect(
      back({
        next,
        mode: 'signup',
        error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
        email,
      }),
    )
  }

  let outcome: string
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Read back by `getCurrentProfile()` when it creates the profile row.
        // A display name is a courtesy, never a credential.
        data: displayName ? { display_name: displayName } : undefined,
        emailRedirectTo: `${publicEnv.siteUrl}/login`,
      },
    })

    if (error) {
      // The provider's own wording stays here, where an operator can read it, and
      // `code`/`status` come with it: the sentence shown to the player is
      // deliberately lossy, so the log has to be the place the real reason lives.
      logger.warn('auth.signUp rejected', {
        reason: error.message,
        code: error.code,
        status: error.status,
      })

      if (error.code === 'user_already_exists' || error.code === 'email_exists') {
        // Supabase only returns this when the project does not require email
        // confirmation — with confirmation on, a duplicate is answered as success
        // precisely so that the two cannot be told apart, and this branch is
        // unreachable.
        //
        // With it off, though, the outcomes are already distinguishable without
        // reading a word: a new address ends up signed in at `next`, an existing
        // one ends up back here. Staying vague therefore withholds nothing the
        // redirect has not given away, and costs the person their next move. So
        // say what happened and point at the form that will work — with `signin`
        // the address is carried into that panel rather than this one.
        outcome = back({ next, mode: 'signin', notice: ALREADY_REGISTERED, email })
      } else {
        outcome = back({
          next,
          mode: 'signup',
          error: signUpFailureMessage(error.code),
          email,
        })
      }
    } else if (data.session) {
      // A session comes back only when the project does not require email
      // confirmation; then the account is usable immediately. With confirmation
      // switched on this branch never runs and the notice below is what happens.
      await getCurrentProfile()
      outcome = next
    } else {
      // No session and no error: confirmation is required. This is also the reply
      // Supabase gives for an address that already exists when confirmation is on
      // — it withholds the difference on purpose, and there is nothing here to
      // recover it from, so one sentence has to serve both.
      outcome = back({ next, notice: CONFIRM_NOTICE, email })
    }
  } catch (error) {
    logger.error('auth.signUp failed', error)
    outcome = back({
      next,
      mode: 'signup',
      error: GENERIC_SIGNUP_FAILURE,
      email,
    })
  }

  redirect(outcome)
}

/**
 * Sign out.
 *
 * Lives here rather than under `/me` because it is part of the same session
 * plumbing, and because `/forbidden` needs it too — someone who reached that page
 * is signed in as the wrong account, and switching is the useful thing to offer.
 */
export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient()
      await supabase.auth.signOut()
    } catch (error) {
      // A failed revocation still clears the cookie on the way out; leaving the
      // user on a broken page would be the worse outcome.
      logger.error('auth.signOut failed', error)
    }
  }

  redirect('/')
}
