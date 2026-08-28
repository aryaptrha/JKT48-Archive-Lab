'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { PageShell, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'

/**
 * The error boundary.
 *
 * A Client Component by requirement — `reset` is a callback, and a boundary has to
 * be able to re-render its subtree. It is deliberately the plainest file in the
 * project: an error page that itself depends on data, fonts loading or a context
 * provider is an error page that fails when it is needed.
 *
 * What it does not do is print `error.message`. In production Next.js replaces the
 * message with a generic string anyway, and where it does not, a message can carry
 * a query fragment, a column name or a connection string. The digest is shown
 * instead: it is the value that lets an operator find the real stack in the server
 * logs, and it discloses nothing on its own (PRD §35).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Reported from the browser because this boundary catches client-side
    // failures too, which never reach the server logger.
    console.error('Unhandled error in the archive UI', error)
  }, [error])

  return (
    <PageShell className="max-w-[46rem] space-y-8">
      <SectionHeading
        as="h1"
        eyebrow="500 · something broke"
        title="The archive could not render this page"
        lead="The failure is on our side, not in what you asked for. Nothing was changed and nothing was recorded against your account."
      />

      <div className="space-y-3 border-y border-rule py-6 text-sm leading-relaxed text-ink-muted">
        <p>
          Trying again is worth one attempt: a transient database timeout looks exactly like this and
          usually does not repeat.
        </p>
        {error.digest ? (
          <p>
            <span className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
              Reference
            </span>{' '}
            <code className="font-mono text-xs text-ink">{error.digest}</code> — quote this if you
            report it. It is the key to the full stack trace in the server log; the trace itself stays
            on the server.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="accent" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/explore">Back to the archive</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">Front page</Link>
        </Button>
      </div>
    </PageShell>
  )
}
