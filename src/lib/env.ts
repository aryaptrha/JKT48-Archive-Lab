/**
 * Environment access (PRD §28, §35).
 *
 * Secrets are read from `process.env` only on the server. Anything the browser
 * needs must be prefixed `NEXT_PUBLIC_`. The service-role key is deliberately
 * exposed through a function that throws when called in a browser bundle.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    )
  }
  return value
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
} as const

/**
 * True when Supabase Auth is wired up. The archive is readable without it, so
 * the UI degrades to anonymous-only rather than crashing (PRD §19: public
 * users may browse, learn and play without an account).
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey)
}

export function requireSupabasePublicEnv(): { url: string; anonKey: string } {
  return {
    url: required('NEXT_PUBLIC_SUPABASE_URL', publicEnv.supabaseUrl),
    anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', publicEnv.supabaseAnonKey),
  }
}

/** Server-only. Never import this from a Client Component. */
export function requireServiceRoleKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must never be read in the browser.')
  }
  return required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function requireDatabaseUrl(): string {
  return required('DATABASE_URL', process.env.DATABASE_URL)
}

/**
 * Connections per function instance (PRD §31).
 *
 * PgBouncer does the real pooling, so this is only how many queries one instance
 * may have in flight at once. It matters more than it looks: the read models run
 * their independent queries through `Promise.all`, and at `max: 1` those queue
 * behind a single connection — the parallelism is written but not delivered. Set
 * `DATABASE_POOL_MAX=1` to restore the strictest behaviour.
 */
export function databasePoolMax(): number {
  const raw = Number.parseInt(process.env.DATABASE_POOL_MAX ?? '', 10)
  if (!Number.isFinite(raw) || raw < 1) return 3
  return Math.min(10, raw)
}

/**
 * Whether a request carries a Supabase session at all.
 *
 * `@supabase/ssr` stores the session in `sb-<project-ref>-auth-token`, chunked
 * across `.0`, `.1`, … when it exceeds the cookie size limit. No such cookie
 * means there is no session to validate, which lets both the middleware and the
 * server components skip a network round trip to Supabase Auth for anonymous
 * readers — the majority of traffic to a public archive.
 */
export function hasSupabaseAuthCookie(cookies: readonly { name: string }[]): boolean {
  return cookies.some(
    (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token'),
  )
}

export const isProduction = process.env.NODE_ENV === 'production'
export const isDevelopment = process.env.NODE_ENV === 'development'
