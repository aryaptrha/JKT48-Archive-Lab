import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A section heading: eyebrow, title, optional lead, optional action, then a rule.
 *
 * The rule under the heading is the archive's main structural device. It does the
 * work a card border would do in a dashboard layout, without boxing the content
 * in — which is what keeps a long page readable as a document rather than as a
 * grid of widgets.
 */
export type SectionHeadingProps = {
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  action?: ReactNode
  className?: string
  /** Heading level, so a page keeps one h1 and sections nest correctly. */
  as?: 'h1' | 'h2' | 'h3'
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  action,
  className,
  as = 'h2',
}: SectionHeadingProps) {
  const Heading = as
  const size =
    as === 'h1'
      ? 'text-3xl sm:text-4xl'
      : as === 'h2'
        ? 'text-xl sm:text-2xl'
        : 'text-lg'

  return (
    <div className={cn('border-b border-rule pb-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 space-y-1.5">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <Heading className={cn('font-semibold', size)}>{title}</Heading>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {lead ? (
        <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{lead}</p>
      ) : null}
    </div>
  )
}

/** Standard page shell: one column, generous margins, capped measure. */
export function PageShell({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[76rem] px-4 py-8 sm:px-6 sm:py-12 lg:px-8', className)}
      {...props}
    />
  )
}

export function Section({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('space-y-5', className)} {...props} />
}

/** "See all →" link, used in the corner of a section heading. */
export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted transition-colors hover:text-accent"
    >
      {children}
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  )
}
