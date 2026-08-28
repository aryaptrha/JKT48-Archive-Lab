import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isSupabaseConfigured, requireSupabasePublicEnv } from '@/lib/env'

/**
 * Refreshes the Supabase session cookie on every request and gates the
 * authenticated route trees.
 *
 * Middleware runs on the Edge runtime, where Prisma is unavailable, so this
 * only answers "is there a session?". The ADMIN *role* check is a server-side
 * database lookup performed by `requireAdmin()` in the /admin layout — the
 * authoritative check (PRD §35: server-side authorization checks).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })

  if (!isSupabaseConfigured()) {
    return response
  }

  const { url, anonKey } = requireSupabasePublicEnv()

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Must be `getUser()` — it revalidates the token with Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtected = pathname.startsWith('/admin') || pathname.startsWith('/me')

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = `?next=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(loginUrl)
  }

  return response
}
