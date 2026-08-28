'use client'

import { createBrowserClient } from '@supabase/ssr'
import { requireSupabasePublicEnv } from '@/lib/env'

let cached: ReturnType<typeof createBrowserClient> | undefined

/** Supabase client for Client Components. Only ever uses the anon key. */
export function getSupabaseBrowserClient() {
  if (!cached) {
    const { url, anonKey } = requireSupabasePublicEnv()
    cached = createBrowserClient(url, anonKey)
  }
  return cached
}
