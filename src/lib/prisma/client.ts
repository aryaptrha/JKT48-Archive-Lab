import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { isProduction, requireDatabaseUrl } from '@/lib/env'

/**
 * Prisma client singleton (PRD §26, §31).
 *
 * Serverless constraints:
 *  - Each Vercel function instance keeps at most ONE pooled connection, because
 *    many instances may run concurrently against Supabase's PgBouncer.
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
    // One connection per function instance; PgBouncer does the real pooling.
    max: 1,
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
