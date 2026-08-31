import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { hasSupabaseAuthCookie, isSupabaseConfigured, requireSupabasePublicEnv } from '@/lib/env'

/** The route trees that require a session. */
function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/me')
}

/** Send a visitor without a valid session to the sign-in page, remembering where they wanted. */
function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.search = `?next=${encodeURIComponent(request.nextUrl.pathname)}`
  return NextResponse.redirect(loginUrl)
}

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

  /*
   * No session cookie, no work to do.
   *
   * `getUser()` below is a network round trip to Supabase Auth that ran in front
   * of every page view, including anonymous reads of the public encyclopedia and
   * every RSC prefetch. A request with no auth cookie cannot have a session, so
   * the answer is already known: the protected trees redirect, and everything
   * else passes through with nothing to refresh.
   */
  if (!hasSupabaseAuthCookie(request.cookies.getAll())) {
    return isProtectedPath(request.nextUrl.pathname) ? redirectToLogin(request) : response
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

  // A cookie that no longer validates — expired, revoked, or from another project.
  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    return redirectToLogin(request)
  }

  return response
}
