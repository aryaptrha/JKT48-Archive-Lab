import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { databasePoolMax, isProduction, requireDatabaseUrl } from '@/lib/env'

/**
 * Prisma client singleton (PRD §26, §31).
 *
 * Serverless constraints:
 *  - A function instance keeps only a small pool, because many instances may run
 *    concurrently against Supabase's PgBouncer, which does the real pooling.
 *  - The app must never assume a long-lived Node process, so the client is
 *    cheap to construct and safe to re-create on cold start.
 *  - In development the instance is cached on `globalThis` so Fast Refresh does
 *    not open a new pool on every edit.
 *
 * Prisma 7 requires an explicit driver adapter; connection URLs no longer live
 * in schema.prisma.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: requireDatabaseUrl(),
    /*
     * A few connections per instance, not one.
     *
     * Every read model in `server/queries` fans its independent queries out
     * through `Promise.all` — the home page runs nine at once. With `max: 1` the
     * pool handed them out one at a time, so those `Promise.all` calls were
     * parallel in the source and strictly serial in practice, and the page took
     * the sum of its queries rather than the slowest.
     *
     * Set `DATABASE_POOL_MAX=1` to restore the previous behaviour if PgBouncer's
     * client limit ever becomes the binding constraint.
     */
    max: databasePoolMax(),
  })

  return new PrismaClient({
    adapter,
    log: isProduction ? ['error'] : ['warn', 'error'],
  })
}

type PrismaClientSingleton = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  __jkt48ArchivePrisma?: PrismaClientSingleton
}

export const prisma: PrismaClientSingleton =
  globalForPrisma.__jkt48ArchivePrisma ?? createPrismaClient()

if (!isProduction) {
  globalForPrisma.__jkt48ArchivePrisma = prisma
}
