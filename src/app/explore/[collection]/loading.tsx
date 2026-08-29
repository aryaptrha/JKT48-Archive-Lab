import { RecordGrid } from '@/components/archive/record'
import { PageShell } from '@/components/archive/section'

/**
 * The browse page's loading state, for client-side navigations.
 *
 * Shaped like the page it precedes — heading, controls, a grid of record cards —
 * so arriving from a rail or a "see all" link paints something structural in the
 * same layout instead of an empty column. On the server render this is skipped
 * entirely: the page's own frame is synchronous and only the grid streams.
 */
export default function Loading() {
  return (
    <PageShell className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      {/* heading */}
      <div className="space-y-3 border-b border-rule pb-4">
        <div className="h-2.5 w-32 animate-pulse rounded-xs bg-ground-sunk" />
        <div className="h-9 w-1/2 max-w-xs animate-pulse rounded-xs bg-ground-sunk" />
        <div className="h-3 w-full max-w-2xl animate-pulse rounded-xs bg-ground-sunk" />
      </div>

      {/* search + sort */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="h-9 min-w-56 flex-1 animate-pulse rounded-sm bg-ground-sunk" />
        <div className="h-9 w-44 animate-pulse rounded-sm bg-ground-sunk" />
        <div className="h-9 w-20 animate-pulse rounded-sm bg-ground-sunk" />
      </div>

      {/* records */}
      <RecordGrid>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <div key={index} className="flex gap-3.5 rounded-sm border border-rule bg-surface p-3.5">
            <div className="size-[72px] shrink-0 animate-pulse rounded-sm bg-ground-sunk" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-2.5 w-20 animate-pulse rounded-xs bg-ground-sunk" />
              <div className="h-4 w-2/3 animate-pulse rounded-xs bg-ground-sunk" />
              <div className="h-2.5 w-1/2 animate-pulse rounded-xs bg-ground-sunk" />
            </div>
          </div>
        ))}
      </RecordGrid>
    </PageShell>
  )
}
