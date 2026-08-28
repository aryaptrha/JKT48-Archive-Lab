import * as LabelPrimitive from '@radix-ui/react-label'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Form controls.
 *
 * Every input is bordered rather than filled, and errors are stated in words
 * under the field instead of only turning the border red — a colour change alone
 * is not an error message, and it is invisible to a reader who cannot see it.
 */

const controlBase = cn(
  'w-full rounded-sm border border-rule-strong bg-surface-raised px-2.5 text-sm text-ink',
  'placeholder:text-ink-faint',
  'transition-colors duration-(--duration-fast)',
  'hover:border-ink-faint',
  'focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent',
  'disabled:cursor-not-allowed disabled:bg-ground-sunk disabled:text-ink-faint',
  'aria-[invalid=true]:border-accent',
)

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(controlBase, 'h-9', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(controlBase, 'min-h-24 resize-y py-2 leading-relaxed', className)}
      {...props}
    />
  )
}

/**
 * Native `<select>` rather than the Radix one for forms.
 *
 * A plain select posts with the form and works before hydration, which matters
 * for an admin CMS built on Server Actions. `@radix-ui/react-select` is reserved
 * for the places that need a searchable or richly-rendered menu.
 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        controlBase,
        'h-9 appearance-none bg-[length:1rem] bg-[right_0.5rem_center] bg-no-repeat pr-8',
        // Chevron drawn as a data URI so the control needs no wrapper element and
        // no JavaScript. `currentColor` is not available in a background image,
        // so this is the one place a literal colour is acceptable.
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888078%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Checkbox({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 shrink-0 rounded-xs border border-rule-strong accent-accent',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
      {...props}
    />
  )
}

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted',
        className,
      )}
      {...props}
    />
  )
}

export type FieldProps = {
  /** Must match the control's `id`, so the label actually points at it. */
  htmlFor?: string
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  className?: string
  children: ReactNode
}

/**
 * Label + control + hint + error, in the order a screen reader should meet them.
 *
 * The hint is referenced by `aria-describedby` at the call site when it matters;
 * the error is rendered as text so "what went wrong" survives a monochrome
 * display.
 */
export function Field({
  htmlFor,
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-accent">*</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-ink-faint">{hint}</p> : null}
      {error ? (
        <p className="text-xs font-medium text-accent" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** A checkbox with its label on the right, which is the only place that reads well. */
export function CheckboxField({
  id,
  label,
  hint,
  ...props
}: ComponentProps<'input'> & { id: string; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox id={id} className="mt-0.5" {...props} />
      <div className="space-y-0.5">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {hint ? <p className="text-xs text-ink-faint">{hint}</p> : null}
      </div>
    </div>
  )
}
