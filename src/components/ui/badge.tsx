import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Small status markers.
 *
 * Monospaced and uppercase so they read as metadata rather than as prose, and
 * deliberately not pill-shaped. Tones are semantic — a caller picks `warning`
 * because something is a warning, never because ochre looked better here.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 font-mono text-catalog uppercase tracking-[0.08em] [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-rule bg-ground-sunk text-ink-muted',
        ink: 'border-ink-strong bg-ink-strong text-ground',
        accent: 'border-accent/35 bg-accent-soft text-accent',
        ochre: 'border-ochre/35 bg-ochre-soft text-ochre',
        sage: 'border-sage/35 bg-sage-soft text-sage',
        indigo: 'border-indigo/35 bg-indigo-soft text-indigo',
        /** Unfilled, for a marker that must not compete with a title. */
        quiet: 'border-transparent bg-transparent px-0 text-ink-faint',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export { badgeVariants }
