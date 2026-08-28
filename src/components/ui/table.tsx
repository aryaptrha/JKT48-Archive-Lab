import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Data tables, for the admin lists.
 *
 * Horizontal rules only — no vertical grid, no zebra striping. A reference-work
 * table separates rows and lets alignment separate columns, which is why the
 * numeric cell below sets tabular figures rather than relying on the font.
 */

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function TableHead({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('border-b border-rule-strong', className)} {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr]:border-b [&_tr]:border-rule', className)} {...props} />
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn('transition-colors duration-(--duration-fast) hover:bg-ground-sunk', className)}
      {...props}
    />
  )
}

export function TableHeader({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'whitespace-nowrap px-3 py-2 text-left font-mono text-catalog font-normal uppercase tracking-[0.09em] text-ink-muted',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />
}

/** Right-aligned tabular figures, so a column of counts can be scanned. */
export function TableNumber({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      className={cn('px-3 py-2.5 text-right font-mono text-xs tabular-nums text-ink', className)}
      {...props}
    />
  )
}
