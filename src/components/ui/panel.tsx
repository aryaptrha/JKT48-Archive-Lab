import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * The panel: a bordered region of the page.
 *
 * Named `Panel` rather than `Card` on purpose. A card invites the rounded,
 * shadowed, evenly-spaced grid the brief rules out (PRD §22); a panel is a ruled
 * area in a printed reference work, and the difference shows up in how people
 * reach for it.
 */
export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-sm border border-rule bg-surface', className)}
      {...props}
    />
  )
}

/** A panel's header strip: eyebrow, title, and an optional action on the right. */
export function PanelHeader({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-rule px-4 py-3',
        className,
      )}
      {...props}
    />
  )
}

export function PanelTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-base font-semibold', className)} {...props} />
}

export function PanelDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-ink-muted', className)} {...props} />
}

export function PanelBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-4 py-3.5', className)} {...props} />
}

/** Body with no padding, for a ruled list that should meet the panel's edges. */
export function PanelList({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('ruled', className)} {...props} />
}

export function PanelFooter({ className, ...props }: ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3',
        className,
      )}
      {...props}
    />
  )
}
