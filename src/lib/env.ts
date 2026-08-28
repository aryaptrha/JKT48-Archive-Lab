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

export const isProduction = process.env.NODE_ENV === 'production'
export const isDevelopment = process.env.NODE_ENV === 'development'
