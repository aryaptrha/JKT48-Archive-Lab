import { createClient } from '@supabase/supabase-js'
import { requireServiceRoleKey, requireSupabasePublicEnv } from '@/lib/env'

/**
 * Service-role Supabase client — server only (PRD §35).
 *
 * Used for privileged operations that bypass RLS: promoting a user to ADMIN,
 * managing Storage buckets, listing auth users. Never import this into any
 * module that can end up in a browser bundle.
 */
export function createSupabaseAdminClient() {
  const { url } = requireSupabasePublicEnv()
  return createClient(url, requireServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
