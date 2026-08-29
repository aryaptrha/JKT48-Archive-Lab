import { PageShell } from '@/components/archive/section'

/**
 * The record page's loading state, for client-side navigations.
 *
 * The record page's own frame — portrait, name, byline, attributes — is one row
 * read and arrives with the document, so this is only ever seen between clicking a
 * card and that read returning. It mirrors the header and the two-column body so
 * the layout does not move when the record lands.
 *
 * Without this file the browse page's `loading.tsx` one level up would stand in,
 * and a grid of card skeletons is the wrong promise for a record.
 */
export default function Loading() {
  return (
    <PageShell className="space-y-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading record</span>

      {/* identity */}
      <div className="space-y-5">
        <div className="h-3 w-40 animate-pulse rounded-xs bg-ground-sunk" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <div className="size-40 shrink-0 animate-pulse rounded-sm border border-rule bg-ground-sunk" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="h-4 w-28 animate-pulse rounded-xs bg-ground-sunk" />
            <div className="h-10 w-2/3 max-w-md animate-pulse rounded-xs bg-ground-sunk" />
            <div className="h-2.5 w-52 animate-pulse rounded-xs bg-ground-sunk" />
            <div className="h-3 w-full max-w-2xl animate-pulse rounded-xs bg-ground-sunk" />
            <div className="h-3 w-4/5 max-w-xl animate-pulse rounded-xs bg-ground-sunk" />
          </div>
        </div>
      </div>

      {/* body */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <div className="h-2.5 w-28 animate-pulse rounded-xs bg-ground-sunk" />
          <div className="ruled">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="flex items-center gap-6 py-3">
                <div className="h-3 w-28 shrink-0 animate-pulse rounded-xs bg-ground-sunk" />
                <div className="h-3 min-w-0 flex-1 animate-pulse rounded-xs bg-ground-sunk" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="h-56 animate-pulse rounded-sm border border-rule bg-ground-sunk" />
          <div className="h-40 animate-pulse rounded-sm border border-rule bg-ground-sunk" />
        </div>
      </div>
    </PageShell>
  )
}
