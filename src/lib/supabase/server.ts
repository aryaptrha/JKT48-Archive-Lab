import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requireSupabasePublicEnv } from '@/lib/env'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Cookie writes are attempted but tolerated when they fail: Server Components
 * cannot mutate cookies, and the middleware refreshes the session instead.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = requireSupabasePublicEnv()
  const cookieStore = await cookies()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component render — middleware handles refresh.
        }
      },
    },
  })
}
