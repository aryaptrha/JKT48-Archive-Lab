import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Every path except Next internals, static assets and the API. Public
     * encyclopedia routes still pass through so the session cookie stays fresh
     * while browsing (PRD §19).
     *
     * `api/` is excluded because route handlers authorize themselves through
     * `authorizeAdmin()` and answer 401/403 rather than redirecting. Middleware
     * there could only duplicate a check that has to be redone anyway.
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
  ],
}
