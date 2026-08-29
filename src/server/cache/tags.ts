import { updateTag } from 'next/cache'

/**
 * Cache tags for the public read models (PRD §26, §31).
 *
 * The archive is read far more often than it is curated, so the public view
 * models are cached across requests rather than re-queried per visitor. That is
 * only acceptable if a curator's edit publishes *immediately*, which is what
 * these tags buy: the cached entries carry a tag, an admin mutation drops it, and
 * the next read rebuilds from Postgres.
 *
 * Two tags rather than one per collection. Over-invalidation costs a query;
 * under-invalidation shows a reader a fact that is no longer true, and only one
 * of those is a bug worth avoiding.
 */
export const ARCHIVE_TAGS = {
  /** Entities, relationships and eras — everything the encyclopedia reads. */
  graph: 'archive:graph',
  /** Game definitions and their rungs. */
  games: 'archive:games',
} as const

/**
 * The safety net under the tags.
 *
 * Tags handle every edit made *through* the admin. This window is what covers
 * the rest: a direct SQL fix, a seed re-run, a row changed in Prisma Studio.
 */
export const ARCHIVE_CACHE_SECONDS = 300

/*
 * `updateTag`, not `revalidateTag`.
 *
 * In Next 16 `revalidateTag` takes a `cacheLife` profile as its second argument
 * and schedules expiry against it, which is not what a curator pressing Save
 * needs. `updateTag` expires the tag immediately and carries read-your-own-writes
 * semantics, so the redirect after a mutation lands on the new value rather than
 * on the one the editor just replaced.
 *
 * The tradeoff is that `updateTag` may only be called from inside a Server
 * Action. Every caller of these two helpers is one — the six `admin/**\/actions.ts`
 * files — and a future caller that is not (a route handler, a cron job) needs
 * `revalidateTag(tag, { expire: 0 })` instead.
 */

/** Call after any entity, relationship, source or era mutation. */
export function revalidateArchiveGraph(): void {
  updateTag(ARCHIVE_TAGS.graph)
}

/** Call after any game definition mutation. */
export function revalidateArchiveGames(): void {
  updateTag(ARCHIVE_TAGS.games)
}
