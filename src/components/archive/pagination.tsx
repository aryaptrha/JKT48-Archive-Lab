import Link from 'next/link'

import { cn } from '@/lib/utils'
import type { Paginated } from '@/types/graph'

/**
 * Pagination, as links rather than as buttons.
 *
 * Every browse page keeps its state in the URL, so a page of the archive is
 * addressable, shareable and works with the back button. That rules out a client
 * component holding `page` in state — and it is why this takes the current search
 * params and rebuilds them rather than owning the query string itself.
 */
export function Pagination({
  page,
  params,
  basePath,
  className,
}: {
  page: Pick<Paginated<unknown>, 'page' | 'pageCount' | 'total' | 'pageSize'>
  /** The current query string, minus `page` — copied so filters survive. */
  params: URLSearchParams
  basePath: string
  className?: string
}) {
  if (page.pageCount <= 1) return null

  const href = (target: number) => {
    const next = new URLSearchParams(params)
    if (target <= 1) next.delete('page')
    else next.set('page', String(target))
    const query = next.toString()
    return query ? `${basePath}?${query}` : basePath
  }

  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.total, page.page * page.pageSize)

  const linkClass =
    'rounded-sm border border-rule-strong px-3 py-1.5 font-mono text-catalog uppercase tracking-[0.09em] transition-colors hover:border-ink-faint hover:bg-ground-sunk'

  return (
    <nav
      className={cn('flex flex-wrap items-center justify-between gap-3 pt-2', className)}
      aria-label="Pagination"
    >
      <p className="font-mono text-catalog tabular-nums text-ink-faint">
        {first}–{last} of {page.total}
      </p>
      <div className="flex items-center gap-2">
        {page.page > 1 ? (
          <Link href={href(page.page - 1)} className={linkClass} rel="prev">
            ← Previous
          </Link>
        ) : (
          <span className={cn(linkClass, 'cursor-default text-ink-faint opacity-50')}>
            ← Previous
          </span>
        )}
        <span className="font-mono text-catalog tabular-nums text-ink-muted">
          {page.page} / {page.pageCount}
        </span>
        {page.page < page.pageCount ? (
          <Link href={href(page.page + 1)} className={linkClass} rel="next">
            Next →
          </Link>
        ) : (
          <span className={cn(linkClass, 'cursor-default text-ink-faint opacity-50')}>Next →</span>
        )}
      </div>
    </nav>
  )
}
