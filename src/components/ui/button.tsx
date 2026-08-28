import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Buttons.
 *
 * Square-ish corners, hairline borders, no gradients — the archive's controls
 * should look stamped rather than inflated (PRD §22). The variants encode
 * intent, not appearance: `accent` is for the one primary action on a screen and
 * `destructive` for irreversible ones, so a page with three accent buttons is a
 * design bug that reviews itself.
 */
const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-sm',
    'font-sans text-sm font-medium',
    'transition-[background-color,border-color,color,box-shadow] duration-(--duration-fast) ease-(--ease-editorial)',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        /** Default: ink on paper, the workhorse. */
        default:
          'border border-ink-strong bg-ink-strong text-ground hover:bg-ink active:bg-ink-strong',
        accent:
          'border border-accent bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent',
        outline:
          'border border-rule-strong bg-surface text-ink hover:bg-ground-sunk hover:border-ink-faint',
        ghost: 'border border-transparent text-ink-muted hover:bg-ground-sunk hover:text-ink',
        /** For a link that must sit in a row of buttons without shouting. */
        link: 'border border-transparent text-accent underline decoration-1 underline-offset-2 hover:text-accent-hover',
        destructive:
          'border border-accent bg-transparent text-accent hover:bg-accent hover:text-accent-ink',
      },
      size: {
        sm: 'h-8 px-2.5 text-xs',
        default: 'h-9 px-3.5',
        lg: 'h-11 px-5 text-base',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the single child element — for `<Link>` styled as a button. */
    asChild?: boolean
  }

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
}

export { buttonVariants }
