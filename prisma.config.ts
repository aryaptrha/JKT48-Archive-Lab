import 'dotenv/config'
import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 configuration (PRD §24 — Code First).
 *
 * Migrations run against the DIRECT connection (Supabase port 5432): PgBouncer
 * in transaction mode cannot execute the DDL/advisory locks Migrate needs.
 * The application itself connects through the POOLED url (port 6543) via the
 * driver adapter in `src/lib/prisma/client.ts` (PRD §31).
 */
const migrationUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!migrationUrl) {
  throw new Error(
    'Missing DIRECT_URL (preferred) or DATABASE_URL. Copy .env.example to .env and fill in your Supabase connection strings.',
  )
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: migrationUrl,
  },
})
