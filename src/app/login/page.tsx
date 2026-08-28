import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { PageShell, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { getCurrentProfile } from '@/lib/auth/session'
import { isSupabaseConfigured } from '@/lib/env'

import { signInAction, signUpAction } from './actions'

export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Sign in to keep your mastery, progress and game history. The archive itself is readable without an account.',
  robots: { index: false, follow: true },
}

/**
 * `/login` (PRD §19, §20).
 *
 * Both forms are on the page at once. There is no tab widget and no "switch to
 * sign up" toggle, because either would be a client component standing between a
 * person and a password field for no reason — and because the honest answer to
 * "which one do I want?" is visible when both are visible.
 *
 * Everything the page needs to redraw itself after a failed attempt travels in
 * the query string: `?error=`, `?notice=`, `?email=`, `?mode=` and `?next=`. That
 * keeps the route a Server Component with no state to lose on reload, and it is
 * why the actions in `./actions.ts` redirect rather than return.
 *
 * An account is optional throughout. §19 lets anyone browse, learn and play
 * anonymously; what an account adds is that mastery survives closing the tab. The
 * copy says exactly that rather than implying a wall.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const one = (key: string) => {
    const value = query[key]
    return Array.isArray(value) ? value[0] : value
  }

  const next = one('next') ?? '/me'
  const error = one('error')
  const notice = one('notice')
  const email = one('email') ?? ''
  const mode = one('mode') === 'signup' ? 'signup' : 'signin'

  // Already signed in: the form has nothing to offer. Sent onward rather than
  // shown a "you are already signed in" page nobody wants to read.
  const profile = await getCurrentProfile()
  if (profile) {
    redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/me')
  }

  const configured = isSupabaseConfigured()

  return (
    <PageShell className="max-w-[60rem] space-y-8">
      <SectionHeading
        as="h1"
        eyebrow="Account"
        title="Sign in"
        lead="An account is only needed for the parts of the archive that are about you: mastery per generation, your game history, and the curator tools. Reading and playing need nothing."
      />

      {next !== '/me' ? (
        <p className="rounded-sm border border-indigo/30 bg-indigo-soft px-4 py-3 text-sm text-ink">
          <span className="font-mono text-catalog uppercase tracking-[0.08em] text-indigo">
            Continuing to
          </span>{' '}
          <span className="font-mono">{next}</span> once you are signed in.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-sm border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-ink"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          role="status"
          className="rounded-sm border border-sage/40 bg-sage-soft px-4 py-3 text-sm text-ink"
        >
          {notice}
        </p>
      ) : null}

      {!configured ? (
        <UnconfiguredNotice />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ---------------------------------------------------------- sign in */}
          <Panel className={mode === 'signin' ? 'border-rule-strong' : undefined}>
            <PanelHeader>
              <PanelTitle>Sign in</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <form action={signInAction} className="space-y-4">
                <input type="hidden" name="next" value={next} />

                <Field htmlFor="signin-email" label="Email" required>
                  <Input
                    id="signin-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    defaultValue={mode === 'signin' ? email : ''}
                    required
                  />
                </Field>

                <Field htmlFor="signin-password" label="Password" required>
                  <Input
                    id="signin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </Field>

                <Button type="submit" variant="accent" className="w-full">
                  Sign in
                </Button>
              </form>
            </PanelBody>
          </Panel>

          {/* ---------------------------------------------------------- sign up */}
          <Panel className={mode === 'signup' ? 'border-rule-strong' : undefined}>
            <PanelHeader>
              <PanelTitle>Create an account</PanelTitle>
            </PanelHeader>
            <PanelBody>
              <form action={signUpAction} className="space-y-4">
                <input type="hidden" name="next" value={next} />

                <Field
                  htmlFor="signup-name"
                  label="Display name"
                  hint="Optional. Shown to you, nowhere else in V1."
                >
                  <Input
                    id="signup-name"
                    name="displayName"
                    autoComplete="nickname"
                    maxLength={80}
                  />
                </Field>

                <Field htmlFor="signup-email" label="Email" required>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    defaultValue={mode === 'signup' ? email : ''}
                    required
                  />
                </Field>

                <Field
                  htmlFor="signup-password"
                  label="Password"
                  hint="At least 8 characters."
                  required
                >
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </Field>

                <Button type="submit" variant="outline" className="w-full">
                  Create account
                </Button>
              </form>
            </PanelBody>
          </Panel>
        </div>
      )}

      {/* ----------------------------------------------------------- what for */}
      <section className="grid gap-x-8 gap-y-5 border-t border-rule pt-6 sm:grid-cols-3">
        <Reason
          title="Mastery that persists"
          body="Answered rounds roll up per generation across members, history, teams, songs and relationships. Without an account the roll-up has nowhere to live."
        />
        <Reason
          title="Your game history"
          body="Every session, its rung and its scorecard, kept as a record — including the sessions you abandoned."
        />
        <Reason
          title="Curator tools, by role"
          body="The admin area is granted by the role on your profile, never by which address you signed in with."
        />
      </section>

      <p className="text-sm text-ink-muted">
        Not here for an account?{' '}
        <Link href="/explore" className="text-accent underline underline-offset-2">
          Browse the archive
        </Link>{' '}
        or{' '}
        <Link href="/games" className="text-accent underline underline-offset-2">
          play anonymously
        </Link>
        .
      </p>
    </PageShell>
  )
}

/**
 * Shown when Supabase Auth is not wired up.
 *
 * Deliberately not an error screen. `isSupabaseConfigured()` being false is a
 * supported state — the archive is a public reference work first — so the page
 * explains the situation and points at the two things that still work. The
 * variable names are safe to print; their values are not, and are not.
 */
function UnconfiguredNotice() {
  return (
    <div className="space-y-4 rounded-sm border border-dashed border-rule-strong bg-ground-sunk px-5 py-6">
      <p className="font-display text-lg font-semibold text-ink">Accounts are not enabled here</p>
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
        This deployment has no Supabase Auth credentials, so there is nothing to sign in to. The
        archive is fully readable and every game is playable anonymously — the only thing missing is
        somewhere to keep your mastery between visits.
      </p>
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
        To enable them, set{' '}
        <code className="font-mono text-xs text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
        <code className="font-mono text-xs text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in the
        environment and restart. Copy <code className="font-mono text-xs text-ink">.env.example</code>{' '}
        to <code className="font-mono text-xs text-ink">.env</code> for the full list.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild variant="outline">
          <Link href="/explore">Browse the archive</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/games">Play anonymously</Link>
        </Button>
      </div>
    </div>
  )
}

function Reason({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <p className="text-xs leading-relaxed text-ink-muted">{body}</p>
    </div>
  )
}
