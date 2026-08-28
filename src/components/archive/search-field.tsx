import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/**
 * The search and filter bar.
 *
 * A plain `<form method="get">`, not a client component with debounced state.
 * Submitting navigates, which means the result is a URL: bookmarkable, shareable,
 * survives a refresh, and works before hydration. Search-as-you-type would cost
 * all of that plus a query per keystroke, to save one keypress.
 *
 * `hidden` inputs carry the filters that are not being edited here, so searching
 * inside a filtered view does not silently drop the filter.
 */
export function SearchField({
  action,
  defaultValue,
  placeholder = 'Search the archive',
  label = 'Search',
  hidden,
  children,
  className,
}: {
  action: string
  defaultValue?: string
  placeholder?: string
  label?: string
  hidden?: Record<string, string | undefined>
  /** Extra controls — a sort select, a type filter — rendered beside the input. */
  children?: ReactNode
  className?: string
}) {
  return (
    <form
      action={action}
      method="get"
      className={cn('flex flex-wrap items-end gap-2', className)}
      role="search"
    >
      {Object.entries(hidden ?? {}).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}

      <div className="relative min-w-56 flex-1">
        <label htmlFor="q" className="sr-only">
          {label}
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
        />
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="pl-8"
          autoComplete="off"
        />
      </div>

      {children}

      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  )
}
