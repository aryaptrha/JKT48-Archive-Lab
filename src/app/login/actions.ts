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
      logger.warn('auth.signUp rejected', { reason: error.message })
      outcome = back({ next, mode: 'signup', error: error.message, email })
    } else if (data.session) {
      // Email confirmation is switched off on this project, so the account is
      // usable immediately.
      await getCurrentProfile()
      outcome = next
    } else {
      // Confirmation required. Worded so it is also true when the address was
      // already registered, which is the case Supabase deliberately does not
      // distinguish — and neither should we.
      outcome = back({
        next,
        notice: 'Check your email for a confirmation link, then sign in.',
        email,
      })
    }
  } catch (error) {
    logger.error('auth.signUp failed', error)
    outcome = back({
      next,
      mode: 'signup',
      error: 'The account could not be created. Try again in a moment.',
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
