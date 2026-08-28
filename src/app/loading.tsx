import { PageShell } from '@/components/archive/section'

/**
 * The route-level loading state.
 *
 * Skeleton rules rather than a spinner. A spinner says "something is happening";
 * these say "a heading, then a row of figures, then a ruled list", which is what
 * every page in this archive actually looks like — so the layout does not jump
 * when the content lands.
 *
 * `animate-pulse` is the only motion, and `globals.css` disables it under
 * `prefers-reduced-motion` along with everything else (PRD §22).
 */
export default function Loading() {
  return (
    <PageShell className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      {/* heading */}
      <div className="space-y-3 border-b border-rule pb-4">
        <div className="h-2.5 w-24 animate-pulse rounded-xs bg-ground-sunk" />
        <div className="h-8 w-2/3 max-w-md animate-pulse rounded-xs bg-ground-sunk" />
        <div className="h-3 w-full max-w-2xl animate-pulse rounded-xs bg-ground-sunk" />
      </div>

      {/* figures */}
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="space-y-2">
            <div className="h-2.5 w-16 animate-pulse rounded-xs bg-ground-sunk" />
            <div className="h-7 w-12 animate-pulse rounded-xs bg-ground-sunk" />
          </div>
        ))}
      </div>

      {/* ruled list */}
      <div className="ruled">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="flex items-center gap-4 py-4">
            <div className="size-10 shrink-0 animate-pulse rounded-xs bg-ground-sunk" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-1/3 animate-pulse rounded-xs bg-ground-sunk" />
              <div className="h-2.5 w-1/2 animate-pulse rounded-xs bg-ground-sunk" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  )
}
